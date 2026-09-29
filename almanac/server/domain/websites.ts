// Website sales board: a 10 × 5 grid, one slot per website sold. Each sale is
// a down payment plus a monthly fee, and the money is worked out from the sale
// dates, so nothing needs logging month to month.

import { db } from '../db/connection.ts';
import { badRequest } from '../lib/errors.ts';
import { addMonths, isISODate, type ISODate } from '../../shared/dates.ts';
import type { WebsiteSale, WebsiteSummary } from '../../shared/types.ts';

export const COLS = 10;
export const ROWS = 5;
export const SLOTS = COLS * ROWS;
export const DEFAULT_DOWN_CENTS = 0;
export const DEFAULT_MONTHLY_CENTS = 20000;

interface Row {
  slot: number;
  sold_on: string;
  client: string | null;
  down_cents: number;
  monthly_cents: number;
  notes: string | null;
}

/** Payments due by `today`: one on the sale date, then one on the same day each month. */
export function paymentsDue(soldOn: ISODate, today: ISODate): number {
  if (soldOn > today) return 0;
  let n = (Number(today.slice(0, 4)) - Number(soldOn.slice(0, 4))) * 12 + (Number(today.slice(5, 7)) - Number(soldOn.slice(5, 7)));
  if (addMonths(soldOn, n) > today) n--;
  return n + 1;
}

function map(r: Row, today: ISODate): WebsiteSale {
  const payments = paymentsDue(r.sold_on, today);
  return {
    slot: r.slot,
    soldOn: r.sold_on,
    client: r.client,
    downCents: r.down_cents,
    monthlyCents: r.monthly_cents,
    notes: r.notes,
    payments,
    collectedCents: r.down_cents + payments * r.monthly_cents,
  };
}

export function websiteSummary(today: ISODate): WebsiteSummary {
  const sales = (db().prepare('SELECT * FROM website_sales ORDER BY slot').all() as Row[]).map((r) => map(r, today));
  const monthlyCents = sales.reduce((a, s) => a + s.monthlyCents, 0);
  return {
    cols: COLS,
    rows: ROWS,
    slots: SLOTS,
    defaults: { downCents: DEFAULT_DOWN_CENTS, monthlyCents: DEFAULT_MONTHLY_CENTS },
    sales,
    sold: sales.length,
    monthlyCents,
    yearlyCents: monthlyCents * 12,
    collectedCents: sales.reduce((a, s) => a + s.collectedCents, 0),
    fullBoardMonthlyCents: SLOTS * DEFAULT_MONTHLY_CENTS,
  };
}

function checkSlot(slot: number) {
  if (!Number.isInteger(slot) || slot < 1 || slot > SLOTS) throw badRequest(`Pick a slot from 1 to ${SLOTS}`);
}

function cents(v: unknown, fallback: number, what: string) {
  if (v == null || v === '') return fallback;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n) || n < 0) throw badRequest(`Enter a ${what} of $0 or more`);
  return n;
}

/** Marks a slot sold, or updates the sale already in it. */
export function setWebsiteSale(
  slot: number,
  input: { soldOn?: ISODate; client?: string | null; downCents?: number; monthlyCents?: number; notes?: string | null },
  today: ISODate,
): WebsiteSale {
  checkSlot(slot);
  const prev = db().prepare('SELECT * FROM website_sales WHERE slot = ?').get(slot) as Row | undefined;
  const soldOn = input.soldOn ?? prev?.sold_on ?? today;
  if (!isISODate(soldOn)) throw badRequest('Invalid sale date');
  if (soldOn > today) throw badRequest('That day hasn’t happened yet');
  const client = input.client !== undefined ? input.client?.trim().slice(0, 80) || null : (prev?.client ?? null);
  const notes = input.notes !== undefined ? input.notes?.trim() || null : (prev?.notes ?? null);
  const down = cents(input.downCents, prev?.down_cents ?? DEFAULT_DOWN_CENTS, 'down payment');
  const monthly = cents(input.monthlyCents, prev?.monthly_cents ?? DEFAULT_MONTHLY_CENTS, 'monthly price');
  db()
    .prepare(
      `INSERT INTO website_sales (slot, sold_on, client, down_cents, monthly_cents, notes) VALUES (?, ?, ?, ?, ?, ?)
       ON CONFLICT(slot) DO UPDATE SET sold_on = excluded.sold_on, client = excluded.client, down_cents = excluded.down_cents,
         monthly_cents = excluded.monthly_cents, notes = excluded.notes`,
    )
    .run(slot, soldOn, client, down, monthly, notes);
  return map(db().prepare('SELECT * FROM website_sales WHERE slot = ?').get(slot) as Row, today);
}

export function clearWebsiteSale(slot: number) {
  checkSlot(slot);
  db().prepare('DELETE FROM website_sales WHERE slot = ?').run(slot);
}
