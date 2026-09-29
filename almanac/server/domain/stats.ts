// Aggregations over any date range. Every number on every screen is derived
// here from the raw records — nothing is ever stored pre-summed.

import { db } from '../db/connection.ts';
import { eachDay, type ISODate, type Range } from '../../shared/dates.ts';
import type { GoalMetric, Rating, Totals } from '../../shared/types.ts';

export function totals(r: Range): Totals {
  const w = db()
    .prepare(
      `SELECT COALESCE(SUM(minutes), 0) minutes, COUNT(*) sessions, COUNT(DISTINCT date) workDays
         FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?`,
    )
    .get(r.start, r.end) as { minutes: number; sessions: number; workDays: number };
  const e = db()
    .prepare('SELECT COALESCE(SUM(cents), 0) cents FROM earnings WHERE date >= ? AND date <= ?')
    .get(r.start, r.end) as { cents: number };
  const g = db()
    .prepare(
      `SELECT COUNT(*) workouts, COALESCE(SUM(duration_minutes), 0) gym
         FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ?`,
    )
    .get(r.start, r.end) as { workouts: number; gym: number };
  const d = db()
    .prepare(
      `SELECT COALESCE(SUM(rating = 3), 0) good, COALESCE(SUM(rating = 2), 0) okay, COALESCE(SUM(rating = 1), 0) bad
         FROM days WHERE rating IS NOT NULL AND date >= ? AND date <= ?`,
    )
    .get(r.start, r.end) as { good: number; okay: number; bad: number };
  const p = db()
    .prepare(
      `SELECT COUNT(*) n FROM (SELECT DISTINCT workout_id, exercise_id FROM personal_records WHERE date >= ? AND date <= ?)`,
    )
    .get(r.start, r.end) as { n: number };
  return {
    minutes: w.minutes,
    earnedCents: e.cents,
    sessions: w.sessions,
    workDays: w.workDays,
    workouts: g.workouts,
    gymMinutes: g.gym,
    good: d.good,
    okay: d.okay,
    bad: d.bad,
    rated: d.good + d.okay + d.bad,
    prs: p.n,
  };
}

export interface DayPoint {
  date: ISODate;
  minutes: number;
  cents: number;
  workouts: number;
  rating: Rating | null;
}

/** One row per calendar day in the range, zero-filled. */
export function dailySeries(r: Range): DayPoint[] {
  const map = new Map<string, DayPoint>();
  for (const d of eachDay(r.start, r.end)) map.set(d, { date: d, minutes: 0, cents: 0, workouts: 0, rating: null });
  const put = (rows: { date: string; v: number }[], key: 'minutes' | 'cents' | 'workouts') => {
    for (const row of rows) {
      const p = map.get(row.date);
      if (p) p[key] = row.v;
    }
  };
  put(
    db().prepare('SELECT date, SUM(minutes) v FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY date').all(r.start, r.end) as { date: string; v: number }[],
    'minutes',
  );
  put(db().prepare('SELECT date, SUM(cents) v FROM earnings WHERE date >= ? AND date <= ? GROUP BY date').all(r.start, r.end) as { date: string; v: number }[], 'cents');
  put(
    db().prepare('SELECT date, COUNT(*) v FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY date').all(r.start, r.end) as { date: string; v: number }[],
    'workouts',
  );
  for (const row of db().prepare('SELECT date, rating FROM days WHERE rating IS NOT NULL AND date >= ? AND date <= ?').all(r.start, r.end) as {
    date: string;
    rating: Rating;
  }[]) {
    const p = map.get(row.date);
    if (p) p.rating = row.rating;
  }
  return [...map.values()];
}

export interface MonthPoint {
  month: string;
  minutes: number;
  cents: number;
  workouts: number;
  gymMinutes: number;
  workDays: number;
  good: number;
  okay: number;
  bad: number;
}

export function monthlySeries(r: Range): MonthPoint[] {
  const map = new Map<string, MonthPoint>();
  const blank = (month: string): MonthPoint => ({ month, minutes: 0, cents: 0, workouts: 0, gymMinutes: 0, workDays: 0, good: 0, okay: 0, bad: 0 });
  let m = r.start.slice(0, 7);
  const endM = r.end.slice(0, 7);
  while (m <= endM) {
    map.set(m, blank(m));
    const [y, mo] = m.split('-').map(Number);
    m = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, '0')}`;
  }
  const merge = (rows: Record<string, number | string>[]) => {
    for (const row of rows) {
      const p = map.get(row.month as string);
      if (!p) continue;
      for (const [k, v] of Object.entries(row)) if (k !== 'month') (p as unknown as Record<string, number>)[k] = Number(v) || 0;
    }
  };
  merge(
    db()
      .prepare(
        `SELECT substr(date, 1, 7) month, SUM(minutes) minutes, COUNT(DISTINCT date) workDays
           FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY month`,
      )
      .all(r.start, r.end) as Record<string, number | string>[],
  );
  merge(db().prepare('SELECT substr(date, 1, 7) month, SUM(cents) cents FROM earnings WHERE date >= ? AND date <= ? GROUP BY month').all(r.start, r.end) as Record<string, number | string>[]);
  merge(
    db()
      .prepare(
        `SELECT substr(date, 1, 7) month, COUNT(*) workouts, COALESCE(SUM(duration_minutes), 0) gymMinutes
           FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY month`,
      )
      .all(r.start, r.end) as Record<string, number | string>[],
  );
  merge(
    db()
      .prepare(
        `SELECT substr(date, 1, 7) month, SUM(rating = 3) good, SUM(rating = 2) okay, SUM(rating = 1) bad
           FROM days WHERE rating IS NOT NULL AND date >= ? AND date <= ? GROUP BY month`,
      )
      .all(r.start, r.end) as Record<string, number | string>[],
  );
  return [...map.values()];
}

/**
 * Per-day values of a goal metric. Summing a range gives the goal's progress;
 * walking the days in order finds the date a target was first reached.
 */
export function metricByDay(
  metric: GoalMetric,
  r: Range,
  opts: { projectId?: number | null; goalId?: number } = {},
): Map<string, number> {
  const args: unknown[] = [r.start, r.end];
  const proj = opts.projectId ? ' AND project_id = ?' : '';
  if (opts.projectId) args.push(opts.projectId);
  let sql: string;
  switch (metric) {
    case 'earnings':
      sql = `SELECT date, SUM(cents) v FROM earnings WHERE date >= ? AND date <= ?${proj} GROUP BY date`;
      break;
    case 'hours':
      sql = `SELECT date, SUM(minutes) v FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?${proj} GROUP BY date`;
      break;
    case 'work_days':
      sql = `SELECT date, 1 v FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?${proj} GROUP BY date`;
      break;
    case 'workouts':
      sql = 'SELECT date, COUNT(*) v FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY date';
      break;
    case 'gym_hours':
      sql = 'SELECT date, SUM(COALESCE(duration_minutes, 0)) v FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ? GROUP BY date';
      break;
    case 'good_days':
      sql = 'SELECT date, 1 v FROM days WHERE rating = 3 AND date >= ? AND date <= ?';
      break;
    case 'prs':
      sql = `SELECT date, COUNT(*) v FROM (SELECT DISTINCT date, workout_id, exercise_id FROM personal_records WHERE date >= ? AND date <= ?) GROUP BY date`;
      break;
    case 'projects_completed':
      sql = `SELECT completed_on date, COUNT(*) v FROM projects WHERE completed_on IS NOT NULL AND status IN ('completed', 'archived')
               AND completed_on >= ? AND completed_on <= ? GROUP BY completed_on`;
      break;
    case 'photos':
      sql = `SELECT ps.date, 1 v FROM photo_sets ps WHERE ps.deleted_at IS NULL AND ps.date >= ? AND ps.date <= ?
               AND (SELECT COUNT(DISTINCT angle) FROM photos p WHERE p.set_id = ps.id AND p.deleted_at IS NULL
                     AND p.angle IN ('front', 'side', 'back')) = 3`;
      break;
    case 'screen_time':
      sql = 'SELECT date, minutes v FROM screen_time WHERE date >= ? AND date <= ?';
      break;
    case 'trips':
      sql = 'SELECT start_date date, COUNT(*) v FROM visits WHERE deleted_at IS NULL AND start_date >= ? AND start_date <= ? GROUP BY start_date';
      break;
    case 'new_places':
      sql = `SELECT first date, COUNT(*) v FROM (SELECT v.place_id, MIN(v.start_date) first FROM visits v JOIN places p ON p.id = v.place_id
               WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL GROUP BY v.place_id) WHERE first >= ? AND first <= ? GROUP BY first`;
      break;
    case 'manual':
      sql = 'SELECT date, SUM(value) v FROM goal_checkins WHERE date >= ? AND date <= ? AND goal_id = ? GROUP BY date';
      args.push(opts.goalId ?? -1);
      break;
    default:
      return new Map();
  }
  const rows = db().prepare(sql).all(...args) as { date: string; v: number }[];
  return new Map(rows.map((row) => [row.date, row.v]));
}

export function sumMap(m: Map<string, number>): number {
  let s = 0;
  for (const v of m.values()) s += v;
  return s;
}

/** Earliest date anything was recorded. */
export function firstActivityDate(): ISODate | null {
  const r = db()
    .prepare(
      `SELECT MIN(d) d FROM (
         SELECT MIN(date) d FROM work_sessions WHERE deleted_at IS NULL
         UNION ALL SELECT MIN(date) FROM income WHERE deleted_at IS NULL
         UNION ALL SELECT MIN(date) FROM workouts WHERE deleted_at IS NULL
         UNION ALL SELECT MIN(date) FROM days
         UNION ALL SELECT MIN(date) FROM body_metrics WHERE deleted_at IS NULL)`,
    )
    .get() as { d: string | null };
  return r.d;
}

export function hasAnyData(): boolean {
  return firstActivityDate() != null;
}
