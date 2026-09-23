import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Plus, Ruler, Scale } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useBoot } from '../lib/boot.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dayDate, length, lUnit, lVal, shortDate, weight, wUnit, wVal } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { LineChart } from '../components/charts/charts.tsx';
import { BodyForm } from '../features/forms.tsx';
import { addMonths, type ISODate } from '../../shared/dates.ts';
import { MEASUREMENTS, MEASUREMENT_LABELS, type BodyMetric } from '../../shared/types.ts';
import type { FieldChange } from '../features/types.ts';

type Span = '1M' | '3M' | '6M' | '1Y' | 'All';
interface BodySummary {
  latest: Record<string, { date: ISODate; value: number }>;
  changes: Record<Span, FieldChange[]>;
  series: Record<string, { date: ISODate; value: number }[]>;
}
const SPANS: Span[] = ['1M', '3M', '6M', '1Y', 'All'];

export default function Body() {
  const boot = useBoot();
  const ui = useUI();
  useDocumentTitle('Body');
  const q = useQuery({ queryKey: ['body-summary'], queryFn: () => api.get<BodySummary>('/body/summary') });
  const list = useQuery({ queryKey: ['body-list'], queryFn: () => api.get<BodyMetric[]>('/body') });
  const [span, setSpan] = useState<Span>('6M');
  const [field, setField] = useState<string>('waistCm');
  const [editing, setEditing] = useState<BodyMetric | null>(null);

  const cutoff = span === 'All' ? '0000-01-01' : addMonths(boot.today, -{ '1M': 1, '3M': 3, '6M': 6, '1Y': 12 }[span]);
  const weightPts = useMemo(() => (q.data?.series.weightKg ?? []).filter((p) => p.date >= cutoff).map((p) => ({ date: p.date, value: wVal(p.value)! })), [q.data, cutoff]);
  const fieldPts = useMemo(() => (q.data?.series[field] ?? []).filter((p) => p.date >= cutoff).map((p) => ({ date: p.date, value: lVal(p.value)! })), [q.data, field, cutoff]);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const b = q.data;
  const change = (f: string, s: Span) => b.changes[s].find((c) => c.field === f);
  const hasAny = Object.keys(b.latest).length > 0;

  return (
    <div className="page">
      <PageHead
        title="Body"
        sub="Weight and measurements. Everything is optional — log what you track."
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => ui.openAdd('body', { direct: true })}>
              <Ruler /> Measurements
            </button>
            <button className="btn btn-primary" onClick={() => ui.openAdd('weight', { direct: true })}>
              <Plus /> Log weight
            </button>
          </>
        }
      />
      {!hasAny ? (
        <Card>
          <Empty icon={<Scale />} title="Nothing logged yet" action={<button className="btn btn-primary btn-sm" onClick={() => ui.openAdd('weight', { direct: true })}>Log your weight</button>}>
            A weekly weigh-in and monthly measurements are plenty to see real change over a year.
          </Empty>
        </Card>
      ) : (
        <>
          <Card
            title="Weight"
            actions={<Segmented size="sm" value={span} onChange={setSpan} options={SPANS.map((s) => ({ value: s, label: s }))} />}
          >
            <div className="weight-head">
              <div>
                <div className="stat-value" style={{ fontSize: 'var(--fs-38)' }}>{b.latest.weightKg ? weight(b.latest.weightKg.value) : '—'}</div>
                <div className="faint" style={{ fontSize: 12 }}>{b.latest.weightKg ? `Last logged ${shortDate(b.latest.weightKg.date)}` : ''}</div>
              </div>
              <div className="change-chips">
                {SPANS.map((s) => {
                  const c = change('weightKg', s);
                  return (
                    <button key={s} className={`change-chip ${s === span ? 'on' : ''}`} onClick={() => setSpan(s)}>
                      <span className="faint">{s}</span>
                      <b className="num">{c?.change != null ? weight(c.change, { signed: true }) : '—'}</b>
                    </button>
                  );
                })}
              </div>
            </div>
            {weightPts.length > 1 ? (
              <LineChart ariaLabel="Weight over time" height={240} area series={[{ name: 'Weight', color: 'var(--body)', points: weightPts }]} format={(v) => `${v} ${wUnit()}`} axisFormat={(v) => String(v)} dateFormat={(d) => shortDate(d)} />
            ) : (
              <div className="faint" style={{ padding: '24px 0' }}>Log a few more weigh-ins to see the trend.</div>
            )}
          </Card>

          <div className="grid grid-12" style={{ marginTop: 16 }}>
            <Card className="span-7 card-flush" title="Measurements" sub={`Changes in ${lUnit()} · click a row to chart it`}>
              <div className="table-wrap" style={{ margin: 0, padding: '0 20px 8px' }}>
                <table className="table">
                  <thead>
                    <tr>
                      <th />
                      <th className="r">Now</th>
                      {SPANS.map((s) => (
                        <th key={s} className="r">{s}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {MEASUREMENTS.map((m) => (
                      <tr key={m} className={`clickable ${field === m ? 'selected-row' : ''}`} onClick={() => setField(m)}>
                        <td style={{ fontWeight: 550 }}>{MEASUREMENT_LABELS[m]}</td>
                        <td className="r">{b.latest[m] ? length(b.latest[m].value, { unit: false }) : '—'}</td>
                        {SPANS.map((s) => {
                          const c = change(m, s)?.change;
                          return (
                            <td key={s} className={`r ${c == null ? 'faint' : ''}`}>
                              {c != null ? length(c, { signed: true, unit: false }) : '—'}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Card>
            <Card className="span-5" title={MEASUREMENT_LABELS[field as keyof typeof MEASUREMENT_LABELS] ?? 'Measurement'} sub={span}>
              {fieldPts.length > 1 ? (
                <LineChart ariaLabel="Measurement over time" height={220} series={[{ name: MEASUREMENT_LABELS[field as keyof typeof MEASUREMENT_LABELS], color: 'var(--body)', points: fieldPts }]} format={(v) => `${v} ${lUnit()}`} axisFormat={(v) => String(v)} dateFormat={(d) => shortDate(d)} />
              ) : (
                <div className="faint">Not enough entries in this range.</div>
              )}
            </Card>
          </div>

          <section className="section">
            <div className="section-head">
              <h2>History</h2>
            </div>
            <div className="card card-flush">
              {(list.data ?? []).slice(0, 80).map((e) => (
                <button key={e.id} className="session-row body-row" onClick={() => setEditing(e)}>
                  <span className="sr-time num">{dayDate(e.date)}</span>
                  <span className="sr-main">
                    <span className="title">{e.weightKg != null ? weight(e.weightKg) : 'Measurements'}</span>
                    <span className="sr-meta">
                      {MEASUREMENTS.filter((k) => e[k] != null)
                        .map((k) => `${MEASUREMENT_LABELS[k]} ${length(e[k], { unit: false })}`)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              ))}
            </div>
          </section>
        </>
      )}
      <Dialog open={!!editing} onClose={() => setEditing(null)} title="Edit entry">
        {editing && <BodyForm entry={editing} onDone={() => setEditing(null)} />}
      </Dialog>
    </div>
  );
}
