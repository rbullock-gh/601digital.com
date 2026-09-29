import { useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Link, useSearchParams } from 'react-router-dom';
import { ArrowLeftRight, Camera, ChevronLeft } from 'lucide-react';
import { api } from '../lib/api.ts';
import { useDocumentTitle, useLocalState } from '../lib/hooks.ts';
import { duration, length, monthYear, pct, plural, weight } from '../lib/format.ts';
import { Card, Empty, PageSkeleton } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { diffDays, type ISODate } from '../../shared/dates.ts';
import { MEASUREMENT_LABELS, type Angle, type MeasurementKey, type PhotoSet } from '../../shared/types.ts';
import type { StrengthChange } from '../features/types.ts';

interface CompareData {
  from: PhotoSet | null;
  to: PhotoSet | null;
  start: ISODate;
  end: ISODate;
  changes: { field: string; from: { date: ISODate; value: number } | null; to: { date: ISODate; value: number } | null }[];
  workouts: number;
  gymMinutes: number;
  strength: StrengthChange[];
  prs: number;
}

export default function PhotoCompare() {
  useDocumentTitle('Compare photos');
  const [params, setParams] = useSearchParams();
  const list = useQuery({ queryKey: ['photos'], queryFn: () => api.get<{ sets: PhotoSet[] }>('/photos') });
  const sets = list.data?.sets ?? [];
  const from = params.get('from') ?? sets[sets.length - 1]?.month;
  const to = params.get('to') ?? sets[0]?.month;
  const [angle, setAngle] = useState<Angle>('front');
  const [mode, setMode] = useLocalState<'side' | 'slider'>('compare-mode', 'side');
  const q = useQuery({ queryKey: ['compare', from, to], queryFn: () => api.get<CompareData>(`/photos/compare?from=${from}&to=${to}`), enabled: !!from && !!to });

  if (list.isLoading) return <PageSkeleton />;
  if (sets.length < 2)
    return (
      <div className="page">
        <Link to="/photos" className="back-link"><ChevronLeft /> Progress photos</Link>
        <Card><Empty icon={<Camera />} title="Two months needed">Add photos in at least two different months to compare them.</Empty></Card>
      </div>
    );

  const d = q.data;
  const a = d?.from?.photos.find((p) => p.angle === angle);
  const b = d?.to?.photos.find((p) => p.angle === angle);
  const months = d ? Math.round(diffDays(d.start, d.end) / 30.44) : 0;
  const set = (k: string, v: string) => {
    const n = new URLSearchParams(params);
    n.set('from', from!);
    n.set('to', to!);
    n.set(k, v);
    setParams(n, { replace: true });
  };
  const val = (f: string, v: number) => (f === 'weightKg' ? weight(v) : f === 'bodyFatPct' ? `${v}%` : length(v));
  const diff = (f: string, v: number) => (f === 'weightKg' ? weight(v, { signed: true }) : f === 'bodyFatPct' ? `${v > 0 ? '+' : ''}${Math.round(v * 10) / 10}%` : length(v, { signed: true }));

  return (
    <div className="page page-wide">
      <Link to="/photos" className="back-link"><ChevronLeft /> Progress photos</Link>
      <header className="page-head">
        <div className="grow">
          <h1>Compare</h1>
          <div className="sub">Matching angles, side by side. The photos are shown exactly as taken.</div>
        </div>
        <div className="actions compare-controls">
          <label className="compare-pick">
            <span className="eyebrow">Start</span>
            <select className="select input-sm" value={from} onChange={(e) => set('from', e.target.value)}>
              {sets.slice().reverse().map((s) => <option key={s.month} value={s.month}>{monthYear(s.month)}</option>)}
            </select>
          </label>
          <button className="btn btn-ghost btn-icon" aria-label="Swap" onClick={() => { const n = new URLSearchParams(params); n.set('from', to!); n.set('to', from!); setParams(n, { replace: true }); }}>
            <ArrowLeftRight />
          </button>
          <label className="compare-pick">
            <span className="eyebrow">Compare to</span>
            <select className="select input-sm" value={to} onChange={(e) => set('to', e.target.value)}>
              {sets.map((s) => <option key={s.month} value={s.month}>{monthYear(s.month)}</option>)}
            </select>
          </label>
        </div>
      </header>

      <div className="row" style={{ justifyContent: 'space-between', flexWrap: 'wrap', gap: 10, marginBottom: 14 }}>
        <Segmented value={angle} onChange={setAngle} options={[{ value: 'front', label: 'Front' }, { value: 'side', label: 'Side' }, { value: 'back', label: 'Back' }]} />
        <Segmented size="sm" value={mode} onChange={setMode} options={[{ value: 'side', label: 'Side by side' }, { value: 'slider', label: 'Slider' }]} />
      </div>

      <div className="grid grid-12">
        <div className="span-8">
          {!d ? (
            <PageSkeleton />
          ) : mode === 'side' ? (
            <div className="compare-side">
              <figure>
                <div className="cmp-frame">{a ? <img src={a.url} alt={`${angle}, ${monthYear(from!)}`} /> : <span className="faint">No {angle} photo</span>}</div>
                <figcaption><span className="eyebrow">Start</span> {monthYear(from!)}</figcaption>
              </figure>
              <figure>
                <div className="cmp-frame">{b ? <img src={b.url} alt={`${angle}, ${monthYear(to!)}`} /> : <span className="faint">No {angle} photo</span>}</div>
                <figcaption><span className="eyebrow">Now</span> {monthYear(to!)}</figcaption>
              </figure>
            </div>
          ) : a && b ? (
            <Slider before={a.url} after={b.url} beforeLabel={monthYear(from!, true)} afterLabel={monthYear(to!, true)} />
          ) : (
            <Card><div className="faint">Both months need a {angle} photo for the slider.</div></Card>
          )}
        </div>
        <div className="span-4">
          {d && (
            <Card>
              <div className="eyebrow">{months > 0 ? `${months} month progress` : 'Progress'}</div>
              <div className="serif cmp-range">{monthYear(from!, true)} → {monthYear(to!, true)}</div>
              <div className="cmp-stats">
                {d.changes.filter((c) => c.from && c.to && c.field !== 'bodyFatPct').map((c) => {
                  const delta = c.to!.value - c.from!.value;
                  return (
                    <div key={c.field} className="cmp-stat">
                      <span className="faint">{c.field === 'weightKg' ? 'Weight' : MEASUREMENT_LABELS[c.field as MeasurementKey]}</span>
                      <span className="num">{val(c.field, c.from!.value)} → {val(c.field, c.to!.value)}</span>
                      <b className="num">{Math.abs(delta) < 0.05 ? '—' : diff(c.field, delta)}</b>
                    </div>
                  );
                })}
                {d.strength.map((s) => (
                  <div key={s.id} className="cmp-stat">
                    <span className="faint">{s.name}</span>
                    <span className="num">{weight(s.startE1rm, { unit: false })} → {weight(s.endE1rm)}</span>
                    <b className={`num ${s.change > 0 ? 'pos' : ''}`}>{s.change > 0 ? '+' : ''}{pct(s.pct)}</b>
                  </div>
                ))}
                <div className="cmp-stat">
                  <span className="faint">Workouts</span>
                  <span className="num">{plural(d.workouts, 'workout')}</span>
                  <b className="num">{d.gymMinutes ? duration(d.gymMinutes) : ''}</b>
                </div>
                <div className="cmp-stat">
                  <span className="faint">Strength PRs</span>
                  <span />
                  <b className="num">{d.prs}</b>
                </div>
              </div>
              <div className="faint" style={{ fontSize: 11, marginTop: 12 }}>Strength shows estimated 1RM. Values are the entries nearest each photo date.</div>
            </Card>
          )}
        </div>
      </div>
    </div>
  );
}

/** Draggable before/after reveal. Keyboard: arrow keys move the divider. */
function Slider({ before, after, beforeLabel, afterLabel }: { before: string; after: string; beforeLabel: string; afterLabel: string }) {
  const [pos, setPos] = useState(50);
  const ref = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = ref.current!.getBoundingClientRect();
    setPos(Math.max(0, Math.min(100, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <div
      ref={ref}
      className="slider-cmp"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        move(e.clientX);
      }}
      onPointerMove={(e) => e.buttons && move(e.clientX)}
    >
      <img src={after} alt={afterLabel} draggable={false} />
      <img src={before} alt={beforeLabel} draggable={false} style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }} />
      <span className="sc-label l">{beforeLabel}</span>
      <span className="sc-label r">{afterLabel}</span>
      <div
        className="sc-handle"
        style={{ left: `${pos}%` }}
        role="slider"
        tabIndex={0}
        aria-label="Comparison divider"
        aria-valuenow={Math.round(pos)}
        aria-valuemin={0}
        aria-valuemax={100}
        onKeyDown={(e) => {
          if (e.key === 'ArrowLeft') setPos((p) => Math.max(0, p - 4));
          if (e.key === 'ArrowRight') setPos((p) => Math.min(100, p + 4));
        }}
      >
        <span className="sc-grip"><ArrowLeftRight size={14} /></span>
      </div>
    </div>
  );
}
