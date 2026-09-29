import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { estimate1RM, heavier, KG_EPSILON } from '../../shared/fitness.ts';
import { isClock, isISODate, type ISODate } from '../../shared/dates.ts';
import type { Exercise, PR, Workout, WorkoutInput, WorkoutSummary } from '../../shared/types.ts';

// ── Exercises ───────────────────────────────────────────────────────────────

export function listExercises(): Exercise[] {
  return db()
    .prepare(
      `SELECT e.id, e.name, e.muscle_group AS muscleGroup, e.kind,
              COUNT(w.id) AS uses, MAX(w.date) AS lastDate
         FROM exercises e
         LEFT JOIN workout_exercises we ON we.exercise_id = e.id
         LEFT JOIN workouts w ON w.id = we.workout_id AND w.deleted_at IS NULL
        GROUP BY e.id
        ORDER BY uses DESC, e.name`,
    )
    .all() as Exercise[];
}

export function resolveExercise(id: number | null | undefined, name: string): number {
  if (id) {
    const row = db().prepare('SELECT id FROM exercises WHERE id = ?').get(id);
    if (row) return id;
  }
  const n = name.trim();
  if (!n) throw badRequest('Exercise name is required');
  const row = db().prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE').get(n) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db().prepare('INSERT INTO exercises (name) VALUES (?)').run(n).lastInsertRowid);
}

export function updateExercise(id: number, patch: { name?: string; muscleGroup?: string | null; kind?: Exercise['kind'] }) {
  const cur = db().prepare('SELECT * FROM exercises WHERE id = ?').get(id) as
    | { name: string; muscle_group: string | null; kind: Exercise['kind'] }
    | undefined;
  if (!cur) throw notFound('Exercise not found');
  const name = patch.name?.trim() || cur.name;
  const clash = db().prepare('SELECT id FROM exercises WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
  if (clash) throw badRequest(`“${name}” already exists`);
  db()
    .prepare('UPDATE exercises SET name = ?, muscle_group = ?, kind = ? WHERE id = ?')
    .run(name, patch.muscleGroup !== undefined ? patch.muscleGroup : cur.muscle_group, patch.kind ?? cur.kind, id);
}

// ── Workouts ────────────────────────────────────────────────────────────────

interface WorkoutRow {
  id: number;
  date: string;
  name: string;
  start_time: string | null;
  duration_minutes: number | null;
  notes: string | null;
}

export function getWorkout(id: number): Workout {
  const w = db().prepare('SELECT * FROM workouts WHERE id = ? AND deleted_at IS NULL').get(id) as WorkoutRow | undefined;
  if (!w) throw notFound('Workout not found');
  const exRows = db()
    .prepare(
      `SELECT we.id, we.exercise_id, we.notes, e.name FROM workout_exercises we
         JOIN exercises e ON e.id = we.exercise_id WHERE we.workout_id = ? ORDER BY we.position, we.id`,
    )
    .all(id) as { id: number; exercise_id: number; notes: string | null; name: string }[];
  const setStmt = db().prepare(
    'SELECT id, weight_kg, reps, rpe, is_warmup FROM sets WHERE workout_exercise_id = ? ORDER BY position, id',
  );
  return {
    id: w.id,
    date: w.date,
    name: w.name,
    startTime: w.start_time,
    durationMinutes: w.duration_minutes,
    notes: w.notes,
    exercises: exRows.map((e) => ({
      id: e.id,
      exerciseId: e.exercise_id,
      exerciseName: e.name,
      notes: e.notes,
      sets: (setStmt.all(e.id) as { id: number; weight_kg: number | null; reps: number | null; rpe: number | null; is_warmup: number }[]).map(
        (s) => ({ id: s.id, weightKg: s.weight_kg, reps: s.reps, rpe: s.rpe, isWarmup: !!s.is_warmup }),
      ),
    })),
    prs: listPRs({ workoutId: id }),
  };
}

const SUMMARY_SELECT = `
  SELECT w.id, w.date, w.name, w.duration_minutes AS durationMinutes,
         (SELECT COUNT(*) FROM workout_exercises we WHERE we.workout_id = w.id) AS exerciseCount,
         (SELECT COUNT(*) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id
           WHERE we.workout_id = w.id AND s.is_warmup = 0) AS setCount,
         (SELECT COALESCE(SUM(COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0)), 0) FROM sets s
            JOIN workout_exercises we ON we.id = s.workout_exercise_id
           WHERE we.workout_id = w.id AND s.is_warmup = 0) AS volumeKg,
         (SELECT COUNT(DISTINCT pr.exercise_id) FROM personal_records pr WHERE pr.workout_id = w.id) AS prCount
    FROM workouts w`;

export function listWorkouts(from?: ISODate, to?: ISODate, limit = 500): WorkoutSummary[] {
  return db()
    .prepare(`${SUMMARY_SELECT} WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ? ORDER BY w.date DESC, w.id DESC LIMIT ?`)
    .all(from ?? '0000-01-01', to ?? '9999-12-31', limit) as WorkoutSummary[];
}

export function workoutExerciseNames(workoutId: number): string[] {
  return (
    db()
      .prepare(
        'SELECT e.name FROM workout_exercises we JOIN exercises e ON e.id = we.exercise_id WHERE we.workout_id = ? ORDER BY we.position',
      )
      .all(workoutId) as { name: string }[]
  ).map((r) => r.name);
}

function exerciseIdsForWorkout(workoutId: number): number[] {
  return (db().prepare('SELECT DISTINCT exercise_id FROM workout_exercises WHERE workout_id = ?').all(workoutId) as { exercise_id: number }[]).map(
    (r) => r.exercise_id,
  );
}

function validateWorkout(input: WorkoutInput) {
  if (!isISODate(input.date)) throw badRequest('A valid date is required');
  if (!input.name?.trim()) throw badRequest('Give the workout a name');
  if (input.startTime && !isClock(input.startTime)) throw badRequest('Invalid start time');
  if (input.durationMinutes != null && (input.durationMinutes < 0 || input.durationMinutes > 24 * 60))
    throw badRequest('Invalid duration');
  for (const e of input.exercises ?? []) {
    for (const s of e.sets) {
      if (s.weightKg != null && (s.weightKg < 0 || s.weightKg > 1000)) throw badRequest('Invalid weight');
      if (s.reps != null && (s.reps < 0 || s.reps > 1000 || !Number.isInteger(s.reps))) throw badRequest('Invalid reps');
    }
  }
}

function writeExercises(workoutId: number, input: WorkoutInput) {
  db().prepare('DELETE FROM workout_exercises WHERE workout_id = ?').run(workoutId);
  const insEx = db().prepare('INSERT INTO workout_exercises (workout_id, exercise_id, position, notes) VALUES (?, ?, ?, ?)');
  const insSet = db().prepare(
    'INSERT INTO sets (workout_exercise_id, position, weight_kg, reps, rpe, is_warmup) VALUES (?, ?, ?, ?, ?, ?)',
  );
  (input.exercises ?? []).forEach((e, i) => {
    const exId = resolveExercise(e.exerciseId, e.exerciseName);
    const weId = Number(insEx.run(workoutId, exId, i, e.notes?.trim() || null).lastInsertRowid);
    e.sets.forEach((s, j) => {
      if (s.weightKg == null && s.reps == null) return; // untouched blank row
      insSet.run(weId, j, s.weightKg, s.reps, s.rpe ?? null, s.isWarmup ? 1 : 0);
    });
  });
}

export function createWorkout(input: WorkoutInput): Workout {
  validateWorkout(input);
  const id = db().transaction(() => {
    const r = db()
      .prepare('INSERT INTO workouts (date, name, start_time, duration_minutes, notes) VALUES (?, ?, ?, ?, ?)')
      .run(input.date, input.name.trim(), input.startTime ?? null, input.durationMinutes ?? null, input.notes?.trim() || null);
    const id = Number(r.lastInsertRowid);
    writeExercises(id, input);
    for (const ex of exerciseIdsForWorkout(id)) recomputePRs(ex);
    return id;
  })();
  return getWorkout(id);
}

export function updateWorkout(id: number, input: WorkoutInput): Workout {
  validateWorkout(input);
  db().transaction(() => {
    const before = exerciseIdsForWorkout(id);
    const r = db()
      .prepare(
        `UPDATE workouts SET date = ?, name = ?, start_time = ?, duration_minutes = ?, notes = ?, updated_at = datetime('now')
          WHERE id = ? AND deleted_at IS NULL`,
      )
      .run(input.date, input.name.trim(), input.startTime ?? null, input.durationMinutes ?? null, input.notes?.trim() || null, id);
    if (!r.changes) throw notFound('Workout not found');
    writeExercises(id, input);
    for (const ex of new Set([...before, ...exerciseIdsForWorkout(id)])) recomputePRs(ex);
  })();
  return getWorkout(id);
}

export function softDeleteWorkout(id: number) {
  db().transaction(() => {
    db().prepare("UPDATE workouts SET deleted_at = datetime('now') WHERE id = ?").run(id);
    for (const ex of exerciseIdsForWorkout(id)) recomputePRs(ex);
  })();
}

export function restoreWorkout(id: number) {
  db().transaction(() => {
    db().prepare('UPDATE workouts SET deleted_at = NULL WHERE id = ?').run(id);
    for (const ex of exerciseIdsForWorkout(id)) recomputePRs(ex);
  })();
}

/** Recent distinct workout names with their latest instance, for "repeat a workout". */
export function workoutTemplates(limit = 8) {
  return db()
    .prepare(
      `SELECT w.name, MAX(w.date) AS lastDate, COUNT(*) AS times,
              (SELECT w2.id FROM workouts w2 WHERE w2.name = w.name AND w2.deleted_at IS NULL ORDER BY w2.date DESC, w2.id DESC LIMIT 1) AS workoutId
         FROM workouts w WHERE w.deleted_at IS NULL
        GROUP BY w.name ORDER BY lastDate DESC LIMIT ?`,
    )
    .all(limit) as { name: string; lastDate: string; times: number; workoutId: number }[];
}

// ── Personal records ────────────────────────────────────────────────────────
//
// PRs are never entered by hand. For one exercise, walk every working set in
// date order and record, per workout, anything that beat all earlier workouts:
//   weight — heaviest load lifted for at least one rep
//   e1rm   — best Epley estimated one-rep max
//   reps   — more reps at a load than ever managed at that load or heavier
// The first session of an exercise is the baseline and never counts as a PR.

interface SetRow {
  workout_id: number;
  date: string;
  weight_kg: number | null;
  reps: number | null;
}

export function recomputePRs(exerciseId: number) {
  const rows = db()
    .prepare(
      `SELECT w.id AS workout_id, w.date, s.weight_kg, s.reps
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND s.is_warmup = 0 AND COALESCE(s.reps, 0) > 0
        ORDER BY w.date, w.id, we.position, s.position`,
    )
    .all(exerciseId) as SetRow[];

  const groups: { workoutId: number; date: string; sets: SetRow[] }[] = [];
  for (const r of rows) {
    const last = groups[groups.length - 1];
    if (last && last.workoutId === r.workout_id) last.sets.push(r);
    else groups.push({ workoutId: r.workout_id, date: r.date, sets: [r] });
  }

  const ins = db().prepare(
    `INSERT INTO personal_records (exercise_id, workout_id, date, type, weight_kg, reps, value, previous_value)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  );
  db().prepare('DELETE FROM personal_records WHERE exercise_id = ?').run(exerciseId);

  let bestWeight = -1;
  let bestE1 = -1;
  // Rounded load (0.25 kg buckets) → most reps ever achieved at that load.
  const repsAt = new Map<number, number>();
  const bucket = (kg: number) => Math.round(kg * 4) / 4;
  const maxRepsAtOrAbove = (kg: number) => {
    let best = 0;
    const b = bucket(kg);
    for (const [w, r] of repsAt) if (w >= b - KG_EPSILON && r > best) best = r;
    return best;
  };

  groups.forEach((g, gi) => {
    if (gi > 0) {
      const w = g.sets.reduce((a, b) => ((b.weight_kg ?? 0) > (a.weight_kg ?? 0) || ((b.weight_kg ?? 0) === (a.weight_kg ?? 0) && (b.reps ?? 0) > (a.reps ?? 0)) ? b : a));
      const topKg = w.weight_kg ?? 0;
      let weightPRSet: SetRow | null = null;
      if (topKg > 0 && heavier(topKg, bestWeight)) {
        weightPRSet = w;
        ins.run(exerciseId, g.workoutId, g.date, 'weight', topKg, w.reps, topKg, bestWeight > 0 ? bestWeight : null);
      }

      let e1Set: SetRow | null = null;
      let e1 = -1;
      for (const s of g.sets) {
        const v = estimate1RM(s.weight_kg, s.reps) ?? -1;
        if (v > e1) (e1 = v), (e1Set = s);
      }
      if (e1Set && e1 > 0 && e1 - bestE1 > 0.1) {
        ins.run(exerciseId, g.workoutId, g.date, 'e1rm', e1Set.weight_kg, e1Set.reps, e1, bestE1 > 0 ? bestE1 : null);
      }

      let repSet: SetRow | null = null;
      let repPrev = 0;
      for (const s of g.sets) {
        if (s === weightPRSet) continue;
        const kg = s.weight_kg ?? 0;
        const prev = maxRepsAtOrAbove(kg);
        if (prev > 0 && (s.reps ?? 0) > prev) {
          if (!repSet || kg > (repSet.weight_kg ?? 0) || (kg === (repSet.weight_kg ?? 0) && (s.reps ?? 0) > (repSet.reps ?? 0))) {
            repSet = s;
            repPrev = prev;
          }
        }
      }
      if (repSet) ins.run(exerciseId, g.workoutId, g.date, 'reps', repSet.weight_kg, repSet.reps, repSet.reps, repPrev);
    }
    for (const s of g.sets) {
      const kg = s.weight_kg ?? 0;
      if (kg > bestWeight) bestWeight = kg;
      const v = estimate1RM(s.weight_kg, s.reps);
      if (v && v > bestE1) bestE1 = v;
      const b = bucket(kg);
      repsAt.set(b, Math.max(repsAt.get(b) ?? 0, s.reps ?? 0));
    }
  });
}

export function recomputeAllPRs() {
  const ids = db().prepare('SELECT id FROM exercises').all() as { id: number }[];
  db().transaction(() => ids.forEach((r) => recomputePRs(r.id)))();
}

export function listPRs(f: { from?: ISODate; to?: ISODate; workoutId?: number; exerciseId?: number; limit?: number }): PR[] {
  const where = ['1 = 1'];
  const args: unknown[] = [];
  if (f.from) (where.push('pr.date >= ?'), args.push(f.from));
  if (f.to) (where.push('pr.date <= ?'), args.push(f.to));
  if (f.workoutId) (where.push('pr.workout_id = ?'), args.push(f.workoutId));
  if (f.exerciseId) (where.push('pr.exercise_id = ?'), args.push(f.exerciseId));
  return db()
    .prepare(
      `SELECT pr.id, pr.exercise_id AS exerciseId, e.name AS exerciseName, pr.workout_id AS workoutId, pr.date,
              pr.type, pr.weight_kg AS weightKg, pr.reps, pr.value, pr.previous_value AS previousValue
         FROM personal_records pr JOIN exercises e ON e.id = pr.exercise_id
        WHERE ${where.join(' AND ')}
        ORDER BY pr.date DESC, pr.id DESC LIMIT ?`,
    )
    .all(...args, f.limit ?? 1000) as PR[];
}

// ── Exercise history ────────────────────────────────────────────────────────

export interface ExerciseSession {
  workoutId: number;
  workoutName: string;
  date: ISODate;
  sets: { weightKg: number | null; reps: number | null; rpe: number | null; isWarmup: boolean }[];
  topKg: number;
  bestE1rm: number | null;
  volumeKg: number;
  reps: number;
}

function exerciseSessions(exerciseId: number, opts: { excludeWorkout?: number; limit?: number } = {}): ExerciseSession[] {
  const rows = db()
    .prepare(
      `SELECT w.id AS workout_id, w.name AS workout_name, w.date, s.weight_kg, s.reps, s.rpe, s.is_warmup
         FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND w.id != ?
        ORDER BY w.date DESC, w.id DESC, we.position, s.position`,
    )
    .all(exerciseId, opts.excludeWorkout ?? -1) as {
    workout_id: number;
    workout_name: string;
    date: string;
    weight_kg: number | null;
    reps: number | null;
    rpe: number | null;
    is_warmup: number;
  }[];
  const out: ExerciseSession[] = [];
  for (const r of rows) {
    let cur = out[out.length - 1];
    if (!cur || cur.workoutId !== r.workout_id) {
      if (opts.limit && out.length >= opts.limit) break;
      cur = { workoutId: r.workout_id, workoutName: r.workout_name, date: r.date, sets: [], topKg: 0, bestE1rm: null, volumeKg: 0, reps: 0 };
      out.push(cur);
    }
    cur.sets.push({ weightKg: r.weight_kg, reps: r.reps, rpe: r.rpe, isWarmup: !!r.is_warmup });
    if (r.is_warmup) continue;
    cur.topKg = Math.max(cur.topKg, r.weight_kg ?? 0);
    const e = estimate1RM(r.weight_kg, r.reps);
    if (e && (cur.bestE1rm == null || e > cur.bestE1rm)) cur.bestE1rm = e;
    cur.volumeKg += (r.weight_kg ?? 0) * (r.reps ?? 0);
    cur.reps += r.reps ?? 0;
  }
  return out;
}

export function lastPerformance(exerciseId: number, excludeWorkout?: number): ExerciseSession | null {
  return exerciseSessions(exerciseId, { excludeWorkout, limit: 1 })[0] ?? null;
}

export function exerciseHistory(exerciseId: number) {
  const ex = db().prepare('SELECT id, name, muscle_group AS muscleGroup, kind FROM exercises WHERE id = ?').get(exerciseId) as
    | { id: number; name: string; muscleGroup: string | null; kind: string }
    | undefined;
  if (!ex) throw notFound('Exercise not found');
  const sessions = exerciseSessions(exerciseId);
  let bestWeight: { kg: number; reps: number | null; date: string } | null = null;
  let bestSet: { kg: number | null; reps: number | null; e1rm: number; date: string } | null = null;
  let totalSets = 0;
  let totalReps = 0;
  let volume = 0;
  for (const s of sessions) {
    for (const set of s.sets) {
      if (set.isWarmup || !set.reps) continue;
      totalSets++;
      totalReps += set.reps;
      volume += (set.weightKg ?? 0) * set.reps;
      if (set.weightKg != null && (!bestWeight || set.weightKg > bestWeight.kg + KG_EPSILON)) bestWeight = { kg: set.weightKg, reps: set.reps, date: s.date };
      const e = estimate1RM(set.weightKg, set.reps);
      if (e && (!bestSet || e > bestSet.e1rm)) bestSet = { kg: set.weightKg, reps: set.reps, e1rm: e, date: s.date };
    }
  }
  return {
    exercise: ex,
    stats: {
      sessions: sessions.length,
      totalSets,
      totalReps,
      volumeKg: volume,
      bestWeight,
      bestSet,
      firstDate: sessions.length ? sessions[sessions.length - 1].date : null,
      lastDate: sessions[0]?.date ?? null,
    },
    last: sessions[0] ?? null,
    sessions,
    prs: listPRs({ exerciseId }),
  };
}

/** Best estimated 1RM per exercise on or before a date (for strength comparisons). */
export function bestE1rmBefore(exerciseId: number, date: ISODate, from?: ISODate): number | null {
  const rows = db()
    .prepare(
      `SELECT s.weight_kg, s.reps FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND s.is_warmup = 0 AND w.date <= ? AND w.date >= ?`,
    )
    .all(exerciseId, date, from ?? '0000-01-01') as { weight_kg: number | null; reps: number | null }[];
  let best: number | null = null;
  for (const r of rows) {
    const e = estimate1RM(r.weight_kg, r.reps);
    if (e && (best == null || e > best)) best = e;
  }
  return best;
}

export function bestWeightBefore(exerciseId: number, date: ISODate): number | null {
  const r = db()
    .prepare(
      `SELECT MAX(s.weight_kg) AS kg FROM sets s
         JOIN workout_exercises we ON we.id = s.workout_exercise_id
         JOIN workouts w ON w.id = we.workout_id
        WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND s.is_warmup = 0 AND COALESCE(s.reps, 0) > 0 AND w.date <= ?`,
    )
    .get(exerciseId, date) as { kg: number | null };
  return r.kg;
}

/** Top exercises by how often they were trained in a range. */
export function topExercises(from: ISODate, to: ISODate, limit = 5) {
  return db()
    .prepare(
      `SELECT e.id, e.name, COUNT(DISTINCT w.id) AS sessions,
              SUM(CASE WHEN s.is_warmup = 0 THEN 1 ELSE 0 END) AS sets,
              SUM(CASE WHEN s.is_warmup = 0 THEN COALESCE(s.weight_kg, 0) * COALESCE(s.reps, 0) ELSE 0 END) AS volumeKg
         FROM workouts w
         JOIN workout_exercises we ON we.workout_id = w.id
         JOIN exercises e ON e.id = we.exercise_id
         LEFT JOIN sets s ON s.workout_exercise_id = we.id
        WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ?
        GROUP BY e.id ORDER BY sessions DESC, sets DESC LIMIT ?`,
    )
    .all(from, to, limit) as { id: number; name: string; sessions: number; sets: number; volumeKg: number }[];
}

/** Strength change between the start and end of a range, per frequently-trained exercise. */
export function strengthChanges(from: ISODate, to: ISODate, limit = 6, sortBy: 'frequency' | 'pct' = 'frequency') {
  const top = topExercises(from, to, 12);
  const out: { id: number; name: string; startE1rm: number; endE1rm: number; change: number; pct: number }[] = [];
  for (const t of top) {
    // Baseline: best within the first 30 days of the range where the lift appears.
    const first = db()
      .prepare(
        `SELECT MIN(w.date) d FROM workouts w JOIN workout_exercises we ON we.workout_id = w.id
          WHERE we.exercise_id = ? AND w.deleted_at IS NULL AND w.date >= ? AND w.date <= ?`,
      )
      .get(t.id, from, to) as { d: string | null };
    if (!first.d) continue;
    const startE = bestE1rmWindow(t.id, first.d, 21);
    const endE = bestE1rmBefore(t.id, to, from);
    if (startE == null || endE == null) continue;
    out.push({ id: t.id, name: t.name, startE1rm: startE, endE1rm: endE, change: endE - startE, pct: (endE - startE) / startE });
  }
  return (sortBy === 'pct' ? out.sort((a, b) => b.pct - a.pct) : out).slice(0, limit);
}

function bestE1rmWindow(exerciseId: number, start: ISODate, days: number): number | null {
  const end = new Date(Date.parse(start) + days * 86400000).toISOString().slice(0, 10);
  return bestE1rmBefore(exerciseId, end, start);
}
