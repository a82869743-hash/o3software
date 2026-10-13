const pool = require('../config/db');
const notificationQueue = require('../services/notificationQueue');
const notificationService = require('../services/notificationService');

/**
 * List notification logs with filters & pagination
 */
exports.getLogs = async (req, res) => {
  try {
    const { status, channel, search, customer_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '1=1';

    if (status) {
      where += ' AND l.status = ?';
      params.push(status);
    }
    if (channel) {
      where += ' AND l.channel = ?';
      params.push(channel);
    }
    if (customer_id) {
      where += ' AND l.customer_id = ?';
      params.push(customer_id);
    }
    if (search) {
      where += ' AND (l.mobile LIKE ? OR l.email LIKE ? OR l.template_name LIKE ? OR l.message_body LIKE ? OR l.idempotency_key LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM v2_notification_logs l WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT l.*, u.name AS customer_name
       FROM v2_notification_logs l
       LEFT JOIN users u ON l.customer_id = u.id
       WHERE ${where}
       ORDER BY l.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: countRows[0].total,
        totalPages: Math.ceil(countRows[0].total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('[NotificationController] getLogs error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching notification logs' });
  }
};

/**
 * Manual resend action for a notification
 */
exports.resend = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await notificationQueue.resendNotification(id);
    res.json(result);
  } catch (err) {
    console.error('[NotificationController] resend error:', err);
    res.status(err.message.includes('not found') ? 404 : 500).json({
      success: false,
      error: err.message
    });
  }
};

/**
 * List warranty certificates
 */
exports.getWarranties = async (req, res) => {
  try {
    const { search, customer_id, job_card_id, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page, 10) - 1) * parseInt(limit, 10);
    const params = [];
    let where = '1=1';

    if (customer_id) {
      where += ' AND wc.customer_id = ?';
      params.push(customer_id);
    }
    if (job_card_id) {
      where += ' AND wc.job_card_id = ?';
      params.push(job_card_id);
    }
    if (search) {
      where += ' AND (wc.certificate_no LIKE ? OR wc.vehicle_reg_no LIKE ? OR wc.service_type LIKE ? OR u.name LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM warranty_certificates wc LEFT JOIN users u ON wc.customer_id = u.id WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT wc.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
       FROM warranty_certificates wc
       LEFT JOIN users u ON wc.customer_id = u.id
       WHERE ${where}
       ORDER BY wc.id DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit, 10), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        total: countRows[0].total,
        totalPages: Math.ceil(countRows[0].total / parseInt(limit, 10))
      }
    });
  } catch (err) {
    console.error('[NotificationController] getWarranties error:', err);
    res.status(500).json({ success: false, error: 'Server error fetching warranty certificates' });
  }
};

/**
 * Get warranty certificate by ID
 */
exports.getWarrantyById = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT wc.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
       FROM warranty_certificates wc
       LEFT JOIN users u ON wc.customer_id = u.id
       WHERE wc.id = ? OR wc.certificate_no = ?`,
      [id, id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Warranty certificate not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('[NotificationController] getWarrantyById error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * Trigger sandbox / test notification dispatch
 */
exports.testSend = async (req, res) => {
  try {
    const { channel = 'whatsapp', mobile, email, template_name = 'TEST_NOTIFICATION', message_body = 'Test notification from O3 Car Spaa Sandbox.' } = req.body;

    const result = await notificationQueue.enqueueNotification({
      idempotency_key: `test_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
      channel,
      mobile: mobile || '9876543210',
      email: email || 'test@o3carspaa.com',
      template_name,
      message_body,
      payload_json: { test: true, timestamp: new Date().toISOString() }
    });

    res.json({
      success: true,
      message: 'Test notification queued',
      data: result
    });
  } catch (err) {
    console.error('[NotificationController] testSend error:', err);
    res.status(500).json({ success: false, error: err.message });
  }
};

/**
 * Get notification summary stats
 */
exports.getStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        COUNT(*) AS total,
        SUM(CASE WHEN status = 'sent' THEN 1 ELSE 0 END) AS sent_count,
        SUM(CASE WHEN status = 'queued' THEN 1 ELSE 0 END) AS queued_count,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
        SUM(CASE WHEN status = 'processing' THEN 1 ELSE 0 END) AS processing_count,
        SUM(CASE WHEN channel = 'whatsapp' THEN 1 ELSE 0 END) AS whatsapp_count,
        SUM(CASE WHEN channel = 'email' THEN 1 ELSE 0 END) AS email_count
      FROM v2_notification_logs
    `);

    res.json({
      success: true,
      data: stats[0]
    });
  } catch (err) {
    console.error('[NotificationController] getStats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
