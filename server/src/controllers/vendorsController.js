const pool = require('../config/db');

// ─── LIST VENDORS ───────────────────────────
exports.list = async (req, res) => {
  try {
    const { search, active_only } = req.query;
    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let where = '(franchise_id = ? OR (franchise_id IS NULL AND ? = 1))';
    const params = [franchiseId, franchiseId];

    if (search) {
      where += ' AND (name LIKE ? OR phone LIKE ? OR service_type LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s);
    }

    if (active_only === 'true') {
      where += ' AND is_active = 1';
    }

    const [vendors] = await pool.query(
      `SELECT * FROM vendors WHERE ${where} ORDER BY name ASC`,
      params
    );

    // Safely enrich vendors with products bought/sold without breaking vendor listing
    for (let v of vendors) {
      v.buy_sell_history = [];
      v.purchase_history = [];

      // 1. Fetch Buy & Sell transactions safely
      try {
        const [bsItems] = await pool.query(
          `SELECT id, type, product_name, quantity, unit_price, total_amount, transaction_date, status
           FROM buy_sell
           WHERE vendor_id = ? 
              OR LOWER(TRIM(party_name)) = LOWER(TRIM(?))
              OR (? != '' AND party_mobile IS NOT NULL AND party_mobile = ?)
           ORDER BY transaction_date DESC, id DESC LIMIT 50`,
          [v.id, v.name || '', v.phone || '', v.phone || '']
        );
        v.buy_sell_history = bsItems || [];
      } catch (bsErr) {
        console.error(`Notice: Buy/Sell history query failed for vendor ${v.id}:`, bsErr.message);
      }

      // 2. Fetch v2_purchases items safely
      try {
        const [purItems] = await pool.query(
          `SELECT p.id as purchase_id, p.invoice_number, p.purchase_date, p.total_amount as bill_total,
                  pi.quantity, pi.unit_price, pi.total_price as line_total, inv.product_name
           FROM v2_purchases p
           JOIN v2_purchase_items pi ON p.id = pi.purchase_id
           LEFT JOIN inventory inv ON pi.item_id = inv.id
           WHERE p.vendor_id = ?
           ORDER BY p.purchase_date DESC LIMIT 50`,
          [v.id]
        );
        v.purchase_history = purItems || [];
      } catch (purErr) {
        console.error(`Notice: Purchase history query failed for vendor ${v.id}:`, purErr.message);
      }
    }

    res.json({ success: true, data: vendors });
  } catch (err) {
    console.error('Vendor list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE VENDOR ─────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM vendors WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Vendor not found' });
    const vendor = rows[0];

    vendor.buy_sell_history = [];
    vendor.purchase_history = [];

    try {
      const [bsItems] = await pool.query(
        `SELECT id, type, product_name, quantity, unit_price, total_amount, transaction_date, status
         FROM buy_sell
         WHERE vendor_id = ? 
            OR LOWER(TRIM(party_name)) = LOWER(TRIM(?))
            OR (? != '' AND party_mobile IS NOT NULL AND party_mobile = ?)
         ORDER BY transaction_date DESC, id DESC`,
        [vendor.id, vendor.name || '', vendor.phone || '', vendor.phone || '']
      );
      vendor.buy_sell_history = bsItems || [];
    } catch (e) {}

    try {
      const [purItems] = await pool.query(
        `SELECT p.id as purchase_id, p.invoice_number, p.purchase_date, p.total_amount as bill_total,
                pi.quantity, pi.unit_price, pi.total_price as line_total, inv.product_name
         FROM v2_purchases p
         JOIN v2_purchase_items pi ON p.id = pi.purchase_id
         LEFT JOIN inventory inv ON pi.item_id = inv.id
         WHERE p.vendor_id = ?
         ORDER BY p.purchase_date DESC`,
        [vendor.id]
      );
      vendor.purchase_history = purItems || [];
    } catch (e) {}

    res.json({ success: true, data: vendor });
  } catch (err) {
    console.error('Vendor getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE VENDOR ──────────────────────────
exports.create = async (req, res) => {
  try {
    const { name, phone, email, service_type, address } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Vendor name is required' });

    const [result] = await pool.query(
      'INSERT INTO vendors (name, phone, email, service_type, address) VALUES (?, ?, ?, ?, ?)',
      [name.trim(), phone || null, email || null, service_type || null, address || null]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Vendor created' });
  } catch (err) {
    console.error('Vendor create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE VENDOR ──────────────────────────
exports.update = async (req, res) => {
  try {
    const { name, phone, email, service_type, address, is_active } = req.body;
    const [existing] = await pool.query('SELECT id FROM vendors WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Vendor not found' });

    const updates = []; const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (phone !== undefined) { updates.push('phone = ?'); params.push(phone); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (service_type !== undefined) { updates.push('service_type = ?'); params.push(service_type); }
    if (address !== undefined) { updates.push('address = ?'); params.push(address); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.id);
    await pool.query(`UPDATE vendors SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Vendor updated' });
  } catch (err) {
    console.error('Vendor update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE VENDOR ──────────────────────────
exports.delete = async (req, res) => {
  try {
    const vendorId = req.params.id;
    const [existing] = await pool.query('SELECT id, name FROM vendors WHERE id = ?', [vendorId]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Vendor not found' });
    const vendorName = existing[0].name;

    // Safeguard: Check if referenced by purchase bills or expenses
    let billCount = 0;
    try {
      const [bills] = await pool.query('SELECT COUNT(*) AS count FROM v2_purchases WHERE vendor_id = ?', [vendorId]);
      billCount += (bills[0]?.count || 0);
    } catch (chkErr) {}

    try {
      const [expenses] = await pool.query('SELECT COUNT(*) AS count FROM v2_expenses WHERE vendor_id = ?', [vendorId]);
      billCount += (expenses[0]?.count || 0);
    } catch (chkErr) {}

    if (billCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete vendor "${vendorName}": ${billCount} purchase record(s) or expense bill(s) reference this vendor. Deactivate the vendor instead to preserve financial history.`
      });
    }

    await pool.query('DELETE FROM vendors WHERE id = ?', [vendorId]);
    res.json({ success: true, message: 'Vendor deleted successfully' });
  } catch (err) {
    console.error('Vendor delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
