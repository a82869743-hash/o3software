const pool = require('../config/db');
const messagingService = require('../services/messagingService');

// ─── LIST MESSAGES LOG ────────────────────────
exports.listLogs = async (req, res) => {
  try {
    const { status, channel, reference_type, reference_id } = req.query;
    const limit = Math.min(200, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = Math.max(0, parseInt(req.query.offset, 10) || 0);
    let where = '1=1';
    const params = [];

    // each studio sees only its own messages
    if (req.user.role !== 'super_admin' && req.getFranchiseCondition) {
      const fCond = req.getFranchiseCondition('nl.franchise_id');
      where += fCond.clause;
      params.push(...fCond.params);
    }
    
    if (status) {
      where += ' AND nl.status = ?';
      params.push(status);
    }
    if (channel) {
      where += ' AND nl.channel = ?';
      params.push(channel);
    }
    if (reference_type) {
      where += ' AND nl.reference_type = ?';
      params.push(reference_type);
    }
    if (reference_id) {
      where += ' AND nl.reference_id = ?';
      const refId = parseInt(reference_id, 10);
      if (!Number.isFinite(refId)) return res.status(400).json({ success: false, error: 'reference_id must be a number' });
      params.push(refId);
    }
    
    params.push(limit, offset);

    const [rows] = await pool.query(`
      SELECT nl.id, nl.customer_id, nl.mobile, nl.channel, nl.template_name,
             nl.message_body, nl.message_body AS message_preview, nl.status,
             nl.attempts, nl.last_attempt_at, nl.response_data, nl.created_at AS sent_at,
             u.name AS customer_name 
      FROM v2_notification_logs nl
      LEFT JOIN users u ON nl.customer_id = u.id
      WHERE ${where}
      ORDER BY nl.created_at DESC
      LIMIT ? OFFSET ?
    `, params);
    
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Messages list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CAMPAIGN AUDIENCE ────────────────────────
// Who gets a campaign. Always: this franchise's active customers with a mobile who did not opt out of promotions.
const AUDIENCES = {
  all:              { label: 'All customers' },
  active_package:   { label: 'Has an active package' },
  package_expiring: { label: 'Package ends in the next N days', days: 30 },
  package_expired:  { label: 'Package ended in the last N days', days: 60 },
  no_package:       { label: 'Never bought a package' },
  inactive:         { label: 'No visit in the last N days', days: 60 },
  recent:           { label: 'Visited in the last N days', days: 30 },
  new_customers:    { label: 'Joined in the last N days', days: 30 },
  car_type:         { label: 'Car type' },
  free_washes:      { label: 'Has free washes left' },
  credits:          { label: 'Has store credits' },
  selected:         { label: 'Pick customers by hand' },
};
// old campaign names still work
const LEGACY = { bulk_promotion: 'all', bulk_free_wash: 'free_washes', free_wash_reminder: 'free_washes', bulk_credits: 'credits',
  credits_reminder: 'credits', bulk_reengagement: 'inactive', reengagement: 'inactive' };

function audienceSql(input, fid) {
  const audience = AUDIENCES[input.audience] ? input.audience : (LEGACY[input.audience] || LEGACY[input.message_type] || 'all');
  const days = Math.min(3650, Math.max(1, parseInt(input.days, 10) || AUDIENCES[audience].days || 30));
  const where = ["u.role = 'customer'", 'u.is_active = 1', 'COALESCE(u.is_deleted, 0) = 0', "u.mobile IS NOT NULL AND u.mobile <> ''",
    'COALESCE(u.opt_out_promotional, 0) = 0', 'COALESCE(u.franchise_id, 1) = ?'];
  const params = [fid];
  // last visit = latest job card on any of their cars, or latest finished booking
  const lastVisit = `GREATEST(
      COALESCE((SELECT MAX(j.created_at) FROM job_carts j JOIN vehicles v ON v.id = j.vehicle_id WHERE v.customer_id = u.id AND j.status <> 'cancelled'), '1970-01-01'),
      COALESCE((SELECT MAX(b.created_at) FROM bookings b WHERE b.customer_id = u.id AND b.status IN ('completed','delivered')), '1970-01-01'))`;
  const activePkg = "EXISTS (SELECT 1 FROM user_packages up WHERE up.user_id = u.id AND up.package_status = 'active' AND (up.end_date IS NULL OR up.end_date >= CURDATE()))";
  switch (audience) {
    case 'active_package': where.push(activePkg); break;
    case 'package_expiring':
      where.push("EXISTS (SELECT 1 FROM user_packages up WHERE up.user_id = u.id AND up.package_status = 'active' AND up.end_date BETWEEN CURDATE() AND DATE_ADD(CURDATE(), INTERVAL ? DAY))");
      params.push(days); break;
    case 'package_expired':
      // ended recently and not renewed (no active package now)
      where.push("EXISTS (SELECT 1 FROM user_packages up WHERE up.user_id = u.id AND up.end_date < CURDATE() AND up.end_date >= DATE_SUB(CURDATE(), INTERVAL ? DAY) AND up.package_status <> 'cancelled')");
      where.push('NOT ' + activePkg);
      params.push(days); break;
    case 'no_package': where.push('NOT EXISTS (SELECT 1 FROM user_packages up WHERE up.user_id = u.id)'); break;
    case 'inactive': where.push(`${lastVisit} < DATE_SUB(NOW(), INTERVAL ? DAY)`); params.push(days); break;
    case 'recent': where.push(`${lastVisit} >= DATE_SUB(NOW(), INTERVAL ? DAY)`); params.push(days); break;
    case 'new_customers': where.push('u.created_at >= DATE_SUB(NOW(), INTERVAL ? DAY)'); params.push(days); break;
    case 'car_type': {
      const types = [].concat(input.car_types || []).map(String).filter(t => /^[a-z_]{2,30}$/.test(t));
      if (!types.length) return { error: 'Pick at least one car type' };
      where.push('EXISTS (SELECT 1 FROM vehicles v WHERE v.customer_id = u.id AND v.category IN (?))'); params.push(types); break;
    }
    case 'free_washes': where.push('EXISTS (SELECT 1 FROM loyalty l WHERE l.customer_id = u.id AND l.free_washes > 0)'); break;
    case 'credits': where.push('EXISTS (SELECT 1 FROM loyalty l WHERE l.customer_id = u.id AND l.credits > 0)'); break;
    case 'selected': {
      const ids = [].concat(input.customer_ids || []).map(Number).filter(n => n > 0);
      if (!ids.length) return { error: 'Pick at least one customer' };
      where.push('u.id IN (?)'); params.push(ids); break;
    }
  }
  return { audience, days, sql: `SELECT u.id, u.name, u.mobile FROM users u WHERE ${where.join(' AND ')} ORDER BY u.name`, params };
}
exports.audienceSql = audienceSql;

// GET /messages/bulk/audiences — the choices for the campaign form
exports.listAudiences = (req, res) => res.json({ success: true, data: Object.entries(AUDIENCES).map(([key, v]) => ({ key, ...v })) });

// ─── GET BULK PREVIEW ─────────────────────────
// ?audience=package_expiring&days=30 (or legacy ?campaign=bulk_free_wash). Same rule as sending.
exports.getBulkPreview = async (req, res) => {
  try {
    const q = { ...req.query, audience: req.query.audience || req.query.campaign,
      car_types: req.query.car_types ? String(req.query.car_types).split(',') : [],
      customer_ids: req.query.customer_ids ? String(req.query.customer_ids).split(',') : [] };
    const a = audienceSql(q, Number(req.franchiseId) || 1);
    if (a.error) return res.json({ success: true, data: { audience: q.audience, target_count: 0, sample: [], note: a.error } });
    const [users] = await pool.query(a.sql, a.params);
    res.json({ success: true, data: { audience: a.audience, days: a.days, target_count: users.length, campaign: q.audience,
      sample: users.slice(0, 8).map(u => u.name || u.mobile) } });
  } catch (err) {
    console.error('Messages preview error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SEND BULK (WhatsApp only — SMS is reserved for OTPs) ─────
exports.sendBulk = async (req, res) => {
  try {
    const { message_content } = req.body;
    if (!message_content || !String(message_content).trim()) {
      return res.status(400).json({ success: false, error: 'Message is required' });
    }
    const fid = Number(req.franchiseId) || 1;
    const a = audienceSql({ ...req.body, audience: req.body.audience || req.body.target_audience }, fid);
    if (a.error) return res.status(400).json({ success: false, error: a.error });
    const [users] = await pool.query(a.sql, a.params);
    if (!users.length) return res.status(400).json({ success: false, error: 'No customers match this audience' });

    const notificationService = require('../services/notificationService');
    const body = String(message_content).trim();
    let queued = 0;
    for (const u of users) {
      // {name} in the text becomes the customer's first name
      const text = body.replace(/\{name\}/gi, String(u.name || '').split(' ')[0] || 'there');
      const r = await notificationService.notify({
        customerId: u.id, customMessageBody: text, channels: ['whatsapp'],
        franchiseId: fid, referenceType: 'campaign', referenceId: null, eventTrigger: `CAMPAIGN_${a.audience.toUpperCase()}`,
      });
      if (r && r.success) queued++;
    }
    res.json({ success: true, data: { audience: a.audience, total: users.length, sent: queued, failed: users.length - queued },
      message: `WhatsApp campaign queued for ${queued} customer(s). Track delivery in Notification History.` });
  } catch (err) {
    console.error('Send bulk message error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SEND SINGLE (WhatsApp) ───────────────────
exports.sendSingle = async (req, res) => {
  try {
    const { customer_id, message_content } = req.body;
    if (!customer_id || !message_content || !String(message_content).trim()) {
      return res.status(400).json({ success: false, error: 'Customer and message are required' });
    }
    const [[user]] = await pool.query("SELECT id, mobile, franchise_id FROM users WHERE id = ? AND role = 'customer' AND is_deleted = 0", [customer_id]);
    if (!user || !user.mobile) return res.status(404).json({ success: false, error: 'Customer not found or has no mobile number' });
    if (req.user.role !== 'super_admin' && Number(user.franchise_id) !== Number(req.franchiseId)) {
      return res.status(403).json({ success: false, error: 'Customer belongs to another franchise' });
    }
    const r = await require('../services/notificationService').notify({
      customerId: user.id, customMessageBody: String(message_content).trim(), channels: ['whatsapp'], franchiseId: user.franchise_id || 1,
      referenceType: 'manual', referenceId: null,
    });
    res.json({ success: !!r.success, message: r.success ? 'WhatsApp message queued' : (r.error || 'Could not queue message') });
  } catch (err) {
    console.error('Send single message error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
