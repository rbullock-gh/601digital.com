import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { ArrowRight, Download, Plus, X } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange, dayDate, duration, money, monthName, monthYear, shortDate } from '../lib/format.ts';
import { Card, Delta, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { BarChart, LineChart, RankList } from '../components/charts/charts.tsx';
import { addDays, endOfMonth, startOfMonth, weekRange, type ISODate } from '../../shared/dates.ts';
import type { MoneyBreakdown, Projection } from '../features/types.ts';

interface MoneySummary {
  today: number;
  week: number;
  month: number;
  previousMonth: number;
  year: number;
  allTime: number;
  firstDate: string | null;
  projection: Projection | null;
  yearProjection: Projection | null;
  monthly: { month: string; cents: number; minutes: number }[];
  daily: { date: ISODate; cents: number }[];
  byKind: { kind: string; cents: number }[];
  byProject: { id: number | null; name: string; color: string | null; cents: number }[];
  byCategory: { name: string; cents: number }[];
  rate: { month: number | null; year: number | null; allTime: number | null };
  rateMonthly: { month: string; rateCents: number | null }[];
  topDays: { date: ISODate; cents: number }[];
  topWeeks: { start: ISODate; cents: number }[];
  topMonths: { month: string; cents: number }[];
  defaultRateCents: number;
}

const KIND_LABEL: Record<string, string> = { hourly: 'Hourly work', flat: 'Flat-rate jobs', project: 'Project payments', other: 'Other income' };
const KIND_COLOR: Record<string, string> = { hourly: 'var(--work)', flat: 'var(--money)', project: 'var(--body)', other: 'var(--fitness)' };

interface Drill {
  from: ISODate;
  to: ISODate;
  label: string;
}

export default function Money() {
  const boot = useBoot();
  const ui = useUI();
  useDocumentTitle('Money');
  const q = useQuery({ queryKey: ['money-summary'], queryFn: () => api.get<MoneySummary>('/money/summary') });
  const [view, setView] = useState<'monthly' | 'daily'>('monthly');
  const [drill, setDrill] = useState<Drill>({ from: startOfMonth(boot.today), to: boot.today, label: `${monthName(boot.today.slice(0, 7))} so far` });

  const open = (d: Drill) => {
    setDrill(d);
    window.setTimeout(() => document.getElementById('breakdown')?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
  };
  const openMonth = (m: string) => open({ from: `${m}-01`, to: endOfMonth(`${m}-01`), label: monthYear(m) });
  const openWeek = (s: ISODate) => open({ from: s, to: addDays(s, 6), label: `Week of ${dateRange(s, addDays(s, 6))}` });
  const openDay = (d: ISODate) => open({ from: d, to: d, label: dayDate(d) });

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const m = q.data;
  const week = weekRange(boot.today, boot.settings.weekStart);

  return (
    <div className="page">
      <PageHead
        title="Money"
        sub={m.firstDate ? `${money(m.allTime)} earned since ${shortDate(m.firstDate, true)}` : 'Every dollar from work sessions and income, in one place.'}
        actions={
          <>
            <a className="btn btn-secondary" href="/api/data/csv/earnings" download>
              <Download /> CSV
            </a>
            <button className="btn btn-primary" onClick={() => ui.openAdd('income', { direct: true })}>
              <Plus /> Add income
            </button>
          </>
        }
      />

      <div className="card money-top">
        <div className="money-hero">
          <Stat size="lg" label="This month" value={money(m.month)} foot={<Delta current={m.month} previous={m.previousMonth} label="vs same point last month" />} />
          {m.projection && (
            <div className="projection-box">
              <span className="estimate">Estimate</span>
              <div className="pv">{money(m.projection.projectedCents)}</div>
              <div className="faint" style={{ fontSize: 12 }}>
                {money(m.projection.perDayCents)}/day average over {m.projection.elapsedDays} days × {m.projection.totalDays} days
              </div>
            </div>
          )}
        </div>
        <div className="stat-row" style={{ '--cols': 4, marginTop: 24 } as React.CSSProperties}>
          <button className="stat stat-btn" onClick={() => openDay(boot.today)}>
            <div className="stat-label">Today</div>
            <div className="stat-value">{money(m.today)}</div>
          </button>
          <button className="stat stat-btn" onClick={() => open({ from: week.start, to: week.end, label: 'This week' })}>
            <div className="stat-label">This week</div>
            <div className="stat-value">{money(m.week)}</div>
          </button>
          <button className="stat stat-btn" onClick={() => open({ from: `${boot.today.slice(0, 4)}-01-01`, to: boot.today, label: `${boot.today.slice(0, 4)} so far` })}>
            <div className="stat-label">This year</div>
            <div className="stat-value">{money(m.year)}</div>
            {m.yearProjection && (
              <div className="stat-foot">
                <span className="estimate">Est.</span> {money(m.yearProjection.projectedCents)}
              </div>
            )}
          </button>
          <button className="stat stat-btn" onClick={() => open({ from: m.firstDate ?? boot.today, to: boot.today, label: 'All time' })}>
            <div className="stat-label">All time</div>
            <div className="stat-value">{money(m.allTime)}</div>
          </button>
        </div>
      </div>

      <div className="grid grid-12" style={{ marginTop: 16 }}>
        <Card
          className="span-12"
          title="Earnings over time"
          sub={view === 'monthly' ? 'Click a month to see where it came from' : 'Last 30 days · click a day'}
          actions={
            <Segmented
              size="sm"
              value={view}
              onChange={setView}
              options={[
                { value: 'monthly', label: 'By month' },
                { value: 'daily', label: 'By day' },
              ]}
            />
          }
        >
          {view === 'monthly' ? (
            <BarChart
              ariaLabel="Earnings by month"
              height={240}
              data={m.monthly.map((x) => ({ key: x.month, label: monthName(x.month, true), value: x.cents }))}
              format={(v) => money(v)}
              axisFormat={(v) => money(v, { compact: true })}
              color="var(--money)"
              highlight={boot.today.slice(0, 7)}
              onSelect={openMonth}
              tooltip={(d) => {
                const row = m.monthly.find((x) => x.month === d.key)!;
                return (
                  <>
                    <div className="tip-title">{monthYear(d.key)}</div>
                    <div className="tip-row">
                      Earned <b>{money(d.value)}</b>
                    </div>
                    <div className="tip-row">
                      Worked <b>{duration(row.minutes)}</b>
                    </div>
                    {row.minutes > 0 && (
                      <div className="tip-row">
                        Per hour <b>{money(Math.round((d.value * 60) / row.minutes))}</b>
                      </div>
                    )}
                  </>
                );
              }}
            />
          ) : (
            <BarChart
              ariaLabel="Earnings by day"
              height={240}
              data={m.daily.map((x) => ({ key: x.date, label: String(Number(x.date.slice(8))), value: x.cents }))}
              format={(v) => money(v)}
              axisFormat={(v) => money(v, { compact: true })}
              color="var(--money)"
              highlight={boot.today}
              onSelect={openDay}
              tooltip={(d) => (
                <>
                  <div className="tip-title">{dayDate(d.key)}</div>
                  <div className="tip-row">
                    Earned <b>{money(d.value)}</b>
                  </div>
                </>
              )}
            />
          )}
        </Card>

        <Card className="span-4" title="By source" sub="This year">
          <RankList items={m.byKind.map((k) => ({ key: k.kind, label: KIND_LABEL[k.kind] ?? k.kind, value: k.cents, color: KIND_COLOR[k.kind] }))} format={(v) => money(v)} empty={<div className="faint">Nothing yet this year.</div>} />
        </Card>
        <Card className="span-4" title="By project" sub="This year">
          <RankList items={m.byProject.map((p) => ({ key: p.id ?? 'none', label: p.id ? <Link to={`/projects/${p.id}`}>{p.name}</Link> : p.name, value: p.cents, color: p.color ?? 'var(--text-4)' }))} format={(v) => money(v)} empty={<div className="faint">Nothing yet this year.</div>} />
        </Card>
        <Card className="span-4" title="By category" sub="This year">
          <RankList items={m.byCategory.map((c) => ({ key: c.name, label: c.name, value: c.cents }))} format={(v) => money(v)} color="var(--text-3)" empty={<div className="faint">Nothing yet this year.</div>} />
        </Card>

        <Card className="span-7" title="Average hourly earnings" sub="Earned from work sessions ÷ paid hours">
          <div className="stat-row" style={{ '--cols': 3, marginBottom: 18 } as React.CSSProperties}>
            <Stat size="sm" label="This month" value={m.rate.month ? `${money(m.rate.month)}/h` : '—'} />
            <Stat size="sm" label="This year" value={m.rate.year ? `${money(m.rate.year)}/h` : '—'} />
            <Stat size="sm" label="All time" value={m.rate.allTime ? `${money(m.rate.allTime)}/h` : '—'} foot={`Default rate ${money(m.defaultRateCents)}/h`} />
          </div>
          {m.rateMonthly.filter((r) => r.rateCents).length > 1 && (
            <LineChart
              ariaLabel="Effective hourly rate by month"
              height={170}
              series={[{ name: 'Per hour', color: 'var(--money)', points: m.rateMonthly.filter((r) => r.rateCents).map((r) => ({ date: `${r.month}-15`, value: r.rateCents! })) }]}
              format={(v) => `${money(v)}/h`}
              axisFormat={(v) => money(v)}
              dateFormat={(d) => monthYear(d.slice(0, 7), true)}
            />
          )}
        </Card>
        <Card className="span-5" title="Best periods">
          <div className="best-cols">
            <div>
              <div className="eyebrow">Days</div>
              {m.topDays.map((d) => (
                <button key={d.date} className="best-row" onClick={() => openDay(d.date)}>
                  <span>{shortDate(d.date)}</span>
                  <b className="num">{money(d.cents)}</b>
                </button>
              ))}
            </div>
            <div>
              <div className="eyebrow">Weeks</div>
              {m.topWeeks.map((w) => (
                <button key={w.start} className="best-row" onClick={() => openWeek(w.start)}>
                  <span>{dateRange(w.start, addDays(w.start, 6))}</span>
                  <b className="num">{money(w.cents)}</b>
                </button>
              ))}
            </div>
            <div>
              <div className="eyebrow">Months</div>
              {m.topMonths.map((x) => (
                <button key={x.month} className="best-row" onClick={() => openMonth(x.month)}>
                  <span>{monthYear(x.month, true)}</span>
                  <b className="num">{money(x.cents)}</b>
                </button>
              ))}
            </div>
          </div>
        </Card>
      </div>

      <Breakdown drill={drill} onReset={() => setDrill({ from: startOfMonth(boot.today), to: boot.today, label: `${monthName(boot.today.slice(0, 7))} so far` })} />
    </div>
  );
}

function Breakdown({ drill, onReset }: { drill: Drill; onReset: () => void }) {
  const q = useQuery({ queryKey: ['breakdown', drill.from, drill.to], queryFn: () => api.get<MoneyBreakdown>(`/money/breakdown?from=${drill.from}&to=${drill.to}`) });
  const b = q.data;
  return (
    <section className="section" id="breakdown" style={{ scrollMarginTop: 80 }}>
      <div className="section-head">
        <h2>Where it came from</h2>
        <span className="sub">{drill.label}</span>
        <div className="actions">
          <button className="btn btn-ghost btn-sm" onClick={onReset}>
            <X /> Reset
          </button>
        </div>
      </div>
      {!b ? (
        <div className="card">Loading…</div>
      ) : (
        <div className="grid grid-12">
          <div className="span-4 stack-16">
            <Card>
              <Stat size="lg" label="Total" value={money(b.total)} foot={`${b.rows.length} entries`} />
              <div className="divider" />
              <RankList items={b.byKind.map((k) => ({ key: k.kind, label: KIND_LABEL[k.kind] ?? k.kind, value: k.cents, color: KIND_COLOR[k.kind] }))} format={(v) => money(v)} />
            </Card>
            <Card title="By project">
              <RankList items={b.byProject.map((p) => ({ key: p.name, label: p.name, value: p.cents, sub: `${p.count}` }))} format={(v) => money(v)} color="var(--money)" empty={<div className="faint">No earnings in this period.</div>} />
            </Card>
          </div>
          <Card className="span-8 card-flush">
            {b.rows.length === 0 ? (
              <div className="empty">
                <h3>No earnings in this period</h3>
              </div>
            ) : (
              <div className="table-wrap" style={{ margin: 0, padding: '4px 20px 8px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th>Date</th>
                      <th>What</th>
                      <th className="hide-mobile">Project</th>
                      <th className="r">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {b.rows.slice(0, 300).map((r) => (
                      <tr key={`${r.source}${r.id}`}>
                        <td className="nowrap faint">
                          <Link to={`/day/${r.date}`} className="link" style={{ color: 'var(--text-2)' }}>
                            {shortDate(r.date)}
                          </Link>
                        </td>
                        <td>
                          <div className="truncate" style={{ maxWidth: 320 }}>{r.label}</div>
                          <div className="faint" style={{ fontSize: 12 }}>
                            {KIND_LABEL[r.kind]}
                            {r.minutes ? ` · ${duration(r.minutes)}` : ''}
                          </div>
                        </td>
                        <td className="hide-mobile faint">{r.projectName ?? '—'}</td>
                        <td className="r" style={{ fontWeight: 550 }}>
                          {money(r.cents)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {b.rows.length > 300 && <div className="faint" style={{ padding: 12, fontSize: 12 }}>Showing the first 300 entries. Export CSV for the full list.</div>}
              </div>
            )}
          </Card>
        </div>
      )}
      <Link to="/projects" className="dash-more" style={{ marginTop: 12, display: 'inline-flex' }}>
        Projects <ArrowRight />
      </Link>
    </section>
  );
}
