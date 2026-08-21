const pool = require('../config/db');

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

    const franchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    let where = "u.role = 'customer' AND u.is_active = 1 AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))";
    const params = [franchiseId, franchiseId];

    if (search) {
      const s = `%${search.trim()}%`;
      where += " AND (u.name LIKE ? OR u.mobile LIKE ? OR u.email LIKE ? OR u.id IN (SELECT customer_id FROM vehicles WHERE registration_no LIKE ? OR brand LIKE ? OR model LIKE ?))";
      params.push(s, s, s, s, s, s);
    }


    const [rows] = await pool.query(`
      SELECT u.id, u.name, u.mobile, u.email, u.created_at, u.is_active
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

// ─── GET CUSTOMER DETAILS & HISTORY ─────────────
exports.getDetail = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get user details
    const [userRows] = await pool.query("SELECT id, name, mobile, email, created_at, is_active FROM users WHERE id = ? AND role = 'customer'", [id]);
    if (!userRows.length) {
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    const customer = userRows[0];

    // 2. Get vehicles
    const [vehicles] = await pool.query("SELECT * FROM vehicles WHERE customer_id = ?", [id]);
    
    // 3. Get history notes
    const [notes] = await pool.query("SELECT id, note, created_at FROM customer_notes WHERE customer_id = ? ORDER BY created_at DESC", [id]);

    res.json({
      success: true,
      data: {
        ...customer,
        vehicles,
        notes
      }
    });
  } catch (err) {
    console.error('Customer detail error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
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
    console.log('MANUAL REGISTRATION BODY:', { package_start_date, package_end_date, body: req.body });

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
        "INSERT INTO users (name, mobile, email, role, password_hash) VALUES (?, ?, ?, 'customer', 'manual')",
        [name, mobile, email || null]
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
        // Mark as primary
        await connection.query("UPDATE vehicles SET is_primary = 0 WHERE customer_id = ?", [customerId]);
        await connection.query("UPDATE vehicles SET is_primary = 1 WHERE id = ?", [vehicleId]);
      } else {
        // make existing vehicles non-primary
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

      // Auto approve
      await connection.query(
        "INSERT INTO package_requests (customer_id, vehicle_id, package_id, status, price, created_at, approved_at) VALUES (?, ?, ?, 'approved', ?, ?, ?)",
        [customerId, vehicleId, package_id, price || 0, finalStartDate, finalStartDate]
      );
      
      // Also insert into user_packages so the user actually gets the package!
      const [upResult] = await connection.query(
        `INSERT INTO user_packages 
         (user_id, package_id, start_date, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id)
         VALUES (?, ?, ?, ?, 'paid', 'active', ?, ?, ?)`,
        [customerId, package_id, finalStartDate, finalEndDate, price || 0, category || null, vehicleId]
      );
      const userPackageId = upResult.insertId;

      // Handle package custom services remaining balances
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
        const pkgServices = await getServiceBreakdown(connection, package_id);
        for (const item of pkgServices) {
          await connection.query(
            "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, 'available')",
            [userPackageId, item.service_name]
          );
        }
      }
      
      await connection.query(
        "INSERT INTO customer_notes (customer_id, note) VALUES (?, ?)",
        [customerId, `Walk-in customer registered with manual package assignment (Package ID: ${package_id}).`]
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

exports.lookupByMobile = async (req, res) => {
  try {
    const { mobile } = req.params;
    if (!mobile) {
      return res.status(400).json({ success: false, error: 'Mobile number is required' });
    }

    // Find customer by mobile
    const [users] = await pool.query(
      "SELECT id, name, email FROM users WHERE mobile = ? AND role = 'customer' AND is_active = 1",
      [mobile]
    );

    if (users.length === 0) {
      return res.json({ success: true, found: false });
    }

    const customer = users[0];

    // Find their primary vehicle (or latest registered vehicle)
    const [vehicles] = await pool.query(
      "SELECT brand, model, category, registration_no FROM vehicles WHERE customer_id = ? ORDER BY is_primary DESC, id DESC LIMIT 1",
      [customer.id]
    );

    res.json({
      success: true,
      found: true,
      data: {
        id: customer.id,
        name: customer.name,
        email: customer.email,
        vehicle: vehicles.length ? vehicles[0] : null
      }
    });
  } catch (err) {
    console.error('Customer lookup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

