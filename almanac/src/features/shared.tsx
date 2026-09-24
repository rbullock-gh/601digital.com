// Pieces shared across screens: goal rows, PR lines, the photo reminder, week strips.

import { Link, useNavigate } from 'react-router-dom';
import { Camera, Check, Circle, Clock, Trophy, X } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { dayDate, duration, hours, length, money, monthName, num, shortDate, weight, wVal, wUnit } from '../lib/format.ts';
import { Meter } from '../components/ui/primitives.tsx';
import { addDays, WEEKDAYS_SHORT, type ISODate } from '../../shared/dates.ts';
import type { GoalProgress, PR } from '../../shared/types.ts';
import type { DayPoint } from './types.ts';

// ── Goals ────────────────────────────────────────────────────────────────────

export function goalValue(g: Pick<GoalProgress, 'metric'>, v: number): string {
  switch (g.metric) {
    case 'earnings':
      return money(v);
    case 'hours':
    case 'gym_hours':
      return `${hours(v)}h`;
    case 'weight':
    case 'exercise_weight':
    case 'exercise_e1rm':
      return weight(v);
    case 'waist':
      return length(v);
    case 'screen_time':
      return duration(v);
    default:
      return num(v, 1);
  }
}

const PERIOD_LABEL: Record<string, string> = { day: 'Today', week: 'This week', month: 'This month', year: 'This year', custom: 'Custom', target: 'Target' };

/** "current / target", "current → target" for levels, "avg · under target" for limits. */
export function goalNumbers(g: GoalProgress): [string, string] {
  if (g.metric === 'screen_time') return [g.current ? `${goalValue(g, g.current)} avg` : 'No data', ` · under ${goalValue(g, g.target)}`];
  const level = ['weight', 'waist', 'exercise_weight', 'exercise_e1rm'].includes(g.metric);
  return [goalValue(g, g.current), `${level ? ' → ' : ' / '}${goalValue(g, g.target)}`];
}

export function goalPeriodLabel(g: GoalProgress): string {
  if (g.period === 'target') return g.endDate ? `By ${shortDate(g.endDate)}` : 'Target';
  if (g.period === 'custom') return `${shortDate(g.startDate!)} – ${shortDate(g.endDate!)}`;
  if (!g.recurring) return `${PERIOD_LABEL[g.period]} only`;
  return PERIOD_LABEL[g.period];
}

export function GoalRow({ g, compact }: { g: GoalProgress; compact?: boolean }) {
  const ui = useUI();
  const boot = useBoot();
  const manualDaily = g.metric === 'manual' && g.period === 'day';
  const toggle = async () => {
    try {
      await api.post(`/goals/${g.id}/checkin`, { date: boot.today, value: null });
      await refreshAll();
    } catch (e) {
      ui.error(e);
    }
  };
  const add = async () => {
    try {
      await api.post(`/goals/${g.id}/checkin`, { date: boot.today, value: 1 });
      await refreshAll();
      ui.toast(`+1 · ${g.title}`);
    } catch (e) {
      ui.error(e);
    }
  };
  return (
    <div className={`goal-row ${g.done ? 'done' : ''} ${compact ? 'compact' : ''}`} id={`goal-${g.id}`}>
      <div className="goal-top">
        {manualDaily ? (
          <button className={`goal-check ${g.done ? 'on' : ''}`} onClick={toggle} aria-pressed={g.done} aria-label={`Mark “${g.title}” ${g.done ? 'not done' : 'done'}`}>
            {g.done ? <Check /> : null}
          </button>
        ) : g.done ? (
          <span className="goal-check on" aria-hidden>
            <Check />
          </span>
        ) : null}
        <span className="goal-title truncate">{g.title}</span>
        {!compact && <span className="goal-period">{goalPeriodLabel(g)}</span>}
        <span className="goal-num num">
          {manualDaily ? (g.done ? 'Done' : '') : goalNumbers(g).join('')}
        </span>
        {g.metric === 'manual' && !manualDaily && (
          <button className="btn btn-ghost btn-sm" onClick={add} aria-label="Add one">
            +1
          </button>
        )}
      </div>
      {!manualDaily && <Meter value={g.pct} done={g.done} thin={compact} label={g.title} />}
    </div>
  );
}

// ── PRs ──────────────────────────────────────────────────────────────────────

export function prText(p: PR): { kind: string; value: string } {
  if (p.type === 'weight') return { kind: 'New PR', value: `${wVal(p.weightKg)} × ${p.reps}` };
  if (p.type === 'reps') return { kind: 'Rep PR', value: `${wVal(p.weightKg) ?? 'BW'} × ${p.reps}` };
  return { kind: 'Est. 1RM', value: `${wVal(p.value)} ${wUnit()}` };
}

export function prDelta(p: PR): string | null {
  if (p.previousValue == null) return null;
  if (p.type === 'reps') return `+${p.value - p.previousValue} reps`;
  const d = (wVal(p.value) ?? 0) - (wVal(p.previousValue) ?? 0);
  return `+${Math.round(d * 10) / 10} ${wUnit()}`;
}

/** One line per exercise per workout: the most impressive PR type leads. */
export function groupPRs(prs: PR[]): { key: string; lead: PR; others: PR[] }[] {
  const order = { weight: 0, e1rm: 1, reps: 2 } as const;
  const map = new Map<string, PR[]>();
  for (const p of prs) {
    const k = `${p.workoutId}-${p.exerciseId}`;
    map.set(k, [...(map.get(k) ?? []), p]);
  }
  return [...map.entries()].map(([key, ps]) => {
    const s = [...ps].sort((a, b) => order[a.type] - order[b.type]);
    return { key, lead: s[0], others: s.slice(1) };
  });
}

export function PRLine({ lead, others, showDate = true }: { lead: PR; others?: PR[]; showDate?: boolean }) {
  const t = prText(lead);
  const delta = prDelta(lead);
  return (
    <Link to={`/gym/exercises/${lead.exerciseId}`} className="pr-line">
      <span className="pr-icon" aria-hidden>
        <Trophy />
      </span>
      <span className="grow" style={{ minWidth: 0 }}>
        <span className="row" style={{ gap: 6 }}>
          <span className="pr-kind">{t.kind}</span>
          <span className="pr-ex truncate">{lead.exerciseName}</span>
        </span>
        <span className="pr-meta">
          {showDate && <>{shortDate(lead.date)} · </>}
          {(others ?? []).map((o) => `${prText(o).kind} ${prText(o).value}`).join(' · ') || (delta ? `${delta} over previous best` : 'First record')}
        </span>
      </span>
      <span className="pr-value num">{t.value}</span>
    </Link>
  );
}

// ── Photo reminder ──────────────────────────────────────────────────────────

/** Visible from the chosen photo day until the month's set is complete, dismissed, or snoozed. */
export function usePhotoReminder(status: { month: string; complete: boolean; count: number } | undefined) {
  const boot = useBoot();
  const s = boot.settings;
  if (!status || status.complete) return false;
  const day = Number(boot.today.slice(8, 10));
  if (day < s.photoDay) return false;
  if (s.photoDismissedMonth === status.month) return false;
  if (s.photoSnoozeUntil && s.photoSnoozeUntil > boot.today) return false;
  return true;
}

export function PhotoReminder({ status }: { status: { month: string; complete: boolean; count: number } }) {
  const boot = useBoot();
  const navigate = useNavigate();
  const ui = useUI();
  const set = async (patch: object, msg: string) => {
    await api.put('/settings', patch);
    await refreshAll();
    ui.toast(msg);
  };
  return (
    <div className="reminder">
      <span className="icon-tile" style={{ '--c': 'var(--body)', '--c-soft': 'var(--body-soft)' } as React.CSSProperties}>
        <Camera />
      </span>
      <div className="grow" style={{ minWidth: 0 }}>
        <div className="reminder-title">Time for your {monthName(status.month)} progress photos.</div>
        <div className="reminder-sub">{status.count ? `${status.count} of 3 added — finish the set when you can.` : 'Front, side and back. Same spot, same light as last time.'}</div>
      </div>
      <div className="row reminder-actions">
        <button className="btn btn-ghost btn-sm" onClick={() => set({ photoSnoozeUntil: addDays(boot.today, 3) }, 'Snoozed for 3 days')} title="Remind me in 3 days">
          <Clock /> Later
        </button>
        <button className="btn btn-ghost btn-sm btn-icon" onClick={() => set({ photoDismissedMonth: status.month }, `Skipping photos for ${monthName(status.month)}`)} aria-label="Dismiss for this month" title="Skip this month">
          <X />
        </button>
        <button className="btn btn-primary btn-sm" onClick={() => navigate(`/photos/${status.month}?add=1`)}>
          Add photos
        </button>
      </div>
    </div>
  );
}

// ── Week strip ──────────────────────────────────────────────────────────────

export function WeekStrip({ days, today }: { days: DayPoint[]; today: ISODate }) {
  const max = Math.max(60, ...days.map((d) => d.minutes));
  return (
    <div className="week-strip">
      {days.map((d) => {
        const future = d.date > today;
        const wd = new Date(`${d.date}T12:00:00Z`).getUTCDay();
        return (
          <Link key={d.date} to={future ? '#' : `/day/${d.date}`} className={`ws-day ${future ? 'future' : ''} ${d.date === today ? 'today' : ''}`} aria-label={dayDate(d.date)} onClick={(e) => future && e.preventDefault()}>
            <span className="ws-bar-wrap">
              <span className="ws-bar" style={{ height: `${(d.minutes / max) * 100}%` }} />
            </span>
            <span className={`rating-dot ${d.rating ? `r${d.rating}` : ''} ${future ? 'future' : ''}`} />
            <span className="ws-label">{WEEKDAYS_SHORT[wd][0]}</span>
            {d.workouts > 0 && <span className="ws-gym" title="Workout" />}
          </Link>
        );
      })}
    </div>
  );
}

export function Check2({ on }: { on: boolean }) {
  return on ? <Check size={14} /> : <Circle size={14} />;
}

export function fmtMinutesShort(min: number) {
  return min ? duration(min, { short: true }) : '0h';
}
