import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronLeft, ChevronRight, MapPin, NotebookPen, Search, Trophy } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle, useIsMobile } from '../lib/hooks.ts';
import { duration, hours, money, monthYear } from '../lib/format.ts';
import { ErrorBox, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { RatingBar } from '../components/charts/charts.tsx';
import { useTooltip } from '../components/ui/Tooltip.tsx';
import { DayTip } from '../components/YearGrid.tsx';
import { addMonthsYM, isYearMonth, weekday, WEEKDAYS_SHORT } from '../../shared/dates.ts';
import type { DaySummary, Totals } from '../../shared/types.ts';
import type { RatingStats } from '../features/types.ts';

interface CalData {
  month: string;
  days: DaySummary[];
  totals: Totals;
  ratings: RatingStats;
}

export default function Calendar() {
  const boot = useBoot();
  const ui = useUI();
  const navigate = useNavigate();
  const tip = useTooltip();
  const mobile = useIsMobile();
  const [params, setParams] = useSearchParams();
  const month = isYearMonth(params.get('month')) ? params.get('month')! : boot.today.slice(0, 7);
  const q = useQuery({ queryKey: ['calendar', month], queryFn: () => api.get<CalData>(`/calendar/${month}`) });
  useDocumentTitle(monthYear(month));
  const go = (m: string) => setParams({ month: m });

  const ws = boot.settings.weekStart;
  const headers = Array.from({ length: 7 }, (_, i) => WEEKDAYS_SHORT[(i + ws) % 7]);

  return (
    <div className="page page-wide">
      <header className="page-head">
        <div className="grow">
          <h1>{monthYear(month)}</h1>
          <div className="sub">Every day, at a glance. Click any day to open it.</div>
        </div>
        <div className="actions">
          <button className="btn btn-secondary" onClick={() => ui.setCmdOpen(true)}>
            <Search /> Search history
          </button>
          <div className="row" style={{ gap: 4 }}>
            <button className="btn btn-secondary btn-icon" onClick={() => go(addMonthsYM(month, -1))} aria-label="Previous month">
              <ChevronLeft />
            </button>
            {month !== boot.today.slice(0, 7) && (
              <button className="btn btn-secondary" onClick={() => go(boot.today.slice(0, 7))}>
                This month
              </button>
            )}
            <button className="btn btn-secondary btn-icon" onClick={() => go(addMonthsYM(month, 1))} aria-label="Next month" disabled={month >= boot.today.slice(0, 7)}>
              <ChevronRight />
            </button>
          </div>
        </div>
      </header>

      {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {!q.data ? (
        <PageSkeleton />
      ) : (
        <>
          <div className="card cal-summary">
            <div className="stat-row" style={{ '--cols': 5 } as React.CSSProperties}>
              <Stat size="sm" label="Worked" value={`${hours(q.data.totals.minutes)}h`} foot={`${q.data.totals.workDays} days`} />
              <Stat size="sm" label="Earned" value={money(q.data.totals.earnedCents)} />
              <Stat size="sm" label="Workouts" value={q.data.totals.workouts} foot={q.data.totals.prs ? `${q.data.totals.prs} PRs` : undefined} />
              <Stat size="sm" label="Good days" value={q.data.ratings.good} foot={`${q.data.ratings.okay} okay · ${q.data.ratings.bad} bad`} />
              <div className="stat" style={{ justifyContent: 'center' }}>
                <RatingBar good={q.data.ratings.good} okay={q.data.ratings.okay} bad={q.data.ratings.bad} />
                <div className="stat-foot" style={{ marginTop: 6 }}>
                  <Link to={`/reviews/month/${month}`} className="link">
                    Monthly review
                  </Link>
                </div>
              </div>
            </div>
          </div>

          <div className="calendar" role="grid" aria-label={monthYear(month)}>
            {headers.map((h) => (
              <div key={h} className="cal-head" role="columnheader">
                {mobile ? h[0] : h}
              </div>
            ))}
            {Array.from({ length: (weekday(`${month}-01`) - ws + 7) % 7 }, (_, i) => (
              <div key={`pad${i}`} className="cal-cell pad" aria-hidden />
            ))}
            {q.data.days.map((d) => {
              const future = d.date > boot.today;
              const n = Number(d.date.slice(8));
              return (
                <button
                  key={d.date}
                  role="gridcell"
                  className={`cal-cell ${future ? 'future' : ''} ${d.date === boot.today ? 'today' : ''} ${d.rating ? `r${d.rating}` : ''}`}
                  disabled={future}
                  onClick={() => {
                    tip.hide();
                    navigate(`/day/${d.date}`);
                  }}
                  onMouseEnter={(e) => !mobile && !future && tip.show({ x: 0, y: 0, anchor: e.currentTarget.getBoundingClientRect(), content: <DayTip d={d} /> })}
                  onMouseLeave={() => tip.hide()}
                  aria-label={`${d.date}${d.rating ? `, ${['', 'bad', 'okay', 'good'][d.rating]} day` : ''}`}
                >
                  <span className="cal-top">
                    <span className="cal-num">{n}</span>
                    {d.rating && <span className={`rating-dot r${d.rating}`} />}
                  </span>
                  {!mobile ? (
                    <span className="cal-lines">
                      {d.minutes > 0 && (
                        <span className="cal-line">
                          <span className="dot" style={{ '--c': 'var(--work)' } as React.CSSProperties} />
                          {duration(d.minutes)}
                        </span>
                      )}
                      {d.earnedCents > 0 && (
                        <span className="cal-line">
                          <span className="dot" style={{ '--c': 'var(--money)' } as React.CSSProperties} />
                          {money(d.earnedCents)}
                        </span>
                      )}
                      {d.workout && (
                        <span className="cal-line truncate">
                          <span className="dot" style={{ '--c': 'var(--fitness)' } as React.CSSProperties} />
                          <span className="truncate">{d.workout.name}</span>
                          {d.prs > 0 && <Trophy className="cal-ico pr" />}
                        </span>
                      )}
                      {d.travel && (
                        <span className="cal-line truncate">
                          <MapPin className="cal-ico travel" />
                          <span className="truncate">{d.travel}</span>
                        </span>
                      )}
                      <span className="cal-foot">
                        {d.goalsTotal > 0 && (
                          <span className={d.goalsDone === d.goalsTotal ? 'pos' : ''}>
                            {d.goalsDone}/{d.goalsTotal} goals
                          </span>
                        )}
                        {d.hasJournal && <NotebookPen className="cal-ico" aria-label="Journal entry" />}
                        {d.hasPhotos && <span className="cal-tag">Photos</span>}
                      </span>
                    </span>
                  ) : (
                    <span className="cal-dots">
                      {d.minutes > 0 && <span className="dot" style={{ '--c': 'var(--work)', width: 5, height: 5 } as React.CSSProperties} />}
                      {d.workout && <span className="dot" style={{ '--c': 'var(--fitness)', width: 5, height: 5 } as React.CSSProperties} />}
                      {d.hasJournal && <span className="dot" style={{ '--c': 'var(--text-3)', width: 5, height: 5 } as React.CSSProperties} />}
                      {d.travel && <span className="dot" style={{ '--c': 'var(--travel)', width: 5, height: 5 } as React.CSSProperties} />}
                    </span>
                  )}
                </button>
              );
            })}
          </div>
          <div className="legend" style={{ marginTop: 14 }}>
            <span className="legend-item"><span className="dot" style={{ '--c': 'var(--work)' } as React.CSSProperties} /> Work</span>
            <span className="legend-item"><span className="dot" style={{ '--c': 'var(--money)' } as React.CSSProperties} /> Earned</span>
            <span className="legend-item"><span className="dot" style={{ '--c': 'var(--fitness)' } as React.CSSProperties} /> Workout</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--good)' }} /> Good</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--okay)' }} /> Okay</span>
            <span className="legend-item"><span className="legend-swatch" style={{ background: 'var(--bad)' }} /> Bad</span>
          </div>
        </>
      )}
    </div>
  );
}
