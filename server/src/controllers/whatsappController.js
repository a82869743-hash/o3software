const pool = require('../config/db');
const notificationQueue = require('../services/notificationQueue');

// ─── WhatsApp Configuration ──────────────────────────────
const WHATSAPP_API_URL = process.env.WHATSAPP_API_URL || 'https://graph.facebook.com/v18.0';
const WHATSAPP_TOKEN = process.env.WHATSAPP_ACCESS_TOKEN;
const WHATSAPP_PHONE_ID = process.env.WHATSAPP_PHONE_NUMBER_ID;

async function sendWhatsAppMessage(phone, templateName, params = [], messageBody = '') {
  // Normalize phone to E.164
  let normalized = phone.replace(/\D/g, '');
  if (normalized.length === 10) normalized = '91' + normalized;
  if (!normalized.startsWith('+')) normalized = '+' + normalized;

  let msgId = Math.floor(Math.random() * 10000);
  try {
    // Log to DB regardless of provider availability
    const [result] = await pool.query(
      `INSERT INTO whatsapp_messages (phone, template_name, message_type, message_body, status)
       VALUES (?, ?, 'manual', ?, 'pending')`,
      [normalized, templateName, messageBody || `Template: ${templateName}`]
    );
    msgId = result.insertId;
  } catch (dbErr) {
    console.warn('sendWhatsAppMessage DB log error, running in Mock Mode:', dbErr.message);
  }

  if (!WHATSAPP_TOKEN || !WHATSAPP_PHONE_ID) {
    // Mock mode — mark as sent for dev
    try {
      await pool.query(`UPDATE whatsapp_messages SET status = 'sent', sent_at = NOW() WHERE id = ?`, [msgId]);
    } catch (dbErr) {}
    return { success: true, mock: true, id: msgId };
  }

  try {
    const response = await fetch(`${WHATSAPP_API_URL}/${WHATSAPP_PHONE_ID}/messages`, {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${WHATSAPP_TOKEN}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messaging_product: 'whatsapp',
        to: normalized,
        type: templateName ? 'template' : 'text',
        ...(templateName ? {
          template: { name: templateName, language: { code: 'en' }, components: params.length ? [{ type: 'body', parameters: params.map(p => ({ type: 'text', text: String(p) })) }] : [] }
        } : {
          text: { body: messageBody }
        })
      })
    });
    const data = await response.json();
    if (data.messages?.[0]?.id) {
      try {
        await pool.query(`UPDATE whatsapp_messages SET status = 'sent', provider_message_id = ?, sent_at = NOW() WHERE id = ?`, [data.messages[0].id, msgId]);
      } catch (dbErr) {}
      return { success: true, id: msgId, provider_id: data.messages[0].id };
    } else {
      try {
        await pool.query(`UPDATE whatsapp_messages SET status = 'failed', error_message = ? WHERE id = ?`, [JSON.stringify(data), msgId]);
      } catch (dbErr) {}
      return { success: false, error: data };
    }
  } catch (err) {
    try {
      await pool.query(`UPDATE whatsapp_messages SET status = 'failed', error_message = ? WHERE id = ?`, [err.message, msgId]);
    } catch (dbErr) {}
    return { success: false, error: err.message };
  }
}

// ─── SEND MANUAL MESSAGE (via notification queue → Baileys) ─────────────────
exports.sendManual = async (req, res) => {
  try {
    const { phone, message, customer_id, customer_name } = req.body;
    if (!phone || !message) return res.status(400).json({ success: false, error: 'Phone and message required' });

    const humanizer = require('../utils/humanizer');
    const humanizedBody = humanizer.humanizeManualMessage(message, customer_name);

    // Route through the notification queue so it's tracked + retried
    const result = await notificationQueue.enqueueNotification({
      idempotency_key: `manual_wa_${Date.now()}_${phone.replace(/\D/g, '')}`,
      channel:         'whatsapp',
      customer_id:     customer_id || null,
      mobile:          phone,
      template_name:   'MANUAL',
      message_body:    humanizedBody,
    });

    res.json({ success: true, data: result, humanized: true });
  } catch (err) {
    console.error('WhatsApp sendManual error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

// ─── PREVIEW / GENERATE DYNAMIC HUMANIZED VARIATIONS ───────────
exports.previewHumanized = async (req, res) => {
  try {
    const { eventTrigger = 'PIPELINE_STATUS_UPDATE', variables = {}, customText = '' } = req.body;
    const humanizer = require('../utils/humanizer');
    const crypto = require('crypto');

    const variations = [];
    for (let i = 0; i < 3; i++) {
      let text = '';
      if (customText) {
        text = humanizer.humanizeManualMessage(customText, variables.customer_name);
      } else {
        text = humanizer.humanizeNotification(eventTrigger, variables);
      }
      const hash = crypto.createHash('sha256').update(text).digest('hex');
      variations.push({
        id: i + 1,
        text,
        sha256: hash.substring(0, 16) + '...',
        byteLength: Buffer.byteLength(text, 'utf8')
      });
    }

    res.json({
      success: true,
      eventTrigger,
      antiBanProtected: true,
      variations
    });
  } catch (err) {
    console.error('previewHumanized error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── SEND INVOICE VIA WHATSAPP ──────────────────────────
exports.sendInvoice = async (req, res) => {
  try {
    const { phone, invoice_id, customer_name, amount, invoice_url } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone required' });

    const humanizer = require('../utils/humanizer');
    const message = humanizer.humanizeNotification('INVOICE_GENERATED', {
      customer_name: customer_name || 'Valued Customer',
      invoice_number: invoice_id,
      amount: Number(amount || 0).toLocaleString('en-IN'),
      invoice_url: invoice_url || `${process.env.APP_BASE_URL || 'http://localhost:5000'}/invoices/${invoice_id}`
    });

    const result = await notificationQueue.enqueueNotification({
      idempotency_key: `inv_wa_${invoice_id}_${Date.now()}`,
      channel: 'whatsapp',
      mobile: phone,
      template_name: 'INVOICE_GENERATED',
      message_body: message,
      reference_type: 'invoice',
      reference_id: invoice_id
    });

    res.json({ success: true, data: result });
  } catch (err) {
    console.error('WhatsApp sendInvoice error:', err);
    res.status(500).json({ success: false, error: 'Failed to send invoice' });
  }
};

// ─── AUTO: BOOKING CONFIRMATION ─────────────────────────
exports.sendBookingConfirmation = async (phone, customerName, date, time, serviceName) => {
  const humanizer = require('../utils/humanizer');
  const message = humanizer.humanizeNotification('BOOKING_CONFIRMED', {
    customer_name: customerName,
    booking_date: date,
    slot_time: time,
    service_name: serviceName,
    booking_id: Math.floor(Math.random() * 9000 + 1000)
  });
  return notificationQueue.enqueueNotification({
    idempotency_key: `booking_conf_${phone.replace(/\D/g, '')}_${Date.now()}`,
    channel: 'whatsapp',
    mobile: phone,
    template_name: 'BOOKING_CONFIRMED',
    message_body: message
  });
};

// ─── AUTO: SERVICE COMPLETE ─────────────────────────────
exports.sendServiceComplete = async (phone, customerName, vehicleReg) => {
  const humanizer = require('../utils/humanizer');
  const message = humanizer.humanizeNotification('SERVICE_COMPLETED', {
    customer_name: customerName,
    vehicle_number: vehicleReg,
    job_cart_id: 'JC-COMPLETED'
  });
  return notificationQueue.enqueueNotification({
    idempotency_key: `svc_complete_${phone.replace(/\D/g, '')}_${Date.now()}`,
    channel: 'whatsapp',
    mobile: phone,
    template_name: 'SERVICE_COMPLETED',
    message_body: message
  });
};

// ─── AUTO: PAYMENT REMINDER ─────────────────────────────
exports.sendPaymentReminder = async (phone, customerName, amount, dueDate) => {
  const humanizer = require('../utils/humanizer');
  const message = humanizer.humanizeNotification('PAYMENT_REMINDER', {
    customer_name: customerName,
    amount_due: Number(amount).toLocaleString('en-IN'),
    invoice_number: 'PENDING',
    due_date: dueDate
  });
  return notificationQueue.enqueueNotification({
    idempotency_key: `pay_remind_${phone.replace(/\D/g, '')}_${Date.now()}`,
    channel: 'whatsapp',
    mobile: phone,
    template_name: 'PAYMENT_REMINDER',
    message_body: message
  });
};

// ─── AUTO: PACKAGE EXPIRY REMINDER ──────────────────────
exports.sendPackageExpiryReminder = async (phone, customerName, packageName, expiryDate) => {
  const humanizer = require('../utils/humanizer');
  const message = humanizer.humanizeNotification('PACKAGE_EXPIRY_REMINDER', {
    customer_name: customerName,
    package_name: packageName,
    expiry_date: expiryDate,
    renewal_url: `${process.env.APP_BASE_URL || 'http://localhost:5000'}/packages`
  });
  return notificationQueue.enqueueNotification({
    idempotency_key: `pkg_expiry_${phone.replace(/\D/g, '')}_${Date.now()}`,
    channel: 'whatsapp',
    mobile: phone,
    template_name: 'PACKAGE_EXPIRY_REMINDER',
    message_body: message
  });
};

// ─── LIST MESSAGE HISTORY ───────────────────────────────
exports.list = async (req, res, next) => {
  try {
    const { customer_id, status, message_type, from, to, page = 1, limit = 50 } = req.query;
    let where = '1=1';
    const params = [];

    if (customer_id) { where += ' AND wm.customer_id = ?'; params.push(customer_id); }
    if (status) { where += ' AND wm.status = ?'; params.push(status); }
    if (message_type) { where += ' AND wm.message_type = ?'; params.push(message_type); }
    if (from) { where += ' AND wm.created_at >= ?'; params.push(from); }
    if (to) { where += ' AND wm.created_at <= ?'; params.push(to + ' 23:59:59'); }

    const offset = (page - 1) * limit;
    const [[{ total }]] = await pool.query(`SELECT COUNT(*) as total FROM whatsapp_messages wm WHERE ${where}`, params);
    const [rows] = await pool.query(
      `SELECT wm.*, u.name as customer_name FROM whatsapp_messages wm
       LEFT JOIN users u ON u.id = wm.customer_id
       WHERE ${where} ORDER BY wm.created_at DESC LIMIT ? OFFSET ?`,
      [...params, Number(limit), offset]
    );

    res.json({ success: true, data: rows, pagination: { total, page: Number(page), limit: Number(limit), pages: Math.ceil(total / limit) } });
  } catch (err) {
    next(err);
  }
};

// ─── STATS ──────────────────────────────────────────────
exports.stats = async (req, res, next) => {
  try {
    const [[stats]] = await pool.query(`
      SELECT
        COUNT(*) as total,
        SUM(status = 'sent') as sent,
        SUM(status = 'delivered') as delivered,
        SUM(status = 'failed') as failed,
        SUM(status = 'pending') as pending,
        SUM(DATE(created_at) = CURDATE()) as today
      FROM whatsapp_messages
    `);
    res.json({ success: true, data: stats });
  } catch (err) {
    next(err);
  }
};

// ─── BAILEYS SESSION MANAGEMENT ─────────────────────────────────────────────

/** GET /api/whatsapp/baileys/status — returns connection state + phone */
exports.baileysStatus = async (req, res) => {
  try {
    const baileys = require('../services/whatsappBaileys');
    res.json({ success: true, data: baileys.getStatus() });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/whatsapp/baileys/connect — triggers (re)connect + QR generation */
exports.baileysConnect = async (req, res) => {
  try {
    const baileys = require('../services/whatsappBaileys');
    // Non-blocking: client listens for whatsapp:qr via Socket.io
    baileys.connect().catch(err => console.error('[Baileys] connect error:', err.message));
    res.json({ success: true, message: 'WhatsApp connection initiated. Scan the QR code in the admin panel.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/whatsapp/baileys/disconnect — logout and clear session */
exports.baileysDisconnect = async (req, res) => {
  try {
    const baileys = require('../services/whatsappBaileys');
    await baileys.logout();
    res.json({ success: true, message: 'WhatsApp session disconnected and cleared.' });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/whatsapp/baileys/send-test — send a test message to verify connection */
exports.baileysSendTest = async (req, res) => {
  try {
    const { mobile, message } = req.body;
    if (!mobile) return res.status(400).json({ success: false, error: 'mobile is required' });

    const baileys = require('../services/whatsappBaileys');
    const text    = message || '🧪 Test message from O3 Car Spaa automation system. If you see this, WhatsApp is working! ✅';
    const result  = await baileys.sendText(mobile, text);
    res.json({ success: true, data: result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

/** POST /api/whatsapp/baileys/pairing-code — requests 8-digit pairing code */
exports.baileysRequestPairingCode = async (req, res) => {
  try {
    const phone = req.body.phone || process.env.ADMIN_WHATSAPP_NUMBER || '9316668760';
    const baileys = require('../services/whatsappBaileys');
    const code = await baileys.requestPairingCode(phone);
    res.json({ success: true, pairingCode: code });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};

// Export helper for use in other controllers
exports._sendWhatsAppMessage = sendWhatsAppMessage;

