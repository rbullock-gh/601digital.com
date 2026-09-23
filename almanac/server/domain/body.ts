import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { db, getStore } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { addDays, isISODate, isYearMonth, monthKey, type ISODate, type YearMonth } from '../../shared/dates.ts';
import { MEASUREMENTS, type Angle, type BodyMetric, type PhotoSet } from '../../shared/types.ts';

// ── Body metrics ────────────────────────────────────────────────────────────

const COLS = {
  weightKg: 'weight_kg',
  waistCm: 'waist_cm',
  chestCm: 'chest_cm',
  armsCm: 'arms_cm',
  forearmsCm: 'forearms_cm',
  shouldersCm: 'shoulders_cm',
  thighsCm: 'thighs_cm',
  calvesCm: 'calves_cm',
  neckCm: 'neck_cm',
  bodyFatPct: 'body_fat_pct',
} as const;
export type BodyField = keyof typeof COLS;
export const BODY_FIELDS = Object.keys(COLS) as BodyField[];

interface BodyRow {
  id: number;
  date: string;
  weight_kg: number | null;
  waist_cm: number | null;
  chest_cm: number | null;
  arms_cm: number | null;
  forearms_cm: number | null;
  shoulders_cm: number | null;
  thighs_cm: number | null;
  calves_cm: number | null;
  neck_cm: number | null;
  body_fat_pct: number | null;
  notes: string | null;
}

export function mapBody(r: BodyRow): BodyMetric {
  return {
    id: r.id,
    date: r.date,
    weightKg: r.weight_kg,
    waistCm: r.waist_cm,
    chestCm: r.chest_cm,
    armsCm: r.arms_cm,
    forearmsCm: r.forearms_cm,
    shouldersCm: r.shoulders_cm,
    thighsCm: r.thighs_cm,
    calvesCm: r.calves_cm,
    neckCm: r.neck_cm,
    bodyFatPct: r.body_fat_pct,
    notes: r.notes,
  };
}

export function listBody(from?: ISODate, to?: ISODate): BodyMetric[] {
  return (
    db()
      .prepare('SELECT * FROM body_metrics WHERE deleted_at IS NULL AND date >= ? AND date <= ? ORDER BY date DESC, id DESC')
      .all(from ?? '0000-01-01', to ?? '9999-12-31') as BodyRow[]
  ).map(mapBody);
}

export function getBody(id: number): BodyMetric {
  const r = db().prepare('SELECT * FROM body_metrics WHERE id = ?').get(id) as BodyRow | undefined;
  if (!r) throw notFound('Entry not found');
  return mapBody(r);
}

export type BodyInput = Partial<Omit<BodyMetric, 'id'>> & { date: ISODate };

function normalizeBody(input: BodyInput) {
  if (!isISODate(input.date)) throw badRequest('A valid date is required');
  const values: Record<string, number | null> = {};
  let any = false;
  for (const f of BODY_FIELDS) {
    const v = input[f];
    if (v == null || (v as unknown) === '') values[f] = null;
    else {
      const n = Number(v);
      if (!Number.isFinite(n) || n <= 0 || n > 1000) throw badRequest(`Invalid value for ${f}`);
      values[f] = n;
      any = true;
    }
  }
  if (!any) throw badRequest('Enter at least one value');
  return { date: input.date, values, notes: input.notes?.trim() || null };
}

export function createBody(input: BodyInput): BodyMetric {
  const b = normalizeBody(input);
  const cols = BODY_FIELDS.map((f) => COLS[f]);
  const r = db()
    .prepare(`INSERT INTO body_metrics (date, ${cols.join(', ')}, notes) VALUES (?, ${cols.map(() => '?').join(', ')}, ?)`)
    .run(b.date, ...BODY_FIELDS.map((f) => b.values[f]), b.notes);
  return getBody(Number(r.lastInsertRowid));
}

export function updateBody(id: number, input: BodyInput): BodyMetric {
  getBody(id);
  const b = normalizeBody(input);
  db()
    .prepare(`UPDATE body_metrics SET date = ?, ${BODY_FIELDS.map((f) => `${COLS[f]} = ?`).join(', ')}, notes = ? WHERE id = ?`)
    .run(b.date, ...BODY_FIELDS.map((f) => b.values[f]), b.notes, id);
  return getBody(id);
}

/** Daily series for one field (last entry of each day wins). */
export function bodySeries(field: BodyField, from?: ISODate, to?: ISODate): { date: ISODate; value: number }[] {
  const col = COLS[field];
  return db()
    .prepare(
      `SELECT date, ${col} AS value FROM body_metrics b
        WHERE deleted_at IS NULL AND ${col} IS NOT NULL AND date >= ? AND date <= ?
          AND id = (SELECT id FROM body_metrics b2 WHERE b2.date = b.date AND b2.deleted_at IS NULL AND b2.${col} IS NOT NULL
                     ORDER BY b2.id DESC LIMIT 1)
        ORDER BY date`,
    )
    .all(from ?? '0000-01-01', to ?? '9999-12-31') as { date: ISODate; value: number }[];
}

/** Latest value of a field on or before a date. */
export function valueAt(field: BodyField, date: ISODate): { date: ISODate; value: number } | null {
  const col = COLS[field];
  return (
    (db()
      .prepare(
        `SELECT date, ${col} AS value FROM body_metrics WHERE deleted_at IS NULL AND ${col} IS NOT NULL AND date <= ?
          ORDER BY date DESC, id DESC LIMIT 1`,
      )
      .get(date) as { date: ISODate; value: number } | undefined) ?? null
  );
}

/** First value of a field on or after a date. */
export function valueFrom(field: BodyField, date: ISODate, until = '9999-12-31'): { date: ISODate; value: number } | null {
  const col = COLS[field];
  return (
    (db()
      .prepare(
        `SELECT date, ${col} AS value FROM body_metrics WHERE deleted_at IS NULL AND ${col} IS NOT NULL AND date >= ? AND date <= ?
          ORDER BY date, id DESC LIMIT 1`,
      )
      .get(date, until) as { date: ISODate; value: number } | undefined) ?? null
  );
}

/** Value nearest a date: prefer the latest on-or-before, else the first after (within `window` days). */
export function valueNear(field: BodyField, date: ISODate, window = 45): { date: ISODate; value: number } | null {
  const before = valueAt(field, date);
  if (before && before.date >= addDays(date, -window)) return before;
  return valueFrom(field, date, addDays(date, window)) ?? before;
}

export interface FieldChange {
  field: BodyField;
  from: { date: ISODate; value: number } | null;
  to: { date: ISODate; value: number } | null;
  change: number | null;
}

/** Change of each field between a date and a later date (default: latest). */
export function bodyChanges(since: ISODate | null, until: ISODate): FieldChange[] {
  return BODY_FIELDS.map((field) => {
    const to = valueAt(field, until);
    let from: { date: ISODate; value: number } | null;
    if (since == null) {
      from = valueFrom(field, '0000-01-01', until);
    } else {
      from = valueAt(field, since) ?? valueFrom(field, since, until);
    }
    return { field, from, to, change: from && to && from.date < to.date ? to.value - from.value : null };
  });
}

export function latestBody(until: ISODate) {
  const out: Partial<Record<BodyField, { date: ISODate; value: number }>> = {};
  for (const f of BODY_FIELDS) {
    const v = valueAt(f, until);
    if (v) out[f] = v;
  }
  return out;
}

export const MEASUREMENT_FIELDS = MEASUREMENTS;

// ── Progress photos ─────────────────────────────────────────────────────────

const REQUIRED: Angle[] = ['front', 'side', 'back'];

interface PhotoRow {
  id: number;
  set_id: number;
  angle: Angle;
  file: string;
  thumb: string | null;
  width: number | null;
  height: number | null;
}

function photoUrl(rel: string, id: number) {
  return `/media/${rel.split(path.sep).join('/')}?v=${id}`;
}

function loadSet(row: { id: number; month: string; date: string; note: string | null }): PhotoSet {
  const photos = (
    db()
      .prepare(
        `SELECT * FROM photos WHERE set_id = ? AND deleted_at IS NULL
          ORDER BY CASE angle WHEN 'front' THEN 0 WHEN 'side' THEN 1 WHEN 'back' THEN 2 ELSE 3 END, id`,
      )
      .all(row.id) as PhotoRow[]
  ).map((p) => ({
    id: p.id,
    angle: p.angle,
    url: photoUrl(p.file, p.id),
    thumbUrl: photoUrl(p.thumb ?? p.file, p.id),
    width: p.width,
    height: p.height,
  }));
  const angles = new Set(photos.map((p) => p.angle));
  const w = valueNear('weightKg', row.date, 7);
  return {
    id: row.id,
    month: row.month,
    date: row.date,
    note: row.note,
    photos,
    complete: REQUIRED.every((a) => angles.has(a)),
    weightKg: w?.value ?? null,
  };
}

export function listPhotoSets(): PhotoSet[] {
  const rows = db()
    .prepare('SELECT id, month, date, note FROM photo_sets WHERE deleted_at IS NULL ORDER BY month DESC')
    .all() as { id: number; month: string; date: string; note: string | null }[];
  return rows.map(loadSet).filter((s) => s.photos.length > 0);
}

export function getPhotoSet(month: YearMonth): PhotoSet | null {
  const row = db()
    .prepare('SELECT id, month, date, note FROM photo_sets WHERE month = ? AND deleted_at IS NULL')
    .get(month) as { id: number; month: string; date: string; note: string | null } | undefined;
  return row ? loadSet(row) : null;
}

export function photoSetOnDate(date: ISODate): PhotoSet | null {
  const row = db()
    .prepare('SELECT id, month, date, note FROM photo_sets WHERE date = ? AND deleted_at IS NULL')
    .get(date) as { id: number; month: string; date: string; note: string | null } | undefined;
  if (!row) return null;
  const s = loadSet(row);
  return s.photos.length ? s : null;
}

export function monthPhotoStatus(month: YearMonth): { month: YearMonth; count: number; complete: boolean } {
  const s = getPhotoSet(month);
  return { month, count: s?.photos.length ?? 0, complete: !!s?.complete };
}

function ensureSet(month: YearMonth, date: ISODate): number {
  const row = db().prepare('SELECT id FROM photo_sets WHERE month = ? AND deleted_at IS NULL').get(month) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db().prepare('INSERT INTO photo_sets (month, date) VALUES (?, ?)').run(month, date).lastInsertRowid);
}

const EXT: Record<string, string> = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/heic': 'heic',
  'image/heif': 'heif',
  'image/avif': 'avif',
  'image/gif': 'gif',
  'image/svg+xml': 'svg',
};

export function mimeFromExt(file: string): string {
  const ext = path.extname(file).slice(1).toLowerCase();
  const found = Object.entries(EXT).find(([, e]) => e === ext || (ext === 'jpeg' && e === 'jpg'));
  return found ? found[0] : 'application/octet-stream';
}

/**
 * Save an uploaded photo exactly as received — bytes are written untouched, never
 * re-encoded, resized, or "enhanced". The optional thumbnail is a separate small
 * file used only for grids.
 */
export function savePhoto(opts: {
  month: YearMonth;
  date: ISODate;
  angle: Angle;
  data: Buffer;
  mime: string;
  thumb?: Buffer | null;
  width?: number | null;
  height?: number | null;
}): PhotoSet {
  if (!isYearMonth(opts.month)) throw badRequest('Invalid month');
  if (!isISODate(opts.date)) throw badRequest('Invalid date');
  if (!['front', 'side', 'back', 'other'].includes(opts.angle)) throw badRequest('Invalid angle');
  const ext = EXT[opts.mime];
  if (!ext) throw badRequest('Unsupported image type');
  const store = getStore();
  const [y, m] = opts.month.split('-');
  const dir = path.join(store.photosDir, y, m);
  fs.mkdirSync(dir, { recursive: true });
  const stem = `${opts.date}-${opts.angle}-${crypto.randomBytes(4).toString('hex')}`;
  const fileAbs = path.join(dir, `${stem}.${ext}`);
  fs.writeFileSync(fileAbs, opts.data);
  let thumbRel: string | null = null;
  if (opts.thumb?.length) {
    const t = path.join(dir, `${stem}.thumb.jpg`);
    fs.writeFileSync(t, opts.thumb);
    thumbRel = path.relative(store.root, t);
  }
  const fileRel = path.relative(store.root, fileAbs);
  db().transaction(() => {
    const setId = ensureSet(opts.month, opts.date);
    if (opts.angle !== 'other') {
      db()
        .prepare("UPDATE photos SET deleted_at = datetime('now') WHERE set_id = ? AND angle = ? AND deleted_at IS NULL")
        .run(setId, opts.angle);
    }
    db()
      .prepare('INSERT INTO photos (set_id, angle, file, thumb, mime, width, height, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?)')
      .run(setId, opts.angle, fileRel, thumbRel, opts.mime, opts.width ?? null, opts.height ?? null, opts.data.length);
  })();
  return getPhotoSet(opts.month)!;
}

export function deletePhoto(id: number) {
  const r = db().prepare("UPDATE photos SET deleted_at = datetime('now') WHERE id = ?").run(id);
  if (!r.changes) throw notFound('Photo not found');
}

export function restorePhoto(id: number) {
  const p = db().prepare('SELECT set_id, angle FROM photos WHERE id = ?').get(id) as { set_id: number; angle: Angle } | undefined;
  if (!p) throw notFound('Photo not found');
  db().transaction(() => {
    if (p.angle !== 'other')
      db()
        .prepare("UPDATE photos SET deleted_at = datetime('now') WHERE set_id = ? AND angle = ? AND deleted_at IS NULL")
        .run(p.set_id, p.angle);
    db().prepare('UPDATE photos SET deleted_at = NULL WHERE id = ?').run(id);
    db().prepare('UPDATE photo_sets SET deleted_at = NULL WHERE id = ?').run(p.set_id);
  })();
}

export function updatePhotoSet(month: YearMonth, patch: { note?: string | null; date?: ISODate }) {
  const s = getPhotoSet(month);
  if (!s) throw notFound('No photos for that month');
  if (patch.date && (!isISODate(patch.date) || monthKey(patch.date) !== month)) throw badRequest('Date must be in the same month');
  db()
    .prepare('UPDATE photo_sets SET note = ?, date = ? WHERE id = ?')
    .run(patch.note !== undefined ? patch.note?.trim() || null : s.note, patch.date ?? s.date, s.id);
  return getPhotoSet(month);
}

/** Absolute path of a media file, refusing anything outside the dataset root. */
export function resolveMedia(rel: string): string | null {
  const store = getStore();
  const abs = path.resolve(store.root, rel);
  if (!abs.startsWith(path.resolve(store.photosDir) + path.sep)) return null;
  return fs.existsSync(abs) ? abs : null;
}
