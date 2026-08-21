const pool = require('../config/db');

// ─── CREATE QUOTATION ────────────────────────
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

    if (!customer_name || !customer_mobile) {
      return res.status(400).json({ success: false, error: 'Customer name and mobile are required' });
    }

    if (!items || !Array.isArray(items) || items.length === 0) {
      return res.status(400).json({ success: false, error: 'At least one item is required' });
    }

    // Generate Quotation Number: QT-YYYY-XXXX
    const currentYear = new Date().getFullYear();
    const [countRows] = await conn.query(
      "SELECT COUNT(*) AS count FROM quotations WHERE YEAR(created_at) = ?",
      [currentYear]
    );
    const seq = (countRows[0].count + 1).toString().padStart(4, '0');
    const quotationNumber = `QT-${currentYear}-${seq}`;

    // Insert into quotations
    const [result] = await conn.query(
      `INSERT INTO quotations 
       (quotation_number, customer_name, customer_mobile, customer_email, vehicle_no, 
        car_brand, car_model, car_segment, subtotal, discount_type, discount_value, 
        discount_amount, tax_percentage, tax_amount, grand_total, valid_until, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        quotationNumber,
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
        req.user?.id || null
      ]
    );

    const quotationId = result.insertId;

    // Insert items
    for (const item of items) {
      await conn.query(
        `INSERT INTO quotation_items 
         (quotation_id, item_type, item_id, name, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          quotationId,
          item.item_type || 'custom',
          item.item_id || null,
          item.name,
          item.price || 0,
          item.quantity || 1,
          item.total || 0
        ]
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
       WHERE q.id = ?`,
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

    // Re-insert items
    for (const item of items) {
      await conn.query(
        `INSERT INTO quotation_items 
         (quotation_id, item_type, item_id, name, price, quantity, total)
         VALUES (?, ?, ?, ?, ?, ?, ?)`,
        [
          req.params.id,
          item.item_type || 'custom',
          item.item_id || null,
          item.name,
          item.price || 0,
          item.quantity || 1,
          item.total || 0
        ]
      );
    }

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
