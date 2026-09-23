import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { getSettings, getTimer, setTimer } from './settings.ts';
import { isClock, isISODate, spanMinutes, type ISODate } from '../../shared/dates.ts';
import type {
  Category,
  Income,
  IncomeInput,
  Project,
  ProjectSummary,
  Timer,
  WorkSession,
  WorkSessionInput,
} from '../../shared/types.ts';

// ── Projects & categories ───────────────────────────────────────────────────

const PROJECT_COLORS = ['#2a78d6', '#1baf7a', '#eb6834', '#7f6fd8', '#e87ba4', '#c98500', '#4a9bb0', '#8a8f3c'];

interface ProjectRow {
  id: number;
  name: string;
  client: string | null;
  status: Project['status'];
  color: string | null;
  hourly_rate_cents: number | null;
  notes: string | null;
  completed_on: string | null;
  created_at: string;
}

export function mapProject(r: ProjectRow): Project {
  return {
    id: r.id,
    name: r.name,
    client: r.client,
    status: r.status,
    color: r.color,
    hourlyRateCents: r.hourly_rate_cents,
    notes: r.notes,
    completedOn: r.completed_on,
    createdAt: r.created_at,
  };
}

export function listProjects(): Project[] {
  return (db().prepare('SELECT * FROM projects ORDER BY name COLLATE NOCASE').all() as ProjectRow[]).map(mapProject);
}

export function getProject(id: number): Project {
  const r = db().prepare('SELECT * FROM projects WHERE id = ?').get(id) as ProjectRow | undefined;
  if (!r) throw notFound('Project not found');
  return mapProject(r);
}

export function projectSummaries(): ProjectSummary[] {
  const rows = db()
    .prepare(
      `SELECT p.*,
              COALESCE(w.minutes, 0) AS minutes,
              COALESCE(e.cents, 0) AS earned,
              COALESCE(w.sessions, 0) AS sessions,
              MIN(COALESCE(w.first, e.first), COALESCE(e.first, w.first)) AS first_activity,
              MAX(COALESCE(w.last, e.last), COALESCE(e.last, w.last)) AS last_activity
         FROM projects p
         LEFT JOIN (SELECT project_id, SUM(minutes) minutes, COUNT(*) sessions, MIN(date) first, MAX(date) last
                      FROM work_sessions WHERE deleted_at IS NULL GROUP BY project_id) w ON w.project_id = p.id
         LEFT JOIN (SELECT project_id, SUM(cents) cents, MIN(date) first, MAX(date) last
                      FROM earnings GROUP BY project_id) e ON e.project_id = p.id
        ORDER BY (p.status = 'active') DESC, last_activity DESC NULLS LAST, p.name`,
    )
    .all() as (ProjectRow & {
    minutes: number;
    earned: number;
    sessions: number;
    first_activity: string | null;
    last_activity: string | null;
  })[];
  return rows.map((r) => ({
    ...mapProject(r),
    minutes: r.minutes,
    earnedCents: r.earned,
    sessions: r.sessions,
    firstActivity: r.first_activity,
    lastActivity: r.last_activity,
  }));
}

export interface ProjectInput {
  name: string;
  client?: string | null;
  status?: Project['status'];
  color?: string | null;
  hourlyRateCents?: number | null;
  notes?: string | null;
}

export function createProject(input: ProjectInput, today: ISODate): Project {
  const name = input.name?.trim();
  if (!name) throw badRequest('Project name is required');
  const existing = db().prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE').get(name) as { id: number } | undefined;
  if (existing) throw badRequest(`A project called “${name}” already exists`);
  const count = (db().prepare('SELECT COUNT(*) c FROM projects').get() as { c: number }).c;
  const status = input.status ?? 'active';
  const r = db()
    .prepare(
      `INSERT INTO projects (name, client, status, color, hourly_rate_cents, notes, completed_on)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      name,
      input.client?.trim() || null,
      status,
      input.color ?? PROJECT_COLORS[count % PROJECT_COLORS.length],
      input.hourlyRateCents ?? null,
      input.notes?.trim() || null,
      status === 'completed' ? today : null,
    );
  return getProject(Number(r.lastInsertRowid));
}

export function updateProject(id: number, input: Partial<ProjectInput> & { completedOn?: ISODate | null }, today: ISODate): Project {
  const cur = getProject(id);
  const name = input.name !== undefined ? input.name.trim() : cur.name;
  if (!name) throw badRequest('Project name is required');
  const clash = db().prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE AND id != ?').get(name, id);
  if (clash) throw badRequest(`A project called “${name}” already exists`);
  const status = input.status ?? cur.status;
  let completedOn = input.completedOn !== undefined ? input.completedOn : cur.completedOn;
  if (status === 'completed' && !completedOn) completedOn = today;
  if (status !== 'completed' && status !== 'archived') completedOn = null;
  db()
    .prepare(
      `UPDATE projects SET name = ?, client = ?, status = ?, color = ?, hourly_rate_cents = ?, notes = ?,
              completed_on = ?, updated_at = datetime('now') WHERE id = ?`,
    )
    .run(
      name,
      input.client !== undefined ? input.client?.trim() || null : cur.client,
      status,
      input.color !== undefined ? input.color : cur.color,
      input.hourlyRateCents !== undefined ? input.hourlyRateCents : cur.hourlyRateCents,
      input.notes !== undefined ? input.notes?.trim() || null : cur.notes,
      completedOn,
      id,
    );
  return getProject(id);
}

export function deleteProject(id: number) {
  // Sessions and income keep their history; they simply lose the project link.
  db().prepare('DELETE FROM projects WHERE id = ?').run(id);
}

export function listCategories(): Category[] {
  return db()
    .prepare(
      `SELECT c.id, c.name,
              (SELECT COUNT(*) FROM work_sessions w WHERE w.category_id = c.id AND w.deleted_at IS NULL)
            + (SELECT COUNT(*) FROM income i WHERE i.category_id = c.id AND i.deleted_at IS NULL) AS uses
         FROM categories c ORDER BY uses DESC, c.name`,
    )
    .all() as Category[];
}

export function renameCategory(id: number, name: string) {
  if (!name.trim()) throw badRequest('Name is required');
  db().prepare('UPDATE categories SET name = ? WHERE id = ?').run(name.trim(), id);
}

export function deleteCategory(id: number) {
  db().prepare('DELETE FROM categories WHERE id = ?').run(id);
}

function resolveProject(id: number | null | undefined, name: string | null | undefined, today: ISODate): number | null {
  if (id) {
    getProject(id);
    return id;
  }
  const n = name?.trim();
  if (!n) return null;
  const row = db().prepare('SELECT id FROM projects WHERE name = ? COLLATE NOCASE').get(n) as { id: number } | undefined;
  return row ? row.id : createProject({ name: n }, today).id;
}

function resolveCategory(id: number | null | undefined, name: string | null | undefined): number | null {
  if (id) return id;
  const n = name?.trim();
  if (!n) return null;
  const row = db().prepare('SELECT id FROM categories WHERE name = ? COLLATE NOCASE').get(n) as { id: number } | undefined;
  if (row) return row.id;
  return Number(db().prepare('INSERT INTO categories (name) VALUES (?)').run(n).lastInsertRowid);
}

// ── Work sessions ───────────────────────────────────────────────────────────

const SESSION_SELECT = `
  SELECT w.*, p.name AS project_name, p.color AS project_color, c.name AS category_name
    FROM work_sessions w
    LEFT JOIN projects p ON p.id = w.project_id
    LEFT JOIN categories c ON c.id = w.category_id`;

interface SessionRow {
  id: number;
  date: string;
  start_time: string | null;
  end_time: string | null;
  break_minutes: number;
  minutes: number;
  project_id: number | null;
  project_name: string | null;
  project_color: string | null;
  category_id: number | null;
  category_name: string | null;
  description: string | null;
  pay_type: WorkSession['payType'];
  hourly_rate_cents: number | null;
  flat_amount_cents: number | null;
  earned_cents: number;
  notes: string | null;
}

export function mapSession(r: SessionRow): WorkSession {
  return {
    id: r.id,
    date: r.date,
    startTime: r.start_time,
    endTime: r.end_time,
    breakMinutes: r.break_minutes,
    minutes: r.minutes,
    projectId: r.project_id,
    projectName: r.project_name,
    projectColor: r.project_color,
    categoryId: r.category_id,
    categoryName: r.category_name,
    description: r.description,
    payType: r.pay_type,
    hourlyRateCents: r.hourly_rate_cents,
    flatAmountCents: r.flat_amount_cents,
    earnedCents: r.earned_cents,
    notes: r.notes,
  };
}

export function getSession(id: number): WorkSession {
  const r = db().prepare(`${SESSION_SELECT} WHERE w.id = ?`).get(id) as SessionRow | undefined;
  if (!r) throw notFound('Work session not found');
  return mapSession(r);
}

export interface SessionFilter {
  from?: ISODate;
  to?: ISODate;
  projectId?: number;
  categoryId?: number;
  payType?: string;
  q?: string;
  limit?: number;
  offset?: number;
}

export function listSessions(f: SessionFilter): { sessions: WorkSession[]; total: number; minutes: number; earnedCents: number } {
  const where = ['w.deleted_at IS NULL'];
  const args: unknown[] = [];
  if (f.from) (where.push('w.date >= ?'), args.push(f.from));
  if (f.to) (where.push('w.date <= ?'), args.push(f.to));
  if (f.projectId) (where.push('w.project_id = ?'), args.push(f.projectId));
  if (f.categoryId) (where.push('w.category_id = ?'), args.push(f.categoryId));
  if (f.payType) (where.push('w.pay_type = ?'), args.push(f.payType));
  if (f.q) {
    where.push("(w.description LIKE ? OR w.notes LIKE ? OR p.name LIKE ? OR c.name LIKE ?)");
    const like = `%${f.q}%`;
    args.push(like, like, like, like);
  }
  const clause = where.join(' AND ');
  const agg = db()
    .prepare(
      `SELECT COUNT(*) total, COALESCE(SUM(w.minutes), 0) minutes, COALESCE(SUM(w.earned_cents), 0) earned
         FROM work_sessions w LEFT JOIN projects p ON p.id = w.project_id LEFT JOIN categories c ON c.id = w.category_id
        WHERE ${clause}`,
    )
    .get(...args) as { total: number; minutes: number; earned: number };
  const rows = db()
    .prepare(`${SESSION_SELECT} WHERE ${clause} ORDER BY w.date DESC, w.start_time DESC, w.id DESC LIMIT ? OFFSET ?`)
    .all(...args, f.limit ?? 100, f.offset ?? 0) as SessionRow[];
  return { sessions: rows.map(mapSession), total: agg.total, minutes: agg.minutes, earnedCents: agg.earned };
}

function normalizeSession(input: WorkSessionInput, today: ISODate) {
  if (!isISODate(input.date)) throw badRequest('A valid date is required');
  const startTime = input.startTime && isClock(input.startTime) ? input.startTime : null;
  const endTime = input.endTime && isClock(input.endTime) ? input.endTime : null;
  const breakMinutes = Math.max(0, Math.round(input.breakMinutes ?? 0));
  let minutes: number;
  if (startTime && endTime) {
    minutes = spanMinutes(startTime, endTime) - breakMinutes;
    if (minutes <= 0) throw badRequest('The break is longer than the session');
  } else {
    minutes = Math.round(input.minutes ?? 0);
    if (!(minutes > 0)) throw badRequest('Enter a start and end time, or a duration');
  }
  if (minutes > 24 * 60) throw badRequest('A session cannot be longer than 24 hours');

  const projectId = resolveProject(input.projectId, input.projectName, today);
  const categoryId = resolveCategory(input.categoryId, input.categoryName);
  const payType = input.payType ?? 'hourly';
  let hourlyRateCents: number | null = null;
  let flatAmountCents: number | null = null;
  let earned = 0;
  if (payType === 'hourly') {
    // Resolve the rate now and store it, so changing a default later never rewrites history.
    const projectRate = projectId ? getProject(projectId).hourlyRateCents : null;
    hourlyRateCents = input.hourlyRateCents ?? projectRate ?? getSettings().defaultRateCents;
    if (hourlyRateCents < 0) throw badRequest('Rate cannot be negative');
    earned = Math.round((minutes * hourlyRateCents) / 60);
  } else if (payType === 'flat') {
    flatAmountCents = Math.round(input.flatAmountCents ?? 0);
    if (flatAmountCents < 0) throw badRequest('Amount cannot be negative');
    earned = flatAmountCents;
  }
  return {
    date: input.date,
    startTime,
    endTime,
    breakMinutes: startTime && endTime ? breakMinutes : 0,
    minutes,
    projectId,
    categoryId,
    description: input.description?.trim() || null,
    payType,
    hourlyRateCents,
    flatAmountCents,
    earned,
    notes: input.notes?.trim() || null,
  };
}

export function createSession(input: WorkSessionInput, today: ISODate): WorkSession {
  const s = normalizeSession(input, today);
  const r = db()
    .prepare(
      `INSERT INTO work_sessions (date, start_time, end_time, break_minutes, minutes, project_id, category_id,
         description, pay_type, hourly_rate_cents, flat_amount_cents, earned_cents, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      s.date, s.startTime, s.endTime, s.breakMinutes, s.minutes, s.projectId, s.categoryId,
      s.description, s.payType, s.hourlyRateCents, s.flatAmountCents, s.earned, s.notes,
    );
  return getSession(Number(r.lastInsertRowid));
}

export function updateSession(id: number, input: WorkSessionInput, today: ISODate): WorkSession {
  getSession(id);
  const s = normalizeSession(input, today);
  db()
    .prepare(
      `UPDATE work_sessions SET date = ?, start_time = ?, end_time = ?, break_minutes = ?, minutes = ?,
         project_id = ?, category_id = ?, description = ?, pay_type = ?, hourly_rate_cents = ?,
         flat_amount_cents = ?, earned_cents = ?, notes = ?, updated_at = datetime('now')
       WHERE id = ?`,
    )
    .run(
      s.date, s.startTime, s.endTime, s.breakMinutes, s.minutes, s.projectId, s.categoryId,
      s.description, s.payType, s.hourlyRateCents, s.flatAmountCents, s.earned, s.notes, id,
    );
  return getSession(id);
}

// ── Income ──────────────────────────────────────────────────────────────────

interface IncomeRow {
  id: number;
  date: string;
  amount_cents: number;
  source: string;
  kind: Income['kind'];
  project_id: number | null;
  project_name: string | null;
  category_id: number | null;
  category_name: string | null;
  notes: string | null;
}

export function mapIncome(r: IncomeRow): Income {
  return {
    id: r.id,
    date: r.date,
    amountCents: r.amount_cents,
    source: r.source,
    kind: r.kind,
    projectId: r.project_id,
    projectName: r.project_name,
    categoryId: r.category_id,
    categoryName: r.category_name,
    notes: r.notes,
  };
}

const INCOME_SELECT = `
  SELECT i.*, p.name AS project_name, c.name AS category_name
    FROM income i LEFT JOIN projects p ON p.id = i.project_id LEFT JOIN categories c ON c.id = i.category_id`;

export function getIncome(id: number): Income {
  const r = db().prepare(`${INCOME_SELECT} WHERE i.id = ?`).get(id) as IncomeRow | undefined;
  if (!r) throw notFound('Income entry not found');
  return mapIncome(r);
}

export function listIncome(from?: ISODate, to?: ISODate): Income[] {
  const rows = db()
    .prepare(
      `${INCOME_SELECT} WHERE i.deleted_at IS NULL AND i.date >= ? AND i.date <= ? ORDER BY i.date DESC, i.id DESC`,
    )
    .all(from ?? '0000-01-01', to ?? '9999-12-31') as IncomeRow[];
  return rows.map(mapIncome);
}

function normalizeIncome(input: IncomeInput, today: ISODate) {
  if (!isISODate(input.date)) throw badRequest('A valid date is required');
  const amount = Math.round(input.amountCents);
  if (!Number.isFinite(amount) || amount <= 0) throw badRequest('Enter an amount');
  const source = input.source?.trim();
  if (!source) throw badRequest('Describe where the money came from');
  const kind = ['flat', 'project', 'other'].includes(input.kind) ? input.kind : 'other';
  return {
    date: input.date,
    amount,
    source,
    kind,
    projectId: resolveProject(input.projectId, input.projectName, today),
    categoryId: resolveCategory(input.categoryId, input.categoryName),
    notes: input.notes?.trim() || null,
  };
}

export function createIncome(input: IncomeInput, today: ISODate): Income {
  const s = normalizeIncome(input, today);
  const r = db()
    .prepare(
      'INSERT INTO income (date, amount_cents, source, kind, project_id, category_id, notes) VALUES (?, ?, ?, ?, ?, ?, ?)',
    )
    .run(s.date, s.amount, s.source, s.kind, s.projectId, s.categoryId, s.notes);
  return getIncome(Number(r.lastInsertRowid));
}

export function updateIncome(id: number, input: IncomeInput, today: ISODate): Income {
  getIncome(id);
  const s = normalizeIncome(input, today);
  db()
    .prepare(
      `UPDATE income SET date = ?, amount_cents = ?, source = ?, kind = ?, project_id = ?, category_id = ?, notes = ?,
              updated_at = datetime('now') WHERE id = ?`,
    )
    .run(s.date, s.amount, s.source, s.kind, s.projectId, s.categoryId, s.notes, id);
  return getIncome(id);
}

// ── Live timer ──────────────────────────────────────────────────────────────

export function startTimer(opts: { projectId?: number | null; categoryId?: number | null; description?: string }, today: ISODate, clock: string): Timer {
  const existing = getTimer();
  if (existing) return existing;
  const t: Timer = {
    startedAt: new Date().toISOString(),
    pausedAt: null,
    breakMs: 0,
    projectId: opts.projectId ?? null,
    categoryId: opts.categoryId ?? null,
    description: opts.description ?? '',
    date: today,
    startClock: clock,
  };
  setTimer(t);
  return t;
}

export function updateTimer(patch: Partial<Pick<Timer, 'projectId' | 'categoryId' | 'description'>>): Timer {
  const t = getTimer();
  if (!t) throw badRequest('No timer is running');
  const next = { ...t, ...patch };
  setTimer(next);
  return next;
}

export function pauseTimer(): Timer {
  const t = getTimer();
  if (!t) throw badRequest('No timer is running');
  if (t.pausedAt) return t;
  const next = { ...t, pausedAt: new Date().toISOString() };
  setTimer(next);
  return next;
}

export function resumeTimer(): Timer {
  const t = getTimer();
  if (!t) throw badRequest('No timer is running');
  if (!t.pausedAt) return t;
  const next = { ...t, breakMs: t.breakMs + (Date.now() - Date.parse(t.pausedAt)), pausedAt: null };
  setTimer(next);
  return next;
}

export function timerElapsedMs(t: Timer, now = Date.now()): number {
  const end = t.pausedAt ? Date.parse(t.pausedAt) : now;
  return Math.max(0, end - Date.parse(t.startedAt) - t.breakMs);
}

/** Stop the timer and turn it into a work session. */
export function stopTimer(
  input: Omit<WorkSessionInput, 'date' | 'startTime' | 'endTime' | 'breakMinutes' | 'minutes'> & { minutes?: number },
  clock: string,
): WorkSession {
  const t = getTimer();
  if (!t) throw badRequest('No timer is running');
  const elapsedMin = Math.max(1, Math.round(timerElapsedMs(t) / 60000));
  const breakMinutes = Math.round((t.breakMs + (t.pausedAt ? Date.now() - Date.parse(t.pausedAt) : 0)) / 60000);
  // Use wall-clock times when they describe the session truthfully; otherwise
  // (a session under a minute, one left running past 24h, a manual correction)
  // store a plain duration.
  const span = spanMinutes(t.startClock, clock);
  const useClock =
    input.minutes === undefined && span - breakMinutes > 0 && Math.abs(span - breakMinutes - elapsedMin) <= 2;
  const session = createSession(
    {
      ...input,
      date: t.date,
      startTime: useClock ? t.startClock : null,
      endTime: useClock ? clock : null,
      breakMinutes: useClock ? breakMinutes : 0,
      minutes: useClock ? null : input.minutes ?? elapsedMin,
    },
    t.date,
  );
  setTimer(null);
  return session;
}

export function discardTimer() {
  setTimer(null);
}
