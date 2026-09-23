import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ArrowRight, Flame, Trophy } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useDocumentTitle, useLocalState } from '../lib/hooks.ts';
import { monthName, monthYear, pct, shortDate } from '../lib/format.ts';
import { Card, ErrorBox, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { RatingBar } from '../components/charts/charts.tsx';
import { DayTip, GridLegend, YearGrid, type GridMode } from '../components/YearGrid.tsx';
import { isLeapYear, yearOf } from '../../shared/dates.ts';
import type { DaySummary } from '../../shared/types.ts';
import type { RatingStats, YearGridData } from '../features/types.ts';

interface YearSummary {
  year: number;
  ratings: Record<string, number>;
  stats: RatingStats;
}

export default function YearPage() {
  const boot = useBoot();
  const navigate = useNavigate();
  const { year: yParam } = useParams();
  const all = yParam === 'all';
  const year = all ? yearOf(boot.today) : Number(yParam ?? yearOf(boot.today));
  const years = useQuery({ queryKey: ['years'], queryFn: () => api.get<YearSummary[]>('/years') });
  const yearList = years.data?.map((y) => y.year) ?? [yearOf(boot.today)];
  useDocumentTitle(all ? 'All years' : `${year} at a glance`);

  return (
    <div className="page">
      <header className="page-head">
        <div className="grow">
          <div className="eyebrow">Year at a glance</div>
          <h1 className="serif year-title">{all ? 'All years' : year}</h1>
        </div>
        <div className="actions">
          <Segmented
            value={all ? 'all' : String(year)}
            onChange={(v) => navigate(v === String(yearOf(boot.today)) ? '/year' : `/year/${v}`)}
            options={[...yearList.slice(0, 5).map((y) => ({ value: String(y), label: String(y) })), { value: 'all', label: 'All years' }]}
            label="Year"
          />
        </div>
      </header>
      {all ? <AllYears data={years.data} /> : <OneYear year={year} />}
    </div>
  );
}

function OneYear({ year }: { year: number }) {
  const boot = useBoot();
  const q = useQuery({ queryKey: ['year', year], queryFn: () => api.get<YearGridData>(`/year/${year}`) });
  const [mode, setMode] = useLocalState<GridMode>('year-mode', 'rating');
  const [gym, setGym] = useLocalState('year-gym', false);
  const [sel, setSel] = useState<DaySummary | null>(null);

  const months = useMemo(() => {
    const out = Array.from({ length: 12 }, (_, i) => ({ m: i, good: 0, okay: 0, bad: 0 }));
    for (const d of q.data?.days ?? []) {
      const m = Number(d.date.slice(5, 7)) - 1;
      if (d.rating === 3) out[m].good++;
      if (d.rating === 2) out[m].okay++;
      if (d.rating === 1) out[m].bad++;
    }
    return out;
  }, [q.data]);

  if (q.isError) return <ErrorBox error={q.error} retry={() => q.refetch()} />;
  if (!q.data) return <PageSkeleton />;
  const s = q.data.stats;
  const future = q.data.days.filter((d) => d.date > boot.today).length;

  return (
    <div className="stack-24">
      <Card
        className="grid-card"
        title={`${q.data.daysInYear} days${isLeapYear(year) ? ' · leap year' : ''}`}
        sub={future > 0 ? `${future} still ahead` : undefined}
        actions={
          <>
            {mode === 'rating' && (
              <label className="check" style={{ marginRight: 8 }}>
                <input type="checkbox" checked={gym} onChange={(e) => setGym(e.target.checked)} /> Mark workouts
              </label>
            )}
            <Segmented
              size="sm"
              value={mode}
              onChange={setMode}
              label="Color days by"
              options={[
                { value: 'rating', label: 'Rating' },
                { value: 'work', label: 'Work' },
                { value: 'money', label: 'Money' },
                { value: 'gym', label: 'Gym' },
              ]}
            />
          </>
        }
      >
        <div className={gym ? 'show-gym' : ''}>
          <YearGrid year={year} days={q.data.days} today={boot.today} mode={mode} onSelect={setSel} selected={sel?.date} />
        </div>
        <div className="row" style={{ marginTop: 16, justifyContent: 'space-between', flexWrap: 'wrap' }}>
          <GridLegend mode={mode} />
          <span className="faint" style={{ fontSize: 12 }}>
            <span className="hide-mobile">Hover a day for details · click to open it · arrow keys move between days</span>
            <span className="show-mobile">Tap a day for details</span>
          </span>
        </div>
        {sel && (
          <div className="day-panel">
            <DayTip d={sel} />
            <Link to={`/day/${sel.date}`} className="btn btn-secondary btn-sm mt-8">
              Open day <ArrowRight />
            </Link>
          </div>
        )}
      </Card>

      <div className="year-stats">
        <div className="year-stat">
          <div className="n">
            <span className="swatch-lg" style={{ background: 'var(--good)' }} />
            {s.good}
          </div>
          <div className="l">Good days</div>
          <div className="p">{pct(s.pctGood)}</div>
        </div>
        <div className="year-stat">
          <div className="n">
            <span className="swatch-lg" style={{ background: 'var(--okay)' }} />
            {s.okay}
          </div>
          <div className="l">Okay days</div>
          <div className="p">{pct(s.pctOkay)}</div>
        </div>
        <div className="year-stat">
          <div className="n">
            <span className="swatch-lg" style={{ background: 'var(--bad)' }} />
            {s.bad}
          </div>
          <div className="l">Bad days</div>
          <div className="p">{pct(s.pctBad)}</div>
        </div>
      </div>
      <div className="faint" style={{ fontSize: 12, marginTop: 8 }}>
        Percentages use rated days only ({s.rated}). {s.unrated} past day{s.unrated === 1 ? '' : 's'} unrated; future days aren’t counted.
      </div>

      <div className="grid grid-3">
        <Card>
          <div className="streak-stat">
            <Flame />
            <div>
              <div className="n">{s.currentStreak}</div>
              <div className="l">Current good-day streak</div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="streak-stat">
            <Trophy />
            <div>
              <div className="n">{s.longestStreak.length}</div>
              <div className="l">
                Longest streak{s.longestStreak.start ? ` · ${shortDate(s.longestStreak.start)} – ${shortDate(s.longestStreak.end!)}` : ''}
              </div>
            </div>
          </div>
        </Card>
        <Card>
          <div className="streak-stat">
            <span className="swatch-lg" style={{ background: 'var(--good)', width: 18, height: 18 }} />
            <div>
              <div className="n">{s.bestMonth?.good ?? 0}</div>
              <div className="l">Most good days in a month{s.bestMonth ? ` · ${monthName(s.bestMonth.month)}` : ''}</div>
            </div>
          </div>
        </Card>
      </div>

      <Card title="Month by month">
        <div className="month-bars">
          {months.map((m) => {
            const rated = m.good + m.okay + m.bad;
            const ym = `${year}-${String(m.m + 1).padStart(2, '0')}`;
            return (
              <Link key={m.m} to={`/reviews/month/${ym}`} className="month-bar-row" aria-label={monthYear(ym)}>
                <span className="mb-label">{monthName(ym, true)}</span>
                <RatingBar good={m.good} okay={m.okay} bad={m.bad} height={10} />
                <span className="mb-pct num">{rated ? pct(m.good / rated) : '—'}</span>
              </Link>
            );
          })}
        </div>
      </Card>
    </div>
  );
}

function AllYears({ data }: { data?: YearSummary[] }) {
  const boot = useBoot();
  if (!data) return <PageSkeleton />;
  return (
    <div className="years-list">
      {data.map((y) => (
        <Link key={y.year} to={y.year === yearOf(boot.today) ? '/year' : `/year/${y.year}`} className="year-card">
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <h3>{y.year}</h3>
            <span className="faint num" style={{ fontSize: 12 }}>
              {y.stats.rated} rated
            </span>
          </div>
          <YearGrid year={y.year} days={[]} today={boot.today} compact ratingsOnly={y.ratings} />
          <RatingBar good={y.stats.good} okay={y.stats.okay} bad={y.stats.bad} height={6} />
          <div className="row num" style={{ fontSize: 12, gap: 12 }}>
            <span className="rt g">{y.stats.good} good</span>
            <span className="rt o">{y.stats.okay} okay</span>
            <span className="rt b">{y.stats.bad} bad</span>
            <span className="faint" style={{ marginLeft: 'auto' }}>{pct(y.stats.pctGood)} good</span>
          </div>
        </Link>
      ))}
    </div>
  );
}
