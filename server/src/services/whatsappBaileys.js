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
    try {
      await task.exec();
    } catch (err) {
      console.error('[Baileys] Queue task error:', err.message);
      if (task.reject) task.reject(err);
    }
    if (sendQueue.length > 0) {
      await sleep(humanDelay());
    }
  }
  queueBusy = false;
}

function enqueue(execFn) {
  return new Promise((resolve, reject) => {
    sendQueue.push({
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
        lastQR          = null;
        lastQRDataUrl   = null;
        const jid       = sock.user?.id || '';
        const phone     = jid.split(':')[0].split('@')[0];
        console.log(`[Baileys] ✅ Connected — WhatsApp number: +${phone}`);
        broadcast('whatsapp:status', { status: 'open', phone });
      }

      if (connection === 'close') {
        const errCode  = new Boom(lastDisconnect?.error)?.output?.statusCode;
        const isLogout = errCode === DisconnectReason.loggedOut;

        if (isLogout) {
          console.warn('[Baileys] Logged out — deleting session, waiting for re-scan.');
          // Clear session files so next connect shows fresh QR
          fs.rmSync(SESSION_DIR, { recursive: true, force: true });
          fs.mkdirSync(SESSION_DIR, { recursive: true });
          connectionState = 'logged_out';
          broadcast('whatsapp:status', { status: 'logged_out' });
          // Auto-reconnect to show QR again
          reconnectTimer = setTimeout(connect, 5000);
        } else {
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

    // Reset reconnect counter on successful open
    sock.ev.on('connection.update', ({ connection }) => {
      if (connection === 'open') {
        _reconnectAttempts = 0;
        isConnecting = false;
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
async function sendText(mobile, text) {
  const jid = toJid(mobile);

  if (!isConnected()) {
    console.warn(`[Baileys SANDBOX] Text to +${jid} : ${text.substring(0, 80)}...`);
    return { success: true, mocked: true, reason: 'WhatsApp not connected (sandbox)' };
  }

  return enqueue(async () => {
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
    console.log(`[Baileys] ✉️  Humanized text sent to +${jid.split('@')[0]} (typing simulated: ${typingDuration}ms)`);
    return { success: true, messageId: sent.key?.id };
  });
}

// ── Public: send document (PDF) ────────────────────────────────────────────────
async function sendDocument(mobile, fileBuffer, filename, caption = '') {
  const jid = toJid(mobile);

  if (!isConnected()) {
    console.warn(`[Baileys SANDBOX] Document "${filename}" to +${jid.split('@')[0]} (not connected)`);
    return { success: true, mocked: true, reason: 'WhatsApp not connected (sandbox)' };
  }

  return enqueue(async () => {
    const humanizer = require('../utils/humanizer');
    const finalCaption = caption ? humanizer.injectAntiFingerprintSalt(caption) : '';
    const sent = await sock.sendMessage(jid, {
      document: fileBuffer,
      mimetype: 'application/pdf',
      fileName: filename,
      caption: finalCaption
    });
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
  connect,
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
