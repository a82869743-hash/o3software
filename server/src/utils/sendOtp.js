/**
 * ─── SEND OTP SMS ───────────────────────────────────────────
 * SMS is used ONLY for login / register / forgot-password OTPs.
 * The OTP itself is generated + verified in our DB (otp_codes); this only delivers it.
 *
 * Providers (OTP_PROVIDER):
 *   2factor (default) — TWOFACTOR_API_KEY (legacy name MSG91_AUTH_KEY also accepted)
 *                       optional TWOFACTOR_TEMPLATE = your DLT-approved template name
 *                       GET https://2factor.in/API/V1/{key}/SMS/{mobile}/{otp}[/{template}]
 *   msg91             — MSG91_AUTH_KEY + MSG91_OTP_TEMPLATE_ID (DLT-approved OTP template)
 *                       POST https://control.msg91.com/api/v5/otp
 *
 * Returns boolean: true on success, false on failure.
 * NEVER throws — safe for fire-and-forget usage.
 */

const axios = require('axios');

function otpProvider() {
  const p = String(process.env.OTP_PROVIDER || '').toLowerCase();
  return p === 'msg91' ? 'msg91' : '2factor';
}

function smsConfigured() {
  if (otpProvider() === 'msg91') return !!(process.env.MSG91_AUTH_KEY && process.env.MSG91_OTP_TEMPLATE_ID);
  return !!(process.env.TWOFACTOR_API_KEY || process.env.MSG91_AUTH_KEY);
}

// Without an SMS key, codes go on WhatsApp through the studio's linked number (Baileys)
const whatsappOtpEnabled = () => process.env.ENABLE_BAILEYS_DEMO === 'true';

function otpConfigured() {
  return smsConfigured() || whatsappOtpEnabled();
}

/** 'sms' | 'whatsapp' | 'none' — the channel a code goes out on */
function otpChannel() {
  if (smsConfigured()) return 'sms';
  return whatsappOtpEnabled() ? 'whatsapp' : 'none';
}

async function sendWhatsAppOtp(mobile, otp) {
  const baileys = require('../services/whatsappBaileys');
  if (!baileys.isConnected()) {
    console.error('[OTP] WhatsApp is not linked — scan the QR in Admin → WhatsApp so login codes can be sent');
    return false;
  }
  // Sent in the background at the front of the queue, so the request doesn't wait for typing simulation
  baileys.sendText(mobile, `Your O3 Car Spaa code is ${otp}. It is valid for 5 minutes. Do not share it with anyone.`, { priority: true })
    .then(r => console.log(`OTP SENT (WhatsApp) — Mobile: ******${mobile.slice(-4)}${r?.mocked ? ' [not connected]' : ''}`))
    .catch(e => console.error(`OTP FAILED (WhatsApp) — Mobile: ******${mobile.slice(-4)} | ${e.message}`));
  return true;
}

async function send2Factor(mobile, otp) {
  const apiKey = process.env.TWOFACTOR_API_KEY || process.env.MSG91_AUTH_KEY;
  const template = process.env.TWOFACTOR_TEMPLATE ? `/${encodeURIComponent(process.env.TWOFACTOR_TEMPLATE)}` : '';
  const url = `https://2factor.in/API/V1/${encodeURIComponent(apiKey)}/SMS/${mobile}/${otp}${template}`;
  const response = await axios.get(url, { timeout: 10000 });
  if (response.data && response.data.Status === 'Success') return true;
  console.error(`OTP FAILED (2Factor) — Mobile: ${mobile} | Response:`, response.data);
  return false;
}

async function sendMsg91(mobile, otp) {
  const response = await axios.post('https://control.msg91.com/api/v5/otp', {}, {
    params: { template_id: process.env.MSG91_OTP_TEMPLATE_ID, mobile: `91${mobile}`, otp },
    headers: { authkey: process.env.MSG91_AUTH_KEY, 'Content-Type': 'application/json' },
    timeout: 10000,
  });
  if (response.data && response.data.type === 'success') return true;
  console.error(`OTP FAILED (MSG91) — Mobile: ${mobile} | Response:`, response.data);
  return false;
}

/**
 * @param {string} mobile  — 10-digit Indian mobile (no country code)
 * @param {string} otp     — Numeric OTP string
 * @returns {Promise<boolean>}
 */
async function sendOtp(mobile, otp) {
  const clean = String(mobile || '').replace(/\D/g, '').slice(-10);
  if (process.env.NODE_ENV !== 'production' && process.env.OTP_DEV_ECHO === 'true') console.log(`[DEV] OTP for ${clean}: ${otp}`);
  if (!smsConfigured()) {
    if (whatsappOtpEnabled()) return sendWhatsAppOtp(clean, otp);
    if (process.env.NODE_ENV === 'production') console.error('[OTP] No way to send codes — set TWOFACTOR_API_KEY, or link WhatsApp (ENABLE_BAILEYS_DEMO=true)');
    return false;
  }
  try {
    const ok = otpProvider() === 'msg91' ? await sendMsg91(clean, otp) : await send2Factor(clean, otp);
    if (ok) { console.log(`OTP SENT — Mobile: ******${clean.slice(-4)}`); return true; }
  } catch (err) {
    console.error(`OTP FAILED — Mobile: ******${clean.slice(-4)} | Error:`, err.response?.data || err.message);
  }
  // SMS failed: try WhatsApp when it is linked
  return whatsappOtpEnabled() ? sendWhatsAppOtp(clean, otp) : false;
}

module.exports = sendOtp;
module.exports.otpConfigured = otpConfigured;
module.exports.otpProvider = otpProvider;
module.exports.otpChannel = otpChannel;
