const pool = require('../config/db');

// ─── LIST INQUIRIES ─────────────────────────
exports.list = async (req, res) => {
  try {
    const { status, source } = req.query;
    const franchiseId = (req.headers && req.headers['x-franchise-id']) ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let where = '(i.franchise_id = ? OR (i.franchise_id IS NULL AND ? = 1))';
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
      WHERE (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
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
      WHERE (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
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
    const { source, name, mobile, email, vehicle_brand, vehicle_model, services_interested } = req.body;
    let submitted_by = null;
    const franchiseId = (req.headers && req.headers['x-franchise-id']) ? parseInt(req.headers['x-franchise-id'], 10) : 1;

    // Supported inquiry origins
    const validSources = ['instagram', 'facebook', 'website', 'walk_in', 'staff', 'manual_intake'];
    const inquirySource = (source && validSources.includes(source)) ? source : (source || 'website');

    if (req.user && req.user.role === 'staff') {
      submitted_by = req.user.id;
    }

    if (!name || !mobile) {
      return res.status(400).json({ success: false, error: 'Name and mobile are required' });
    }

    const [result] = await pool.query(
      'INSERT INTO inquiries (source, name, mobile, email, vehicle_brand, vehicle_model, services_interested, submitted_by, franchise_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [inquirySource, name, mobile, email || null, vehicle_brand || null, vehicle_model || null, services_interested || null, submitted_by, franchiseId]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Inquiry submitted successfully' });
  } catch (err) {
    console.error('Inquiry create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE STATUS ──────────────────────────
exports.updateStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['new', 'followed_up', 'converted', 'cancelled'].includes(status)) {
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
    const [rows] = await pool.query('SELECT id FROM inquiries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Inquiry not found' });

    await pool.query('DELETE FROM inquiries WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Inquiry deleted' });
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

    // Return structured payload matching Job Cart POST body
    res.json({
      success: true,
      data: {
        customer_name: inquiry.name,
        customer_mobile: inquiry.mobile,
        customer_email: inquiry.email,
        car_brand: inquiry.vehicle_brand,
        car_model: inquiry.vehicle_model,
        notes: `Converted from inquiry #${inquiry.id}. Source: ${finalSource}. Interested in: ${inquiry.services_interested || 'General Service'}`
      },
      message: 'Inquiry ready to convert'
    });
  } catch (err) {
    console.error('Inquiry convert error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
