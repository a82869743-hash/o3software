/**
 * integrationsController — Super Admin "Integrations" health page.
 * Shows which third-party connections are live (never returns secrets) and sends one-off test messages.
 */
const nodemailer = require('nodemailer');
const pool = require('../config/db');
const notificationQueue = require('../services/notificationQueue');
const whatsappManager = require('../services/whatsapp/WhatsAppManager');
const llmManager = require('../services/ai/LLMManager');
const sendOtp = require('../utils/sendOtp');

const has = (v) => !!(v && String(v).trim());

async function whatsappStatus(franchiseId) {
  let dbRow = null;
  try {
    const [rows] = await pool.query(
      'SELECT provider, phone_number_id, is_enabled, (access_token_encrypted IS NOT NULL AND access_token_encrypted <> \'\') AS has_token FROM franchise_whatsapp_settings WHERE franchise_id = ?',
      [franchiseId]
    );
    dbRow = rows[0] || null;
  } catch (_) {}
  const provider = (dbRow && dbRow.is_enabled && dbRow.provider) || process.env.WHATSAPP_PROVIDER || 'meta_cloud';
  const envReady = has(process.env.WHATSAPP_ACCESS_TOKEN) && has(process.env.WHATSAPP_PHONE_NUMBER_ID);
  const dbReady = !!(dbRow && dbRow.is_enabled && dbRow.has_token && dbRow.phone_number_id);
  const warnings = [];
  const baileys = process.env.ENABLE_BAILEYS_DEMO === 'true';
  if (baileys) warnings.push('WhatsApp runs through the studio phone (linked by QR, not the official Meta service). If the link drops, scan the QR again in Admin → WhatsApp. Avoid mass promotional messages, or the number can get blocked.');
  if (!baileys && !has(process.env.WHATSAPP_APP_SECRET)) warnings.push('One WhatsApp security key is missing (developer: set WHATSAPP_APP_SECRET).');
  if (!baileys && !has(process.env.WHATSAPP_WEBHOOK_VERIFY_TOKEN)) warnings.push('WhatsApp link password not set (developer: set WHATSAPP_WEBHOOK_VERIFY_TOKEN).');
  return {
    configured: provider === 'meta_cloud' ? (envReady || dbReady) : provider !== 'mock',
    provider,
    source: dbReady ? 'franchise settings' : envReady ? 'server .env' : 'not set',
    template: process.env.WHATSAPP_UTILITY_TEMPLATE || 'o3_service_update',
    template_lang: process.env.WHATSAPP_TEMPLATE_LANG || 'en',
    webhook_path: '/api/whatsapp/webhook',
    warnings,
  };
}

exports.status = async (req, res) => {
  try {
    const franchiseId = parseInt(req.query.franchise_id, 10) || 1;
    const creds = await notificationQueue.getCredentials();
    const ai = llmManager.status();
    res.json({
      success: true,
      data: {
        sandbox: process.env.NOTIFICATION_SANDBOX === 'true',
        whatsapp: await whatsappStatus(franchiseId),
        email: {
          paused: process.env.EMAIL_ENABLED !== 'true',
          configured: process.env.EMAIL_ENABLED === 'true' && has(creds.smtp.user) && has(creds.smtp.pass),
          host: creds.smtp.host, port: creds.smtp.port,
          from: creds.smtp.from,
        },
        otp: { configured: sendOtp.otpConfigured(), provider: sendOtp.otpProvider() },
        ai: { configured: ai.provider !== 'studio', ...ai },
        ai_images: { configured: require('../services/imageGen').isConfigured(), model: process.env.GEMINI_IMAGE_MODEL || 'gemini-2.5-flash-image' },
        // key is generated per franchise on the Leads page ("Connect lead sources")
        leads_capture: { configured: true, webhook_path: '/api/leads/capture' },
      },
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

exports.test = async (req, res) => {
  const { type, to } = req.body || {};
  const franchiseId = parseInt(req.body?.franchise_id, 10) || 1;
  try {
    if (type === 'whatsapp') {
      const mobile = String(to || '').replace(/\D/g, '').slice(-10);
      if (mobile.length !== 10) return res.status(400).json({ success: false, error: 'Enter a 10-digit mobile number' });
      const r = await whatsappManager.sendText({ to: `91${mobile}`, text: 'This is a test message from O3 Car Spaa. WhatsApp is connected ✅', customerName: 'there', franchiseId });
      return res.json({ success: !!(r && r.success !== false), data: r });
    }
    if (type === 'email') {
      if (process.env.EMAIL_ENABLED !== 'true') return res.status(400).json({ success: false, error: 'Email is paused for now' });
      if (!/^\S+@\S+\.\S+$/.test(String(to || ''))) return res.status(400).json({ success: false, error: 'Enter a valid email' });
      const { smtp } = await notificationQueue.getCredentials();
      if (!has(smtp.user) || !has(smtp.pass)) return res.status(400).json({ success: false, error: 'SMTP_USER / SMTP_PASS not set' });
      const transporter = nodemailer.createTransport({ host: smtp.host, port: smtp.port, secure: smtp.port === 465, auth: { user: smtp.user, pass: smtp.pass } });
      const info = await transporter.sendMail({ from: smtp.from, to, subject: 'O3 Car Spaa — email test', text: 'Email is connected ✅' });
      return res.json({ success: true, data: { messageId: info.messageId } });
    }
    if (type === 'otp') {
      const mobile = String(to || '').replace(/\D/g, '').slice(-10);
      if (mobile.length !== 10) return res.status(400).json({ success: false, error: 'Enter a 10-digit mobile number' });
      const code = String(Math.floor(100000 + Math.random() * 900000));
      const ok = await sendOtp(mobile, code);
      return res.json({ success: ok, error: ok ? undefined : 'Code could not be sent (SMS key missing or WhatsApp not linked) — check the server log' });
    }
    if (type === 'ai') {
      // Call the provider directly so a bad key shows up here instead of silently falling back
      const provider = llmManager.getProvider();
      const r = await provider.generateResponse({
        messages: [
          { role: 'system', content: 'You are the friendly WhatsApp assistant of O3 Car Spaa, a car detailing studio in Anand, Gujarat. Reply in 1-2 short sentences.' },
          { role: 'user', content: to || 'Hi, do you do ceramic coating?' },
        ],
        maxTokens: 200,
      });
      return res.json({ success: !!r.text, data: { provider: provider.getProviderName(), reply: r.text, tokens: r.tokensUsed } });
    }
    return res.status(400).json({ success: false, error: 'type must be whatsapp | email | otp | ai' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
