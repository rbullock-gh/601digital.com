import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream/promises';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { getStore } from '../db/connection.ts';
import { today as todayOf, nowClock } from '../lib/clock.ts';
import { badRequest } from '../lib/errors.ts';
import { getSettings, getTimer, updateSettings } from '../domain/settings.ts';
import * as work from '../domain/work.ts';
import * as fit from '../domain/fitness.ts';
import * as body from '../domain/body.ts';
import * as days from '../domain/days.ts';
import * as goals from '../domain/goals.ts';
import * as sum from '../domain/summaries.ts';
import * as rev from '../domain/reviews.ts';
import * as data from '../domain/data.ts';
import { insights } from '../domain/insights.ts';
import { search, trash, softDelete, restore, TRASH_TABLES } from '../domain/search.ts';
import { dailySeries, monthlySeries, totals, firstActivityDate } from '../domain/stats.ts';
import {
  addDays,
  addMonths,
  isISODate,
  isYearMonth,
  monthRange,
  startOfMonth,
  type ISODate,
  type Range,
} from '../../shared/dates.ts';
import type { Bootstrap } from '../../shared/types.ts';

const VERSION = '1.0.0';

type Req = FastifyRequest<{ Params: Record<string, string>; Querystring: Record<string, string | undefined>; Body: unknown }>;

const id = (req: Req) => {
  const n = Number(req.params.id);
  if (!Number.isInteger(n) || n <= 0) throw badRequest('Invalid id');
  return n;
};
const body_ = <T>(req: Req) => (req.body ?? {}) as T;
const optDate = (v: string | undefined) => (v && isISODate(v) ? v : undefined);
const rangeQ = (req: Req, fallback: Range): Range => ({
  start: optDate(req.query.from) ?? fallback.start,
  end: optDate(req.query.to) ?? fallback.end,
});

export function registerApi(app: FastifyInstance, passcode: boolean) {
  const get = (url: string, fn: (req: Req, reply: FastifyReply) => unknown) => app.get(url, fn as never);
  const post = (url: string, fn: (req: Req, reply: FastifyReply) => unknown) => app.post(url, fn as never);
  const put = (url: string, fn: (req: Req, reply: FastifyReply) => unknown) => app.put(url, fn as never);
  const del = (url: string, fn: (req: Req, reply: FastifyReply) => unknown) => app.delete(url, fn as never);

  // ── Bootstrap ──
  get('/api/bootstrap', (req): Bootstrap => ({
    mode: getStore().mode,
    hasRealData: data.realHasData(),
    settings: getSettings(),
    timer: getTimer(),
    today: todayOf(req),
    projects: work.listProjects(),
    categories: work.listCategories(),
    exercises: fit.listExercises(),
    version: VERSION,
    passcode,
  }));
  put('/api/settings', (req) => updateSettings(body_(req)));

  // ── Dashboard & summaries ──
  get('/api/dashboard', (req) => sum.dashboard(todayOf(req)));
  get('/api/work/summary', (req) => sum.workSummary(todayOf(req)));
  get('/api/money/summary', (req) => sum.moneySummary(todayOf(req)));
  get('/api/money/breakdown', (req) => {
    const t = todayOf(req);
    return sum.moneyBreakdown(rangeQ(req, { start: startOfMonth(t), end: t }));
  });
  get('/api/gym/summary', (req) => sum.gymSummary(todayOf(req)));
  get('/api/body/summary', (req) => sum.bodySummary(todayOf(req)));
  get('/api/insights', (req) => insights(todayOf(req)));

  // ── Work sessions ──
  get('/api/work/sessions', (req) =>
    work.listSessions({
      from: optDate(req.query.from),
      to: optDate(req.query.to),
      projectId: req.query.project ? Number(req.query.project) : undefined,
      categoryId: req.query.category ? Number(req.query.category) : undefined,
      payType: req.query.pay || undefined,
      q: req.query.q || undefined,
      limit: Math.min(500, Number(req.query.limit) || 100),
      offset: Number(req.query.offset) || 0,
    }),
  );
  get('/api/work/sessions/:id', (req) => work.getSession(id(req)));
  post('/api/work/sessions', (req) => work.createSession(body_(req), todayOf(req)));
  put('/api/work/sessions/:id', (req) => work.updateSession(id(req), body_(req), todayOf(req)));
  del('/api/work/sessions/:id', (req) => (softDelete('work_sessions', id(req)), { ok: true }));

  // ── Timer ──
  get('/api/timer', () => getTimer());
  post('/api/timer/start', (req) => work.startTimer(body_(req), todayOf(req), nowClock(req)));
  put('/api/timer', (req) => work.updateTimer(body_(req)));
  post('/api/timer/pause', () => work.pauseTimer());
  post('/api/timer/resume', () => work.resumeTimer());
  post('/api/timer/stop', (req) => work.stopTimer(body_(req), nowClock(req)));
  post('/api/timer/discard', () => (work.discardTimer(), { ok: true }));

  // ── Income ──
  get('/api/income', (req) => work.listIncome(optDate(req.query.from), optDate(req.query.to)));
  post('/api/income', (req) => work.createIncome(body_(req), todayOf(req)));
  put('/api/income/:id', (req) => work.updateIncome(id(req), body_(req), todayOf(req)));
  del('/api/income/:id', (req) => (softDelete('income', id(req)), { ok: true }));

  // ── Projects & categories ──
  get('/api/projects', () => work.projectSummaries());
  get('/api/projects/:id', (req) => {
    const pid = id(req);
    const summary = work.projectSummaries().find((p) => p.id === pid);
    if (!summary) throw badRequest('Project not found');
    const sessions = work.listSessions({ projectId: pid, limit: 500 });
    const income = work.listIncome().filter((i) => i.projectId === pid);
    const monthly = (
      getStore()
        .db.prepare(
          `SELECT substr(date, 1, 7) month, SUM(minutes) minutes, SUM(cents) cents FROM (
             SELECT date, minutes, 0 cents FROM work_sessions WHERE deleted_at IS NULL AND project_id = @pid
             UNION ALL SELECT date, 0, cents FROM earnings WHERE project_id = @pid) GROUP BY month ORDER BY month`,
        )
        .all({ pid }) as { month: string; minutes: number; cents: number }[]
    );
    const categories = getStore()
      .db.prepare(
        `SELECT COALESCE(c.name, 'Uncategorized') name, SUM(w.minutes) minutes FROM work_sessions w
           LEFT JOIN categories c ON c.id = w.category_id WHERE w.deleted_at IS NULL AND w.project_id = ? GROUP BY c.id ORDER BY minutes DESC`,
      )
      .all(pid);
    return { project: summary, sessions: sessions.sessions, income, monthly, categories };
  });
  post('/api/projects', (req) => work.createProject(body_(req), todayOf(req)));
  put('/api/projects/:id', (req) => work.updateProject(id(req), body_(req), todayOf(req)));
  del('/api/projects/:id', (req) => (work.deleteProject(id(req)), { ok: true }));
  get('/api/categories', () => work.listCategories());
  put('/api/categories/:id', (req) => (work.renameCategory(id(req), body_<{ name: string }>(req).name), { ok: true }));
  del('/api/categories/:id', (req) => (work.deleteCategory(id(req)), { ok: true }));

  // ── Days ──
  get('/api/days/:date', (req) => days.dayView(req.params.date, todayOf(req), getSettings().weekStart));
  put('/api/days/:date', (req) => days.setDay(req.params.date, body_(req), todayOf(req)));
  get('/api/calendar/:month', (req) => {
    if (!isYearMonth(req.params.month)) throw badRequest('Invalid month');
    const t = todayOf(req);
    const r = monthRange(req.params.month);
    return { month: req.params.month, days: days.calendarMonth(req.params.month, t), totals: totals(r), ratings: days.ratingStats(r, t) };
  });
  get('/api/year/:year', (req) => {
    const y = Number(req.params.year);
    if (!Number.isInteger(y) || y < 1900 || y > 3000) throw badRequest('Invalid year');
    return days.yearGrid(y, todayOf(req));
  });
  get('/api/years', (req) => days.allYears(todayOf(req)));
  get('/api/days', (req) => {
    const t = todayOf(req);
    return days.daySummaries(rangeQ(req, { start: addDays(t, -30), end: t }), t);
  });

  // ── Notes & accomplishments ──
  post('/api/notes', (req) => {
    const b = body_<{ date: ISODate; body: string; time?: string }>(req);
    return days.createNote(b.date, b.body, b.time ?? (b.date === todayOf(req) ? nowClock(req) : null));
  });
  put('/api/notes/:id', (req) => (days.updateNote(id(req), body_<{ body: string }>(req).body), { ok: true }));
  del('/api/notes/:id', (req) => (softDelete('notes', id(req)), { ok: true }));
  get('/api/accomplishments', (req) => {
    const t = todayOf(req);
    return days.listAccomplishments(optDate(req.query.from) ?? '0000-01-01', optDate(req.query.to) ?? t, req.query.milestones === '1');
  });
  post('/api/accomplishments', (req) => {
    const b = body_<{ date: ISODate; text: string; isMilestone?: boolean }>(req);
    return days.createAccomplishment(b.date, b.text, !!b.isMilestone);
  });
  put('/api/accomplishments/:id', (req) => (days.updateAccomplishment(id(req), body_(req)), { ok: true }));
  del('/api/accomplishments/:id', (req) => (softDelete('accomplishments', id(req)), { ok: true }));

  // ── Fitness ──
  get('/api/exercises', () => fit.listExercises());
  get('/api/exercises/:id', (req) => fit.exerciseHistory(id(req)));
  get('/api/exercises/:id/last', (req) => fit.lastPerformance(id(req), req.query.exclude ? Number(req.query.exclude) : undefined));
  put('/api/exercises/:id', (req) => (fit.updateExercise(id(req), body_(req)), { ok: true }));
  get('/api/workouts', (req) => fit.listWorkouts(optDate(req.query.from), optDate(req.query.to), Number(req.query.limit) || 500));
  get('/api/workouts/templates', () => fit.workoutTemplates());
  get('/api/workouts/:id', (req) => fit.getWorkout(id(req)));
  post('/api/workouts', (req) => fit.createWorkout(body_(req)));
  put('/api/workouts/:id', (req) => fit.updateWorkout(id(req), body_(req)));
  del('/api/workouts/:id', (req) => (fit.softDeleteWorkout(id(req)), { ok: true }));
  get('/api/prs', (req) => fit.listPRs({ from: optDate(req.query.from), to: optDate(req.query.to), limit: Number(req.query.limit) || 500 }));

  // ── Body ──
  get('/api/body', (req) => body.listBody(optDate(req.query.from), optDate(req.query.to)));
  post('/api/body', (req) => body.createBody(body_(req)));
  put('/api/body/:id', (req) => body.updateBody(id(req), body_(req)));
  del('/api/body/:id', (req) => (softDelete('body_metrics', id(req)), { ok: true }));

  // ── Photos ──
  get('/api/photos', (req) => {
    const t = todayOf(req);
    const s = getSettings();
    return { sets: body.listPhotoSets(), current: body.monthPhotoStatus(t.slice(0, 7)), photoDay: s.photoDay };
  });
  get('/api/photos/compare', (req) => {
    const { from, to } = req.query;
    if (!isYearMonth(from) || !isYearMonth(to)) throw badRequest('Choose two months');
    const a = body.getPhotoSet(from);
    const b = body.getPhotoSet(to);
    const aDate = a?.date ?? `${from}-01`;
    const bDate = b?.date ?? `${to}-01`;
    const [start, end] = aDate <= bDate ? [aDate, bDate] : [bDate, aDate];
    const changes = body.BODY_FIELDS.map((f) => ({ field: f, from: body.valueNear(f, start, 20), to: body.valueNear(f, end, 20) }));
    const t = totals({ start, end });
    return {
      from: a,
      to: b,
      start,
      end,
      changes,
      workouts: t.workouts,
      gymMinutes: t.gymMinutes,
      strength: fit.strengthChanges(start, end, 4),
      prs: t.prs,
    };
  });
  get('/api/photos/:month', (req) => body.getPhotoSet(req.params.month));
  put('/api/photos/:month', (req) => body.updatePhotoSet(req.params.month, body_(req)));
  del('/api/photos/item/:id', (req) => (body.deletePhoto(id(req)), { ok: true }));
  post('/api/photos', async (req) => {
    const fields: Record<string, string> = {};
    let file: { data: Buffer; mime: string } | null = null;
    let thumb: Buffer | null = null;
    for await (const part of (req as unknown as { parts: () => AsyncIterable<Record<string, unknown>> }).parts()) {
      if (part.type === 'file') {
        const buf = await (part as unknown as { toBuffer: () => Promise<Buffer> }).toBuffer();
        if (part.fieldname === 'thumb') thumb = buf;
        else file = { data: buf, mime: String(part.mimetype) };
      } else fields[String(part.fieldname)] = String(part.value);
    }
    if (!file) throw badRequest('No photo received');
    return body.savePhoto({
      month: fields.month,
      date: fields.date,
      angle: fields.angle as never,
      data: file.data,
      mime: file.mime,
      thumb,
      width: fields.width ? Number(fields.width) : null,
      height: fields.height ? Number(fields.height) : null,
    });
  });

  // ── Goals ──
  get('/api/goals', (req) => goals.goalsWithProgress(todayOf(req), getSettings().weekStart, req.query.archived === '1'));
  post('/api/goals', (req) => goals.createGoal(body_(req), todayOf(req), getSettings().weekStart));
  put('/api/goals/:id', (req) => goals.updateGoal(id(req), body_(req), todayOf(req), getSettings().weekStart));
  del('/api/goals/:id', (req) => (softDelete('goals', id(req)), { ok: true }));
  post('/api/goals/reorder', (req) => (goals.reorderGoals(body_<{ ids: number[] }>(req).ids), { ok: true }));
  post('/api/goals/:id/checkin', (req) => {
    const b = body_<{ date?: ISODate; value?: number | null }>(req);
    goals.checkIn(id(req), b.date ?? todayOf(req), b.value ?? null);
    return { ok: true };
  });

  // ── Progress (unified analytics) ──
  get('/api/progress', (req) => {
    const t = todayOf(req);
    const span = req.query.range ?? '6M';
    const first = firstActivityDate() ?? t;
    const start =
      span === 'W' ? addDays(t, -6)
      : span === 'M' ? addDays(t, -29)
      : span === '3M' ? addMonths(t, -3)
      : span === '6M' ? addMonths(t, -6)
      : span === 'Y' ? addMonths(t, -12)
      : first;
    const r = { start: start < first && span !== 'W' && span !== 'M' ? first : start, end: t };
    const long = (Date.parse(r.end) - Date.parse(r.start)) / 86400000 > 120;
    const prevLen = Math.round((Date.parse(r.end) - Date.parse(r.start)) / 86400000) + 1;
    const prev = { start: addDays(r.start, -prevLen), end: addDays(r.start, -1) };
    return {
      range: r,
      granularity: long ? 'month' : 'day',
      daily: long ? null : dailySeries(r),
      monthly: long ? monthlySeries(r) : null,
      totals: totals(r),
      previous: totals(prev),
      ratings: days.ratingStats(r, t),
      body: Object.fromEntries(['weightKg', 'waistCm'].map((f) => [f, body.bodySeries(f as body.BodyField, r.start, r.end)])),
      strength: fit.strengthChanges(r.start, r.end, 6),
      topExercises: fit.topExercises(r.start, r.end, 6),
    };
  });

  // ── Reviews ──
  get('/api/reviews', (req) => rev.reviewIndex(todayOf(req)));
  get('/api/reviews/week/:date', (req) => {
    if (!isISODate(req.params.date)) throw badRequest('Invalid date');
    return rev.weeklyReview(req.params.date, todayOf(req));
  });
  get('/api/reviews/month/:month', (req) => rev.monthlyReview(req.params.month, todayOf(req)));
  get('/api/reviews/year/:year', (req) => rev.yearInReview(Number(req.params.year), todayOf(req)));
  put('/api/reviews/:kind/:start', (req) =>
    rev.saveAnswers(req.params.kind as rev.ReviewKind, req.params.start, body_<{ answers: Record<string, string> }>(req).answers),
  );

  // ── Search & trash ──
  get('/api/search', (req) => search(req.query.q ?? '', todayOf(req)));
  get('/api/trash', () => trash());
  post('/api/trash/restore', (req) => {
    const b = body_<{ table: string; id: number }>(req);
    if (!TRASH_TABLES.has(b.table)) throw badRequest('Unknown item');
    if (b.table === 'workouts') fit.restoreWorkout(b.id);
    else if (b.table === 'photos') body.restorePhoto(b.id);
    else restore(b.table, b.id);
    return { ok: true };
  });
  post('/api/undo', (req) => {
    const b = body_<{ table: string; id: number }>(req);
    if (!TRASH_TABLES.has(b.table)) throw badRequest('Unknown item');
    if (b.table === 'workouts') fit.restoreWorkout(b.id);
    else if (b.table === 'photos') body.restorePhoto(b.id);
    else restore(b.table, b.id);
    return { ok: true };
  });

  // ── Data: backup, restore, export, import, datasets ──
  get('/api/data/backup', (_req, reply) => {
    const { stream, filename } = data.backupStream();
    reply.header('Content-Type', 'application/zip').header('Content-Disposition', `attachment; filename="${filename}"`);
    return reply.send(stream);
  });
  post('/api/data/restore', async (req) => {
    const file = await (req as unknown as { file: () => Promise<{ file: NodeJS.ReadableStream } | undefined> }).file();
    if (!file) throw badRequest('Choose a backup file');
    const tmp = path.join(os.tmpdir(), `almanac-restore-${Date.now()}.zip`);
    await pipeline(file.file, fs.createWriteStream(tmp));
    try {
      return await data.restoreBackup(tmp);
    } finally {
      fs.rmSync(tmp, { force: true });
    }
  });
  get('/api/data/export.json', (_req, reply) => {
    reply.header('Content-Disposition', `attachment; filename="almanac-export-${new Date().toISOString().slice(0, 10)}.json"`);
    return data.exportJSON();
  });
  post('/api/data/import', async (req) => {
    const file = await (req as unknown as { file: () => Promise<{ toBuffer: () => Promise<Buffer> } | undefined> }).file();
    if (!file) throw badRequest('Choose an export file');
    let json: unknown;
    try {
      json = JSON.parse((await file.toBuffer()).toString('utf8'));
    } catch {
      throw badRequest('That file is not valid JSON');
    }
    return data.importJSON(json);
  });
  get('/api/data/csv/:kind', (req, reply) => {
    const { body: text, filename } = data.csvExport(req.params.kind);
    reply.header('Content-Type', 'text/csv; charset=utf-8').header('Content-Disposition', `attachment; filename="${filename}"`);
    return '﻿' + text;
  });
  get('/api/data/backups', () => data.listBackups());
  get('/api/data/info', () => data.dataInfo());
  post('/api/data/sample', (req) => (data.loadSample(todayOf(req)), { mode: 'sample' }));
  del('/api/data/sample', () => (data.deleteSample(), { mode: 'real' }));
  post('/api/data/real', () => (data.useReal(), { mode: 'real' }));
  post('/api/data/reset', (req) => {
    if (body_<{ confirm?: string }>(req).confirm !== 'DELETE') throw badRequest('Type DELETE to confirm');
    return data.resetReal();
  });

}
