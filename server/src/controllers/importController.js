const pool = require('../config/db');
const importService = require('../services/importService');
const bcrypt = require('bcryptjs');

// ─── IMPORT CUSTOMERS ─────────────────────────
// Per BUSINESS_LOGIC.md: creates user + vehicle + loyalty for each row
exports.importCustomers = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const conn = await pool.getConnection();
  try {
    const parsedData = importService.parseFile(req.file.buffer, req.file.originalname);
    const { valid, errors } = importService.validateCustomers(parsedData);

    if (valid.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows found', details: errors });
    }

    await conn.beginTransaction();

    let imported = 0;
    let skipped_duplicates = 0;
    const rowErrors = [...errors];

    for (const record of valid) {
      try {
        // 1. Check vehicle_reg_no — if exists, skip as duplicate
        const [existingVehicle] = await conn.query(
          'SELECT id FROM vehicles WHERE registration_no = ?',
          [record.vehicle_reg_no.toUpperCase().replace(/\s/g, '')]
        );
        if (existingVehicle.length > 0) {
          skipped_duplicates++;
          continue;
        }

        // 2. Find or create customer by mobile
        let customerId;
        const [existingUser] = await conn.query(
          'SELECT id FROM users WHERE mobile = ?',
          [record.mobile_number]
        );

        if (existingUser.length > 0) {
          customerId = existingUser[0].id;
        } else {
          // Generate password: last 4 digits of mobile + "GKA"
          const password = record.mobile_number.slice(-4) + 'GKA';
          const hash = await bcrypt.hash(password, 10);
          const [newUser] = await conn.query(
            'INSERT INTO users (name, mobile, email, password_hash, role) VALUES (?, ?, ?, ?, ?)',
            [record.customer_name, record.mobile_number, record.email || null, hash, 'customer']
          );
          customerId = newUser.insertId;
        }

        // 3. Create vehicle
        const regNo = record.vehicle_reg_no.toUpperCase().replace(/\s/g, '');
        const [vehResult] = await conn.query(
          'INSERT INTO vehicles (registration_no, customer_id, brand, model) VALUES (?, ?, ?, ?)',
          [regNo, customerId, record.car_brand, record.car_model]
        );
        const vehicleId = vehResult.insertId;

        // 4. Create or update loyalty record
        const credits = parseFloat(record.loyalty_credits) || 0;
        const freeWashes = parseInt(record.free_washes) || 0;
        const waxCount = parseInt(record.wax_count) || 0;
        await conn.query(
          `INSERT INTO loyalty (customer_id, credits, free_washes, wax_count)
           VALUES (?, ?, ?, ?)
           ON DUPLICATE KEY UPDATE
             credits = credits + VALUES(credits),
             free_washes = free_washes + VALUES(free_washes),
             wax_count = wax_count + VALUES(wax_count)`,
          [customerId, credits, freeWashes, waxCount]
        );

        // 5. Auto-assign Package if provided in import row
        if (record.package_name) {
          const [pkgMatch] = await conn.query(
            'SELECT id, name FROM packages WHERE LOWER(name) LIKE LOWER(?) LIMIT 1',
            [`%${record.package_name}%`]
          );
          if (pkgMatch.length) {
            const pkgId = pkgMatch[0].id;
            const startDate = record.purchase_date ? new Date(record.purchase_date) : new Date();
            let endDate = record.end_date ? new Date(record.end_date) : new Date(startDate);
            if (!record.end_date) {
              endDate.setFullYear(endDate.getFullYear() + 1); // 12-month validity default
            }

            const [upRes] = await conn.query(
              `INSERT INTO user_packages (user_id, package_id, vehicle_id, start_date, end_date, price_paid, package_status)
               VALUES (?, ?, ?, ?, ?, ?, 'active')`,
              [customerId, pkgId, vehicleId, startDate, endDate, record.price_paid || 0]
            );
            const userPkgId = upRes.insertId;

            // Create service usage rows for package
            const userPkgCtrl = require('./userPackagesController');
            const breakdown = await userPkgCtrl.getServiceBreakdown(conn, pkgId, pkgMatch[0].name);
            for (const svc of breakdown) {
              await conn.query(
                'INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, ?)',
                [userPkgId, svc.service_name, 'available']
              );
            }
          }
        }

        imported++;
      } catch (err) {
        rowErrors.push({ row: record._rowIndex || 0, field: 'general', reason: err.message });
      }
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'Import complete',
      data: {
        total: parsedData.length,
        imported,
        skipped_duplicates,
        errors: rowErrors,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error('Customer import error:', err);
    res.status(500).json({ success: false, error: 'Failed to process import file' });
  } finally {
    conn.release();
  }
};

// ─── IMPORT INVENTORY ─────────────────────────
exports.importInventory = async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ success: false, error: 'No file uploaded' });
  }

  const conn = await pool.getConnection();
  try {
    const parsedData = importService.parseFile(req.file.buffer, req.file.originalname);
    const { valid, errors } = importService.validateInventory(parsedData);

    if (valid.length === 0) {
      return res.status(400).json({ success: false, error: 'No valid rows found', details: errors });
    }

    await conn.beginTransaction();

    let inserted = 0;
    let updated = 0;

    for (const record of valid) {
      // Check if product already exists by name
      const [existing] = await conn.query(
        'SELECT id FROM inventory WHERE product_name = ? AND is_deleted = 0',
        [record.product_name]
      );

      if (existing.length > 0) {
        // Update existing stock
        await conn.query(
          `UPDATE inventory 
           SET quantity = quantity + ?, 
               low_stock_threshold = ?,
               unit = ?
           WHERE id = ?`,
          [record.quantity || 0, record.low_stock_threshold || 5, record.unit || 'pcs', existing[0].id]
        );
        updated++;
      } else {
        // Insert new
        await conn.query(
          `INSERT INTO inventory (product_name, unit, quantity, low_stock_threshold) 
           VALUES (?, ?, ?, ?)`,
          [record.product_name, record.unit || 'pcs', record.quantity || 0, record.low_stock_threshold || 5]
        );
        inserted++;
      }
    }

    await conn.commit();
    res.json({
      success: true,
      message: 'Import complete',
      data: {
        totalParsed: parsedData.length,
        inserted,
        updated,
        validationErrors: errors,
      },
    });
  } catch (err) {
    await conn.rollback();
    console.error('Inventory import error:', err);
    res.status(500).json({ success: false, error: 'Failed to process import file' });
  } finally {
    conn.release();
  }
};

// ─── DOWNLOAD TEMPLATE ────────────────────────
exports.downloadTemplate = async (req, res) => {
  try {
    const { type } = req.query; // 'customers' or 'inventory'
    const xlsx = require('xlsx');

    const wb = xlsx.utils.book_new();
    let ws;

    if (type === 'customers') {
      // Headers per BUSINESS_LOGIC.md
      const data = [
        ['customer_name', 'mobile_number', 'email', 'vehicle_reg_no', 'car_brand', 'car_model', 'loyalty_credits', 'free_washes', 'wax_count', 'package_name', 'purchase_date', 'price_paid'],
        ['Rahul Shah', '9876543210', 'rahul@email.com', 'GJ06AB1234', 'Maruti', 'Swift', '0', '0', '0', 'CERAMIC LEATHER AMC', '2025-09-01', '15000'],
      ];
      ws = xlsx.utils.aoa_to_sheet(data);
    } else if (type === 'inventory') {
      const data = [
        ['product_name', 'unit', 'quantity', 'low_stock_threshold'],
        ['Teflon Spray', 'ml', '500', '50'],
      ];
      ws = xlsx.utils.aoa_to_sheet(data);
    } else {
      return res.status(400).json({ success: false, error: 'Invalid template type. Use customers or inventory.' });
    }

    xlsx.utils.book_append_sheet(wb, ws, 'Template');
    const buffer = xlsx.write(wb, { type: 'buffer', bookType: 'xlsx' });

    res.setHeader('Content-Disposition', `attachment; filename="${type}_template.xlsx"`);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.send(buffer);
  } catch (err) {
    console.error('Download template error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate template' });
  }
};
