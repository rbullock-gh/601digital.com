// Travel: places on a map and dated visits to them. City search runs against a
// bundled offline dataset (GeoNames, 138k places), so nothing leaves the machine.

import { createRequire } from 'node:module';
import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { addDays, diffDays, isISODate, maxDate, minDate, type ISODate, type Range } from '../../shared/dates.ts';
import type { CityResult, Place, PlaceStatus, Visit } from '../../shared/types.ts';

const US_STATES: Record<string, string> = {
  AL: 'Alabama', AK: 'Alaska', AZ: 'Arizona', AR: 'Arkansas', CA: 'California', CO: 'Colorado', CT: 'Connecticut',
  DE: 'Delaware', DC: 'District of Columbia', FL: 'Florida', GA: 'Georgia', HI: 'Hawaii', ID: 'Idaho', IL: 'Illinois',
  IN: 'Indiana', IA: 'Iowa', KS: 'Kansas', KY: 'Kentucky', LA: 'Louisiana', ME: 'Maine', MD: 'Maryland',
  MA: 'Massachusetts', MI: 'Michigan', MN: 'Minnesota', MS: 'Mississippi', MO: 'Missouri', MT: 'Montana',
  NE: 'Nebraska', NV: 'Nevada', NH: 'New Hampshire', NJ: 'New Jersey', NM: 'New Mexico', NY: 'New York',
  NC: 'North Carolina', ND: 'North Dakota', OH: 'Ohio', OK: 'Oklahoma', OR: 'Oregon', PA: 'Pennsylvania',
  RI: 'Rhode Island', SC: 'South Carolina', SD: 'South Dakota', TN: 'Tennessee', TX: 'Texas', UT: 'Utah',
  VT: 'Vermont', VA: 'Virginia', WA: 'Washington', WV: 'West Virginia', WI: 'Wisconsin', WY: 'Wyoming', PR: 'Puerto Rico',
};

const regionNames = new Intl.DisplayNames(['en'], { type: 'region' });
export function countryName(code: string | null | undefined): string | null {
  if (!code) return null;
  try {
    return regionNames.of(code.toUpperCase()) ?? code;
  } catch {
    return code;
  }
}

// ── Offline city search ─────────────────────────────────────────────────────

interface City {
  name: string;
  altName?: string;
  country: string;
  adminCode: string;
  population: number;
  loc: { coordinates: [number, number] };
}
let cities: (City & { key: string })[] | null = null;
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

function loadCities() {
  if (!cities) {
    const require = createRequire(import.meta.url);
    const raw = require('all-the-cities') as City[];
    cities = raw.map((c) => ({ ...c, key: fold(c.name) })).sort((a, b) => b.population - a.population);
  }
  return cities;
}

export function searchCities(q: string, limit = 8): CityResult[] {
  const query = fold(q.trim());
  if (query.length < 2) return [];
  // "Paris, FR" / "Jackson MS" narrow by country or state.
  const [namePart, qualifier] = query.split(/\s*,\s*|\s+(?=[a-z]{2}$)/);
  const qual = qualifier?.trim();
  const out: CityResult[] = [];
  const push = (c: City) => {
    const region = c.country === 'US' ? US_STATES[c.adminCode] ?? c.adminCode : null;
    out.push({
      name: c.name,
      region,
      country: countryName(c.country) ?? c.country,
      countryCode: c.country,
      lat: c.loc.coordinates[1],
      lng: c.loc.coordinates[0],
      population: c.population,
    });
  };
  const matchesQual = (c: City) => {
    if (!qual) return true;
    const q2 = qual.toLowerCase();
    return c.country.toLowerCase() === q2 || c.adminCode.toLowerCase() === q2 || fold(countryName(c.country) ?? '').startsWith(q2) || fold(US_STATES[c.adminCode] ?? '').startsWith(q2);
  };
  const all = loadCities();
  for (const c of all) {
    if (c.key.startsWith(namePart) && matchesQual(c)) push(c);
    if (out.length >= limit) return out;
  }
  for (const c of all) {
    if (!c.key.startsWith(namePart) && c.key.includes(namePart) && matchesQual(c)) push(c);
    if (out.length >= limit) break;
  }
  return out;
}

/** The most notable city near a point — used when a pin is dropped on the map. */
export function nearestCity(lat: number, lng: number): CityResult | null {
  if (!(Math.abs(lat) <= 90) || !(Math.abs(lng) <= 180)) throw badRequest('Invalid coordinates');
  let best: { c: City; score: number } | null = null;
  for (const c of loadCities()) {
    const [x, y] = c.loc.coordinates;
    const dLat = y - lat;
    if (Math.abs(dLat) > 3) continue;
    const dLng = (x - lng) * Math.cos((lat * Math.PI) / 180);
    const d = Math.sqrt(dLat * dLat + dLng * dLng);
    if (d > 3) continue;
    // Prefer bigger places unless a small one is much closer.
    const score = d / Math.log10(Math.max(c.population, 1000) + 10);
    if (!best || score < best.score) best = { c, score };
  }
  if (!best) return null;
  const c = best.c;
  return {
    name: c.name,
    region: c.country === 'US' ? US_STATES[c.adminCode] ?? c.adminCode : null,
    country: countryName(c.country) ?? c.country,
    countryCode: c.country,
    lat: c.loc.coordinates[1],
    lng: c.loc.coordinates[0],
    population: c.population,
  };
}

// ── Places & visits ─────────────────────────────────────────────────────────

interface PlaceRow {
  id: number;
  name: string;
  region: string | null;
  country: string | null;
  country_code: string | null;
  lat: number;
  lng: number;
  status: PlaceStatus;
  notes: string | null;
}
interface VisitRow {
  id: number;
  place_id: number;
  start_date: string;
  end_date: string;
  title: string | null;
  notes: string | null;
}

const mapVisit = (v: VisitRow): Visit => ({ id: v.id, placeId: v.place_id, startDate: v.start_date, endDate: v.end_date, title: v.title, notes: v.notes });

export function listPlaces(): Place[] {
  const places = db().prepare('SELECT * FROM places WHERE deleted_at IS NULL ORDER BY name').all() as PlaceRow[];
  const visits = db().prepare('SELECT * FROM visits WHERE deleted_at IS NULL ORDER BY start_date DESC').all() as VisitRow[];
  const byPlace = new Map<number, Visit[]>();
  for (const v of visits) byPlace.set(v.place_id, [...(byPlace.get(v.place_id) ?? []), mapVisit(v)]);
  return places.map((p) => {
    const vs = byPlace.get(p.id) ?? [];
    return {
      id: p.id,
      name: p.name,
      region: p.region,
      country: p.country,
      countryCode: p.country_code,
      lat: p.lat,
      lng: p.lng,
      status: p.status,
      notes: p.notes,
      visits: vs,
      firstVisit: vs.length ? vs[vs.length - 1].startDate : null,
      lastVisit: vs.length ? vs[0].endDate : null,
      days: vs.reduce((a, v) => a + diffDays(v.startDate, v.endDate) + 1, 0),
    };
  });
}

export function getPlace(id: number): Place {
  const p = listPlaces().find((x) => x.id === id);
  if (!p) throw notFound('Place not found');
  return p;
}

export interface PlaceInput {
  name: string;
  region?: string | null;
  country?: string | null;
  countryCode?: string | null;
  lat: number;
  lng: number;
  status?: PlaceStatus;
  notes?: string | null;
}

function validatePlace(p: PlaceInput) {
  if (!p.name?.trim()) throw badRequest('Name the place');
  if (!(Math.abs(p.lat) <= 90) || !(Math.abs(p.lng) <= 180)) throw badRequest('Invalid coordinates');
  if (p.status && !['visited', 'want', 'home'].includes(p.status)) throw badRequest('Invalid status');
}

export function createPlace(p: PlaceInput): Place {
  validatePlace(p);
  // The same city twice becomes one place.
  const existing = db()
    .prepare('SELECT id FROM places WHERE deleted_at IS NULL AND name = ? COLLATE NOCASE AND ABS(lat - ?) < 0.05 AND ABS(lng - ?) < 0.05')
    .get(p.name.trim(), p.lat, p.lng) as { id: number } | undefined;
  if (existing) return updatePlace(existing.id, { status: p.status });
  if (p.status === 'home') db().prepare("UPDATE places SET status = 'visited' WHERE status = 'home'").run();
  const r = db()
    .prepare('INSERT INTO places (name, region, country, country_code, lat, lng, status, notes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
    .run(p.name.trim(), p.region?.trim() || null, p.country?.trim() || null, p.countryCode?.toUpperCase() || null, p.lat, p.lng, p.status ?? 'visited', p.notes?.trim() || null);
  return getPlace(Number(r.lastInsertRowid));
}

export function updatePlace(id: number, patch: Partial<PlaceInput>): Place {
  const cur = getPlace(id);
  const next = { ...cur, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as Place;
  validatePlace(next);
  if (next.status === 'home' && cur.status !== 'home') db().prepare("UPDATE places SET status = 'visited' WHERE status = 'home'").run();
  db()
    .prepare('UPDATE places SET name = ?, region = ?, country = ?, country_code = ?, lat = ?, lng = ?, status = ?, notes = ? WHERE id = ?')
    .run(next.name.trim(), next.region, next.country, next.countryCode, next.lat, next.lng, next.status, next.notes, id);
  return getPlace(id);
}

export interface VisitInput {
  placeId?: number | null;
  place?: PlaceInput | null;
  startDate: ISODate;
  endDate?: ISODate | null;
  title?: string | null;
  notes?: string | null;
}

export function createVisit(v: VisitInput): Visit {
  const placeId = v.placeId ?? (v.place ? createPlace({ ...v.place, status: v.place.status === 'home' ? 'home' : 'visited' }).id : null);
  if (!placeId) throw badRequest('Choose a place');
  const end = v.endDate || v.startDate;
  if (!isISODate(v.startDate) || !isISODate(end)) throw badRequest('Choose dates');
  if (end < v.startDate) throw badRequest('The trip ends before it starts');
  // Going somewhere takes it off the bucket list.
  db().prepare("UPDATE places SET status = 'visited' WHERE id = ? AND status = 'want'").run(placeId);
  const r = db()
    .prepare('INSERT INTO visits (place_id, start_date, end_date, title, notes) VALUES (?, ?, ?, ?, ?)')
    .run(placeId, v.startDate, end, v.title?.trim() || null, v.notes?.trim() || null);
  return mapVisit(db().prepare('SELECT * FROM visits WHERE id = ?').get(r.lastInsertRowid) as VisitRow);
}

export function updateVisit(id: number, v: Partial<VisitInput>): Visit {
  const cur = db().prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow | undefined;
  if (!cur) throw notFound('Visit not found');
  const start = v.startDate ?? cur.start_date;
  const end = v.endDate ?? cur.end_date;
  if (end < start) throw badRequest('The trip ends before it starts');
  db()
    .prepare('UPDATE visits SET place_id = ?, start_date = ?, end_date = ?, title = ?, notes = ? WHERE id = ?')
    .run(v.placeId ?? cur.place_id, start, end, v.title !== undefined ? v.title?.trim() || null : cur.title, v.notes !== undefined ? v.notes?.trim() || null : cur.notes, id);
  return mapVisit(db().prepare('SELECT * FROM visits WHERE id = ?').get(id) as VisitRow);
}

/** Visits overlapping a range, with their place. */
export function visitsIn(r: Range) {
  return db()
    .prepare(
      `SELECT v.*, p.name AS place_name, p.region, p.country, p.lat, p.lng FROM visits v JOIN places p ON p.id = v.place_id
        WHERE v.deleted_at IS NULL AND p.deleted_at IS NULL AND v.start_date <= ? AND v.end_date >= ?
        ORDER BY v.start_date`,
    )
    .all(r.end, r.start)
    .map((row) => {
      const x = row as VisitRow & { place_name: string; region: string | null; country: string | null; lat: number; lng: number };
      return { ...mapVisit(x), placeName: x.place_name, region: x.region, country: x.country, lat: x.lat, lng: x.lng };
    });
}

/** Map of date → place name for every travel day in a range (first place wins). */
export function travelDays(r: Range): Map<string, string> {
  const out = new Map<string, string>();
  for (const v of visitsIn(r)) {
    for (let d = maxDate(v.startDate, r.start); d <= minDate(v.endDate, r.end); d = addDays(d, 1)) if (!out.has(d)) out.set(d, v.placeName);
  }
  return out;
}

function haversineMiles(a: { lat: number; lng: number }, b: { lat: number; lng: number }) {
  const rad = Math.PI / 180;
  const dLat = (b.lat - a.lat) * rad;
  const dLng = (b.lng - a.lng) * rad;
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * 3958.8 * Math.asin(Math.sqrt(h));
}

/** Travel totals for a range, or all-time when no range is given. Home is never counted as a trip or a place visited. */
export function travelStats(today: ISODate, r?: Range) {
  const places = listPlaces();
  const home = places.find((p) => p.status === 'home') ?? null;
  const been = places.filter((p) => p.status === 'visited' && (!r || p.visits.some((v) => v.startDate <= r.end && v.endDate >= r.start)));
  const counted = !r && home ? [...been, home] : been;
  const countries = new Set(counted.map((p) => p.countryCode ?? p.country).filter(Boolean));
  const states = new Set(counted.filter((p) => p.countryCode === 'US' && p.region).map((p) => p.region));
  const span = r ?? { start: '0000-01-01', end: today };
  const trips = visitsIn(span);
  let farthest: { name: string; miles: number } | null = null;
  if (home) for (const p of been) {
    const miles = haversineMiles(home, p);
    if (!farthest || miles > farthest.miles) farthest = { name: p.name, miles: Math.round(miles) };
  }
  return {
    places: been.length,
    countries: countries.size,
    states: states.size,
    bucketList: places.filter((p) => p.status === 'want').length,
    trips: new Set(trips.map((t) => t.title ?? `${t.placeId}-${t.startDate}`)).size,
    tripDays: travelDays(span).size,
    newPlaces: places.filter((p) => p.firstVisit && p.firstVisit >= span.start && p.firstVisit <= span.end).map((p) => p.name),
    farthest: farthest && farthest.miles > 25 ? farthest : null,
    home: home ? { name: home.name } : null,
  };
}
