/**
 * Phone push notifications (Android app) through Firebase Cloud Messaging.
 *
 * - Each signed-in phone registers its push token: POST /api/push/register.
 * - sendToUsers / sendToStudioTeam send an alert to every phone of those people.
 * - Turned on by FIREBASE_SERVICE_ACCOUNT_FILE (path to the Firebase service-account key, kept off git).
 *   Without it, every call quietly does nothing, so the website and WhatsApp keep working as before.
 */
const fs = require('fs');
const path = require('path');
const pool = require('../config/db');

let messaging = null;
let initTried = false;
let tableReady = null;

function getMessaging() {
  if (initTried) return messaging;
  initTried = true;
  const file = process.env.FIREBASE_SERVICE_ACCOUNT_FILE;
  if (!file) { console.log('[push] off (FIREBASE_SERVICE_ACCOUNT_FILE not set)'); return null; }
  try {
    const admin = require('firebase-admin');
    const key = JSON.parse(fs.readFileSync(path.resolve(file), 'utf8'));
    const app = admin.initializeApp({ credential: admin.credential.cert(key) }, 'o3-push');
    messaging = admin.messaging(app);
    console.log(`[push] on (Firebase project ${key.project_id})`);
  } catch (err) {
    console.error('[push] could not start:', err.message);
    messaging = null;
  }
  return messaging;
}

function ensureTable() {
  if (!tableReady) {
    tableReady = pool.query(`CREATE TABLE IF NOT EXISTS push_devices (
      id INT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
      user_id INT UNSIGNED NOT NULL,
      token VARCHAR(255) NOT NULL,
      platform VARCHAR(20) NOT NULL DEFAULT 'android',
      created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      last_seen_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uq_token (token),
      KEY idx_user (user_id)
    )`).catch((err) => { tableReady = null; throw err; });
  }
  return tableReady;
}

/** A phone signed in as this user: remember its token (a phone moves to whoever signed in last). */
async function register(userId, token, platform = 'android') {
  await ensureTable();
  await pool.query(
    `INSERT INTO push_devices (user_id, token, platform) VALUES (?, ?, ?)
     ON DUPLICATE KEY UPDATE user_id = VALUES(user_id), platform = VALUES(platform), last_seen_at = NOW()`,
    [userId, token, String(platform || 'android').slice(0, 20)]
  );
}

/** Sign-out on a phone: stop sending that person's alerts to it. */
async function unregister(token, userId = null) {
  await ensureTable();
  if (userId) await pool.query('DELETE FROM push_devices WHERE token = ? AND user_id = ?', [token, userId]);
  else await pool.query('DELETE FROM push_devices WHERE token = ?', [token]);
}

/** Account closed: forget all its phones. */
async function removeUser(userId) {
  try { await ensureTable(); await pool.query('DELETE FROM push_devices WHERE user_id = ?', [userId]); } catch { /* not critical */ }
}

const clip = (s, n) => {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

/**
 * Send one alert to every phone of these users.
 * payload: { title, body, url (app screen to open, e.g. "/customer/bookings"), tag (same tag replaces the older alert) }
 * Never throws — an alert must not break the action that triggered it.
 */
async function sendToUsers(userIds, payload = {}) {
  try {
    const ids = [...new Set((userIds || []).map(Number).filter(Boolean))];
    if (!ids.length) return { sent: 0 };
    const m = getMessaging();
    if (!m) return { sent: 0, off: true };
    await ensureTable();
    const [rows] = await pool.query(
      `SELECT d.token FROM push_devices d JOIN users u ON u.id = d.user_id
       WHERE d.user_id IN (?) AND u.is_active = 1 AND u.is_deleted = 0`, [ids]);
    const tokens = rows.map((r) => r.token);
    if (!tokens.length) return { sent: 0 };

    const title = clip(payload.title || 'O3 Car Spaa', 65);
    const body = clip(payload.body, 240);
    const res = await m.sendEachForMulticast({
      tokens,
      notification: { title, body },
      data: { url: String(payload.url || '/'), tag: String(payload.tag || '') },
      android: {
        priority: 'high',
        notification: {
          channelId: 'o3_updates',
          icon: 'ic_stat_notify',
          color: '#008DD2',
          ...(payload.tag ? { tag: String(payload.tag).slice(0, 60) } : {}),
        },
      },
    });

    // phones that uninstalled the app or reset their token: forget them
    const dead = [];
    res.responses.forEach((r, i) => {
      const code = r.error && r.error.code;
      if (code === 'messaging/registration-token-not-registered' || code === 'messaging/invalid-registration-token'
        || code === 'messaging/invalid-argument') dead.push(tokens[i]);
    });
    if (dead.length) await pool.query('DELETE FROM push_devices WHERE token IN (?)', [dead]);
    return { sent: res.successCount, failed: res.failureCount };
  } catch (err) {
    console.error('[push] send failed:', err.message);
    return { sent: 0, error: err.message };
  }
}

/** Alert the people who run a studio: its admins and managers, plus the Super Admin. */
async function sendToStudioTeam(franchiseId, payload, roles = ['admin', 'manager']) {
  try {
    const [rows] = await pool.query(
      `SELECT id FROM users WHERE is_active = 1 AND is_deleted = 0
         AND (role = 'super_admin' OR (role IN (?) AND COALESCE(franchise_id, 1) = ?))`,
      [roles, Number(franchiseId) || 1]
    );
    return sendToUsers(rows.map((r) => r.id), payload);
  } catch (err) {
    console.error('[push] team lookup failed:', err.message);
    return { sent: 0, error: err.message };
  }
}

/** Which app screen an alert should open, from what the message is about and who receives it. */
function screenFor(role, referenceType) {
  const ref = String(referenceType || '').toLowerCase();
  if (role === 'customer') {
    if (/job|invoice|warranty|feedback/.test(ref)) return '/customer/job-carts';
    if (/package/.test(ref)) return '/customer/buy-packages';
    if (/booking|payment|pickup|slot/.test(ref)) return '/customer/bookings';
    return '/customer';
  }
  if (role === 'staff') return /deliver|pickup/.test(ref) ? '/admin/my/deliveries' : '/admin';
  if (/package/.test(ref)) return '/admin/package-approvals';
  if (/booking/.test(ref)) return '/admin/customer-bookings';
  return '/admin';
}

module.exports = { register, unregister, removeUser, sendToUsers, sendToStudioTeam, screenFor, getMessaging, ensureTable };
