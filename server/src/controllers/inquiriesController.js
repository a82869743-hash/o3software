const pool = require('../config/db');

// ─── LIST INQUIRIES ─────────────────────────
exports.list = async (req, res) => {
  try {
    const { status, source } = req.query;
    const franchiseId = (req.headers && req.headers['x-franchise-id']) ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let where = '(i.franchise_id = ? OR (i.franchise_id IS NULL AND ? = 1)) AND i.is_deleted = 0';
    let params = [franchiseId, franchiseId];
    
    if (status && status !== 'all') {
      where += ' AND i.status = ?';
      params.push(status);
    }
    if (source && source !== 'all') {
      where += ' AND i.source = ?';
      params.push(source);
    }

    const [rows] = await pool.query(`
      SELECT i.*, u.name as submitted_by_name 
      FROM inquiries i 
      LEFT JOIN users u ON i.submitted_by = u.id 
      WHERE ${where} 
      ORDER BY i.created_at DESC
    `, params);
    
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Inquiries list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── STATS (source breakdown) ────────────────────────────────
exports.stats = async (req, res) => {
  try {
    const franchiseId = (req.headers && req.headers['x-franchise-id']) ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    const [rows] = await pool.query(`
      SELECT 
        source,
        COUNT(*) as total,
        SUM(IF(status='new', 1, 0)) as new_count,
        SUM(IF(status='followed_up', 1, 0)) as followed_up,
        SUM(IF(status='converted', 1, 0)) as converted
      FROM inquiries
      WHERE (franchise_id = ? OR (franchise_id IS NULL AND ? = 1)) AND is_deleted = 0
      GROUP BY source
    `, [franchiseId, franchiseId]);

    const [totals] = await pool.query(`
      SELECT 
        COUNT(*) as total,
        SUM(IF(status='new', 1, 0)) as new_count,
        SUM(IF(status='followed_up', 1, 0)) as followed_up,
        SUM(IF(status='lost', 1, 0)) as lost,
        SUM(IF(status='converted', 1, 0)) as converted
      FROM inquiries
      WHERE (franchise_id = ? OR (franchise_id IS NULL AND ? = 1)) AND is_deleted = 0
    `, [franchiseId, franchiseId]);

    res.json({ success: true, data: { by_source: rows, totals: totals[0] } });
  } catch (err) {
    console.error('Inquiries stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE ────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inquiries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Inquiry not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Inquiry getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE INQUIRY (Staff or Website or Socials) ──────
exports.create = async (req, res) => {
  try {
    const { normalizeMobile, isValidMobile } = require('../utils/validators');
    const b = req.body || {};
    const franchiseId = req.user ? (req.franchiseId || req.user.franchise_id || 1) : (Number(b.franchise_id) || 1);
    const isCustomer = req.user && req.user.role === 'customer';
    const name = String(b.name || (isCustomer ? req.user.name : '') || '').trim();
    const mobile = isCustomer ? req.user.mobile : normalizeMobile(b.mobile);
    if (!name) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!isCustomer && !isValidMobile(b.mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });

    const [[existingCustomer]] = await pool.query("SELECT id FROM users WHERE mobile = ? AND role = 'customer' AND is_deleted = 0", [mobile]);

    // Not a customer yet → this is NEW BUSINESS: goes to Leads, not Inquiries
    if (!isCustomer && !existingCustomer && b.type !== 'support') {
      const { upsertLead } = require('../services/leadIntake');
      const r = await upsertLead({
        franchiseId, name, phone: mobile, email: b.email, vehicle_model: [b.vehicle_brand, b.vehicle_model].filter(Boolean).join(' ') || null,
        service_interest: b.services_interested || null, source: ['instagram', 'facebook', 'website', 'walk_in', 'google'].includes(b.source) ? b.source : (req.user ? 'walk_in' : 'website'),
        notes: b.message || b.subject || null,
      });
      return res.status(201).json({ success: true, data: { lead_id: r.id, type: 'lead' }, message: req.user ? 'New person, so this was added to Leads' : 'Thank you! Our team will contact you shortly.' });
    }

    // Existing customer → SUPPORT INQUIRY (questions, complaints, requests)
    const [result] = await pool.query(
      `INSERT INTO inquiries (source, name, mobile, email, vehicle_brand, vehicle_model, services_interested, submitted_by, franchise_id,
         customer_id, subject, message, status)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')`,
      [isCustomer ? 'customer_app' : (req.user ? (['instagram', 'facebook', 'website', 'walk_in', 'manual_intake', 'whatsapp'].includes(b.source) ? b.source : 'staff') : 'website'), name, mobile, b.email || null, b.vehicle_brand || null, b.vehicle_model || null,
        b.services_interested || null, req.user && !isCustomer ? req.user.id : null, franchiseId,
        isCustomer ? req.user.id : (existingCustomer?.id || null), b.subject ? String(b.subject).slice(0, 150) : null, b.message || null]
    );
    const io = req.app.get('io');
    if (io) io.to(`franchise_${franchiseId}`).emit('inquiry:new', { id: result.insertId });
    res.status(201).json({ success: true, data: { id: result.insertId, type: 'inquiry' }, message: 'Your question has been sent. We will reply on WhatsApp.' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Inquiry create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── REPLY (WhatsApp) ───────────────────────
exports.reply = async (req, res) => {
  try {
    const msg = String(req.body.reply || '').trim();
    if (!msg) return res.status(400).json({ success: false, error: 'Reply text is required' });
    const [[inq]] = await pool.query('SELECT * FROM inquiries WHERE id = ? AND franchise_id = ?', [req.params.id, req.franchiseId || 1]);
    if (!inq) return res.status(404).json({ success: false, error: 'Inquiry not found' });
    await require('../services/notificationService').notify({
      mobile: inq.mobile, customerId: inq.customer_id || null, customMessageBody: msg, channels: ['whatsapp'],
      franchiseId: inq.franchise_id, referenceType: 'inquiry', referenceId: inq.id,
    });
    await pool.query("UPDATE inquiries SET reply = ?, replied_at = NOW(), status = 'answered' WHERE id = ?", [msg, inq.id]);
    res.json({ success: true, message: 'Reply sent on WhatsApp' });
  } catch (err) {
    console.error('Inquiry reply error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE STATUS ──────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'followed_up', 'converted', 'open', 'answered', 'closed'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const [rows] = await pool.query('SELECT id FROM inquiries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Inquiry not found' });

    await pool.query('UPDATE inquiries SET status = ? WHERE id = ?', [status, req.params.id]);
    
    res.json({ success: true, message: 'Inquiry status updated' });
  } catch (err) {
    console.error('Inquiry update status error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE ─────────────────────────────────
exports.delete = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT id, franchise_id FROM inquiries WHERE id = ? AND is_deleted = 0', [req.params.id]);
    if (!rows.length || (req.user.role !== 'super_admin' && Number(rows[0].franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1))) {
      return res.status(404).json({ success: false, error: 'Inquiry not found' });
    }

    // archived, not erased: kept for records and hidden from the lists
    await pool.query('UPDATE inquiries SET is_deleted = 1, deleted_at = NOW() WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Inquiry archived' });
  } catch (err) {
    console.error('Inquiry delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CONVERT TO LEAD / JOB CART PRE-FILL ────────────────────
exports.convert = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM inquiries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Inquiry not found' });

    const inquiry = rows[0];

    if (inquiry.status === 'converted') {
      return res.status(400).json({ success: false, error: 'Inquiry already converted' });
    }

    // Accept optional lead_source to update the source on convert
    const { lead_source } = req.body;
    const validSources = ['instagram', 'facebook', 'website', 'walk_in', 'staff', 'manual_intake'];
    const finalSource = (lead_source && validSources.includes(lead_source)) ? lead_source : inquiry.source;

    // Auto-update status to converted and update source
    await pool.query('UPDATE inquiries SET status = "converted", source = ? WHERE id = ?', [finalSource, req.params.id]);

    // The converted inquiry also becomes a lead, so it shows in Leads with the same source.
    let leadId = null;
    try {
      const leadSource = { manual_intake: 'phone_call', staff: 'referral', customer_app: 'other', whatsapp: 'whatsapp_inbound' }[finalSource] || finalSource;
      const r = await require('../services/leadIntake').upsertLead({
        name: inquiry.name, mobile: inquiry.mobile, email: inquiry.email,
        vehicle_model: [inquiry.vehicle_brand, inquiry.vehicle_model].filter(Boolean).join(' ') || null,
        service_interest: inquiry.services_interested || null, source: leadSource, direction: 'inbound',
        notes: `From inquiry #${inquiry.id}${inquiry.message ? `: ${String(inquiry.message).slice(0, 300)}` : ''}`,
        franchiseId: inquiry.franchise_id || req.user?.franchise_id || 1,
      });
      leadId = r?.id || r?.lead_id || null;
    } catch (e) { console.warn('[Inquiry convert] lead not created:', e.message); }

    // Return structured payload matching Job Cart POST body
    res.json({
      success: true,
      data: {
        customer_name: inquiry.name,
        customer_mobile: inquiry.mobile,
        customer_email: inquiry.email,
        car_brand: inquiry.vehicle_brand,
        car_model: inquiry.vehicle_model,
        notes: `Converted from inquiry #${inquiry.id}. Source: ${finalSource}. Interested in: ${inquiry.services_interested || 'General Service'}`,
        lead_id: leadId,
      },
      message: 'Inquiry ready to convert'
    });
  } catch (err) {
    console.error('Inquiry convert error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
