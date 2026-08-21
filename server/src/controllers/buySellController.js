const pool = require('../config/db');

// ─── LIST ───────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { type, status, page = 1, limit = 50, from_date, to_date } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (type) { where += ' AND bs.type = ?'; params.push(type); }
    if (status) { where += ' AND bs.status = ?'; params.push(status); }
    if (from_date) { where += ' AND bs.transaction_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND bs.transaction_date <= ?'; params.push(to_date); }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM buy_sell bs WHERE ${where}`, params
    );

    const [rows] = await pool.query(
      `SELECT bs.*, i.product_name AS inventory_product_name, v.name AS vendor_name
       FROM buy_sell bs
       LEFT JOIN inventory i ON bs.product_id = i.id
       LEFT JOIN vendors v ON bs.vendor_id = v.id
       WHERE ${where}
       ORDER BY bs.transaction_date DESC, bs.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('BuySell list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE ─────────────────────────────────
exports.create = async (req, res) => {
  try {
    const {
      type, vendor_id, party_name, party_mobile, product_id,
      product_name, quantity, unit_price, total_amount,
      note, transaction_date,
    } = req.body;

    if (!type || !party_name || !product_name || !quantity || !unit_price || !transaction_date) {
      return res.status(400).json({ success: false, error: 'Missing required fields' });
    }

    if (!['buy', 'sell_b2b', 'sell_b2c'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid type' });
    }

    const calculatedTotal = total_amount || (quantity * unit_price);

    const [result] = await pool.query(
      `INSERT INTO buy_sell (type, vendor_id, party_name, party_mobile, product_id, product_name,
        quantity, unit_price, total_amount, note, transaction_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [type, vendor_id || null, party_name, party_mobile || null, product_id || null,
       product_name, quantity, unit_price, calculatedTotal,
       note || null, transaction_date, req.user.id]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Record created' });
  } catch (err) {
    console.error('BuySell create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── COMPLETE ───────────────────────────────
exports.complete = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const [records] = await conn.query('SELECT * FROM buy_sell WHERE id = ? AND status = ?', [id, 'pending']);
    if (!records.length) return res.status(404).json({ success: false, error: 'Pending record not found' });

    const record = records[0];
    await conn.beginTransaction();

    // Update buy_sell status
    await conn.query('UPDATE buy_sell SET status = ? WHERE id = ?', ['complete', id]);

    // Update inventory
    if (record.product_id) {
      if (record.type === 'buy') {
        // Purchase: add to inventory
        await conn.query('UPDATE inventory SET quantity = quantity + ? WHERE id = ?',
          [parseFloat(record.quantity), record.product_id]);
      } else {
        // Sell: deduct from inventory
        await conn.query('UPDATE inventory SET quantity = quantity - ? WHERE id = ?',
          [parseFloat(record.quantity), record.product_id]);
      }
    }

    // Create transaction record
    let txnType, txnDirection;
    if (record.type === 'buy') {
      txnType = 'purchase'; txnDirection = 'out';
    } else if (record.type === 'sell_b2b') {
      txnType = 'sale_b2b'; txnDirection = 'in';
    } else {
      txnType = 'sale_b2c'; txnDirection = 'in';
    }

    await conn.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [txnType, parseInt(id), parseFloat(record.total_amount), txnDirection,
       `${record.type}: ${record.party_name} — ${record.product_name} (${record.quantity})`,
       record.transaction_date, req.user.id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Transaction completed' });
  } catch (err) {
    await conn.rollback();
    console.error('BuySell complete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── INVOICE ────────────────────────────────
exports.invoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { generateBuySellInvoicePDF } = require('../services/invoiceService');
    const pdfBuffer = await generateBuySellInvoicePDF(id);

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename=BuySell_Invoice_${id}.pdf`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Invoice generation error:', err);
    if (err.message === 'Record not found') {
      return res.status(404).json({ success: false, error: 'Record not found' });
    }
    res.status(500).json({ success: false, error: 'Failed to generate invoice' });
  }
};
