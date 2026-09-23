import { useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Briefcase, Play, Plus, Search, Square } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { clock, dayDate, duration, hours, money, shortDate } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { BarChart, RankList } from '../components/charts/charts.tsx';
import { WorkSessionForm } from '../features/forms.tsx';
import { useTimerActions } from '../components/Timer.tsx';
import { addDays, startOfMonth, WEEKDAYS, WEEKDAYS_SHORT, weekRange, type ISODate } from '../../shared/dates.ts';
import type { WorkSession } from '../../shared/types.ts';

interface WorkSummary {
  today: { minutes: number; sessions: number; days: number };
  week: { minutes: number; sessions: number; days: number };
  month: { minutes: number; sessions: number; days: number };
  year: { minutes: number; sessions: number; days: number };
  allTime: { minutes: number; sessions: number; days: number; first: string | null };
  avgPerWorkDayYear: number;
  avgPerWeekYear: number;
  avgSession: number;
  projectsMonth: { id: number; name: string; color: string | null; minutes: number; cents: number; sessions: number }[];
  projectsYear: { id: number; name: string; color: string | null; minutes: number; cents: number; sessions: number }[];
  categories: { name: string; minutes: number; sessions: number }[];
  weeks: { start: ISODate; minutes: number }[];
  daily: { date: ISODate; minutes: number }[];
  byWeekday: { wd: number; minutes: number; days: number }[];
}

type RangeKey = 'week' | 'month' | '30' | 'year' | 'all' | 'custom';

export default function Work() {
  const boot = useBoot();
  const ui = useUI();
  const timer = useTimerActions();
  useDocumentTitle('Work');
  const q = useQuery({ queryKey: ['work-summary'], queryFn: () => api.get<WorkSummary>('/work/summary') });
  const [projScope, setProjScope] = useState<'month' | 'year'>('month');

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const w = q.data;
  const weekdayAvg = Array.from({ length: 7 }, (_, i) => {
    const wd = (i + boot.settings.weekStart) % 7;
    const r = w.byWeekday.find((x) => x.wd === wd);
    // Average over all occurrences of that weekday in the last 52 weeks (not just days worked).
    return { key: String(wd), label: WEEKDAYS_SHORT[wd], value: r ? r.minutes / 52 : 0 };
  });

  return (
    <div className="page">
      <PageHead
        title="Work"
        sub={w.allTime.first ? `${Math.round(w.allTime.minutes / 60).toLocaleString()} hours across ${w.allTime.sessions.toLocaleString()} sessions since ${shortDate(w.allTime.first, true)}` : 'Track time, and everything else follows.'}
        actions={
          <>
            {boot.timer ? (
              <button className="btn btn-secondary" onClick={timer.stop}>
                <Square /> Stop work
              </button>
            ) : (
              <button className="btn btn-secondary" onClick={timer.start}>
                <Play /> Start work
              </button>
            )}
            <button className="btn btn-primary" onClick={() => ui.openAdd('work', { direct: true })}>
              <Plus /> Log session
            </button>
          </>
        }
      />

      <div className="card">
        <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
          <Stat label="Today" value={duration(w.today.minutes)} foot={`${w.today.sessions} sessions`} />
          <Stat label="This week" value={duration(w.week.minutes)} foot={`${w.week.days} days`} />
          <Stat label="This month" value={`${hours(w.month.minutes)}h`} foot={`${w.month.days} days · ${w.month.sessions} sessions`} />
          <Stat label="This year" value={`${Math.round(w.year.minutes / 60).toLocaleString()}h`} foot={`${w.year.days} days`} />
        </div>
        <div className="divider" />
        <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
          <Stat size="sm" label="Avg per work day" value={duration(w.avgPerWorkDayYear)} foot="This year" />
          <Stat size="sm" label="Avg per week" value={duration(w.avgPerWeekYear)} foot="This year" />
          <Stat size="sm" label="Avg session" value={duration(w.avgSession)} foot="All time" />
          <Stat size="sm" label="Total sessions" value={w.allTime.sessions.toLocaleString()} foot={`${w.allTime.days.toLocaleString()} days worked`} />
        </div>
      </div>

      <div className="grid grid-12 section" style={{ marginTop: 16 }}>
        <Card className="span-7" title="Hours per week" sub="Last 16 weeks">
          <BarChart
            ariaLabel="Hours worked per week"
            data={w.weeks.map((x) => ({ key: x.start, label: shortDate(x.start).replace(/,.*/, ''), value: x.minutes }))}
            format={(v) => duration(v)}
            axisFormat={(v) => `${Math.round(v / 60)}h`}
            tickUnit={60}
            highlight={w.weeks[w.weeks.length - 1]?.start}
            color="var(--work)"
            tooltip={(d) => (
              <>
                <div className="tip-title">Week of {shortDate(d.key)}</div>
                <div className="tip-row">
                  Worked <b>{duration(d.value)}</b>
                </div>
              </>
            )}
          />
        </Card>
        <Card className="span-5" title="Typical week" sub="Average hours by weekday, last 12 months">
          <BarChart
            ariaLabel="Average hours by weekday"
            data={weekdayAvg}
            format={(v) => duration(v)}
            axisFormat={(v) => `${Math.round((v / 60) * 10) / 10}h`}
            tickUnit={60}
            color="var(--work)"
            labelEvery={1}
            tooltip={(d) => (
              <>
                <div className="tip-title">{WEEKDAYS[Number(d.key)]}s</div>
                <div className="tip-row">
                  Average <b>{duration(d.value)}</b>
                </div>
              </>
            )}
          />
        </Card>
        <Card
          className="span-7"
          title="Most active projects"
          actions={
            <Segmented
              size="sm"
              value={projScope}
              onChange={setProjScope}
              options={[
                { value: 'month', label: 'Month' },
                { value: 'year', label: 'Year' },
              ]}
            />
          }
        >
          <RankList
            items={(projScope === 'month' ? w.projectsMonth : w.projectsYear).map((p) => ({ key: p.id, label: <Link to={`/projects/${p.id}`}>{p.name}</Link>, value: p.minutes, color: p.color, sub: money(p.cents) }))}
            format={(v) => duration(v)}
            empty={<div className="faint">No project time {projScope === 'month' ? 'this month' : 'this year'}.</div>}
          />
        </Card>
        <Card className="span-5" title="Type of work" sub="This year">
          <RankList items={w.categories.map((c) => ({ key: c.name, label: c.name, value: c.minutes, sub: `${c.sessions}` }))} format={(v) => `${hours(v)}h`} color="var(--text-3)" empty={<div className="faint">No categories yet.</div>} />
        </Card>
      </div>

      <SessionsList />
    </div>
  );
}

function SessionsList() {
  const boot = useBoot();
  const [range, setRange] = useState<RangeKey>('month');
  const [from, setFrom] = useState(startOfMonth(boot.today));
  const [to, setTo] = useState(boot.today);
  const [project, setProject] = useState('');
  const [category, setCategory] = useState('');
  const [pay, setPay] = useState('');
  const [text, setText] = useState('');
  const [editing, setEditing] = useState<WorkSession | null>(null);

  const r = useMemo(() => {
    const t = boot.today;
    switch (range) {
      case 'week':
        return weekRange(t, boot.settings.weekStart);
      case 'month':
        return { start: startOfMonth(t), end: t };
      case '30':
        return { start: addDays(t, -29), end: t };
      case 'year':
        return { start: `${t.slice(0, 4)}-01-01`, end: t };
      case 'all':
        return { start: '', end: '' };
      default:
        return { start: from, end: to };
    }
  }, [range, from, to, boot.today, boot.settings.weekStart]);

  const params = new URLSearchParams();
  if (r.start) params.set('from', r.start);
  if (r.end) params.set('to', r.end);
  if (project) params.set('project', project);
  if (category) params.set('category', category);
  if (pay) params.set('pay', pay);
  if (text.trim()) params.set('q', text.trim());

  const q = useInfiniteQuery({
    queryKey: ['sessions', params.toString()],
    queryFn: ({ pageParam }) => api.get<{ sessions: WorkSession[]; total: number; minutes: number; earnedCents: number }>(`/work/sessions?${params}&limit=60&offset=${pageParam}`),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => {
      const n = pages.reduce((a, p) => a + p.sessions.length, 0);
      return n < last.total ? n : undefined;
    },
  });
  const rows = q.data?.pages.flatMap((p) => p.sessions) ?? [];
  const head = q.data?.pages[0];
  // Group by date for readability.
  const groups: [ISODate, WorkSession[]][] = [];
  for (const s of rows) {
    const g = groups[groups.length - 1];
    if (g && g[0] === s.date) g[1].push(s);
    else groups.push([s.date, [s]]);
  }

  return (
    <section className="section">
      <div className="section-head">
        <h2>Sessions</h2>
        {head && (
          <span className="sub">
            {head.total.toLocaleString()} sessions · {duration(head.minutes)} · {money(head.earnedCents)}
          </span>
        )}
      </div>
      <div className="filters">
        <Segmented
          size="sm"
          value={range}
          onChange={setRange}
          options={[
            { value: 'week', label: 'Week' },
            { value: 'month', label: 'Month' },
            { value: '30', label: '30 days' },
            { value: 'year', label: 'Year' },
            { value: 'all', label: 'All' },
            { value: 'custom', label: 'Custom' },
          ]}
        />
        {range === 'custom' && (
          <>
            <input type="date" className="input input-sm" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="From" />
            <input type="date" className="input input-sm" value={to} onChange={(e) => setTo(e.target.value)} aria-label="To" />
          </>
        )}
        <select className="select input-sm" value={project} onChange={(e) => setProject(e.target.value)} aria-label="Project">
          <option value="">All projects</option>
          {boot.projects.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Type of work">
          <option value="">All types</option>
          {boot.categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <select className="select input-sm" value={pay} onChange={(e) => setPay(e.target.value)} aria-label="Pay type">
          <option value="">Any pay</option>
          <option value="hourly">Hourly</option>
          <option value="flat">Flat rate</option>
          <option value="unpaid">Unpaid</option>
        </select>
        <div className="input-affix search-affix">
          <Search className="affix" size={14} style={{ left: 10 }} />
          <input className="input input-sm" style={{ paddingLeft: 30 }} value={text} onChange={(e) => setText(e.target.value)} placeholder="Search" aria-label="Search sessions" />
        </div>
      </div>

      <div className="card card-flush">
        {q.isLoading ? (
          <div style={{ padding: 20 }}>Loading…</div>
        ) : rows.length === 0 ? (
          <Empty icon={<Briefcase />} title="No sessions match">
            Try a wider date range or clear the filters.
          </Empty>
        ) : (
          <div className="session-groups">
            {groups.map(([date, ss]) => (
              <div key={date} className="session-group">
                <Link to={`/day/${date}`} className="sg-head">
                  <span>{dayDate(date)}</span>
                  <span className="faint num">
                    {duration(ss.reduce((a, s) => a + s.minutes, 0))} · {money(ss.reduce((a, s) => a + s.earnedCents, 0))}
                  </span>
                </Link>
                {ss.map((s) => (
                  <button key={s.id} className="session-row" onClick={() => setEditing(s)}>
                    <span className="sr-time num">{s.startTime ? `${clock(s.startTime)} – ${clock(s.endTime)}` : 'Duration'}</span>
                    <span className="sr-main">
                      <span className="title truncate">{s.description || 'Work session'}</span>
                      <span className="sr-meta">
                        {s.projectName && (
                          <span className="row" style={{ gap: 5 }}>
                            <span className="avatar-dot" style={{ background: s.projectColor ?? 'var(--text-4)', width: 8, height: 8 }} />
                            {s.projectName}
                          </span>
                        )}
                        {s.categoryName && <span>{s.categoryName}</span>}
                      </span>
                    </span>
                    <span className="sr-dur num">{duration(s.minutes)}</span>
                    <span className="sr-money num">
                      {s.payType === 'unpaid' ? <span className="faint">Unpaid</span> : money(s.earnedCents)}
                      {s.payType === 'hourly' && s.hourlyRateCents ? <span className="faint sr-rate">{money(s.hourlyRateCents)}/h</span> : s.payType === 'flat' ? <span className="faint sr-rate">Flat</span> : null}
                    </span>
                  </button>
                ))}
              </div>
            ))}
            {q.hasNextPage && (
              <div style={{ padding: 16, textAlign: 'center' }}>
                <button className="btn btn-secondary btn-sm" onClick={() => q.fetchNextPage()} disabled={q.isFetchingNextPage}>
                  Load more
                </button>
              </div>
            )}
          </div>
        )}
      </div>
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit work session">
        {editing && <WorkSessionForm session={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </section>
  );
}

