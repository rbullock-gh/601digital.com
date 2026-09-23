// Small, dependency-free SVG charts.
//
// Rules (shared by every chart): one y-axis, hairline gridlines, bars capped at
// 24px with a 4px rounded data end and a square baseline, 2px lines, a 2px
// surface gap between touching marks, and a hover layer with a tooltip. Text is
// always in text colours; only marks carry series colour.

import { useMemo, useState, type ReactNode } from 'react';
import { useElementWidth } from '../../lib/hooks.ts';
import { useTooltip } from '../ui/Tooltip.tsx';
import { toDayNum, type ISODate } from '../../../shared/dates.ts';

export function niceTicks(max: number, count = 4, integer = false): number[] {
  if (!(max > 0)) return [0, 1];
  const raw = max / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  let step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  if (integer) step = Math.max(1, Math.ceil(step));
  const top = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = 0; v <= top + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

function niceRange(min: number, max: number, count = 4): number[] {
  if (min === max) return [min - 1, min, min + 1];
  const raw = (max - min) / count;
  const mag = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw) ?? raw;
  const lo = Math.floor(min / step) * step;
  const hi = Math.ceil(max / step) * step;
  const out: number[] = [];
  for (let v = lo; v <= hi + 1e-9; v += step) out.push(Math.round(v * 1e6) / 1e6);
  return out;
}

/** Rounded-top bar path: 4px radius at the data end, square at the baseline. */
function barPath(x: number, y: number, w: number, h: number, r = 4): string {
  if (h <= 0) return '';
  const rr = Math.min(r, w / 2, h);
  return `M${x},${y + h}V${y + rr}Q${x},${y} ${x + rr},${y}H${x + w - rr}Q${x + w},${y} ${x + w},${y + rr}V${y + h}Z`;
}

// ── Bar chart ────────────────────────────────────────────────────────────────

export interface BarDatum {
  key: string;
  label: string;
  value: number;
  /** Optional stacked parts (rendered bottom-up, separated by a 2px surface gap). */
  parts?: { value: number; color: string; name: string }[];
}

interface BarProps {
  data: BarDatum[];
  color?: string;
  height?: number;
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  highlight?: string | null;
  onSelect?: (key: string) => void;
  tooltip?: (d: BarDatum) => ReactNode;
  labelEvery?: number;
  /** Faint reference line (e.g. a weekly target). */
  target?: { value: number; label: string };
  ariaLabel: string;
  /** Compute round ticks in this unit (e.g. 60 when values are minutes but the axis reads hours). */
  tickUnit?: number;
  /** Counts: only whole-number ticks. */
  integer?: boolean;
}

export function BarChart({ data, color = 'var(--work)', height = 200, format, axisFormat, highlight, onSelect, tooltip, labelEvery, target, ariaLabel, tickUnit = 1, integer }: BarProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const tip = useTooltip();
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...data.map((d) => d.value), target?.value ?? 0);
  const ticks = niceTicks(max / tickUnit, 3, integer).map((t) => t * tickUnit);
  const top = ticks[ticks.length - 1];
  const fmtAxis = axisFormat ?? format;
  const left = Math.max(28, ...ticks.map((t) => fmtAxis(t).length * 6.4 + 10));
  const padB = 22;
  const plotW = Math.max(0, width - left);
  const plotH = height - padB - 6;
  const band = data.length ? plotW / data.length : 0;
  const barW = Math.max(2, Math.min(24, band * 0.62));
  const y = (v: number) => 6 + plotH - (v / top) * plotH;
  const every = labelEvery ?? Math.max(1, Math.ceil((data.length * 44) / Math.max(1, plotW)));
  const hiIdx = highlight ? data.findIndex((d) => d.key === highlight) : -1;

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg width={width} height={height} role="img" aria-label={ariaLabel} onMouseLeave={() => (setHover(null), tip.hide())}>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width} y1={y(t)} y2={y(t)} className={t === 0 ? 'baseline' : 'gridline'} />
              <text x={left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="axis-label">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {target && target.value > 0 && (
            <g>
              <line x1={left} x2={width} y1={y(target.value)} y2={y(target.value)} className="target-line" />
              <text x={width} y={y(target.value) - 5} textAnchor="end" className="axis-label">
                {target.label}
              </text>
            </g>
          )}
          {data.map((d, i) => {
            const cx = left + band * i + band / 2;
            const x = cx - barW / 2;
            const isHi = highlight === d.key;
            const dim = hover != null && hover !== i;
            let acc = 0;
            return (
              <g key={d.key} className="bar-g" style={{ opacity: dim ? 0.45 : 1 }}>
                {d.parts ? (
                  d.parts.map((p, j) => {
                    if (p.value <= 0) return null;
                    const base = acc;
                    acc += p.value;
                    const isTop = d.parts!.slice(j + 1).every((q) => q.value <= 0);
                    const gap = base > 0 ? 2 : 0; // surface gap between stacked segments
                    const yTop = y(acc);
                    const h = Math.max(0, y(base) - yTop - gap);
                    return isTop ? <path key={j} d={barPath(x, yTop, barW, h)} fill={p.color} /> : <rect key={j} x={x} y={yTop} width={barW} height={h} fill={p.color} />;
                  })
                ) : (
                  <path d={barPath(x, y(d.value), barW, y(0) - y(d.value))} fill={color} opacity={highlight && !isHi ? 0.72 : 1} />
                )}
                {(isHi || (i % every === 0 && !(hiIdx >= 0 && Math.abs(i - hiIdx) < every && i !== hiIdx))) && (
                  <text x={cx} y={height - 6} textAnchor="middle" className={`axis-label ${isHi ? 'strong' : ''}`}>
                    {d.label}
                  </text>
                )}
                <rect
                  x={left + band * i}
                  y={0}
                  width={band}
                  height={height - padB}
                  fill="transparent"
                  style={{ cursor: onSelect ? 'pointer' : 'default' }}
                  onMouseMove={(e) => {
                    setHover(i);
                    tip.show({ x: e.clientX, y: e.clientY, content: tooltip ? tooltip(d) : <DefaultTip title={d.label} value={format(d.value)} /> });
                  }}
                  onClick={() => onSelect?.(d.key)}
                />
              </g>
            );
          })}
        </svg>
      )}
    </div>
  );
}

function DefaultTip({ title, value }: { title: ReactNode; value: ReactNode }) {
  return (
    <>
      <div className="tip-title">{title}</div>
      <div className="tip-row">
        <b>{value}</b>
      </div>
    </>
  );
}

// ── Line chart (time on x, proportional to real dates) ──────────────────────

export interface LinePoint {
  date: ISODate;
  value: number;
}
export interface LineSeries {
  name: string;
  color: string;
  points: LinePoint[];
}

interface LineProps {
  series: LineSeries[];
  height?: number;
  format: (v: number) => string;
  axisFormat?: (v: number) => string;
  dateFormat: (d: ISODate) => string;
  area?: boolean;
  zeroBased?: boolean;
  ariaLabel: string;
  endLabel?: boolean;
}

export function LineChart({ series, height = 220, format, axisFormat, dateFormat, area, zeroBased, ariaLabel, endLabel = true }: LineProps) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const tip = useTooltip();
  const [hx, setHx] = useState<number | null>(null);
  const all = series.flatMap((s) => s.points);
  const xs = all.map((p) => toDayNum(p.date));
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  const vals = all.map((p) => p.value);
  const ticks = zeroBased ? niceTicks(Math.max(...vals, 1), 3) : niceRange(Math.min(...vals), Math.max(...vals), 3);
  const lo = ticks[0];
  const hi = ticks[ticks.length - 1];
  const fmtAxis = axisFormat ?? format;
  const left = Math.max(30, ...ticks.map((t) => fmtAxis(t).length * 6.4 + 10));
  const right = endLabel && series.length ? 12 : 8;
  const padB = 22;
  const plotW = Math.max(0, width - left - right);
  const plotH = height - padB - 10;
  const sx = (n: number) => left + (x1 === x0 ? plotW / 2 : ((n - x0) / (x1 - x0)) * plotW);
  const sy = (v: number) => 10 + plotH - ((v - lo) / (hi - lo || 1)) * plotH;

  const xTicks = useMemo(() => {
    if (!all.length) return [];
    const n = Math.max(2, Math.min(6, Math.floor(plotW / 90)));
    const out: number[] = [];
    for (let i = 0; i < n; i++) out.push(Math.round(x0 + ((x1 - x0) * i) / (n - 1)));
    return [...new Set(out)];
  }, [x0, x1, plotW, all.length]);

  if (!all.length) return <div ref={ref} className="chart" style={{ height }} />;

  const pathFor = (pts: LinePoint[]) => pts.map((p, i) => `${i ? 'L' : 'M'}${sx(toDayNum(p.date)).toFixed(1)},${sy(p.value).toFixed(1)}`).join('');

  const nearest = (mx: number) => {
    let best: { s: LineSeries; p: LinePoint; d: number }[] = [];
    for (const s of series) {
      let bp: LinePoint | null = null;
      let bd = Infinity;
      for (const p of s.points) {
        const d = Math.abs(sx(toDayNum(p.date)) - mx);
        if (d < bd) (bd = d), (bp = p);
      }
      if (bp) best.push({ s, p: bp, d: bd });
    }
    best = best.sort((a, b) => a.d - b.d);
    return best;
  };

  return (
    <div ref={ref} className="chart" style={{ height }}>
      {width > 0 && (
        <svg
          width={width}
          height={height}
          role="img"
          aria-label={ariaLabel}
          onMouseLeave={() => (setHx(null), tip.hide())}
          onMouseMove={(e) => {
            const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
            const mx = e.clientX - rect.left;
            if (mx < left - 4) return;
            const near = nearest(mx);
            if (!near.length) return;
            const px = sx(toDayNum(near[0].p.date));
            setHx(px);
            const date = near[0].p.date;
            tip.show({
              x: e.clientX,
              y: e.clientY,
              content: (
                <>
                  <div className="tip-title">{dateFormat(date)}</div>
                  {near
                    .filter((n) => n.p.date === date || series.length === 1)
                    .map((n) => (
                      <div className="tip-row" key={n.s.name}>
                        <span className="row" style={{ gap: 6 }}>
                          {series.length > 1 && <span className="dot" style={{ '--c': n.s.color } as React.CSSProperties} />}
                          {n.s.name}
                        </span>
                        <b>{format(n.p.value)}</b>
                      </div>
                    ))}
                </>
              ),
            });
          }}
        >
          {ticks.map((t) => (
            <g key={t}>
              <line x1={left} x2={width - right} y1={sy(t)} y2={sy(t)} className={t === lo && zeroBased ? 'baseline' : 'gridline'} />
              <text x={left - 8} y={sy(t)} dy="0.32em" textAnchor="end" className="axis-label">
                {fmtAxis(t)}
              </text>
            </g>
          ))}
          {xTicks.map((t, i) => (
            <text key={t} x={sx(t)} y={height - 5} textAnchor={i === 0 ? 'start' : i === xTicks.length - 1 ? 'end' : 'middle'} className="axis-label">
              {dateFormat(new Date(t * 86400000).toISOString().slice(0, 10))}
            </text>
          ))}
          {series.map((s) => (
            <g key={s.name}>
              {area && series.length === 1 && s.points.length > 1 && (
                <path
                  d={`${pathFor(s.points)}L${sx(toDayNum(s.points[s.points.length - 1].date))},${sy(lo)}L${sx(toDayNum(s.points[0].date))},${sy(lo)}Z`}
                  fill={s.color}
                  opacity={0.1}
                />
              )}
              <path d={pathFor(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" className="line-path" />
              {s.points.length > 0 && (() => {
                const last = s.points[s.points.length - 1];
                return <circle cx={sx(toDayNum(last.date))} cy={sy(last.value)} r={4} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
              })()}
            </g>
          ))}
          {hx != null && <line x1={hx} x2={hx} y1={8} y2={height - padB} className="crosshair" />}
          {hx != null &&
            series.map((s) => {
              const n = nearest(hx).find((x) => x.s === s);
              if (!n || Math.abs(sx(toDayNum(n.p.date)) - hx) > 1) return null;
              return <circle key={s.name} cx={hx} cy={sy(n.p.value)} r={4.5} fill={s.color} stroke="var(--surface)" strokeWidth={2} />;
            })}
        </svg>
      )}
    </div>
  );
}

// ── Sparkline ───────────────────────────────────────────────────────────────

export function Sparkline({ values, color = 'var(--text-3)', height = 32, bars, highlightLast = true }: { values: number[]; color?: string; height?: number; bars?: boolean; highlightLast?: boolean }) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const max = Math.max(1, ...values);
  const min = bars ? 0 : Math.min(...values);
  return (
    <div ref={ref} style={{ height }} aria-hidden>
      {width > 0 && values.length > 0 && (
        <svg width={width} height={height}>
          {bars ? (
            values.map((v, i) => {
              const band = width / values.length;
              const w = Math.max(2, Math.min(10, band - 2));
              const h = Math.max(v > 0 ? 2 : 0, (v / max) * (height - 2));
              return (
                <path
                  key={i}
                  d={barPath(i * band + (band - w) / 2, height - h, w, h, 2)}
                  fill={highlightLast && i === values.length - 1 ? color : `color-mix(in srgb, ${color} 38%, transparent)`}
                />
              );
            })
          ) : (
            <>
              <path
                d={values
                  .map((v, i) => `${i ? 'L' : 'M'}${((i / Math.max(1, values.length - 1)) * (width - 6) + 3).toFixed(1)},${(3 + (height - 6) - ((v - min) / (max - min || 1)) * (height - 6)).toFixed(1)}`)
                  .join('')}
                fill="none"
                stroke={color}
                strokeWidth={1.75}
                strokeLinejoin="round"
                strokeLinecap="round"
              />
              <circle cx={width - 3} cy={3 + (height - 6) - ((values[values.length - 1] - min) / (max - min || 1)) * (height - 6)} r={3} fill={color} />
            </>
          )}
        </svg>
      )}
    </div>
  );
}

// ── Ranked horizontal bars ──────────────────────────────────────────────────

export function RankList({ items, format, color = 'var(--work)', onSelect, empty }: {
  items: { key: string | number; label: ReactNode; value: number; color?: string | null; sub?: ReactNode }[];
  format: (v: number) => string;
  color?: string;
  onSelect?: (key: string | number) => void;
  empty?: ReactNode;
}) {
  const max = Math.max(1, ...items.map((i) => i.value));
  if (!items.length) return <>{empty}</>;
  return (
    <div className="rank-list">
      {items.map((it) => {
        const Tag = onSelect ? 'button' : 'div';
        return (
          <Tag key={it.key} className={`rank-row ${onSelect ? 'interactive' : ''}`} onClick={onSelect ? () => onSelect(it.key) : undefined}>
            <div className="rank-top">
              <span className="rank-label truncate">
                {it.color && <span className="avatar-dot" style={{ background: it.color }} />}
                {it.label}
              </span>
              {it.sub && <span className="rank-sub">{it.sub}</span>}
              <span className="rank-value">{format(it.value)}</span>
            </div>
            <div className="rank-track">
              <span style={{ width: `${(it.value / max) * 100}%`, background: it.color ?? color }} />
            </div>
          </Tag>
        );
      })}
    </div>
  );
}

// ── Rating distribution (a single stacked bar with a 2px gap) ────────────────

export function RatingBar({ good, okay, bad, height = 10 }: { good: number; okay: number; bad: number; height?: number }) {
  const total = good + okay + bad;
  if (!total) return <div className="rating-bar rb-empty" style={{ height }} />;
  return (
    <div className="rating-bar" style={{ height }} role="img" aria-label={`${good} good, ${okay} okay, ${bad} bad`}>
      {good > 0 && <span style={{ flex: good, background: 'var(--good)' }} />}
      {okay > 0 && <span style={{ flex: okay, background: 'var(--okay)' }} />}
      {bad > 0 && <span style={{ flex: bad, background: 'var(--bad)' }} />}
    </div>
  );
}

export function Legend({ items }: { items: { label: ReactNode; color: string }[] }) {
  return (
    <div className="legend">
      {items.map((i, k) => (
        <span key={k} className="legend-item">
          <span className="legend-swatch" style={{ background: i.color }} />
          {i.label}
        </span>
      ))}
    </div>
  );
}
