import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Home, MapPin, Plane, Plus, Star, Trash2 } from 'lucide-react';
import { api, refreshAll } from '../lib/api.ts';
import { useUI } from '../lib/ui.tsx';
import { useDocumentTitle } from '../lib/hooks.ts';
import { dateRange, num, plural, shortDate } from '../lib/format.ts';
import { Card, Empty, ErrorBox, PageHead, PageSkeleton, Stat } from '../components/ui/primitives.tsx';
import { Segmented } from '../components/ui/Segmented.tsx';
import { Dialog } from '../components/ui/Dialog.tsx';
import { Legend } from '../components/charts/charts.tsx';
import { TravelMap, type MapView } from '../components/TravelMap.tsx';
import { placeLabel, PlaceSearch, useTravel } from '../features/lifeForms.tsx';
import { diffDays } from '../../shared/dates.ts';
import type { CityResult, Place } from '../../shared/types.ts';

interface Trip {
  key: string;
  title: string;
  start: string;
  end: string;
  places: Place[];
  days: number;
}

export default function Travel() {
  const ui = useUI();
  useDocumentTitle('Travel');
  const q = useTravel();
  const [view, setView] = useState<MapView>('world');
  const [params, setParams] = useSearchParams();
  const selectedId = Number(params.get('place')) || null;
  const select = (id: number | null) => setParams(id ? { place: String(id) } : {}, { replace: true });

  // Visits sharing a name within a few days of each other are one trip.
  const trips = useMemo(() => {
    if (!q.data) return [];
    const visits = q.data.places.flatMap((p) => p.visits.map((v) => ({ v, p }))).sort((a, b) => b.v.startDate.localeCompare(a.v.startDate));
    const out: Trip[] = [];
    for (const { v, p } of visits) {
      const t = v.title ? out.find((x) => x.title === v.title && diffDays(v.endDate, x.start) <= 14 && diffDays(x.end, v.startDate) <= 14) : null;
      if (t) {
        if (!t.places.includes(p)) t.places.push(p);
        if (v.startDate < t.start) t.start = v.startDate;
        if (v.endDate > t.end) t.end = v.endDate;
        t.days = diffDays(t.start, t.end) + 1;
      } else out.push({ key: `${v.id}`, title: v.title ?? p.name, start: v.startDate, end: v.endDate, places: [p], days: diffDays(v.startDate, v.endDate) + 1 });
    }
    return out;
  }, [q.data]);

  if (q.isError) return <div className="page"><ErrorBox error={q.error} retry={() => q.refetch()} /></div>;
  if (!q.data) return <PageSkeleton />;
  const { places, allTime, year } = q.data;
  const bucket = places.filter((p) => p.status === 'want');
  const selected = places.find((p) => p.id === selectedId) ?? null;
  const yearNum = new Date().getFullYear();
  const byYear = new Map<string, Trip[]>();
  for (const t of trips) byYear.set(t.start.slice(0, 4), [...(byYear.get(t.start.slice(0, 4)) ?? []), t]);

  const dropPin = async (pt: { lat: number; lng: number }) => {
    try {
      const city = await api.get<CityResult | null>(`/cities/near?lat=${pt.lat}&lng=${pt.lng}`);
      if (!city) return ui.toast('No town near there — try searching by name instead.');
      const existing = places.find((p) => p.name === city.name && Math.abs(p.lat - city.lat) < 0.05 && Math.abs(p.lng - city.lng) < 0.05);
      if (existing) return select(existing.id);
      ui.openAdd('trip', { direct: true, city });
    } catch (e) {
      ui.error(e);
    }
  };
  const pickSearch = (p: { kind: 'place'; place: Place } | { kind: 'city'; city: CityResult }) => {
    if (p.kind === 'place') select(p.place.id);
    else ui.openAdd('trip', { direct: true, city: p.city });
  };

  return (
    <div className="page">
      <PageHead
        title="Travel"
        sub={allTime.places ? `${plural(allTime.places, 'place')} · ${plural(allTime.countries, 'country', 'countries')}${allTime.states > 1 ? ` · ${allTime.states} US states` : ''}` : 'Every place you’ve been, and everywhere you want to go.'}
        actions={
          <>
            <button className="btn btn-secondary" onClick={() => ui.openAdd('trip', { direct: true, status: 'want' })}>
              <Star /> Bucket list
            </button>
            <button className="btn btn-primary" onClick={() => ui.openAdd('trip', { direct: true })}>
              <Plus /> Add trip
            </button>
          </>
        }
      />

      {allTime.places > 0 || bucket.length > 0 ? (
        <div className="card">
          <div className="stat-row" style={{ '--cols': 4 } as React.CSSProperties}>
            <Stat label="Places" value={num(allTime.places)} foot={`${plural(allTime.countries, 'country', 'countries')}${allTime.states ? ` · ${plural(allTime.states, 'state')}` : ''}`} />
            <Stat label={`${yearNum} so far`} value={plural(year.trips, 'trip')} foot={year.tripDays ? `${plural(year.tripDays, 'day')} away${year.newPlaces.length ? ` · ${year.newPlaces.length} new` : ''}` : 'No trips yet this year'} />
            <Stat label="Farthest from home" value={allTime.farthest ? allTime.farthest.name : '—'} foot={allTime.farthest ? `${num(allTime.farthest.miles)} miles` : allTime.home ? 'Log a trip' : 'Set a home place to see this'} />
            <Stat label="Bucket list" value={num(bucket.length)} foot={bucket.length ? bucket.slice(0, 3).map((p) => p.name).join(', ') : 'Add places to dream about'} />
          </div>
        </div>
      ) : null}

      <Card
        className="section tmap-card"
        title="Map"
        actions={
          <Segmented
            size="sm"
            value={view}
            onChange={setView}
            options={[
              { value: 'world', label: 'World' },
              { value: 'us', label: 'USA' },
            ]}
          />
        }
      >
        <div className="tmap-search">
          <PlaceSearch places={places} onPick={pickSearch} placeholder="Find a place or city…" />
        </div>
        <TravelMap places={places} view={view} selectedId={selectedId} onSelect={(p) => select(p.id)} onPickPoint={dropPin} />
        <div className="row wrap tmap-foot">
          <Legend
            items={[
              { label: 'Been there', color: 'var(--travel)' },
              { label: 'Bucket list', color: 'transparent' },
              { label: 'Home', color: 'var(--text)' },
            ]}
          />
          <span className="spacer" />
          <span className="faint" style={{ fontSize: 12 }}>
            Tap the map to drop a pin · double-click to zoom
          </span>
        </div>
      </Card>

      {!places.length ? (
        <Card className="section">
          <Empty icon={<MapPin />} title="Start your map" action={<button className="btn btn-primary btn-sm" onClick={() => ui.openAdd('trip', { direct: true, status: 'home' })}>Set your home</button>}>
            Set where you live, then add trips — past ones count too. Countries and states fill in as you go.
          </Empty>
        </Card>
      ) : (
        <div className="grid grid-12 section">
          <Card className="span-7" flush title="Trips" sub={`${plural(trips.length, 'trip')} logged`}>
            {trips.length ? (
              <div className="trip-list">
                {[...byYear.entries()].map(([y, ts]) => (
                  <div key={y}>
                    <div className="trip-year">
                      <span>{y}</span>
                      <span className="faint">
                        {plural(ts.length, 'trip')} · {plural(ts.reduce((a, t) => a + t.days, 0), 'day')}
                      </span>
                    </div>
                    {ts.map((t) => (
                      <button key={t.key} className="trip-row" onClick={() => select(t.places[0].id)}>
                        <span className="trip-dot" aria-hidden>
                          <Plane />
                        </span>
                        <span className="grow" style={{ minWidth: 0 }}>
                          <span className="title truncate">{t.title}</span>
                          <span className="sub truncate">{t.places.map((p) => placeLabel(p)).join(' → ')}</span>
                        </span>
                        <span className="trip-when num">
                          {dateRange(t.start, t.end)}
                          <span className="faint">{plural(t.days, 'day')}</span>
                        </span>
                      </button>
                    ))}
                  </div>
                ))}
              </div>
            ) : (
              <Empty small icon={<Plane />} title="No trips yet">
                Add past trips too — the map fills in either way.
              </Empty>
            )}
          </Card>
          <Card className="span-5" flush title="Bucket list" actions={<button className="btn btn-ghost btn-sm" onClick={() => ui.openAdd('trip', { direct: true, status: 'want' })}><Plus /> Add</button>}>
            {bucket.length ? (
              <div className="bucket-list">
                {bucket.map((p) => (
                  <div key={p.id} className="bucket-row">
                    <button className="grow bucket-main" onClick={() => select(p.id)}>
                      <span className="bucket-ring" aria-hidden />
                      <span style={{ minWidth: 0 }}>
                        <span className="title truncate">{p.name}</span>
                        <span className="sub truncate">{p.notes ?? (p.countryCode === 'US' ? p.region : p.country)}</span>
                      </span>
                    </button>
                    <button className="btn btn-secondary btn-sm" onClick={() => ui.openAdd('trip', { direct: true, place: p })}>
                      Been there
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <Empty small icon={<Star />} title="Where to next?">
                Places you want to go show as hollow pins.
              </Empty>
            )}
          </Card>
        </div>
      )}

      <Dialog open={!!selected} onClose={() => select(null)} title={selected?.name ?? ''} width={480}>
        {selected && <PlaceDetail p={selected} onClose={() => select(null)} />}
      </Dialog>
    </div>
  );
}

function PlaceDetail({ p, onClose }: { p: Place; onClose: () => void }) {
  const ui = useUI();
  const [notes, setNotes] = useState(p.notes ?? '');
  const act = async (fn: () => Promise<unknown>, msg: string) => {
    try {
      await fn();
      await refreshAll();
      ui.toast(msg);
    } catch (e) {
      ui.error(e);
    }
  };
  const saveNotes = () => notes !== (p.notes ?? '') && act(() => api.put(`/places/${p.id}`, { notes: notes.trim() || null }), 'Notes saved');
  const removeVisit = async (id: number) => {
    await api.del(`/visits/${id}`);
    ui.deleted('Visit', 'visits', id);
  };
  const removePlace = async () => {
    const ok = await ui.confirm({ title: `Remove ${p.name}?`, body: p.visits.length ? `Its ${plural(p.visits.length, 'visit')} will be removed too. You can restore it from Recently Deleted.` : undefined, confirm: 'Remove', danger: true });
    if (!ok) return;
    await api.del(`/places/${p.id}`);
    onClose();
    ui.deleted('Place', 'places', p.id);
  };

  return (
    <div className="stack-16">
      <div className="row wrap" style={{ gap: 8 }}>
        <span className="faint">{[p.countryCode === 'US' ? p.region : null, p.country].filter(Boolean).join(', ')}</span>
        <span className="spacer" />
        {p.status === 'home' ? (
          <span className="badge">
            <Home size={12} /> Home
          </span>
        ) : p.status === 'want' ? (
          <span className="badge">
            <Star size={12} /> Bucket list
          </span>
        ) : (
          <span className="badge badge-travel">
            <MapPin size={12} /> Been here
          </span>
        )}
      </div>
      {p.visits.length > 0 && (
        <div className="stat-row" style={{ '--cols': 3 } as React.CSSProperties}>
          <Stat size="sm" label="Visits" value={p.visits.length} />
          <Stat size="sm" label="Days" value={p.days} />
          <Stat size="sm" label="First" value={shortDate(p.firstVisit!, true)} />
        </div>
      )}
      {p.visits.length > 0 && (
        <div className="place-visits">
          {p.visits.map((v) => (
            <div key={v.id} className="place-visit">
              <span className="grow" style={{ minWidth: 0 }}>
                <span className="title truncate">{v.title ?? p.name}</span>
                <span className="sub">
                  {dateRange(v.startDate, v.endDate)} · {plural(diffDays(v.startDate, v.endDate) + 1, 'day')}
                </span>
              </span>
              <button className="btn btn-ghost btn-icon btn-sm" aria-label="Delete visit" onClick={() => removeVisit(v.id)}>
                <Trash2 />
              </button>
            </div>
          ))}
        </div>
      )}
      <textarea className="textarea" rows={2} placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={saveNotes} />
      <div className="form-foot" style={{ flexWrap: 'wrap' }}>
        <button className="btn btn-ghost btn-danger" style={{ marginRight: 'auto' }} onClick={removePlace}>
          <Trash2 /> Remove
        </button>
        {p.status !== 'home' && (
          <button className="btn btn-secondary" onClick={() => act(() => api.put(`/places/${p.id}`, { status: 'home' }), `${p.name} is now home`)}>
            <Home /> Set as home
          </button>
        )}
        {p.status === 'visited' && !p.visits.length && (
          <button className="btn btn-secondary" onClick={() => act(() => api.put(`/places/${p.id}`, { status: 'want' }), 'Moved to your bucket list')}>
            <Star /> Bucket list
          </button>
        )}
        <button
          className="btn btn-primary"
          onClick={() => {
            onClose();
            window.setTimeout(() => ui.openAdd('trip', { direct: true, place: p }), 60);
          }}
        >
          <Plus /> {p.status === 'want' ? 'I went!' : 'Log a visit'}
        </button>
      </div>
    </div>
  );
}
