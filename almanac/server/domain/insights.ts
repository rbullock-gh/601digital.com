// Insights are plain arithmetic over stored records. Each generator returns
// nothing unless there is enough data to support the statement, and every
// relationship between two areas of life is labelled as a correlation.

import { db } from '../db/connection.ts';
import { getSettings } from './settings.ts';
import { strengthChanges } from './fitness.ts';
import { bodyChanges } from './body.ts';
import { currentGoodStreak, longestGoodStreak } from './days.ts';
import { dailySeries, monthlySeries } from './stats.ts';
import {
  addDays,
  addMonths,
  diffDays,
  endOfMonth,
  MONTHS,
  parts,
  startOfMonth,
  WEEKDAYS,
  type ISODate,
} from '../../shared/dates.ts';
import { kgTo, cmTo } from '../../shared/units.ts';
import type { Insight } from '../../shared/types.ts';

interface Fmt {
  money: (cents: number) => string;
  dur: (min: number) => string;
  kg: (kg: number) => string;
  cm: (cm: number) => string;
  pct: (x: number) => string;
  range: (a: ISODate, b: ISODate) => string;
  month: (ym: string) => string;
}

function formatter(): Fmt {
  const s = getSettings();
  const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: s.currency, maximumFractionDigits: 0 });
  const short = (d: ISODate) => `${MONTHS[parts(d).m - 1].slice(0, 3)} ${parts(d).d}`;
  return {
    money: (c) => money.format(c / 100),
    dur: (m) => {
      const h = Math.floor(m / 60);
      const mm = Math.round(m % 60);
      return h ? `${h}h ${String(mm).padStart(2, '0')}m` : `${mm}m`;
    },
    kg: (kg) => `${Math.round(kgTo(kg, s.weightUnit) * 10) / 10} ${s.weightUnit}`,
    cm: (cm) => `${Math.round(cmTo(cm, s.lengthUnit) * 10) / 10} ${s.lengthUnit}`,
    pct: (x) => (Math.abs(x) >= 0.1 ? `${Math.round(x * 100)}%` : `${Math.round(x * 1000) / 10}%`.replace('.0%', '%')),
    range: (a, b) =>
      parts(a).m === parts(b).m ? `${short(a)}–${parts(b).d}` : `${short(a)} – ${short(b)}`,
    month: (ym) => MONTHS[Number(ym.slice(5, 7)) - 1],
  };
}

type Gen = (today: ISODate, f: Fmt) => Insight | Insight[] | null;

const moneyMonthOverMonth: Gen = (today, f) => {
  const last = startOfMonth(addMonths(today, -1));
  const before = startOfMonth(addMonths(today, -2));
  const series = monthlySeries({ start: before, end: endOfMonth(last) });
  const [a, b] = series;
  if (!a || !b || a.cents <= 0 || b.cents <= 0) return null;
  const change = (b.cents - a.cents) / a.cents;
  if (Math.abs(change) < 0.02) return null;
  return {
    id: 'money-mom',
    domain: 'money',
    text: `You earned ${f.pct(Math.abs(change))} ${change > 0 ? 'more' : 'less'} in ${f.month(b.month)} than in ${f.month(a.month)}.`,
    detail: `${f.money(b.cents)} vs ${f.money(a.cents)}`,
    weight: 8,
  };
};

const moneyPace: Gen = (today, f) => {
  const start = startOfMonth(today);
  const elapsed = diffDays(start, today) + 1;
  if (elapsed < 5) return null;
  const prevStart = startOfMonth(addMonths(today, -1));
  const cur = monthlySeries({ start, end: today })[0];
  const prevEnd = addDays(prevStart, elapsed - 1);
  const prev = (db().prepare('SELECT COALESCE(SUM(cents), 0) c FROM earnings WHERE date >= ? AND date <= ?').get(prevStart, prevEnd) as { c: number }).c;
  if (!cur || prev <= 0 || cur.cents <= 0) return null;
  const change = (cur.cents - prev) / prev;
  if (Math.abs(change) < 0.05) return null;
  return {
    id: 'money-pace',
    domain: 'money',
    text: `This month is running ${f.pct(Math.abs(change))} ${change > 0 ? 'ahead of' : 'behind'} last month at the same point.`,
    detail: `${f.money(cur.cents)} in ${elapsed} days vs ${f.money(prev)}`,
    weight: 9,
  };
};

const bestWeekday: Gen = (today, f) => {
  const from = addDays(today, -90);
  const days = dailySeries({ start: from, end: addDays(today, -1) });
  const sums = Array(7).fill(0);
  const counts = Array(7).fill(0);
  for (const d of days) {
    const wd = new Date(d.date + 'T00:00:00Z').getUTCDay();
    sums[wd] += d.minutes;
    counts[wd]++;
  }
  const total = sums.reduce((a, b) => a + b, 0);
  if (total < 60 * 20) return null;
  let best = 0;
  for (let i = 1; i < 7; i++) if (sums[i] / counts[i] > sums[best] / counts[best]) best = i;
  return {
    id: 'work-weekday',
    domain: 'work',
    text: `${WEEKDAYS[best]} has been your most productive day.`,
    detail: `${f.dur(sums[best] / counts[best])} of work on an average ${WEEKDAYS[best]}, last 90 days`,
    weight: 6,
  };
};

const avgSession: Gen = (_today, f) => {
  const r = db().prepare('SELECT COUNT(*) n, AVG(minutes) avg FROM work_sessions WHERE deleted_at IS NULL').get() as { n: number; avg: number | null };
  if (r.n < 10 || !r.avg) return null;
  return {
    id: 'work-session',
    domain: 'work',
    text: `Your average work session is ${f.dur(r.avg)}.`,
    detail: `Across ${r.n.toLocaleString()} sessions`,
    weight: 3,
  };
};

const daysWorked: Gen = (today) => {
  const r = db()
    .prepare('SELECT COUNT(DISTINCT date) n FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?')
    .get(startOfMonth(today), today) as { n: number };
  if (r.n < 3) return null;
  return {
    id: 'work-days',
    domain: 'work',
    text: `You've worked ${r.n} days this month.`,
    detail: `Out of ${diffDays(startOfMonth(today), today) + 1} so far`,
    weight: 4,
  };
};

const bestWeek: Gen = (_today, f) => {
  const s = getSettings();
  const weekExpr =
    s.weekStart === 1
      ? "date(date, '-' || ((CAST(strftime('%w', date) AS INTEGER) + 6) % 7) || ' days')"
      : "date(date, '-' || CAST(strftime('%w', date) AS INTEGER) || ' days')";
  const rows = db()
    .prepare(`SELECT ${weekExpr} AS start, SUM(cents) cents FROM earnings GROUP BY start ORDER BY cents DESC LIMIT 2`)
    .all() as { start: string; cents: number }[];
  const weeks = (db().prepare(`SELECT COUNT(DISTINCT ${weekExpr}) n FROM earnings`).get() as { n: number }).n;
  if (!rows.length || weeks < 6) return null;
  return {
    id: 'money-best-week',
    domain: 'money',
    text: `Your highest earning week was ${f.range(rows[0].start, addDays(rows[0].start, 6))}${parts(rows[0].start).y !== parts(_today).y ? `, ${parts(rows[0].start).y}` : ''}.`,
    detail: `${f.money(rows[0].cents)} earned`,
    weight: 5,
  };
};

const topProjectShare: Gen = (today, f) => {
  const start = startOfMonth(today);
  const rows = db()
    .prepare(
      `SELECT p.name, SUM(w.minutes) m FROM work_sessions w JOIN projects p ON p.id = w.project_id
        WHERE w.deleted_at IS NULL AND w.date >= ? AND w.date <= ? GROUP BY p.id ORDER BY m DESC`,
    )
    .all(start, today) as { name: string; m: number }[];
  const total = (db().prepare('SELECT COALESCE(SUM(minutes), 0) m FROM work_sessions WHERE deleted_at IS NULL AND date >= ? AND date <= ?').get(start, today) as { m: number }).m;
  if (rows.length < 2 || total < 600) return null;
  const share = rows[0].m / total;
  return {
    id: 'work-project-share',
    domain: 'work',
    text: `${rows[0].name} has taken ${f.pct(share)} of your working hours this month.`,
    detail: `${f.dur(rows[0].m)} of ${f.dur(total)}`,
    weight: 4,
  };
};

const strength3m: Gen = (today, f) => {
  const ch = strengthChanges(addMonths(today, -3), today, 3, 'pct').filter((c) => c.pct > 0.01);
  return ch.slice(0, 2).map((c, i) => ({
    id: `fit-strength-${c.id}`,
    domain: 'fitness' as const,
    text: `Your ${c.name.toLowerCase()} estimated max increased ${f.pct(c.pct)} over the last 3 months.`,
    detail: `${f.kg(c.startE1rm)} → ${f.kg(c.endE1rm)} estimated 1RM`,
    weight: 8 - i,
  }));
};

const strengthYear: Gen = (today, f) => {
  const jan = `${parts(today).y}-01-01`;
  if (diffDays(jan, today) < 60) return null;
  const rows = db()
    .prepare(
      `SELECT e.id, e.name,
              (SELECT MAX(s.weight_kg) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workouts w ON w.id = we.workout_id
                WHERE we.exercise_id = e.id AND w.deleted_at IS NULL AND s.is_warmup = 0 AND w.date >= @jan AND w.date < date(@jan, '+31 days')) AS start,
              (SELECT MAX(s.weight_kg) FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workouts w ON w.id = we.workout_id
                WHERE we.exercise_id = e.id AND w.deleted_at IS NULL AND s.is_warmup = 0 AND w.date >= @jan AND w.date <= @today) AS best
         FROM exercises e`,
    )
    .all({ jan, today }) as { id: number; name: string; start: number | null; best: number | null }[];
  const best = rows.filter((r) => r.start && r.best && r.best - r.start > 1).sort((a, b) => b.best! - b.start! - (a.best! - a.start!))[0];
  if (!best) return null;
  return {
    id: 'fit-year-add',
    domain: 'fitness',
    text: `You've added ${f.kg(best.best! - best.start!)} to your ${best.name.toLowerCase()} since January.`,
    detail: `Top set ${f.kg(best.start!)} → ${f.kg(best.best!)}`,
    weight: 7,
  };
};

const workoutsMonth: Gen = (today) => {
  const start = startOfMonth(today);
  const elapsed = diffDays(start, today) + 1;
  const prevStart = startOfMonth(addMonths(today, -1));
  const count = (a: ISODate, b: ISODate) =>
    (db().prepare('SELECT COUNT(*) n FROM workouts WHERE deleted_at IS NULL AND date >= ? AND date <= ?').get(a, b) as { n: number }).n;
  const cur = count(start, today);
  const prev = count(prevStart, addDays(prevStart, elapsed - 1));
  if (elapsed < 7 || (cur < 3 && prev < 3) || cur === prev) return null;
  return {
    id: 'fit-month',
    domain: 'fitness',
    text: `${cur} workouts so far this month — ${Math.abs(cur - prev)} ${cur > prev ? 'more' : 'fewer'} than at this point last month.`,
    weight: 4,
  };
};

const weightTrend: Gen = (today, f) => {
  const c = bodyChanges(addMonths(today, -3), today);
  const out: Insight[] = [];
  const w = c.find((x) => x.field === 'weightKg');
  if (w?.change != null && w.from && Math.abs(w.change) >= 0.4 && diffDays(w.from.date, w.to!.date) >= 30)
    out.push({
      id: 'body-weight',
      domain: 'body',
      text: `Your weight has ${w.change < 0 ? 'dropped' : 'risen'} ${f.kg(Math.abs(w.change))} since ${MONTHS[parts(w.from.date).m - 1]}.`,
      detail: `${f.kg(w.from.value)} → ${f.kg(w.to!.value)}`,
      weight: 6,
    });
  const waist = c.find((x) => x.field === 'waistCm');
  if (waist?.change != null && waist.from && Math.abs(waist.change) >= 0.5)
    out.push({
      id: 'body-waist',
      domain: 'body',
      text: `Your waist measures ${f.cm(Math.abs(waist.change))} ${waist.change < 0 ? 'smaller' : 'larger'} than in ${MONTHS[parts(waist.from.date).m - 1]}.`,
      detail: `${f.cm(waist.from.value)} → ${f.cm(waist.to!.value)}`,
      weight: 5,
    });
  return out;
};

const last30Good: Gen = (today) => {
  const r = db()
    .prepare('SELECT COUNT(*) rated, COALESCE(SUM(rating = 3), 0) good FROM days WHERE rating IS NOT NULL AND date > ? AND date <= ?')
    .get(addDays(today, -30), today) as { rated: number; good: number };
  if (r.rated < 10) return null;
  return {
    id: 'life-30',
    domain: 'life',
    text: `You rated ${r.good} of the last 30 days as Good.`,
    detail: `${r.rated} of 30 days rated`,
    weight: 7,
  };
};

const bestGoodMonth: Gen = (today, f) => {
  const rows = db()
    .prepare(
      `SELECT substr(date, 1, 7) month, COUNT(*) rated, SUM(rating = 3) good FROM days
        WHERE rating IS NOT NULL AND date >= ? AND date <= ? GROUP BY month HAVING rated >= 10`,
    )
    .all(`${parts(today).y}-01-01`, today) as { month: string; rated: number; good: number }[];
  if (rows.length < 3) return null;
  const best = rows.sort((a, b) => b.good / b.rated - a.good / a.rated)[0];
  return {
    id: 'life-best-month',
    domain: 'life',
    text: `Your highest share of Good days this year was in ${f.month(best.month)}.`,
    detail: `${f.pct(best.good / best.rated)} Good (${best.good} of ${best.rated} rated days)`,
    weight: 5,
  };
};

const streaks: Gen = (today) => {
  const cur = currentGoodStreak(today);
  const longest = longestGoodStreak({ start: '0000-01-01', end: today });
  if (cur >= 3)
    return {
      id: 'life-streak',
      domain: 'life',
      text: `${cur} Good days in a row${cur === longest.length ? ' — your longest run yet' : ''}.`,
      detail: cur < longest.length ? `Longest: ${longest.length} days` : undefined,
      weight: 9,
    };
  return null;
};

// ── Relationships (correlations, never causes) ──────────────────────────────

function ratedDays(today: ISODate) {
  const from = addDays(today, -365);
  return db()
    .prepare(
      `SELECT d.date, d.rating,
              EXISTS (SELECT 1 FROM workouts w WHERE w.date = d.date AND w.deleted_at IS NULL) AS worked_out,
              COALESCE((SELECT SUM(minutes) FROM work_sessions ws WHERE ws.date = d.date AND ws.deleted_at IS NULL), 0) AS minutes
         FROM days d WHERE d.rating IS NOT NULL AND d.date > ? AND d.date <= ?`,
    )
    .all(from, today) as { date: string; rating: number; worked_out: number; minutes: number }[];
}

const workoutGood: Gen = (today, f) => {
  const days = ratedDays(today);
  const w = days.filter((d) => d.worked_out);
  const n = days.filter((d) => !d.worked_out);
  if (w.length < 10 || n.length < 10) return null;
  const pw = w.filter((d) => d.rating === 3).length / w.length;
  const pn = n.filter((d) => d.rating === 3).length / n.length;
  if (Math.abs(pw - pn) < 0.05) return null;
  return {
    id: 'link-workout-good',
    domain: 'links',
    correlation: true,
    text: `${f.pct(pw)} of days when you worked out were rated Good, compared with ${f.pct(pn)} of days you didn't.`,
    detail: `${w.length} workout days, ${n.length} rest days, last 12 months`,
    weight: 9,
  };
};

const workByRating: Gen = (today, f) => {
  const days = ratedDays(today);
  const good = days.filter((d) => d.rating === 3);
  const bad = days.filter((d) => d.rating === 1);
  if (good.length < 5 || bad.length < 5) return null;
  const avg = (xs: typeof days) => xs.reduce((a, b) => a + b.minutes, 0) / xs.length;
  return {
    id: 'link-work-rating',
    domain: 'links',
    correlation: true,
    text: `On Good days you averaged ${f.dur(avg(good))} of work; on Bad days, ${f.dur(avg(bad))}.`,
    detail: `${good.length} Good and ${bad.length} Bad days, last 12 months`,
    weight: 8,
  };
};

const workedGood: Gen = (today, f) => {
  const days = ratedDays(today);
  const w = days.filter((d) => d.minutes > 0);
  const n = days.filter((d) => d.minutes === 0);
  if (w.length < 10 || n.length < 10) return null;
  const pw = w.filter((d) => d.rating === 3).length / w.length;
  const pn = n.filter((d) => d.rating === 3).length / n.length;
  if (Math.abs(pw - pn) < 0.08) return null;
  return {
    id: 'link-worked-good',
    domain: 'links',
    correlation: true,
    text: `Days you logged work were rated Good ${f.pct(pw)} of the time, versus ${f.pct(pn)} on days off.`,
    detail: `${w.length} work days, ${n.length} days off`,
    weight: 5,
  };
};

const busyMonthsGood: Gen = (today, f) => {
  const rows = db()
    .prepare(
      `SELECT m.month, m.rated, m.good, COALESCE(w.n, 0) workouts FROM
         (SELECT substr(date, 1, 7) month, COUNT(*) rated, SUM(rating = 3) good FROM days WHERE rating IS NOT NULL AND date <= ? GROUP BY month HAVING rated >= 15) m
         LEFT JOIN (SELECT substr(date, 1, 7) month, COUNT(*) n FROM workouts WHERE deleted_at IS NULL GROUP BY month) w ON w.month = m.month`,
    )
    .all(today) as { month: string; rated: number; good: number; workouts: number }[];
  const hi = rows.filter((r) => r.workouts >= 12);
  const lo = rows.filter((r) => r.workouts < 12);
  if (hi.length < 2 || lo.length < 2) return null;
  const p = (xs: typeof rows) => xs.reduce((a, b) => a + b.good, 0) / xs.reduce((a, b) => a + b.rated, 0);
  const ph = p(hi);
  const pl = p(lo);
  if (Math.abs(ph - pl) < 0.05) return null;
  return {
    id: 'link-busy-months',
    domain: 'links',
    correlation: true,
    text: `Months with 12 or more workouts had ${ph > pl ? 'a higher' : 'a lower'} share of Good days: ${f.pct(ph)} vs ${f.pct(pl)}.`,
    detail: `${hi.length} months with 12+ workouts, ${lo.length} with fewer`,
    weight: 6,
  };
};

const GENERATORS: Gen[] = [
  moneyPace, moneyMonthOverMonth, bestWeek, bestWeekday, avgSession, daysWorked, topProjectShare,
  strength3m, strengthYear, workoutsMonth, weightTrend, last30Good, bestGoodMonth, streaks,
  workoutGood, workByRating, workedGood, busyMonthsGood,
];

export function insights(today: ISODate): Insight[] {
  const f = formatter();
  const out: Insight[] = [];
  for (const g of GENERATORS) {
    try {
      const r = g(today, f);
      if (Array.isArray(r)) out.push(...r);
      else if (r) out.push(r);
    } catch (e) {
      console.error('insight failed', e);
    }
  }
  return out.sort((a, b) => b.weight - a.weight);
}
