import { MONTHS, MONTHS_SHORT, WEEKDAYS, WEEKDAYS_SHORT, clockToMinutes, parts, type ISODate } from '../../shared/dates.ts';
import { cmTo, kgTo, toCm, toKg } from '../../shared/units.ts';
import type { Settings } from '../../shared/types.ts';

// Formatting reads the current settings from this module-level reference,
// set once the bootstrap payload arrives (and whenever settings change).
let S: Settings = {
  name: '',
  defaultRateCents: 3000,
  currency: 'USD',
  weekStart: 1,
  dateFormat: 'MDY',
  timeFormat: '12',
  weightUnit: 'lb',
  lengthUnit: 'in',
  photoDay: 1,
  photoSnoozeUntil: null,
  photoDismissedMonth: null,
  onboarded: true,
  weeklyWorkoutTarget: 4,
};
export function setFormatSettings(s: Settings) {
  S = s;
  moneyFmt = null;
}
export function fmtSettings() {
  return S;
}

let moneyFmt: { whole: Intl.NumberFormat; cents: Intl.NumberFormat; compact: Intl.NumberFormat } | null = null;
function mf() {
  if (!moneyFmt) {
    const c = S.currency;
    moneyFmt = {
      whole: new Intl.NumberFormat(undefined, { style: 'currency', currency: c, maximumFractionDigits: 0, minimumFractionDigits: 0 }),
      cents: new Intl.NumberFormat(undefined, { style: 'currency', currency: c, minimumFractionDigits: 2, maximumFractionDigits: 2 }),
      compact: new Intl.NumberFormat(undefined, { style: 'currency', currency: c, notation: 'compact', maximumFractionDigits: 1 }),
    };
  }
  return moneyFmt;
}

/** $1,240 — cents shown only when they matter. */
export function money(cents: number | null | undefined, opts: { cents?: boolean; compact?: boolean } = {}): string {
  if (cents == null) return '—';
  const v = cents / 100;
  if (opts.compact && Math.abs(v) >= 10000) return mf().compact.format(v);
  if (opts.cents || (Math.abs(v) < 100 && cents % 100 !== 0)) return mf().cents.format(v);
  return mf().whole.format(Math.round(v));
}

export function currencySymbol(): string {
  return (
    new Intl.NumberFormat(undefined, { style: 'currency', currency: S.currency, maximumFractionDigits: 0 })
      .formatToParts(0)
      .find((p) => p.type === 'currency')?.value ?? '$'
  );
}

/** 4h 32m */
export function duration(min: number | null | undefined, opts: { short?: boolean } = {}): string {
  if (min == null) return '—';
  const m = Math.round(min);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  if (opts.short && !r) return `${h}h`;
  return `${h}h ${String(r).padStart(2, '0')}m`;
}

/** 4.5 */
export function hours(min: number, digits = 1): string {
  const v = min / 60;
  return v.toFixed(v >= 100 ? 0 : digits).replace(/\.0$/, '');
}

export function pct(x: number | null | undefined, digits = 0): string {
  if (x == null || !Number.isFinite(x)) return '—';
  return `${(x * 100).toFixed(digits)}%`;
}

export function num(n: number, digits = 0): string {
  return n.toLocaleString(undefined, { maximumFractionDigits: digits, minimumFractionDigits: 0 });
}

// ── Dates ────────────────────────────────────────────────────────────────────

const wd = (d: ISODate) => new Date(`${d}T12:00:00Z`).getUTCDay();

/** Tuesday, September 23 */
export function longDate(d: ISODate, withYear = false): string {
  const p = parts(d);
  return `${WEEKDAYS[wd(d)]}, ${MONTHS[p.m - 1]} ${p.d}${withYear ? `, ${p.y}` : ''}`;
}

/** Sep 23 · Sep 23, 2025 (year shown when not the current year) */
export function shortDate(d: ISODate, forceYear = false): string {
  const p = parts(d);
  const nowY = new Date().getFullYear();
  if (S.dateFormat === 'DMY') return `${p.d} ${MONTHS_SHORT[p.m - 1]}${forceYear || p.y !== nowY ? ` ${p.y}` : ''}`;
  if (S.dateFormat === 'YMD') return `${forceYear || p.y !== nowY ? `${p.y} ` : ''}${MONTHS_SHORT[p.m - 1]} ${p.d}`;
  return `${MONTHS_SHORT[p.m - 1]} ${p.d}${forceYear || p.y !== nowY ? `, ${p.y}` : ''}`;
}

/** Tue, Sep 23 */
export function dayDate(d: ISODate): string {
  return `${WEEKDAYS_SHORT[wd(d)]}, ${shortDate(d)}`;
}

/** 09/23/2026 in the user's order */
export function numericDate(d: ISODate): string {
  const p = parts(d);
  const mm = String(p.m).padStart(2, '0');
  const dd = String(p.d).padStart(2, '0');
  if (S.dateFormat === 'DMY') return `${dd}/${mm}/${p.y}`;
  if (S.dateFormat === 'YMD') return `${p.y}-${mm}-${dd}`;
  return `${mm}/${dd}/${p.y}`;
}

export function monthName(ym: string, short = false): string {
  const m = Number(ym.slice(5, 7)) - 1;
  return short ? MONTHS_SHORT[m] : MONTHS[m];
}
export function monthYear(ym: string, short = false): string {
  return `${monthName(ym, short)} ${ym.slice(0, 4)}`;
}

export function dateRange(a: ISODate, b: ISODate): string {
  if (a === b) return shortDate(a);
  const pa = parts(a);
  const pb = parts(b);
  if (pa.y === pb.y && pa.m === pb.m) return `${MONTHS_SHORT[pa.m - 1]} ${pa.d}–${pb.d}${pa.y !== new Date().getFullYear() ? `, ${pa.y}` : ''}`;
  if (pa.y === pb.y) return `${MONTHS_SHORT[pa.m - 1]} ${pa.d} – ${MONTHS_SHORT[pb.m - 1]} ${pb.d}${pa.y !== new Date().getFullYear() ? `, ${pa.y}` : ''}`;
  return `${shortDate(a, true)} – ${shortDate(b, true)}`;
}

/** 2:30 PM / 14:30 */
export function clock(t: string | null | undefined): string {
  if (!t) return '';
  if (S.timeFormat === '24') return t;
  const m = clockToMinutes(t);
  const h = Math.floor(m / 60);
  const mm = String(m % 60).padStart(2, '0');
  return `${h % 12 === 0 ? 12 : h % 12}:${mm} ${h < 12 ? 'AM' : 'PM'}`;
}

export function greeting(hour = new Date().getHours()): string {
  if (hour < 5) return 'Good evening';
  if (hour < 12) return 'Good morning';
  if (hour < 17) return 'Good afternoon';
  return 'Good evening';
}

// ── Units ────────────────────────────────────────────────────────────────────

export function wUnit() {
  return S.weightUnit;
}
export function lUnit() {
  return S.lengthUnit;
}
/** kg → display number (rounded to 0.1) */
export function wVal(kg: number | null | undefined): number | null {
  if (kg == null) return null;
  return Math.round(kgTo(kg, S.weightUnit) * 10) / 10;
}
export function wFromDisplay(v: number): number {
  return toKg(v, S.weightUnit);
}
export function lVal(cm: number | null | undefined): number | null {
  if (cm == null) return null;
  return Math.round(cmTo(cm, S.lengthUnit) * 100) / 100;
}
export function lFromDisplay(v: number): number {
  return toCm(v, S.lengthUnit);
}
/** 185 lb */
export function weight(kg: number | null | undefined, opts: { unit?: boolean; signed?: boolean } = {}): string {
  const v = wVal(kg);
  if (v == null) return '—';
  const s = `${opts.signed && v > 0 ? '+' : ''}${num(v, 1)}`;
  return opts.unit === false ? s : `${s} ${S.weightUnit}`;
}
export function length(cm: number | null | undefined, opts: { unit?: boolean; signed?: boolean } = {}): string {
  if (cm == null) return '—';
  const v = Math.round(cmTo(cm, S.lengthUnit) * 100) / 100;
  const s = `${opts.signed && v > 0 ? '+' : ''}${num(v, 2)}`;
  return opts.unit === false ? s : `${s} ${S.lengthUnit}`;
}

export function plural(n: number, word: string, pluralWord?: string): string {
  return `${num(n)} ${n === 1 ? word : pluralWord ?? `${word}s`}`;
}

export const RATING_LABEL = { 3: 'Good', 2: 'Okay', 1: 'Bad' } as const;
export const RATING_LONG = { 3: 'Good day', 2: 'Okay day', 1: 'Bad day' } as const;
