// An offline map of everywhere you've been. Geography ships with the app
// (Natural Earth via world-atlas / us-atlas), so nothing is fetched from a tile
// server and no location ever leaves the machine.

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { geoAlbersUsa, geoContains, geoGraticule10, geoNaturalEarth1, geoPath, type GeoPermissibleObjects, type GeoProjection } from 'd3-geo';
import { feature } from 'topojson-client';
import type { FeatureCollection, Feature, Geometry } from 'geojson';
import { Minus, Plus, RotateCcw } from 'lucide-react';
import { useElementWidth } from '../lib/hooks.ts';
import { useTooltip } from './ui/Tooltip.tsx';
import { dateRange, plural } from '../lib/format.ts';
import type { Place } from '../../shared/types.ts';

export type MapView = 'world' | 'us';
type Geo = FeatureCollection<Geometry, { name: string }>;

async function loadAtlas(view: MapView): Promise<Geo> {
  if (view === 'world') {
    const topo = (await import('world-atlas/countries-50m.json')).default as unknown as Parameters<typeof feature>[0] & { objects: { countries: never } };
    const all = feature(topo, topo.objects.countries) as unknown as Geo;
    // Antarctica takes a fifth of the frame and nobody logs a weekend there.
    return { ...all, features: all.features.filter((f) => String(f.id) !== '010') };
  }
  const topo = (await import('us-atlas/states-10m.json')).default as unknown as Parameters<typeof feature>[0] & { objects: { states: never } };
  return feature(topo, topo.objects.states) as unknown as Geo;
}

const norm = (s: string | null | undefined) => (s ?? '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z]/g, '');
const ALIASES: Record<string, string> = {
  unitedstates: 'unitedstatesofamerica',
  czechrepublic: 'czechia',
  bosniaherzegovina: 'bosniaandherz',
  dominicanrepublic: 'dominicanrep',
  southkorea: 'southkorea',
  northmacedonia: 'macedonia',
  centralafricanrepublic: 'centralafricanrep',
};

interface Props {
  places: Place[];
  view: MapView;
  selectedId?: number | null;
  onSelect?: (p: Place) => void;
  onPickPoint?: (pt: { lat: number; lng: number }) => void;
  height?: number;
  /** Compact, non-interactive rendering (e.g. Year in Review). */
  still?: boolean;
  arcs?: boolean;
}

export function TravelMap({ places, view, selectedId, onSelect, onPickPoint, height, still, arcs = true }: Props) {
  const [ref, width] = useElementWidth<HTMLDivElement>();
  const tip = useTooltip();
  const atlas = useQuery({ queryKey: ['atlas', view], queryFn: () => loadAtlas(view), staleTime: Infinity, gcTime: Infinity });
  const H = height ?? Math.round(Math.min(540, Math.max(240, width * (view === 'world' ? 0.46 : 0.6))));
  const [t, setT] = useState({ k: 1, x: 0, y: 0 });
  const svgRef = useRef<SVGSVGElement>(null);

  // Reset zoom when the view or size changes.
  useEffect(() => setT({ k: 1, x: 0, y: 0 }), [view, width]);

  const projection: GeoProjection | null = useMemo(() => {
    if (!width || !atlas.data) return null;
    if (view === 'us') return geoAlbersUsa().fitExtent([[8, 8], [width - 8, H - 8]], atlas.data);
    return geoNaturalEarth1().fitExtent([[6, 6], [width - 6, H - 6]], atlas.data);
  }, [width, H, view, atlas.data]);
  const path = useMemo(() => (projection ? geoPath(projection) : null), [projection]);

  // Which countries / states you've been to.
  const been = useMemo(() => places.filter((p) => p.status !== 'want'), [places]);
  const visitedIds = useMemo(() => {
    const out = new Set<string>();
    if (!atlas.data) return out;
    for (const f of atlas.data.features) {
      const n = norm(f.properties?.name);
      const hit = been.some((p) =>
        view === 'us'
          ? p.countryCode === 'US' && norm(p.region) === n
          : norm(p.country) === n || ALIASES[norm(p.country)] === n || geoContains(f as GeoPermissibleObjects, [p.lng, p.lat]),
      );
      if (hit) out.add(String(f.id ?? f.properties?.name));
    }
    return out;
  }, [atlas.data, been, view]);

  const home = places.find((p) => p.status === 'home') ?? null;
  const pins = useMemo(() => {
    if (!projection) return [];
    return places
      .map((p) => ({ p, xy: projection([p.lng, p.lat]) }))
      .filter((x): x is { p: Place; xy: [number, number] } => !!x.xy)
      .sort((a, b) => rank(a.p) - rank(b.p) || a.xy[1] - b.xy[1]);
  }, [places, projection]);

  const clamp = useCallback(
    (k: number, x: number, y: number) => {
      const kk = Math.max(1, Math.min(24, k));
      return { k: kk, x: Math.min(0, Math.max(width - width * kk, x)), y: Math.min(0, Math.max(H - H * kk, y)) };
    },
    [width, H],
  );
  const zoomAt = useCallback((factor: number, cx: number, cy: number) => setT((s) => clamp(s.k * factor, cx - ((cx - s.x) * (s.k * factor)) / s.k, cy - ((cy - s.y) * (s.k * factor)) / s.k)), [clamp]);

  // ⌘/Ctrl + wheel (and trackpad pinch, which arrives as ctrl+wheel) zooms; plain wheel scrolls the page.
  const [hint, setHint] = useState(false);
  useEffect(() => {
    const el = svgRef.current;
    if (!el || still) return;
    let timer = 0;
    const on = (e: WheelEvent) => {
      if (!(e.ctrlKey || e.metaKey)) {
        setHint(true);
        window.clearTimeout(timer);
        timer = window.setTimeout(() => setHint(false), 1200);
        return;
      }
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.01), e.clientX - r.left, e.clientY - r.top);
    };
    el.addEventListener('wheel', on, { passive: false });
    return () => {
      el.removeEventListener('wheel', on);
      window.clearTimeout(timer);
    };
  }, [zoomAt, still, projection]);

  // Drag to pan, two fingers to pinch.
  const pointers = useRef(new Map<number, { x: number; y: number }>());
  const gesture = useRef<{ moved: number; start: { k: number; x: number; y: number }; dist?: number; mid?: { x: number; y: number }; origin?: { x: number; y: number } } | null>(null);
  const local = (e: React.PointerEvent) => {
    const r = svgRef.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const onPointerDown = (e: React.PointerEvent) => {
    if (still) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    if (pts.length === 1) gesture.current = { moved: 0, start: t, origin: pts[0] };
    else if (pts.length === 2) {
      const [a, b] = pts;
      gesture.current = { moved: 99, start: t, dist: Math.hypot(a.x - b.x, a.y - b.y), mid: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 } };
    }
  };
  const onPointerMove = (e: React.PointerEvent) => {
    if (!pointers.current.has(e.pointerId) || !gesture.current) return;
    pointers.current.set(e.pointerId, local(e));
    const pts = [...pointers.current.values()];
    const g = gesture.current;
    if (pts.length === 2 && g.dist && g.mid) {
      const [a, b] = pts;
      const f = Math.hypot(a.x - b.x, a.y - b.y) / g.dist;
      const k = g.start.k * f;
      setT(clamp(k, g.mid.x - ((g.mid.x - g.start.x) * k) / g.start.k, g.mid.y - ((g.mid.y - g.start.y) * k) / g.start.k));
    } else if (pts.length === 1 && g.origin) {
      const dx = pts[0].x - g.origin.x;
      const dy = pts[0].y - g.origin.y;
      g.moved = Math.max(g.moved, Math.hypot(dx, dy));
      if (g.moved > 4) {
        if (!svgRef.current!.hasPointerCapture(e.pointerId)) svgRef.current!.setPointerCapture(e.pointerId);
        setT(clamp(g.start.k, g.start.x + dx, g.start.y + dy));
      }
    }
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const g = gesture.current;
    pointers.current.delete(e.pointerId);
    if (pointers.current.size === 0) {
      // A tap on empty map drops a pin.
      if (g && g.moved <= 4 && onPickPoint && projection && (e.target as Element).closest('.tm-pin') == null) {
        const p = local(e);
        const ll = projection.invert?.([(p.x - t.x) / t.k, (p.y - t.y) / t.k]);
        if (ll && Number.isFinite(ll[0]) && Number.isFinite(ll[1])) onPickPoint({ lng: ll[0], lat: ll[1] });
      }
      gesture.current = null;
    }
  };

  const showPin = (e: React.MouseEvent, p: Place) => {
    const last = p.visits[0];
    tip.show({
      x: e.clientX,
      y: e.clientY,
      content: (
        <>
          <div className="tip-title">{p.name}</div>
          <div className="tip-row faint">{[p.countryCode === 'US' ? p.region : null, p.country].filter(Boolean).join(', ')}</div>
          <div className="tip-row">
            {p.status === 'home' ? 'Home' : p.status === 'want' ? 'On your bucket list' : `${plural(p.visits.length, 'visit')} · ${plural(p.days, 'day')}`}
          </div>
          {last && p.status !== 'want' && <div className="tip-row faint">Last: {dateRange(last.startDate, last.endDate)}</div>}
        </>
      ),
    });
  };

  const graticule = useMemo(() => (path && view === 'world' ? path(geoGraticule10()) : null), [path, view]);
  const arcPaths = useMemo(() => {
    if (!path || !home || !arcs || view !== 'world') return [];
    return been.filter((p) => p.id !== home.id).map((p) => ({ id: p.id, d: path({ type: 'LineString', coordinates: [[home.lng, home.lat], [p.lng, p.lat]] }) ?? '' }));
  }, [path, home, been, arcs, view]);
  const labels = !still && t.k >= 3.5;

  return (
    <div ref={ref} className={`tmap ${still ? 'still' : ''}`} style={{ height: H }}>
      {!atlas.data || !path || !width ? (
        <div className="skeleton" style={{ height: H, borderRadius: 10 }} aria-hidden />
      ) : (
        <svg
          ref={svgRef}
          width={width}
          height={H}
          role="img"
          aria-label={`Map of ${plural(been.filter((p) => p.status === 'visited').length, 'place')} you've been`}
          style={{ touchAction: still ? 'auto' : t.k > 1 ? 'none' : 'pan-y' }}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={(e) => (pointers.current.delete(e.pointerId), (gesture.current = null))}
          onDoubleClick={(e) => {
            if (still) return;
            const r = svgRef.current!.getBoundingClientRect();
            zoomAt(2, e.clientX - r.left, e.clientY - r.top);
          }}
          onMouseLeave={() => tip.hide()}
        >
          <g transform={`translate(${t.x},${t.y}) scale(${t.k})`}>
            {graticule && <path d={graticule} className="tm-grat" />}
            {atlas.data.features.map((f: Feature<Geometry, { name: string }>, i) => {
              const id = String(f.id ?? f.properties?.name);
              return <path key={`${id}-${i}`} d={path(f) ?? ''} className={`tm-land ${visitedIds.has(id) ? 'been' : ''}`} />;
            })}
            {arcPaths.map((a) => (
              <path key={a.id} d={a.d} className={`tm-arc ${selectedId === a.id ? 'on' : ''}`} />
            ))}
          </g>
          {pins.map(({ p, xy }) => {
            const x = xy[0] * t.k + t.x;
            const y = xy[1] * t.k + t.y;
            if (x < -20 || y < -20 || x > width + 20 || y > H + 20) return null;
            const sel = selectedId === p.id;
            return (
              <g
                key={p.id}
                className={`tm-pin ${p.status} ${sel ? 'sel' : ''}`}
                transform={`translate(${x},${y})`}
                onMouseMove={(e) => showPin(e, p)}
                onMouseLeave={() => tip.hide()}
                onClick={(e) => {
                  e.stopPropagation();
                  onSelect?.(p);
                }}
                role={onSelect ? 'button' : undefined}
                tabIndex={onSelect ? 0 : undefined}
                aria-label={onSelect ? `${p.name}${p.status === 'want' ? ', bucket list' : p.status === 'home' ? ', home' : ''}` : undefined}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect?.(p);
                  }
                }}
              >
                <circle r={14} className="tm-hit" />
                {sel && <circle r={11} className="tm-halo" />}
                {p.status === 'home' ? (
                  <path d="M0,-7.5 L7,-1.5 L5,-1.5 L5,5.5 L-5,5.5 L-5,-1.5 L-7,-1.5 Z" className="tm-home" />
                ) : (
                  <circle r={p.status === 'want' ? 4.5 : still ? 4 : 5} className="tm-dot" />
                )}
                {labels && (
                  <text y={-11} textAnchor="middle" className="tm-label">
                    {p.name}
                  </text>
                )}
              </g>
            );
          })}
        </svg>
      )}
      {!still && atlas.data && (
        <>
          <div className="tm-controls">
            <button className="btn btn-secondary btn-icon btn-sm" aria-label="Zoom in" onClick={() => zoomAt(1.8, width / 2, H / 2)}>
              <Plus />
            </button>
            <button className="btn btn-secondary btn-icon btn-sm" aria-label="Zoom out" onClick={() => zoomAt(1 / 1.8, width / 2, H / 2)}>
              <Minus />
            </button>
            {t.k > 1 && (
              <button className="btn btn-secondary btn-icon btn-sm" aria-label="Reset zoom" onClick={() => setT({ k: 1, x: 0, y: 0 })}>
                <RotateCcw />
              </button>
            )}
          </div>
          <div className={`tm-hint ${hint ? 'show' : ''}`} aria-hidden>
            Hold ⌘ or Ctrl and scroll to zoom
          </div>
        </>
      )}
    </div>
  );
}

const rank = (p: Place) => (p.status === 'want' ? 0 : p.status === 'visited' ? 1 : 2);
