import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { api } from '../lib/api.ts';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange, dayDate, duration, hours, length, money, monthName, monthYear, pct, plural, shortDate, weight, wUnit, wVal, lUnit, lVal } from '../lib/format.ts';
import { Card, Delta, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { BarChart, Legend, LineChart, RankList, RatingBar, Sparkline } from '../components/charts/charts.tsx';
import type { Totals } from '../../shared/types.ts';
import type { DayPoint, MonthPoint, RatingStats, StrengthChange } from '../features/types.ts';
import type { ISODate } from '../../shared/dates.ts';

type Tab = 'overall' | 'work' | 'money' | 'fitness' | 'body' | 'life';
type Span = 'W' | 'M' | '3M' | '6M' | 'Y' | 'All';

interface ProgressData {
  range: { start: ISODate; end: ISODate };
  granularity: 'day' | 'month';
  daily: DayPoint[] | null;
  monthly: MonthPoint[] | null;
  totals: Totals;
  previous: Totals;
  ratings: RatingStats;
  body: { weightKg: { date: ISODate; value: number }[]; waistCm: { date: ISODate; value: number }[] };
  strength: StrengthChange[];
  topExercises: { id: number; name: string; sessions: number; sets: number; volumeKg: number }[];
}

const TABS: { value: Tab; label: string }[] = [
  { value: 'overall', label: 'Overall' },
  { value: 'work', label: 'Work' },
  { value: 'money', label: 'Money' },
  { value: 'fitness', label: 'Fitness' },
  { value: 'body', label: 'Body' },
  { value: 'life', label: 'Life' },
];

export default function Progress() {
  const [params, setParams] = useSearchParams();
  const tab = (params.get('tab') as Tab) || 'overall';
  const span = (params.get('range') as Span) || '6M';
  useDocumentTitle('Progress');
  const q = useQuery({ queryKey: ['progress', span], queryFn: () => api.get<ProgressData>(`/progress?range=${span}`) });
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    n.set(k, v);
    setParams(n, { replace: true });
  };

  return (
    <div className="page">
      <PageHead title="Progress" sub={q.data ? `${dateRange(q.data.range.start, q.data.range.end)} · compared with the ${span === 'All' ? 'period' : 'same length'} before` : undefined} />
      <div className="progress-controls">
        <div className="tabs" role="tablist">
          {TABS.map((t) => (
            <button key={t.value} role="tab" aria-selected={tab === t.value} onClick={() => set('tab', t.value)}>
              {t.label}
            </button>
          ))}
        </div>
        <Segmented
          size="sm"
          value={span}
          onChange={(v) => set('range', v)}
          label="Range"
          options={[
            { value: 'W', label: 'Week' },
            { value: 'M', label: 'Month' },
            { value: '3M', label: '3M' },
            { value: '6M', label: '6M' },
            { value: 'Y', label: 'Year' },
            { value: 'All', label: 'All time' },
          ]}
        />
      </div>
      {q.isError && <ErrorBox error={q.error} retry={() => q.refetch()} />}
      {!q.data ? <PageSkeleton /> : <TabBody tab={tab} d={q.data} span={span} />}
    </div>
  );
}

function series(d: ProgressData, key: 'minutes' | 'cents' | 'workouts') {
  if (d.daily) return d.daily.map((p) => ({ key: p.date, label: String(Number(p.date.slice(8))), value: p[key], date: p.date }));
  return d.monthly!.map((p) => ({ key: p.month, label: monthName(p.month, true), value: p[key], date: `${p.month}-15` }));
}

function tipTitle(d: ProgressData, key: string) {
  return d.daily ? dayDate(key) : monthYear(key);
}

function TabBody({ tab, d, span }: { tab: Tab; d: ProgressData; span: Span }) {
  const t = d.totals;
  const p = d.previous;
  const compare = span !== 'All';
  const cmp = (cur: number, prev: number, good = true) => (compare ? <Delta current={cur} previous={prev} goodWhenUp={good} label="vs previous" /> : undefined);
  const days = Math.round((Date.parse(d.range.end) - Date.parse(d.range.start)) / 86400000) + 1;

  const workChart = (
    <BarChart
      ariaLabel="Hours worked"
      data={series(d, 'minutes')}
      format={(v) => duration(v)}
      axisFormat={(v) => `${Math.round(v / 60)}h`}
      tickUnit={60}
      color="var(--work)"
      tooltip={(x) => (
        <>
          <div className="tip-title">{tipTitle(d, x.key)}</div>
          <div className="tip-row">Worked <b>{duration(x.value)}</b></div>
        </>
      )}
    />
  );
  const moneyChart = (
    <BarChart
      ariaLabel="Earnings"
      data={series(d, 'cents')}
      format={(v) => money(v)}
      axisFormat={(v) => money(v, { compact: true })}
      color="var(--money)"
      tooltip={(x) => (
        <>
          <div className="tip-title">{tipTitle(d, x.key)}</div>
          <div className="tip-row">Earned <b>{money(x.value)}</b></div>
        </>
      )}
    />
  );
  const fitChart = (
    <BarChart
      ariaLabel="Workouts"
      data={series(d, 'workouts')}
      format={(v) => plural(v, 'workout')}
      axisFormat={(v) => String(v)}
      integer
      color="var(--fitness)"
      tooltip={(x) => (
        <>
          <div className="tip-title">{tipTitle(d, x.key)}</div>
          <div className="tip-row">Workouts <b>{x.value}</b></div>
        </>
      )}
    />
  );
  const weightPts = d.body.weightKg.map((x) => ({ date: x.date, value: wVal(x.value)! }));
  const waistPts = d.body.waistCm.map((x) => ({ date: x.date, value: lVal(x.value)! }));
  const cumulative = (() => {
    let acc = 0;
    return series(d, 'cents').map((x) => ({ date: x.date as ISODate, value: (acc += x.value) / 100 }));
  })();

  const lifeChart = d.monthly ? (
    <>
      <BarChart
        ariaLabel="Day ratings by month"
        data={d.monthly.map((m) => ({
          key: m.month,
          label: monthName(m.month, true),
          value: m.good + m.okay + m.bad,
          parts: [
            { value: m.good, color: 'var(--good)', name: 'Good' },
            { value: m.okay, color: 'var(--okay)', name: 'Okay' },
            { value: m.bad, color: 'var(--bad)', name: 'Bad' },
          ],
        }))}
        format={(v) => plural(v, 'day')}
        axisFormat={(v) => String(v)}
        integer
        tooltip={(x) => {
          const m = d.monthly!.find((y) => y.month === x.key)!;
          const r = m.good + m.okay + m.bad;
          return (
            <>
              <div className="tip-title">{monthYear(x.key)}</div>
              <div className="tip-row">Good <b>{m.good}</b></div>
              <div className="tip-row">Okay <b>{m.okay}</b></div>
              <div className="tip-row">Bad <b>{m.bad}</b></div>
              {r > 0 && <div className="tip-row">Good share <b>{pct(m.good / r)}</b></div>}
            </>
          );
        }}
      />
      <div style={{ marginTop: 12 }}>
        <Legend items={[{ label: 'Good', color: 'var(--good)' }, { label: 'Okay', color: 'var(--okay)' }, { label: 'Bad', color: 'var(--bad)' }]} />
      </div>
    </>
  ) : (
    <div className="rating-strip">
      {d.daily!.map((x) => (
        <Link key={x.date} to={`/day/${x.date}`} className={`rs-cell ${x.rating ? `r${x.rating}` : ''}`} title={`${shortDate(x.date)}: ${x.rating ? ['', 'Bad', 'Okay', 'Good'][x.rating] : 'Not rated'}`} />
      ))}
    </div>
  );

  if (tab === 'work')
    return (
      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Hours worked" value={`${hours(t.minutes)}h`} foot={cmp(t.minutes, p.minutes)} />
            <Stat label="Days worked" value={t.workDays} foot={cmp(t.workDays, p.workDays)} />
            <Stat label="Avg per work day" value={t.workDays ? duration(t.minutes / t.workDays) : '—'} />
            <Stat label="Sessions" value={t.sessions} foot={t.sessions ? `${duration(t.minutes / t.sessions)} average` : undefined} />
          </div>
        </div>
        <Card title={d.daily ? 'Hours per day' : 'Hours per month'}>{workChart}</Card>
      </div>
    );
  if (tab === 'money')
    return (
      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Earned" value={money(t.earnedCents)} foot={cmp(t.earnedCents, p.earnedCents)} />
            <Stat label="Per day" value={money(t.earnedCents / days)} foot="Calendar days" />
            <Stat label="Per hour worked" value={t.minutes ? `${money((t.earnedCents * 60) / t.minutes)}` : '—'} foot={compare && p.minutes ? <Delta current={t.earnedCents / Math.max(1, t.minutes)} previous={p.earnedCents / Math.max(1, p.minutes)} label="vs previous" /> : undefined} />
            <Stat label="Previous period" value={compare ? money(p.earnedCents) : '—'} />
          </div>
        </div>
        <Card title={d.daily ? 'Earnings per day' : 'Earnings per month'}>{moneyChart}</Card>
        {cumulative.length > 1 && (
          <Card title="Cumulative earnings" sub="Running total across the range">
            <LineChart ariaLabel="Cumulative earnings" area zeroBased series={[{ name: 'Total', color: 'var(--money)', points: cumulative }]} format={(v) => money(v * 100)} axisFormat={(v) => money(v * 100, { compact: true })} dateFormat={(x) => (d.daily ? shortDate(x) : monthYear(x.slice(0, 7), true))} />
          </Card>
        )}
      </div>
    );
  if (tab === 'fitness')
    return (
      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Workouts" value={t.workouts} foot={cmp(t.workouts, p.workouts)} />
            <Stat label="Gym time" value={duration(t.gymMinutes)} foot={cmp(t.gymMinutes, p.gymMinutes)} />
            <Stat label="Per week" value={(t.workouts / (days / 7)).toFixed(1)} />
            <Stat label="PRs" value={t.prs} foot={cmp(t.prs, p.prs)} />
          </div>
        </div>
        <Card title={d.daily ? 'Workouts per day' : 'Workouts per month'}>{fitChart}</Card>
        <div className="grid grid-2">
          <Card title="Strength change" sub="Estimated 1RM across the range">
            <RankList items={d.strength.map((s) => ({ key: s.id, label: <Link to={`/gym/exercises/${s.id}`}>{s.name}</Link>, value: Math.max(0, s.pct * 100), sub: `${weight(s.startE1rm, { unit: false })} → ${weight(s.endE1rm)}` }))} format={(v) => `+${v.toFixed(1)}%`} color="var(--fitness)" empty={<div className="faint">Not enough data in this range.</div>} />
          </Card>
          <Card title="Most trained">
            <RankList items={d.topExercises.map((e) => ({ key: e.id, label: <Link to={`/gym/exercises/${e.id}`}>{e.name}</Link>, value: e.sets, sub: plural(e.sessions, 'session') }))} format={(v) => `${v} sets`} color="var(--fitness)" empty={<div className="faint">No workouts in this range.</div>} />
          </Card>
        </div>
      </div>
    );
  if (tab === 'body')
    return (
      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 3 } as React.CSSProperties}>
            <Stat label="Weight now" value={weightPts.length ? `${weightPts[weightPts.length - 1].value} ${wUnit()}` : '—'} />
            <Stat label="Change" value={weightPts.length > 1 ? weight(d.body.weightKg[d.body.weightKg.length - 1].value - d.body.weightKg[0].value, { signed: true }) : '—'} foot={weightPts.length > 1 ? `Since ${shortDate(weightPts[0].date)}` : undefined} />
            <Stat label="Waist change" value={waistPts.length > 1 ? length(d.body.waistCm[d.body.waistCm.length - 1].value - d.body.waistCm[0].value, { signed: true }) : '—'} />
          </div>
        </div>
        <Card title="Weight">
          {weightPts.length > 1 ? <LineChart ariaLabel="Weight" area series={[{ name: 'Weight', color: 'var(--body)', points: weightPts }]} format={(v) => `${v} ${wUnit()}`} axisFormat={(v) => String(v)} dateFormat={(x) => shortDate(x)} /> : <div className="faint">Not enough weigh-ins in this range.</div>}
        </Card>
        <Card title="Waist">
          {waistPts.length > 1 ? <LineChart ariaLabel="Waist" series={[{ name: 'Waist', color: 'var(--body)', points: waistPts }]} format={(v) => `${v} ${lUnit()}`} axisFormat={(v) => String(v)} dateFormat={(x) => shortDate(x)} /> : <div className="faint">Not enough measurements in this range.</div>}
        </Card>
      </div>
    );
  if (tab === 'life')
    return (
      <div className="stack-16">
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Good days" value={d.ratings.good} foot={d.ratings.pctGood != null ? `${pct(d.ratings.pctGood)} of rated` : undefined} />
            <Stat label="Okay days" value={d.ratings.okay} foot={d.ratings.pctOkay != null ? pct(d.ratings.pctOkay) : undefined} />
            <Stat label="Bad days" value={d.ratings.bad} foot={d.ratings.pctBad != null ? pct(d.ratings.pctBad) : undefined} />
            <Stat label="Longest good streak" value={d.ratings.longestStreak.length} foot={`${d.ratings.unrated} unrated`} />
          </div>
          <div style={{ marginTop: 18 }}>
            <RatingBar good={d.ratings.good} okay={d.ratings.okay} bad={d.ratings.bad} height={10} />
          </div>
        </div>
        <Card title="Day ratings">{lifeChart}</Card>
      </div>
    );

  // Overall: every area at once, with small multiples.
  const s = (key: 'minutes' | 'cents' | 'workouts') => series(d, key).map((x) => x.value);
  return (
    <div className="grid grid-2 overall-grid">
      <Card title="Work">
        <Stat size="lg" label="Hours worked" value={`${hours(t.minutes)}h`} foot={cmp(t.minutes, p.minutes)} />
        <div style={{ marginTop: 14 }}><Sparkline values={s('minutes')} bars color="var(--work)" height={48} /></div>
      </Card>
      <Card title="Money">
        <Stat size="lg" label="Earned" value={money(t.earnedCents)} foot={cmp(t.earnedCents, p.earnedCents)} />
        <div style={{ marginTop: 14 }}><Sparkline values={s('cents')} bars color="var(--money)" height={48} /></div>
      </Card>
      <Card title="Fitness">
        <Stat size="lg" label="Workouts" value={t.workouts} foot={cmp(t.workouts, p.workouts)} />
        <div style={{ marginTop: 14 }}><Sparkline values={s('workouts')} bars color="var(--fitness)" height={48} /></div>
      </Card>
      <Card title="Body">
        <Stat size="lg" label="Weight" value={weightPts.length ? `${weightPts[weightPts.length - 1].value} ${wUnit()}` : '—'} foot={weightPts.length > 1 ? `${weight(d.body.weightKg[d.body.weightKg.length - 1].value - d.body.weightKg[0].value, { signed: true })} over the range` : undefined} />
        <div style={{ marginTop: 14 }}>{weightPts.length > 1 && <Sparkline values={weightPts.map((x) => x.value)} color="var(--body)" height={48} />}</div>
      </Card>
      <Card title="Life" className="span-2-wide">
        <div className="row" style={{ gap: 24, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <Stat size="lg" label="Good days" value={d.ratings.good} foot={d.ratings.pctGood != null ? `${pct(d.ratings.pctGood)} of rated days` : 'No ratings in this range'} />
          <div className="grow" style={{ minWidth: 200 }}>
            <RatingBar good={d.ratings.good} okay={d.ratings.okay} bad={d.ratings.bad} height={12} />
          </div>
        </div>
      </Card>
    </div>
  );
}
