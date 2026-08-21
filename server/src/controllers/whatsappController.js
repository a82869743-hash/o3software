const pool = require('../config/db');

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

// ─── SEND MANUAL MESSAGE ────────────────────────────────
exports.sendManual = async (req, res) => {
  try {
    const { phone, message, customer_id } = req.body;
    if (!phone || !message) return res.status(400).json({ success: false, error: 'Phone and message required' });

    const result = await sendWhatsAppMessage(phone, null, [], message);
    if (customer_id) {
      try {
        await pool.query(`UPDATE whatsapp_messages SET customer_id = ? WHERE id = ?`, [customer_id, result.id]);
      } catch (dbErr) {}
    }
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('WhatsApp sendManual error:', err);
    res.status(500).json({ success: false, error: 'Failed to send message' });
  }
};

// ─── SEND INVOICE VIA WHATSAPP ──────────────────────────
exports.sendInvoice = async (req, res) => {
  try {
    const { phone, invoice_id, customer_name, amount } = req.body;
    if (!phone) return res.status(400).json({ success: false, error: 'Phone required' });

    const message = `🧾 *O3 Car Spa Invoice*\n\nDear ${customer_name || 'Customer'},\nYour invoice #${invoice_id} for ₹${Number(amount).toLocaleString('en-IN')} is ready.\n\nThank you for choosing O3 Car Spa! 🚗✨`;
    const result = await sendWhatsAppMessage(phone, null, [], message);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('WhatsApp sendInvoice error:', err);
    res.status(500).json({ success: false, error: 'Failed to send invoice' });
  }
};

// ─── AUTO: BOOKING CONFIRMATION ─────────────────────────
exports.sendBookingConfirmation = async (phone, customerName, date, time, serviceName) => {
  const message = `✅ *Booking Confirmed*\n\nHi ${customerName},\nYour booking for *${serviceName}* is confirmed.\n📅 ${date}\n⏰ ${time}\n\nSee you at O3 Car Spa! 🚗`;
  return sendWhatsAppMessage(phone, null, [], message);
};

// ─── AUTO: SERVICE COMPLETE ─────────────────────────────
exports.sendServiceComplete = async (phone, customerName, vehicleReg) => {
  const message = `🎉 *Service Complete!*\n\nHi ${customerName},\nYour vehicle (${vehicleReg}) service is complete and ready for pickup!\n\nThank you for choosing O3 Car Spa! ⭐`;
  return sendWhatsAppMessage(phone, null, [], message);
};

// ─── AUTO: PAYMENT REMINDER ─────────────────────────────
exports.sendPaymentReminder = async (phone, customerName, amount, dueDate) => {
  const message = `💳 *Payment Reminder*\n\nHi ${customerName},\nYou have a pending payment of ₹${Number(amount).toLocaleString('en-IN')}.\nDue: ${dueDate}\n\nPay online or visit O3 Car Spa. 🚗`;
  return sendWhatsAppMessage(phone, null, [], message);
};

// ─── AUTO: PACKAGE EXPIRY REMINDER ──────────────────────
exports.sendPackageExpiryReminder = async (phone, customerName, packageName, expiryDate) => {
  const message = `⚠️ *Package Expiring Soon*\n\nHi ${customerName},\nYour *${packageName}* package expires on ${expiryDate}.\n\nRenew now to continue enjoying premium services! 💎`;
  return sendWhatsAppMessage(phone, null, [], message);
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

// Export helper for use in other controllers
exports._sendWhatsAppMessage = sendWhatsAppMessage;
