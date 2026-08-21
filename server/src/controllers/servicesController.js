const pool = require('../config/db');

// ─── LIST ───────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { search, active_only, category_id } = req.query;
    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let where = '(s.franchise_id = ? OR (s.franchise_id IS NULL AND ? = 1))';
    const params = [franchiseId, franchiseId];
    if (search) { where += ' AND s.name LIKE ?'; params.push(`%${search}%`); }
    if (active_only === 'true') { where += ' AND s.is_active = 1'; }
    if (category_id) { where += ' AND s.category_id = ?'; params.push(category_id); }


    const [rows] = await pool.query(
      `SELECT s.*, sc.name AS category_name 
       FROM services s 
       LEFT JOIN service_categories sc ON s.category_id = sc.id 
       WHERE ${where} ORDER BY sc.sort_order ASC, s.name ASC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Services list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE ────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM services WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Service not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Service getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE ─────────────────────────────────
exports.create = async (req, res) => {
  try {
    const { name, description, features_json, whats_included_json, process_json, image_url, price_hatchback = 0, price_medium_hatchback = 0, price_sedan = 0, price_premium_sedan = 0, price_suv = 0, duration_minutes = 60, category_id, is_active = true } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Service name is required' });

    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;

    const [result] = await pool.query(
      'INSERT INTO services (name, description, features_json, whats_included_json, process_json, image_url, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, duration_minutes, category_id, is_active, franchise_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
      [
        name,
        description || null,
        typeof features_json === 'object' ? JSON.stringify(features_json) : (features_json || null),
        typeof whats_included_json === 'object' ? JSON.stringify(whats_included_json) : (whats_included_json || null),
        typeof process_json === 'object' ? JSON.stringify(process_json) : (process_json || null),
        image_url || null,
        price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, duration_minutes, category_id || null, is_active ? 1 : 0, franchiseId
      ]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Service created' });
  } catch (err) {
    console.error('Service create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE ─────────────────────────────────
exports.update = async (req, res) => {
  try {
    const { name, description, features_json, whats_included_json, process_json, image_url, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv, duration_minutes, category_id, is_active, is_premium, sort_order } = req.body;
    const [existing] = await pool.query('SELECT id FROM services WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Service not found' });

    const updates = []; const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (features_json !== undefined) { updates.push('features_json = ?'); params.push(typeof features_json === 'object' ? JSON.stringify(features_json) : features_json); }
    if (whats_included_json !== undefined) { updates.push('whats_included_json = ?'); params.push(typeof whats_included_json === 'object' ? JSON.stringify(whats_included_json) : whats_included_json); }
    if (process_json !== undefined) { updates.push('process_json = ?'); params.push(typeof process_json === 'object' ? JSON.stringify(process_json) : process_json); }
    if (image_url !== undefined) { updates.push('image_url = ?'); params.push(image_url); }
    if (price_hatchback !== undefined) { updates.push('price_hatchback = ?'); params.push(price_hatchback); }
    if (price_medium_hatchback !== undefined) { updates.push('price_medium_hatchback = ?'); params.push(price_medium_hatchback); }
    if (price_sedan !== undefined) { updates.push('price_sedan = ?'); params.push(price_sedan); }
    if (price_premium_sedan !== undefined) { updates.push('price_premium_sedan = ?'); params.push(price_premium_sedan); }
    if (price_suv !== undefined) { updates.push('price_suv = ?'); params.push(price_suv); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (category_id !== undefined) { updates.push('category_id = ?'); params.push(category_id || null); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }
    if (is_premium !== undefined) { updates.push('is_premium = ?'); params.push(is_premium ? 1 : 0); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.id);
    await pool.query(`UPDATE services SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Service updated' });
  } catch (err) {
    console.error('Service update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── TOGGLE ACTIVE ──────────────────────────
exports.toggleActive = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT is_active FROM services WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Service not found' });
    await pool.query('UPDATE services SET is_active = ? WHERE id = ?', [rows[0].is_active ? 0 : 1, req.params.id]);
    res.json({ success: true, message: rows[0].is_active ? 'Service deactivated' : 'Service activated' });
  } catch (err) {
    console.error('Service toggle error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE ─────────────────────────────────
exports.delete = async (req, res) => {
  try {
    const serviceId = req.params.id;
    const [existing] = await pool.query('SELECT id, name FROM services WHERE id = ?', [serviceId]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Service not found' });
    const serviceName = existing[0].name;

    // Safeguard 1: Check if used in any packages
    const [pkgServices] = await pool.query(
      'SELECT COUNT(*) AS count FROM package_services WHERE service_id = ?',
      [serviceId]
    );
    const pkgCount = pkgServices[0]?.count || 0;
    if (pkgCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete service "${serviceName}": It is configured in ${pkgCount} package(s). Please remove it from those packages first or deactivate the service instead.`
      });
    }

    // Safeguard 2: Check if referenced by any bookings or quick washes
    const [bookingRefs] = await pool.query(
      'SELECT COUNT(*) AS count FROM bookings WHERE service_id = ?',
      [serviceId]
    );
    const bookingCount = bookingRefs[0]?.count || 0;
    if (bookingCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete service "${serviceName}": ${bookingCount} historical booking(s)/quick-wash(es) reference this service. Deactivate the service to hide it from new bookings while preserving invoice accuracy.`
      });
    }

    // Safe to delete if not used in packages or bookings
    await pool.query('DELETE FROM services WHERE id = ?', [serviceId]);
    res.json({ success: true, message: 'Service deleted successfully' });
  } catch (err) {
    console.error('Service delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════
// SERVICE CATEGORIES — Dynamic CRUD
// ═══════════════════════════════════════════════════════════

// ─── LIST CATEGORIES ────────────────────────
exports.listCategories = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM service_categories ORDER BY sort_order ASC, name ASC'
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List categories error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE CATEGORY ────────────────────────
exports.createCategory = async (req, res) => {
  try {
    const { name, description, sort_order = 0 } = req.body;
    if (!name) return res.status(400).json({ success: false, error: 'Category name is required' });

    const [result] = await pool.query(
      'INSERT INTO service_categories (name, description, sort_order) VALUES (?, ?, ?)',
      [name.trim(), description || null, sort_order]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Category created' });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Category already exists' });
    console.error('Create category error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE CATEGORY ────────────────────────
exports.updateCategory = async (req, res) => {
  try {
    const { name, description, sort_order, is_active } = req.body;
    const [existing] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Category not found' });

    const updates = []; const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (sort_order !== undefined) { updates.push('sort_order = ?'); params.push(sort_order); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.id);
    await pool.query(`UPDATE service_categories SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Category updated' });
  } catch (err) {
    console.error('Update category error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE CATEGORY ────────────────────────
exports.deleteCategory = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM service_categories WHERE id = ?', [req.params.id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Category not found' });
    // Nullify FK references first
    await pool.query('UPDATE services SET category_id = NULL WHERE category_id = ?', [req.params.id]);
    await pool.query('DELETE FROM service_categories WHERE id = ?', [req.params.id]);
    res.json({ success: true, message: 'Category deleted' });
  } catch (err) {
    console.error('Delete category error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════
// SERVICE ADD-ONS — CRUD for premium service add-ons
// ═══════════════════════════════════════════════════════════

// ─── LIST ADD-ONS FOR A SERVICE ─────────────
exports.listAddons = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM service_addons WHERE service_id = ? ORDER BY addon_name ASC',
      [req.params.serviceId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List addons error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE ADD-ON ──────────────────────────
exports.createAddon = async (req, res) => {
  try {
    const { addon_name, addon_price = 0, duration_minutes = 30, is_active = true } = req.body;
    if (!addon_name) return res.status(400).json({ success: false, error: 'Add-on name is required' });

    const [result] = await pool.query(
      'INSERT INTO service_addons (service_id, addon_name, addon_price, duration_minutes, is_active) VALUES (?, ?, ?, ?, ?)',
      [req.params.serviceId, addon_name.trim(), addon_price, duration_minutes, is_active ? 1 : 0]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Add-on created' });
  } catch (err) {
    console.error('Create addon error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE ADD-ON ──────────────────────────
exports.updateAddon = async (req, res) => {
  try {
    const { addon_name, addon_price, duration_minutes, is_active } = req.body;
    const [existing] = await pool.query('SELECT id FROM service_addons WHERE id = ?', [req.params.addonId]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Add-on not found' });

    const updates = []; const params = [];
    if (addon_name !== undefined) { updates.push('addon_name = ?'); params.push(addon_name.trim()); }
    if (addon_price !== undefined) { updates.push('addon_price = ?'); params.push(addon_price); }
    if (duration_minutes !== undefined) { updates.push('duration_minutes = ?'); params.push(duration_minutes); }
    if (is_active !== undefined) { updates.push('is_active = ?'); params.push(is_active ? 1 : 0); }

    if (!updates.length) return res.status(400).json({ success: false, error: 'No fields to update' });
    params.push(req.params.addonId);
    await pool.query(`UPDATE service_addons SET ${updates.join(', ')} WHERE id = ?`, params);
    res.json({ success: true, message: 'Add-on updated' });
  } catch (err) {
    console.error('Update addon error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE ADD-ON ──────────────────────────
exports.deleteAddon = async (req, res) => {
  try {
    const [existing] = await pool.query('SELECT id FROM service_addons WHERE id = ?', [req.params.addonId]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Add-on not found' });
    await pool.query('DELETE FROM service_addons WHERE id = ?', [req.params.addonId]);
    res.json({ success: true, message: 'Add-on deleted' });
  } catch (err) {
    console.error('Delete addon error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
