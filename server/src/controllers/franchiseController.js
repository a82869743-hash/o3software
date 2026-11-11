const pool = require('../config/db');

// Helper to determine if requesting user has Super Admin authority
const isUserSuperAdmin = (req) => {
  if (!req.user) return false;
  return req.user.role === 'super_admin';
};

// ─── LIST FRANCHISES ──────────────────────────────────────────
// Super Admin sees all (active + inactive). Others see active only.
exports.list = async (req, res) => {
  try {
    const isSuper = isUserSuperAdmin(req);
    const sql = isSuper
      ? 'SELECT * FROM franchises ORDER BY id ASC'
      : 'SELECT id, name, code, address, phone, email, city, state, opening_time, closing_time, is_active FROM franchises WHERE id = ?';

    const [rows] = await pool.query(sql, isSuper ? [] : [req.user.franchise_id || 1]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List franchises error:', err.message);
    res.status(500).json({
      success: false,
      error: 'Failed to retrieve franchises',
      data: [{ id: 1, name: 'Main Studio (O3 Car Spaa)', code: 'MAIN', is_active: 1 }]
    });
  }
};

// ─── GET ONE FRANCHISE ────────────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    }

    const isSuper = isUserSuperAdmin(req);
    // Non-super admins can only view their own franchise details unless viewing basic active info
    if (!isSuper && req.user && req.user.role !== 'customer') {
      const userFid = req.user.franchise_id ? parseInt(req.user.franchise_id, 10) : 1;
      if (userFid !== id) {
        return res.status(403).json({ success: false, error: 'Access denied: Cannot access other franchise profile' });
      }
    }

    const [rows] = await pool.query('SELECT * FROM franchises WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Franchise not found' });
    }

    const franchise = rows[0];

    // Get live branch stats
    const [[jcStats]] = await pool.query(
      'SELECT COUNT(*) as total_job_cards, SUM(status = "complete") as completed_job_cards FROM job_carts WHERE franchise_id = ?',
      [id]
    );
    const [[bkStats]] = await pool.query(
      'SELECT COUNT(*) as total_bookings FROM bookings WHERE franchise_id = ?',
      [id]
    );
    const [[staffStats]] = await pool.query(
      'SELECT COUNT(*) as staff_count FROM users WHERE franchise_id = ? AND role IN ("admin", "manager", "staff")',
      [id]
    );

    res.json({
      success: true,
      data: {
        ...franchise,
        stats: {
          total_job_cards: jcStats?.total_job_cards || 0,
          completed_job_cards: jcStats?.completed_job_cards || 0,
          total_bookings: bkStats?.total_bookings || 0,
          staff_count: staffStats?.staff_count || 0
        }
      }
    });
  } catch (err) {
    console.error('Get franchise error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE FRANCHISE (Super Admin Only) ──────────────────────
exports.create = async (req, res) => {
  try {
    const {
      name, code, address, phone, email, gstin, city, state,
      upi_id, upi_name, qr_image_url, logo_url,
      slot_duration_minutes = 60, opening_time = '09:00:00', closing_time = '20:00:00'
    } = req.body;

    if (!name || !name.trim() || !code || !code.trim()) {
      return res.status(400).json({ success: false, error: 'Franchise name and unique code are required' });
    }

    const cleanCode = code.toUpperCase().trim().replace(/[^A-Z0-9_]/g, '_');

    // Check code uniqueness
    const [existing] = await pool.query('SELECT id FROM franchises WHERE code = ?', [cleanCode]);
    if (existing.length) {
      return res.status(400).json({ success: false, error: `Franchise code "${cleanCode}" already exists` });
    }

    const [result] = await pool.query(
      `INSERT INTO franchises 
       (name, code, address, phone, email, gstin, city, state, upi_id, upi_name, qr_image_url, logo_url, slot_duration_minutes, opening_time, closing_time, is_active, plan_tier)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1, ?)`,
      [
        name.trim(),
        cleanCode,
        address || null,
        phone || null,
        email || null,
        gstin || null,
        city || null,
        state || null,
        upi_id || null,
        upi_name || null,
        qr_image_url || null,
        logo_url || null,
        parseInt(slot_duration_minutes, 10) || 60,
        opening_time || '09:00:00',
        closing_time || '20:00:00',
        // starting plan decides which modules the studio gets; Super Admin can fine-tune them later
        ['basic', 'pro', 'enterprise'].includes(String(req.body.plan_tier || '').toLowerCase()) ? String(req.body.plan_tier).toLowerCase() : 'enterprise'
      ]
    );

    const newId = result.insertId;

    // Seed default settings for the new franchise from franchise 1
    try {
      const [f1Settings] = await pool.query('SELECT key_name, value FROM settings WHERE franchise_id = 1');
      if (f1Settings.length) {
        for (const s of f1Settings) {
          await pool.query(
            'INSERT IGNORE INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?)',
            [newId, s.key_name, s.value]
          );
        }
      }
    } catch (e) {
      console.warn('Notice: Settings seed for new franchise:', e.message);
    }

    const [created] = await pool.query('SELECT * FROM franchises WHERE id = ?', [newId]);

    // New franchise gets its module access (Super Admin can change it under Franchises → Module access)
    try { await require('../config/featureCatalog').syncFeatureCatalogToDb(pool); } catch (e) { console.warn('entitlement seed:', e.message); }

    res.status(201).json({
      success: true,
      data: created[0],
      message: `Franchise "${name}" created successfully`
    });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(400).json({ success: false, error: 'Franchise code already exists' });
    }
    console.error('Create franchise error:', err);
    res.status(500).json({ success: false, error: 'Failed to create franchise' });
  }
};

// ─── UPDATE FRANCHISE (Super Admin or Branch Admin) ───────────
exports.update = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    }

    const isSuper = isUserSuperAdmin(req);
    // Non-super admin can only update their own assigned franchise
    if (!isSuper) {
      const userFid = req.user.franchise_id ? parseInt(req.user.franchise_id, 10) : 1;
      if (userFid !== id) {
        return res.status(403).json({ success: false, error: 'Access denied: Cannot edit other franchise' });
      }
    }

    const {
      name, address, phone, email, gstin, city, state,
      upi_id, upi_name, qr_image_url, logo_url,
      slot_duration_minutes, opening_time, closing_time
    } = req.body;

    const [existing] = await pool.query('SELECT * FROM franchises WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Franchise not found' });
    }

    await pool.query(
      `UPDATE franchises SET
        name = COALESCE(?, name),
        address = COALESCE(?, address),
        phone = COALESCE(?, phone),
        email = COALESCE(?, email),
        gstin = COALESCE(?, gstin),
        city = COALESCE(?, city),
        state = COALESCE(?, state),
        upi_id = COALESCE(?, upi_id),
        upi_name = COALESCE(?, upi_name),
        qr_image_url = COALESCE(?, qr_image_url),
        logo_url = COALESCE(?, logo_url),
        slot_duration_minutes = COALESCE(?, slot_duration_minutes),
        opening_time = COALESCE(?, opening_time),
        closing_time = COALESCE(?, closing_time)
       WHERE id = ?`,
      [
        name ? name.trim() : null,
        address ?? null,
        phone ?? null,
        email ?? null,
        gstin ?? null,
        city ?? null,
        state ?? null,
        upi_id ?? null,
        upi_name ?? null,
        qr_image_url ?? null,
        logo_url ?? null,
        slot_duration_minutes ? parseInt(slot_duration_minutes, 10) : null,
        opening_time ?? null,
        closing_time ?? null,
        id
      ]
    );

    const [updated] = await pool.query('SELECT * FROM franchises WHERE id = ?', [id]);

    res.json({
      success: true,
      data: updated[0],
      message: 'Franchise details updated successfully'
    });
  } catch (err) {
    console.error('Update franchise error:', err);
    res.status(500).json({ success: false, error: 'Failed to update franchise' });
  }
};

// ─── TOGGLE / DISABLE FRANCHISE (Super Admin Only) ────────────
exports.toggleStatus = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    }

    if (id === 1) {
      return res.status(400).json({
        success: false,
        error: 'Cannot disable Main Studio (Default Franchise).'
      });
    }

    const [rows] = await pool.query('SELECT id, is_active, name FROM franchises WHERE id = ?', [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Franchise not found' });
    }

    const currentStatus = rows[0].is_active;
    const newStatus = currentStatus === 1 ? 0 : 1;

    await pool.query('UPDATE franchises SET is_active = ? WHERE id = ?', [newStatus, id]);

    res.json({
      success: true,
      data: { id, is_active: newStatus },
      message: `Franchise "${rows[0].name}" ${newStatus === 1 ? 'enabled' : 'disabled'} successfully`
    });
  } catch (err) {
    console.error('Toggle franchise status error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CONSOLIDATED CROSS-FRANCHISE OVERVIEW (Super Admin Only) ─
exports.consolidatedOverview = async (req, res) => {
  try {
    // 1. Fetch all franchises
    const [franchises] = await pool.query('SELECT * FROM franchises ORDER BY id ASC');

    // 2. Fetch metrics per franchise
    const metrics = [];
    let grandRevenue = 0;
    let grandJobs = 0;
    let grandBookings = 0;
    let grandCustomers = 0;
    let grandInventoryCount = 0;
    let grandStockValue = 0;

    for (const f of franchises) {
      const fid = f.id;

      // Revenue from manual bills
      const [[billRev]] = await pool.query(
        "SELECT COALESCE(SUM(grand_total), 0) as total FROM manual_bills WHERE franchise_id = ? AND status != 'voided'",
        [fid]
      );
      // Revenue from job revenue transactions
      const [[transRev]] = await pool.query(
        "SELECT COALESCE(SUM(t.amount), 0) as total FROM transactions t JOIN job_carts jc ON t.reference_id = jc.id WHERE jc.franchise_id = ? AND t.type = 'job_revenue' AND t.direction = 'in'",
        [fid]
      );
      const totalRev = parseFloat(billRev?.total || 0) + parseFloat(transRev?.total || 0);

      // Job card counts
      const [[jcCounts]] = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(status = 'complete') as completed,
                SUM(status = 'open') as in_progress,
                SUM(status = 'draft') as pending
         FROM job_carts WHERE franchise_id = ?`,
        [fid]
      );

      // Booking counts
      const [[bkCounts]] = await pool.query(
        `SELECT COUNT(*) as total,
                SUM(status = 'confirmed') as confirmed,
                SUM(status = 'pending_approval') as pending,
                SUM(status = 'completed') as completed
         FROM bookings WHERE franchise_id = ?`,
        [fid]
      );

      // Customer count (registered under franchise)
      const [[custCount]] = await pool.query(
        "SELECT COUNT(*) as total FROM users WHERE franchise_id = ? AND role = 'customer'",
        [fid]
      );

      // Inventory valuation
      const [[invData]] = await pool.query(
        `SELECT COUNT(*) as count,
                COALESCE(SUM(quantity * COALESCE(cost_price, 0)), 0) as total_value
         FROM inventory WHERE (franchise_id = ? OR franchise_id IS NULL) AND is_deleted = 0`,
        [fid]
      );

      // Staff count
      const [[staffCount]] = await pool.query(
        "SELECT COUNT(*) as total FROM users WHERE franchise_id = ? AND role IN ('admin', 'manager', 'staff')",
        [fid]
      );

      const fMetrics = {
        franchise_id: fid,
        name: f.name,
        code: f.code,
        city: f.city || '',
        is_active: f.is_active,
        revenue: totalRev,
        job_cards: {
          total: jcCounts?.total || 0,
          completed: jcCounts?.completed || 0,
          in_progress: jcCounts?.in_progress || 0,
          pending: jcCounts?.pending || 0
        },
        bookings: {
          total: bkCounts?.total || 0,
          confirmed: bkCounts?.confirmed || 0,
          pending: bkCounts?.pending || 0,
          completed: bkCounts?.completed || 0
        },
        customers: custCount?.total || 0,
        staff: staffCount?.total || 0,
        inventory: {
          count: invData?.count || 0,
          valuation: parseFloat(invData?.total_value || 0)
        }
      };

      metrics.push(fMetrics);
      grandRevenue += totalRev;
      grandJobs += (jcCounts?.total || 0);
      grandBookings += (bkCounts?.total || 0);
      grandCustomers += (custCount?.total || 0);
      grandInventoryCount += (invData?.count || 0);
      grandStockValue += parseFloat(invData?.total_value || 0);
    }

    res.json({
      success: true,
      data: {
        summary: {
          total_franchises: franchises.length,
          active_franchises: franchises.filter(f => f.is_active === 1).length,
          grand_revenue: grandRevenue,
          grand_jobs: grandJobs,
          grand_bookings: grandBookings,
          grand_customers: grandCustomers,
          grand_inventory_items: grandInventoryCount,
          grand_stock_valuation: grandStockValue
        },
        franchises: metrics
      }
    });
  } catch (err) {
    console.error('Consolidated overview error:', err);
    res.status(500).json({ success: false, error: 'Failed to aggregate cross-franchise data' });
  }
};

// ─── GET PER-FRANCHISE SETTINGS ───────────────────────────────
exports.getSettings = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    }

    const [fRows] = await pool.query('SELECT * FROM franchises WHERE id = ?', [id]);
    if (!fRows.length) {
      return res.status(404).json({ success: false, error: 'Franchise not found' });
    }

    const [settingsRows] = await pool.query(
      'SELECT key_name, value FROM settings WHERE franchise_id = ?',
      [id]
    );

    const kvSettings = {};
    settingsRows.forEach(s => {
      kvSettings[s.key_name] = s.value;
    });

    res.json({
      success: true,
      data: {
        franchise: fRows[0],
        settings: kvSettings
      }
    });
  } catch (err) {
    console.error('Get franchise settings error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE PER-FRANCHISE SETTINGS ───────────────────────────
exports.updateSettings = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) {
      return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    }
    const [[exists]] = await pool.query('SELECT id FROM franchises WHERE id = ?', [id]);
    if (!exists) return res.status(404).json({ success: false, error: 'Franchise not found' });

    const { franchise, settings } = req.body;

    // 1. Update franchise table if fields provided
    if (franchise) {
      await pool.query(
        `UPDATE franchises SET
          name = COALESCE(?, name),
          address = COALESCE(?, address),
          phone = COALESCE(?, phone),
          email = COALESCE(?, email),
          gstin = COALESCE(?, gstin),
          city = COALESCE(?, city),
          state = COALESCE(?, state),
          upi_id = COALESCE(?, upi_id),
          upi_name = COALESCE(?, upi_name),
          qr_image_url = COALESCE(?, qr_image_url),
          logo_url = COALESCE(?, logo_url),
          slot_duration_minutes = COALESCE(?, slot_duration_minutes),
          opening_time = COALESCE(?, opening_time),
          closing_time = COALESCE(?, closing_time)
         WHERE id = ?`,
        [
          franchise.name ? franchise.name.trim() : null,
          franchise.address ?? null,
          franchise.phone ?? null,
          franchise.email ?? null,
          franchise.gstin ?? null,
          franchise.city ?? null,
          franchise.state ?? null,
          franchise.upi_id ?? null,
          franchise.upi_name ?? null,
          franchise.qr_image_url ?? null,
          franchise.logo_url ?? null,
          franchise.slot_duration_minutes ? parseInt(franchise.slot_duration_minutes, 10) : null,
          franchise.opening_time ?? null,
          franchise.closing_time ?? null,
          id
        ]
      );
    }

    // 2. Update settings key-value pairs if provided
    if (settings && typeof settings === 'object') {
      for (const [key, val] of Object.entries(settings)) {
        await pool.query(
          `INSERT INTO settings (franchise_id, key_name, value)
           VALUES (?, ?, ?)
           ON DUPLICATE KEY UPDATE value = VALUES(value)`,
          [id, key, String(val)]
        );
      }
    }

    res.json({
      success: true,
      message: `Settings for franchise #${id} updated successfully`
    });
  } catch (err) {
    console.error('Update franchise settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
};

// ─── SOFT DELETE FRANCHISE (Super Admin Only) ──────────────────
exports.softDelete = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid franchise ID' });
    if (id === 1) return res.status(400).json({ success: false, error: 'Cannot delete Main Studio (Default Franchise).' });

    const [rows] = await pool.query('SELECT name FROM franchises WHERE id = ?', [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Franchise not found' });

    await pool.query('UPDATE franchises SET is_deleted = 1, is_active = 0, deleted_at = NOW() WHERE id = ?', [id]);

    // Audit log
    try {
      const { logAudit } = require('./auditController');
      await logAudit(req.user?.id, 'FRANCHISE_SOFT_DELETED', 'franchise', id, { name: rows[0].name }, req.ip);
    } catch {}

    res.json({ success: true, message: `Franchise "${rows[0].name}" soft-deleted successfully` });
  } catch (err) {
    console.error('Soft delete franchise error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET PER-FRANCHISE FEATURE ENTITLEMENTS ───────────────────
exports.getEntitlements = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid franchise ID' });

    const [fRows] = await pool.query('SELECT id, name, code, plan_tier FROM franchises WHERE id = ? AND is_deleted = 0', [id]);
    if (!fRows.length) return res.status(404).json({ success: false, error: 'Franchise not found' });

    const { getAllFeatures } = require('../config/featureCatalog');
    const catalog = getAllFeatures();

    const [entRows] = await pool.query(
      'SELECT feature_key, actions_json, is_enabled FROM franchise_entitlements WHERE franchise_id = ?',
      [id]
    );

    const entMap = {};
    for (const r of entRows) {
      let actions = [];
      try {
        actions = typeof r.actions_json === 'string' ? JSON.parse(r.actions_json) : r.actions_json;
      } catch { actions = []; }
      entMap[r.feature_key] = {
        is_enabled: r.is_enabled === 1,
        actions: Array.isArray(actions) ? actions : []
      };
    }

    res.json({
      success: true,
      data: {
        franchise: fRows[0],
        plan_tier: fRows[0].plan_tier || 'pro',
        catalog,
        entitlements: entMap
      }
    });
  } catch (err) {
    console.error('Get entitlements error:', err);
    res.status(500).json({ success: false, error: 'Failed to retrieve entitlements' });
  }
};

// ─── UPDATE PER-FRANCHISE FEATURE ENTITLEMENTS ────────────────
exports.updateEntitlements = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid franchise ID' });

    const { entitlements, plan_tier } = req.body;
    if (!entitlements || typeof entitlements !== 'object') {
      return res.status(400).json({ success: false, error: 'Entitlements map is required' });
    }

    if (plan_tier) {
      await pool.query('UPDATE franchises SET plan_tier = ? WHERE id = ?', [plan_tier, id]);
    }

    for (const [featKey, ent] of Object.entries(entitlements)) {
      const isEnabled = ent.is_enabled ? 1 : 0;
      const actionsJson = JSON.stringify(Array.isArray(ent.actions) ? ent.actions : []);
      await pool.query(
        `INSERT INTO franchise_entitlements (franchise_id, feature_key, actions_json, is_enabled)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE actions_json = VALUES(actions_json), is_enabled = VALUES(is_enabled)`,
        [id, featKey, actionsJson, isEnabled]
      );
    }

    // Flush cache so changes take effect immediately
    const { clearEntitlementCache } = require('../middleware/permissions');
    clearEntitlementCache(id);

    // Audit log
    try {
      const { logAudit } = require('./auditController');
      await logAudit(req.user?.id, 'ENTITLEMENTS_UPDATED', 'franchise', id, { plan_tier }, req.ip);
    } catch {}

    res.json({
      success: true,
      message: `Entitlements for franchise #${id} updated successfully. Changes applied immediately.`
    });
  } catch (err) {
    console.error('Update entitlements error:', err);
    res.status(500).json({ success: false, error: 'Failed to update entitlements' });
  }
};

// ─── APPLY PRESET ENTITLEMENT TIER ────────────────────────────
exports.applyPreset = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { preset } = req.body; // 'basic', 'pro', 'enterprise'
    if (!preset || !['basic', 'pro', 'enterprise'].includes(preset.toLowerCase())) {
      return res.status(400).json({ success: false, error: 'Valid preset tier required: basic, pro, or enterprise' });
    }

    const { getPresetEntitlements } = require('../config/featureCatalog');
    const presetMap = getPresetEntitlements(preset);

    await pool.query('UPDATE franchises SET plan_tier = ? WHERE id = ?', [preset.toLowerCase(), id]);

    for (const [featKey, ent] of Object.entries(presetMap)) {
      await pool.query(
        `INSERT INTO franchise_entitlements (franchise_id, feature_key, actions_json, is_enabled)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE actions_json = VALUES(actions_json), is_enabled = VALUES(is_enabled)`,
        [id, featKey, JSON.stringify(ent.actions), ent.is_enabled ? 1 : 0]
      );
    }

    const { clearEntitlementCache } = require('../middleware/permissions');
    clearEntitlementCache(id);

    res.json({
      success: true,
      message: `Applied ${preset.toUpperCase()} entitlement plan to franchise #${id} successfully.`
    });
  } catch (err) {
    console.error('Apply preset error:', err);
    res.status(500).json({ success: false, error: 'Failed to apply preset' });
  }
};

// ─── CREATE FRANCHISE OWNER ACCOUNT ───────────────────────────
exports.createOwnerAccount = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    const { name, mobile, email, password } = req.body;

    if (!name || !mobile || !password) {
      return res.status(400).json({ success: false, error: 'Name, mobile, and initial password are required' });
    }
    const { isValidMobile, isValidEmail } = require('../utils/validators');
    if (!isValidMobile(mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });
    if (email && !isValidEmail(email)) return res.status(400).json({ success: false, error: 'Email is invalid' });
    if (String(password).length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters with letters and numbers' });
    }
    const [[fr]] = await pool.query('SELECT id FROM franchises WHERE id = ? AND is_deleted = 0', [id]);
    if (!fr) return res.status(404).json({ success: false, error: 'Franchise not found' });

    const cleanMobile = mobile.replace(/\D/g, '').slice(-10);

    const [existing] = await pool.query('SELECT id FROM users WHERE mobile = ?', [cleanMobile]);
    if (existing.length) {
      return res.status(400).json({ success: false, error: 'A user with this mobile number already exists' });
    }

    const bcrypt = require('bcryptjs');
    const password_hash = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users 
       (name, mobile, email, password_hash, role, franchise_id, is_active, must_change_password, token_version)
       VALUES (?, ?, ?, ?, 'admin', ?, 1, 0, 1)`,
      [name.trim(), cleanMobile, email ? email.trim() : null, password_hash, id]
    );

    res.status(201).json({
      success: true,
      data: {
        id: result.insertId,
        name: name.trim(),
        mobile: cleanMobile,
        role: 'admin',
        franchise_id: id,
        must_change_password: 0
      },
      message: `Studio admin account created for ${name}. Share the password with them safely.`
    });
  } catch (err) {
    console.error('Create owner account error:', err);
    res.status(500).json({ success: false, error: 'Failed to create franchise owner account' });
  }
};

// ─── IMPERSONATE FRANCHISE ("View as franchise") ──────────────
exports.impersonate = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (isNaN(id)) return res.status(400).json({ success: false, error: 'Invalid franchise ID' });

    const [fRows] = await pool.query('SELECT id, name, code FROM franchises WHERE id = ? AND is_deleted = 0', [id]);
    if (!fRows.length) return res.status(404).json({ success: false, error: 'Franchise not found or deleted' });

    // Find franchise admin or create temporary impersonation context
    const [owners] = await pool.query(
      'SELECT id, name, mobile, role, token_version FROM users WHERE franchise_id = ? AND role = "admin" AND is_active = 1 AND is_deleted = 0 LIMIT 1',
      [id]
    );

    if (!owners.length) {
      return res.status(400).json({ success: false, error: 'This studio has no active admin yet. Add the studio admin first, then open it.' });
    }
    const owner = owners[0];

    const jwt = require('jsonwebtoken');
    const impersonationToken = jwt.sign(
      {
        id: owner.id,
        role: 'admin',
        name: owner.name,
        mobile: owner.mobile,
        franchise_id: id,
        token_version: owner.token_version || 1,
        is_impersonating: true,
        impersonator_id: req.user.id,
        impersonator_name: req.user.name,
        franchise_name: fRows[0].name
      },
      process.env.JWT_SECRET,
      { expiresIn: '2h' }
    );

    // Audit log
    try {
      const { logAudit } = require('./auditController');
      await logAudit(req.user.id, 'IMPERSONATE_FRANCHISE', 'franchise', id, { franchise_name: fRows[0].name }, req.ip);
    } catch {}

    res.json({
      success: true,
      data: {
        token: impersonationToken,
        franchise: fRows[0],
        impersonating_user: owner
      },
      message: `Impersonating franchise "${fRows[0].name}". Every action will be logged.`
    });
  } catch (err) {
    console.error('Impersonate error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate impersonation session' });
  }
};

// ─── FORCE LOGOUT USER (Invalidates tokens immediately) ───────
exports.forceLogoutUser = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    if (isNaN(userId)) return res.status(400).json({ success: false, error: 'Invalid user ID' });
    const [fl] = await pool.query('UPDATE users SET token_version = token_version + 1 WHERE id = ? AND is_deleted = 0', [userId]);
    if (!fl.affectedRows) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({ success: true, message: 'User forced to logout. All active sessions terminated immediately.' });
  } catch (err) {
    console.error('Force logout error:', err);
    res.status(500).json({ success: false, error: 'Failed to force logout' });
  }
};

// ─── RESET USER PASSWORD (Forces change on next login) ─────────
exports.resetUserPassword = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const { new_password } = req.body;
    if (!new_password || new_password.length < 8 || !/\d/.test(new_password) || !/[a-zA-Z]/.test(new_password)) {
      return res.status(400).json({ success: false, error: 'New password must be at least 8 characters with letters and numbers' });
    }

    const bcrypt = require('bcryptjs');
    const hash = await bcrypt.hash(new_password, 10);
    const [rp] = await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, failed_login_attempts = 0, locked_until = NULL WHERE id = ? AND is_deleted = 0',
      [hash, userId]
    );
    if (!rp.affectedRows) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({
      success: true,
      message: 'Password reset. The user is signed out everywhere and can sign in with the new password.'
    });
  } catch (err) {
    console.error('Reset user password error:', err);
    res.status(500).json({ success: false, error: 'Failed to reset password' });
  }
};

// ─── TOGGLE USER ACTIVE STATUS ────────────────────────────────
exports.toggleUserStatus = async (req, res) => {
  try {
    const userId = parseInt(req.params.userId, 10);
    const [rows] = await pool.query('SELECT is_active, name, role FROM users WHERE id = ? AND is_deleted = 0', [userId]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'User not found' });
    const newStatus = rows[0].is_active === 1 ? 0 : 1;
    if (newStatus === 0 && userId === Number(req.user.id)) {
      return res.status(400).json({ success: false, error: 'You cannot switch off your own account' });
    }
    if (newStatus === 0 && rows[0].role === 'super_admin') {
      const [[sa]] = await pool.query("SELECT COUNT(*) AS n FROM users WHERE role = 'super_admin' AND is_active = 1 AND is_deleted = 0 AND id <> ?", [userId]);
      if (!Number(sa.n)) return res.status(400).json({ success: false, error: 'This is the last Super Admin. Add another Super Admin first.' });
    }
    await pool.query(
      'UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ?',
      [newStatus, userId]
    );

    res.json({
      success: true,
      data: { is_active: newStatus },
      message: `Account for ${rows[0].name} ${newStatus === 1 ? 'activated' : 'disabled'} successfully.`
    });
  } catch (err) {
    console.error('Toggle user status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update user status' });
  }
};



// ─── USERS OF A FRANCHISE (Super Admin) ─────────
exports.listUsers = async (req, res) => {
  try {
    const id = parseInt(req.params.id, 10);
    if (!Number.isInteger(id)) return res.status(404).json({ success: false, error: 'Studio not found' });
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.role, u.is_active, u.must_change_password, u.created_at, u.locked_until,
              r.role_name AS custom_role_name,
              (SELECT MAX(created_at) FROM audit_logs a WHERE a.changed_by = u.id AND a.action LIKE 'LOGIN%') AS last_login
       FROM users u LEFT JOIN v2_roles r ON r.id = u.custom_role_id
       WHERE u.franchise_id = ? AND u.role IN ('admin','manager','staff') AND u.is_deleted = 0
       ORDER BY FIELD(u.role,'admin','manager','staff'), u.name`,
      [id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List franchise users error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** Active studios for the sign-up screen: only what a customer needs to choose one. */
exports.publicList = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT id, name, city, address, latitude, longitude FROM franchises
       WHERE is_active = 1 AND (is_deleted = 0 OR is_deleted IS NULL) ORDER BY id`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('franchise publicList error:', err);
    res.status(500).json({ success: false, error: 'Could not load studios' });
  }
};
