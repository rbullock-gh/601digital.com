// Screen time: one number a day (plus optional pickups and categories), copied
// from your phone's own Screen Time report. Lower is better everywhere.

import { db } from '../db/connection.ts';
import { badRequest } from '../lib/errors.ts';
import { getSettings } from './settings.ts';
import { addDays, eachDay, isISODate, weekRange, weekday, type ISODate, type Range } from '../../shared/dates.ts';
import type { ScreenDay } from '../../shared/types.ts';

interface Row {
  date: string;
  minutes: number;
  pickups: number | null;
  categories: string | null;
  notes: string | null;
}

function map(r: Row): ScreenDay {
  let categories: Record<string, number> = {};
  try {
    categories = r.categories ? JSON.parse(r.categories) : {};
  } catch {
    /* keep empty */
  }
  return { date: r.date, minutes: r.minutes, pickups: r.pickups, categories, notes: r.notes };
}

export const SCREEN_CATEGORIES = ['Social', 'Entertainment', 'Productivity', 'Games', 'Reading', 'Messaging', 'Other'];

export function getScreenDay(date: ISODate): ScreenDay | null {
  const r = db().prepare('SELECT * FROM screen_time WHERE date = ?').get(date) as Row | undefined;
  return r ? map(r) : null;
}

export function screenDays(r: Range): ScreenDay[] {
  return (db().prepare('SELECT * FROM screen_time WHERE date >= ? AND date <= ? ORDER BY date').all(r.start, r.end) as Row[]).map(map);
}

export function setScreenDay(date: ISODate, input: { minutes: number; pickups?: number | null; categories?: Record<string, number> | null; notes?: string | null }, today: ISODate) {
  if (!isISODate(date)) throw badRequest('Invalid date');
  if (date > today) throw badRequest('That day hasn’t happened yet');
  const minutes = Math.round(Number(input.minutes));
  if (!Number.isFinite(minutes) || minutes < 0 || minutes > 1440) throw badRequest('Enter between 0 and 24 hours');
  const cats: Record<string, number> = {};
  for (const [k, v] of Object.entries(input.categories ?? {})) {
    const n = Math.round(Number(v));
    if (k.trim() && Number.isFinite(n) && n > 0) cats[k.trim().slice(0, 40)] = Math.min(1440, n);
  }
  db()
    .prepare(
      `INSERT INTO screen_time (date, minutes, pickups, categories, notes, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
       ON CONFLICT(date) DO UPDATE SET minutes = excluded.minutes, pickups = excluded.pickups, categories = excluded.categories,
         notes = excluded.notes, updated_at = excluded.updated_at`,
    )
    .run(date, minutes, input.pickups ?? null, Object.keys(cats).length ? JSON.stringify(cats) : null, input.notes?.trim() || null);
  return getScreenDay(date)!;
}

export function deleteScreenDay(date: ISODate) {
  db().prepare('DELETE FROM screen_time WHERE date = ?').run(date);
}

/** Average daily minutes over the days that were logged in a range. */
export function screenAverage(r: Range): { avg: number | null; logged: number; total: number } {
  const x = db().prepare('SELECT COUNT(*) n, COALESCE(SUM(minutes), 0) t FROM screen_time WHERE date >= ? AND date <= ?').get(r.start, r.end) as { n: number; t: number };
  return { avg: x.n ? x.t / x.n : null, logged: x.n, total: x.t };
}

export function screenSummary(today: ISODate) {
  const s = getSettings();
  const last30 = { start: addDays(today, -29), end: today };
  const prev30 = { start: addDays(today, -59), end: addDays(today, -30) };
  const week = weekRange(today, s.weekStart);
  const lastWeek = { start: addDays(week.start, -7), end: addDays(week.start, -1) };
  const days = screenDays({ start: addDays(today, -89), end: today });
  const byDate = new Map(days.map((d) => [d.date, d]));

  const cats = new Map<string, number>();
  let catDays = 0;
  for (const d of days.filter((x) => x.date >= last30.start)) {
    if (Object.keys(d.categories).length) catDays++;
    for (const [k, v] of Object.entries(d.categories)) cats.set(k, (cats.get(k) ?? 0) + v);
  }

  const weeks: { start: ISODate; avg: number | null; logged: number }[] = [];
  for (let i = 11; i >= 0; i--) {
    const w = weekRange(addDays(today, -7 * i), s.weekStart);
    const a = screenAverage(w);
    weeks.push({ start: w.start, avg: a.avg, logged: a.logged });
  }
  const byWeekday = Array.from({ length: 7 }, () => ({ total: 0, n: 0 }));
  for (const d of days) {
    const wd = weekday(d.date);
    byWeekday[wd].total += d.minutes;
    byWeekday[wd].n++;
  }
  const pickups = days.filter((d) => d.date >= last30.start && d.pickups != null);
  const logged30 = days.filter((d) => d.date >= last30.start);
  const sorted = [...logged30].sort((a, b) => a.minutes - b.minutes);

  return {
    today: byDate.get(today) ?? null,
    yesterday: byDate.get(addDays(today, -1)) ?? null,
    week: screenAverage(week),
    lastWeek: screenAverage(lastWeek),
    last30: screenAverage(last30),
    prev30: screenAverage(prev30),
    daily: eachDay(last30.start, last30.end).map((d) => ({ date: d, minutes: byDate.get(d)?.minutes ?? null })),
    weeks,
    byWeekday: byWeekday.map((x, wd) => ({ wd, avg: x.n ? x.total / x.n : null })),
    categories: [...cats.entries()].map(([name, total]) => ({ name, avg: catDays ? total / catDays : 0 })).sort((a, b) => b.avg - a.avg),
    pickupsAvg: pickups.length ? pickups.reduce((a, d) => a + (d.pickups ?? 0), 0) / pickups.length : null,
    lowest: sorted[0] ?? null,
    highest: sorted[sorted.length - 1] ?? null,
    recent: [...days].reverse().slice(0, 30),
    categoryNames: SCREEN_CATEGORIES,
  };
}
