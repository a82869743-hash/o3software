/**
 * Live updates: when anyone changes data (admin adds a service, customer books, staff moves a job…), every open app
 * refreshes what it shows within about half a second, without a manual refresh.
 *
 * Works with one server process or a PM2 cluster: changes are written to a tiny `live_events` table, and every
 * process reads new rows twice a second and pushes `data:changed` to its own socket connections. Only the area that
 * changed (e.g. "services") is sent — never the data itself — so the apps simply reload what is on screen.
 */
const pool = require('../config/db');

const POLL_MS = 500;
// requests that change nothing other people see (sign-in, codes, checks) — sign-ups and profile edits do go out
const SKIP = /^(auth\/(login|logout|refresh|verify-otp|forgot-password|reset-password|change-password|otp\/send|otp\/login|dev-login)|bookings\/offer-check|health|v1\/health|analytics|client-errors|deliveries\/[^/]+\/location|push\/)/;

let lastId = 0;
let started = false;
const recent = new Map(); // resource -> time, to merge bursts from one request flood

async function ensureTable() {
  await pool.query(`CREATE TABLE IF NOT EXISTS live_events (
    id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
    resource VARCHAR(60) NOT NULL,
    created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
    KEY idx_created (created_at)
  )`);
}

/** Record that an area changed. Safe to call often; repeats within 300 ms are merged. */
async function publish(resource) {
  const now = Date.now();
  if (now - (recent.get(resource) || 0) < 300) return;
  recent.set(resource, now);
  try { await pool.query('INSERT INTO live_events (resource) VALUES (?)', [resource]); } catch { /* never break the request */ }
}

/** Express middleware: after any successful change under /api, publish its area (first part of the path). */
function middleware(req, res, next) {
  if (req.method === 'GET' || req.method === 'HEAD' || req.method === 'OPTIONS') return next();
  const path = (req.originalUrl.split('?')[0] || '').replace(/^\/api\/(v1\/)?/, '');
  if (SKIP.test(path)) return next();
  res.on('finish', () => {
    if (res.statusCode < 400) publish((path.split('/')[0] || 'data').slice(0, 60));
  });
  next();
}

/** Start reading new events and pushing them to this process's sockets. */
async function start(io) {
  if (started) return;
  started = true;
  try {
    await ensureTable();
    const [[r]] = await pool.query('SELECT COALESCE(MAX(id), 0) AS id FROM live_events');
    lastId = Number(r.id) || 0;
  } catch (err) {
    console.error('live updates disabled:', err.message);
    return;
  }
  let busy = false, ticks = 0;
  setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const [rows] = await pool.query('SELECT id, resource FROM live_events WHERE id > ? ORDER BY id LIMIT 500', [lastId]);
      if (rows.length) {
        lastId = Number(rows[rows.length - 1].id);
        io.emit('data:changed', { resources: [...new Set(rows.map(x => x.resource))] });
      }
      if (++ticks % 240 === 0) await pool.query('DELETE FROM live_events WHERE created_at < NOW() - INTERVAL 10 MINUTE');
    } catch { /* database hiccup: try again next tick */ }
    busy = false;
  }, POLL_MS).unref();
}

module.exports = { middleware, publish, start };
