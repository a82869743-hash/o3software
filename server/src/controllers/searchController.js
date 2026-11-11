/**
 * ═══════════════════════════════════════════════════════════
 * SEARCH CONTROLLER — Live Autocomplete APIs (Franchise Scoped)
 * ═══════════════════════════════════════════════════════════
 */

const pool = require('../config/db');

// ─── SEARCH CUSTOMERS ────────────────────────
exports.customers = async (req, res) => {
  try {
    const { q, limit = 20 } = req.query;
    const franchiseId = req.user?.franchise_id || 1;
    const search = q && q.trim().length > 0 ? `%${q.trim()}%` : '%';

    // 1. Fetch registered customers with primary vehicle details
    const [userRows] = await pool.query(`
      SELECT 
        u.id, 
        u.name, 
        u.mobile, 
        u.email,
        v.brand AS vehicle_brand,
        v.model AS vehicle_model,
        v.registration_no AS vehicle_reg_no,
        v.category AS vehicle_category
      FROM users u
      LEFT JOIN vehicles v ON (v.customer_id = u.id AND (v.is_primary = 1 OR v.id = (SELECT MIN(id) FROM vehicles WHERE customer_id = u.id)))
      WHERE u.role = 'customer' AND u.is_active = 1
        AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
        AND (u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ?
             OR EXISTS (SELECT 1 FROM vehicles vx WHERE vx.customer_id = u.id AND REPLACE(vx.registration_no, ' ', '') LIKE ?))
      ORDER BY u.name ASC
      LIMIT ?
    `, [franchiseId, franchiseId, search, search, search, `%${String(q || '').replace(/\s+/g, '').toUpperCase()}%`, parseInt(limit)]);

    // 2. Fetch customers from manual_bills
    const [billRows] = await pool.query(`
      SELECT DISTINCT 
        customer_name AS name, 
        customer_mobile AS mobile,
        vehicle_brand,
        vehicle_model,
        vehicle_reg_no,
        NULL AS vehicle_category
      FROM manual_bills
      WHERE customer_name IS NOT NULL AND customer_name != ''
        AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
        AND (customer_name LIKE ? OR customer_mobile LIKE ? OR vehicle_reg_no LIKE ?)
      ORDER BY customer_name ASC
      LIMIT ?
    `, [franchiseId, franchiseId, search, search, search, parseInt(limit)]);

    // 3. Deduplicate by mobile & name
    const resultMap = new Map();
    (userRows || []).forEach(r => {
      const key = (r.mobile || r.name || '').trim().toLowerCase();
      if (key) resultMap.set(key, r);
    });

    (billRows || []).forEach(r => {
      const key = (r.mobile || r.name || '').trim().toLowerCase();
      if (key && !resultMap.has(key)) {
        resultMap.set(key, {
          id: null,
          name: r.name,
          mobile: r.mobile,
          vehicle_brand: r.vehicle_brand || '',
          vehicle_model: r.vehicle_model || '',
          vehicle_reg_no: r.vehicle_reg_no || '',
          vehicle_category: r.vehicle_category || ''
        });
      }
    });

    const data = Array.from(resultMap.values()).slice(0, parseInt(limit));
    res.json({ success: true, data });
  } catch (err) {
    console.error('Search customers error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── SEARCH VEHICLES ─────────────────────────
exports.vehicles = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const franchiseId = req.user?.franchise_id || 1;
    const search = `%${q}%`;
    const [rows] = await pool.query(`
      SELECT v.id, v.registration_no, v.brand, v.model,
             COALESCE(v.car_year, v.manufacture_year, v.registration_year) AS registration_year, v.customer_id,
             u.name AS customer_name, u.mobile AS customer_mobile
      FROM vehicles v
      JOIN users u ON v.customer_id = u.id
      WHERE (v.registration_no LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR u.name LIKE ? OR u.mobile LIKE ?)
        AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
      ORDER BY
        CASE WHEN v.registration_no LIKE ? THEN 0 ELSE 1 END,
        v.registration_no ASC
      LIMIT ?
    `, [search, search, search, search, search, franchiseId, franchiseId, `${q}%`, parseInt(limit)]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Search vehicles error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── SEARCH INVENTORY ────────────────────────
exports.inventory = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const franchiseId = req.user?.franchise_id || 1;
    const search = `%${q}%`;
    const [rows] = await pool.query(`
      SELECT id, product_name, unit, quantity, low_stock_threshold,
        ((low_stock_threshold > 0 AND quantity <= low_stock_threshold)) AS is_low_stock
      FROM inventory
      WHERE (is_deleted = 0 OR is_deleted IS NULL)
        AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
        AND (product_name LIKE ? OR unit LIKE ? OR sku LIKE ? OR barcode LIKE ? OR category LIKE ?)
      ORDER BY
        CASE WHEN product_name LIKE ? THEN 0 ELSE 1 END,
        product_name ASC
      LIMIT ?
    `, [franchiseId, franchiseId, search, search, search, search, search, `${q}%`, parseInt(limit)]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Search inventory error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── SEARCH VENDORS ──────────────────────────
exports.vendors = async (req, res) => {
  try {
    const { q, limit = 10 } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: [] });

    const franchiseId = req.user?.franchise_id || 1;
    const search = `%${q}%`;
    const [rows] = await pool.query(`
      SELECT id, name, phone, email, service_type, address
      FROM vendors
      WHERE is_active = 1
        AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
        AND (name LIKE ? OR phone LIKE ? OR email LIKE ? OR service_type LIKE ?)
      ORDER BY
        CASE WHEN name LIKE ? THEN 0 ELSE 1 END,
        name ASC
      LIMIT ?
    `, [franchiseId, franchiseId, search, search, search, search, `${q}%`, parseInt(limit)]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Search vendors error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ─── GLOBAL SEARCH (across all entities) ─────
exports.global = async (req, res) => {
  try {
    const { q, limit = 5 } = req.query;
    if (!q || q.length < 2) return res.json({ success: true, data: { customers: [], vehicles: [], inventory: [], vendors: [] } });

    const franchiseId = req.user?.franchise_id || 1;
    const search = `%${q}%`;
    const lim = parseInt(limit);

    const [customers] = await pool.query(
      `SELECT id, name, mobile FROM users WHERE role = 'customer' AND is_active = 1 AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))
         AND (name LIKE ? OR mobile LIKE ? OR id IN (SELECT customer_id FROM vehicles WHERE REPLACE(registration_no, ' ', '') LIKE ?)) LIMIT ?`,
      [franchiseId, franchiseId, search, search, `%${String(q || '').replace(/\s+/g, '').toUpperCase()}%`, lim]
    );
    const [vehicles] = await pool.query(
      `SELECT v.id, v.registration_no, v.brand, v.model, u.name AS customer_name FROM vehicles v JOIN users u ON v.customer_id = u.id WHERE (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1)) AND (v.registration_no LIKE ? OR v.brand LIKE ?) LIMIT ?`,
      [franchiseId, franchiseId, search, search, lim]
    );
    const [inventory] = await pool.query(
      `SELECT id, product_name, quantity FROM inventory WHERE (is_deleted = 0 OR is_deleted IS NULL) AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1)) AND product_name LIKE ? LIMIT ?`,
      [franchiseId, franchiseId, search, lim]
    );
    const [vendors] = await pool.query(
      `SELECT id, name, phone FROM vendors WHERE is_active = 1 AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1)) AND (name LIKE ? OR phone LIKE ?) LIMIT ?`,
      [franchiseId, franchiseId, search, search, lim]
    );

    res.json({ success: true, data: { customers, vehicles, inventory, vendors } });
  } catch (err) {
    console.error('Global search error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};
