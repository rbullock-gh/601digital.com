// Screen-level summaries. Each is assembled from the stats primitives so the
// Dashboard, Work, Money, Gym and Body screens always agree with one another.

import { db } from '../db/connection.ts';
import { dailySeries, monthlySeries, totals } from './stats.ts';
import { goalsCompleted, goalsWithProgress, goalsForDay } from './goals.ts';
import { currentGoodStreak, ratingStats } from './days.ts';
import { listPRs, listWorkouts, strengthChanges, topExercises, workoutExerciseNames } from './fitness.ts';
import { bodyChanges, bodySeries, latestBody, monthPhotoStatus, BODY_FIELDS } from './body.ts';
import { getSettings } from './settings.ts';
import { screenAverage } from './screentime.ts';
import { travelStats, visitsIn } from './travel.ts';
import { listAccomplishments } from './days.ts';
import {
  addDays,
  addMonths,
  daysInMonth,
  daysInYear,
  diffDays,
  endOfMonth,
  monthKey,
  parts,
  periodRange,
  startOfMonth,
  weekRange,
  yearRange,
  type ISODate,
  type Range,
} from '../../shared/dates.ts';
import type { EarningRow } from '../../shared/types.ts';

/** The same number of elapsed days, one period earlier — a fair "vs last week/month". */
function comparable(r: Range, today: ISODate, shift: (d: ISODate) => ISODate): Range {
  const elapsed = Math.min(diffDays(r.start, today), diffDays(r.start, r.end));
  const start = shift(r.start);
  return { start, end: addDays(start, elapsed) };
}

function projection(earned: number, r: Range, today: ISODate) {
  const total = diffDays(r.start, r.end) + 1;
  const elapsed = Math.min(total, diffDays(r.start, today) + 1);
  if (earned <= 0 || elapsed < 3 || elapsed >= total) return null;
  const perDay = earned / elapsed;
  return { projectedCents: Math.round(perDay * total), perDayCents: Math.round(perDay), elapsedDays: elapsed, totalDays: total };
}

// ── Dashboard ───────────────────────────────────────────────────────────────

export function dashboard(today: ISODate) {
  const s = getSettings();
  const week = weekRange(today, s.weekStart);
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const year = yearRange(parts(today).y);
  const ytd = { start: year.start, end: today };

  const t = totals({ start: today, end: today });
  const w = totals(week);
  const wPrev = totals(comparable(week, today, (d) => addDays(d, -7)));
  const m = totals(month);
  const mPrev = totals(comparable(month, today, (d) => addMonths(d, -1)));
  const y = totals(year);

  const todayWorkouts = listWorkouts(today, today).map((x) => ({ ...x, exercises: workoutExerciseNames(x.id) }));
  const rating = (db().prepare('SELECT rating FROM days WHERE date = ?').get(today) as { rating: number | null } | undefined)?.rating ?? null;
  const yesterday = addDays(today, -1);
  const yRating = (db().prepare('SELECT rating FROM days WHERE date = ?').get(yesterday) as { rating: number | null } | undefined)?.rating ?? null;
  const anyRatings = (db().prepare('SELECT COUNT(*) n FROM days WHERE rating IS NOT NULL').get() as { n: number }).n > 0;

  const goals = goalsWithProgress(today, s.weekStart);
  const weightStart = bodyChanges(startOfMonth(today), today).find((c) => c.field === 'weightKg');
  const photo = monthPhotoStatus(monthKey(today));

  const recent = dailySeries({ start: addDays(today, -13), end: today });

  return {
    today: {
      date: today,
      minutes: t.minutes,
      earnedCents: t.earnedCents,
      sessions: t.sessions,
      rating,
      workouts: todayWorkouts,
      dailyGoals: goalsForDay(today, today, s.weekStart),
    },
    yesterdayUnrated: anyRatings && yRating == null,
    week: {
      range: week,
      totals: w,
      previous: wPrev,
      goalsCompleted: goalsCompleted(week, today, s.weekStart).length,
      workoutTarget: s.weeklyWorkoutTarget,
      screen: screenAverage({ start: week.start, end: today }),
      screenPrev: screenAverage(comparable(week, today, (d) => addDays(d, -7))),
    },
    month: {
      range: month,
      totals: m,
      previous: mPrev,
      weight: weightStart && weightStart.to ? { current: weightStart.to.value, change: weightStart.change } : null,
      photo,
      projection: projection(m.earnedCents, month, today),
      goals: goals.filter((g) => g.period === 'month'),
    },
    year: {
      range: year,
      totals: y,
      ratings: ratingStats(year, today),
      goalsCompleted: goalsCompleted(ytd, today, s.weekStart).length,
      strength: strengthChanges(year.start, today, 3),
      milestones: listAccomplishments(year.start, today, true).slice(-5).reverse(),
      projection: projection(y.earnedCents, year, today),
    },
    goals: goals.filter((g) => g.period !== 'day').slice(0, 6),
    recentPRs: listPRs({ from: addDays(today, -30), to: today, limit: 12 }),
    recent,
    goodStreak: currentGoodStreak(today),
  };
}

// ── Work ────────────────────────────────────────────────────────────────────

export function workSummary(today: ISODate) {
  const s = getSettings();
  const year = yearRange(parts(today).y);
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const week = weekRange(today, s.weekStart);
  const q = (r: Range) =>
    db()
      .prepare(
        `SELECT COALESCE(SUM(minutes), 0) minutes, COUNT(*) sessions, COUNT(DISTINCT date) days
           FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?`,
      )
      .get(r.start, r.end) as { minutes: number; sessions: number; days: number };
  const all = db()
    .prepare(
      `SELECT COALESCE(SUM(minutes), 0) minutes, COUNT(*) sessions, COUNT(DISTINCT date) days, MIN(date) first
         FROM work_sessions WHERE deleted_at IS NULL`,
    )
    .get() as { minutes: number; sessions: number; days: number; first: string | null };
  const ytd = q({ start: year.start, end: today });
  const weeksElapsed = Math.max(1, (diffDays(year.start, today) + 1) / 7);

  const projects = (r: Range) =>
    db()
      .prepare(
        `SELECT p.id, p.name, p.color, SUM(w.minutes) minutes, SUM(w.earned_cents) cents, COUNT(*) sessions
           FROM work_sessions w JOIN projects p ON p.id = w.project_id
          WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ?
          GROUP BY p.id ORDER BY minutes DESC LIMIT 8`,
      )
      .all(r.start, r.end) as { id: number; name: string; color: string | null; minutes: number; cents: number; sessions: number }[];

  const categories = db()
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorized') name, SUM(w.minutes) minutes, COUNT(*) sessions
         FROM work_sessions w LEFT JOIN categories c ON c.id = w.category_id
        WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ?
        GROUP BY c.id ORDER BY minutes DESC LIMIT 8`,
    )
    .all(year.start, today) as { name: string; minutes: number; sessions: number }[];

  // Weekly hours for the last 16 weeks.
  const weeks: { start: ISODate; minutes: number }[] = [];
  for (let i = 15; i >= 0; i--) {
    const r = weekRange(addDays(today, -7 * i), s.weekStart);
    weeks.push({ start: r.start, minutes: q(r).minutes });
  }
  const byWeekday = db()
    .prepare(
      `SELECT CAST(strftime('%w', date) AS INTEGER) wd, SUM(minutes) minutes, COUNT(DISTINCT date) days
         FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY wd`,
    )
    .all(addDays(today, -364), today) as { wd: number; minutes: number; days: number }[];

  return {
    today: q({ start: today, end: today }),
    week: q(week),
    month: q(month),
    year: ytd,
    allTime: all,
    avgPerWorkDayYear: ytd.days ? ytd.minutes / ytd.days : 0,
    avgPerWeekYear: ytd.minutes / weeksElapsed,
    avgSession: all.sessions ? all.minutes / all.sessions : 0,
    projectsMonth: projects(month),
    projectsYear: projects({ start: year.start, end: today }),
    categories,
    weeks,
    daily: dailySeries({ start: addDays(today, -29), end: today }).map((d) => ({ date: d.date, minutes: d.minutes })),
    byWeekday,
  };
}

// ── Money ───────────────────────────────────────────────────────────────────

export function moneySummary(today: ISODate) {
  const s = getSettings();
  const year = yearRange(parts(today).y);
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const week = weekRange(today, s.weekStart);
  const sum = (r: Range) =>
    (db().prepare('SELECT COALESCE(SUM(cents), 0) c FROM earnings WHERE date >= ? AND date <= ?').get(r.start, r.end) as { c: number }).c;
  const allTime = (db().prepare('SELECT COALESCE(SUM(cents), 0) c, MIN(date) first FROM earnings').get() as { c: number; first: string | null });

  const monthsBack = { start: startOfMonth(addMonths(today, -23)), end: endOfMonth(today) };
  const allMonths = monthlySeries(monthsBack).map((p) => ({ month: p.month, cents: p.cents, minutes: p.minutes }));
  const firstIdx = allMonths.findIndex((p) => p.cents > 0 || p.minutes > 0);
  // Start at the first month with any activity, but always show at least six months.
  const monthly = allMonths.slice(Math.max(0, Math.min(firstIdx < 0 ? allMonths.length : firstIdx, allMonths.length - 6)));

  const byKind = db()
    .prepare('SELECT kind, SUM(cents) cents FROM earnings WHERE date >= ? AND date <= ? GROUP BY kind ORDER BY cents DESC')
    .all(year.start, today) as { kind: string; cents: number }[];
  const byProject = db()
    .prepare(
      `SELECT p.id, COALESCE(p.name, 'No project') name, p.color, SUM(e.cents) cents
         FROM earnings e LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.date >= ? AND e.date <= ? GROUP BY p.id ORDER BY cents DESC LIMIT 10`,
    )
    .all(year.start, today) as { id: number | null; name: string; color: string | null; cents: number }[];
  const byCategory = db()
    .prepare(
      `SELECT COALESCE(c.name, 'Uncategorized') name, SUM(e.cents) cents
         FROM earnings e LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.date >= ? AND e.date <= ? GROUP BY c.id ORDER BY cents DESC LIMIT 10`,
    )
    .all(year.start, today) as { name: string; cents: number }[];

  // Effective hourly rate: everything earned from work sessions ÷ hours worked on paid sessions.
  const eff = (r: Range) =>
    db()
      .prepare(
        `SELECT COALESCE(SUM(earned_cents), 0) cents, COALESCE(SUM(minutes), 0) minutes FROM work_sessions
          WHERE deleted_at IS NULL AND pay_type != 'unpaid' AND date >= ? AND date <= ?`,
      )
      .get(r.start, r.end) as { cents: number; minutes: number };
  const rate = (x: { cents: number; minutes: number }) => (x.minutes ? Math.round((x.cents * 60) / x.minutes) : null);
  const rateMonthly = monthlySeries({ start: startOfMonth(addMonths(today, -11)), end: endOfMonth(today) }).map((p) => {
    const e = eff({ start: `${p.month}-01`, end: endOfMonth(`${p.month}-01`) });
    return { month: p.month, rateCents: rate(e) };
  });

  const topDays = db()
    .prepare('SELECT date, SUM(cents) cents FROM earnings GROUP BY date ORDER BY cents DESC LIMIT 5')
    .all() as { date: string; cents: number }[];
  const weekExpr =
    s.weekStart === 1
      ? "date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days')"
      : "date(date, '-' || CAST(strftime('%w', date) AS INTEGER) || ' days')";
  const topWeeks = db()
    .prepare(`SELECT ${weekExpr} AS start, SUM(cents) cents FROM earnings GROUP BY start ORDER BY cents DESC LIMIT 5`)
    .all() as { start: string; cents: number }[];
  const topMonths = db()
    .prepare('SELECT substr(date, 1, 7) month, SUM(cents) cents FROM earnings GROUP BY month ORDER BY cents DESC LIMIT 5')
    .all() as { month: string; cents: number }[];

  const monthTotal = sum(month);
  return {
    today: sum({ start: today, end: today }),
    week: sum(week),
    month: monthTotal,
    previousMonth: sum(comparable(month, today, (d) => addMonths(d, -1))),
    year: sum(year),
    allTime: allTime.c,
    firstDate: allTime.first,
    projection: projection(monthTotal, month, today),
    yearProjection: projection(sum(year), year, today),
    monthly,
    daily: dailySeries({ start: addDays(today, -29), end: today }).map((d) => ({ date: d.date, cents: d.cents })),
    byKind,
    byProject,
    byCategory,
    rate: { month: rate(eff(month)), year: rate(eff({ start: year.start, end: today })), allTime: rate(eff({ start: '0000-01-01', end: today })) },
    rateMonthly,
    topDays,
    topWeeks,
    topMonths,
    defaultRateCents: s.defaultRateCents,
  };
}

/** Exactly where the money in a period came from. */
export function moneyBreakdown(r: Range) {
  const rows = db()
    .prepare(
      `SELECT e.source, e.id, e.date, e.cents, e.kind, e.label, e.minutes, e.project_id AS projectId,
              p.name AS projectName, c.name AS categoryName
         FROM earnings e LEFT JOIN projects p ON p.id = e.project_id LEFT JOIN categories c ON c.id = e.category_id
        WHERE e.date >= ? AND e.date <= ? ORDER BY e.date DESC, e.cents DESC`,
    )
    .all(r.start, r.end) as EarningRow[];
  const byProject = new Map<string, { name: string; cents: number; count: number }>();
  const byKind = new Map<string, number>();
  let total = 0;
  for (const row of rows) {
    total += row.cents;
    const key = row.projectName ?? 'No project';
    const p = byProject.get(key) ?? { name: key, cents: 0, count: 0 };
    p.cents += row.cents;
    p.count++;
    byProject.set(key, p);
    byKind.set(row.kind, (byKind.get(row.kind) ?? 0) + row.cents);
  }
  return {
    range: r,
    total,
    rows,
    byProject: [...byProject.values()].sort((a, b) => b.cents - a.cents),
    byKind: [...byKind.entries()].map(([kind, cents]) => ({ kind, cents })).sort((a, b) => b.cents - a.cents),
  };
}

// ── Gym ─────────────────────────────────────────────────────────────────────

/** Consecutive weeks meeting the weekly workout target. The current week counts once met. */
export function workoutWeekStreak(today: ISODate, weekStart: number, target: number): number {
  if (target <= 0) return 0;
  let n = 0;
  let r = weekRange(today, weekStart);
  const count = (x: Range) =>
    (db().prepare('SELECT COUNT(*) n FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ?').get(x.start, x.end) as { n: number }).n;
  if (count(r) >= target) n++;
  for (let i = 0; i < 520; i++) {
    r = weekRange(addDays(r.start, -1), weekStart);
    if (count(r) >= target) n++;
    else break;
  }
  return n;
}

export function gymSummary(today: ISODate) {
  const s = getSettings();
  const week = weekRange(today, s.weekStart);
  const month = { start: startOfMonth(today), end: endOfMonth(today) };
  const year = yearRange(parts(today).y);
  const count = (r: Range) =>
    db()
      .prepare('SELECT COUNT(*) n, COALESCE(SUM(duration_minutes), 0) minutes FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ?')
      .get(r.start, r.end) as { n: number; minutes: number };
  const total = db().prepare('SELECT COUNT(*) n, MIN(date) first FROM workouts WHERE deleted_at IS NULL').get() as { n: number; first: string | null };
  const last = db().prepare('SELECT MAX(date) d FROM workouts WHERE deleted_at IS NULL AND date <= ?').get(today) as { d: string | null };

  const weeks: { start: ISODate; count: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const r = weekRange(addDays(today, -7 * i), s.weekStart);
    weeks.push({ start: r.start, count: count(r).n });
  }
  const weight = bodyChanges(addDays(today, -30), today).find((c) => c.field === 'weightKg')!;
  const measure = bodyChanges(addDays(today, -90), today).filter((c) => c.field !== 'weightKg' && c.field !== 'bodyFatPct' && c.to);

  return {
    week: count(week),
    month: count(month),
    year: count(year),
    total: total.n,
    firstDate: total.first,
    lastDate: last.d,
    daysSinceLast: last.d ? diffDays(last.d, today) : null,
    weekStreak: workoutWeekStreak(today, s.weekStart, s.weeklyWorkoutTarget),
    weeklyTarget: s.weeklyWorkoutTarget,
    weeks,
    weight: { current: weight.to, change30: weight.change },
    measurements: measure,
    recentPRs: listPRs({ to: today, limit: 10 }),
    recentWorkouts: listWorkouts(undefined, today, 12).map((w) => ({ ...w, exercises: workoutExerciseNames(w.id) })),
    topExercises: topExercises(addDays(today, -89), today, 6),
    strength: strengthChanges(addDays(today, -90), today, 5),
    photo: monthPhotoStatus(monthKey(today)),
  };
}

// ── Body ────────────────────────────────────────────────────────────────────

export function bodySummary(today: ISODate) {
  const ranges = {
    '1M': addMonths(today, -1),
    '3M': addMonths(today, -3),
    '6M': addMonths(today, -6),
    '1Y': addMonths(today, -12),
    All: null,
  } as const;
  const changes = Object.fromEntries(Object.entries(ranges).map(([k, since]) => [k, bodyChanges(since, today)]));
  const series = Object.fromEntries(BODY_FIELDS.map((f) => [f, bodySeries(f, undefined, today)]));
  return { latest: latestBody(today), changes, series };
}

// ── Period report: the shared engine behind weekly, monthly and yearly reviews ──

export function periodReport(r: Range, today: ISODate) {
  const s = getSettings();
  const end = r.end < today ? r.end : today;
  const t = totals(r);
  const prev = totals({ start: addDays(r.start, -(diffDays(r.start, r.end) + 1)), end: addDays(r.start, -1) });
  const projects = db()
    .prepare(
      `SELECT p.id, p.name, p.color, p.status, SUM(w.minutes) minutes, SUM(w.earned_cents) cents
         FROM work_sessions w JOIN projects p ON p.id = w.project_id
        WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ? GROUP BY p.id ORDER BY minutes DESC`,
    )
    .all(r.start, r.end) as { id: number; name: string; color: string | null; status: string; minutes: number; cents: number }[];
  const completedProjects = db()
    .prepare(`SELECT id, name, completed_on AS date FROM projects WHERE completed_on >= ? AND completed_on <= ? ORDER BY completed_on`)
    .all(r.start, r.end) as { id: number; name: string; date: string }[];
  const changes = bodyChanges(addDays(r.start, -1), end).filter((c) => c.to && c.from && c.from.date < c.to.date && c.to.date >= r.start);
  return {
    range: r,
    totals: t,
    previous: prev,
    ratings: ratingStats(r, today),
    days: dailySeries(r),
    projects,
    completedProjects,
    goalsCompleted: goalsCompleted(r, today, s.weekStart),
    prs: listPRs({ from: r.start, to: r.end }),
    accomplishments: listAccomplishments(r.start, r.end),
    bodyChanges: changes,
    topExercises: topExercises(r.start, r.end, 5),
    strength: strengthChanges(r.start, end, 5),
    avgRate: t.minutes ? Math.round((t.earnedCents * 60) / t.minutes) : null,
    daysInPeriod: diffDays(r.start, r.end) + 1,
    screen: screenAverage({ start: r.start, end: end }),
    screenPrev: screenAverage({ start: addDays(r.start, -(diffDays(r.start, r.end) + 1)), end: addDays(r.start, -1) }),
    travel: visitsIn(r),
    travelStats: travelStats(today, r),
  };
}

export function monthRangeOf(d: ISODate): Range {
  return periodRange('month', d, 1);
}

export { daysInMonth, daysInYear };
