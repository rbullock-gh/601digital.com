// Goals are definitions; progress is always computed from the underlying data,
// so logging income, a workout, or a rating moves every relevant goal instantly.

import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { metricByDay, sumMap } from './stats.ts';
import { bodySeries, valueAt } from './body.ts';
import { bestE1rmBefore, bestWeightBefore } from './fitness.ts';
import { estimate1RM, KG_EPSILON } from '../../shared/fitness.ts';
import {
  addDays,
  eachDay,
  isISODate,
  maxDate,
  minDate,
  periodRange,
  shiftPeriod,
  type ISODate,
  type PeriodKind,
  type Range,
} from '../../shared/dates.ts';
import type { Goal, GoalInput, GoalMetric, GoalPeriod, GoalProgress } from '../../shared/types.ts';

const SUMMABLE: GoalMetric[] = [
  'earnings', 'hours', 'workouts', 'work_days', 'good_days', 'gym_hours', 'prs', 'projects_completed', 'photos', 'trips', 'new_places', 'manual',
];
/** "Stay under" goals: the daily average over logged days must not exceed the target. */
const UNDER: GoalMetric[] = ['screen_time'];
const LEVEL: GoalMetric[] = ['weight', 'waist', 'exercise_weight', 'exercise_e1rm'];
const HISTORY: Record<PeriodKind, number> = { day: 14, week: 12, month: 12, year: 5 };

interface GoalRow {
  id: number;
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  recurring: number;
  start_date: string | null;
  end_date: string | null;
  target: number;
  baseline: number | null;
  exercise_id: number | null;
  exercise_name: string | null;
  project_id: number | null;
  project_name: string | null;
  status: 'active' | 'archived';
}

const SELECT = `SELECT g.*, e.name AS exercise_name, p.name AS project_name FROM goals g
  LEFT JOIN exercises e ON e.id = g.exercise_id LEFT JOIN projects p ON p.id = g.project_id`;

function mapGoal(r: GoalRow): Goal {
  return {
    id: r.id,
    title: r.title,
    metric: r.metric,
    period: r.period,
    recurring: !!r.recurring,
    startDate: r.start_date,
    endDate: r.end_date,
    target: r.target,
    baseline: r.baseline,
    exerciseId: r.exercise_id,
    exerciseName: r.exercise_name,
    projectId: r.project_id,
    projectName: r.project_name,
    status: r.status,
  };
}

export function getGoal(id: number): Goal {
  const r = db().prepare(`${SELECT} WHERE g.id = ? AND g.deleted_at IS NULL`).get(id) as GoalRow | undefined;
  if (!r) throw notFound('Goal not found');
  return mapGoal(r);
}

function allGoals(includeArchived: boolean): Goal[] {
  return (
    db()
      .prepare(`${SELECT} WHERE g.deleted_at IS NULL ${includeArchived ? '' : "AND g.status = 'active'"} ORDER BY g.position, g.id`)
      .all() as GoalRow[]
  ).map(mapGoal);
}

// ── Level metrics (a value that moves, rather than a count that sums) ───────

function levelAt(g: Goal, date: ISODate): number | null {
  switch (g.metric) {
    case 'weight':
      return valueAt('weightKg', date)?.value ?? null;
    case 'waist':
      return valueAt('waistCm', date)?.value ?? null;
    case 'exercise_weight':
      return g.exerciseId ? bestWeightBefore(g.exerciseId, date) : null;
    case 'exercise_e1rm':
      return g.exerciseId ? bestE1rmBefore(g.exerciseId, date) : null;
    default:
      return null;
  }
}

function levelReachedOn(g: Goal, from: ISODate, today: ISODate): ISODate | null {
  const down = g.baseline != null && g.target < g.baseline;
  if (g.metric === 'weight' || g.metric === 'waist') {
    for (const p of bodySeries(g.metric === 'weight' ? 'weightKg' : 'waistCm', from, today)) {
      if (down ? p.value <= g.target + KG_EPSILON : p.value >= g.target - KG_EPSILON) return p.date;
    }
    return null;
  }
  if (!g.exerciseId) return null;
  const rows = db()
    .prepare(
      `SELECT w.date, s.weight_kg, s.reps FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND s.is_warmup = 0 AND COALESCE(s.reps, 0) > 0 AND w.date <= ?
        ORDER BY w.date`,
    )
    .all(g.exerciseId, today) as { date: string; weight_kg: number | null; reps: number | null }[];
  for (const r of rows) {
    const v = g.metric === 'exercise_weight' ? r.weight_kg ?? 0 : estimate1RM(r.weight_kg, r.reps) ?? 0;
    if (v >= g.target - KG_EPSILON) return r.date;
  }
  return null;
}

// ── Evaluation ──────────────────────────────────────────────────────────────

function sumOver(g: Goal, r: Range): Map<string, number> {
  return metricByDay(g.metric, r, { projectId: g.projectId, goalId: g.id });
}

function crossedOn(m: Map<string, number>, r: Range, target: number): ISODate | null {
  let acc = 0;
  for (const d of eachDay(r.start, r.end)) {
    acc += m.get(d) ?? 0;
    if (acc >= target) return d;
  }
  return null;
}

function activeWindow(g: Goal, today: ISODate): Range {
  return { start: g.startDate ?? '0000-01-01', end: minDate(g.endDate ?? today, today) };
}

function clip(r: Range, w: Range): Range | null {
  const start = maxDate(r.start, w.start);
  const end = minDate(r.end, w.end);
  return start <= end ? { start, end } : null;
}

/** Average of logged days in a range, and whether it stays under the target. */
function underInstance(g: Goal, r: Range | null): { current: number; logged: number; done: boolean; pct: number } {
  if (!r) return { current: 0, logged: 0, done: false, pct: 0 };
  const m = sumOver(g, r);
  const logged = m.size;
  const current = logged ? sumMap(m) / logged : 0;
  const done = logged > 0 && current <= g.target;
  return { current, logged, done, pct: logged ? Math.min(1, g.target / Math.max(1, current)) : 0 };
}

function evaluateUnder(g: Goal, today: ISODate, weekStart: number, withHistory: boolean): GoalProgress {
  if (!g.recurring || g.period === 'custom' || g.period === 'target') {
    const w = clip({ start: g.startDate ?? '0000-01-01', end: g.endDate ?? '9999-12-31' }, { start: '0000-01-01', end: today });
    const x = underInstance(g, w);
    return { ...g, current: x.current, pct: x.pct, done: x.done, periodStart: g.startDate, periodEnd: g.endDate, completedOn: null };
  }
  const kind = g.period as PeriodKind;
  const win = activeWindow(g, today);
  const cur = periodRange(kind, today, weekStart);
  const x = underInstance(g, clip({ start: cur.start, end: minDate(cur.end, today) }, win));
  const out: GoalProgress = { ...g, current: x.current, pct: x.pct, done: x.done, periodStart: cur.start, periodEnd: cur.end };
  if (withHistory) {
    const history: { start: ISODate; done: boolean }[] = [];
    for (let i = HISTORY[kind] - 1; i >= 0; i--) {
      const r = periodRange(kind, shiftPeriod(kind, today, -i), weekStart);
      const c = clip({ start: r.start, end: minDate(r.end, today) }, win);
      if (!c) continue;
      history.push({ start: r.start, done: underInstance(g, c).done });
    }
    out.history = history;
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (i === history.length - 1 && !history[i].done) continue;
      if (history[i].done) streak++;
      else break;
    }
    out.streak = streak;
  }
  return out;
}

export function evaluate(g: Goal, today: ISODate, weekStart: number, withHistory = true): GoalProgress {
  if (UNDER.includes(g.metric)) return evaluateUnder(g, today, weekStart, withHistory);
  // Level goals: reach a value (bodyweight, waist, a lift).
  if (LEVEL.includes(g.metric)) {
    const current = levelAt(g, today) ?? g.baseline ?? 0;
    const down = g.baseline != null && g.target < g.baseline;
    let pct: number;
    if (g.metric === 'weight' || g.metric === 'waist') {
      const base = g.baseline ?? current;
      const span = Math.abs(base - g.target);
      pct = span < 1e-6 ? 1 : (down ? base - current : current - base) / span;
    } else {
      pct = g.target > 0 ? current / g.target : 0;
    }
    const done = down ? current <= g.target + KG_EPSILON && current > 0 : current >= g.target - KG_EPSILON;
    return {
      ...g,
      current,
      pct: Math.max(0, Math.min(1, pct)),
      done,
      periodStart: g.startDate,
      periodEnd: g.endDate,
      completedOn: done ? levelReachedOn(g, g.startDate ?? '0000-01-01', today) : null,
    };
  }

  // Cumulative goals with a fixed window (custom range, one-off period, or open-ended target).
  if (!g.recurring || g.period === 'custom' || g.period === 'target') {
    const window: Range = { start: g.startDate ?? '0000-01-01', end: g.endDate ?? '9999-12-31' };
    const upto = { start: window.start, end: minDate(window.end, today) };
    const m = upto.start <= upto.end ? sumOver(g, upto) : new Map();
    const current = sumMap(m);
    const done = current >= g.target;
    return {
      ...g,
      current,
      pct: g.target > 0 ? Math.min(1, current / g.target) : 0,
      done,
      periodStart: g.startDate,
      periodEnd: g.endDate,
      completedOn: done ? crossedOn(m, upto, g.target) : null,
    };
  }

  // Recurring goals: the current day / week / month / year, plus recent history.
  const kind = g.period as PeriodKind;
  const win = activeWindow(g, today);
  const cur = periodRange(kind, today, weekStart);
  const curClip = clip({ start: cur.start, end: minDate(cur.end, today) }, win);
  const current = curClip ? sumMap(sumOver(g, curClip)) : 0;
  const done = current >= g.target;
  const out: GoalProgress = {
    ...g,
    current,
    pct: g.target > 0 ? Math.min(1, current / g.target) : 0,
    done,
    periodStart: cur.start,
    periodEnd: cur.end,
  };
  if (g.metric === 'manual' && kind === 'day') out.checkedToday = current > 0;
  if (withHistory) {
    const history: { start: ISODate; done: boolean }[] = [];
    // Evaluate past instances in one query over their combined span.
    const oldest = periodRange(kind, shiftPeriod(kind, today, -(HISTORY[kind] - 1)), weekStart);
    const span = clip({ start: oldest.start, end: today }, win);
    const m = span ? sumOver(g, span) : new Map<string, number>();
    for (let i = HISTORY[kind] - 1; i >= 0; i--) {
      const r = periodRange(kind, shiftPeriod(kind, today, -i), weekStart);
      const c = clip({ start: r.start, end: minDate(r.end, today) }, win);
      if (!c) continue;
      let v = 0;
      for (const d of eachDay(c.start, c.end)) v += m.get(d) ?? 0;
      history.push({ start: r.start, done: v >= g.target });
    }
    out.history = history;
    // Streak: consecutive completed periods; the current one counts only once it's done.
    let streak = 0;
    for (let i = history.length - 1; i >= 0; i--) {
      if (i === history.length - 1 && !history[i].done) continue;
      if (history[i].done) streak++;
      else break;
    }
    out.streak = streak;
  }
  return out;
}

export function goalsWithProgress(today: ISODate, weekStart: number, includeArchived = false): GoalProgress[] {
  return allGoals(includeArchived).map((g) => evaluate(g, today, weekStart));
}

/** Daily goals that applied on a given date, evaluated for that date. */
export function goalsForDay(date: ISODate, today: ISODate, _weekStart?: number): GoalProgress[] {
  const rows = (
    db()
      .prepare(
        `${SELECT} WHERE g.deleted_at IS NULL AND g.period = 'day' AND g.recurring = 1
            AND COALESCE(g.start_date, '0000-01-01') <= ? AND COALESCE(g.end_date, '9999-12-31') >= ?
          ORDER BY g.position, g.id`,
      )
      .all(date, date) as GoalRow[]
  ).map(mapGoal);
  if (date > today) return [];
  return rows.map((g) => {
    const m = sumOver(g, { start: date, end: date });
    const v = sumMap(m);
    const under = UNDER.includes(g.metric);
    return {
      ...g,
      current: v,
      pct: under ? (m.size ? Math.min(1, g.target / Math.max(1, v)) : 0) : g.target > 0 ? Math.min(1, v / g.target) : 0,
      done: under ? m.size > 0 && v <= g.target : v >= g.target,
      periodStart: date,
      periodEnd: date,
      checkedToday: g.metric === 'manual' ? v > 0 : undefined,
    };
  });
}

/** Done / total daily goals for every day in a range (for grids and calendars). */
export function dailyGoalCounts(r: Range, today: ISODate): Map<string, { done: number; total: number }> {
  const out = new Map<string, { done: number; total: number }>();
  const goals = (
    db()
      .prepare(`${SELECT} WHERE g.deleted_at IS NULL AND g.period = 'day' AND g.recurring = 1`)
      .all() as GoalRow[]
  ).map(mapGoal);
  for (const g of goals) {
    const w = clip(r, { start: g.startDate ?? '0000-01-01', end: minDate(g.endDate ?? today, today) });
    if (!w) continue;
    const m = sumOver(g, w);
    for (const d of eachDay(w.start, w.end)) {
      const c = out.get(d) ?? { done: 0, total: 0 };
      c.total++;
      const v = m.get(d);
      if (UNDER.includes(g.metric) ? v != null && v <= g.target : (v ?? 0) >= g.target) c.done++;
      out.set(d, c);
    }
  }
  return out;
}

export interface CompletedGoal {
  id: number;
  title: string;
  metric: GoalMetric;
  period: GoalPeriod;
  date: ISODate; // when it was completed (or the period it was completed for)
}

/**
 * Goals completed within a range. Recurring week/month/year goals count once per
 * completed period that starts in the range; one-off and target goals count on the
 * day they were reached. Daily goals are reported separately as a hit rate.
 */
export function goalsCompleted(r: Range, today: ISODate, weekStart: number): CompletedGoal[] {
  const out: CompletedGoal[] = [];
  for (const g of allGoals(true)) {
    if (g.period === 'day' && g.recurring) continue;
    if (g.recurring && ['week', 'month', 'year'].includes(g.period)) {
      const kind = g.period as PeriodKind;
      const win = activeWindow(g, today);
      const span = clip({ start: periodRange(kind, r.start, weekStart).start, end: minDate(r.end, today) }, win);
      if (!span) continue;
      if (UNDER.includes(g.metric)) {
        // An "under" goal is only met once its period is over.
        let cur = periodRange(kind, r.start, weekStart);
        while (cur.start <= r.end && cur.end < today) {
          const c = cur.start >= r.start ? clip(cur, win) : null;
          if (c && underInstance(g, c).done) out.push({ id: g.id, title: g.title, metric: g.metric, period: g.period, date: cur.end });
          cur = periodRange(kind, addDays(cur.end, 1), weekStart);
        }
        continue;
      }
      const m = sumOver(g, span);
      let cursor = periodRange(kind, r.start, weekStart);
      while (cursor.start <= r.end && cursor.start <= today) {
        if (cursor.start >= r.start) {
          const c = clip({ start: cursor.start, end: minDate(cursor.end, today) }, win);
          if (c) {
            let v = 0;
            let hit: ISODate | null = null;
            for (const d of eachDay(c.start, c.end)) {
              v += m.get(d) ?? 0;
              if (!hit && v >= g.target) hit = d;
            }
            if (hit) out.push({ id: g.id, title: g.title, metric: g.metric, period: g.period, date: hit });
          }
        }
        cursor = periodRange(kind, addDays(cursor.end, 1), weekStart);
      }
      continue;
    }
    const e = evaluate(g, today, weekStart, false);
    if (e.done && e.completedOn && e.completedOn >= r.start && e.completedOn <= r.end)
      out.push({ id: g.id, title: g.title, metric: g.metric, period: g.period, date: e.completedOn });
  }
  return out.sort((a, b) => a.date.localeCompare(b.date));
}

// ── CRUD ────────────────────────────────────────────────────────────────────

function validate(input: GoalInput) {
  if (!input.title?.trim()) throw badRequest('Give the goal a name');
  if (!(input.target > 0)) throw badRequest('Set a target');
  const metrics: GoalMetric[] = [...SUMMABLE, ...LEVEL, ...UNDER];
  if (!metrics.includes(input.metric)) throw badRequest('Unknown goal type');
  if (!['day', 'week', 'month', 'year', 'custom', 'target'].includes(input.period)) throw badRequest('Unknown period');
  if (LEVEL.includes(input.metric) && input.period !== 'target') throw badRequest('That goal is a target, not a period');
  if ((input.metric === 'exercise_weight' || input.metric === 'exercise_e1rm') && !input.exerciseId)
    throw badRequest('Choose an exercise');
  if (input.period === 'custom' && (!isISODate(input.startDate) || !isISODate(input.endDate) || input.startDate! > input.endDate!))
    throw badRequest('Choose a start and end date');
}

export function createGoal(input: GoalInput, today: ISODate, weekStart: number): GoalProgress {
  validate(input);
  let start: ISODate | null = input.startDate ?? null;
  let end: ISODate | null = input.endDate ?? null;
  const recurring = input.period === 'custom' || input.period === 'target' ? false : input.recurring !== false;
  if (['day', 'week', 'month', 'year'].includes(input.period)) {
    const r = periodRange(input.period as PeriodKind, today, weekStart);
    if (recurring) {
      // Recurring goals count from the start of the period they were created in.
      start = r.start;
      end = null;
    } else {
      start = r.start;
      end = r.end;
    }
  }
  if (input.period === 'target') {
    start = input.startDate ?? today;
    end = input.endDate ?? null;
  }
  const g = { ...input, period: input.period } as GoalInput;
  let baseline: number | null = null;
  if (LEVEL.includes(g.metric)) {
    baseline = levelAt({ ...(g as unknown as Goal), exerciseId: g.exerciseId ?? null, baseline: null } as Goal, today);
  }
  const pos = (db().prepare('SELECT COALESCE(MAX(position), 0) + 1 p FROM goals').get() as { p: number }).p;
  const r = db()
    .prepare(
      `INSERT INTO goals (title, metric, period, recurring, start_date, end_date, target, baseline, exercise_id, project_id, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      input.title.trim(), input.metric, input.period, recurring ? 1 : 0, start, end, input.target, baseline,
      input.exerciseId ?? null, input.projectId ?? null, pos,
    );
  return evaluate(getGoal(Number(r.lastInsertRowid)), today, weekStart);
}

export function updateGoal(id: number, patch: Partial<GoalInput> & { status?: 'active' | 'archived' }, today: ISODate, weekStart: number) {
  const g = getGoal(id);
  const title = patch.title?.trim() || g.title;
  const target = patch.target ?? g.target;
  if (!(target > 0)) throw badRequest('Set a target');
  let endDate = patch.endDate !== undefined ? patch.endDate : g.endDate;
  const status = patch.status ?? g.status;
  // Archiving a recurring goal closes its window so its history stays intact.
  if (status === 'archived' && g.status === 'active' && g.recurring) endDate = today;
  if (status === 'active' && g.status === 'archived' && g.recurring) endDate = null;
  const startDate = patch.startDate !== undefined && (g.period === 'custom' || g.period === 'target') ? patch.startDate : g.startDate;
  db()
    .prepare('UPDATE goals SET title = ?, target = ?, start_date = ?, end_date = ?, status = ?, project_id = ? WHERE id = ?')
    .run(title, target, startDate, endDate, status, patch.projectId !== undefined ? patch.projectId : g.projectId, id);
  return evaluate(getGoal(id), today, weekStart);
}

export function reorderGoals(ids: number[]) {
  const stmt = db().prepare('UPDATE goals SET position = ? WHERE id = ?');
  db().transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
}

export function checkIn(goalId: number, date: ISODate, value: number | null) {
  const g = getGoal(goalId);
  if (g.metric !== 'manual') throw badRequest('This goal updates itself');
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (value === null) {
    // Toggle for daily yes/no goals.
    const existing = db().prepare('SELECT id FROM goal_checkins WHERE goal_id = ? AND date = ?').get(goalId, date) as { id: number } | undefined;
    if (existing) db().prepare('DELETE FROM goal_checkins WHERE goal_id = ? AND date = ?').run(goalId, date);
    else db().prepare('INSERT INTO goal_checkins (goal_id, date, value) VALUES (?, ?, 1)').run(goalId, date);
  } else {
    db().prepare('INSERT INTO goal_checkins (goal_id, date, value) VALUES (?, ?, ?)').run(goalId, date, value);
  }
}
