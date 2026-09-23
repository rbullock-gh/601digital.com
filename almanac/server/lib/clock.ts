import type { FastifyRequest } from 'fastify';
import { isClock, isISODate, localDate, localTime, type ISODate } from '../../shared/dates.ts';

// The browser knows the user's local date and time; the server may not share
// its time zone (it could be a home server or a VPS). Every request carries
// the client's clock and the server trusts it for "today".

export function today(req: FastifyRequest): ISODate {
  const h = req.headers['x-local-date'];
  return typeof h === 'string' && isISODate(h) ? h : localDate();
}

export function nowClock(req: FastifyRequest): string {
  const h = req.headers['x-local-time'];
  return typeof h === 'string' && isClock(h) ? h : localTime();
}
