// Vision board: images and words that describe where you're headed. A card can
// be tied to a goal, whose live progress shows on the card, or to a bucket-list
// place on the travel map.

import { db } from '../db/connection.ts';
import { badRequest, notFound } from '../lib/errors.ts';
import { photoUrl, writeMedia } from './body.ts';
import { evaluate, getGoal } from './goals.ts';
import { getSettings } from './settings.ts';
import { isISODate, type ISODate } from '../../shared/dates.ts';
import type { VisionItem } from '../../shared/types.ts';

export const VISION_AREAS = ['Career', 'Money', 'Health', 'Fitness', 'Travel', 'Relationships', 'Growth', 'Home', 'Fun'];

interface Row {
  id: number;
  kind: 'image' | 'quote';
  title: string | null;
  body: string | null;
  area: string | null;
  image: string | null;
  thumb: string | null;
  width: number | null;
  height: number | null;
  tone: string | null;
  goal_id: number | null;
  place_id: number | null;
  place_name: string | null;
  place_status: string | null;
  place_first: string | null;
  target_date: string | null;
  achieved_on: string | null;
  position: number;
}

function map(r: Row, today: ISODate): VisionItem {
  let goal = null;
  if (r.goal_id) {
    try {
      goal = evaluate(getGoal(r.goal_id), today, getSettings().weekStart, false);
    } catch {
      goal = null; // goal deleted
    }
  }
  return {
    id: r.id,
    kind: r.kind,
    title: r.title,
    body: r.body,
    area: r.area,
    imageUrl: r.image ? photoUrl(r.image, r.id) : null,
    thumbUrl: r.thumb ? photoUrl(r.thumb, r.id) : r.image ? photoUrl(r.image, r.id) : null,
    width: r.width,
    height: r.height,
    tone: r.tone,
    goalId: r.goal_id,
    goal,
    placeId: r.place_id,
    placeName: r.place_name,
    placeStatus: (r.place_status as VisionItem['placeStatus']) ?? null,
    placeVisitedOn: r.place_first,
    targetDate: r.target_date,
    achievedOn: r.achieved_on,
    position: r.position,
  };
}

const SELECT = `SELECT v.*, p.name AS place_name, p.status AS place_status,
    (SELECT MIN(start_date) FROM visits WHERE place_id = p.id AND deleted_at IS NULL) AS place_first
  FROM vision_items v LEFT JOIN places p ON p.id = v.place_id AND p.deleted_at IS NULL`;

export function listVision(today: ISODate): VisionItem[] {
  return (db().prepare(`${SELECT} WHERE v.deleted_at IS NULL ORDER BY v.position, v.id`).all() as Row[]).map((r) => map(r, today));
}

export function getVision(id: number, today: ISODate): VisionItem {
  const r = db().prepare(`${SELECT} WHERE v.id = ?`).get(id) as Row | undefined;
  if (!r) throw notFound('Card not found');
  return map(r, today);
}

export interface VisionInput {
  kind?: 'image' | 'quote';
  title?: string | null;
  body?: string | null;
  area?: string | null;
  tone?: string | null;
  goalId?: number | null;
  placeId?: number | null;
  targetDate?: ISODate | null;
  achievedOn?: ISODate | null;
}

function clean(v: VisionInput) {
  if (v.targetDate && !isISODate(v.targetDate)) throw badRequest('Invalid target date');
  if (v.achievedOn && !isISODate(v.achievedOn)) throw badRequest('Invalid date');
  return {
    title: v.title?.trim().slice(0, 120) || null,
    body: v.body?.trim().slice(0, 600) || null,
    area: v.area?.trim().slice(0, 40) || null,
  };
}

export function createVision(input: VisionInput & { image?: { data: Buffer; mime: string; thumb?: Buffer | null; width?: number | null; height?: number | null } }, today: ISODate): VisionItem {
  const kind = input.image ? 'image' : 'quote';
  const c = clean(input);
  if (kind === 'quote' && !c.body && !c.title) throw badRequest('Write something for the card');
  let file: { file: string; thumb: string | null } | null = null;
  if (input.image) file = writeMedia('vision', 'vision', input.image.data, input.image.mime, input.image.thumb);
  // New cards go to the front of the board.
  const pos = (db().prepare('SELECT COALESCE(MIN(position), 0) - 1 p FROM vision_items').get() as { p: number }).p;
  const r = db()
    .prepare(
      `INSERT INTO vision_items (kind, title, body, area, image, thumb, width, height, tone, goal_id, place_id, target_date, position)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      kind, c.title, c.body, c.area, file?.file ?? null, file?.thumb ?? null, input.image?.width ?? null, input.image?.height ?? null,
      input.tone ?? null, input.goalId ?? null, input.placeId ?? null, input.targetDate ?? null, pos,
    );
  return getVision(Number(r.lastInsertRowid), today);
}

export function updateVision(id: number, patch: VisionInput, today: ISODate): VisionItem {
  const cur = getVision(id, today);
  const pick = <K extends 'title' | 'body' | 'area'>(k: K) => (patch[k] !== undefined ? patch[k] : cur[k]);
  const c = clean({ title: pick('title'), body: pick('body'), area: pick('area'), targetDate: patch.targetDate, achievedOn: patch.achievedOn });
  db()
    .prepare('UPDATE vision_items SET title = ?, body = ?, area = ?, tone = ?, goal_id = ?, place_id = ?, target_date = ?, achieved_on = ? WHERE id = ?')
    .run(
      patch.title !== undefined ? c.title : cur.title,
      patch.body !== undefined ? c.body : cur.body,
      patch.area !== undefined ? c.area : cur.area,
      patch.tone !== undefined ? patch.tone : cur.tone,
      patch.goalId !== undefined ? patch.goalId : cur.goalId,
      patch.placeId !== undefined ? patch.placeId : cur.placeId,
      patch.targetDate !== undefined ? patch.targetDate : cur.targetDate,
      patch.achievedOn !== undefined ? patch.achievedOn : cur.achievedOn,
      id,
    );
  return getVision(id, today);
}

export function reorderVision(ids: number[]) {
  const stmt = db().prepare('UPDATE vision_items SET position = ? WHERE id = ?');
  db().transaction(() => ids.forEach((id, i) => stmt.run(i, id)))();
}
