// Backup, restore, export, import and CSV. The guiding rule: data is never
// trapped, and nothing is replaced without first setting the old copy aside.

import fs from 'node:fs';
import path from 'node:path';
import { PassThrough, type Readable } from 'node:stream';
import { ZipArchive } from 'archiver';
import yauzl from 'yauzl';
import Database from 'better-sqlite3';
import {
  BACKUP_DIR,
  DATA_DIR,
  SCHEMA_VERSION,
  closeStore,
  datasetRoot,
  dbPath,
  getStore,
  openDatabase,
  reopenStore,
  switchStore,
} from '../db/connection.ts';
import { badRequest } from '../lib/errors.ts';
import { generateSample } from './sample.ts';
import { recomputeAllPRs } from './fitness.ts';

const TABLES = [
  'settings', 'projects', 'categories', 'work_sessions', 'income', 'days', 'notes', 'accomplishments',
  'exercises', 'workouts', 'workout_exercises', 'sets', 'body_metrics', 'photo_sets', 'photos',
  'goals', 'goal_checkins', 'reviews',
];

function stamp() {
  return new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

// ── Full backup (.zip: database + photos + manifest) ────────────────────────

export function backupStream(): { stream: Readable; filename: string } {
  const store = getStore();
  const tmp = path.join(DATA_DIR, `.backup-${stamp()}.db`);
  store.db.prepare('VACUUM INTO ?').run(tmp);
  const counts: Record<string, number> = {};
  for (const t of TABLES) counts[t] = (store.db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as { n: number }).n;
  const manifest = {
    app: 'almanac',
    format: 1,
    schema: SCHEMA_VERSION,
    dataset: store.mode,
    createdAt: new Date().toISOString(),
    counts,
  };
  const zip = new ZipArchive({ zlib: { level: 6 } });
  const out = new PassThrough();
  zip.on('error', (e: Error) => out.destroy(e));
  zip.pipe(out);
  zip.append(JSON.stringify(manifest, null, 2), { name: 'manifest.json' });
  zip.append(
    [
      'Almanac backup',
      '',
      'almanac.db     SQLite database with every record (open with any SQLite tool).',
      'photos/        Your progress photos, exactly as uploaded, in YYYY/MM folders.',
      'manifest.json  What this backup contains.',
      '',
      'Restore it from Settings → Data → Restore from backup.',
    ].join('\n'),
    { name: 'README.txt' },
  );
  zip.file(tmp, { name: 'almanac.db' });
  if (fs.existsSync(store.photosDir)) zip.directory(store.photosDir, 'photos');
  zip.finalize();
  out.on('close', () => fs.rmSync(tmp, { force: true }));
  out.on('end', () => fs.rmSync(tmp, { force: true }));
  const name = store.mode === 'sample' ? 'almanac-sample-backup' : 'almanac-backup';
  return { stream: out, filename: `${name}-${new Date().toISOString().slice(0, 10)}.zip` };
}

function extractZip(zipFile: string, dest: string): Promise<void> {
  return new Promise((resolve, reject) => {
    yauzl.open(zipFile, { lazyEntries: true }, (err, zip) => {
      if (err || !zip) return reject(badRequest('That file is not a valid zip archive'));
      zip.readEntry();
      zip.on('entry', (entry: yauzl.Entry) => {
        const target = path.resolve(dest, entry.fileName);
        if (!target.startsWith(path.resolve(dest) + path.sep)) return reject(badRequest('Unsafe path in archive'));
        if (/\/$/.test(entry.fileName)) {
          fs.mkdirSync(target, { recursive: true });
          return zip.readEntry();
        }
        fs.mkdirSync(path.dirname(target), { recursive: true });
        zip.openReadStream(entry, (e, rs) => {
          if (e || !rs) return reject(e);
          const ws = fs.createWriteStream(target);
          rs.pipe(ws);
          ws.on('finish', () => zip.readEntry());
          ws.on('error', reject);
        });
      });
      zip.on('end', () => resolve());
      zip.on('error', reject);
    });
  });
}

function verifyDatabase(file: string) {
  let probe: Database.Database | null = null;
  try {
    probe = new Database(file, { readonly: true, fileMustExist: true });
    const ok = probe.pragma('integrity_check', { simple: true });
    if (ok !== 'ok') throw badRequest('The database in this backup is damaged');
    const v = probe.pragma('user_version', { simple: true }) as number;
    if (v > SCHEMA_VERSION) throw badRequest('This backup was made by a newer version of Almanac');
  } catch (e) {
    if (e instanceof Error && 'status' in e) throw e;
    throw badRequest('The backup does not contain a readable database');
  } finally {
    probe?.close();
  }
}

/** Move the real dataset's database and photos aside, into backups/<label>-<stamp>/. */
function setAsideReal(label: string, includePhotos: boolean): string {
  const aside = path.join(BACKUP_DIR, `${label}-${stamp()}`);
  fs.mkdirSync(aside, { recursive: true });
  const root = datasetRoot('real');
  for (const f of ['almanac.db', 'almanac.db-wal', 'almanac.db-shm']) {
    const p = path.join(root, f);
    if (fs.existsSync(p)) fs.renameSync(p, path.join(aside, f));
  }
  const photos = path.join(root, 'photos');
  if (includePhotos && fs.existsSync(photos)) fs.renameSync(photos, path.join(aside, 'photos'));
  return aside;
}

export async function restoreBackup(zipFile: string) {
  const work = path.join(DATA_DIR, `.restore-${stamp()}`);
  fs.mkdirSync(work, { recursive: true });
  try {
    await extractZip(zipFile, work);
    let manifest: { app?: string } = {};
    try {
      manifest = JSON.parse(fs.readFileSync(path.join(work, 'manifest.json'), 'utf8'));
    } catch {
      throw badRequest('This is not an Almanac backup (no manifest)');
    }
    if (manifest.app !== 'almanac') throw badRequest('This is not an Almanac backup');
    const dbFile = path.join(work, 'almanac.db');
    verifyDatabase(dbFile);

    closeStore();
    const aside = setAsideReal('before-restore', true);
    const root = datasetRoot('real');
    fs.renameSync(dbFile, path.join(root, 'almanac.db'));
    const photos = path.join(work, 'photos');
    if (fs.existsSync(photos)) fs.renameSync(photos, path.join(root, 'photos'));
    reopenStore('real');
    return { restored: true, previousCopy: aside };
  } catch (e) {
    try {
      getStore();
    } catch {
      reopenStore('real');
    }
    throw e;
  } finally {
    fs.rmSync(work, { recursive: true, force: true });
  }
}

// ── JSON export / import ────────────────────────────────────────────────────

export function exportJSON() {
  const store = getStore();
  const tables: Record<string, unknown[]> = {};
  for (const t of TABLES) tables[t] = store.db.prepare(`SELECT * FROM ${t}`).all();
  return {
    app: 'almanac',
    format: 1,
    kind: 'export',
    schema: SCHEMA_VERSION,
    dataset: store.mode,
    exportedAt: new Date().toISOString(),
    note: 'Photo files are not embedded in JSON exports; use a full backup (.zip) to keep photos.',
    tables,
  };
}

export function importJSON(data: unknown) {
  const d = data as { app?: string; tables?: Record<string, Record<string, unknown>[]>; schema?: number };
  if (!d || d.app !== 'almanac' || !d.tables) throw badRequest('This is not an Almanac export');
  if ((d.schema ?? 0) > SCHEMA_VERSION) throw badRequest('This export was made by a newer version of Almanac');
  const tmpFile = path.join(DATA_DIR, `.import-${stamp()}.db`);
  const fresh = openDatabase(tmpFile);
  try {
    fresh.pragma('foreign_keys = OFF');
    fresh.transaction(() => {
      for (const t of TABLES) {
        const rows = d.tables![t] ?? [];
        if (!rows.length) continue;
        const cols = (fresh.prepare(`PRAGMA table_info(${t})`).all() as { name: string }[]).map((c) => c.name);
        for (const row of rows) {
          const keys = Object.keys(row).filter((k) => cols.includes(k));
          if (!keys.length) continue;
          fresh
            .prepare(`INSERT OR REPLACE INTO ${t} (${keys.join(', ')}) VALUES (${keys.map(() => '?').join(', ')})`)
            .run(...keys.map((k) => row[k] as never));
        }
      }
    })();
    fresh.pragma('foreign_keys = ON');
  } finally {
    fresh.close();
  }
  closeStore();
  const aside = setAsideReal('before-import', false);
  for (const ext of ['', '-wal', '-shm']) {
    if (fs.existsSync(tmpFile + ext)) fs.renameSync(tmpFile + ext, dbPath('real') + ext);
  }
  reopenStore('real');
  recomputeAllPRs();
  return { imported: true, previousCopy: aside };
}

// ── CSV ─────────────────────────────────────────────────────────────────────

function csv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v: unknown) => {
    if (v == null) return '';
    const s = String(v);
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\r\n') + '\r\n';
}

const CSV_QUERIES: Record<string, string> = {
  work: `SELECT w.date, w.start_time, w.end_time, w.break_minutes, w.minutes, ROUND(w.minutes / 60.0, 2) AS hours,
                p.name AS project, c.name AS category, w.description, w.pay_type,
                printf('%.2f', w.hourly_rate_cents / 100.0) AS hourly_rate, printf('%.2f', w.flat_amount_cents / 100.0) AS flat_amount,
                printf('%.2f', w.earned_cents / 100.0) AS earned, w.notes
           FROM work_sessions w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN categories c ON c.id = w.category_id
          WHERE w.deleted_at IS NULL ORDER BY w.date, w.start_time`,
  income: `SELECT i.date, printf('%.2f', i.amount_cents / 100.0) AS amount, i.source, i.kind, p.name AS project, c.name AS category, i.notes
             FROM income i LEFT JOIN projects p ON p.id = i.project_id LEFT JOIN categories c ON c.id = i.category_id
            WHERE i.deleted_at IS NULL ORDER BY i.date`,
  earnings: `SELECT e.date, printf('%.2f', e.cents / 100.0) AS amount, e.kind, e.label AS description, p.name AS project, c.name AS category,
                    e.source AS record_type
               FROM earnings e LEFT JOIN projects p ON p.id = e.project_id LEFT JOIN categories c ON c.id = e.category_id ORDER BY e.date`,
  workouts: `SELECT w.date, w.name AS workout, w.duration_minutes, e.name AS exercise, s.position + 1 AS set_number,
                    ROUND(s.weight_kg, 3) AS weight_kg, ROUND(s.weight_kg * 2.2046226218, 1) AS weight_lb, s.reps, s.rpe, s.is_warmup
               FROM sets s JOIN workout_exercises we ON we.id = s.workout_exercise_id JOIN workouts w ON w.id = we.workout_id
               JOIN exercises e ON e.id = we.exercise_id WHERE w.deleted_at IS NULL ORDER BY w.date, w.id, we.position, s.position`,
  body: `SELECT date, ROUND(weight_kg, 3) AS weight_kg, ROUND(weight_kg * 2.2046226218, 1) AS weight_lb, waist_cm, chest_cm, arms_cm,
                forearms_cm, shoulders_cm, thighs_cm, calves_cm, neck_cm, body_fat_pct, notes
           FROM body_metrics WHERE deleted_at IS NULL ORDER BY date`,
  days: `SELECT date, CASE rating WHEN 3 THEN 'good' WHEN 2 THEN 'okay' WHEN 1 THEN 'bad' END AS rating, journal FROM days ORDER BY date`,
  prs: `SELECT pr.date, e.name AS exercise, pr.type, ROUND(pr.weight_kg, 3) AS weight_kg, pr.reps, ROUND(pr.value, 3) AS value,
               ROUND(pr.previous_value, 3) AS previous_value
          FROM personal_records pr JOIN exercises e ON e.id = pr.exercise_id ORDER BY pr.date`,
};

export function csvExport(kind: string): { body: string; filename: string } {
  const sql = CSV_QUERIES[kind];
  if (!sql) throw badRequest('Unknown export');
  const rows = getStore().db.prepare(sql).all() as Record<string, unknown>[];
  return { body: csv(rows), filename: `almanac-${kind}-${new Date().toISOString().slice(0, 10)}.csv` };
}

export const CSV_KINDS = Object.keys(CSV_QUERIES);

// ── Datasets ────────────────────────────────────────────────────────────────

export function realHasData(): boolean {
  const file = dbPath('real');
  if (!fs.existsSync(file)) return false;
  const s = getStore();
  const handle = s.mode === 'real' ? s.db : new Database(file, { readonly: true });
  try {
    const r = handle
      .prepare(
        `SELECT (SELECT COUNT(*) FROM work_sessions) + (SELECT COUNT(*) FROM income) + (SELECT COUNT(*) FROM workouts)
              + (SELECT COUNT(*) FROM days) + (SELECT COUNT(*) FROM body_metrics) AS n`,
      )
      .get() as { n: number };
    return r.n > 0;
  } catch {
    return false;
  } finally {
    if (handle !== s.db) handle.close();
  }
}

/** Build a fresh sample dataset in its own directory and switch to it. Real data is never touched. */
export function loadSample(today: string) {
  closeStore();
  const root = datasetRoot('sample');
  fs.rmSync(root, { recursive: true, force: true });
  fs.mkdirSync(path.join(root, 'photos'), { recursive: true });
  const db = openDatabase(dbPath('sample'));
  try {
    generateSample(db, path.join(root, 'photos'), root, today);
  } finally {
    db.close();
  }
  const store = switchStore('sample');
  recomputeAllPRs();
  return store;
}

/** Delete the sample dataset entirely and return to real data. */
export function deleteSample() {
  if (getStore().mode === 'sample') closeStore();
  fs.rmSync(datasetRoot('sample'), { recursive: true, force: true });
  return switchStore('real');
}

export function useReal() {
  return switchStore('real');
}

/** Erase real data. Everything is moved to backups/ first, never destroyed outright. */
export function resetReal() {
  const wasSample = getStore().mode === 'sample';
  closeStore();
  const aside = setAsideReal('before-reset', true);
  reopenStore('real');
  if (wasSample) switchStore('real');
  return { previousCopy: aside };
}

export function listBackups() {
  if (!fs.existsSync(BACKUP_DIR)) return [];
  return fs
    .readdirSync(BACKUP_DIR)
    .map((name) => {
      const p = path.join(BACKUP_DIR, name);
      const st = fs.statSync(p);
      return { name, bytes: st.isDirectory() ? null : st.size, modified: st.mtime.toISOString(), folder: st.isDirectory() };
    })
    .sort((a, b) => b.modified.localeCompare(a.modified));
}

function dirSize(dir: string): { bytes: number; files: number } {
  let bytes = 0;
  let files = 0;
  if (!fs.existsSync(dir)) return { bytes, files };
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      const r = dirSize(p);
      bytes += r.bytes;
      files += r.files;
    } else {
      bytes += fs.statSync(p).size;
      files++;
    }
  }
  return { bytes, files };
}

export function dataInfo() {
  const s = getStore();
  const dbFile = dbPath(s.mode);
  const photos = dirSize(s.photosDir);
  return {
    dataDir: DATA_DIR,
    datasetDir: s.root,
    mode: s.mode,
    dbBytes: fs.existsSync(dbFile) ? fs.statSync(dbFile).size : 0,
    photoBytes: photos.bytes,
    photoFiles: photos.files,
    schema: SCHEMA_VERSION,
    backups: listBackups().slice(0, 20),
  };
}
