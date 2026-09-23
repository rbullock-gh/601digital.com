import { memo, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, Dumbbell } from 'lucide-react';
import { daysInMonth, make, MONTHS_SHORT, type ISODate } from '../../shared/dates.ts';
import type { DaySummary } from '../../shared/types.ts';
import { useTooltip } from './ui/Tooltip.tsx';
import { duration, longDate, money, RATING_LONG } from '../lib/format.ts';
import { useMediaQuery } from '../lib/hooks.ts';

export type GridMode = 'rating' | 'work' | 'money' | 'gym';

const MODE_COLOR: Record<Exclude<GridMode, 'rating'>, string> = {
  work: 'var(--work)',
  money: 'var(--money)',
  gym: 'var(--fitness)',
};

/** Tooltip body shared by the year grid and the calendar. */
export function DayTip({ d }: { d: DaySummary }) {
  return (
    <>
      <div className="tip-title">{longDate(d.date)}</div>
      <div className="tip-rating" style={{ color: d.rating ? `var(--${d.rating === 3 ? 'good' : d.rating === 2 ? 'okay' : 'bad'})` : 'var(--text-3)' }}>
        <span className={`rating-dot ${d.rating ? `r${d.rating}` : ''}`} />
        {d.rating ? RATING_LONG[d.rating] : 'Not rated'}
      </div>
      {d.minutes > 0 && (
        <div className="tip-row">
          Work <b>{duration(d.minutes)}</b>
        </div>
      )}
      {d.earnedCents > 0 && (
        <div className="tip-row">
          Earned <b>{money(d.earnedCents)}</b>
        </div>
      )}
      {d.workout && (
        <div className="tip-row">
          Gym{' '}
          <b className="row" style={{ gap: 4 }}>
            {d.workout.name}
            <Check size={12} />
          </b>
        </div>
      )}
      {d.prs > 0 && (
        <div className="tip-row">
          PRs <b>{d.prs}</b>
        </div>
      )}
      {d.goalsTotal > 0 && (
        <div className="tip-row">
          Goals{' '}
          <b>
            {d.goalsDone}/{d.goalsTotal}
          </b>
        </div>
      )}
      {!d.minutes && !d.earnedCents && !d.workout && !d.rating && <div className="tip-row">Nothing logged</div>}
    </>
  );
}

function cellStyle(d: DaySummary | undefined, mode: GridMode, max: number): React.CSSProperties | undefined {
  if (!d || mode === 'rating') return undefined;
  const v = mode === 'work' ? d.minutes : mode === 'money' ? d.earnedCents : d.workoutCount;
  if (!v) return undefined;
  // Sequential single-hue ramp: 4 steps from light to full.
  const t = Math.min(1, v / max);
  const step = t > 0.75 ? 100 : t > 0.5 ? 78 : t > 0.25 ? 56 : 34;
  return { background: `color-mix(in srgb, ${MODE_COLOR[mode]} ${step}%, var(--unrated))` };
}

interface Props {
  year: number;
  days: DaySummary[];
  today: ISODate;
  mode?: GridMode;
  compact?: boolean;
  onSelect?: (d: DaySummary) => void;
  selected?: ISODate | null;
  /** Minimal rendering from a plain date → rating map (all-years view). */
  ratingsOnly?: Record<string, number>;
}

/**
 * One square for every day of the year: twelve rows, one per month, with days
 * aligned by date so the 15th of every month sits in the same column.
 */
export const YearGrid = memo(function YearGrid({ year, days, today, mode = 'rating', compact, onSelect, selected, ratingsOnly }: Props) {
  const navigate = useNavigate();
  const tip = useTooltip();
  const touch = useMediaQuery('(hover: none)');
  const byDate = useMemo(() => new Map(days.map((d) => [d.date, d])), [days]);
  const max = useMemo(() => {
    if (mode === 'rating') return 1;
    const vals = days.map((d) => (mode === 'work' ? d.minutes : mode === 'money' ? d.earnedCents : d.workoutCount)).filter((v) => v > 0).sort((a, b) => a - b);
    return vals.length ? vals[Math.floor(vals.length * 0.9)] || vals[vals.length - 1] : 1;
  }, [days, mode]);
  const gridRef = useRef<HTMLDivElement>(null);
  const [focus, setFocus] = useState<ISODate | null>(null);

  const open = (date: ISODate) => {
    const d = byDate.get(date);
    if (touch && onSelect && d) onSelect(d);
    else navigate(`/day/${date}`);
  };

  const onKey = (e: KeyboardEvent<HTMLButtonElement>, date: ISODate) => {
    const [y, m, dd] = date.split('-').map(Number);
    const ny = y;
    let nm = m;
    let nd = dd;
    if (e.key === 'ArrowRight') nd++;
    else if (e.key === 'ArrowLeft') nd--;
    else if (e.key === 'ArrowDown') nm++;
    else if (e.key === 'ArrowUp') nm--;
    else return;
    e.preventDefault();
    if (nm < 1 || nm > 12) return;
    nd = Math.max(1, Math.min(daysInMonth(ny, nm), nd));
    if (nd > daysInMonth(ny, nm)) return;
    const next = make(ny, nm, nd);
    if (next > today) return;
    setFocus(next);
    gridRef.current?.querySelector<HTMLButtonElement>(`[data-date="${next}"]`)?.focus();
  };

  const focusable = focus ?? (today.startsWith(String(year)) ? today : make(year, 12, 31) <= today ? make(year, 1, 1) : null);

  return (
    <div className={`year-grid ${compact ? 'compact' : ''} mode-${mode}`} ref={gridRef} role="grid" aria-label={`${year} at a glance`}>
      {!compact && (
        <div className="yg-row yg-head" aria-hidden>
          <span className="yg-month" />
          {Array.from({ length: 31 }, (_, i) => (
            <span key={i} className="yg-daynum">
              {(i + 1) % 5 === 0 || i === 0 ? i + 1 : ''}
            </span>
          ))}
        </div>
      )}
      {MONTHS_SHORT.map((label, mi) => {
        const n = daysInMonth(year, mi + 1);
        return (
          <div className="yg-row" role="row" key={label} style={{ animationDelay: compact ? undefined : `${mi * 22}ms` }}>
            <span className="yg-month" role="rowheader">
              {compact ? label[0] : label.toUpperCase()}
            </span>
            {Array.from({ length: 31 }, (_, di) => {
              if (di >= n) return <span key={di} className="yg-cell none" aria-hidden />;
              const date = make(year, mi + 1, di + 1);
              const future = date > today;
              const isToday = date === today;
              if (ratingsOnly) {
                const r = ratingsOnly[date];
                return <span key={di} className={`yg-cell ${future ? 'future' : r ? `r${r}` : ''} ${isToday ? 'today' : ''}`} title={date} />;
              }
              const d = byDate.get(date);
              const r = d?.rating;
              const cls = `yg-cell ${future ? 'future' : mode === 'rating' && r ? `r${r}` : ''} ${isToday ? 'today' : ''} ${selected === date ? 'selected' : ''}`;
              if (future) return <span key={di} className={cls} aria-hidden />;
              return (
                <button
                  key={di}
                  type="button"
                  role="gridcell"
                  className={cls}
                  data-date={date}
                  tabIndex={date === focusable ? 0 : -1}
                  style={cellStyle(d, mode, max)}
                  aria-label={`${longDate(date, true)}: ${r ? RATING_LONG[r] : 'not rated'}`}
                  onMouseEnter={(e) => d && !touch && tip.show({ x: 0, y: 0, anchor: e.currentTarget.getBoundingClientRect(), content: <DayTip d={d} /> })}
                  onMouseLeave={() => tip.hide()}
                  onFocus={(e) => d && !touch && tip.show({ x: 0, y: 0, anchor: e.currentTarget.getBoundingClientRect(), content: <DayTip d={d} /> })}
                  onBlur={() => tip.hide()}
                  onKeyDown={(e) => onKey(e, date)}
                  onClick={() => {
                    tip.hide();
                    open(date);
                  }}
                >
                  {mode === 'rating' && d?.workout && !compact && <Dumbbell className="yg-mark" aria-hidden />}
                </button>
              );
            })}
          </div>
        );
      })}
    </div>
  );
});

export function GridLegend({ mode }: { mode: GridMode }) {
  if (mode === 'rating')
    return (
      <div className="legend">
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--good)' }} /> Good
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--okay)' }} /> Okay
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--bad)' }} /> Bad
        </span>
        <span className="legend-item">
          <span className="legend-swatch" style={{ background: 'var(--unrated)' }} /> Not rated
        </span>
      </div>
    );
  const c = MODE_COLOR[mode];
  return (
    <div className="legend">
      <span>Less</span>
      {[34, 56, 78, 100].map((s) => (
        <span key={s} className="legend-swatch" style={{ background: `color-mix(in srgb, ${c} ${s}%, var(--unrated))` }} />
      ))}
      <span>More</span>
    </div>
  );
}
