const pool = require('../config/db');
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

    if (search) {
      const s = `%${search.trim()}%`;
      where += " AND (u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ? OR u.id IN (SELECT customer_id FROM vehicles WHERE registration_no LIKE ? OR brand LIKE ? OR model LIKE ?))";
      params.push(s, s, s, s, s, s);
    }

    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.mobile, u.email, u.franchise_id, u.created_at, u.is_active,
             u.custom_discount_type, u.custom_discount_value, u.crm_notes
      FROM users u
      WHERE ${where}
      ORDER BY u.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

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
        mobile ? mobile.trim() : null,
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
       (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_id)
       VALUES (?, ?, ?, ?, 'paid', 'active', ?, ?)`,
      [id, package_id, startDate, endDate, parseFloat(price_paid) || parseFloat(pkg.price || 0), vehicle_id || null]
    );
    const userPackageId = upResult.insertId;

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
    const { name, mobile, email, brand, model, category, registration_no, package_id, price, package_custom_services, package_start_date, package_end_date } = req.body;

    if (!name || !mobile) {
      return res.status(400).json({ success: false, error: 'Name and mobile are required' });
    }

    // Check if user exists
    let customerId;
    const [existing] = await connection.query("SELECT id FROM users WHERE mobile = ?", [mobile]);
    if (existing.length > 0) {
      customerId = existing[0].id;
    } else {
      const [userResult] = await connection.query(
        "INSERT INTO users (name, mobile, email, role, password_hash, franchise_id) VALUES (?, ?, ?, 'customer', 'manual', ?)",
        [name, mobile, email || null, req.franchiseId || 1]
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
          [customerId, registration_no || null, brand, model, category || null, 1]
        );
        vehicleId = vehResult.insertId;
      }
    }

    // Add Package
    if (package_id && vehicleId) {
      const [pkgs] = await connection.query('SELECT name FROM packages WHERE id = ?', [package_id]);
      const packageName = pkgs.length ? pkgs[0].name : '';
      const lowerPkgName = packageName.toLowerCase();

      let finalStartDate = parseDateRobust(package_start_date) || new Date();
      let finalEndDate = parseDateRobust(package_end_date);

      if (!finalEndDate) {
        const durationMonths = lowerPkgName.includes('bronze') ? 3 : (lowerPkgName.includes('silver') ? 5 : 12);
        finalEndDate = new Date(finalStartDate);
        finalEndDate.setMonth(finalEndDate.getMonth() + durationMonths);
      }

      const [upResult] = await connection.query(
        `INSERT INTO user_packages 
         (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id)
         VALUES (?, ?, ?, ?, 'paid', 'active', ?, ?, ?)`,
        [customerId, package_id, finalStartDate, finalEndDate, price || 0, category || null, vehicleId]
      );
      const userPackageId = upResult.insertId;

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

// ─── SOFT DELETE CUSTOMER ─────────────────────
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
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
