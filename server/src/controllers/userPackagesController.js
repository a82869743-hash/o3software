/**
 * ═══════════════════════════════════════════════════════════
 * USER PACKAGES CONTROLLER — Phase 2 Enhanced
 * ═══════════════════════════════════════════════════════════
 *
 * Features:
 *   - Package assignment
 *   - Package renewal
 *   - Expiry management
 *   - Usage tracking (reserved/consumed/cancelled)
 *   - Dashboard data
 *   - Package history with renewal chain
 *
 * Tables used:
 *   - user_packages (with renewal/expiry/payment fields)
 *   - package_usage (with usage_status, booking_id, job_card_id)
 *   - package_services (package_id, service_id, total_count)
 *   - packages (wash_count, wax_count, etc.)
 */

const pool = require('../config/db');

// Whole calendar days from today to the end date (same count on every screen and in reminders).
const calendarDaysLeft = (end) => {
  const a = new Date(new Date(end).toLocaleDateString('en-CA'));
  const b = new Date(new Date().toLocaleDateString('en-CA'));
  return Math.round((a - b) / 864e5);
};

// Helper for dynamic package duration calculation
function getPackageDurationMonths(packageName) {
  const nameLower = (packageName || '').toLowerCase();
  if (nameLower.includes('bronze')) return 3;
  if (nameLower.includes('silver')) return 5;
  return 12; // 12 months default
}

exports.getPackageDurationMonths = getPackageDurationMonths;

exports.getServiceBreakdown = getServiceBreakdown;

/**
 * getServiceBreakdown — DB-first single source of truth (1:1 distinct rows)
 */
async function getServiceBreakdown(conn, packageId, packageName) {
  if (!packageId) return [];

  // 1. Database (package_services table) as the single source of truth (1:1 distinct package service rows)
  try {
    const [dbServices] = await conn.query(
      `SELECT ps.id AS ps_id, ps.service_id, s.name AS service_name, ps.total_count, COALESCE(ps.complimentary, 0) AS complimentary
       FROM package_services ps
       JOIN services s ON ps.service_id = s.id
       WHERE ps.package_id = ?
       ORDER BY ps.id ASC`,
      [packageId]
    );

    if (dbServices.length > 0) {
      return dbServices;
    }
  } catch (dbErr) {
    console.warn('Failed dbServices query in getServiceBreakdown:', dbErr.message);
  }

  // 2. Fallback to wash_count and wax_count defined on packages table
  const fallback = [];
  try {
    const [pkgDetails] = await conn.query(
      'SELECT wash_count, wax_count FROM packages WHERE id = ?',
      [packageId]
    );
    if (pkgDetails.length) {
      if (pkgDetails[0].wash_count > 0) {
        fallback.push({ service_name: 'Full Foam Wash', total_count: pkgDetails[0].wash_count, complimentary: 0, display_order: 1 });
      }
      if (pkgDetails[0].wax_count > 0) {
        fallback.push({ service_name: 'Body Wax Coat', total_count: pkgDetails[0].wax_count, complimentary: 0, display_order: 2 });
      }
    }
  } catch (fallbackErr) {
    console.warn('Failed fallback query in getServiceBreakdown:', fallbackErr.message);
  }
  return fallback;
}

// ═══════════════════════════════════════════════════════════
// ASSIGN PACKAGE TO USER
// POST /packages/assign
// ═══════════════════════════════════════════════════════════
exports.assignPackage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { user_id, package_id, vehicle_id, vehicle_segment, price_paid, package_custom_services } = req.body;

    if (!user_id || !package_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'user_id and package_id are required' });
    }

    // Verify user exists
    const [users] = await conn.query('SELECT id FROM users WHERE id = ?', [user_id]);
    if (!users.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'User not found' });
    }

    // Verify package exists — safely query with or without package_validity column
    let packages;
    try {
      [packages] = await conn.query('SELECT id, name, package_validity FROM packages WHERE id = ?', [package_id]);
    } catch (colErr) {
      // package_validity column may not exist
      console.warn('package_validity column not found, using fallback:', colErr.message);
      [packages] = await conn.query('SELECT id, name FROM packages WHERE id = ?', [package_id]);
    }
    if (!packages.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Package not found' });
    }

    const defaultDuration = packages[0].package_validity !== undefined && packages[0].package_validity !== null ? packages[0].package_validity : 12;
    const finalDurationMonths = req.body.duration_months !== undefined ? req.body.duration_months : defaultDuration;

    // Check for existing active package for the SAME vehicle (prevent duplicates)
    let activeExistingQuery = `
      SELECT id FROM user_packages
      WHERE user_id = ? AND package_status = 'active'
        AND (end_date IS NULL OR end_date > NOW())
    `;
    const checkParams = [user_id];
    if (vehicle_id) {
      activeExistingQuery += ' AND vehicle_id = ?';
      checkParams.push(vehicle_id);
    } else {
      activeExistingQuery += ' AND vehicle_id IS NULL';
    }

    const [activeExisting] = await conn.query(activeExistingQuery, checkParams);
    if (activeExisting.length) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: 'This vehicle already has an active package. Renew instead.',
        existing_package_id: activeExisting[0].id
      });
    }

    // Insert into user_packages — core columns only (safe for any DB schema)
    const [result] = await conn.query(
      `INSERT INTO user_packages
       (user_id, package_id, end_date, payment_status, package_status, price_paid, vehicle_segment, vehicle_id, franchise_id)
       VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? MONTH), 'paid', 'active', ?, ?, ?, ?)`,
      [user_id, package_id, finalDurationMonths, price_paid || null, vehicle_segment || null, vehicle_id || null, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
    );
    const userPackageId = result.insertId;
    const salePaymentId = await require('../services/moneyIn').recordMoneyIn(conn, {
      customerId: user_id, amount: price_paid, method: req.body.payment_mode || req.body.payment_method || 'cash',
      type: 'package_sale', refId: userPackageId, packageId: package_id, note: `Package sold (admin): #${userPackageId}`,
      franchiseId: Number(req.franchiseId) || Number(req.user?.franchise_id) || 1, userId: req.user.id,
    });
    // purchase history (Package History PDF, renewals list)
    await conn.query(`INSERT INTO v2_package_renewals (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
      VALUES (?, ?, ?, CURDATE(), ?, ?, 'admin', 'Package given by admin')`, [user_id, package_id, userPackageId, price_paid || 0, salePaymentId]);

    // Create package_usage rows
    if (package_custom_services && Array.isArray(package_custom_services)) {
      for (const item of package_custom_services) {
        const total = parseInt(item.total_count) || 0;
        const remaining = parseInt(item.remaining) || 0;
        const used = Math.max(0, Math.min(total, total - remaining));
        const usageStatus = remaining > 0 ? 'available' : 'consumed';

        await conn.query(
          "INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, ?, ?)",
          [userPackageId, item.service_name, used, usageStatus]
        );
      }
    } else {
      const packageName = packages[0].name;
      const serviceBreakdown = await getServiceBreakdown(conn, package_id, packageName);

      for (const svc of serviceBreakdown) {
        await conn.query(
          'INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, ?)',
          [userPackageId, svc.service_name, 'available']
        );
      }
    }

    // Generate service-wise scheduled dates across package validity
    await generatePackageSchedules(conn, userPackageId, user_id, package_id, new Date(), finalDurationMonths);

    // GST auto-logging for Package Sale (wrapped in try/catch — non-blocking)
    try {
      const [gstSetting] = await conn.query("SELECT value FROM settings WHERE key_name = 'is_gst_applicable'");
      const isGstEnabled = gstSetting.length && gstSetting[0].value === '1';
      if (isGstEnabled && price_paid) {
        const periodMonth = new Date().getMonth() + 1;
        const periodYear = new Date().getFullYear();
        const [gstSettingNo] = await conn.query("SELECT value FROM settings WHERE key_name = 'gstin'");
        const gstin = gstSettingNo.length ? gstSettingNo[0].value : '';

        const numericPrice = parseFloat(price_paid);
        const taxableAmount = numericPrice / 1.18;
        const totalGst = numericPrice - taxableAmount;
        const cgst = totalGst / 2;
        const sgst = totalGst / 2;
        const igst = 0;

        await conn.query(
          `INSERT INTO v2_gst_records (record_type, gstin, taxable_amount, cgst, sgst, igst, total_gst, period_month, period_year, franchise_id)
           VALUES ('sales', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          [gstin, taxableAmount, cgst, sgst, igst, totalGst, periodMonth, periodYear, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
        );
      }
    } catch (gstErr) {
      console.warn('GST logging failed (non-blocking):', gstErr.message);
    }

    await conn.commit();

    res.status(201).json({
      success: true,
      data: { id: userPackageId },
      message: `${packages[0].name} package assigned to user ${user_id}`,
    });
  } catch (err) {
    await conn.rollback();
    console.error('Assign package error:', err);
    res.status(500).json({ success: false, error: 'Failed to assign package' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// RENEW PACKAGE INTERNAL HELPERS
// ═══════════════════════════════════════════════════════════

// Internal helper for package renewals (called by renewPackage)
exports._renewPackageInternal = async (conn, { user_package_id, package_id, payment_amount, payment_mode, payment_id, renewed_by = 'customer', notes }) => {
  try {
    // 1. Get current package
    const [existing] = await conn.query(
      'SELECT * FROM user_packages WHERE id = ? FOR UPDATE', [user_package_id]
    );
    if (!existing.length) {
      return { success: false, error: 'Package subscription not found' };
    }
    const currentPkg = existing[0];
    if (currentPkg.package_status === 'renewed') return { success: false, error: 'This package was already renewed' };

    // Check if upgrading/downgrading
    let targetPackageId = currentPkg.package_id;
    let packageName = '';
    if (package_id && package_id !== currentPkg.package_id) {
      const [newPkgCheck] = await conn.query('SELECT id, name FROM packages WHERE id = ?', [package_id]);
      if (!newPkgCheck.length) {
        return { success: false, error: 'New package not found for upgrade/downgrade' };
      }
      targetPackageId = package_id;
      packageName = newPkgCheck[0].name;
    } else {
      const [pkgInfo] = await conn.query('SELECT name FROM packages WHERE id = ?', [currentPkg.package_id]);
      packageName = pkgInfo.length ? pkgInfo[0].name : '';
    }

    // Mark current as renewed
    await conn.query(
      `UPDATE user_packages SET package_status = 'renewed', renewed_at = NOW() WHERE id = ?`,
      [user_package_id]
    );

    // Calculate new end_date: extend from current end_date if still active, else from NOW
    let duration_months = 12;
    try {
      const [pkgDetails] = await conn.query('SELECT package_validity FROM packages WHERE id = ?', [targetPackageId]);
      if (pkgDetails.length && pkgDetails[0].package_validity !== null && pkgDetails[0].package_validity !== undefined) {
        duration_months = pkgDetails[0].package_validity;
      }
    } catch (pvErr) {
      console.warn('package_validity column not found (safe to ignore):', pvErr.message);
    }

    let baseDate = new Date();
    if (currentPkg.package_status === 'active' && currentPkg.end_date && new Date(currentPkg.end_date) > new Date()) {
      baseDate = new Date(currentPkg.end_date);
    }

    // Insert renewed package — use only core columns (safe for any DB schema)
    const [newResult] = await conn.query(
      `INSERT INTO user_packages
       (user_id, package_id, start_date, end_date, renewed_from_id, payment_status, package_status, price_paid, vehicle_segment, vehicle_id, franchise_id)
       VALUES (?, ?, NOW(), DATE_ADD(?, INTERVAL ? MONTH), ?, 'paid', 'active', ?, ?, ?, ?)`,
      [
        currentPkg.user_id, targetPackageId,
        baseDate, duration_months, user_package_id,
        payment_amount !== undefined ? payment_amount : currentPkg.price_paid, 
        currentPkg.vehicle_segment, currentPkg.vehicle_id, (Number(currentPkg.franchise_id) || 1)
      ]
    );
    const newUserPackageId = newResult.insertId;

    // Create fresh usage rows for the renewed package
    const serviceBreakdown = await getServiceBreakdown(conn, targetPackageId, packageName);

    for (const svc of serviceBreakdown) {
      await conn.query(
        'INSERT INTO package_usage (user_package_id, service_name, used_count, usage_status) VALUES (?, ?, 0, ?)',
        [newUserPackageId, svc.service_name, 'available']
      );
    }

    // Generate service-wise scheduled dates for renewed package
    await generatePackageSchedules(conn, newUserPackageId, currentPkg.user_id, targetPackageId, baseDate, duration_months);

    // Log the renewal event in v2_package_renewals (non-blocking)
    try {
      await conn.query(
        `INSERT INTO v2_package_renewals
         (customer_id, package_id, customer_package_id, renewal_date, amount_paid, payment_id, renewed_by, notes)
         VALUES (?, ?, ?, CURDATE(), ?, ?, ?, ?)`,
        [
          currentPkg.user_id, targetPackageId, newUserPackageId,
          payment_amount !== undefined ? payment_amount : currentPkg.price_paid,
          payment_id || null,
          renewed_by,
          notes || `Renewed package subscription from ID ${user_package_id}`
        ]
      );
    } catch (renewLogErr) {
      console.warn('Failed to log renewal event (non-blocking):', renewLogErr.message);
    }

    // Trigger non-blocking WhatsApp/SMS confirmations
    try {
      const messagingService = require('../services/messagingService');
      const [custRows] = await conn.query('SELECT name, mobile FROM users WHERE id = ?', [currentPkg.user_id]);
      if (custRows.length && custRows[0].mobile) {
        const vehicleStr = currentPkg.vehicle_segment ? ` for your vehicle segment ${currentPkg.vehicle_segment.replace(/_/g, ' ')}` : '';
        const body = `✅ *Package Renewed Successfully!*\n\nHi ${custRows[0].name},\nYour *${packageName}* package${vehicleStr} has been renewed successfully!\n\nThank you for choosing O3 Car Spaa! 💎`;
        messagingService.sendWhatsApp(`91${custRows[0].mobile}`, null, { body }).catch(() => {});
      }
    } catch (msgErr) {
      console.warn('Failed to send renewal WhatsApp message:', msgErr.message);
    }

    return {
      success: true,
      data: { id: newUserPackageId, renewed_from: user_package_id }
    };
  } catch (err) {
    console.error('_renewPackageInternal error:', err);
    return { success: false, error: 'Database transaction error in package renewal' };
  }
};

// ═══════════════════════════════════════════════════════════
// RENEW PACKAGE (Route Handler)
// POST /user-packages/:id/renew
// ═══════════════════════════════════════════════════════════
exports.renewPackage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { duration_months = 12, payment_amount, price_paid, vehicle_segment, new_package_id, payment_mode, payment_id, notes } = req.body;

    // Lock the package row so "Renew" tapped twice at the same moment renews once.
    const [existing] = await conn.query('SELECT * FROM user_packages WHERE id = ? FOR UPDATE', [id]);
    const myFid = Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
    if (!existing.length || (req.user.role !== 'super_admin' && req.user.role !== 'customer' && Number(existing[0].franchise_id || 1) !== myFid)) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Package subscription not found' });
    }
    const currentPkg = existing[0];
    if (['renewed', 'cancelled'].includes(currentPkg.package_status)) {
      await conn.rollback();
      return res.status(409).json({ success: false, error: currentPkg.package_status === 'renewed' ? 'This package was already renewed' : 'This package is cancelled' });
    }

    // Check if customer is renewing their own package
    if (req.user.role === 'customer' && currentPkg.user_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Forbidden: You do not own this package subscription' });
    }

    const amount = Number(payment_amount !== undefined ? payment_amount : (price_paid !== undefined ? price_paid : currentPkg.price_paid));
    if (!Number.isFinite(amount) || amount < 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Enter a valid amount (0 or more)' });
    }
    const mode = require('../services/moneyIn').toPaymentMethod(payment_mode);
    let dbPaymentId = payment_id || null;

    // Record the payment (cash / UPI / card at the studio)
    if (amount > 0) {
      const [pmtResult] = await conn.query(
        `INSERT INTO v2_payments 
         (customer_id, booking_id, invoice_id, package_id, amount, payment_method, status, notes)
         VALUES (?, NULL, NULL, ?, ?, ?, 'captured', ?)`,
        [currentPkg.user_id, new_package_id || currentPkg.package_id, amount, mode, notes || 'Offline package renewal']
      );
      dbPaymentId = pmtResult.insertId;
      
      // Log transaction too
      await conn.query(
        `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status) VALUES (?, 'credit', ?, 'success')`,
        [dbPaymentId, amount]
      );
    }
    // Accounts entry for the renewal (Payments row above)
    await require('../services/moneyIn').recordMoneyIn(conn, {
      amount, type: 'package_sale', refId: id, skipPayment: true, note: `Package renewal #${id} (${mode})`,
      franchiseId: Number(req.franchiseId) || Number(req.user?.franchise_id) || 1, userId: req.user.id,
    });

    const renewed_by = req.user.role === 'admin' ? 'admin' : 'customer';

    const renResult = await exports._renewPackageInternal(conn, {
      user_package_id: id,
      package_id: new_package_id,
      payment_amount: amount,
      payment_mode: mode,
      payment_id: dbPaymentId,
      renewed_by,
      notes: notes || `Package renewed via ${mode}`
    });

    if (!renResult.success) {
      await conn.rollback();
      return res.status(400).json(renResult);
    }

    await conn.commit();
    res.status(201).json({
      success: true,
      data: renResult.data,
      message: 'Package renewed successfully'
    });
  } catch (err) {
    await conn.rollback();
    console.error('Renew package error:', err);
    res.status(500).json({ success: false, error: 'Failed to renew package' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// BULK RENEW PACKAGES (Multi-car)
// POST /user-packages/bulk-renew
// ═══════════════════════════════════════════════════════════
exports.bulkRenewPackages = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { package_ids, duration_months = 12, price_paid, new_package_id } = req.body;
    
    if (!Array.isArray(package_ids) || package_ids.length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'package_ids array is required' });
    }
    const amount = Number(price_paid || 0);
    if (!Number.isFinite(amount) || amount < 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Enter a valid amount (0 or more)' });
    }
    const [owners] = await conn.query('SELECT DISTINCT user_id FROM user_packages WHERE id IN (?)', [package_ids]);
    if (owners.length !== 1) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Bulk renew works for the packages of one customer at a time' });
    }

    const renewedPackages = [];

    // Create a shared payment record for bulk offline payment (saved under the customer, not the admin)
    let paymentId = null;
    if (amount > 0) {
      const [pmtResult] = await conn.query(
        `INSERT INTO v2_payments 
         (customer_id, booking_id, invoice_id, package_id, amount, payment_method, status, notes)
         VALUES (?, NULL, NULL, NULL, ?, 'cash', 'captured', ?)`,
        [owners[0].user_id, amount, `Bulk package renewal for ${package_ids.length} packages`]
      );
      paymentId = pmtResult.insertId;
      
      await conn.query(
        `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status) VALUES (?, 'credit', ?, 'success')`,
        [paymentId, amount]
      );
    }
    await require('../services/moneyIn').recordMoneyIn(conn, {
      amount, type: 'package_sale', refId: paymentId, skipPayment: true, note: `Bulk package renewal (${package_ids.length})`,
      franchiseId: Number(req.franchiseId) || Number(req.user?.franchise_id) || 1, userId: req.user.id,
    });

    for (const id of package_ids) {
      const individualPrice = price_paid ? (price_paid / package_ids.length) : undefined;
      const renResult = await exports._renewPackageInternal(conn, {
        user_package_id: id,
        package_id: new_package_id,
        payment_amount: individualPrice,
        payment_mode: 'cash',
        payment_id: paymentId,
        renewed_by: 'admin',
        notes: 'Bulk package renewal'
      });
      
      if (renResult.success) {
        renewedPackages.push({ old_id: id, new_id: renResult.data.id });
      }
    }

    await conn.commit();
    res.status(201).json({ success: true, data: renewedPackages, message: 'Packages renewed successfully' });
  } catch (err) {
    await conn.rollback();
    console.error('Bulk renew error:', err);
    res.status(500).json({ success: false, error: 'Failed to renew packages' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// GET RENEWALS HISTORY
// GET /user-packages/renewals
// ═══════════════════════════════════════════════════════════
exports.getRenewalsHistory = async (req, res) => {
  try {
    const userId = req.user.role === 'admin' && req.query.user_id
      ? req.query.user_id
      : req.user.id;

    const [rows] = await pool.query(
      `SELECT r.*, p.name AS package_name
       FROM v2_package_renewals r
       JOIN packages p ON r.package_id = p.id
       WHERE r.customer_id = ?
       ORDER BY r.renewal_date DESC, r.id DESC`,
      [userId]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get renewals history error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch renewals history' });
  }
};

// ═══════════════════════════════════════════════════════════
// CHECK SERVICE AVAILABILITY (read-only — for deferred deduction)
// Does NOT reserve or deduct. Just checks if customer can use a service.
// ═══════════════════════════════════════════════════════════
/**
 * Looks at EVERY active package of the customer (this car's first, then ones not tied to a car)
 * and returns the first one that has this service. A customer with two cars / two packages
 * no longer gets "not included" just because the newest package was checked.
 */
async function findPackageForService(conn, userId, serviceName, vehicleId, preferId) {
  let queryStr = `
     SELECT up.id, up.package_id, p.name AS package_name
     FROM user_packages up
     JOIN packages p ON p.id = up.package_id
     WHERE up.user_id = ? AND up.package_status = 'active'
       AND (up.end_date IS NULL OR up.end_date > NOW())
  `;
  const params = [userId];
  if (vehicleId) {
    queryStr += ' AND (up.vehicle_id = ? OR up.vehicle_id IS NULL)';
    params.push(vehicleId);
  }
  queryStr += ' ORDER BY (up.id = ?) DESC, (up.vehicle_id IS NOT NULL) DESC, up.end_date ASC';
  params.push(Number(preferId) || 0);
  const [activePackages] = await conn.query(queryStr, params);
  if (!activePackages.length) return { none: true };

  const req = (serviceName || '').toLowerCase().trim();
  let firstMatch = null;
  for (const pk of activePackages) {
    const breakdown = await getServiceBreakdown(conn, pk.package_id, pk.package_name);
    const entry = breakdown.find(s => s.service_name.toLowerCase().trim() === req)
      || breakdown.find(s => {
        const dbName = s.service_name.toLowerCase();
        return dbName.includes(req) || req.includes(dbName);
      });
    if (!entry) continue;
    const [usage] = await conn.query(
      'SELECT used_count FROM package_usage WHERE user_package_id = ? AND service_name = ?',
      [pk.id, entry.service_name]
    );
    const left = entry.total_count - (usage.length ? usage[0].used_count : 0);
    const hit = { pk, entry, left };
    if (left > 0) return hit;
    if (!firstMatch) firstMatch = hit;
  }
  return firstMatch || { notIncluded: true };
}
exports.findPackageForService = findPackageForService;

exports.checkServiceAvailability = async (conn, userId, serviceName, vehicleId, preferId) => {
  const found = await findPackageForService(conn, userId, serviceName, vehicleId, preferId);
  if (found.none) {
    return { has_package: false, can_use: false, remaining: 0, reason: 'No active package found for this car' };
  }
  if (found.notIncluded) {
    return { has_package: true, can_use: false, remaining: 0, reason: `Service not included in this car's package: ${serviceName}` };
  }
  const userPackageId = found.pk.id;
  const packageName = found.pk.package_name;
  const serviceEntry = found.entry;

  const canonicalServiceName = serviceEntry.service_name;

  const totalCount = serviceEntry.total_count;

  // Get used_count (read-only — no FOR UPDATE)
  const [usage] = await conn.query(
    'SELECT used_count FROM package_usage WHERE user_package_id = ? AND service_name = ?',
    [userPackageId, canonicalServiceName]
  );

  const usedCount = usage.length ? usage[0].used_count : 0;
  const remaining = totalCount - usedCount;

  if (remaining <= 0) {
    return { has_package: true, can_use: false, remaining: 0, reason: 'No remaining credits for this service' };
  }

  return {
    has_package: true,
    can_use: true,
    remaining: remaining,
    package_name: packageName,
    user_package_id: userPackageId,
    canonical_service_name: canonicalServiceName,
  };
};

// ═══════════════════════════════════════════════════════════
// CHECK & RESERVE SERVICE (booking-time)
// Does NOT consume — only reserves. Consumed after job completion.
// ═══════════════════════════════════════════════════════════
exports.checkAndUseService = async (conn, userId, serviceName, vehicleId, preferId) => {
  const found = await findPackageForService(conn, userId, serviceName, vehicleId, preferId);
  if (found.none) return { has_package: false, can_use: false, remaining: 0 };
  if (found.notIncluded) return { has_package: true, can_use: false, remaining: 0, reason: 'Service not in package' };
  const userPackageId = found.pk.id;
  const packageName = found.pk.package_name;
  const serviceEntry = found.entry;

  const canonicalServiceName = serviceEntry.service_name;

  const totalCount = serviceEntry.total_count;

  // Get used_count (lock row)
  const [usage] = await conn.query(
    'SELECT id, used_count FROM package_usage WHERE user_package_id = ? AND service_name = ? FOR UPDATE',
    [userPackageId, canonicalServiceName]
  );

  const usedCount = usage.length ? usage[0].used_count : 0;
  const remaining = totalCount - usedCount;

  if (remaining <= 0) {
    return { has_package: true, can_use: false, remaining: 0, reason: 'No remaining credits' };
  }

  if (usage.length) {
    await conn.query(
      'UPDATE package_usage SET used_count = used_count + 1 WHERE id = ?',
      [usage[0].id]
    );
  } else {
    await conn.query(
      'INSERT INTO package_usage (user_package_id, service_name, used_count) VALUES (?, ?, 1)',
      [userPackageId, canonicalServiceName]
    );
  }

  return {
    has_package: true,
    can_use: true,
    remaining: remaining - 1,
    package_name: packageName,
    user_package_id: userPackageId,
    canonical_service_name: canonicalServiceName,
  };
};

// ═══════════════════════════════════════════════════════════
// CONSUME SERVICE (after job card completion)
// ═══════════════════════════════════════════════════════════
exports.consumeService = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { user_package_id, service_name, booking_id, job_card_id } = req.body;

    if (!user_package_id || !service_name) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'user_package_id and service_name required' });
    }

    const [usage] = await conn.query(
      "SELECT id FROM package_usage WHERE user_package_id = ? AND service_name = ? AND usage_status = 'reserved' FOR UPDATE",
      [user_package_id, service_name]
    );

    if (!usage.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'No reserved usage found' });
    }

    await conn.query(
      `UPDATE package_usage SET usage_status = 'consumed', consumed_at = NOW(),
       booking_id = ?, job_card_id = ? WHERE id = ?`,
      [booking_id || null, job_card_id || null, usage[0].id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Service usage consumed' });
  } catch (err) {
    await conn.rollback();
    console.error('Consume service error:', err);
    res.status(500).json({ success: false, error: 'Failed to consume service' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// CANCEL RESERVATION (release usage on booking cancel)
// ═══════════════════════════════════════════════════════════
exports.cancelReservation = async (conn, userPackageId, serviceName) => {
  try {
    await conn.query(
      `UPDATE package_usage
       SET used_count = GREATEST(0, used_count - 1)
       WHERE user_package_id = ? AND service_name = ?
       LIMIT 1`,
      [userPackageId, serviceName]
    );
    return true;
  } catch (err) {
    console.error('Cancel reservation error:', err);
    return false;
  }
};

// ═══════════════════════════════════════════════════════════
// GET ACTIVE PACKAGE
// ═══════════════════════════════════════════════════════════
exports.getActivePackage = async (req, res) => {
  try {
    const userId = req.user.role === 'admin' && req.query.user_id
      ? req.query.user_id
      : req.user.id;
    const { vehicle_id } = req.query;

    let queryStr = `
      SELECT up.id, up.package_id, up.start_date, up.end_date,
             up.package_status, up.payment_status, up.price_paid,
             up.vehicle_segment, up.renewed_from_id, up.vehicle_id,
             p.name AS package_name, p.description, p.wash_count, p.wax_count
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      WHERE up.user_id = ? AND up.package_status = 'active'
        AND (up.end_date IS NULL OR up.end_date > NOW())
    `;
    const params = [userId];
    if (vehicle_id) {
      queryStr += ' AND (up.vehicle_id = ? OR up.vehicle_id IS NULL)';
      params.push(vehicle_id);
    }
    const wantAll = req.query.all === '1' || req.query.all === 'true';
    queryStr += ' ORDER BY (up.vehicle_id IS NOT NULL) DESC, up.start_date DESC' + (wantAll ? '' : ' LIMIT 1');

    const [packages] = await pool.query(queryStr, params);

    if (!packages.length) {
      return res.json({ success: true, data: wantAll ? [] : null, message: 'No active package' });
    }

    // ?all=1 → every active package (one per car), each with services used / left
    if (wantAll) {
      const list = [];
      for (const pk of packages) {
        const map = await getServiceBreakdown(pool, pk.package_id, pk.package_name);
        const [used] = await pool.query('SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?', [pk.id]);
        const [[veh]] = await pool.query('SELECT brand, model, registration_no FROM vehicles WHERE id = ?', [pk.vehicle_id || 0]);
        list.push({
          ...pk, vehicle: veh || null,
          usage: map.map(sv => { const u = used.find(x => x.service_name === sv.service_name); const n = u ? u.used_count : 0;
            return { service_name: sv.service_name, total_count: sv.total_count, used_count: n, remaining: sv.total_count - n }; }),
          days_remaining: pk.end_date ? Math.max(0, calendarDaysLeft(pk.end_date)) : null,
        });
      }
      return res.json({ success: true, data: list });
    }

    const activePackage = packages[0];

    // Build usage data
    const serviceMap = await getServiceBreakdown(pool, activePackage.package_id, activePackage.package_name);
    const [usageRows] = await pool.query(
      'SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?',
      [activePackage.id]
    );

    const usage = serviceMap.map(svc => {
      const row = usageRows.find(u => u.service_name === svc.service_name);
      const usedCount = row ? row.used_count : 0;
      return {
        service_name: svc.service_name,
        total_count: svc.total_count,
        used_count: usedCount,
        remaining: svc.total_count - usedCount,
        complimentary: svc.complimentary || 0,
        display_order: svc.display_order || 0
      };
    });

    // Calculate days remaining
    const daysRemaining = activePackage.end_date
      ? Math.max(0, calendarDaysLeft(activePackage.end_date))
      : null;

    res.json({
      success: true,
      data: { ...activePackage, usage, days_remaining: daysRemaining },
    });
  } catch (err) {
    console.error('Get active package error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch active package' });
  }
};

// ═══════════════════════════════════════════════════════════
// PACKAGE HISTORY (all packages for a user)
// ═══════════════════════════════════════════════════════════
exports.listUserPackages = async (req, res, next) => {
  try {
    const userId = req.user.role === 'admin' && req.query.user_id
      ? req.query.user_id
      : req.user.id;

    const [packages] = await pool.query(`
      SELECT up.id, up.package_id, up.start_date, up.end_date, up.created_at,
             up.package_status, up.payment_status, up.price_paid,
             up.vehicle_segment, up.renewed_from_id, up.renewed_at, up.vehicle_id, up.cancel_reason,
             (SELECT registration_no FROM vehicles WHERE id = up.vehicle_id) AS vehicle_reg_no,
             p.name AS package_name, p.description
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      WHERE up.user_id = ?
      ORDER BY up.created_at DESC
    `, [userId]);

    for (const pkg of packages) {
      const serviceMap = await getServiceBreakdown(pool, pkg.package_id, pkg.package_name);
      const [usageRows] = await pool.query(
        'SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?',
        [pkg.id]
      );
      pkg.usage = serviceMap.map(svc => {
        const row = usageRows.find(u => u.service_name === svc.service_name);
        const usedCount = row ? row.used_count : 0;
        return {
          service_name: svc.service_name,
          total_count: svc.total_count,
          used_count: usedCount,
          remaining: svc.total_count - usedCount,
          complimentary: svc.complimentary || 0,
          display_order: svc.display_order || 0
        };
      });

      // Calculate days remaining
      pkg.days_remaining = pkg.end_date
        ? Math.max(0, calendarDaysLeft(pkg.end_date))
        : null;
    }

    res.json({ success: true, data: packages });
  } catch (err) {
    next(err);
  }
};

// ═══════════════════════════════════════════════════════════
// EXPORT PACKAGE HISTORY (EXCEL)
// GET /user-packages/export
// ═══════════════════════════════════════════════════════════
exports.exportUserPackages = async (req, res, next) => {
  try {
    const isAdmin = ['admin', 'super_admin'].includes(req.user.role);
    const userId = isAdmin && req.query.user_id ? req.query.user_id : req.user.id;
    if ((req.query.format || 'excel') === 'pdf') {
      if (isAdmin && req.query.user_id) { // admin: same checks (franchise scope) as the customer page button
        req.params.id = req.query.user_id;
        return require('./reportsController').customerPackageHistoryReport(req, res);
      }
      const pdf = await require('./reportsController').packageStatementPdf(userId, Number(req.user.franchise_id) || 1);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', 'attachment; filename=Package_History.pdf');
      return res.send(pdf);
    }

    const [packages] = await pool.query(`
      SELECT up.id, up.package_id, up.start_date, up.end_date, up.created_at,
             up.package_status, up.payment_status, up.price_paid,
             up.vehicle_segment, up.renewed_from_id, up.renewed_at,
             p.name AS package_name, p.description
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      WHERE up.user_id = ?
      ORDER BY up.created_at DESC
    `, [userId]);

    const format = req.query.format || 'excel';

    for (const pkg of packages) {
      const serviceMap = await getServiceBreakdown(pool, pkg.package_id, pkg.package_name);
      const [usageRows] = await pool.query(
        'SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?',
        [pkg.id]
      );
      
      let usageStr = [];
      for (const svc of serviceMap) {
        const row = usageRows.find(u => u.service_name === svc.service_name);
        const usedCount = row ? row.used_count : 0;
        usageStr.push(`${svc.service_name}: ${usedCount}/${svc.total_count}`);
      }
      pkg.usage_detail = usageStr.join(' | ');
    }

    {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      const sheet = workbook.addWorksheet('Package History');

      sheet.columns = [
        { header: 'Package Name', key: 'package_name', width: 25 },
        { header: 'Status', key: 'package_status', width: 15 },
        { header: 'Payment Status', key: 'payment_status', width: 15 },
        { header: 'Price Paid', key: 'price_paid', width: 15 },
        { header: 'Start Date', key: 'start_date', width: 20 },
        { header: 'End Date', key: 'end_date', width: 20 },
        { header: 'Vehicle Segment', key: 'vehicle_segment', width: 15 },
        { header: 'Usage Detail', key: 'usage_detail', width: 60 },
      ];

      for (const pkg of packages) {
        sheet.addRow({
          package_name: pkg.package_name,
          package_status: pkg.package_status,
          payment_status: pkg.payment_status,
          price_paid: pkg.price_paid,
          start_date: pkg.start_date ? new Date(pkg.start_date).toLocaleDateString() : '',
          end_date: pkg.end_date ? new Date(pkg.end_date).toLocaleDateString() : '',
          vehicle_segment: pkg.vehicle_segment,
          usage_detail: pkg.usage_detail
        });
      }

      res.setHeader(
        'Content-Type',
        'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
      );
      res.setHeader(
        'Content-Disposition',
        'attachment; filename=Package_History.xlsx'
      );

      await workbook.xlsx.write(res);
      res.end();
    }
  } catch (err) {
    console.error('Export user packages error:', err);
    res.status(500).json({ success: false, error: 'Failed to export package history' });
  }
};

// ═══════════════════════════════════════════════════════════
// DASHBOARD PACKAGE DATA
// ═══════════════════════════════════════════════════════════
exports.getDashboardPackageData = async (userId) => {
  let primaryCar = [];
  try {
    [primaryCar] = await pool.query(
      'SELECT id, brand, model, registration_no FROM vehicles WHERE customer_id = ? AND is_primary = 1 LIMIT 1',
      [userId]
    );
  } catch (e) {
    // is_primary column may not exist — fallback below
  }
  // Fallback: if no primary car found, get the first car for this customer
  if (!primaryCar.length) {
    try {
      [primaryCar] = await pool.query(
        'SELECT id, brand, model, registration_no FROM vehicles WHERE customer_id = ? ORDER BY created_at ASC LIMIT 1',
        [userId]
      );
    } catch (e) { /* ignore */ }
  }

  const [activePackages] = await pool.query(`
    SELECT up.id, up.package_id, up.start_date, up.end_date,
           up.package_status, up.price_paid, up.vehicle_id,
           p.name AS package_name, p.description,
           v.brand AS vehicle_brand, v.model AS vehicle_model, v.registration_no AS vehicle_reg_no
    FROM user_packages up
    JOIN packages p ON up.package_id = p.id
    LEFT JOIN vehicles v ON up.vehicle_id = v.id
    WHERE up.user_id = ? AND up.package_status = 'active'
      AND (up.end_date IS NULL OR up.end_date > NOW())
    ORDER BY up.start_date DESC
  `, [userId]);

  const processedPackages = [];
  for (const pkg of activePackages) {
    const serviceMap = await getServiceBreakdown(pool, pkg.package_id, pkg.package_name);
    const [usageRows] = await pool.query(
      'SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?',
      [pkg.id]
    );

    const endDate = pkg.end_date ? new Date(pkg.end_date) : null;
    const daysRemaining = endDate
      ? calendarDaysLeft(endDate)
      : null;

    let reminderStage = null;
    let reminderLabel = null;
    let isPopupEligible = false;

    if (daysRemaining !== null) {
      if (daysRemaining <= 30 && daysRemaining > 7) {
        reminderStage = '1_month';
        reminderLabel = '1 Month Before Reminder (11 Months Mark)';
        isPopupEligible = true;
      } else if (daysRemaining <= 7 && daysRemaining > 1) {
        reminderStage = '1_week';
        reminderLabel = '1 Week Before Reminder';
        isPopupEligible = true;
      } else if (daysRemaining === 1 || daysRemaining === 0) {
        reminderStage = '1_day';
        reminderLabel = '1 Day Before Reminder';
        isPopupEligible = true;
      } else {
        reminderStage = 'due_expired';
        reminderLabel = 'Service Due / Package Expired';
        isPopupEligible = false; // After 1 day reminder, no more pop-ups
      }
    }

    const formatDateStr = (d) => d ? d.toISOString().split('T')[0] : null;
    const autodate1Month = endDate ? formatDateStr(new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)) : null;
    const autodate1Week = endDate ? formatDateStr(new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)) : null;
    const autodate1Day = endDate ? formatDateStr(new Date(endDate.getTime() - 1 * 24 * 60 * 60 * 1000)) : null;

    const formattedEndDate = endDate ? endDate.toLocaleDateString('en-IN') : '';
    const vehicleInfo = pkg.vehicle_reg_no ? `for vehicle ${pkg.vehicle_reg_no}` : '';
    const popupMessage = `Your ${pkg.package_name} package ${vehicleInfo} is about to expire next month (${formattedEndDate}). Kindly visit O3 Car Spaa to redeem your remaining service sessions!`;
    const continuousNotification = (daysRemaining !== null && daysRemaining <= 30) ? `service is due package close to expiry` : null;

    const serviceSchedules = await getSchedulesForUserPackage(pool, pkg.id, pkg.user_id, pkg.package_id, pkg.start_date);

    processedPackages.push({
      ...pkg,
      usage: serviceMap.map(svc => {
        const row = usageRows.find(u => u.service_name === svc.service_name);
        const usedCount = row ? row.used_count : 0;
        return {
          service_name: svc.service_name,
          total_count: svc.total_count,
          paid: svc.paid || 0,
          used_count: usedCount,
          remaining: svc.total_count - usedCount,
          complimentary: svc.complimentary || 0,
          display_order: svc.display_order || 0
        };
      }),
      service_schedules: serviceSchedules,
      days_remaining: daysRemaining,
      reminder_stage: reminderStage,
      reminder_label: reminderLabel,
      is_popup_eligible: isPopupEligible,
      popup_message: popupMessage,
      continuous_notification: continuousNotification,
      autodate_1month: autodate1Month,
      autodate_1week: autodate1Week,
      autodate_1day: autodate1Day,
    });
  }

  return {
    primary_car: primaryCar[0] || null,
    active_package: processedPackages[0] || null,
    active_packages: processedPackages,
  };
};

// ═══════════════════════════════════════════════════════════
// CANCEL A CUSTOMER'S PACKAGE (kept for history; credits can no longer be used)
// ═══════════════════════════════════════════════════════════
exports.cancelUserPackage = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const reason = String(req.body.reason || '').trim();
    if (!reason) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Write the reason for cancelling' }); }
    const [[up]] = await conn.query('SELECT id, package_status FROM user_packages WHERE id = ? FOR UPDATE', [req.params.id]);
    if (!up) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Package not found' }); }
    if (up.package_status !== 'active') { await conn.rollback(); return res.status(400).json({ success: false, error: `Only an active package can be cancelled (this one is ${up.package_status})` }); }
    await conn.query(
      "UPDATE user_packages SET package_status = 'cancelled', cancelled_at = NOW(), cancel_reason = ?, cancelled_by = ? WHERE id = ?",
      [reason.slice(0, 255), req.user.id, up.id]);
    // upcoming visits of this package are stopped too
    await conn.query(
      "UPDATE package_service_schedules SET status = 'cancelled' WHERE user_package_id = ? AND status = 'pending'", [up.id]);
    const [open] = await conn.query(
      "SELECT id FROM bookings WHERE user_package_id = ? AND status IN ('pending_approval','confirmed')", [up.id]);
    await conn.commit();
    res.json({ success: true, message: 'Package cancelled', open_bookings: open.map(b => b.id) });
  } catch (err) {
    await conn.rollback();
    console.error('Cancel user package error:', err);
    res.status(500).json({ success: false, error: 'Failed to cancel package' });
  } finally { conn.release(); }
};

// ═══════════════════════════════════════════════════════════
// EXPIRE CHECK (called by cron)
// ═══════════════════════════════════════════════════════════
exports.expirePackages = async () => {
  try {
    const [result] = await pool.query(
      `UPDATE user_packages SET package_status = 'expired'
       WHERE package_status = 'active' AND end_date IS NOT NULL AND end_date <= NOW()`
    );
    if (result.affectedRows > 0) {
      console.log(`[CRON] Expired ${result.affectedRows} package(s)`);
    }
    return result.affectedRows;
  } catch (err) {
    console.error('Expire packages error:', err);
    return 0;
  }
};

// ═══════════════════════════════════════════════════════════
// GET ALL USER PACKAGES (Admin only)
// ═══════════════════════════════════════════════════════════
exports.getAllUserPackages = async (req, res) => {
  try {
    const activeFranchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;
    const { status, search } = req.query;
    let query = `
      SELECT up.id, up.package_id, up.user_id, up.start_date, up.end_date, up.created_at,
             up.package_status, up.payment_status, up.price_paid,
             up.vehicle_segment, up.renewed_from_id, up.renewed_at,
             up.cancelled_at, up.cancel_reason, p.is_active AS plan_active,
             p.name AS package_name, p.description,
             u.name AS customer_name, u.mobile AS customer_mobile,
             v.brand AS vehicle_brand, v.model AS vehicle_model, v.registration_no AS vehicle_reg_no
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      JOIN users u ON up.user_id = u.id
      LEFT JOIN vehicles v ON up.vehicle_id = v.id
      WHERE (up.franchise_id = ? OR (up.franchise_id IS NULL AND ? = 1) OR u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
    `;
    const params = [activeFranchiseId, activeFranchiseId, activeFranchiseId, activeFranchiseId];

    if (status) {
      query += ` AND up.package_status = ?`;
      params.push(status);
    }

    if (search) {
      query += ` AND (u.name LIKE ? OR u.mobile LIKE ? OR v.registration_no LIKE ? OR p.name LIKE ?)`;
      params.push(`%${search}%`, `%${search}%`, `%${search}%`, `%${search}%`);
    }

    query += ` ORDER BY up.created_at DESC`;

    const [packages] = await pool.query(query, params);

    for (const pkg of packages) {
      let serviceMap = [];
      let usageRows = [];
      try {
        serviceMap = await getServiceBreakdown(pool, pkg.package_id, pkg.package_name);
        [usageRows] = await pool.query(
          'SELECT service_name, used_count FROM package_usage WHERE user_package_id = ?',
          [pkg.id]
        );
      } catch (err) {
        console.warn(`Failed usage load for user package ID ${pkg.id}:`, err.message);
      }

      pkg.usage = serviceMap.map(svc => {
        const row = usageRows.find(u => u.service_name === svc.service_name);
        const usedCount = row ? row.used_count : 0;
        return {
          service_name: svc.service_name,
          total_count: svc.total_count,
          used_count: usedCount,
          remaining: svc.total_count - usedCount,
          complimentary: svc.complimentary || 0,
          display_order: svc.display_order || 0
        };
      });

      const endDate = pkg.end_date ? new Date(pkg.end_date) : null;
      const daysRemaining = endDate
        ? calendarDaysLeft(endDate)
        : null;

      let reminderStage = null;
      let reminderLabel = null;
      let isPopupEligible = false;

      if (daysRemaining !== null) {
        if (daysRemaining <= 30 && daysRemaining > 7) {
          reminderStage = '1_month';
          reminderLabel = '1 Month Before Reminder (11 Months Mark)';
          isPopupEligible = true;
        } else if (daysRemaining <= 7 && daysRemaining > 1) {
          reminderStage = '1_week';
          reminderLabel = '1 Week Before Reminder';
          isPopupEligible = true;
        } else if (daysRemaining === 1 || daysRemaining === 0) {
          reminderStage = '1_day';
          reminderLabel = '1 Day Before Reminder';
          isPopupEligible = true;
        } else {
          reminderStage = 'due_expired';
          reminderLabel = 'Service Due / Package Expired';
          isPopupEligible = false;
        }
      }

      const formatDateStr = (d) => d ? d.toISOString().split('T')[0] : null;

      pkg.days_remaining = daysRemaining;
      pkg.reminder_stage = reminderStage;
      pkg.reminder_label = reminderLabel;
      pkg.is_popup_eligible = isPopupEligible;
      pkg.continuous_notification = (daysRemaining !== null && daysRemaining <= 30) ? `service is due package close to expiry` : null;
      pkg.autodate_1month = endDate ? formatDateStr(new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000)) : null;
      pkg.autodate_1week = endDate ? formatDateStr(new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000)) : null;
      pkg.autodate_1day = endDate ? formatDateStr(new Date(endDate.getTime() - 1 * 24 * 60 * 60 * 1000)) : null;
    }

    res.json({ success: true, data: packages });
  } catch (err) {
    console.error('Get all user packages error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch all user packages' });
  }
};

exports.adjustCredits = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { id } = req.params;
    const { service_name, new_used_count } = req.body;

    if (!service_name || new_used_count === undefined) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'service_name and new_used_count are required' });
    }

    // The used count must be a whole number from 0 up to what the package gives for this service
    const [[upRow]] = await conn.query('SELECT package_id FROM user_packages WHERE id = ?', [id]);
    if (!upRow) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Package not found' });
    }
    const svcList = await getServiceBreakdown(conn, upRow.package_id, null);
    const svc = svcList.find(s => String(s.service_name).toLowerCase() === String(service_name).toLowerCase());
    if (!svc) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: `${service_name} is not part of this package` });
    }
    const maxCount = Number(svc.total_count) || 0;
    const usedNum = Number(new_used_count);
    if (!Number.isInteger(usedNum) || usedNum < 0 || usedNum > maxCount) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: `Used count must be a whole number from 0 to ${maxCount}` });
    }

    // 1. Get current used count
    const [usage] = await conn.query(
      'SELECT id, used_count FROM package_usage WHERE user_package_id = ? AND service_name = ? FOR UPDATE',
      [id, service_name]
    );

    let oldUsedCount = 0;
    if (usage.length) {
      oldUsedCount = usage[0].used_count;
      await conn.query(
        'UPDATE package_usage SET used_count = ? WHERE id = ?',
        [new_used_count, usage[0].id]
      );
    } else {
      // Insert new usage row
      await conn.query(
        'INSERT INTO package_usage (user_package_id, service_name, used_count) VALUES (?, ?, ?)',
        [id, service_name, new_used_count]
      );
    }

    // Log the adjustment event in v2_audit_logs
    await conn.query(
      `INSERT INTO v2_audit_logs (user_id, user_type, action, resource, resource_id, old_value, new_value)
       VALUES (?, 'admin', 'adjust_package_credits', 'user_package', ?, ?, ?)`,
      [
        req.user.id,
        id,
        JSON.stringify({ used_count: oldUsedCount }),
        JSON.stringify({ used_count: new_used_count })
      ]
    );

    await conn.commit();
    res.json({ success: true, message: `Successfully adjusted credits for ${service_name} to ${new_used_count}` });
  } catch (err) {
    await conn.rollback();
    console.error('Adjust credits error:', err);
    res.status(500).json({ success: false, error: 'Failed to adjust package credits' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// PACKAGE EXPIRY ALERTS (expiring within 30 days)
// GET /user-packages/expiry-alerts
// ═══════════════════════════════════════════════════════════
exports.getExpiryAlerts = async (req, res) => {
  try {
    const activeFranchiseId = req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1;

    const [rows] = await pool.query(`
      SELECT 
        up.id AS user_package_id,
        up.user_id,
        up.start_date,
        up.end_date,
        up.package_id,
        up.vehicle_segment,
        up.vehicle_id,
        up.price_paid,
        p.name AS package_name,
        u.name AS customer_name,
        u.mobile AS customer_mobile,
        u.email AS customer_email,
        v.registration_no,
        v.brand,
        v.model,
        DATEDIFF(up.end_date, NOW()) AS days_remaining,
        up.last_reminder_at, up.reminder_count, up.last_reminder_stage, up.package_status
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      JOIN users u ON up.user_id = u.id
      LEFT JOIN vehicles v ON up.vehicle_id = v.id
      WHERE up.package_status IN ('active', 'expired')
        AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_deleted, 0) = 0
        AND up.end_date IS NOT NULL
        AND up.end_date <= DATE_ADD(NOW(), INTERVAL 30 DAY)
        AND up.end_date >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        AND NOT EXISTS (SELECT 1 FROM user_packages n WHERE n.renewed_from_id = up.id)
        AND (up.franchise_id = ? OR (up.franchise_id IS NULL AND ? = 1) OR u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
      ORDER BY up.end_date ASC
    `, [activeFranchiseId, activeFranchiseId, activeFranchiseId, activeFranchiseId]);

    const formatDateStr = (d) => d ? d.toISOString().split('T')[0] : null;

    const enriched = rows.map(r => {
      const days = r.days_remaining;
      const endDate = new Date(r.end_date);
      const formattedEndDate = endDate.toLocaleDateString('en-IN');

      const autodate_1month = formatDateStr(new Date(endDate.getTime() - 30 * 24 * 60 * 60 * 1000));
      const autodate_1week = formatDateStr(new Date(endDate.getTime() - 7 * 24 * 60 * 60 * 1000));
      const autodate_1day = formatDateStr(new Date(endDate.getTime() - 1 * 24 * 60 * 60 * 1000));

      let reminder_stage = '1_month';
      let reminder_label = '1 Month Before Reminder (11 Months Mark)';
      let is_popup_eligible = true;

      if (days <= 0) {
        reminder_stage = 'due_expired';
        reminder_label = 'Service Due / Package Expired';
        is_popup_eligible = false; // After 1 day reminder, no more pop-ups
      } else if (days <= 1) {
        reminder_stage = '1_day';
        reminder_label = '1 Day Before Reminder';
      } else if (days <= 7) {
        reminder_stage = '1_week';
        reminder_label = '1 Week Before Reminder';
      } else if (days <= 15) {
        reminder_stage = '15_days';
        reminder_label = '15 Days Before Reminder';
      } else {
        reminder_stage = '1_month';
        reminder_label = '1 Month Before Reminder (11 Months Mark)';
      }

      const vehicleStr = r.registration_no ? `${r.registration_no} (${r.brand || ''} ${r.model || ''})` : 'your vehicle';
      const whatsapp_msg = `Hi ${r.customer_name},\n\nYour *${r.package_name}* package for *${vehicleStr}* ${days > 0 ? `ends on *${formattedEndDate}* (${days} day(s) left).\n\nPlease use your remaining services or renew.` : `ended on *${formattedEndDate}*.\n\nPlease renew to keep getting your services.`}\n📍 O3 Car Spaa, GIDC, Anand\n📞 7225030303`;

      return {
        ...r,
        reminder_stage,
        reminder_label,
        is_popup_eligible,
        continuous_notification: `service is due package close to expiry`,
        autodate_1month,
        autodate_1week,
        autodate_1day,
        whatsapp_message: whatsapp_msg,
        whatsapp_url: `https://wa.me/91${r.customer_mobile}?text=${encodeURIComponent(whatsapp_msg)}`
      };
    });

    res.json({ success: true, data: enriched });
  } catch (err) {
    console.error('getExpiryAlerts error:', err.message);
    res.json({ success: true, data: [] });
  }
};

/**
 * generatePackageSchedules — Generates individual service schedule dates across package validity
 */
async function generatePackageSchedules(conn, userPackageId, userId, packageId, startDate = new Date(), durationMonths = 12) {
  try {
    let validity = durationMonths || 12;
    try {
      const [pInfo] = await conn.query('SELECT package_validity FROM packages WHERE id = ?', [packageId]);
      if (pInfo.length && pInfo[0].package_validity) {
        validity = pInfo[0].package_validity;
      }
    } catch (e) {}

    const serviceBreakdown = await getServiceBreakdown(conn, packageId);
    const start = new Date(startDate);

    for (const ps of serviceBreakdown) {
      const count = parseInt(ps.total_count) || 1;
      const intervalMonths = count > 1 ? Math.max(1, Math.floor(validity / count)) : 0;

      for (let i = 1; i <= count; i++) {
        const schedDate = new Date(start);
        if (i > 1 && intervalMonths > 0) {
          schedDate.setMonth(schedDate.getMonth() + (i - 1) * intervalMonths);
        }
        const dateStr = schedDate.toISOString().slice(0, 10);

        await conn.query(
          `INSERT INTO package_service_schedules (user_package_id, user_id, service_name, instance_number, scheduled_date, status)
           VALUES (?, ?, ?, ?, ?, 'pending')
           ON DUPLICATE KEY UPDATE scheduled_date = VALUES(scheduled_date)`,
          [userPackageId, userId, ps.service_name, i, dateStr]
        );
      }
    }
  } catch (err) {
    console.warn('generatePackageSchedules warning:', err.message);
  }
}
exports.generatePackageSchedules = generatePackageSchedules;

/**
 * getSchedulesForUserPackage — Helper to fetch (or auto-generate) service-wise schedules
 */
async function getSchedulesForUserPackage(connOrPool, userPackageId, userId, packageId, startDate) {
  try {
    let [rows] = await connOrPool.query(
      `SELECT id, user_package_id, user_id, service_name, instance_number, scheduled_date, status, completed_at,
              DATE_SUB(scheduled_date, INTERVAL 30 DAY) AS reminder_date_1m,
              DATE_SUB(scheduled_date, INTERVAL 7 DAY) AS reminder_date_1w,
              DATE_SUB(scheduled_date, INTERVAL 1 DAY) AS reminder_date_1d
       FROM package_service_schedules
       WHERE user_package_id = ?
       ORDER BY scheduled_date ASC, instance_number ASC`,
      [userPackageId]
    );

    if (rows.length === 0) {
      if (!userId || !packageId) {
        const [upInfo] = await connOrPool.query('SELECT user_id, package_id, start_date FROM user_packages WHERE id = ?', [userPackageId]);
        if (upInfo.length) {
          userId = userId || upInfo[0].user_id;
          packageId = packageId || upInfo[0].package_id;
          startDate = startDate || upInfo[0].start_date;
        }
      }

      if (userId && packageId) {
        await generatePackageSchedules(connOrPool, userPackageId, userId, packageId, startDate || new Date());
        const [newRows] = await connOrPool.query(
          `SELECT id, user_package_id, user_id, service_name, instance_number, scheduled_date, status, completed_at,
                  DATE_SUB(scheduled_date, INTERVAL 30 DAY) AS reminder_date_1m,
                  DATE_SUB(scheduled_date, INTERVAL 7 DAY) AS reminder_date_1w,
                  DATE_SUB(scheduled_date, INTERVAL 1 DAY) AS reminder_date_1d
           FROM package_service_schedules
           WHERE user_package_id = ?
           ORDER BY scheduled_date ASC, instance_number ASC`,
          [userPackageId]
        );
        rows = newRows;
      }
    }

    return rows.map(r => ({
      ...r,
      scheduled_date_formatted: r.scheduled_date ? new Date(r.scheduled_date).toLocaleDateString('en-IN') : null,
      reminder_1m_formatted: r.reminder_date_1m ? new Date(r.reminder_date_1m).toLocaleDateString('en-IN') : null,
    }));
  } catch (err) {
    console.warn('getSchedulesForUserPackage warning:', err.message);
    return [];
  }
}
exports.getSchedulesForUserPackage = getSchedulesForUserPackage;

/**
 * GET /user-packages/:userPackageId/schedules
 */
exports.getPackageServiceSchedules = async (req, res) => {
  try {
    const { userPackageId } = req.params;
    // A customer may only see their own package's visits
    if (req.user.role === 'customer') {
      const [[own]] = await pool.query('SELECT id FROM user_packages WHERE id = ? AND user_id = ?', [userPackageId, req.user.id]);
      if (!own) return res.status(404).json({ success: false, error: 'Package not found' });
    }
    const rows = await getSchedulesForUserPackage(pool, userPackageId);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getPackageServiceSchedules error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};




// ─── Expiry reminder sent (admin) — remembered so the screen can show "sent · next in X days" ───
exports.markReminderSent = async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE user_packages SET last_reminder_at = NOW(), reminder_count = reminder_count + 1 WHERE id = ?', [req.params.userPackageId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, error: 'Package not found' });
    res.json({ success: true, message: 'Reminder recorded' });
  } catch (err) {
    console.error('Mark reminder error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ═══════════════════════════════════════════════════════════
// PACKAGE RENEWAL REMINDERS — 30, 15, 7 and 1 day before, and on expiry.
// Each stage is sent once (last_reminder_stage). If the server was off on the day,
// the next run still sends the stage that is now due, so nothing is missed.
// ═══════════════════════════════════════════════════════════
const REMINDER_STAGES = [
  { key: 'expired', max: 0 },
  { key: '1d', max: 1 },
  { key: '7d', max: 7 },
  { key: '15d', max: 15 },
  { key: '30d', max: 30 },
];
const stageFor = (days) => (REMINDER_STAGES.find(s => days <= s.max) || {}).key || null;
exports.reminderStageFor = stageFor;

exports.runPackageReminders = async () => {
  await exports.expirePackages();
  const [rows] = await pool.query(`
    SELECT up.id, up.user_id, up.vehicle_id, up.package_id, up.end_date, up.package_status, up.last_reminder_stage,
           up.franchise_id, p.name AS package_name, u.name, u.mobile, v.registration_no,
           DATEDIFF(DATE(up.end_date), CURDATE()) AS days_left
    FROM user_packages up
    JOIN packages p ON p.id = up.package_id
    JOIN users u ON u.id = up.user_id
    LEFT JOIN vehicles v ON v.id = up.vehicle_id
    WHERE up.end_date IS NOT NULL AND u.mobile IS NOT NULL
      AND COALESCE(u.is_active, 1) = 1 AND COALESCE(u.is_deleted, 0) = 0
      AND up.package_status IN ('active', 'expired')
      AND DATE(up.end_date) <= DATE_ADD(CURDATE(), INTERVAL 30 DAY)
      AND DATE(up.end_date) >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      AND NOT EXISTS (SELECT 1 FROM user_packages n WHERE n.renewed_from_id = up.id)`);
  let sent = 0;
  for (const r of rows) {
    const days = Number(r.days_left);
    const stage = stageFor(days);
    if (!stage || r.last_reminder_stage === stage) continue;
    // Already sent the expired one → nothing more.
    if (r.last_reminder_stage === 'expired') continue;
    const car = r.registration_no ? ` for ${r.registration_no}` : '';
    const end = new Date(r.end_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
    const body = stage === 'expired'
      ? `Hi ${r.name}, your package "${r.package_name}"${car} ended on ${end}. Renew it at O3 Car Spaa to keep getting your services. Call 7225030303.`
      : `Hi ${r.name}, your package "${r.package_name}"${car} ends on ${end} (${days === 1 ? '1 day' : days + ' days'} left). Please use your remaining services or renew. Call 7225030303. - O3 Car Spaa`;
    try {
      await require('../services/notificationService').notify({
        customerId: r.user_id, customMessageBody: body, channels: ['whatsapp'],
        eventTrigger: 'PACKAGE_EXPIRY_REMINDER', franchiseId: r.franchise_id || 1,
        referenceType: 'user_package', referenceId: r.id,
      });
      await pool.query(
        'UPDATE user_packages SET last_reminder_stage = ?, last_reminder_at = NOW(), reminder_count = COALESCE(reminder_count,0) + 1 WHERE id = ?',
        [stage, r.id]);
      sent++;
    } catch (e) { console.error('[PackageReminder] failed for', r.id, e.message); }
  }
  return sent;
};

// POST /user-packages/expiry-alerts/send-now — admin runs the reminders straight away
exports.sendRemindersNow = async (req, res, next) => {
  try { res.json({ success: true, data: { sent: await exports.runPackageReminders() } }); }
  catch (err) { next(err); }
};

exports.calendarDaysLeft = calendarDaysLeft;
