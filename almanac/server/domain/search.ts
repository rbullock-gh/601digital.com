import { db } from '../db/connection.ts';
import { getSettings } from './settings.ts';
import { MONTHS, isISODate, make, parts, pad2, type ISODate } from '../../shared/dates.ts';
import type { SearchResult } from '../../shared/types.ts';

function money(cents: number, currency: string) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency, maximumFractionDigits: cents % 100 ? 2 : 0 }).format(cents / 100);
}

function shortDate(d: ISODate) {
  const p = parts(d);
  return `${MONTHS[p.m - 1].slice(0, 3)} ${p.d}, ${p.y}`;
}

function snippet(text: string, q: string, len = 90) {
  const i = text.toLowerCase().indexOf(q.toLowerCase());
  if (i < 0 || text.length <= len) return text.slice(0, len) + (text.length > len ? '…' : '');
  const start = Math.max(0, i - 30);
  return (start ? '…' : '') + text.slice(start, start + len) + (start + len < text.length ? '…' : '');
}

/** Parse dates and months out of free text: "September", "sep 2026", "9/23", "2026-09-23". */
function dateHits(q: string, today: ISODate): SearchResult[] {
  const out: SearchResult[] = [];
  const s = q.trim().toLowerCase();
  const ty = parts(today).y;
  if (isISODate(s)) out.push({ kind: 'day', title: shortDate(s), subtitle: 'Open day', href: `/day/${s}`, date: s });
  const md = s.match(/^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{2,4}))?$/);
  if (md) {
    const a = Number(md[1]);
    const b = Number(md[2]);
    let y = md[3] ? Number(md[3]) : ty;
    if (y < 100) y += 2000;
    const dmy = getSettings().dateFormat === 'DMY';
    const [m, d] = dmy ? [b, a] : [a, b];
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      const iso = make(y, m, d);
      if (isISODate(iso)) out.push({ kind: 'day', title: shortDate(iso), subtitle: 'Open day', href: `/day/${iso}`, date: iso });
    }
  }
  const mm = s.match(/^([a-z]{3,9})\.?(?:\s+(\d{1,2}))?(?:,?\s+(\d{4}))?$/);
  if (mm) {
    const idx = MONTHS.findIndex((m) => m.toLowerCase().startsWith(mm[1]));
    if (idx >= 0 && MONTHS[idx].toLowerCase().startsWith(mm[1])) {
      const years = mm[3] ? [Number(mm[3])] : [ty, ty - 1, ty - 2];
      for (const y of years) {
        const ym = `${y}-${pad2(idx + 1)}`;
        if (ym > today.slice(0, 7)) continue;
        if (mm[2]) {
          const iso = make(y, idx + 1, Number(mm[2]));
          if (isISODate(iso)) out.push({ kind: 'day', title: shortDate(iso), subtitle: 'Open day', href: `/day/${iso}`, date: iso });
        } else {
          out.push({ kind: 'month', title: `${MONTHS[idx]} ${y}`, subtitle: 'Monthly review', href: `/reviews/month/${ym}` });
          out.push({ kind: 'month', title: `${MONTHS[idx]} ${y}`, subtitle: 'Calendar', href: `/calendar?month=${ym}` });
        }
      }
    }
  }
  const yr = s.match(/^(19|20)\d{2}$/);
  if (yr) {
    out.push({ kind: 'page', title: `${s} in review`, subtitle: 'Year in Review', href: `/wrapped/${s}` });
    out.push({ kind: 'page', title: `${s} at a glance`, subtitle: 'Year grid', href: `/year/${s}` });
  }
  return out;
}

function amountHits(q: string, currency: string): SearchResult[] {
  const m = q.trim().match(/^\$?\s?(\d{1,3}(?:,\d{3})*|\d+)(?:\.(\d{1,2}))?$/);
  if (!m || !q.includes('$')) return [];
  const cents = Number(m[1].replace(/,/g, '')) * 100 + (m[2] ? Number(m[2].padEnd(2, '0')) : 0);
  const lo = Math.floor(cents * 0.95);
  const hi = Math.ceil(cents * 1.05);
  const out: SearchResult[] = [];
  const entries = db()
    .prepare(
      `SELECT e.source, e.id, e.date, e.cents, e.label, p.name project FROM earnings e LEFT JOIN projects p ON p.id = e.project_id
        WHERE e.cents BETWEEN ? AND ? ORDER BY ABS(e.cents - ?), e.date DESC LIMIT 8`,
    )
    .all(lo, hi, cents) as { source: string; id: number; date: string; cents: number; label: string; project: string | null }[];
  for (const e of entries)
    out.push({
      kind: e.source === 'session' ? 'session' : 'income',
      title: `${money(e.cents, currency)} · ${e.label}`,
      subtitle: [shortDate(e.date), e.project].filter(Boolean).join(' · '),
      href: `/day/${e.date}`,
      date: e.date,
    });
  const days = db()
    .prepare('SELECT date, SUM(cents) c FROM earnings GROUP BY date HAVING c BETWEEN ? AND ? ORDER BY ABS(c - ?), date DESC LIMIT 5')
    .all(lo, hi, cents) as { date: string; c: number }[];
  for (const d of days)
    out.push({ kind: 'day', title: `${money(d.c, currency)} earned`, subtitle: shortDate(d.date), href: `/day/${d.date}`, date: d.date });
  return out;
}

export function search(q: string, today: ISODate): SearchResult[] {
  const query = q.trim();
  if (!query) return [];
  const { currency } = getSettings();
  const like = `%${query}%`;
  const out: SearchResult[] = [...dateHits(query, today), ...amountHits(query, currency)];

  for (const p of db()
    .prepare('SELECT id, name, client, status FROM projects WHERE name LIKE ? OR client LIKE ? LIMIT 6')
    .all(like, like) as { id: number; name: string; client: string | null; status: string }[])
    out.push({ kind: 'project', title: p.name, subtitle: ['Project', p.client, p.status].filter(Boolean).join(' · '), href: `/projects/${p.id}` });

  for (const e of db().prepare('SELECT id, name FROM exercises WHERE name LIKE ? LIMIT 6').all(like) as { id: number; name: string }[])
    out.push({ kind: 'exercise', title: e.name, subtitle: 'Exercise history', href: `/gym/exercises/${e.id}` });

  for (const p of db()
    .prepare("SELECT id, name, region, country, status FROM places WHERE deleted_at IS NULL AND (name LIKE ? OR region LIKE ? OR country LIKE ?) LIMIT 6")
    .all(like, like, like) as { id: number; name: string; region: string | null; country: string | null; status: string }[])
    out.push({ kind: 'page', title: p.name, subtitle: [p.status === 'want' ? 'Bucket list' : p.status === 'home' ? 'Home' : 'Travel', p.region, p.country].filter(Boolean).join(' · '), href: `/travel?place=${p.id}` });

  for (const v of db()
    .prepare('SELECT id, title, body FROM vision_items WHERE deleted_at IS NULL AND (title LIKE ? OR body LIKE ?) LIMIT 4')
    .all(like, like) as { id: number; title: string | null; body: string | null }[])
    out.push({ kind: 'goal', title: v.title ?? snippet(v.body ?? '', query), subtitle: 'Vision board', href: `/vision#card-${v.id}` });

  for (const g of db().prepare('SELECT id, title FROM goals WHERE deleted_at IS NULL AND title LIKE ? LIMIT 4').all(like) as { id: number; title: string }[])
    out.push({ kind: 'goal', title: g.title, subtitle: 'Goal', href: `/goals#goal-${g.id}` });

  for (const w of db()
    .prepare(
      `SELECT w.date, w.description, w.minutes, p.name project FROM work_sessions w LEFT JOIN projects p ON p.id = w.project_id
        WHERE w.deleted_at IS NULL AND (w.description LIKE ? OR w.notes LIKE ? OR p.name LIKE ?) ORDER BY w.date DESC LIMIT 8`,
    )
    .all(like, like, like) as { date: string; description: string | null; minutes: number; project: string | null }[])
    out.push({
      kind: 'session',
      title: w.description || w.project || 'Work session',
      subtitle: [shortDate(w.date), w.project, `${Math.floor(w.minutes / 60)}h ${pad2(w.minutes % 60)}m`].filter(Boolean).join(' · '),
      href: `/day/${w.date}`,
      date: w.date,
    });

  for (const i of db()
    .prepare('SELECT date, source, amount_cents FROM income WHERE deleted_at IS NULL AND (source LIKE ? OR notes LIKE ?) ORDER BY date DESC LIMIT 5')
    .all(like, like) as { date: string; source: string; amount_cents: number }[])
    out.push({ kind: 'income', title: i.source, subtitle: `${shortDate(i.date)} · ${money(i.amount_cents, currency)}`, href: `/day/${i.date}`, date: i.date });

  for (const w of db()
    .prepare('SELECT id, date, name FROM workouts WHERE deleted_at IS NULL AND (name LIKE ? OR notes LIKE ?) ORDER BY date DESC LIMIT 5')
    .all(like, like) as { id: number; date: string; name: string }[])
    out.push({ kind: 'workout', title: w.name, subtitle: `Workout · ${shortDate(w.date)}`, href: `/gym/workouts/${w.id}`, date: w.date });

  for (const j of db()
    .prepare("SELECT date, journal FROM days WHERE journal LIKE ? ORDER BY date DESC LIMIT 8")
    .all(like) as { date: string; journal: string }[])
    out.push({ kind: 'journal', title: snippet(j.journal, query), subtitle: `Journal · ${shortDate(j.date)}`, href: `/day/${j.date}`, date: j.date });

  for (const n of db()
    .prepare('SELECT date, body FROM notes WHERE deleted_at IS NULL AND body LIKE ? ORDER BY date DESC LIMIT 6')
    .all(like) as { date: string; body: string }[])
    out.push({ kind: 'note', title: snippet(n.body, query), subtitle: `Note · ${shortDate(n.date)}`, href: `/day/${n.date}`, date: n.date });

  for (const a of db()
    .prepare('SELECT date, text, is_milestone FROM accomplishments WHERE deleted_at IS NULL AND text LIKE ? ORDER BY date DESC LIMIT 6')
    .all(like) as { date: string; text: string; is_milestone: number }[])
    out.push({ kind: 'accomplishment', title: a.text, subtitle: `${a.is_milestone ? 'Milestone' : 'Win'} · ${shortDate(a.date)}`, href: `/day/${a.date}`, date: a.date });

  return out;
}

// ── Recently deleted ────────────────────────────────────────────────────────

const TRASH: { table: string; kind: string; label: string }[] = [
  { table: 'work_sessions', kind: 'Work session', label: "COALESCE(description, 'Work session') || ' · ' || (minutes / 60) || 'h ' || (minutes % 60) || 'm'" },
  { table: 'income', kind: 'Income', label: "source || ' · $' || printf('%.2f', amount_cents / 100.0)" },
  { table: 'workouts', kind: 'Workout', label: 'name' },
  { table: 'body_metrics', kind: 'Body entry', label: "'Measurements'" },
  { table: 'goals', kind: 'Goal', label: 'title' },
  { table: 'notes', kind: 'Note', label: 'substr(body, 1, 80)' },
  { table: 'accomplishments', kind: 'Win', label: 'text' },
  { table: 'photos', kind: 'Photo', label: "angle || ' photo'" },
  { table: 'vision_items', kind: 'Vision card', label: "COALESCE(title, substr(body, 1, 60), 'Card')" },
  { table: 'places', kind: 'Place', label: 'name' },
  { table: 'visits', kind: 'Trip', label: "COALESCE(title, (SELECT name FROM places WHERE id = place_id))" },
];

export function trash() {
  const out: { table: string; id: number; kind: string; label: string; date: string | null; deletedAt: string }[] = [];
  for (const t of TRASH) {
    const dateCol =
      t.table === 'goals' ? 'start_date'
      : t.table === 'photos' ? '(SELECT month FROM photo_sets WHERE id = set_id)'
      : t.table === 'visits' ? 'start_date'
      : t.table === 'vision_items' || t.table === 'places' ? 'NULL'
      : 'date';
    const rows = db()
      .prepare(`SELECT id, ${t.label} AS label, ${dateCol} AS date, deleted_at FROM ${t.table} WHERE deleted_at IS NOT NULL ORDER BY deleted_at DESC LIMIT 100`)
      .all() as { id: number; label: string; date: string | null; deleted_at: string }[];
    for (const r of rows) out.push({ table: t.table, id: r.id, kind: t.kind, label: r.label, date: r.date, deletedAt: r.deleted_at });
  }
  return out.sort((a, b) => b.deletedAt.localeCompare(a.deletedAt)).slice(0, 200);
}

export const TRASH_TABLES = new Set(TRASH.map((t) => t.table));

export function softDelete(table: string, id: number) {
  if (!TRASH_TABLES.has(table)) throw new Error('Unknown table');
  db().prepare(`UPDATE ${table} SET deleted_at = datetime('now') WHERE id = ?`).run(id);
}

export function restore(table: string, id: number) {
  if (!TRASH_TABLES.has(table)) throw new Error('Unknown table');
  db().prepare(`UPDATE ${table} SET deleted_at = NULL WHERE id = ?`).run(id);
}
