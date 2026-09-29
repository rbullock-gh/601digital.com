import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';
import Fastify from 'fastify';
import fastifyStatic from '@fastify/static';
import multipart from '@fastify/multipart';
import { DATA_DIR, autoBackup, initStore } from './db/connection.ts';
import { HttpError } from './lib/errors.ts';
import { registerApi } from './routes/api.ts';
import { mimeFromExt, resolveMedia } from './domain/body.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const DIST = path.resolve(here, '..', 'dist');
const PORT = Number(process.env.ALMANAC_PORT ?? 4321);
const HOST = process.env.ALMANAC_HOST ?? '127.0.0.1';
const PASSCODE = process.env.ALMANAC_PASSCODE ?? '';

initStore();

const app = Fastify({ logger: { level: process.env.NODE_ENV === 'production' ? 'warn' : 'info' }, bodyLimit: 50 * 1024 * 1024 });
await app.register(multipart, { limits: { fileSize: 2 * 1024 * 1024 * 1024, files: 2 } });

// ── Optional passcode ─────────────────────────────────────────────────────────
// Off by default: on your own computer there is nothing to log in to. Set
// ALMANAC_PASSCODE when you expose Almanac to other devices on a network.
const secretFile = path.join(DATA_DIR, '.secret');
if (!fs.existsSync(secretFile)) fs.writeFileSync(secretFile, crypto.randomBytes(32).toString('hex'), { mode: 0o600 });
const SECRET = fs.readFileSync(secretFile, 'utf8');
const token = crypto.createHmac('sha256', SECRET).update(PASSCODE).digest('hex');
const COOKIE = 'almanac_session';

function authed(cookieHeader: string | undefined) {
  if (!PASSCODE) return true;
  const m = (cookieHeader ?? '').match(new RegExp(`(?:^|; )${COOKIE}=([a-f0-9]+)`));
  return !!m && crypto.timingSafeEqual(Buffer.from(m[1].padEnd(64, '0').slice(0, 64)), Buffer.from(token));
}

app.addHook('onRequest', async (req, reply) => {
  const url = req.url;
  if (!url.startsWith('/api/') && !url.startsWith('/media/')) return;
  if (url.startsWith('/api/auth')) return;
  if (!authed(req.headers.cookie)) return reply.code(401).send({ error: 'Passcode required' });
});

app.get('/api/auth', async (req) => ({ required: !!PASSCODE, ok: authed(req.headers.cookie) }));
app.post('/api/auth', async (req, reply) => {
  const { passcode } = (req.body ?? {}) as { passcode?: string };
  const a = Buffer.from(crypto.createHash('sha256').update(String(passcode ?? '')).digest('hex'));
  const b = Buffer.from(crypto.createHash('sha256').update(PASSCODE).digest('hex'));
  if (!PASSCODE || !crypto.timingSafeEqual(a, b)) {
    await new Promise((r) => setTimeout(r, 600));
    return reply.code(401).send({ error: 'Incorrect passcode' });
  }
  reply.header('Set-Cookie', `${COOKIE}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${60 * 60 * 24 * 365}`);
  return { ok: true };
});

// ── Errors ──────────────────────────────────────────────────────────────────
app.setErrorHandler((err, _req, reply) => {
  if (err instanceof HttpError) return reply.code(err.status).send({ error: err.message });
  const e = err as { statusCode?: number; message?: string };
  if (e.statusCode && e.statusCode < 500) return reply.code(e.statusCode).send({ error: e.message });
  app.log.error(err);
  return reply.code(500).send({ error: 'Something went wrong. Your data is safe — try again.' });
});

registerApi(app, !!PASSCODE);

// ── Photos (served from the data directory, never the public web root) ──────
app.get('/media/*', async (req, reply) => {
  const rel = decodeURIComponent((req.params as { '*': string })['*']);
  const abs = resolveMedia(rel);
  if (!abs) return reply.code(404).send();
  reply.header('Content-Type', mimeFromExt(abs)).header('Cache-Control', 'private, max-age=31536000, immutable');
  return reply.send(fs.createReadStream(abs));
});

// ── The web app ─────────────────────────────────────────────────────────────
if (fs.existsSync(DIST)) {
  await app.register(fastifyStatic, { root: DIST, maxAge: '1h' });
  app.setNotFoundHandler((req, reply) => {
    if (req.url.startsWith('/api/') || req.url.startsWith('/media/')) return reply.code(404).send({ error: 'Not found' });
    return reply.header('Cache-Control', 'no-cache').sendFile('index.html');
  });
}

// ── Daily safety snapshot ───────────────────────────────────────────────────
const snapshot = () => {
  try {
    autoBackup();
  } catch (e) {
    app.log.error(e, 'auto backup failed');
  }
};
snapshot();
setInterval(snapshot, 6 * 60 * 60 * 1000).unref();

await app.listen({ port: PORT, host: HOST });
console.log(`\n  Almanac is running → http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${PORT}\n  Data: ${DATA_DIR}\n`);
