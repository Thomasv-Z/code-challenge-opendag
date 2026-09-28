import 'dotenv/config';
import express, { type NextFunction, type Request, type Response } from 'express';
import { createServer } from 'node:http';
import { existsSync } from 'node:fs';
import { networkInterfaces } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocketServer, WebSocket } from 'ws';
import { DIFFICULTIES, type Difficulty, type ServerEvent } from '@cc/shared';
import { openDb } from './db';
import { createSettingsStore } from './settings';
import { HttpError, createGame } from './game';

const here = dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT ?? 3000);
const ADMIN_PIN = process.env.ADMIN_PIN ?? '1234';
const DB_FILE = process.env.DB_FILE ?? join(here, '..', 'data', 'challenge.db');
const CLIENT_DIST = join(here, '..', '..', 'client', 'dist');

const db = openDb(DB_FILE);
const settings = createSettingsStore(db);
const game = createGame(db, settings);

const app = express();
app.use(express.json({ limit: '32kb' }));

const server = createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });
function broadcast(event: ServerEvent) {
  const msg = JSON.stringify(event);
  for (const client of wss.clients) if (client.readyState === WebSocket.OPEN) client.send(msg);
}

// Virtual adapters (WSL, Hyper-V, VPNs, Docker) aren't reachable from visitors' phones.
const VIRTUAL_ADAPTER = /vEthernet|WSL|Hyper-V|VirtualBox|VMware|docker|veth|br-|Tailscale|ZeroTier|Loopback/i;

function lanUrls() {
  if (process.env.PUBLIC_URL) return [process.env.PUBLIC_URL];
  return Object.entries(networkInterfaces())
    .filter(([name]) => !VIRTUAL_ADAPTER.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter((i) => i.family === 'IPv4' && !i.internal && !i.address.startsWith('169.254.'))
    .map((i) => `http://${i.address}:${PORT}`);
}

const requirePin = (req: Request, _res: Response, next: NextFunction) => {
  if (req.header('x-admin-pin') !== ADMIN_PIN) return next(new HttpError(401, 'invalid_pin'));
  next();
};

const asDifficulty = (v: unknown): Difficulty => {
  if (!DIFFICULTIES.includes(v as Difficulty)) throw new HttpError(400, 'invalid_difficulty');
  return v as Difficulty;
};

// --- public API ---
app.get('/api/settings', (_req, res) => {
  res.json(settings.get());
});

app.get('/api/info', (_req, res) => {
  res.json({ urls: lanUrls() });
});

app.get('/api/leaderboard', (req, res) => {
  const limit = Math.min(50, Math.max(1, Number(req.query.limit) || 10));
  res.json(Object.fromEntries(DIFFICULTIES.map((d) => [d, game.leaderboard(d, limit)])));
});

app.post('/api/runs', (req, res) => {
  res.status(201).json(game.startRun(req.body?.name, req.body?.difficulty));
});

app.post('/api/runs/:id/hint', (req, res) => {
  res.json(game.hint(req.params.id, Number(req.body?.index)));
});

app.post('/api/runs/:id/answer', (req, res) => {
  const out = game.answer(req.params.id, Number(req.body?.index), req.body?.answer);
  if (out.result) broadcast({ type: 'score:new', difficulty: out.result.difficulty, runId: out.result.runId });
  res.json(out);
});

// --- admin API ---
app.post('/api/admin/login', requirePin, (_req, res) => {
  res.json({ ok: true });
});

app.put('/api/admin/settings', requirePin, (req, res) => {
  const updated = settings.update(req.body);
  broadcast({ type: 'settings:updated', settings: updated });
  res.json(updated);
});

app.delete('/api/admin/runs', requirePin, (req, res) => {
  game.reset(req.query.difficulty ? asDifficulty(req.query.difficulty) : undefined);
  broadcast({ type: 'leaderboard:reset' });
  res.json({ ok: true });
});

app.get('/api/admin/export.csv', requirePin, (_req, res) => {
  res.type('text/csv').attachment('leaderboard.csv').send(game.exportCsv());
});

app.use('/api', (_req, _res, next) => next(new HttpError(404, 'not_found')));

// --- built client (production) ---
if (existsSync(CLIENT_DIST)) {
  app.use(express.static(CLIENT_DIST));
  app.get('*', (_req, res) => res.sendFile(join(CLIENT_DIST, 'index.html')));
}

app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
  if (err instanceof HttpError) return res.status(err.status).json({ error: err.code });
  console.error(err);
  res.status(500).json({ error: 'internal' });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n  Code Challenge server running on http://localhost:${PORT}`);
  for (const url of lanUrls()) console.log(`  On the network:  ${url}`);
  console.log(`  Leaderboard:     /leaderboard   Settings: /settings`);
  if (!process.env.ADMIN_PIN) console.warn('  ! ADMIN_PIN not set, using default "1234" (set it in server/.env)');
  console.log('');
});
