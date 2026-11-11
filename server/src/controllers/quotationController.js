const pool = require('../config/db');

// ─── CREATE QUOTATION ────────────────────────
const { nextQuotationNumber } = require('../services/numbering');
const { isValidMobile, normalizeMobile, validateRegNo } = require('../utils/validators');
const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;

/** Totals are always recalculated on the server from the items (never trust client maths). */
function computeTotals(items, body) {
  const clean = items.map(it => {
    const price = Math.max(0, Number(it.price ?? it.unit_price ?? 0) || 0);
    const qty = Math.max(1, Number(it.quantity || 1) || 1);
    return { item_type: it.item_type || 'custom', item_id: it.item_id || null, name: String(it.name || it.description || 'Service').slice(0, 200), price, quantity: qty, total: Math.round(price * qty * 100) / 100 };
  });
  const subtotal = clean.reduce((t, i) => t + i.total, 0);
  const dType = body.discount_type === 'percentage' ? 'percentage' : 'fixed';
  const dVal = Math.max(0, Number(body.discount_value || 0) || 0);
  const discount = Math.min(subtotal, dType === 'percentage' ? subtotal * Math.min(dVal, 100) / 100 : dVal);
  const taxPct = Math.max(0, Math.min(28, Number(body.tax_percentage || 0) || 0));
  const tax = Math.round((subtotal - discount) * taxPct) / 100;
  return { items: clean, subtotal, discount_type: dType, discount_value: dVal, discount_amount: Math.round(discount * 100) / 100,
    tax_percentage: taxPct, tax_amount: tax, grand_total: Math.round((subtotal - discount + tax) * 100) / 100 };
}

function validateQuote(body) {
  if (!body.customer_name || !String(body.customer_name).trim()) return 'Customer name is required';
  if (!isValidMobile(body.customer_mobile)) return 'Enter a valid 10-digit customer mobile';
  const reg = body.vehicle_no || body.registration_no;
  if (reg) { const r = validateRegNo(reg); if (!r.valid) return r.error; }
  if (!Array.isArray(body.items) || !body.items.length) return 'Add at least one service or product';
  return null;
}

/** A discount needs a reason and the admin / super admin who allowed it. Returns an error or null. */
async function checkDiscount(body, fid) {
  if (!(Number(body.discount_value) > 0)) return null;
  if (!body.discount_reason || !String(body.discount_reason).trim()) return 'Give a reason for the discount';
  if (!body.discount_approved_by) return 'Choose who approved the discount';
  const [[u]] = await pool.query(
    `SELECT id FROM users WHERE id = ? AND is_active = 1 AND is_deleted = 0
       AND (role = 'super_admin' OR (role = 'admin' AND franchise_id = ?))`, [body.discount_approved_by, fid]);
  return u ? null : 'The discount approver must be a studio admin or the super admin';
}
const discountCols = (body) => Number(body.discount_value) > 0
  ? [String(body.discount_reason).trim().slice(0, 255), Number(body.discount_approved_by)] : [null, null];

async function loadQuote(req, res, id) {
  const [[q]] = await pool.query('SELECT * FROM quotations WHERE id = ?', [id]);
  if (!q || (req.user.role !== 'super_admin' && Number(q.franchise_id || 1) !== fidOf(req))) {
    res.status(404).json({ success: false, error: 'Quotation not found' });
    return null;
  }
  return q;
}

exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      customer_name, customer_mobile, customer_email,
      vehicle_no, car_brand, car_model, car_segment,
      subtotal, discount_type, discount_value, discount_amount,
      tax_percentage, tax_amount, grand_total, valid_until, notes, items
    } = req.body;

    const vErr = validateQuote(req.body) || await checkDiscount(req.body, fidOf(req));
    if (vErr) { await conn.rollback(); return res.status(400).json({ success: false, error: vErr }); }
    const T = computeTotals(items, req.body);
    const fid = fidOf(req);
    const quotationNumber = await nextQuotationNumber(conn, fid);

    // Insert into quotations
    const [result] = await conn.query(
      `INSERT INTO quotations
       (quotation_number, customer_name, customer_mobile, customer_email, vehicle_no,
        car_brand, car_model, car_segment, subtotal, discount_type, discount_value,
        discount_amount, tax_percentage, tax_amount, grand_total, valid_until, notes, created_by, franchise_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ${fid})`,
      [
        quotationNumber,
        String(customer_name).trim(),
        normalizeMobile(customer_mobile),
        customer_email || null,
        vehicle_no || req.body.registration_no || null,
        car_brand || req.body.brand || null,
        car_model || req.body.model || null,
        car_segment || null,
        T.subtotal,
        T.discount_type,
        T.discount_value,
        T.discount_amount,
        T.tax_percentage,
        T.tax_amount,
        T.grand_total,
        valid_until || new Date(Date.now() + 15 * 86400000).toISOString().slice(0, 10),
        notes || null,
        req.user?.id || null
      ]
    );

    await conn.query('UPDATE quotations SET discount_reason = ?, discount_approved_by = ? WHERE id = ?', [...discountCols(req.body), result.insertId]);
    const quotationId = result.insertId;

    for (const item of T.items) {
      await conn.query(
        `INSERT INTO quotation_items (quotation_id, item_type, item_id, name, price, quantity, total) VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [quotationId, item.item_type, item.item_id, item.name, item.price, item.quantity, item.total]
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      data: { id: quotationId, quotation_number: quotationNumber },
      message: 'Quotation created successfully'
    });
  } catch (err) {
    await conn.rollback();
    console.error('Create quotation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── LIST QUOTATIONS ────────────────────────
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search, from_date, to_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    let where = "q.status != 'voided'";
    const params = [];
    if (!req.isGlobalAdmin) { where += ' AND q.franchise_id = ?'; params.push(fidOf(req)); }

    if (status) {
      where += " AND q.status = ?";
      params.push(status);
    }
    if (from_date) {
      where += " AND q.created_at >= ?";
      params.push(from_date);
    }
    if (to_date) {
      where += " AND q.created_at <= ?";
      params.push(to_date + ' 23:59:59');
    }
    if (search) {
      where += " AND (q.customer_name LIKE ? OR q.customer_mobile LIKE ? OR q.quotation_number LIKE ? OR q.vehicle_no LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s, s);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM quotations q WHERE ${where}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT q.*, u.name AS created_by_name
       FROM quotations q
       LEFT JOIN users u ON q.created_by = u.id
       WHERE ${where}
       ORDER BY q.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total }
    });
  } catch (err) {
    console.error('List quotations error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE QUOTATION ──────────────────────
exports.getOne = async (req, res) => {
  try {
    const [quotations] = await pool.query(
      `SELECT q.*, u.name AS created_by_name
       FROM quotations q
       LEFT JOIN users u ON q.created_by = u.id
       WHERE q.id = ? ${req.user.role === 'super_admin' ? '' : 'AND q.franchise_id = ' + fidOf(req)}`,
      [req.params.id]
    );

    if (!quotations.length) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    const [items] = await pool.query(
      "SELECT * FROM quotation_items WHERE quotation_id = ?",
      [req.params.id]
    );

    res.json({
      success: true,
      data: {
        ...quotations[0],
        items
      }
    });
  } catch (err) {
    console.error('Get quotation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE QUOTATION ────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      customer_name, customer_mobile, customer_email,
      vehicle_no, car_brand, car_model, car_segment,
      subtotal, discount_type, discount_value, discount_amount,
      tax_percentage, tax_amount, grand_total, valid_until, notes, status, items
    } = req.body;

    if (!customer_name || !customer_mobile) {
      return res.status(400).json({ success: false, error: 'Customer name and mobile are required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item is required' });
    }

    // Verify exists
    const [existing] = await conn.query("SELECT id FROM quotations WHERE id = ?", [req.params.id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    // Update quotations
    await conn.query(
      `UPDATE quotations
       SET customer_name = ?, customer_mobile = ?, customer_email = ?, vehicle_no = ?,
           car_brand = ?, car_model = ?, car_segment = ?, subtotal = ?, discount_type = ?,
           discount_value = ?, discount_amount = ?, tax_percentage = ?, tax_amount = ?,
           grand_total = ?, valid_until = ?, notes = ?, status = ?
       WHERE id = ?`,
      [
        customer_name,
        customer_mobile,
        customer_email || null,
        vehicle_no || null,
        car_brand || null,
        car_model || null,
        car_segment || null,
        subtotal || 0,
        discount_type || 'fixed',
        discount_value || 0,
        discount_amount || 0,
        tax_percentage || 0,
        tax_amount || 0,
        grand_total || 0,
        valid_until || null,
        notes || null,
        status || 'draft',
        req.params.id
      ]
    );

    // Delete existing items
    await conn.query("DELETE FROM quotation_items WHERE quotation_id = ?", [req.params.id]);

    // Re-insert items (totals recalculated on the server)
    for (const item of computeTotals(items, req.body).items) {
      await conn.query(
        `INSERT INTO quotation_items
         (quotation_id, item_type, item_id, name, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [req.params.id, item.item_type, item.item_id, item.name, item.price, item.quantity, item.total]
      );
    }

    await conn.query('UPDATE quotations SET discount_reason = ?, discount_approved_by = ? WHERE id = ?', [...discountCols(req.body), req.params.id]);
    await conn.commit();
    res.json({ success: true, message: 'Quotation updated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Update quotation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── SOFT DELETE (VOID) QUOTATION ────────────
exports.softDelete = async (req, res) => {
  try {
    const [result] = await pool.query(
      "UPDATE quotations SET status = 'voided' WHERE id = ?",
      [req.params.id]
    );

    if (result.affectedRows === 0) {
      return res.status(404).json({ success: false, error: 'Quotation not found' });
    }

    res.json({ success: true, message: 'Quotation voided (moved to recycle bin)' });
  } catch (err) {
    console.error('Void quotation error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DOWNLOAD PDF ────────────────────────────
exports.downloadPDF = async (req, res) => {
  try {
    const { generateQuotationPDF } = require('../services/invoiceService');
    const { pdfBuffer, quotationNumber } = await generateQuotationPDF(req.params.id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${quotationNumber}.pdf"`
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Quotation download PDF error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate quotation PDF' });
  }
};


// ─── STATUS (sent / accepted / declined) ─────
exports.setStatus = async (req, res) => {
  try {
    const q = await loadQuote(req, res, req.params.id);
    if (!q) return;
    const { status } = req.body;
    if (!['draft', 'sent', 'accepted', 'declined'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    await pool.query('UPDATE quotations SET status = ? WHERE id = ?', [status, q.id]);
    res.json({ success: true, message: `Quotation marked ${status}` });
  } catch (err) {
    console.error('Quotation status error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SEND ON WHATSAPP (summary + validity; a quotation is an estimate, not a bill) ─
exports.sendWhatsApp = async (req, res) => {
  try {
    const q = await loadQuote(req, res, req.params.id);
    if (!q) return;
    const [items] = await pool.query('SELECT name, quantity, total FROM quotation_items WHERE quotation_id = ?', [q.id]);
    const { getStudioProfile } = require('../services/studioProfile');
    const studio = await getStudioProfile(q.franchise_id || 1);
    const lines = items.map(i => `• ${i.name}${i.quantity > 1 ? ` × ${i.quantity}` : ''} — ₹${Number(i.total).toLocaleString('en-IN')}`).join('\n');
    const body = `*Quotation ${q.quotation_number}* from ${studio.studio_name}\n` +
      `${q.car_brand || ''} ${q.car_model || ''} ${q.vehicle_no ? `(${q.vehicle_no})` : ''}\n\n${lines}\n\n` +
      `${Number(q.discount_amount) > 0 ? `Discount: -₹${Number(q.discount_amount).toLocaleString('en-IN')}\n` : ''}` +
      `${Number(q.tax_amount) > 0 ? `GST: ₹${Number(q.tax_amount).toLocaleString('en-IN')}\n` : ''}` +
      `*Estimated total: ₹${Number(q.grand_total).toLocaleString('en-IN')}*\n` +
      `${q.valid_until ? `Valid till ${new Date(q.valid_until).toLocaleDateString('en-IN')}. ` : ''}This is an estimate, not a bill. Reply YES to book.`;
    await require('../services/notificationService').notify({
      mobile: q.customer_mobile, email: q.customer_email || null, customMessageBody: body, channels: ['whatsapp'], franchiseId: q.franchise_id || 1,
      referenceType: 'quotation', referenceId: q.id,
    });
    if (q.status === 'draft') await pool.query("UPDATE quotations SET status = 'sent' WHERE id = ?", [q.id]);
    res.json({ success: true, message: 'Quotation sent on WhatsApp' });
  } catch (err) {
    console.error('Quotation WhatsApp error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CONVERT → JOB CARD (prefill; marks accepted) ───
exports.convertToJob = async (req, res) => {
  try {
    const q = await loadQuote(req, res, req.params.id);
    if (!q) return;
    const [[madeJc]] = await pool.query(
      "SELECT id FROM job_carts WHERE notes LIKE ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1",
      [`From quotation ${q.quotation_number}%`]);
    if (madeJc) {
      return res.status(409).json({ success: false, error: `A job card (#${madeJc.id}) was already made from this quotation` });
    }
    const [items] = await pool.query("SELECT name, price, quantity, item_type FROM quotation_items WHERE quotation_id = ?", [q.id]);
    await pool.query("UPDATE quotations SET status = 'accepted' WHERE id = ?", [q.id]);
    res.json({ success: true, data: {
      vehicle_reg_no: q.vehicle_no, customer_name: q.customer_name, customer_mobile: q.customer_mobile, customer_email: q.customer_email,
      car_brand: q.car_brand, car_model: q.car_model, car_category: q.car_segment,
      services: items.filter(i => i.item_type !== 'product').map(i => ({ service_name: i.name, service_price: Number(i.price) * Number(i.quantity || 1) })),
      notes: `From quotation ${q.quotation_number}`,
    } });
  } catch (err) {
    console.error('Quotation convert error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// Franchise ownership + validation guards for edit / delete / PDF
// once a job card is made from a quotation, the quotation is locked (the job card is now the record)
async function jobFromQuote(q) {
  const [[jc]] = await pool.query("SELECT id FROM job_carts WHERE notes LIKE ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1", [`From quotation ${q.quotation_number}%`]);
  return jc ? jc.id : null;
}
const lockedMsg = (id) => `A job card (#${id}) was made from this quotation, so it can no longer be changed`;
const _setStatus = exports.setStatus;
exports.setStatus = async (req, res) => {
  const q = await loadQuote(req, res, req.params.id);
  if (!q) return;
  const jcId = await jobFromQuote(q);
  if (jcId) return res.status(409).json({ success: false, error: lockedMsg(jcId) });
  return _setStatus(req, res);
};
const _update = exports.update;
exports.update = async (req, res) => {
  const q0 = await loadQuote(req, res, req.params.id);
  if (!q0) return;
  const jcId = await jobFromQuote(q0);
  if (jcId) return res.status(409).json({ success: false, error: lockedMsg(jcId) });
  const vErr = validateQuote(req.body) || await checkDiscount(req.body, fidOf(req));
  if (vErr) return res.status(400).json({ success: false, error: vErr });
  const T = computeTotals(req.body.items, req.body);
  Object.assign(req.body, { subtotal: T.subtotal, discount_type: T.discount_type, discount_value: T.discount_value,
    discount_amount: T.discount_amount, tax_percentage: T.tax_percentage, tax_amount: T.tax_amount, grand_total: T.grand_total });
  return _update(req, res);
};
const _softDelete = exports.softDelete;
exports.softDelete = async (req, res) => {
  const q = await loadQuote(req, res, req.params.id);
  if (!q) return;
  const jcId = await jobFromQuote(q);
  if (jcId) return res.status(409).json({ success: false, error: lockedMsg(jcId) });
  return _softDelete(req, res);
};
const _pdf = exports.downloadPDF;
exports.downloadPDF = async (req, res) => { if (await loadQuote(req, res, req.params.id)) return _pdf(req, res); };
