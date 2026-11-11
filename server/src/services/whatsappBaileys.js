/**
 * whatsappBaileys.js — Official Baileys Multi-Device WhatsApp Engine
 *
 * Features:
 *   - QR-based pairing (scan once, session persists indefinitely)
 *   - Full persistent session state (no re-scan on server restart)
 *   - Smart anti-ban rate limiter with human-like randomised delays
 *   - Text and PDF document delivery
 *   - Socket.io real-time QR and status broadcasts to admin frontend
 *   - Auto-reconnect with exponential backoff on disconnect
 *   - Sandboxed when no session is present (logs only, no crash)
 */

const path = require('path');
const fs   = require('fs');
const pool = require('../config/db');

// ── Session storage ─────────────────────────────────────────────────────────
const SESSION_DIR = path.join(__dirname, '..', '..', 'sessions', 'whatsapp');
if (!fs.existsSync(SESSION_DIR)) {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
}

// ── State ────────────────────────────────────────────────────────────────────
// ── State ────────────────────────────────────────────────────────────────────
let sock         = null;   // Active Baileys socket
let io           = null;   // Socket.io instance (set via setIo)
let connectionState = 'disconnected'; // 'qr' | 'connecting' | 'open' | 'disconnected' | 'logged_out'
let lastQR       = null;   // Latest QR string for admin UI polling
let lastQRDataUrl = null;   // Latest QR data URL for admin UI display
let pairingCode   = null;   // Latest pairing code for phone number pairing
let reconnectTimer = null; // setTimeout handle for reconnect
let isConnecting  = false;
let linked        = false; // a phone has scanned and the saved session is valid

// ── Anti-ban queue ────────────────────────────────────────────────────────────
const sendQueue   = [];
let   queueBusy   = false;

// Randomised delay: 2.5s–6s between messages (human-like pacing)
function humanDelay() {
  const base   = 2500;
  const jitter = Math.floor(Math.random() * 3500);
  return base + jitter;
}

async function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

// ── Ban safety ────────────────────────────────────────────────────────────────
// WhatsApp flags numbers that message many strangers fast, repeat the same text, or hit numbers
// that are not on WhatsApp. Replies to people who wrote to us in the last 24 h are "warm" and go
// at normal pace; everything else is "cold": slow gap, daily limit, number check, no repeats.
const WARM_MS      = 24 * 60 * 60 * 1000;
const COLD_LIMIT   = parseInt(process.env.WA_DAILY_COLD_LIMIT, 10) || 150;
const lastInbound  = new Map();   // phone (last 10 digits) → time they last messaged us
const recentSent   = new Map();   // phone|text → time, blocks the same text twice in 24 h
const onWaCache    = new Map();   // phone → true/false
let   coldDay = '', coldCount = 0;

const key10 = (m) => String(m).replace(/\D/g, '').slice(-10);
function markInbound(mobile) { lastInbound.set(key10(mobile), Date.now()); }
function isWarm(mobile) { return Date.now() - (lastInbound.get(key10(mobile)) || 0) < WARM_MS; }
function coldGap() { return 15000 + Math.floor(Math.random() * 25000); } // 15–40 s

/** Throws with a clear reason when a cold message must not go out. */
async function coldCheck(jid, mobile, text) {
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (coldDay !== today) { coldDay = today; coldCount = 0; }
  if (coldCount >= COLD_LIMIT) {
    const e = new Error(`Daily limit reached (${COLD_LIMIT} messages to people who have not messaged first). Try again tomorrow.`);
    e.code = 'DAILY_LIMIT'; throw e;
  }
  const dupKey = key10(mobile) + '|' + String(text).trim().toLowerCase();
  if (Date.now() - (recentSent.get(dupKey) || 0) < WARM_MS) {
    const e = new Error('Same message already sent to this number in the last 24 hours'); e.code = 'DUPLICATE'; throw e;
  }
  const k = key10(mobile);
  if (!onWaCache.has(k)) {
    try {
      const [res] = await sock.onWhatsApp(jid);
      onWaCache.set(k, !!res?.exists);
    } catch (_) { onWaCache.set(k, true); } // lookup failed: don't block
  }
  if (!onWaCache.get(k)) {
    const e = new Error('This number is not on WhatsApp'); e.code = 'NOT_ON_WHATSAPP'; throw e;
  }
}
function noteSent(mobile, text, cold) {
  if (cold) coldCount++;
  recentSent.set(key10(mobile) + '|' + String(text).trim().toLowerCase(), Date.now());
  if (recentSent.size > 5000) for (const [k, t] of recentSent) if (Date.now() - t > WARM_MS) recentSent.delete(k);
}

// ── Broadcast helper ─────────────────────────────────────────────────────────
function broadcast(event, payload) {
  if (io) io.emit(event, payload);
}

// ── Queue processor ───────────────────────────────────────────────────────────
async function processQueue() {
  if (queueBusy || !sendQueue.length) return;
  queueBusy = true;

  while (sendQueue.length) {
    const task = sendQueue.shift();
    let sent = false;
    try {
      await task.exec();
      sent = true;
    } catch (err) {
      console.error('[Baileys] Queue task error:', err.message);
      if (task.reject) task.reject(err);
    }
    if (sendQueue.length > 0) {
      await sleep(sent && task.cold ? coldGap() : humanDelay());
    }
  }
  queueBusy = false;
}

function enqueue(execFn, cold = false, priority = false) {
  return new Promise((resolve, reject) => {
    // priority (login codes) jumps ahead of reminders/bulk so the customer isn't kept waiting
    sendQueue[priority ? 'unshift' : 'push']({
      cold,
      exec: async () => {
        try {
          const result = await execFn();
          resolve(result);
        } catch (err) {
          reject(err);
          throw err; // propagate for outer catch
        }
      },
      reject
    });
    processQueue();
  });
}

// ── Core: initialise WhatsApp connection ─────────────────────────────────────
async function connect() {
  // Clear any pending reconnect
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (isConnecting) return;
  isConnecting = true;

  // Cleanly close prior socket if still active
  if (sock) {
    try {
      sock.end();
      sock.ev.removeAllListeners();
    } catch (_) {}
    sock = null;
  }

  try {
    // Lazy-load Baileys (ESM default export under CJS wrapper)
    const baileysModule = await import('@whiskeysockets/baileys');
    const makeWASocket         = baileysModule.default;
    const {
      useMultiFileAuthState,
      fetchLatestBaileysVersion,
      DisconnectReason,
      makeInMemoryStore,
    } = baileysModule;

    const { Boom } = await import('@hapi/boom');
    const P         = (await import('pino')).default;

    const { state, saveCreds } = await useMultiFileAuthState(SESSION_DIR);
    linked = !!state.creds?.me;
    const { version }          = await fetchLatestBaileysVersion();

    console.log(`[Baileys] Connecting with WA v${version.join('.')}...`);
    connectionState = 'connecting';
    broadcast('whatsapp:status', { status: 'connecting' });

    sock = makeWASocket({
      version,
      auth:               state,
      logger:             P({ level: 'silent' }),   // suppress verbose Baileys logs
      printQRInTerminal:  false,                    // we manage QR ourselves via Socket.io
      // Browser fingerprint — looks like a normal desktop browser
      browser:            ['O3 Car Spa', 'Chrome', '122.0.6261.112'],
      // Keep-alive pings
      keepAliveIntervalMs: 30_000,
      // Retry message delivery on failure
      retryRequestDelayMs: 250,
      // Do NOT sync full message history to save memory
      syncFullHistory:     false,
      markOnlineOnConnect: false, // don't broadcast "online" status — quieter presence
    });

    // Persist credentials whenever they update
    sock.ev.on('creds.update', saveCreds);

    // ── QR code ──────────────────────────────────────────────────────────────
    sock.ev.on('connection.update', async (update) => {
      const { connection, lastDisconnect, qr } = update;

      // New QR arrived
      if (qr) {
        lastQR = qr;
        connectionState = 'qr';
        // Convert to data URL for frontend display
        try {
          const QRCode = require('qrcode');
          const dataUrl = await QRCode.toDataURL(qr);
          lastQRDataUrl = dataUrl;
          broadcast('whatsapp:qr', { qr: dataUrl, raw: qr });
          console.log('[Baileys] QR code refreshed — scan with WhatsApp on studio phone.');
        } catch (err) {
          broadcast('whatsapp:qr', { raw: qr });
        }
      }


      if (connection === 'open') {
        connectionState = 'open';
        linked          = true;
        lastQR          = null;
        lastQRDataUrl   = null;
        const jid       = sock.user?.id || '';
        const phone     = jid.split(':')[0].split('@')[0];
        console.log(`[Baileys] ✅ Connected — WhatsApp number: +${phone}`);
        broadcast('whatsapp:status', { status: 'open', phone });
        // No fixed number: whichever phone scanned the QR becomes the studio/admin WhatsApp number
        if (phone) {
          process.env.ADMIN_WHATSAPP_NUMBER = phone;
          pool.query(
            `INSERT INTO franchise_whatsapp_settings (franchise_id, provider, phone_number) VALUES (1, 'baileys_demo', ?)
             ON DUPLICATE KEY UPDATE provider = 'baileys_demo', phone_number = VALUES(phone_number)`, [phone]
          ).catch(err => console.error('[Baileys] could not save connected number:', err.message));
        }
      }

      if (connection === 'close') {
        const errCode  = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const isLogout = errCode === DisconnectReason.loggedOut;

        if (isLogout) {
          console.warn('[Baileys] Logged out — deleting session, waiting for re-scan.');
          // Clear session files so next connect shows fresh QR
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSION_DIR, { recursive: true });
          linked = false;
          connectionState = 'logged_out';
          broadcast('whatsapp:status', { status: 'logged_out' });
          // Auto-reconnect to show QR again
          reconnectTimer = setTimeout(connect, 5000);
        } else if (!linked && !state.creds?.me && errCode !== DisconnectReason.restartRequired) {
          // (right after a scan WhatsApp closes once with "restart required" and creds.me is set — that path reconnects below)
          // Not linked and the QR was not scanned in time: stop here instead of cycling QRs all day.
          // A fresh QR is made the next time an admin opens the WhatsApp page (see needsFreshQr).
          console.log('[Baileys] QR expired without a scan — a new one is made when an admin opens the WhatsApp page.');
          connectionState = 'qr_expired';
          lastQR = null; lastQRDataUrl = null;
          broadcast('whatsapp:status', { status: 'qr_expired' });
        } else {
          // Linked session dropped (network, WhatsApp restart): keep reconnecting until it is back
          // Transient disconnect — exponential backoff reconnect
          const delaySec = Math.min(60, Math.pow(2, _reconnectAttempts));
          _reconnectAttempts++;
          console.warn(`[Baileys] Connection closed (code: ${errCode}). Reconnecting in ${delaySec}s...`);
          connectionState = 'disconnected';
          broadcast('whatsapp:status', { status: 'disconnected', code: errCode });
          reconnectTimer = setTimeout(() => {
            connect().catch(err => console.error('[Baileys] Reconnect error:', err.message));
          }, delaySec * 1000);
        }

        sock = null;
        isConnecting = false;
      }
    });

    sock.ev.on('connection.update', ({ connection }) => {
      if (connection === 'open') {
        _reconnectAttempts = 0;
        isConnecting = false;
      }
    });

    // ── Inbound Message Listener (Automated Leads Agent & CRM Sync) ───────────
    sock.ev.on('messages.upsert', async ({ messages, type }) => {
      try {
        if (!messages || !Array.isArray(messages)) return;
        for (const msg of messages) {
          if (!msg.message || msg.key.fromMe) continue;
          const remoteJid = msg.key.remoteJid || '';
          // Ignore WhatsApp status updates and group messages
          if (remoteJid.endsWith('@g.us') || remoteJid === 'status@broadcast' || remoteJid.includes('broadcast')) continue;

          // Extract text from regular conversation, extended text, or image caption
          const body = msg.message.conversation ||
                       msg.message.extendedTextMessage?.text ||
                       msg.message.imageMessage?.caption ||
                       '';
          if (!body || !body.trim()) continue;

          // Newer WhatsApp hides the number behind a "@lid" id; the real number comes in senderPn / remoteJidAlt
          const pnJid = remoteJid.endsWith('@lid') ? (msg.key.senderPn || msg.key.remoteJidAlt || msg.key.participantPn || '') : remoteJid;
          if (!pnJid || pnJid.endsWith('@lid')) { console.warn('[Baileys Inbound] Skipped a message: sender number not available'); continue; }
          const phone = pnJid.split('@')[0].split(':')[0];
          const senderName = msg.pushName || 'Valued Customer';

          markInbound(phone);
          console.log(`[Baileys Inbound] 💬 Message from +${phone} (${senderName}): "${body}"`);

          // Forward to Leads Agent for AI Qualification, CRM storage & Auto-reply
          try {
            const leadsAgentService = require('./ai/LeadsAgentService');
            await leadsAgentService.processInboundMessage({
              phone,
              text: body.trim(),
              senderName,
              franchiseId: 1
            });
          } catch (agentErr) {
            console.error('[Baileys Inbound] LeadsAgent error:', agentErr.message);
          }
        }
      } catch (err) {
        console.error('[Baileys Inbound] Handler error:', err.message);
      }
    });

  } catch (err) {
    isConnecting = false;
    console.error('[Baileys] connect() fatal error:', err.message);
    connectionState = 'disconnected';
    broadcast('whatsapp:status', { status: 'disconnected', error: err.message });
    // Retry after 15 seconds
    reconnectTimer = setTimeout(() => {
      connect().catch(e => console.error('[Baileys] Delayed reconnect error:', e.message));
    }, 15_000);
  }
}

let _reconnectAttempts = 0;

// ── Normalise phone number to WhatsApp JID ───────────────────────────────────
function toJid(mobile) {
  let n = String(mobile).replace(/\D/g, '');
  if (n.length === 10) n = '91' + n;
  return `${n}@s.whatsapp.net`;
}

// ── Sandbox check ─────────────────────────────────────────────────────────────
function isConnected() {
  return sock !== null && connectionState === 'open';
}

// ── Public: send text message ─────────────────────────────────────────────────
async function sendText(mobile, text, opts = {}) {
  text = require('../utils/humanizer').limitEmojis(text);
  const jid = toJid(mobile);

  if (!isConnected()) {
    console.warn(`[Baileys SANDBOX] Text to +${jid.split('@')[0].replace(/\d(?=\d{4})/g, '*')} : not connected`);
    return { success: true, mocked: true, reason: 'WhatsApp not connected (sandbox)' };
  }

  const cold = !isWarm(mobile);
  return enqueue(async () => {
    if (cold) await coldCheck(jid, mobile, text);
    // Human-like typing presence simulation:
    // Natural human typing takes ~2-5s based on message character count
    const humanizer = require('../utils/humanizer');
    const typingDuration = Math.min(5200, Math.max(1800, (text.length * 20) + Math.floor(Math.random() * 1200)));
    try { await sock.sendPresenceUpdate('composing', jid); } catch (_) {}
    await sleep(typingDuration);
    try { await sock.sendPresenceUpdate('paused', jid); } catch (_) {}
    await sleep(350 + Math.floor(Math.random() * 300));

    // Inject invisible zero-width cryptographic salt so no two hashes ever match
    const finalPayload = humanizer.injectAntiFingerprintSalt(text);

    const sent = await sock.sendMessage(jid, { text: finalPayload });
    noteSent(mobile, text, cold);
    console.log(`[Baileys] ✉️  Humanized text sent to +${jid.split('@')[0]} (typing simulated: ${typingDuration}ms)`);
    return { success: true, messageId: sent.key?.id };
  }, cold, !!opts.priority); // cold → slow 15–40 s gap after it (was never passed before, so bulk went fast)
}

// ── Public: send document (PDF) ────────────────────────────────────────────────
async function sendDocument(mobile, fileBuffer, filename, caption = '') {
  caption = require('../utils/humanizer').limitEmojis(caption);
  const jid = toJid(mobile);

  if (!isConnected()) {
    console.warn(`[Baileys SANDBOX] Document "${filename}" to +${jid.split('@')[0]} (not connected)`);
    return { success: true, mocked: true, reason: 'WhatsApp not connected (sandbox)' };
  }

  const cold = !isWarm(mobile);
  return enqueue(async () => {
    if (cold) await coldCheck(jid, mobile, caption || filename);
    const humanizer = require('../utils/humanizer');
    const finalCaption = caption ? humanizer.injectAntiFingerprintSalt(caption) : '';
    const sent = await sock.sendMessage(jid, {
      document: fileBuffer,
      mimetype: 'application/pdf',
      fileName: filename,
      caption: finalCaption
    });
    noteSent(mobile, caption || filename, cold);
    console.log(`[Baileys] 📄 Document "${filename}" sent to +${jid.split('@')[0]}`);
    return { success: true, messageId: sent.key?.id };
  });
}

// ── Public: send document from local file path ────────────────────────────────
async function sendDocumentFromPath(mobile, filePath, filename, caption = '') {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Document file not found: ${filePath}`);
  }
  const buffer = fs.readFileSync(filePath);
  return sendDocument(mobile, buffer, filename, caption);
}

// ── Public: connection status info ────────────────────────────────────────────
function getStatus() {
  return {
    connected: isConnected(),
    state: connectionState,
    phone: sock?.user?.id?.split(':')[0].split('@')[0] || null,
    qr: isConnected() ? null : lastQRDataUrl,
    rawQr: isConnected() ? null : lastQR,
    pairingCode: pairingCode
  };
}

// ── Public: request phone number pairing code ────────────────────────────────
async function requestPairingCode(phone) {
  if (!sock) {
    await connect();
  }
  let normalized = (phone || '').replace(/\D/g, '');
  if (normalized.length === 10) normalized = '91' + normalized;

  // Allow socket a moment to establish handshake
  await sleep(2500);

  if (sock && !sock.authState.creds.registered) {
    try {
      const code = await sock.requestPairingCode(normalized);
      pairingCode = code;
      broadcast('whatsapp:pairing_code', { code, phone: normalized });
      console.log(`[Baileys] 🔑 Pairing code for ${normalized}: ${code}`);
      return code;
    } catch (err) {
      console.error('[Baileys] requestPairingCode error:', err.message);
      throw err;
    }
  }
  return null;
}

// ── Public: force disconnect / logout ─────────────────────────────────────────
async function logout() {
  if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null; }
  if (sock) {
    try { await sock.logout(); } catch (_) {}
    sock = null;
  }
  fs.rmSync(SESSION_DIR, { recursive: true, force: true });
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  linked = false;
  connectionState = 'disconnected';
  lastQR = null;
  lastQRDataUrl = null;
  pairingCode = null;
  broadcast('whatsapp:status', { status: 'disconnected' });
  console.log('[Baileys] Session cleared — QR scan required on next connect.');
}

// ── Public: register Socket.io instance ──────────────────────────────────────
function setIo(ioInstance) {
  io = ioInstance;
}

module.exports = {
  _test: { coldCheck, isWarm, noteSent, setSock: (x) => { sock = x; } },
  markInbound,
  safetyStatus: () => ({ coldSentToday: coldDay ? coldCount : 0, coldDailyLimit: COLD_LIMIT, queued: sendQueue.length }),
  connect,
  // Not linked and nothing in progress: the admin page should get a fresh QR
  needsFreshQr: () => !linked && !isConnecting && !reconnectTimer && !['qr', 'connecting', 'open'].includes(connectionState),
  disconnect: logout,
  logout,
  requestPairingCode,
  sendText,
  sendDocument,
  sendDocumentFromPath,
  getStatus,
  setIo,
  isConnected,
};
