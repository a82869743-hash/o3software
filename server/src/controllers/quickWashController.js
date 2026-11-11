/**
 * ═══════════════════════════════════════════════════════════
 * QUICK WASH CONTROLLER
 * ═══════════════════════════════════════════════════════════
 * Handles quick wash bookings without full job card workflow.
 * Uses bookings table with job_type = 'quick_wash'.
 */

const pool = require('../config/db');
const { guessCarCategory } = require('../utils/carCategory');
const { validateRegNo, normalizeMobile, isValidMobile } = require('../utils/validators');
const referralService = require('../services/referralService');

/** When a quick wash is completed: referral earning becomes payable + feedback request on WhatsApp. */
async function onQuickWashCompleted(bookingId) {
  try {
    const [[b]] = await pool.query(
      `SELECT b.*, u.name AS customer_name, u.mobile FROM bookings b LEFT JOIN users u ON u.id = b.customer_id WHERE b.id = ?`, [bookingId]);
    if (!b) return;
    await pool.query(
      "UPDATE referral_ledger SET status = 'unpaid', bill_amount = ?, amount = IF(reward_type = 'percent', ROUND(? * reward_rate / 100, 2), amount) WHERE source_type = 'quick_wash' AND source_id = ? AND status = 'pending'",
      [b.total_amount || 0, b.total_amount || 0, bookingId]
    );
    if (b.customer_id && b.mobile) {
      const crypto = require('crypto');
      const [[existing]] = await pool.query('SELECT id FROM v2_review_requests WHERE booking_id = ? LIMIT 1', [bookingId]);
      if (!existing) {
        const token = crypto.randomBytes(32).toString('hex');
        await pool.query(
          "INSERT INTO v2_review_requests (customer_id, booking_id, sent_via, status, feedback_token, franchise_id) VALUES (?, ?, 'whatsapp', 'sent', ?, ?)",
          [b.customer_id, bookingId, token, b.franchise_id || 1]
        );
        const url = `${process.env.CLIENT_URL || 'http://localhost:5173'}/feedback/${token}`;
        require('../services/notificationService').notify({
          customerId: b.customer_id, channels: ['whatsapp'], referenceType: 'quick_wash', referenceId: bookingId,
          franchiseId: b.franchise_id || 1, idempotencyKey: `feedback_qw_${bookingId}`,
          customMessageBody: `Thank you for choosing O3 Car Spaa! Your ${b.vehicle_brand || ''} ${b.vehicle_model || ''} wash is complete. Please rate your experience: ${url}`,
        }).catch(() => {});
      }
    }
  } catch (e) {
    console.error('[QuickWash] completion hook failed:', e.message);
  }
}

// ─── CREATE QUICK WASH ──────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      customer_id, vehicle_id, service_id, package_id,
      vehicle_category, use_package, notes
    } = req.body;

    const rawReg = req.body.vehicle_reg_no || req.body.registration_no || req.body.reg_no || req.body.regNo || '';
    const rawBrand = req.body.vehicle_brand || req.body.car_brand || req.body.brand || null;
    const rawModel = req.body.vehicle_model || req.body.car_model || req.body.model || null;

    let resolvedCustomerId = customer_id || null;
    let resolvedVehicleId = vehicle_id || null;
    let resolvedBrand = rawBrand;
    let resolvedModel = rawModel;
    const regCheck = validateRegNo(rawReg);
    if (!vehicle_id && !regCheck.valid) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: regCheck.error });
    }
    let resolvedRegNo = regCheck.valid ? regCheck.value : null;
    const franchiseId = req.franchiseId || req.user?.franchise_id || 1;

    // Existing vehicle → its owner is the customer
    if (!resolvedCustomerId && resolvedRegNo) {
      const [[veh]] = await conn.query('SELECT customer_id FROM vehicles WHERE registration_no = ?', [resolvedRegNo]);
      if (veh) resolvedCustomerId = veh.customer_id;
    }

    // Walk-in: find by mobile or create (no password — the customer activates with an OTP)
    if (!resolvedCustomerId) {
      if (!isValidMobile(req.body.customer_mobile)) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Enter a valid 10-digit customer mobile number' });
      }
      const custMobile = normalizeMobile(req.body.customer_mobile);
      const custName = String(req.body.customer_name || '').trim();
      if (!custName) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Customer name is required' }); }
      const [existingUser] = await conn.query('SELECT id, role FROM users WHERE mobile = ?', [custMobile]);
      if (existingUser.length) {
        if (existingUser[0].role !== 'customer') {
          await conn.rollback();
          return res.status(409).json({ success: false, error: 'This mobile belongs to a staff/admin account' });
        }
        resolvedCustomerId = existingUser[0].id;
      } else {
        const [newUser] = await conn.query(
          "INSERT INTO users (name, mobile, password_hash, role, franchise_id) VALUES (?, ?, 'manual', 'customer', ?)",
          [custName.slice(0, 100), custMobile, franchiseId]
        );
        resolvedCustomerId = newUser.insertId;
        await conn.query('INSERT IGNORE INTO loyalty (customer_id) VALUES (?)', [resolvedCustomerId]);
      }
    }

    // Resolve vehicle by registration or vehicle_id
    if (resolvedVehicleId && !resolvedBrand) {
      const [vRows] = await conn.query(
        'SELECT id, brand, model, registration_no, customer_id FROM vehicles WHERE id = ?', [resolvedVehicleId]
      );
      if (vRows.length) {
        resolvedBrand = vRows[0].brand;
        resolvedModel = vRows[0].model;
        resolvedRegNo = vRows[0].registration_no;
        if (!resolvedCustomerId) resolvedCustomerId = vRows[0].customer_id;
      }
    } else if (resolvedRegNo && !resolvedVehicleId) {
      const [vRows] = await conn.query(
        'SELECT id, brand, model, registration_no, customer_id FROM vehicles WHERE registration_no = ?', [resolvedRegNo]
      );
      if (vRows.length) {
        resolvedVehicleId = vRows[0].id;
        if (!resolvedBrand) resolvedBrand = vRows[0].brand;
        if (!resolvedModel) resolvedModel = vRows[0].model;
        if (!resolvedCustomerId) resolvedCustomerId = vRows[0].customer_id;
      } else {
        const [newVeh] = await conn.query(
          'INSERT INTO vehicles (customer_id, brand, model, registration_no, category) VALUES (?, ?, ?, ?, ?)',
          [resolvedCustomerId, resolvedBrand || 'Unknown', resolvedModel || 'Unknown', resolvedRegNo, vehicle_category || guessCarCategory(resolvedBrand, resolvedModel) || 'sedan']
        );
        resolvedVehicleId = newVeh.insertId;
      }
    }

    // Validate
    if (!resolvedCustomerId && !resolvedRegNo) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Customer or vehicle registration is required' });
    }


    // Get or create a "walk-in" slot for today
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let [existingSlots] = await conn.query(
      "SELECT id FROM slots WHERE slot_date = ? AND start_time = '00:00:00' AND end_time = '23:59:59' AND franchise_id = ? LIMIT 1",
      [today, franchiseId]
    );

    let slotId;
    if (existingSlots.length) {
      slotId = existingSlots[0].id;
    } else {
      const [slotResult] = await conn.query(
        "INSERT INTO slots (franchise_id, slot_date, start_time, end_time, max_capacity, booked_count) VALUES (?, ?, '00:00:00', '23:59:59', 999, 0)",
        [franchiseId, today]
      );
      slotId = slotResult.insertId;
    }

    // Calculate queue position
    const [queueRows] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM bookings WHERE job_type = 'quick_wash' AND wash_status IN ('pending','washing') AND DATE(created_at) = CURDATE() AND franchise_id = ?", [franchiseId]
    );
    const queuePosition = (queueRows[0]?.cnt || 0) + 1;

    // Sanitize vehicle_category to valid ENUM values
    const safeCategory = require('../utils/carCategory').normalizeCarType(vehicle_category);

    // Handle package usage
    let packageUsed = false;
    let packageInfo = null;
    let actualPackageId = package_id || null;

    if (use_package && service_id && resolvedCustomerId) {
      const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [service_id]);
      if (svcRows.length) {
        const serviceName = svcRows[0].name;
        const userPkgCtrl = require('./userPackagesController');
        const result = await userPkgCtrl.checkAndUseService(conn, resolvedCustomerId, serviceName);

        if (result.can_use) {
          packageUsed = true;
          actualPackageId = result.user_package_id; // Store user_package_id or package_id depending on how it's referenced
          
          packageInfo = {
            package_name: result.package_name,
            service_name: serviceName,
            remaining: result.remaining,
          };
        }
      }
    }

    // Fetch service price for category
    let originalPrice = 0;
    if (service_id) {
      const cat = safeCategory || 'sedan';
      const priceCol = `price_${cat}`;
      const [svcRows] = await conn.query(
        `SELECT price_hatchback, price_semi_sedan, price_sedan, price_premium_sedan, price_suv, price_premium_suv FROM services WHERE id = ?`,
        [service_id]
      );
      if (svcRows.length) {
        originalPrice = Number(svcRows[0][priceCol]) || Number(svcRows[0].price_sedan) || 0;
      }
    }
    // Price typed by the studio on the quick wash form wins over the list price
    if (req.body.price !== undefined && req.body.price !== '' && Number(req.body.price) >= 0) originalPrice = Number(req.body.price);

    // First wash 50% discount check
    const { checkFirstWashEligibility } = require('../utils/firstWashHelper');
    let discountPercent = 0.00;
    let discountAmount = 0.00;
    let totalAmount = originalPrice;

    if (resolvedCustomerId && !packageUsed) {
      const fwCheck = await checkFirstWashEligibility(conn, resolvedCustomerId);
      if (fwCheck.isEligible) {
        discountPercent = 50.00;
        discountAmount = Math.round(originalPrice * 0.50 * 100) / 100;
        totalAmount = Math.max(0, originalPrice - discountAmount);
      }
    }

    // Insert quick wash booking
    const [result] = await conn.query(`
      INSERT INTO bookings
        (customer_id, vehicle_id, slot_id, service_id, package_id,
         vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category,
         job_type, status, wash_status, queue_position, notes, discount_percent, discount_amount, total_amount, franchise_id)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quick_wash', 'confirmed', 'pending', ?, ?, ?, ?, ?, ?)
    `, [
      resolvedCustomerId, resolvedVehicleId, slotId, service_id || null, actualPackageId,
      resolvedBrand, resolvedModel, resolvedRegNo, safeCategory,
      queuePosition, notes || null, discountPercent, discountAmount, totalAmount, franchiseId
    ]);

    const referrer = await referralService.resolveReferrer(conn, req.body, franchiseId, resolvedCustomerId);
    if (referrer) {
      const [[cust]] = await conn.query('SELECT name FROM users WHERE id = ?', [resolvedCustomerId]);
      await referralService.syncForSource(conn, {
        sourceType: 'quick_wash', sourceId: result.insertId, franchiseId, referrer,
        referredCustomerId: resolvedCustomerId, referredCustomerName: cust?.name, billAmount: totalAmount,
        finalised: false, label: `Quick wash #${result.insertId} — ${resolvedRegNo || ''}`, userId: req.user.id,
      });
    }

    // Increment slot count
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [slotId]);

    await conn.commit();

    // Socket notification
    const io = req.app.get('io');
    if (io) {
      io.to('internal').emit('quick_wash_created', { bookingId: result.insertId, queuePosition });
    }

    res.status(201).json({
      success: true,
      data: { 
        id: result.insertId, 
        queue_position: queuePosition,
        package_used: packageUsed,
        ...(packageInfo && { package_info: packageInfo })
      },
      message: packageUsed
        ? `Quick wash booked — Queue #${queuePosition} (Used ${packageInfo?.package_name})`
        : `Quick wash booked — Queue #${queuePosition}`,
    });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Quick wash create error:', err.message, err.sql || '');
    res.status(500).json({ success: false, error: 'Failed to create quick wash booking' });
  } finally {
    conn.release();
  }
};

// ─── LIST QUICK WASHES ──────────────────────
exports.list = async (req, res) => {
  try {
    const { status, date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = "b.job_type = 'quick_wash'";
    if (!req.isGlobalAdmin) where += ` AND b.franchise_id = ${Number(req.franchiseId) || 1}`;
    const params = [];

    if (status && status !== 'all') {
      where += ' AND b.wash_status = ?';
      params.push(status);
    }

    if (date) {
      where += ' AND DATE(b.created_at) = ?';
      params.push(date);
    } else {
      // Default to today
      where += ' AND DATE(b.created_at) = CURDATE()';
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM bookings b WHERE ${where}`, params
    );

    const [rows] = await pool.query(`
      SELECT b.*,
        u.name AS customer_name, u.mobile AS customer_mobile,
        svc.name AS service_name,
        v.brand AS linked_vehicle_brand, v.model AS linked_vehicle_model,
        v.registration_no AS linked_vehicle_reg_no
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      WHERE ${where}
      ORDER BY b.queue_position ASC, b.created_at ASC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    const enriched = rows.map(r => ({
      ...r,
      vehicle_brand: r.linked_vehicle_brand || r.vehicle_brand,
      vehicle_model: r.linked_vehicle_model || r.vehicle_model,
      vehicle_reg_no: r.linked_vehicle_reg_no || r.vehicle_reg_no,
    }));

    res.json({
      success: true,
      data: enriched,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('Quick wash list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE WASH STATUS ─────────────────────
exports.updateStatus = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const rawStatus = (req.body.wash_status || req.body.status || '').toLowerCase().trim();
    const statusMap = {
      'waiting': 'pending',
      'in_queue': 'pending',
      'pending': 'pending',
      'in_progress': 'washing',
      'washing': 'washing',
      'done': 'completed',
      'completed': 'completed',
      'delivered': 'delivered',
      'cancelled': 'cancelled',
      'canceled': 'cancelled',
    };
    const targetStatus = statusMap[rawStatus];
    if (!targetStatus) {
      await conn.rollback();
      return res.status(400).json({ 
        success: false, 
        error: `Invalid status "${req.body.wash_status || req.body.status}". Valid options: waiting, pending, in_progress, washing, completed, delivered, cancelled` 
      });
    }

    const [existing] = await conn.query(
      "SELECT * FROM bookings WHERE id = ? AND (job_type = 'quick_wash' OR job_type IS NULL OR job_type = 'standard' OR job_type = 'wash')", [id]
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Quick wash booking not found' });
    }

    const updates = { wash_status: targetStatus };
    if (targetStatus === 'completed') {
      updates.status = 'completed';
      updates.current_phase = 'complete';
    } else if (targetStatus === 'cancelled') {
      updates.status = 'cancelled';

      // Restore package usage if quick wash used a package service
      if (existing[0].package_id && existing[0].service_id) {
        try {
          const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [existing[0].service_id]);
          if (svcRows.length) {
            const serviceName = svcRows[0].name;
            const { cancelReservation } = require('./userPackagesController');
            const [userPkgs] = await conn.query(
              `SELECT id FROM user_packages 
               WHERE user_id = ? AND (id = ? OR package_id = ?) AND package_status = 'active'
               ORDER BY start_date DESC LIMIT 1`,
              [existing[0].customer_id, existing[0].package_id, existing[0].package_id]
            );
            if (userPkgs.length) {
              await cancelReservation(conn, userPkgs[0].id, serviceName);
              console.log(`[QUICK_WASH] Package credit restored for cancelled booking #${id} — service: ${serviceName}`);
            }
          }
        } catch (pkgErr) {
          console.error(`[QUICK_WASH] Failed to restore package credit for booking #${id}:`, pkgErr.message);
        }
      }
    } else if (targetStatus === 'washing') {
      updates.status = 'in_progress';
      if (!existing[0].current_phase || existing[0].current_phase === 'complete') {
        updates.current_phase = 'pre_wash';
      }
    } else if (targetStatus === 'pending') {
      updates.status = 'confirmed';
    } else if (targetStatus === 'delivered') {
      updates.status = 'delivered';
    }

    const setClauses = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    await conn.query(
      `UPDATE bookings SET ${setClauses} WHERE id = ?`,
      [...values, id]
    );

    // Money: a finished wash is paid at the studio → Payments + Accounts (once)
    if (targetStatus === 'completed' && existing[0].status !== 'completed' && existing[0].status !== 'delivered') {
      await require('../services/moneyIn').recordMoneyIn(conn, {
        customerId: existing[0].customer_id, amount: existing[0].total_amount, method: req.body.payment_method || 'cash',
        type: 'quick_wash', refId: Number(id), bookingId: Number(id), note: `Quick wash QW-${id}`,
        franchiseId: existing[0].franchise_id || 1, userId: req.user.id,
      });
    }

    // If wash completed, check first wash discount or award 10% loyalty points from 2nd wash onward
    if (targetStatus === 'completed') {
      const [bRows] = await conn.query('SELECT customer_id, total_amount, discount_percent FROM bookings WHERE id = ?', [id]);
      if (bRows.length && bRows[0].customer_id) {
        const { markFirstWashDiscountUsed } = require('../utils/firstWashHelper');
        const { awardPointsInternal } = require('./loyaltyController');
        const bk = bRows[0];

        if (bk.discount_percent > 0) {
          await markFirstWashDiscountUsed(conn, bk.customer_id);
          console.log(`[FIRST_WASH] Marked 50% first wash discount used for customer #${bk.customer_id}`);
        } else {
          // Award 10% loyalty points starting from 2nd wash
          await awardPointsInternal(conn, bk.customer_id, Number(bk.total_amount || 0), 'quick_wash', parseInt(id), req.user ? req.user.id : null);
        }
      }
    }

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('internal').emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: targetStatus });
      if (existing[0].customer_id) io.to(`user_${existing[0].customer_id}`).emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: targetStatus });
    }
    if (targetStatus === 'completed') { onQuickWashCompleted(parseInt(id)); awardQuickWash(parseInt(id), req); }
    if (targetStatus === 'cancelled') referralService.cancelForSource(pool, 'quick_wash', parseInt(id)).catch(() => {});
    {
    }

    res.json({ success: true, message: `Wash status updated to ${targetStatus}`, wash_status: targetStatus });
  } catch (err) {
    await conn.rollback();
    console.error('Quick wash status update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update status' });
  } finally {
    conn.release();
  }
};

// ─── QUEUE STATS ────────────────────────────
exports.queueStats = async (req, res) => {
  try {
    const [stats] = await pool.query(`
      SELECT
        COUNT(CASE WHEN wash_status = 'pending' THEN 1 END) AS pending_count,
        COUNT(CASE WHEN wash_status = 'washing' THEN 1 END) AS washing_count,
        COUNT(CASE WHEN wash_status = 'completed' THEN 1 END) AS completed_count,
        COUNT(CASE WHEN wash_status = 'delivered' THEN 1 END) AS delivered_count,
        COUNT(*) AS total_today
      FROM bookings
      WHERE job_type = 'quick_wash' AND DATE(created_at) = CURDATE()${req.isGlobalAdmin ? '' : ` AND franchise_id = ${Number(req.franchiseId) || 1}`}
    `);

    res.json({ success: true, data: stats[0] });
  } catch (err) {
    console.error('Quick wash stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET INVOICE ────────────────────────────
exports.getInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const [[qw]] = await pool.query("SELECT id, customer_id, status FROM bookings WHERE id = ? AND job_type = 'quick_wash'", [id]);
    if (!qw || (req.user.role === 'customer' && Number(qw.customer_id) !== Number(req.user.id))) {
      return res.status(404).json({ success: false, error: 'Quick wash not found' });
    }
    if (req.user.role === 'customer' && !['completed', 'delivered'].includes(qw.status)) {
      return res.status(400).json({ success: false, error: 'The invoice is ready once the wash is finished' });
    }
    const { generateQuickWashInvoicePDF } = require('../services/invoiceService');
    const result = await generateQuickWashInvoicePDF(id);
    const pdfBuffer = result?.pdfBuffer || result;
    const invoiceNumber = result?.invoiceNumber || `QuickWash-Invoice-${id}`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${invoiceNumber}.pdf"`);
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Generate Quick Wash Invoice error:', err);
    res.status(500).json({ success: false, error: err.message || 'Failed to generate invoice' });
  }
};

// ─── UPDATE WASH PHASE ─────────────────────
exports.updatePhase = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { phase } = req.body;

    const validPhases = ['pre_wash', 'foam_apply', 'pressure_rinse', 'interior_clean', 'dry_polish', 'complete'];
    if (!validPhases.includes(phase)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: `Invalid phase. Must be: ${validPhases.join(', ')}` });
    }

    const [existing] = await conn.query(
      "SELECT id FROM bookings WHERE id = ? AND (job_type = 'quick_wash' OR job_type IS NULL OR job_type = 'standard' OR job_type = 'wash')", [id]
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Quick wash booking not found' });
    }

    const updates = {
      current_phase: phase,
      phase_updated_at: new Date(),
    };

    if (phase === 'complete') {
      updates.wash_status = 'completed';
      updates.status = 'completed';
    } else {
      updates.wash_status = 'washing';
    }

    const setClauses = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    await conn.query(
      `UPDATE bookings SET ${setClauses} WHERE id = ?`,
      [...values, id]
    );

    await conn.commit();

    const io = req.app.get('io');
    if (io) {
      io.to('internal').emit('wash:phase_updated', { bookingId: parseInt(id), phase, timestamp: updates.phase_updated_at });
      if (existing && existing[0] && existing[0].customer_id) io.to(`user_${existing[0].customer_id}`).emit('wash:phase_updated', { bookingId: parseInt(id), phase });
      if (phase === 'complete') {
        onQuickWashCompleted(parseInt(id));
        awardQuickWash(parseInt(id), req);
        io.to('internal').emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: 'completed' });
      } else {
        io.to('internal').emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: 'washing' });
      }
    }

    res.json({ success: true, message: `Wash phase updated to ${phase}` });
  } catch (err) {
    await conn.rollback();
    console.error('Quick wash phase update error:', err);
    res.status(500).json({ success: false, error: 'Failed to update phase' });
  } finally {
    conn.release();
  }
};

// ─── GET WASH PHASE ────────────────────────
exports.getPhase = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      `SELECT id, current_phase, phase_updated_at, wash_status FROM bookings WHERE id = ? AND (job_type = 'quick_wash' OR job_type IS NULL OR job_type = 'standard' OR job_type = 'wash')${req.user?.role === 'customer' ? ' AND customer_id = ?' : ''}`,
      req.user?.role === 'customer' ? [id, req.user.id] : [id]
    );
    if (!rows.length) {
      return res.status(404).json({ success: false, error: 'Quick wash booking not found' });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Get quick wash phase error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * Washing incentive for a finished quick wash. Washers come from the request (worked_by: [ids]), else the
 * ones saved earlier, else the staff member who marked it done. Admin can change them later (PUT /:id/worked-by).
 */
async function awardQuickWash(id, req) {
  try {
    const engine = require('../services/incentiveEngine');
    const [[b]] = await pool.query('SELECT id, franchise_id, service_id, cart_items_json, vehicle_category, worked_by_json, completed_at FROM bookings WHERE id = ?', [id]);
    if (!b) return;
    let workers = Array.isArray(req.body?.worked_by) ? req.body.worked_by : null;
    if (!workers) { try { workers = JSON.parse(b.worked_by_json || 'null'); } catch (_) { workers = null; } }
    if (!workers || !workers.length) workers = ['staff', 'manager'].includes(req.user?.role) ? [req.user.id] : [];
    workers = [...new Set(workers.map(Number).filter(Boolean))];
    // only this studio's active staff count
    if (workers.length) {
      const [ok] = await pool.query("SELECT id FROM users WHERE id IN (?) AND franchise_id = ? AND role IN ('staff','manager') AND is_active = 1", [workers, b.franchise_id || 1]);
      workers = ok.map(u => u.id);
    }
    await pool.query('UPDATE bookings SET worked_by_json = ? WHERE id = ?', [workers.length ? JSON.stringify(workers) : null, id]);

    let names = [];
    try { names = (JSON.parse(b.cart_items_json || '[]') || []).map(i => i.name || i.service_name).filter(Boolean); } catch (_) { /* no cart */ }
    const [svcs] = await pool.query('SELECT name, incentive_type FROM services WHERE id = ? OR name IN (?)', [b.service_id || 0, names.length ? names : ['']]);
    let types = svcs.map(engine.typeOfService).filter(Boolean);
    if (!types.length) types = ['washing'];            // a quick wash is a wash
    await engine.awardForVehicle(pool, {
      franchiseId: b.franchise_id || 1, bookingId: Number(id), workerIds: workers, types,
      vehicleClass: engine.vehicleClassOf(b.vehicle_category), when: b.completed_at || new Date(),
    });
  } catch (err) {
    console.error('[incentive] quick wash', id, err.message);
  }
}

// PUT /quick-wash/:id/worked-by { worked_by: [staffIds] } — who washed it (recalculates their incentive)
exports.setWorkedBy = async (req, res) => {
  try {
    const [[b]] = await pool.query("SELECT id, wash_status, franchise_id FROM bookings WHERE id = ?", [req.params.id]);
    if (!b || (req.user.role !== 'super_admin' && Number(b.franchise_id || 1) !== Number(req.franchiseId || req.user.franchise_id || 1))) {
      return res.status(404).json({ success: false, error: 'Quick wash not found' });
    }
    if (!Array.isArray(req.body.worked_by)) return res.status(400).json({ success: false, error: 'Choose who washed the car' });
    if (['completed', 'delivered'].includes(b.wash_status)) await awardQuickWash(b.id, req);
    else await pool.query('UPDATE bookings SET worked_by_json = ? WHERE id = ?', [JSON.stringify(req.body.worked_by.map(Number).filter(Boolean)), b.id]);
    res.json({ success: true, message: 'Saved' });
  } catch (err) {
    console.error('setWorkedBy error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SET PRICE (studio sets / changes the price of a quick wash, e.g. a walk-in with no service) ─
exports.setPrice = async (req, res) => {
  try {
    const price = Number(req.body.price);
    if (!(price >= 0)) return res.status(400).json({ success: false, error: 'Enter a valid price' });
    const [[bk]] = await pool.query("SELECT id, discount_percent, status, customer_id, franchise_id FROM bookings WHERE id = ? AND job_type = 'quick_wash'", [req.params.id]);
    if (!bk) return res.status(404).json({ success: false, error: 'Quick wash not found' });
    if (req.user.role !== 'super_admin' && Number(bk.franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1)) {
      return res.status(404).json({ success: false, error: 'Quick wash not found' });
    }
    if (['completed', 'delivered'].includes(bk.status) && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'This wash is finished and paid. Only an admin can change its price.' });
    }
    if (['cancelled', 'rejected'].includes(bk.status)) return res.status(422).json({ success: false, error: `This wash is ${bk.status}` });
    // first-wash discount (if it was given) stays as a percent of the new price
    const discount = Math.round(price * (Number(bk.discount_percent) || 0)) / 100;
    const total = Math.max(0, price - discount);
    await pool.query('UPDATE bookings SET total_amount = ?, discount_amount = ? WHERE id = ?', [total, discount, bk.id]);
    // Already finished and paid → keep Payments and Accounts equal to the new price
    if (['completed', 'delivered'].includes(bk.status)) {
      const [[pay]] = await pool.query("SELECT id FROM v2_payments WHERE booking_id = ? AND notes LIKE 'Quick wash%' LIMIT 1", [bk.id]);
      if (pay) {
        await pool.query('UPDATE v2_payments SET amount = ? WHERE id = ?', [total, pay.id]);
        await pool.query("UPDATE transactions SET amount = ?, note = CONCAT(COALESCE(note, ''), ?) WHERE type = 'quick_wash' AND reference_id = ?",
          [total, ` · price changed to ₹${total} by ${req.user.name || 'admin'} (#${req.user.id})`, bk.id]);
      } else {
        await require('../services/moneyIn').recordMoneyIn(pool, { customerId: bk.customer_id, amount: total, type: 'quick_wash', refId: bk.id,
          bookingId: bk.id, note: `Quick wash QW-${bk.id}`, franchiseId: bk.franchise_id || 1, userId: req.user.id });
      }
    }
    res.json({ success: true, data: { total_amount: total, discount_amount: discount } });
  } catch (err) {
    console.error('Quick wash set price error:', err);
    res.status(500).json({ success: false, error: 'Could not save the price' });
  }
};
