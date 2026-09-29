// Calendar-date helpers shared by server and client.
//
// Every date in Almanac is a local calendar date string, 'YYYY-MM-DD'. Math is
// done on integer day numbers (days since 1970-01-01, UTC) so daylight-saving
// transitions and time zones can never shift a day.

export type ISODate = string; // 'YYYY-MM-DD'
export type YearMonth = string; // 'YYYY-MM'

export interface Range {
  start: ISODate;
  end: ISODate; // inclusive
}

export const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];
export const MONTHS_SHORT = MONTHS.map((m) => m.slice(0, 3));
export const WEEKDAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export const WEEKDAYS_SHORT = WEEKDAYS.map((d) => d.slice(0, 3));

const MS_DAY = 86_400_000;

export function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function isISODate(s: unknown): s is ISODate {
  return typeof s === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(toDayNum(s));
}

export function isYearMonth(s: unknown): s is YearMonth {
  return typeof s === 'string' && /^\d{4}-(0[1-9]|1[0-2])$/.test(s);
}

export function parts(d: ISODate): { y: number; m: number; d: number } {
  return { y: Number(d.slice(0, 4)), m: Number(d.slice(5, 7)), d: Number(d.slice(8, 10)) };
}

export function make(y: number, m: number, d: number): ISODate {
  return `${String(y).padStart(4, '0')}-${pad2(m)}-${pad2(d)}`;
}

export function toDayNum(d: ISODate): number {
  const p = parts(d);
  return Math.floor(Date.UTC(p.y, p.m - 1, p.d) / MS_DAY);
}

export function fromDayNum(n: number): ISODate {
  const dt = new Date(n * MS_DAY);
  return make(dt.getUTCFullYear(), dt.getUTCMonth() + 1, dt.getUTCDate());
}

export function addDays(d: ISODate, n: number): ISODate {
  return fromDayNum(toDayNum(d) + n);
}

/** b − a in days. */
export function diffDays(a: ISODate, b: ISODate): number {
  return toDayNum(b) - toDayNum(a);
}

/** 0 = Sunday … 6 = Saturday */
export function weekday(d: ISODate): number {
  return (((toDayNum(d) + 4) % 7) + 7) % 7; // 1970-01-01 was a Thursday
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0;
}

export function daysInYear(y: number): number {
  return isLeapYear(y) ? 366 : 365;
}

export function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

export function monthKey(d: ISODate): YearMonth {
  return d.slice(0, 7);
}

export function yearOf(d: ISODate): number {
  return Number(d.slice(0, 4));
}

export function startOfMonth(d: ISODate): ISODate {
  return `${d.slice(0, 7)}-01`;
}

export function endOfMonth(d: ISODate): ISODate {
  const p = parts(d);
  return make(p.y, p.m, daysInMonth(p.y, p.m));
}

export function monthRange(ym: YearMonth): Range {
  const start = `${ym}-01`;
  return { start, end: endOfMonth(start) };
}

export function addMonths(d: ISODate, n: number): ISODate {
  const p = parts(d);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return make(y, m, Math.min(p.d, daysInMonth(y, m)));
}

export function addMonthsYM(ym: YearMonth, n: number): YearMonth {
  return monthKey(addMonths(`${ym}-01`, n));
}

export function startOfWeek(d: ISODate, weekStart: number): ISODate {
  const off = (weekday(d) - weekStart + 7) % 7;
  return addDays(d, -off);
}

export function weekRange(d: ISODate, weekStart: number): Range {
  const start = startOfWeek(d, weekStart);
  return { start, end: addDays(start, 6) };
}

export function yearRange(y: number): Range {
  return { start: make(y, 1, 1), end: make(y, 12, 31) };
}

export function eachDay(start: ISODate, end: ISODate): ISODate[] {
  const out: ISODate[] = [];
  const a = toDayNum(start);
  const b = toDayNum(end);
  for (let n = a; n <= b; n++) out.push(fromDayNum(n));
  return out;
}

export function eachMonth(start: YearMonth, end: YearMonth): YearMonth[] {
  const out: YearMonth[] = [];
  let cur = start;
  while (cur <= end) {
    out.push(cur);
    cur = addMonthsYM(cur, 1);
  }
  return out;
}

export function minDate(a: ISODate, b: ISODate): ISODate {
  return a < b ? a : b;
}
export function maxDate(a: ISODate, b: ISODate): ISODate {
  return a > b ? a : b;
}

export function clampRange(r: Range, to: Range): Range | null {
  const start = maxDate(r.start, to.start);
  const end = minDate(r.end, to.end);
  return start <= end ? { start, end } : null;
}

export function rangeDays(r: Range): number {
  return diffDays(r.start, r.end) + 1;
}

/** The range immediately before `r`, of the same length. */
export function previousRange(r: Range): Range {
  const len = rangeDays(r);
  return { start: addDays(r.start, -len), end: addDays(r.start, -1) };
}

/** Local calendar date for a JS Date (in the runtime's time zone). */
export function localDate(dt: Date = new Date()): ISODate {
  return make(dt.getFullYear(), dt.getMonth() + 1, dt.getDate());
}

export function localTime(dt: Date = new Date()): string {
  return `${pad2(dt.getHours())}:${pad2(dt.getMinutes())}`;
}

// ── Clock times ('HH:MM') ────────────────────────────────────────────────────

export function isClock(s: unknown): s is string {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

export function clockToMinutes(t: string): number {
  return Number(t.slice(0, 2)) * 60 + Number(t.slice(3, 5));
}

export function minutesToClock(min: number): string {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${pad2(Math.floor(m / 60))}:${pad2(m % 60)}`;
}

/** Minutes between two clock times; an end before the start crosses midnight. */
export function spanMinutes(start: string, end: string): number {
  let diff = clockToMinutes(end) - clockToMinutes(start);
  if (diff <= 0) diff += 1440;
  return diff;
}

// ── Named periods ────────────────────────────────────────────────────────────

export type PeriodKind = 'day' | 'week' | 'month' | 'year';

export function periodRange(kind: PeriodKind, d: ISODate, weekStart: number): Range {
  switch (kind) {
    case 'day':
      return { start: d, end: d };
    case 'week':
      return weekRange(d, weekStart);
    case 'month':
      return { start: startOfMonth(d), end: endOfMonth(d) };
    case 'year':
      return yearRange(yearOf(d));
  }
}

export function shiftPeriod(kind: PeriodKind, d: ISODate, n: number): ISODate {
  switch (kind) {
    case 'day':
      return addDays(d, n);
    case 'week':
      return addDays(d, n * 7);
    case 'month':
      return addMonths(d, n);
    case 'year':
      return addMonths(d, n * 12);
  }
}
