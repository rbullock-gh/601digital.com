import { db } from '../db/connection.ts';
import type { Settings, Timer } from '../../shared/types.ts';

export const DEFAULT_SETTINGS: Settings = {
  name: '',
  defaultRateCents: 3000,
  currency: 'USD',
  weekStart: 1,
  dateFormat: 'MDY',
  timeFormat: '12',
  weightUnit: 'lb',
  lengthUnit: 'in',
  photoDay: 1,
  photoSnoozeUntil: null,
  photoDismissedMonth: null,
  onboarded: false,
  weeklyWorkoutTarget: 4,
};

type Key = keyof Settings;

export function getSettings(): Settings {
  const rows = db().prepare('SELECT key, value FROM settings').all() as { key: string; value: string }[];
  const out: Settings = { ...DEFAULT_SETTINGS };
  for (const r of rows) {
    if (r.key in DEFAULT_SETTINGS) {
      try {
        (out as unknown as Record<string, unknown>)[r.key] = JSON.parse(r.value);
      } catch {
        /* ignore corrupt value, keep default */
      }
    }
  }
  return out;
}

const validators: Partial<Record<Key, (v: unknown) => boolean>> = {
  name: (v) => typeof v === 'string' && v.length <= 60,
  defaultRateCents: (v) => Number.isInteger(v) && (v as number) >= 0,
  currency: (v) => typeof v === 'string' && /^[A-Z]{3}$/.test(v),
  weekStart: (v) => v === 0 || v === 1,
  dateFormat: (v) => v === 'MDY' || v === 'DMY' || v === 'YMD',
  timeFormat: (v) => v === '12' || v === '24',
  weightUnit: (v) => v === 'lb' || v === 'kg',
  lengthUnit: (v) => v === 'in' || v === 'cm',
  photoDay: (v) => Number.isInteger(v) && (v as number) >= 1 && (v as number) <= 28,
  photoSnoozeUntil: (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v)),
  photoDismissedMonth: (v) => v === null || (typeof v === 'string' && /^\d{4}-\d{2}$/.test(v)),
  onboarded: (v) => typeof v === 'boolean',
  weeklyWorkoutTarget: (v) => Number.isInteger(v) && (v as number) >= 0 && (v as number) <= 14,
};

export function updateSettings(patch: Partial<Settings>): Settings {
  const stmt = db().prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  );
  db().transaction(() => {
    for (const [k, v] of Object.entries(patch)) {
      const check = validators[k as Key];
      if (!check) continue;
      if (!check(v)) throw new Error(`Invalid value for ${k}`);
      stmt.run(k, JSON.stringify(v));
    }
  })();
  return getSettings();
}

// The running work timer lives in its own row so it survives restarts and is
// shared by every device that talks to this server.
export function getTimer(): Timer | null {
  const row = db().prepare("SELECT value FROM settings WHERE key = 'timer'").get() as { value: string } | undefined;
  if (!row) return null;
  try {
    return JSON.parse(row.value) as Timer | null;
  } catch {
    return null;
  }
}

export function setTimer(t: Timer | null) {
  if (t === null) db().prepare("DELETE FROM settings WHERE key = 'timer'").run();
  else
    db()
      .prepare("INSERT INTO settings (key, value) VALUES ('timer', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value")
      .run(JSON.stringify(t));
}
