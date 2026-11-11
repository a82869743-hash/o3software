const pool = require('../config/db');
const { getSettingsMap, getStudioProfile } = require('../services/studioProfile');

// Keys a franchise admin may change from the Settings screen. Anything else is ignored.
const EDITABLE_KEYS = new Set([
  'studio_name', 'tagline', 'studio_address', 'studio_mobile', 'studio_email', 'studio_gst', 'invoice_footer',
  'invoice_prefix', 'invoice_counter', 'quotation_prefix', 'booking_advance_days', 'low_stock_threshold',
  'admin_whatsapp', 'pickup_charge', 'drop_charge', 'pickup_drop_charge', 'bookings_paused',
  'advance_type', 'advance_value', 'is_gst_applicable', 'gst_rate', 'google_review_url',
  'loyalty_points_ratio', 'loyalty_min_redeem', 'loyalty_point_value', 'loyalty_enabled',
  'referral_referrer_points', 'referral_reward_amount', 'referral_staff_reward_amount', 'referral_referee_discount',
  // Customer app home banner / offer popup
  'app_banner_url', 'app_offer_title', 'app_offer_subtitle', 'app_offer_code', 'app_offer_popup', 'app_offer_type', 'app_offer_value', 'app_offer_valid_till', 'app_offer_min_amount', 'app_offer_once', 'support_whatsapp', 'support_hours',
  // Which uploaded payment QR to show where (payment_qrs.id; empty = main QR)
  'qr_for_invoice', 'qr_for_jobcard', 'qr_for_payment',
  // Invoice design (Settings → Invoice)
  'invoice_slogan', 'invoice_terms', 'invoice_hero_url', 'invoice_services_strip', 'invoice_highlights',
  'invoice_footer_words', 'invoice_due_days', 'studio_instagram', 'studio_website', 'studio_pan',
]);

const scopeFid = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;

// ─── PUBLIC STUDIO INFO (customer checkout, header, invoices) ─
exports.getPublicSettings = async (req, res) => {
  try {
    const fid = Number(req.query.franchise_id) || Number(req.user?.franchise_id) || 1;
    const p = await getStudioProfile(fid);
    const [[pin]] = await pool.query('SELECT latitude, longitude FROM franchises WHERE id = ?', [fid]);
    res.json({
      success: true,
      data: {
        studio_name: p.studio_name,
        latitude: pin?.latitude ? Number(pin.latitude) : null,
        longitude: pin?.longitude ? Number(pin.longitude) : null,
        tagline: p.tagline,
        mobile: p.mobile,
        email: p.email,
        address: p.address,
        gstin: p.gstin,
        upi_id: p.upi_id,
        upi_number: p.upi_number,
        upi_name: p.upi_name,
        upi_qr_url: p.upi_qr_url,
        active_qr: p.active_qr,
        all_qrs: (p.all_qrs || []).filter(q => q.is_active === 1),
        bookings_paused: p.settings.bookings_paused === '1',
        advance_type: p.settings.advance_type || 'none',
        advance_value: p.settings.advance_value || '0',
        pickup_charge: p.settings.pickup_charge || '0',
        drop_charge: p.settings.drop_charge || '0',
        pickup_drop_charge: p.settings.pickup_drop_charge || '0',
        google_review_url: p.settings.google_review_url || '',
        app_banner_url: p.settings.app_banner_url || '',
        app_offer_title: p.settings.app_offer_title || '',
        app_offer_subtitle: p.settings.app_offer_subtitle || '',
        app_offer_code: p.settings.app_offer_code || '',
        app_offer_popup: p.settings.app_offer_popup === '1',
        app_offer_type: p.settings.app_offer_type === 'flat' ? 'flat' : 'percent',
        app_offer_value: Number(p.settings.app_offer_value) || 0,
        app_offer_valid_till: p.settings.app_offer_valid_till || '',
        app_offer_min_amount: Number(p.settings.app_offer_min_amount) || 0,
        support_whatsapp: p.settings.support_whatsapp || p.mobile,
        support_hours: p.settings.support_hours || '',
      },
    });
  } catch (err) {
    console.error('Settings getPublicSettings error:', err);
    res.status(500).json({ success: false, error: 'Could not load studio details' });
  }
};

// ─── GET ALL (admin settings screen) ─────────
exports.getAll = async (req, res) => {
  try {
    const fid = scopeFid(req);
    const map = await getSettingsMap(fid);
    if (!['admin', 'super_admin'].includes(req.user?.role)) delete map.lead_capture_key;
    const p = await getStudioProfile(fid);
    res.json({ success: true, data: { ...map, upi_qr_url: p.upi_qr_url, active_qr: p.active_qr, all_qrs: p.all_qrs } });
  } catch (err) {
    console.error('Settings getAll error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE ───────────────────────────────────
exports.updateAll = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const updates = req.body;
    if (!updates || typeof updates !== 'object' || Array.isArray(updates)) {
      return res.status(400).json({ success: false, error: 'Invalid payload' });
    }
    const fid = scopeFid(req);

    const errors = [];
    if (updates.studio_mobile && !/^[6-9]\d{9}$/.test(String(updates.studio_mobile).replace(/\D/g, '').slice(-10))) errors.push('Contact number must be a valid 10-digit mobile');
    if (updates.studio_email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(updates.studio_email)) errors.push('Support email is invalid');
    if (updates.studio_gst && !/^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/.test(String(updates.studio_gst).toUpperCase())) errors.push('GSTIN format is invalid (e.g. 24ABCDE1234F1Z5)');
    for (const k of ['invoice_counter', 'booking_advance_days', 'low_stock_threshold', 'pickup_charge', 'drop_charge', 'pickup_drop_charge', 'advance_value']) {
      if (updates[k] !== undefined && updates[k] !== '' && (isNaN(Number(updates[k])) || Number(updates[k]) < 0)) errors.push(`${k.replace(/_/g, ' ')} must be a positive number`);
    }
    if (errors.length) return res.status(400).json({ success: false, error: errors.join('. ') });

    await conn.beginTransaction();
    let saved = 0;
    for (const [key, value] of Object.entries(updates)) {
      if (!EDITABLE_KEYS.has(key)) continue;
      let v = value === null || value === undefined ? '' : String(value).trim();
      if (key === 'studio_gst') v = v.toUpperCase();
      await conn.query(
        'INSERT INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [fid, key, v]
      );
      saved++;
    }
    await conn.commit();
    res.json({ success: true, message: `Settings saved (${saved})` });
  } catch (err) {
    await conn.rollback();
    console.error('Settings updateAll error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── PAYMENT QRS ──────────────────────────────
exports.listPaymentQrs = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM payment_qrs WHERE franchise_id = ? ORDER BY is_active DESC, id DESC', [scopeFid(req)]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listPaymentQrs error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.createPaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { title, upi_id, upi_name, upi_number, is_active } = req.body;
    if (!title || !upi_id) return res.status(400).json({ success: false, error: 'Title and UPI ID are required' });
    if (!/^[\w.\-]{2,256}@[a-zA-Z]{2,64}$/.test(String(upi_id).trim())) {
      return res.status(400).json({ success: false, error: 'UPI ID looks invalid (e.g. 9876543210@ybl)' });
    }
    const fid = scopeFid(req);
    await conn.beginTransaction();
    const [[{ c }]] = await conn.query('SELECT COUNT(*) AS c FROM payment_qrs WHERE franchise_id = ?', [fid]);
    const makeActive = is_active || c === 0 ? 1 : 0;
    if (makeActive) await conn.query('UPDATE payment_qrs SET is_active = 0 WHERE franchise_id = ?', [fid]);
    const [result] = await conn.query(
      'INSERT INTO payment_qrs (franchise_id, title, upi_id, upi_name, upi_number, qr_image_url, is_active) VALUES (?, ?, ?, ?, ?, NULL, ?)',
      [fid, String(title).trim(), String(upi_id).trim(), upi_name || 'O3 Car Spaa', upi_number || null, makeActive]
    );
    await conn.commit();
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Payment QR added' });
  } catch (err) {
    await conn.rollback();
    console.error('createPaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.setActivePaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const fid = scopeFid(req);
    const [rows] = await conn.query('SELECT id FROM payment_qrs WHERE id = ? AND franchise_id = ?', [req.params.id, fid]);
    if (!rows.length) { conn.release(); return res.status(404).json({ success: false, error: 'Payment QR not found' }); }
    await conn.beginTransaction();
    await conn.query('UPDATE payment_qrs SET is_active = 0 WHERE franchise_id = ?', [fid]);
    await conn.query('UPDATE payment_qrs SET is_active = 1 WHERE id = ?', [req.params.id]);
    await conn.commit();
    res.json({ success: true, message: 'Active payment QR updated — it now shows on job cards, invoices and customer checkout.' });
  } catch (err) {
    await conn.rollback();
    console.error('setActivePaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.deletePaymentQr = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const fid = scopeFid(req);
    const [rows] = await conn.query('SELECT is_active FROM payment_qrs WHERE id = ? AND franchise_id = ?', [req.params.id, fid]);
    if (!rows.length) { conn.release(); return res.status(404).json({ success: false, error: 'Payment QR not found' }); }
    await conn.beginTransaction();
    await conn.query('DELETE FROM payment_qrs WHERE id = ?', [req.params.id]);
    if (rows[0].is_active === 1) {
      const [remaining] = await conn.query('SELECT id FROM payment_qrs WHERE franchise_id = ? ORDER BY id DESC LIMIT 1', [fid]);
      if (remaining.length) await conn.query('UPDATE payment_qrs SET is_active = 1 WHERE id = ?', [remaining[0].id]);
    }
    await conn.commit();
    res.json({ success: true, message: 'Payment QR removed' });
  } catch (err) {
    await conn.rollback();
    console.error('deletePaymentQr error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── UPLOAD QR IMAGE (multipart field "qr_image", optional ?qr_id=) ─
/** POST /settings/banner-upload (image) — saves it as this studio's customer-app banner */
exports.uploadBanner = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file uploaded' });
    const fid = scopeFid(req);
    const url = `/uploads/qr/${req.file.filename}`;
    // ?key=invoice_hero_url → invoice header picture; default → customer-app banner
    const key = req.query.key === 'invoice_hero_url' ? 'invoice_hero_url' : 'app_banner_url';
    await pool.query(
      'INSERT INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
      [fid, key, url]
    );
    res.json({ success: true, data: { [key]: url } });
  } catch (err) {
    console.error('uploadBanner error:', err);
    res.status(500).json({ success: false, error: 'Could not save banner' });
  }
};

/** GET /settings/invoice-preview — sample PDF using this studio's current invoice settings */
exports.invoicePreview = async (req, res) => {
  try {
    const pdf = await require('../services/invoiceService').generateSampleInvoicePDF(scopeFid(req));
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': 'inline; filename="invoice-preview.pdf"' });
    res.send(pdf);
  } catch (err) {
    console.error('invoicePreview error:', err);
    res.status(500).json({ success: false, error: 'Could not build the preview' });
  }
};

exports.uploadQrCode = async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ success: false, error: 'No image file uploaded' });
    const fid = scopeFid(req);
    const qrUrl = `/uploads/qr/${req.file.filename}`;
    let qrId = req.query.qr_id ? parseInt(req.query.qr_id, 10) : null;

    if (qrId) {
      const [own] = await pool.query('SELECT id FROM payment_qrs WHERE id = ? AND franchise_id = ?', [qrId, fid]);
      if (!own.length) return res.status(404).json({ success: false, error: 'Payment QR not found' });
    } else {
      const [active] = await pool.query('SELECT id FROM payment_qrs WHERE franchise_id = ? ORDER BY is_active DESC, id DESC LIMIT 1', [fid]);
      if (active.length) {
        qrId = active[0].id;
      } else {
        const p = await getStudioProfile(fid);
        const [ins] = await pool.query(
          'INSERT INTO payment_qrs (franchise_id, title, upi_id, upi_name, is_active) VALUES (?, ?, ?, ?, 1)',
          [fid, 'Studio UPI QR', p.upi_id || 'not-set@upi', p.studio_name]
        );
        qrId = ins.insertId;
      }
    }
    await pool.query('UPDATE payment_qrs SET qr_image_url = ? WHERE id = ?', [qrUrl, qrId]);
    res.json({ success: true, message: 'Payment QR image uploaded', data: { id: qrId, upi_qr_url: qrUrl } });
  } catch (err) {
    console.error('Settings uploadQrCode error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload QR Code' });
  }
};

// ─── PRICE VISIBILITY MATRIX (Super Admin only) ─
exports.getPriceVisibility = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT role, price_field, is_visible FROM price_visibility ORDER BY role, price_field');
    const matrix = {};
    for (const r of rows) {
      matrix[r.role] = matrix[r.role] || {};
      matrix[r.role][r.price_field] = r.is_visible === 1;
    }
    res.json({ success: true, data: matrix });
  } catch (err) {
    console.error('getPriceVisibility error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updatePriceVisibility = async (req, res) => {
  try {
    const matrix = req.body && req.body.matrix;
    const ROLES = ['admin', 'manager', 'staff', 'customer'];
    const FIELDS = ['cost_price', 'franchise_price', 'selling_price', 'staff_price'];
    if (!matrix || typeof matrix !== 'object') return res.status(400).json({ success: false, error: 'matrix is required' });
    for (const role of ROLES) {
      for (const field of FIELDS) {
        if (matrix[role] && typeof matrix[role][field] === 'boolean') {
          await pool.query(
            `INSERT INTO price_visibility (role, price_field, is_visible, updated_by) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE is_visible = VALUES(is_visible), updated_by = VALUES(updated_by)`,
            [role, field, matrix[role][field] ? 1 : 0, req.user.id]
          );
        }
      }
    }
    require('../services/priceVisibility').clearCache();
    try {
      const { logAudit } = require('./auditController');
      await logAudit(req.user.id, 'PRICE_VISIBILITY_UPDATED', 'settings', 0, matrix, req.ip);
    } catch { /* audit is best-effort */ }
    res.json({ success: true, message: 'Price visibility updated' });
  } catch (err) {
    console.error('updatePriceVisibility error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── PAYMENT QR IMAGE (PNG) — used by job cards, invoices, payments, customer checkout ─
// GET /settings/qr.png?amount=1499&note=Invoice%20O3-2026-0001&franchise_id=1
exports.qrImage = async (req, res) => {
  try {
    const fid = Number(req.query.franchise_id) || Number(req.user?.franchise_id) || 1;
    const place = ['invoice', 'jobcard', 'payment'].includes(req.query.for) ? req.query.for : null;
    const p = await getStudioProfile(fid, place);
    const amount = Number(req.query.amount) > 0 ? Number(req.query.amount) : null;
    const path = require('path');
    const fs = require('fs');
    // Fixed amount → generate a dynamic UPI QR so the customer pays the exact bill
    if (!amount && p.upi_qr_url && p.upi_qr_url.startsWith('/uploads/')) {
      const file = path.join(__dirname, '..', '..', p.upi_qr_url.replace(/^\//, ''));
      if (fs.existsSync(file)) { res.set('Cache-Control', 'no-store'); return res.sendFile(file); }
    }
    const { buildUpiLink } = require('../services/studioProfile');
    const link = buildUpiLink(p, amount, req.query.note);
    if (!link) return res.status(404).json({ success: false, error: 'No payment QR / UPI ID configured in Settings' });
    const QRCode = require('qrcode');
    const png = await QRCode.toBuffer(link, { margin: 1, width: 360 });
    res.set({ 'Content-Type': 'image/png', 'Cache-Control': 'no-store' });
    res.send(png);
  } catch (err) {
    console.error('qrImage error:', err);
    res.status(500).json({ success: false, error: 'Could not render QR' });
  }
};
