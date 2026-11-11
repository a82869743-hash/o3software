const pool = require('../config/db');
const { guessCarCategory } = require('../utils/carCategory');
const { logAudit } = require('./auditController');

function parseDateRobust(dateStr) {
  if (!dateStr) return null;
  let d = new Date(dateStr);
  if (!isNaN(d.getTime())) return d;

  const parts = dateStr.trim().split(/[-/]/);
  if (parts.length === 3) {
    if (parts[0].length === 4) {
      const year = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const day = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    } else if (parts[2].length === 4) {
      const day = parseInt(parts[0], 10);
      const month = parseInt(parts[1], 10) - 1;
      const year = parseInt(parts[2], 10);
      d = new Date(year, month, day);
    }
    if (!isNaN(d.getTime())) return d;
  }
  return null;
}

// ─── LIST ALL CUSTOMERS ─────────────────────────
exports.list = async (req, res) => {
  try {
    const { search, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    // Multi-tenant franchise isolation
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('u.franchise_id')
      : { clause: ' AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))', params: [req.franchiseId || 1, req.franchiseId || 1] };
    let where = "u.role = 'customer' AND u.is_active = 1" + fCond.clause;
    const params = [...fCond.params];

    // Search: digits → mobile; otherwise words must START a name / car word, or be inside the car number.
    // Best matches first (exact name / mobile / car number), so short searches don't look random.
    let rankSql = '0';
    const rankParams = [];
    const term = (search || '').trim();
    if (term) {
      const digits = term.replace(/\D/g, '');
      const reg = `%${term.replace(/\s+/g, '').toUpperCase()}%`;
      const startsWord = [`${term}%`, `% ${term}%`];
      const conds = [
        'u.name LIKE ? OR u.name LIKE ?',
        'u.email LIKE ?',
      ];
      params.push(...startsWord, `${term}%`);
      // 1–2 letters: customer name only (car words like "Qute" would look random)
      if (term.length >= 3) {
        conds.push("u.id IN (SELECT customer_id FROM vehicles WHERE REPLACE(UPPER(registration_no), ' ', '') LIKE ? OR brand LIKE ? OR model LIKE ? OR model LIKE ?)");
        params.push(reg, `${term}%`, ...startsWord);
      }
      if (digits.length >= 3) { conds.push('u.mobile LIKE ?'); params.push(`%${digits}%`); }
      where += ` AND (${conds.map(c => `(${c})`).join(' OR ')})`;
      rankSql = `CASE
        WHEN u.name = ? OR u.mobile = ? THEN 0
        WHEN u.id IN (SELECT customer_id FROM vehicles WHERE REPLACE(UPPER(registration_no), ' ', '') = ?) THEN 0
        WHEN u.name LIKE ? THEN 1
        WHEN u.name LIKE ? THEN 2
        ELSE 3 END`;
      rankParams.push(term, digits || term, term.replace(/\s+/g, '').toUpperCase(), `${term}%`, `% ${term}%`);
    }

    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.mobile, u.email, u.franchise_id, u.created_at, u.is_active,
             u.custom_discount_type, u.custom_discount_value, u.crm_notes
      FROM users u
      WHERE ${where}
      ORDER BY ${term ? `${rankSql}, u.name ASC, ` : ''}u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, ...rankParams, parseInt(limit), offset]);

    const [totalRows] = await pool.query(`SELECT COUNT(u.id) as total FROM users u WHERE ${where}`, params);

    // Enrich each customer with their vehicles
    for (const cust of rows) {
      try {
        const [vRows] = await pool.query(
          "SELECT id, brand, model, registration_no, category, is_primary FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, created_at ASC",
          [cust.id]
        );
        cust.vehicles = vRows;
      } catch (vErr) {
        cust.vehicles = [];
      }
    }

    res.json({
      success: true,
      data: rows,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total: totalRows[0].total
      }
    });
  } catch (err) {
    console.error('Customer list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET CUSTOMER DETAILS & FULL CRM PROFILE ────
exports.getDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get user details
    const [userRows] = await pool.query(
      `SELECT id, name, mobile, email, franchise_id, created_at, is_active,
              custom_discount_type, custom_discount_value, crm_notes
       FROM users WHERE id = ? AND role = 'customer'`,
      [id]
    );
    if (!userRows.length) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const customer = userRows[0];

    // Multi-tenant check
    if (!req.isSuperAdmin && customer.franchise_id && req.franchiseId && parseInt(customer.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot access customer from another franchise' });
    }

    // 2. Get vehicles
    const [vehicles] = await pool.query(
      "SELECT * FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, created_at ASC",
      [id]
    );
    
    // 3. Get history notes
    const [notes] = await pool.query(
      "SELECT id, note, created_at FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC",
      [id]
    );

    // 4. Get full service history (Job Cards)
    const [jobCards] = await pool.query(
      `SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.subtotal, jc.total_amount,
              jc.invoice_number, jc.discount_type, jc.discount_value, jc.discount_amount,
              jc.discount_reason, jc.discount_reference, jc.completed_at, jc.referral_person,
              v.registration_no, v.brand, v.model
       FROM job_carts jc
       JOIN vehicles v ON jc.vehicle_id = v.id
       WHERE v.customer_id = ?
       ORDER BY jc.visit_date DESC, jc.id DESC`,
      [id]
    );

    // Attach services for each job card
    if (jobCards.length > 0) {
      const jcIds = jobCards.map(jc => jc.id);
      const [allServices] = await pool.query(
        `SELECT job_cart_id, service_name, service_price, labor_charges, custom_price, custom_notes
         FROM job_services
         WHERE job_cart_id IN (?)
         ORDER BY id ASC`,
        [jcIds]
      );
      jobCards.forEach(jc => {
        jc.services = allServices.filter(s => s.job_cart_id === jc.id);
      });
    }

    // 5. Get assigned packages and remaining service usage
    const [packages] = await pool.query(
      `SELECT up.*, p.name AS package_name, p.description AS package_description,
              v.registration_no, v.brand, v.model
       FROM user_packages up
       JOIN packages p ON up.package_id = p.id
       LEFT JOIN vehicles v ON up.vehicle_id = v.id
       WHERE up.user_id = ?
       ORDER BY up.created_at DESC`,
      [id]
    );

    if (packages.length > 0) {
      const upIds = packages.map(p => p.id);
      const [allUsage] = await pool.query(
        `SELECT * FROM package_usage WHERE user_package_id IN (?) ORDER BY id ASC`,
        [upIds]
      );
      packages.forEach(p => {
        p.usage = allUsage.filter(u => u.user_package_id === p.id);
      });
    }

    // 6. Get Loyalty Balance
    const [loyaltyRows] = await pool.query('SELECT * FROM loyalty WHERE customer_id = ?', [id]);
    const loyalty = loyaltyRows[0] || { credits: 0, free_washes: 0, wax_count: 0, points: 0 };

    res.json({
      success: true,
      data: {
        ...customer,
        vehicles,
        notes,
        service_history: jobCards,
        packages,
        loyalty
      }
    });
  } catch (err) {
    console.error('Customer detail error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE CUSTOMER (CRM Profile, Discounts, Notes) ────
exports.updateCustomer = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const {
      name,
      email,
      mobile,
      custom_discount_type,
      custom_discount_value,
      crm_notes
    } = req.body;

    const [existing] = await conn.query('SELECT * FROM users WHERE id = ? AND role = \'customer\'', [id]);
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const old = existing[0];

    // Franchise check
    if (!req.isSuperAdmin && old.franchise_id && req.franchiseId && parseInt(old.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Access denied: Cannot edit customer from another franchise' });
    }

    {
      const V = require('../utils/validators');
      if (email && !V.isValidEmail(String(email).trim())) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Enter a valid email address' }); }
      if (mobile) {
        const m = V.normalizeMobile(mobile);
        if (!V.isValidMobile(m)) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' }); }
        const [[dupM]] = await conn.query('SELECT id FROM users WHERE mobile = ? AND id <> ? AND is_deleted = 0', [m, id]);
        if (dupM) { await conn.rollback(); return res.status(409).json({ success: false, error: 'Another account already uses this mobile number' }); }
        req.body.mobile = m;
      }
    }
    let dType = custom_discount_type;
    if (dType !== undefined && !['percentage', 'fixed', 'none'].includes(dType)) {
      dType = 'none';
    }

    let dVal = custom_discount_value !== undefined ? parseFloat(custom_discount_value) : old.custom_discount_value;
    if (isNaN(dVal) || dVal < 0) dVal = 0;
    if (dType === 'percentage' && dVal > 100) dVal = 100;

    await conn.query(
      `UPDATE users SET
        name = COALESCE(?, name),
        email = ?,
        mobile = COALESCE(?, mobile),
        custom_discount_type = COALESCE(?, custom_discount_type),
        custom_discount_value = ?,
        crm_notes = COALESCE(?, crm_notes)
       WHERE id = ?`,
      [
        name ? name.trim() : null,
        email !== undefined ? (email ? email.trim() : null) : old.email,
        req.body.mobile ? String(req.body.mobile).trim() : null,
        dType !== undefined ? dType : null,
        dVal,
        crm_notes !== undefined ? (crm_notes ? crm_notes.trim() : null) : null,
        id
      ]
    );

    // If CRM notes added or changed, log to customer_notes
    if (crm_notes && crm_notes.trim() && crm_notes.trim() !== (old.crm_notes || '')) {
      await conn.query(
        'INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)',
        [id, `CRM Note Updated: ${crm_notes.trim()}`]
      );
    }

    // Audit discount update
    if (dType !== old.custom_discount_type || dVal !== parseFloat(old.custom_discount_value)) {
      await logAudit(
        req.user?.id,
        'CUSTOMER_DISCOUNT_UPDATED',
        'users',
        id,
        {
          old_discount_type: old.custom_discount_type,
          old_discount_value: old.custom_discount_value,
          new_discount_type: dType || old.custom_discount_type,
          new_discount_value: dVal
        },
        req.ip
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Customer CRM profile updated successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('updateCustomer error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── ASSIGN PACKAGE TO CUSTOMER DIRECTLY ────────
exports.assignPackage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { package_id, vehicle_id, price_paid, start_date, end_date, custom_services } = req.body;

    if (!package_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Package is required' });
    }

    const [custRows] = await conn.query('SELECT id, franchise_id FROM users WHERE id = ?', [id]);
    if (!custRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const [pkgRows] = await conn.query('SELECT * FROM packages WHERE id = ?', [package_id]);
    if (!pkgRows.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    const pkg = pkgRows[0];

    let startDate = parseDateRobust(start_date) || new Date();
    let endDate = parseDateRobust(end_date);
    if (!endDate) {
      const lowerPkg = pkg.name.toLowerCase();
      const durationMonths = lowerPkg.includes('bronze') ? 3 : (lowerPkg.includes('silver') ? 5 : 12);
      endDate = new Date(startDate);
      endDate.setMonth(endDate.getMonth() + durationMonths);
    }

    // Insert user_package
    const [upResult] = await conn.query(
      `INSERT INTO user_packages 
       (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_id, franchise_id)
       VALUES (?, ?, ?, ?, 'paid', 'active', ?, ?, ?)`,
      [id, package_id, startDate, endDate, parseFloat(price_paid) || parseFloat(pkg.price || 0), vehicle_id || null, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
    );
    const userPackageId = upResult.insertId;
    await conn.query(`INSERT INTO v2_package_renewals (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
      VALUES (?, ?, ?, ?, ?, NULL, 'admin', 'Package added to customer')`, [id, package_id, userPackageId, startDate, parseFloat(price_paid) || parseFloat(pkg.price || 0)]);

    // Handle package usage services
    if (custom_services && Array.isArray(custom_services) && custom_services.length > 0) {
      for (const item of custom_services) {
        const total = parseInt(item.total_count) || parseInt(item.count) || 1;
        const used = parseInt(item.used_count) || 0;
        await conn.query(
          "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, ?, ?)",
          [userPackageId, item.service_name, used, used >= total ? 'consumed' : 'available']
        );
      }
    } else {
      const { getServiceBreakdown } = require('./userPackagesController');
      try {
        const pkgServices = await getServiceBreakdown(conn, package_id);
        for (const item of pkgServices) {
          await conn.query(
            "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, 'available')",
            [userPackageId, item.service_name]
          );
        }
      } catch (e) {
        console.warn('Fallback inserting standard package service');
        await conn.query(
          "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, 'available')",
          [userPackageId, pkg.name]
        );
      }
    }

    await conn.query(
      "INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)",
      [id, `Assigned Package: ${pkg.name} (Valid till ${endDate.toISOString().slice(0, 10)})`]
    );

    await conn.commit();
    res.status(201).json({
      success: true,
      message: `Package ${pkg.name} assigned successfully`,
      data: { user_package_id: userPackageId }
    });
  } catch (err) {
    await conn.rollback();
    console.error('assignPackage error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── ADD CUSTOMER NOTE (CRM HISTORY) ────────────
exports.addNote = async (req, res) => {
  try {
    const { id } = req.params;
    const { note } = req.body;

    if (!note || !note.trim()) {
      return res.status(400).json({ success: false, error: 'Note content is required' });
    }
    const [[nc]] = await pool.query("SELECT id, franchise_id FROM users WHERE id = ? AND role = 'customer' AND is_deleted = 0", [id]);
    if (!nc || (!req.isSuperAdmin && req.franchiseId && Number(nc.franchise_id || 1) !== Number(req.franchiseId))) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const [result] = await pool.query(
      "INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)",
      [id, note.trim()]
    );

    res.json({
      success: true,
      data: { id: result.insertId, customer_id: id, note: note.trim(), created_at: new Date() },
      message: 'Note added successfully'
    });
  } catch (err) {
    console.error('Add note error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── MANUAL REGISTRATION ─────────────────────────
exports.createManual = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    let { name, mobile, email, password, brand, model, category, registration_no, package_id, price, package_custom_services, package_start_date, package_end_date } = req.body;
    const { validateRegNo, isValidMobile, normalizeMobile } = require('../utils/validators');

    if (!name || !mobile) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'Name and mobile are required' });
    }
    if (!isValidMobile(mobile)) { await connection.rollback(); return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' }); }
    mobile = normalizeMobile(mobile);
    if (registration_no) {
      const rc = validateRegNo(registration_no);
      if (!rc.valid) { await connection.rollback(); return res.status(400).json({ success: false, error: rc.error }); }
      registration_no = rc.value;
    }

    // Check if user exists. A password lets the walk-in log in to the app with this mobile right away.
    if (password && String(password).length < 6) { await connection.rollback(); return res.status(400).json({ success: false, error: 'Password must be at least 6 characters' }); }
    const passwordHash = password ? await require('bcryptjs').hash(String(password), 10) : null;
    let customerId;
    const [existing] = await connection.query("SELECT id, role, password_hash FROM users WHERE mobile = ?", [mobile]);
    if (existing.length > 0) {
      if (existing[0].role !== 'customer') { await connection.rollback(); return res.status(409).json({ success: false, error: 'This mobile belongs to a staff/admin account' }); }
      customerId = existing[0].id;
      // Only set a password for an account that never had one; never overwrite the customer's own.
      if (passwordHash && (!existing[0].password_hash || existing[0].password_hash === 'manual')) {
        await connection.query('UPDATE users SET password_hash = ? WHERE id = ?', [passwordHash, customerId]);
      }
    } else {
      if (!passwordHash) { await connection.rollback(); return res.status(400).json({ success: false, error: 'Set a password so the customer can log in to the app' }); }
      const [userResult] = await connection.query(
        "INSERT INTO users (name, mobile, email, role, password_hash, franchise_id) VALUES (?, ?, ?, 'customer', ?, ?)",
        [name, mobile, email || null, passwordHash, req.franchiseId || 1]
      );
      customerId = userResult.insertId;
    }

    // Add Vehicle
    let vehicleId = null;
    if (brand && model) {
      let existingVeh = [];
      if (registration_no) {
        [existingVeh] = await connection.query(
          "SELECT id FROM vehicles WHERE customer_id = ? AND registration_no = ?",
          [customerId, registration_no]
        );
      } else {
        [existingVeh] = await connection.query(
          "SELECT id FROM vehicles WHERE customer_id = ? AND brand = ? AND model = ?",
          [customerId, brand, model]
        );
      }

      if (existingVeh.length > 0) {
        vehicleId = existingVeh[0].id;
        await connection.query("UPDATE vehicles SET is_primary = 0 WHERE customer_id = ?", [customerId]);
        await connection.query("UPDATE vehicles SET is_primary = 1 WHERE id = ?", [vehicleId]);
      } else {
        await connection.query("UPDATE vehicles SET is_primary = 0 WHERE customer_id = ?", [customerId]);
        
        const [vehResult] = await connection.query(
          "INSERT INTO vehicles (customer_id, registration_no, brand, model, category, is_primary) VALUES (?, ?, ?, ?, ?, ?)",
          [customerId, registration_no || null, brand, model, category || guessCarCategory(brand, model) || 'sedan', 1]
        );
        vehicleId = vehResult.insertId;
      }
    }

    // Add Package
    if (package_id && vehicleId) {
      const [pkgs] = await connection.query('SELECT name, package_validity FROM packages WHERE id = ?', [package_id]);
      const packageName = pkgs.length ? pkgs[0].name : '';

      let finalStartDate = parseDateRobust(package_start_date) || new Date();
      let finalEndDate = parseDateRobust(package_end_date);

      if (!finalEndDate) {
        const durationMonths = Number(pkgs[0]?.package_validity) || 12;
        finalEndDate = new Date(finalStartDate);
        finalEndDate.setMonth(finalEndDate.getMonth() + durationMonths);
      }

      const [upResult] = await connection.query(
        `INSERT INTO user_packages 
         (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id, franchise_id)
         VALUES (?, ?, ?, ?, 'paid', 'active', ?, ?, ?, ?)`,
        [customerId, package_id, finalStartDate, finalEndDate, price || 0, category || null, vehicleId, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
      );
      const userPackageId = upResult.insertId;
      // purchase history; money was taken earlier (offline / old customer), so nothing is added to today's income
      await connection.query(`INSERT INTO v2_package_renewals (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
        VALUES (?, ?, ?, ?, ?, NULL, 'admin', 'Registered with package (paid earlier)')`, [customerId, package_id, userPackageId, finalStartDate, price || 0]);

      if (package_custom_services && Array.isArray(package_custom_services)) {
        for (const item of package_custom_services) {
          const total = parseInt(item.total_count) || 0;
          const remaining = parseInt(item.remaining) || 0;
          const used = Math.max(0, Math.min(total, total - remaining));
          const usageStatus = remaining > 0 ? 'available' : 'consumed';

          await connection.query(
            "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, ?, ?)",
            [userPackageId, item.service_name, used, usageStatus]
          );
        }
      } else {
        const { getServiceBreakdown } = require('./userPackagesController');
        try {
          const pkgServices = await getServiceBreakdown(connection, package_id);
          for (const item of pkgServices) {
            await connection.query(
              "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, 'available')",
              [userPackageId, item.service_name]
            );
          }
        } catch (e) {
          // fallback
        }
      }
      
      await connection.query(
        "INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)",
        [customerId, `Walk-in customer registered with manual package assignment (${packageName}).`]
      );
    } else {
      await connection.query(
        "INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)",
        [customerId, `Walk-in customer registered manually.`]
      );
    }

    await connection.commit();
    res.json({ success: true, data: { customer_id: customerId, vehicle_id: vehicleId } });
  } catch (err) {
    await connection.rollback();
    console.error('Manual create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    connection.release();
  }
};

// Customer row in this admin's franchise (super admin: any) — null after sending 404/403
async function scopedCustomer(req, res, id) {
  const [[c]] = await pool.query("SELECT id, franchise_id FROM users WHERE id = ? AND role = 'customer'", [id]);
  if (!c) { res.status(404).json({ success: false, error: 'Customer not found' }); return null; }
  if (!req.isSuperAdmin && c.franchise_id && req.franchiseId && Number(c.franchise_id) !== Number(req.franchiseId)) {
    res.status(403).json({ success: false, error: 'Access denied: customer belongs to another franchise' }); return null;
  }
  return c;
}

// ─── SOFT DELETE CUSTOMER ─────────────────────
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await scopedCustomer(req, res, id))) return;
    await pool.query("UPDATE users SET is_active = 0 WHERE id = ? AND role = 'customer'", [id]);
    res.json({ success: true, message: 'Customer archived' });
  } catch (err) {
    console.error('Customer soft-delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── RESTORE CUSTOMER ────────────────────────
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    if (!(await scopedCustomer(req, res, id))) return;
    await pool.query("UPDATE users SET is_active = 1 WHERE id = ? AND role = 'customer'", [id]);
    res.json({ success: true, message: 'Customer restored' });
  } catch (err) {
    console.error('Customer restore error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.listManual = async (req, res) => {
  try {
    const { search } = req.query;
    let query = `
      SELECT u.id as customer_id, u.name, u.mobile, v.brand, v.model, v.registration_no,
             pr.package_id, p.name as package_name, pr.status, u.created_at
      FROM users u
      LEFT JOIN vehicles v ON u.id = v.customer_id
      LEFT JOIN package_requests pr ON v.id = pr.vehicle_id
      LEFT JOIN packages p ON pr.package_id = p.id
      WHERE u.role = 'customer'
    `;
    const params = [];
    
    if (search) {
      query += " AND (u.name LIKE ? OR u.mobile LIKE ? OR v.registration_no LIKE ?)";
      const s = `%${search}%`;
      params.push(s, s, s);
    }
    
    query += " ORDER BY u.created_at DESC LIMIT 100";
    
    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Manual list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── LOOKUP CUSTOMER BY MOBILE ─────────────────
exports.lookupByMobile = async (req, res) => {
  try {
    const { mobile } = req.params;
    if (!mobile) {
      return res.status(400).json({ success: false, error: 'Mobile number is required' });
    }

    const [users] = await pool.query(
      `SELECT id, name, email, mobile, custom_discount_type, custom_discount_value, crm_notes
       FROM users WHERE mobile = ? AND role = 'customer' AND is_active = 1`,
      [mobile]
    );

    if (users.length === 0) {
      return res.json({ success: true, found: false });
    }

    const customer = users[0];

    const [vehicles] = await pool.query(
      "SELECT id, brand, model, category, registration_no FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, id DESC LIMIT 1",
      [customer.id]
    );

    res.json({
      success: true,
      found: true,
      data: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        mobile: customer.mobile,
        custom_discount_type: customer.custom_discount_type,
        custom_discount_value: customer.custom_discount_value,
        crm_notes: customer.crm_notes,
        vehicle: vehicles.length ? vehicles[0] : null
      }
    });
  } catch (err) {
    console.error('Customer lookup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
