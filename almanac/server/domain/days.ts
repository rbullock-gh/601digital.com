import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { listIncome, listSessions } from './work.ts';
import { listPRs, listWorkouts, workoutExerciseNames } from './fitness.ts';
import { listBody, photoSetOnDate } from './body.ts';
import { dailyGoalCounts, goalsForDay } from './goals.ts';
import { dailySeries } from './stats.ts';
import {
  addDays,
  daysInYear,
  isISODate,
  monthRange,
  yearRange,
  type ISODate,
  type Range,
  type YearMonth,
} from '../../shared/dates.ts';
import type { Accomplishment, DaySummary, DayView, Note, Rating } from '../../shared/types.ts';

// ── Rating & journal ────────────────────────────────────────────────────────

export function setDay(date: ISODate, patch: { rating?: Rating | null; journal?: string | null }, today: ISODate) {
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (date > today && patch.rating != null) throw badRequest('Future days cannot be rated');
  if (patch.rating != null && ![1, 2, 3].includes(patch.rating)) throw badRequest('Invalid rating');
  const cur = db().prepare('SELECT rating, journal FROM days WHERE date = ?').get(date) as
    | { rating: Rating | null; journal: string | null }
    | undefined;
  const rating = patch.rating !== undefined ? patch.rating : cur?.rating ?? null;
  const journal = patch.journal !== undefined ? patch.journal?.trim() || null : cur?.journal ?? null;
  db()
    .prepare(
      `INSERT INTO days (date, rating, rated_at, journal, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET rating = excluded.rating,
         rated_at = CASE WHEN excluded.rating IS NOT days.rating THEN excluded.rated_at ELSE days.rated_at END,
         journal = excluded.journal, updated_at = datetime('now')`,
    )
    .run(date, rating, rating != null ? new Date().toISOString() : null, journal);
  return { date, rating, journal };
}

// ── Notes & accomplishments ─────────────────────────────────────────────────

export function listNotes(date: ISODate): Note[] {
  return db()
    .prepare('SELECT id, date, time, body FROM notes WHERE date = ? AND deleted_at IS NULL ORDER BY COALESCE(time, created_at), id')
    .all(date) as Note[];
}

export function createNote(date: ISODate, body: string, time: string | null): Note {
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (!body?.trim()) throw badRequest('Write something first');
  const r = db().prepare('INSERT INTO notes (date, time, body) VALUES (?, ?, ?)').run(date, time, body.trim());
  return db().prepare('SELECT id, date, time, body FROM notes WHERE id = ?').get(r.lastInsertRowid) as Note;
}

export function updateNote(id: number, body: string) {
  if (!body?.trim()) throw badRequest('Write something first');
  const r = db().prepare('UPDATE notes SET body = ? WHERE id = ?').run(body.trim(), id);
  if (!r.changes) throw notFound('Note not found');
}

function mapAcc(r: { id: number; date: string; text: string; is_milestone: number }): Accomplishment {
  return { id: r.id, date: r.date, text: r.text, isMilestone: !!r.is_milestone };
}

export function listAccomplishments(from: ISODate, to: ISODate, milestonesOnly = false): Accomplishment[] {
  return (
    db()
      .prepare(
        `SELECT id, date, text, is_milestone FROM accomplishments
          WHERE deleted_at IS NULL AND date >= ? AND date <= ? ${milestonesOnly ? 'AND is_milestone = 1' : ''}
          ORDER BY date, id`,
      )
      .all(from, to) as { id: number; date: string; text: string; is_milestone: number }[]
  ).map(mapAcc);
}

export function createAccomplishment(date: ISODate, text: string, isMilestone: boolean): Accomplishment {
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (!text?.trim()) throw badRequest('Describe what you accomplished');
  const r = db().prepare('INSERT INTO accomplishments (date, text, is_milestone) VALUES (?, ?, ?)').run(date, text.trim(), isMilestone ? 1 : 0);
  return mapAcc(db().prepare('SELECT * FROM accomplishments WHERE id = ?').get(r.lastInsertRowid) as never);
}

export function updateAccomplishment(id: number, patch: { text?: string; isMilestone?: boolean }) {
  const cur = db().prepare('SELECT * FROM accomplishments WHERE id = ?').get(id) as { text: string; is_milestone: number } | undefined;
  if (!cur) throw notFound('Not found');
  db()
    .prepare('UPDATE accomplishments SET text = ?, is_milestone = ? WHERE id = ?')
    .run(patch.text?.trim() || cur.text, patch.isMilestone !== undefined ? (patch.isMilestone ? 1 : 0) : cur.is_milestone, id);
}

// ── Day view ────────────────────────────────────────────────────────────────

export function dayView(date: ISODate, today: ISODate, weekStart: number): DayView {
  if (!isISODate(date)) throw badRequest('Invalid date');
  const d = db().prepare('SELECT rating, journal FROM days WHERE date = ?').get(date) as
    | { rating: Rating | null; journal: string | null }
    | undefined;
  const { sessions, minutes } = listSessions({ from: date, to: date, limit: 200 });
  const income = listIncome(date, date);
  const earned = sessions.reduce((a, s) => a + s.earnedCents, 0) + income.reduce((a, i) => a + i.amountCents, 0);
  const workouts = listWorkouts(date, date).map((w) => ({ ...w, exercises: workoutExerciseNames(w.id) }));
  return {
    date,
    rating: d?.rating ?? null,
    journal: d?.journal ?? null,
    sessions: [...sessions].reverse(),
    income,
    minutes,
    earnedCents: earned,
    workouts,
    prs: listPRs({ from: date, to: date }),
    body: listBody(date, date),
    photoSet: photoSetOnDate(date),
    notes: listNotes(date),
    accomplishments: listAccomplishments(date, date),
    goals: goalsForDay(date, today, weekStart),
    prev: addDays(date, -1),
    next: addDays(date, 1),
  };
}

/** Compact per-day summaries for calendars, grids, and tooltips. */
export function daySummaries(r: Range, today: ISODate): DaySummary[] {
  const series = dailySeries(r);
  const goals = dailyGoalCounts(r, today);
  const workoutNames = new Map<string, { name: string; durationMinutes: number | null }>();
  for (const w of db()
    .prepare('SELECT date, name, duration_minutes FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY id')
    .all(r.start, r.end) as { date: string; name: string; duration_minutes: number | null }[]) {
    if (!workoutNames.has(w.date)) workoutNames.set(w.date, { name: w.name, durationMinutes: w.duration_minutes });
  }
  const setOf = (sql: string) => new Set((db().prepare(sql).all(r.start, r.end) as { date: string }[]).map((x) => x.date));
  const journals = setOf("SELECT date FROM days WHERE journal IS NOT NULL AND journal != '' AND date >= ? AND date <= ?");
  const bodies = setOf('SELECT DISTINCT date FROM body_metrics WHERE deleted_at IS NULL AND date >= ? AND date <= ?');
  const photos = setOf(
    'SELECT ps.date FROM photo_sets ps WHERE ps.deleted_at IS NULL AND ps.date >= ? AND ps.date <= ? AND EXISTS (SELECT 1 FROM photos p WHERE p.set_id = ps.id AND p.deleted_at IS NULL)',
  );
  const notes = new Map(
    (db()
      .prepare(
        `SELECT date, COUNT(*) n FROM (
           SELECT date FROM notes WHERE deleted_at IS NULL AND date >= @start AND date <= @end
           UNION ALL SELECT date FROM accomplishments WHERE deleted_at IS NULL AND date >= @start AND date <= @end)
         GROUP BY date`,
      )
      .all({ start: r.start, end: r.end }) as { date: string; n: number }[]).map((x) => [x.date, x.n]),
  );
  const prs = new Map(
    (db()
      .prepare('SELECT date, COUNT(DISTINCT exercise_id) n FROM personal_records WHERE date >= ? AND date <= ? GROUP BY date')
      .all(r.start, r.end) as { date: string; n: number }[]).map((x) => [x.date, x.n]),
  );
  return series.map((p) => ({
    date: p.date,
    rating: p.rating,
    minutes: p.minutes,
    earnedCents: p.cents,
    workout: workoutNames.get(p.date) ?? null,
    workoutCount: p.workouts,
    prs: prs.get(p.date) ?? 0,
    goalsDone: goals.get(p.date)?.done ?? 0,
    goalsTotal: goals.get(p.date)?.total ?? 0,
    hasJournal: journals.has(p.date),
    hasBody: bodies.has(p.date),
    hasPhotos: photos.has(p.date),
    noteCount: notes.get(p.date) ?? 0,
  }));
}

export function calendarMonth(ym: YearMonth, today: ISODate) {
  return daySummaries(monthRange(ym), today);
}

// ── Ratings: year grid, streaks ─────────────────────────────────────────────

export interface RatingStats {
  good: number;
  okay: number;
  bad: number;
  unrated: number; // past-or-today days without a rating (never future days)
  rated: number;
  pctGood: number | null;
  pctOkay: number | null;
  pctBad: number | null;
  currentStreak: number;
  longestStreak: { length: number; start: ISODate | null; end: ISODate | null };
  bestMonth: { month: YearMonth; good: number } | null;
}

function ratingsMap(r: Range): Map<string, Rating> {
  return new Map(
    (db().prepare('SELECT date, rating FROM days WHERE rating IS NOT NULL AND date >= ? AND date <= ?').all(r.start, r.end) as {
      date: string;
      rating: Rating;
    }[]).map((x) => [x.date, x.rating]),
  );
}

/** Consecutive Good days ending today — or yesterday, since today may not be rated yet. */
export function currentGoodStreak(today: ISODate): number {
  const m = ratingsMap({ start: addDays(today, -800), end: today });
  let d = m.get(today) === 3 ? today : addDays(today, -1);
  if (m.get(today) != null && m.get(today) !== 3) return 0;
  let n = 0;
  while (m.get(d) === 3) {
    n++;
    d = addDays(d, -1);
  }
  return n;
}

export function longestGoodStreak(r: Range): { length: number; start: ISODate | null; end: ISODate | null } {
  const dates = (db()
    .prepare('SELECT date FROM days WHERE rating = 3 AND date >= ? AND date <= ? ORDER BY date')
    .all(r.start, r.end) as { date: string }[]).map((x) => x.date);
  let best = { length: 0, start: null as ISODate | null, end: null as ISODate | null };
  let runStart: ISODate | null = null;
  let prev: ISODate | null = null;
  let len = 0;
  for (const d of dates) {
    if (prev && addDays(prev, 1) === d) len++;
    else {
      len = 1;
      runStart = d;
    }
    if (len > best.length) best = { length: len, start: runStart, end: d };
    prev = d;
  }
  return best;
}

export function ratingStats(r: Range, today: ISODate): RatingStats {
  const counts = db()
    .prepare(
      `SELECT COALESCE(SUM(rating = 3), 0) good, COALESCE(SUM(rating = 2), 0) okay, COALESCE(SUM(rating = 1), 0) bad
         FROM days WHERE rating IS NOT NULL AND date >= ? AND date <= ?`,
    )
    .get(r.start, r.end) as { good: number; okay: number; bad: number };
  const rated = counts.good + counts.okay + counts.bad;
  const elapsedEnd = r.end < today ? r.end : today;
  const elapsed = elapsedEnd >= r.start ? Math.round((Date.parse(elapsedEnd) - Date.parse(r.start)) / 86400000) + 1 : 0;
  const best = db()
    .prepare(
      `SELECT substr(date, 1, 7) month, COUNT(*) good FROM days WHERE rating = 3 AND date >= ? AND date <= ?
        GROUP BY month ORDER BY good DESC, month LIMIT 1`,
    )
    .get(r.start, r.end) as { month: string; good: number } | undefined;
  const pct = (n: number) => (rated ? n / rated : null);
  return {
    ...counts,
    rated,
    unrated: Math.max(0, elapsed - rated),
    pctGood: pct(counts.good),
    pctOkay: pct(counts.okay),
    pctBad: pct(counts.bad),
    currentStreak: currentGoodStreak(today),
    longestStreak: longestGoodStreak(r),
    bestMonth: best ?? null,
  };
}

export function yearGrid(year: number, today: ISODate) {
  const r = yearRange(year);
  return {
    year,
    days: daySummaries(r, today),
    daysInYear: daysInYear(year),
    stats: ratingStats(r, today),
  };
}

/** Every year with any rating or activity, with its compact rating strip. */
export function allYears(today: ISODate) {
  const first = db()
    .prepare(
      `SELECT MIN(d) d FROM (SELECT MIN(date) d FROM days UNION ALL SELECT MIN(date) FROM work_sessions WHERE deleted_at IS NULL
         UNION ALL SELECT MIN(date) FROM workouts WHERE deleted_at IS NULL)`,
    )
    .get() as { d: string | null };
  const startYear = first.d ? Number(first.d.slice(0, 4)) : Number(today.slice(0, 4));
  const endYear = Number(today.slice(0, 4));
  const years = [];
  for (let y = endYear; y >= startYear; y--) {
    const r = yearRange(y);
    const ratings = ratingsMap(r);
    years.push({
      year: y,
      ratings: Object.fromEntries(ratings),
      stats: ratingStats(r, today),
    });
  }
  return years;
}
