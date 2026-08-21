/**
 * ═══════════════════════════════════════════════════════════
 * QUICK WASH CONTROLLER
 * ═══════════════════════════════════════════════════════════
 * Handles quick wash bookings without full job card workflow.
 * Uses bookings table with job_type = 'quick_wash'.
 */

const pool = require('../config/db');

// ─── CREATE QUICK WASH ──────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      customer_id, vehicle_id, service_id, package_id,
      vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category,
      use_package, notes
    } = req.body;

    // Validate
    if (!customer_id && !vehicle_reg_no) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Customer or vehicle registration is required' });
    }

    // Resolve customer and vehicle
    let resolvedCustomerId = customer_id || null;
    let resolvedVehicleId = vehicle_id || null;
    let resolvedBrand = vehicle_brand || null;
    let resolvedModel = vehicle_model || null;
    let resolvedRegNo = vehicle_reg_no || null;

    if (vehicle_id && !vehicle_brand) {
      const [vRows] = await conn.query(
        'SELECT id, brand, model, registration_no, customer_id FROM vehicles WHERE id = ?', [vehicle_id]
      );
      if (vRows.length) {
        resolvedBrand = vRows[0].brand;
        resolvedModel = vRows[0].model;
        resolvedRegNo = vRows[0].registration_no;
        if (!resolvedCustomerId) resolvedCustomerId = vRows[0].customer_id;
      }
    }

    // Get or create a "walk-in" slot for today
    const now = new Date();
    const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    let [existingSlots] = await conn.query(
      "SELECT id FROM slots WHERE slot_date = ? AND start_time = '00:00:00' AND end_time = '23:59:59' LIMIT 1",
      [today]
    );

    let slotId;
    if (existingSlots.length) {
      slotId = existingSlots[0].id;
    } else {
      const [slotResult] = await conn.query(
        "INSERT INTO slots (slot_date, start_time, end_time, max_capacity, booked_count) VALUES (?, '00:00:00', '23:59:59', 999, 0)",
        [today]
      );
      slotId = slotResult.insertId;
    }

    // Calculate queue position
    const [queueRows] = await conn.query(
      "SELECT COUNT(*) AS cnt FROM bookings WHERE job_type = 'quick_wash' AND wash_status IN ('pending','washing') AND DATE(created_at) = CURDATE()"
    );
    const queuePosition = (queueRows[0]?.cnt || 0) + 1;

    // Sanitize vehicle_category to valid ENUM values
    const validCategories = ['hatchback', 'medium_hatchback', 'sedan', 'premium_sedan', 'suv'];
    const safeCategory = validCategories.includes(vehicle_category) ? vehicle_category : null;

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
        `SELECT price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv FROM services WHERE id = ?`,
        [service_id]
      );
      if (svcRows.length) {
        originalPrice = Number(svcRows[0][priceCol]) || Number(svcRows[0].price_sedan) || 0;
      }
    }

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
         job_type, status, wash_status, queue_position, notes, discount_percent, discount_amount, total_amount)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'quick_wash', 'confirmed', 'pending', ?, ?, ?, ?, ?)
    `, [
      resolvedCustomerId, resolvedVehicleId, slotId, service_id || null, actualPackageId,
      resolvedBrand, resolvedModel, resolvedRegNo, safeCategory,
      queuePosition, notes || null, discountPercent, discountAmount, totalAmount
    ]);

    // Increment slot count
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [slotId]);

    await conn.commit();

    // Socket notification
    const io = req.app.get('io');
    if (io) {
      io.emit('quick_wash_created', { bookingId: result.insertId, queuePosition });
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
    await conn.rollback();
    console.error('Quick wash create error:', err.message, err.sql || '');
    res.status(500).json({ success: false, error: err.message || 'Failed to create quick wash booking' });
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
    const { wash_status } = req.body;

    const validStatuses = ['pending', 'washing', 'completed', 'delivered', 'cancelled'];
    if (!validStatuses.includes(wash_status)) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: `Invalid status. Must be: ${validStatuses.join(', ')}` });
    }

    const [existing] = await conn.query(
      "SELECT * FROM bookings WHERE id = ? AND job_type = 'quick_wash'", [id]
    );
    if (!existing.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Quick wash booking not found' });
    }

    const updates = { wash_status };
    if (wash_status === 'completed') {
      updates.status = 'completed';
    } else if (wash_status === 'cancelled') {
      updates.status = 'cancelled';

      // Restore package usage if quick wash used a package service
      if (existing[0].package_id && existing[0].service_id) {
        try {
          const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [existing[0].service_id]);
          if (svcRows.length) {
            const serviceName = svcRows[0].name;
            const { cancelReservation } = require('./userPackagesController');
            // Check if package_id in bookings is user_package_id or package_id
            // userPackagesController checkAndUseService returns user_package_id, and we saved it as package_id.
            // Wait, in regular bookings we save package_id, but checkAndUseService returns user_package_id.
            // Let's check how bookingsController does it: 
            // In bookingsController, cancel looks up user_package_id using package_id.
            // For safety, let's look up the active user_package_id if package_id points to packages table.
            // But since this is quick wash and we just added package_id logic, let's do it safely.
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
    }

    const setClauses = Object.entries(updates).map(([k]) => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    await conn.query(
      `UPDATE bookings SET ${setClauses} WHERE id = ?`,
      [...values, id]
    );

    // If wash completed, check first wash discount or award 10% loyalty points from 2nd wash onward
    if (wash_status === 'completed' || status === 'completed') {
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
      io.emit('quick_wash_updated', { bookingId: parseInt(id), wash_status });
    }

    res.json({ success: true, message: `Wash status updated to ${wash_status}` });
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
      WHERE job_type = 'quick_wash' AND DATE(created_at) = CURDATE()
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
    const { generateQuickWashInvoicePDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generateQuickWashInvoicePDF(id);

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
      "SELECT id FROM bookings WHERE id = ? AND job_type = 'quick_wash'", [id]
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
      io.emit('wash:phase_updated', { bookingId: parseInt(id), phase, timestamp: updates.phase_updated_at });
      if (phase === 'complete') {
        io.emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: 'completed' });
      } else {
        io.emit('quick_wash_updated', { bookingId: parseInt(id), wash_status: 'washing' });
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
      "SELECT id, current_phase, phase_updated_at, wash_status FROM bookings WHERE id = ? AND job_type = 'quick_wash'",
      [id]
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
