const pool = require('../config/db');

// Helper: fetch related services, products & pricing for a package
async function enrichPackage(pkg) {
  const [services] = await pool.query(
    `SELECT ps.id AS ps_id, ps.total_count, COALESCE(ps.complimentary, 0) AS complimentary, s.id, s.name, s.price_hatchback, s.price_semi_sedan, s.price_sedan, s.price_premium_sedan, s.price_suv, s.price_premium_suv
     FROM package_services ps JOIN services s ON ps.service_id = s.id
     WHERE ps.package_id = ?`, [pkg.id]
  );
  let products = [];
  try {
    [products] = await pool.query(
      `SELECT pp.id, pp.product_id, pp.quantity, i.product_name, i.unit
       FROM package_products pp JOIN inventory i ON pp.product_id = i.id
       WHERE pp.package_id = ?`, [pkg.id]
    );
  } catch (prodErr) {
    // package_products or inventory may not exist on some DB schemas
    console.warn('Failed to fetch package products (safe to ignore):', prodErr.message);
  }
  // Fetch v2 pricing matrix (car_type × pricing_type)
  let pricing = [];
  try {
    const [pricingRows] = await pool.query(
      `SELECT id, car_type, pricing_type, price FROM package_pricing WHERE package_id = ? ORDER BY car_type, pricing_type`, [pkg.id]
    );
    pricing = pricingRows;
  } catch { /* table may not exist yet */ }
  return { ...pkg, services, products, pricing };
}

// ─── LIST ───────────────────────────────────
// Role-based filtering: Admin sees all, Customer/public sees only active + visible
exports.list = async (req, res) => {
  try {
    const { published_only } = req.query;
    const userRole = req.user?.role || null;

    let where = 'is_custom = 0';

    // Customer or unauthenticated: only show active + visible + published packages
    if (!['admin', 'super_admin', 'manager', 'staff'].includes(userRole)) {
      where += ' AND is_active = 1 AND is_published = 1 AND visible_to_customer = 1';
    }

    if (published_only === 'true') where += ' AND is_published = 1';

    const [rows] = await pool.query(`SELECT * FROM packages WHERE ${where} ORDER BY sort_order ASC, created_at DESC`);
    const enriched = await Promise.all(rows.map(enrichPackage));
    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Packages list error:', err.message);
    res.json({ success: true, data: [] });
  }
};

// ─── GET ONE ────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM packages WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Package not found' });
    const enriched = await enrichPackage(rows[0]);
    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('Package getOne error:', err.message);
    res.status(404).json({ success: false, error: 'Package not found' });
  }
};

// ─── CREATE ─────────────────────────────────
// Supports both old format (service_ids) and new custom builder format (services with total_count)
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      name, description,
      price_hatchback = 0, price_semi_sedan = 0, price_sedan = 0, price_premium_sedan = 0, price_suv = 0, price_premium_suv = 0,
      wash_count = 0, wax_count = 0, is_published = false, package_validity = 12,
      visible_to_customer = true, is_custom = false,
      service_ids = [],       // Legacy format: array of service IDs (no count)
      services = [],          // New format: array of { service_id, total_count }
      products = []
    } = req.body;

    // ── Validation ──────────────────────────────────
    if (!name || !name.trim()) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Package name is required' });
    }

    // Check name uniqueness
    const [existing] = await conn.query('SELECT id FROM packages WHERE name = ?', [name.trim()]);
    if (existing.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'A package with this name already exists' });
    }

    // Validate services from custom builder
    if (services.length > 0) {
      for (const svc of services) {
        if (!svc.service_id) {
          await conn.rollback();
          return res.status(400).json({ success: false, error: 'Each service must have a service_id' });
        }
        if (!svc.total_count || svc.total_count <= 0) {
          await conn.rollback();
          return res.status(400).json({ success: false, error: 'Each service must have a count greater than 0' });
        }
      }
    }

    const priceVals = [price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv,
      ...(Array.isArray(req.body.pricing) ? req.body.pricing.map(p => p && p.price) : [])];
    if (priceVals.some(v => v !== undefined && v !== null && v !== '' && !(Number(v) >= 0))) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Prices must be 0 or more' });
    }
    if (!(Number(wash_count) >= 0) || !(Number(wax_count) >= 0)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Wash and wax counts must be 0 or more' });
    }

    // ── Insert package ──────────────────────────────
    const pkgFranchiseId = req.franchiseId || req.user?.franchise_id || 1;
    const [result] = await conn.query(
      `INSERT INTO packages (name, description, price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv, wash_count, wax_count, package_validity, is_published, visible_to_customer, is_custom, franchise_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [name.trim(), description || null, price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv, wash_count, wax_count, Math.max(1, Number(package_validity) || 12), is_published ? 1 : 0, visible_to_customer ? 1 : 0, is_custom ? 1 : 0, pkgFranchiseId]
    );
    const pkgId = result.insertId;

    // price per car type × basic/premium (same table the edit form saves to)
    if (Array.isArray(req.body.pricing)) {
      for (const p of req.body.pricing) {
        if (p && p.car_type && p.pricing_type && p.price !== undefined) {
          await conn.query(
            `INSERT INTO package_pricing (package_id, car_type, pricing_type, price) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [pkgId, p.car_type, p.pricing_type === 'premium' ? 'premium' : 'basic', Number(p.price) || 0]
          );
        }
      }
    }
    if (req.body.image_url) await conn.query('UPDATE packages SET image_url = ? WHERE id = ?', [String(req.body.image_url).slice(0, 500), pkgId]);
    else require('../services/imageGen').autoGenerateFor(pool, 'packages', pkgId, name, description);

    // ── Insert service links (new format with total_count) ──
    if (services.length > 0) {
      for (const svc of services) {
        await conn.query(
          'INSERT INTO package_services (package_id, service_id, total_count) VALUES (?, ?, ?)',
          [pkgId, svc.service_id, svc.total_count]
        );
      }
    }
    // ── Legacy format (just service IDs, total_count defaults to 1) ──
    else if (service_ids.length > 0) {
      for (const sid of service_ids) {
        await conn.query(
          'INSERT INTO package_services (package_id, service_id) VALUES (?, ?)',
          [pkgId, sid]
        );
      }
    }

    // ── Insert product links ────────────────────────
    for (const p of products) {
      await conn.query(
        'INSERT INTO package_products (package_id, product_id, quantity) VALUES (?, ?, ?)',
        [pkgId, p.product_id, p.quantity || 1]
      );
    }

    await conn.commit();
    res.status(201).json({ success: true, data: { id: pkgId }, message: 'Package created' });
  } catch (err) {
    await conn.rollback();
    console.error('Package create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally { conn.release(); }
};

// ─── UPDATE ─────────────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const {
      name, description, price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv,
      wash_count, wax_count, is_published, visible_to_customer, is_custom,
      service_ids, services, products
    } = req.body;
    const priceVals = [price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv, wash_count, wax_count,
      ...(Array.isArray(req.body.pricing) ? req.body.pricing.map(p => p && p.price) : []),
      ...(Array.isArray(services) ? services.map(s => s && s.total_count) : [])];
    if (priceVals.some(v => v !== undefined && v !== null && v !== '' && !(Number(v) >= 0))) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Prices and counts must be 0 or more' });
    }

    const [existing] = await conn.query('SELECT id FROM packages WHERE id = ?', [id]);
    if (!existing.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Package not found' }); }

    // Check name uniqueness (if changing name)
    if (name !== undefined) {
      const [dupe] = await conn.query('SELECT id FROM packages WHERE name = ? AND id != ?', [name.trim(), id]);
      if (dupe.length) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'A package with this name already exists' });
      }
    }

    const updates = []; const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name.trim()); }
    if (description !== undefined) { updates.push('description = ?'); params.push(description); }
    if (req.body.image_url !== undefined) { updates.push('image_url = ?'); params.push(req.body.image_url ? String(req.body.image_url).slice(0, 500) : null); }
    if (price_hatchback !== undefined) { updates.push('price_hatchback = ?'); params.push(price_hatchback); }
    if (price_semi_sedan !== undefined) { updates.push('price_semi_sedan = ?'); params.push(price_semi_sedan); }
    if (price_sedan !== undefined) { updates.push('price_sedan = ?'); params.push(price_sedan); }
    if (price_premium_sedan !== undefined) { updates.push('price_premium_sedan = ?'); params.push(price_premium_sedan); }
    if (price_suv !== undefined) { updates.push('price_suv = ?'); params.push(price_suv); }
    if (price_premium_suv !== undefined) { updates.push('price_premium_suv = ?'); params.push(price_premium_suv); }
    if (wash_count !== undefined) { updates.push('wash_count = ?'); params.push(wash_count); }
    if (req.body.package_validity !== undefined) { updates.push('package_validity = ?'); params.push(Math.max(1, Number(req.body.package_validity) || 12)); }
    if (wax_count !== undefined) { updates.push('wax_count = ?'); params.push(wax_count); }
    if (is_published !== undefined) { updates.push('is_published = ?'); params.push(is_published ? 1 : 0); }
    if (visible_to_customer !== undefined) { updates.push('visible_to_customer = ?'); params.push(visible_to_customer ? 1 : 0); }
    if (is_custom !== undefined) { updates.push('is_custom = ?'); params.push(is_custom ? 1 : 0); }

    if (updates.length) {
      params.push(id);
      await conn.query(`UPDATE packages SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    // Sync v2 pricing matrix table
    if (req.body.pricing && Array.isArray(req.body.pricing) && req.body.pricing.length > 0) {
      for (const p of req.body.pricing) {
        if (p.car_type && p.pricing_type && p.price !== undefined) {
          await conn.query(
            `INSERT INTO package_pricing (package_id, car_type, pricing_type, price)
             VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [id, p.car_type, p.pricing_type, Number(p.price) || 0]
          );
        }
      }
    } else if (
      price_hatchback !== undefined || price_semi_sedan !== undefined ||
      price_sedan !== undefined || price_premium_sedan !== undefined || price_suv !== undefined || price_premium_suv !== undefined
    ) {
      const categoryPriceMap = {
        hatchback: price_hatchback,
        semi_sedan: price_semi_sedan,
        sedan: price_sedan,
        premium_sedan: price_premium_sedan,
        suv: price_suv,
        premium_suv: price_premium_suv,
      };
      for (const [carType, priceVal] of Object.entries(categoryPriceMap)) {
        if (priceVal !== undefined) {
          await conn.query(
            `INSERT INTO package_pricing (package_id, car_type, pricing_type, price)
             VALUES (?, ?, 'basic', ?)
             ON DUPLICATE KEY UPDATE price = VALUES(price)`,
            [id, carType, Number(priceVal) || 0]
          );
        }
      }
    }

    // Replace service links — new format with total_count
    if (services !== undefined) {
      await conn.query('DELETE FROM package_services WHERE package_id = ?', [id]);
      for (const svc of services) {
        await conn.query(
          'INSERT INTO package_services (package_id, service_id, total_count) VALUES (?, ?, ?)',
          [id, svc.service_id, svc.total_count || 1]
        );
      }
      await syncPackageServicesToUserPackages(conn, id);
    }
    // Legacy format
    else if (service_ids !== undefined) {
      await conn.query('DELETE FROM package_services WHERE package_id = ?', [id]);
      for (const sid of service_ids) {
        await conn.query('INSERT INTO package_services (package_id, service_id) VALUES (?, ?)', [id, sid]);
      }
      await syncPackageServicesToUserPackages(conn, id);
    }

    // Replace product links
    if (products !== undefined) {
      await conn.query('DELETE FROM package_products WHERE package_id = ?', [id]);
      for (const p of products) {
        await conn.query('INSERT INTO package_products (package_id, product_id, quantity) VALUES (?, ?, ?)', [id, p.product_id, p.quantity || 1]);
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'Package updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Package update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally { conn.release(); }
};

// Helper: Syncs updated package services to all active customer subscriptions for this package_id
async function syncPackageServicesToUserPackages(conn, packageId) {
  try {
    const [pkgServices] = await conn.query(
      `SELECT ps.service_id, s.name AS service_name, ps.total_count
       FROM package_services ps
       JOIN services s ON ps.service_id = s.id
       WHERE ps.package_id = ?`,
      [packageId]
    );

    const [activeUserPkgs] = await conn.query(
      `SELECT id FROM user_packages WHERE package_id = ? AND status = 'active'`,
      [packageId]
    );

    for (const upkg of activeUserPkgs) {
      const userPackageId = upkg.id;

      if (pkgServices.length > 0) {
        const activeNames = pkgServices.map(s => s.service_name);
        await conn.query(
          `DELETE FROM user_package_usage WHERE user_package_id = ? AND service_name NOT IN (?)`,
          [userPackageId, activeNames]
        );
      } else {
        await conn.query(`DELETE FROM user_package_usage WHERE user_package_id = ?`, [userPackageId]);
      }

      for (const ps of pkgServices) {
        const [existing] = await conn.query(
          `SELECT id, remaining, used_count FROM user_package_usage WHERE user_package_id = ? AND service_name = ?`,
          [userPackageId, ps.service_name]
        );

        if (existing.length > 0) {
          const used = existing[0].used_count || 0;
          const newRemaining = Math.max(0, ps.total_count - used);
          await conn.query(
            `UPDATE user_package_usage SET total_count = ?, remaining = ? WHERE id = ?`,
            [ps.total_count, newRemaining, existing[0].id]
          );
        } else {
          await conn.query(
            `INSERT INTO user_package_usage (user_package_id, service_name, total_count, used_count, remaining)
             VALUES (?, ?, ?, 0, ?)`,
            [userPackageId, ps.service_name, ps.total_count, ps.total_count]
          );
        }
      }
    }
  } catch (syncErr) {
    console.error('Failed syncPackageServicesToUserPackages:', syncErr.message);
  }
}

// ─── TOGGLE PUBLISH ─────────────────────────
exports.togglePublish = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT is_published FROM packages WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Package not found' });
    await pool.query('UPDATE packages SET is_published = ? WHERE id = ?', [rows[0].is_published ? 0 : 1, req.params.id]);
    res.json({ success: true, message: rows[0].is_published ? 'Package unpublished' : 'Package published' });
  } catch (err) {
    console.error('Package toggle error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── TOGGLE CUSTOMER VISIBILITY ─────────────
exports.toggleVisibility = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT visible_to_customer FROM packages WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Package not found' });
    const newVal = rows[0].visible_to_customer ? 0 : 1;
    await pool.query('UPDATE packages SET visible_to_customer = ? WHERE id = ?', [newVal, req.params.id]);
    res.json({ success: true, message: newVal ? 'Package now visible to customers' : 'Package hidden from customers' });
  } catch (err) {
    console.error('Package visibility toggle error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DELETE ─────────────────────────────────
exports.delete = async (req, res) => {
  try {
    const pkgId = req.params.id;
    const [existing] = await pool.query('SELECT id, name FROM packages WHERE id = ?', [pkgId]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Package not found' });

    // Safeguard: Check if any customer subscriptions exist (active or historical)
    const [subscriptions] = await pool.query(
      'SELECT COUNT(*) AS count FROM user_packages WHERE package_id = ?',
      [pkgId]
    );
    const subscriberCount = subscriptions[0]?.count || 0;

    if (subscriberCount > 0) {
      return res.status(400).json({
        success: false,
        error: `Cannot delete package "${existing[0].name}": ${subscriberCount} customer subscription(s) reference this package. Unpublish or hide the package to prevent new purchases while preserving existing customer balances.`
      });
    }

    // Safe to hard delete if 0 customer subscriptions exist
    await pool.query('DELETE FROM packages WHERE id = ?', [pkgId]);
    res.json({ success: true, message: 'Package deleted successfully' });
  } catch (err) {
    console.error('Package delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CUSTOMER: SUBMIT PACKAGE REQUEST ───────
exports.createRequest = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { vehicle_id, package_id, pricing_type: pt = 'basic', car_type } = req.body;
    if (!vehicle_id || !package_id) {
      return res.status(400).json({ success: false, error: 'Choose a car and a package' });
    }
    const pricing_type = pt === 'premium' ? 'premium' : 'basic';

    // the car must be this customer's own; the price always comes from the package, never from the app
    const [[veh]] = await pool.query('SELECT id, brand, model, category FROM vehicles WHERE id = ? AND customer_id = ?', [vehicle_id, customerId]);
    if (!veh) return res.status(404).json({ success: false, error: 'Car not found in your garage' });
    const [[pkg]] = await pool.query('SELECT * FROM packages WHERE id = ? AND is_active = 1 AND is_published = 1 AND visible_to_customer = 1', [package_id]);
    if (!pkg) return res.status(404).json({ success: false, error: 'This package is not available' });
    // one request / one active package per car — stops the same package being bought twice
    const [[dupReq]] = await pool.query("SELECT id FROM package_requests WHERE customer_id = ? AND vehicle_id = ? AND package_id = ? AND status = 'pending' LIMIT 1", [customerId, vehicle_id, package_id]);
    if (dupReq) return res.status(409).json({ success: false, error: 'You already requested this package for this car — the studio will confirm it soon' });
    const [[dupAct]] = await pool.query("SELECT id FROM user_packages WHERE user_id = ? AND vehicle_id = ? AND package_id = ? AND package_status = 'active' AND end_date > NOW() LIMIT 1", [customerId, vehicle_id, package_id]);
    if (dupAct) return res.status(409).json({ success: false, error: 'This package is already active on this car' });
    const { CAR_TYPES, normalizeCarType, guessCarCategory } = require('../utils/carCategory');
    const type = normalizeCarType(veh.category) || guessCarCategory(veh.brand, veh.model) || 'sedan'; // the car decides the price tier
    const [[row]] = await pool.query('SELECT price FROM package_pricing WHERE package_id = ? AND car_type = ? AND pricing_type = ?', [package_id, type, pricing_type]);
    const price = Number(row?.price) || (pricing_type === 'basic' ? Number(pkg[`price_${type}`]) || 0 : 0);
    if (!price) return res.status(400).json({ success: false, error: 'This package has no price for your car type yet — please contact the studio' });

    const [result] = await pool.query(
      "INSERT INTO package_requests (customer_id, vehicle_id, package_id, price, pricing_type, car_type, status) VALUES (?, ?, ?, ?, ?, ?, 'pending')",
      [customerId, vehicle_id, package_id, price, pricing_type, type]
    );

    res.status(201).json({ success: true, requestId: result.insertId, price, car_type: type, message: 'Package request submitted to admin for approval' });
  } catch (err) {
    console.error('Package request create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CUSTOMER: LIST OWN PACKAGE REQUESTS ────
exports.getMyRequests = async (req, res) => {
  try {
    const customerId = req.user.id;
    const [rows] = await pool.query(`
      SELECT pr.id, pr.status, pr.price, pr.rejection_reason, pr.created_at,
             p.name as package_name, p.wash_count,
             v.registration_no, v.brand, v.model
      FROM package_requests pr
      JOIN packages p ON pr.package_id = p.id
      JOIN vehicles v ON pr.vehicle_id = v.id
      WHERE pr.customer_id = ?
      ORDER BY pr.created_at DESC
    `, [customerId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('My package requests error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.listRequests = async (req, res) => {
  try {
    const activeFranchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    const [rows] = await pool.query(`
      SELECT pr.*, u.name as customer_name, u.mobile as customer_mobile,
             v.registration_no, v.brand, v.model,
             p.name as package_name,
             pay.status AS payment_status, pay.payment_method
      FROM package_requests pr
      LEFT JOIN users u ON pr.customer_id = u.id
      LEFT JOIN vehicles v ON pr.vehicle_id = v.id
      LEFT JOIN packages p ON pr.package_id = p.id
      LEFT JOIN v2_payments pay ON (
        pay.booking_id IS NULL AND
        pay.notes IS NOT NULL AND
        JSON_VALID(pay.notes) AND
        (CASE WHEN JSON_VALID(pay.notes) THEN JSON_UNQUOTE(JSON_EXTRACT(pay.notes, '$.package_request_id')) END) = CAST(pr.id AS CHAR)
      )
      WHERE (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
      ORDER BY pr.created_at DESC
    `, [activeFranchiseId, activeFranchiseId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Package list requests error:', err.message);
    res.json({ success: true, data: [] });
  }
};

// Helper function for request approval (can be called by verify payment or webhook)
exports._approveRequestInternal = async (conn, id, paymentId = null, opts = {}) => {
  // 1. Get request details
  const [rows] = await conn.query("SELECT * FROM package_requests WHERE id = ? AND status = 'pending' FOR UPDATE", [id]);
  if (!rows.length) {
    return { success: false, error: 'Pending request not found' };
  }
  const reqData = rows[0];
  const [[already]] = await conn.query("SELECT id FROM user_packages WHERE user_id = ? AND vehicle_id = ? AND package_id = ? AND package_status = 'active' AND end_date > NOW() LIMIT 1", [reqData.customer_id, reqData.vehicle_id, reqData.package_id]);
  if (already) return { success: false, error: 'This customer already has this package active on this car' };

  // 2. Mark approved
  await conn.query("UPDATE package_requests SET status = 'approved', approved_at = CURRENT_TIMESTAMP WHERE id = ?", [id]);

  // 3. Add to user_packages — use core columns only (safe for any DB schema)
  const [result] = await conn.query(
    `INSERT INTO user_packages 
     (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id, franchise_id) 
     VALUES (?, ?, NOW(), DATE_ADD(NOW(), INTERVAL (SELECT COALESCE(package_validity, 12) FROM packages WHERE id = ?) MONTH), 'paid', 'active', ?, ?, ?, (SELECT COALESCE(franchise_id, 1) FROM users WHERE id = ?))`,
    [
      reqData.customer_id, reqData.package_id, reqData.package_id,
      reqData.price || 0, reqData.car_type || null, reqData.vehicle_id, reqData.customer_id
    ]
  );
  const userPackageId = result.insertId;
  await require('./userPackagesController').generatePackageSchedules(conn, userPackageId, reqData.customer_id, reqData.package_id, new Date())
    .then(() => conn.query('UPDATE package_service_schedules SET vehicle_id = ?, franchise_id = ? WHERE user_package_id = ?', [reqData.vehicle_id, reqData.franchise_id || 1, userPackageId]))
    .catch(() => {});

  // Create package_usage rows
  const [packages] = await conn.query('SELECT name FROM packages WHERE id = ?', [reqData.package_id]);
  const packageName = packages.length ? packages[0].name : '';

  // Get service breakdown based on tier or DB fallback
  const { getServiceBreakdown } = require('./userPackagesController');
  const serviceBreakdown = await getServiceBreakdown(conn, reqData.package_id, packageName);
  for (const svc of serviceBreakdown) {
    await conn.query(
      'INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, ?)',
      [userPackageId, svc.service_name, 'available']
    );
  }

  // Log to v2_package_renewals as initial purchase (non-blocking)
  try {
    await conn.query(
      `INSERT INTO v2_package_renewals
       (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
       VALUES (?, ?, ?, CURDATE(), ?, ?, 'customer', 'Initial package purchase')`,
      [reqData.customer_id, reqData.package_id, userPackageId, reqData.price || 0, paymentId]
    );
  } catch (dbErr) {
    console.warn('Failed to write initial purchase log:', dbErr.message);
  }

  // Money: package sold → Payments + Accounts (a payment already linked keeps its own Payments row)
  await require('../services/moneyIn').recordMoneyIn(conn, {
    customerId: reqData.customer_id, amount: reqData.price, method: opts.method || 'cash',
    type: 'package_sale', refId: userPackageId, packageId: reqData.package_id, skipPayment: !!paymentId,
    note: `Package sold: request #${id}`, franchiseId: reqData.franchise_id || 1, userId: opts.userId || null,
  });

  // Fire-and-forget approval SMS & WhatsApp
  try {
    const messagingService = require('../services/messagingService');
    const [custRows] = await conn.query('SELECT name, mobile FROM users WHERE id = ?', [reqData.customer_id]);
    if (custRows.length && custRows[0].mobile) {
      const msg = `O3 Car Spaa: Hi ${custRows[0].name}, your package request has been approved. You can now use your package services.`;
      messagingService.sendSMS(custRows[0].mobile, null, null, { content: msg }).catch(() => {});
      
      const vehicleStr = reqData.car_type ? ` for vehicle segment ${reqData.car_type.replace(/_/g, ' ')}` : '';
      const body = `🎉 *Package Approved!*\n\nHi ${custRows[0].name},\nYour request for the *${packageName}* package${vehicleStr} has been approved and activated!\n\nThank you for choosing O3 Car Spaa! 💎`;
      messagingService.sendWhatsApp(`91${custRows[0].mobile}`, null, { body }).catch(() => {});
    }
  } catch (err) {
    console.warn('SMS/WhatsApp error:', err.message);
  }

  return { success: true, userPackageId };
};

// ─── ADMIN: APPROVE PACKAGE REQUEST ─────────
exports.approveRequest = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    // the customer already sent a QR payment for this request: approving it confirms that payment (no second money row)
    const [[qr]] = await conn.query(
      "SELECT id FROM v2_payments WHERE payment_method = 'qr' AND status = 'pending' AND JSON_VALID(notes) AND JSON_EXTRACT(notes, '$.package_request_id') = ? LIMIT 1 FOR UPDATE",
      [Number(id)]);
    if (qr) {
      await conn.query("UPDATE v2_payments SET status = 'captured' WHERE id = ?", [qr.id]);
      await conn.query("UPDATE v2_payment_transactions SET status = 'success' WHERE payment_id = ?", [qr.id]);
    }
    const result = await exports._approveRequestInternal(conn, id, qr ? qr.id : null, { method: qr ? 'qr' : req.body?.payment_method, userId: req.user.id });
    if (!result.success) {
      await conn.rollback();
      return res.status(404).json(result);
    }

    await conn.commit();
    res.json({ success: true, message: 'Package request approved successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Package approve error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── ADMIN: REJECT PACKAGE REQUEST ──────────
exports.rejectRequest = async (req, res) => {
  try {
    const { id } = req.params;
    const { rejection_reason } = req.body;

    // 1. Get request details
    const [rows] = await pool.query("SELECT * FROM package_requests WHERE id = ? AND status = 'pending'", [id]);
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Pending request not found' });
    }
    const reqData = rows[0];
    const [[qrPending]] = await pool.query(
      "SELECT id FROM v2_payments WHERE payment_method = 'qr' AND status = 'pending' AND JSON_VALID(notes) AND JSON_EXTRACT(notes, '$.package_request_id') = ? LIMIT 1",
      [Number(id)]);
    if (qrPending) return res.status(409).json({ success: false, error: 'The customer sent a QR payment for this package. Confirm or reject that payment in Payments first.' });

    // 2. Mark rejected with reason
    await pool.query(
      "UPDATE package_requests SET status = 'rejected', rejection_reason = ? WHERE id = ?",
      [rejection_reason || 'Rejected by admin', id]
    );

    // 3. Fire-and-forget rejection SMS
    try {
      const messagingService = require('../services/messagingService');
      const [custRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [reqData.customer_id]);
      if (custRows.length && custRows[0].mobile) {
        const msg = `O3 Car Spaa: Hi ${custRows[0].name}, your package request has been rejected. Reason: ${rejection_reason || 'Not specified'}. Contact us for details.`;
        messagingService.sendSMS(custRows[0].mobile, null, null, { content: msg }).catch(() => {});
      }
    } catch { /* non-blocking */ }

    console.log(`[PACKAGE] Request #${id} rejected by admin ${req.user.id} — reason: ${rejection_reason || 'N/A'}`);
    res.json({ success: true, message: 'Package request rejected' });
  } catch (err) {
    console.error('Package reject error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DOWNLOAD INVOICE ───────────────────────
exports.downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const [[pr]] = await pool.query('SELECT customer_id, status FROM package_requests WHERE id = ?', [id]);
    if (!pr) return res.status(404).json({ success: false, error: 'Package request not found' });
    if (req.user.role === 'customer' && Number(pr.customer_id) !== Number(req.user.id)) return res.status(404).json({ success: false, error: 'Package request not found' });
    if (pr.status !== 'approved') return res.status(400).json({ success: false, error: 'The invoice is available once the package is approved' });
    const { generatePackageInvoicePDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generatePackageInvoicePDF(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Length': pdfBuffer.length,
      'Content-Disposition': 'attachment; filename="' + invoiceNumber + '.pdf"'
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Download package invoice error:', err);
    res.status(500).json({ success: false, error: err.message || 'Error generating invoice' });
  }
};

// ─── GET SERVICES IN A PACKAGE ──────────────
// Returns services included in a specific package (DB-first single source of truth)
exports.getPackageServices = async (req, res) => {
  try {
    const { id } = req.params;

    const [pkgRows] = await pool.query('SELECT id FROM packages WHERE id = ?', [id]);
    if (!pkgRows.length) {
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    const [rows] = await pool.query(
      `SELECT ps.id AS ps_id, ps.total_count, COALESCE(ps.complimentary, 0) AS complimentary, s.id, s.name, s.description,
              s.price_hatchback, s.price_semi_sedan, s.price_sedan, s.price_premium_sedan, s.price_suv, s.price_premium_suv,
              s.duration_minutes, s.is_active
       FROM package_services ps
       JOIN services s ON ps.service_id = s.id
       WHERE ps.package_id = ?
       ORDER BY ps.id ASC`,
      [id]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Package services list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.customAssign = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { user_id, vehicle_id, name, price_paid, duration_months = 12, services = [] } = req.body;

    if (!user_id || !name || !services.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'user_id, name, and services are required' });
    }
    if (price_paid !== undefined && price_paid !== null && price_paid !== '' && !(Number(price_paid) >= 0)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Price must be 0 or more' });
    }
    if (services.some(s => !s || !s.service_id || !Number.isInteger(Number(s.total_count)) || Number(s.total_count) < 1)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Each service needs a count of at least 1' });
    }

    // 1. Resolve vehicle segment (the car must belong to this customer)
    let vehicleSegment = 'sedan';
    if (vehicle_id) {
      const [vRows] = await conn.query('SELECT category, customer_id FROM vehicles WHERE id = ?', [vehicle_id]);
      if (!vRows.length || Number(vRows[0].customer_id) !== Number(user_id)) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'This car does not belong to this customer' });
      }
      if (vRows[0].category) vehicleSegment = vRows[0].category;
    }

    // 2. One active package per car (a package with no car covers all the customer's cars)
    const [activeExisting] = await conn.query(
      `SELECT id FROM user_packages
       WHERE user_id = ? AND package_status = 'active'
       AND (end_date IS NULL OR end_date > NOW())
       AND (? IS NULL OR vehicle_id IS NULL OR vehicle_id = ?)`,
      [user_id, vehicle_id || null, vehicle_id || null]
    );
    if (activeExisting.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: vehicle_id ? 'This car already has an active package. Renew or cancel it instead.' : 'User already has an active package. Renew/cancel instead.',
      });
    }

    // 3. Create the custom package catalog record (package names are unique, so a repeated name gets the customer id added)
    let pkgName = name.trim();
    const [[dup]] = await conn.query('SELECT id FROM packages WHERE name = ?', [pkgName]);
    if (dup) {
      pkgName = `${name.trim()} · C${user_id}`;
      for (let n = 2; (await conn.query('SELECT id FROM packages WHERE name = ?', [pkgName]))[0].length; n++) pkgName = `${name.trim()} · C${user_id}-${n}`;
    }
    const [pkgResult] = await conn.query(
      `INSERT INTO packages (name, description, is_custom, is_active, visible_to_customer, is_published, price_sedan)
       VALUES (?, 'Custom Package for Customer', 1, 1, 0, 0, 0)`,
      [pkgName]
    );
    const packageId = pkgResult.insertId;

    // 3. Insert service linkages
    for (const svc of services) {
      await conn.query(
        'INSERT INTO package_services (package_id, service_id, total_count) VALUES (?, ?, ?)',
        [packageId, svc.service_id, svc.total_count]
      );
    }

    // 5. Assign user_package
    const [upResult] = await conn.query(
      `INSERT INTO user_packages
       (user_id, package_id, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id, franchise_id)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MONTH), 'paid', 'active', ?, ?, ?, ?)`,
      [user_id, packageId, duration_months, price_paid || null, vehicleSegment, vehicle_id || null, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
    );
    const userPackageId = upResult.insertId;
    const salePaymentId = await require('../services/moneyIn').recordMoneyIn(conn, {
      customerId: user_id, amount: price_paid, method: req.body.payment_mode || req.body.payment_method || 'cash',
      type: 'package_sale', refId: userPackageId, packageId, note: `Custom package sold: #${userPackageId}`,
      franchiseId: Number(req.franchiseId) || Number(req.user?.franchise_id) || 1, userId: req.user.id,
    });
    await conn.query(`INSERT INTO v2_package_renewals (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
      VALUES (?, ?, ?, CURDATE(), ?, ?, 'admin', 'Custom package given by admin')`, [user_id, packageId, userPackageId, price_paid || 0, salePaymentId]);

    // 6. Create package_usage rows
    for (const svc of services) {
      const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [svc.service_id]);
      const sName = svcRows.length ? svcRows[0].name : `Service #${svc.service_id}`;
      await conn.query(
        'INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, ?)',
        [userPackageId, sName, 'available']
      );
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      data: { user_package_id: userPackageId, package_id: packageId },
      message: `Custom package '${name}' created and assigned successfully`
    });
  } catch (err) {
    await conn.rollback();
    console.error('Custom assign error:', err);
    res.status(500).json({ success: false, error: 'Failed to create and assign custom package' });
  } finally {
    conn.release();
  }
};

