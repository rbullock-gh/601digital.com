import { db } from '../db/connection.ts';
import { badRequest } from '../lib/errors.ts';
import { periodReport } from './summaries.ts';
import { getSettings } from './settings.ts';
import { getPhotoSet, listPhotoSets, bodyChanges } from './body.ts';
import { longestGoodStreak, yearGrid } from './days.ts';
import { monthlySeries } from './stats.ts';
import {
  addDays,
  addMonthsYM,
  isISODate,
  isYearMonth,
  monthRange,
  startOfWeek,
  weekRange,
  yearRange,
  type ISODate,
} from '../../shared/dates.ts';

export type ReviewKind = 'week' | 'month' | 'year';

export function getAnswers(kind: ReviewKind, start: ISODate): Record<string, string> {
  const r = db().prepare('SELECT answers FROM reviews WHERE kind = ? AND period_start = ?').get(kind, start) as { answers: string } | undefined;
  try {
    return r ? JSON.parse(r.answers) : {};
  } catch {
    return {};
  }
}

export function saveAnswers(kind: ReviewKind, start: ISODate, answers: Record<string, string>) {
  if (!['week', 'month', 'year'].includes(kind) || !isISODate(start)) throw badRequest('Invalid review');
  const clean: Record<string, string> = {};
  for (const [k, v] of Object.entries(answers ?? {})) if (typeof v === 'string' && v.trim()) clean[k] = v.trim().slice(0, 20000);
  db()
    .prepare(
      `INSERT INTO reviews (kind, period_start, answers) VALUES (?, ?, ?)
       ON CONFLICT(kind, period_start) DO UPDATE SET answers = excluded.answers, updated_at = datetime('now')`,
    )
    .run(kind, start, JSON.stringify(clean));
  return clean;
}

export function weeklyReview(date: ISODate, today: ISODate) {
  const s = getSettings();
  const r = weekRange(date, s.weekStart);
  return { kind: 'week' as const, ...periodReport(r, today), answers: getAnswers('week', r.start) };
}

export function monthlyReview(ym: string, today: ISODate) {
  if (!isYearMonth(ym)) throw badRequest('Invalid month');
  const r = monthRange(ym);
  return {
    kind: 'month' as const,
    month: ym,
    ...periodReport(r, today),
    photos: getPhotoSet(ym),
    previousPhotos: getPhotoSet(addMonthsYM(ym, -1)),
    answers: getAnswers('month', r.start),
  };
}

export function yearInReview(year: number, today: ISODate) {
  const r = yearRange(year);
  const end = r.end < today ? r.end : today;
  const report = periodReport(r, today);
  const months = monthlySeries(r);
  const best = <T,>(xs: T[], key: (x: T) => number) => xs.reduce<T | null>((a, b) => (a == null || key(b) > key(a) ? b : a), null);
  const s = getSettings();
  const weekExpr =
    s.weekStart === 1
      ? "date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days')"
      : "date(date, '-' || CAST(strftime('%w', date) AS INTEGER) || ' days')";
  const bestWeek = db()
    .prepare(`SELECT ${weekExpr} AS start, SUM(cents) cents FROM earnings WHERE date >= ? AND date <= ? GROUP BY start ORDER BY cents DESC LIMIT 1`)
    .get(r.start, r.end) as { start: string; cents: number } | undefined;
  const bestDay = db()
    .prepare('SELECT date, SUM(cents) cents FROM earnings WHERE date >= ? AND date <= ? GROUP BY date ORDER BY cents DESC LIMIT 1')
    .get(r.start, r.end) as { date: string; cents: number } | undefined;
  const longestDay = db()
    .prepare('SELECT date, SUM(minutes) minutes FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY date ORDER BY minutes DESC LIMIT 1')
    .get(r.start, r.end) as { date: string; minutes: number } | undefined;
  const photoSets = listPhotoSets().filter((p) => p.month >= `${year}-01` && p.month <= `${year}-12`);
  const firstPhotos = photoSets.length ? photoSets[photoSets.length - 1] : null;
  const lastPhotos = photoSets.length > 1 ? photoSets[0] : null;
  const body = bodyChanges(addDays(r.start, -1), end);
  const weight = body.find((c) => c.field === 'weightKg') ?? null;
  const exerciseSets = db()
    .prepare(
      `SELECT e.name, COUNT(DISTINCT w.id) sessions, COUNT(s.id) sets FROM workouts w
         JOIN workout_exercises we ON we.workout_id = w.id JOIN exercises e ON e.id = we.exercise_id
         LEFT JOIN sets s ON s.workout_exercise_id = we.id AND s.is_warmup = 0
        WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ? GROUP BY e.id ORDER BY sessions DESC, sets DESC LIMIT 1`,
    )
    .get(r.start, r.end) as { name: string; sessions: number; sets: number } | undefined;
  const screenMonths = db()
    .prepare('SELECT substr(date, 1, 7) month, AVG(minutes) avg, COUNT(*) logged FROM screen_time WHERE date >= ? AND date <= ? GROUP BY month ORDER BY month')
    .all(r.start, r.end) as { month: string; avg: number; logged: number }[];
  const visionAchieved = db()
    .prepare('SELECT id, title, body, achieved_on achievedOn FROM vision_items WHERE deleted_at IS NULL AND achieved_on >= ? AND achieved_on <= ? ORDER BY achieved_on')
    .all(r.start, r.end) as { id: number; title: string | null; body: string | null; achievedOn: string }[];

  return {
    kind: 'year' as const,
    year,
    ...report,
    months,
    bestMonth: best(months.filter((m) => m.cents > 0), (m) => m.cents),
    bestWeek: bestWeek ?? null,
    bestDay: bestDay ?? null,
    longestDay: longestDay ?? null,
    mostTrained: exerciseSets ?? null,
    weight,
    firstPhotos,
    lastPhotos,
    grid: yearGrid(year, today),
    longestStreak: longestGoodStreak(r),
    screenMonths,
    visionAchieved,
    answers: getAnswers('year', r.start),
  };
}

/** Index of reviewable periods, newest first, and whether a reflection was written. */
export function reviewIndex(today: ISODate) {
  const s = getSettings();
  const written = new Set(
    (db().prepare("SELECT kind || ':' || period_start k FROM reviews WHERE answers != '{}'").all() as { k: string }[]).map((x) => x.k),
  );
  const first = db()
    .prepare(
      `SELECT MIN(d) d FROM (SELECT MIN(date) d FROM work_sessions WHERE deleted_at IS NULL UNION ALL SELECT MIN(date) FROM workouts WHERE deleted_at IS NULL
         UNION ALL SELECT MIN(date) FROM days UNION ALL SELECT MIN(date) FROM income WHERE deleted_at IS NULL)`,
    )
    .get() as { d: string | null };
  const start = first.d ?? today;
  const months = monthlySeries({ start: start.slice(0, 7) + '-01', end: today })
    .reverse()
    .map((m) => ({ ...m, written: written.has(`month:${m.month}-01`) }));
  const weeks: { start: ISODate; written: boolean }[] = [];
  let w = startOfWeek(today, s.weekStart);
  for (let i = 0; i < 12 && w >= startOfWeek(start, s.weekStart); i++) {
    weeks.push({ start: w, written: written.has(`week:${w}`) });
    w = addDays(w, -7);
  }
  const years: number[] = [];
  for (let y = Number(today.slice(0, 4)); y >= Number(start.slice(0, 4)); y--) years.push(y);
  return { months, weeks, years };
}
