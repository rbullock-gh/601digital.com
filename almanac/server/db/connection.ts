import Database from 'better-sqlite3';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export type Mode = 'real' | 'sample';

export interface Store {
  mode: Mode;
  db: Database.Database;
  /** Root of this dataset: holds the database file and the photos directory. */
  root: string;
  photosDir: string;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const MIGRATIONS_DIR = path.join(here, 'migrations');

export const DATA_DIR = path.resolve(
  process.env.ALMANAC_DATA_DIR ?? path.join(os.homedir(), 'Almanac'),
);
export const BACKUP_DIR = path.join(DATA_DIR, 'backups');
const STATE_FILE = path.join(DATA_DIR, 'state.json');

export function datasetRoot(mode: Mode): string {
  return mode === 'real' ? DATA_DIR : path.join(DATA_DIR, 'sample');
}

export function dbPath(mode: Mode): string {
  return path.join(datasetRoot(mode), 'almanac.db');
}

function readState(): { mode: Mode } {
  try {
    const s = JSON.parse(fs.readFileSync(STATE_FILE, 'utf8'));
    if (s.mode === 'sample' && fs.existsSync(dbPath('sample'))) return { mode: 'sample' };
  } catch {
    /* first run */
  }
  return { mode: 'real' };
}

function writeState(mode: Mode) {
  fs.writeFileSync(STATE_FILE, JSON.stringify({ mode }, null, 2));
}

function migrations(): { version: number; sql: string }[] {
  return fs
    .readdirSync(MIGRATIONS_DIR)
    .filter((f) => /^\d+_.+\.sql$/.test(f))
    .sort()
    .map((f) => ({ version: Number(f.split('_')[0]), sql: fs.readFileSync(path.join(MIGRATIONS_DIR, f), 'utf8') }));
}

export const SCHEMA_VERSION = Math.max(...migrations().map((m) => m.version));

export function migrate(db: Database.Database) {
  const current = db.pragma('user_version', { simple: true }) as number;
  if (current > SCHEMA_VERSION) {
    throw new Error(
      `This database was written by a newer version of Almanac (schema ${current}; this build knows ${SCHEMA_VERSION}).`,
    );
  }
  for (const m of migrations()) {
    if (m.version <= current) continue;
    db.transaction(() => {
      db.exec(m.sql);
      db.pragma(`user_version = ${m.version}`);
    })();
  }
}

export function openDatabase(file: string): Database.Database {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const db = new Database(file);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');
  migrate(db);
  return db;
}

let store: Store | null = null;

function openStore(mode: Mode): Store {
  const root = datasetRoot(mode);
  const photosDir = path.join(root, 'photos');
  fs.mkdirSync(photosDir, { recursive: true });
  return { mode, db: openDatabase(dbPath(mode)), root, photosDir };
}

export function initStore(): Store {
  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
  store = openStore(readState().mode);
  return store;
}

export function getStore(): Store {
  if (!store) throw new Error('Store not initialised');
  return store;
}

export function db(): Database.Database {
  return getStore().db;
}

/** Close the active dataset and open another. */
export function switchStore(mode: Mode): Store {
  store?.db.close();
  store = openStore(mode);
  writeState(mode);
  return store;
}

/** Close whatever is open (used before replacing database files on disk). */
export function closeStore() {
  store?.db.close();
  store = null;
}

export function reopenStore(mode: Mode): Store {
  store = openStore(mode);
  writeState(mode);
  return store;
}

/** Daily safety snapshot of the real database. Keeps the most recent 14. */
export function autoBackup(): string | null {
  const real = dbPath('real');
  if (!fs.existsSync(real)) return null;
  const stamp = new Date().toISOString().slice(0, 10);
  const target = path.join(BACKUP_DIR, `auto-${stamp}.db`);
  if (fs.existsSync(target)) return null;
  const s = getStore();
  const handle = s.mode === 'real' ? s.db : openDatabase(real);
  try {
    handle.prepare('VACUUM INTO ?').run(target);
  } finally {
    if (handle !== s.db) handle.close();
  }
  const autos = fs
    .readdirSync(BACKUP_DIR)
    .filter((f) => f.startsWith('auto-') && f.endsWith('.db'))
    .sort();
  for (const f of autos.slice(0, Math.max(0, autos.length - 14))) fs.rmSync(path.join(BACKUP_DIR, f));
  return target;
}
