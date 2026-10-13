const pool = require('../config/db');
const { cancelReservation } = require('./userPackagesController');

// ─── HELPER: Validate and Lock Consecutive Slots for Multi-hour Services ───
async function validateAndLockConsecutiveSlots(conn, startSlotId, totalDurationMinutes, franchiseId) {
  // 1. Fetch and lock start slot
  const [startSlots] = await conn.query(
    `SELECT id, franchise_id, DATE_FORMAT(slot_date, '%Y-%m-%d') as slot_date, 
            start_time, end_time, booked_count, max_capacity, is_blocked 
     FROM slots WHERE id = ? FOR UPDATE`,
    [startSlotId]
  );
  if (!startSlots.length) {
    return { ok: false, status: 404, error: 'Slot not found' };
  }

  const startSlot = startSlots[0];
  if (startSlot.is_blocked) {
    return { ok: false, status: 409, error: 'Slot is blocked' };
  }
  if (startSlot.booked_count >= startSlot.max_capacity) {
    return { ok: false, status: 409, error: 'Slot is fully booked' };
  }

  const duration = parseInt(totalDurationMinutes, 10) || 60;
  // If service duration is <= 60 minutes, exactly 1 slot is needed
  // This guarantees that 1-hour services never book or touch adjacent slots!
  const slotsNeeded = Math.max(1, Math.ceil(duration / 60));

  if (slotsNeeded === 1) {
    return { ok: true, slots: [startSlot], slotIds: [startSlot.id], startSlot };
  }

  // Multi-hour service: query consecutive slots on the same date for the franchise
  const fId = franchiseId || startSlot.franchise_id || 1;
  const [candidateSlots] = await conn.query(
    `SELECT id, franchise_id, DATE_FORMAT(slot_date, '%Y-%m-%d') as slot_date, 
            start_time, end_time, booked_count, max_capacity, is_blocked 
     FROM slots 
     WHERE slot_date = ? 
       AND (franchise_id = ? OR franchise_id IS NULL)
       AND (is_deleted = 0 OR is_deleted IS NULL)
       AND start_time >= ?
     ORDER BY start_time ASC 
     LIMIT ?
     FOR UPDATE`,
    [startSlot.slot_date, fId, startSlot.start_time, slotsNeeded]
  );

  // Check end-of-day boundary
  if (candidateSlots.length < slotsNeeded) {
    return {
      ok: false,
      status: 422,
      error: `Selected service requires ${duration} minutes (${slotsNeeded} consecutive slots), but slot does not have enough time before studio closing.`
    };
  }

  // Check continuity: each slot start_time must equal previous slot end_time
  for (let i = 1; i < candidateSlots.length; i++) {
    if (candidateSlots[i].start_time !== candidateSlots[i - 1].end_time) {
      return {
        ok: false,
        status: 422,
        error: `Selected service requires ${slotsNeeded} consecutive hours, but available slots have a gap.`
      };
    }
  }

  // Check capacity and block status of each consecutive slot
  for (const s of candidateSlots) {
    if (s.is_blocked) {
      return {
        ok: false,
        status: 409,
        error: `Slot at ${s.start_time} is blocked.`
      };
    }
    if (s.booked_count >= s.max_capacity) {
      return {
        ok: false,
        status: 409,
        error: `Slot at ${s.start_time} is fully booked.`
      };
    }
  }

  return {
    ok: true,
    slots: candidateSlots,
    slotIds: candidateSlots.map(s => s.id),
    startSlot,
  };
}

async function restoreBookingSlots(conn, bookingId, fallbackSlotId) {
  const [bSlots] = await conn.query('SELECT slot_id FROM booking_slots WHERE booking_id = ?', [bookingId]);
  if (bSlots.length > 0) {
    const slotIds = bSlots.map(r => r.slot_id);
    await conn.query('UPDATE slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id IN (?)', [slotIds]);
    await conn.query('DELETE FROM booking_slots WHERE booking_id = ?', [bookingId]);
  } else if (fallbackSlotId) {
    await conn.query('UPDATE slots SET booked_count = GREATEST(0, booked_count - 1) WHERE id = ?', [fallbackSlotId]);
  }
}

exports.validateAndLockConsecutiveSlots = validateAndLockConsecutiveSlots;
exports.restoreBookingSlots = restoreBookingSlots;

// ─── LIST BOOKINGS ──────────────────────────
exports.list = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, search } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    // Multi-tenant franchise isolation
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('b.franchise_id')
      : { clause: ' AND (b.franchise_id = ? OR b.franchise_id IS NULL)', params: [req.franchiseId || 1] };
    where += fCond.clause;
    params.push(...fCond.params);

    if (req.user.role === 'customer') {
      where += ' AND b.customer_id = ?';
      params.push(req.user.id);
    }
    
    if (req.query.slot_id) {
      where += ' AND b.slot_id = ?';
      params.push(req.query.slot_id);
    }

    if (status && status !== 'all') {
      where += ' AND b.status = ?';
      params.push(status);
    }

    if (search) {
      where += ' AND (u.name LIKE ? OR u.mobile LIKE ? OR b.vehicle_brand LIKE ? OR b.vehicle_model LIKE ? OR b.vehicle_reg_no LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) AS total FROM bookings b JOIN users u ON b.customer_id = u.id WHERE ${where}`, params
    );

    const [rows] = await pool.query(`
      SELECT b.*,
        s.slot_date, s.start_time, s.end_time,
        u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
        svc.name AS service_name,
        pkg.name AS package_name,
        jc.id AS job_cart_id,
        jc.status AS job_cart_status,
        v.brand AS linked_vehicle_brand, v.model AS linked_vehicle_model,
        v.registration_no AS linked_vehicle_reg_no,
        approver.name AS approved_by_name,
        pr.status AS pickup_status, pr.id AS pickup_id, pr.address AS pickup_address
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      LEFT JOIN packages pkg ON b.package_id = pkg.id
      LEFT JOIN job_carts jc ON jc.booking_id = b.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN users approver ON b.approved_by = approver.id
      LEFT JOIN v2_pickup_requests pr ON pr.booking_id = b.id
      WHERE ${where}
      ORDER BY b.created_at DESC
      LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), offset]);

    // Enrich with vehicle data — prefer linked vehicle, fall back to text fields
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
    console.error('Bookings list error:', err.message);
    res.json({
      success: true,
      data: [],
      pagination: { page: parseInt(req.query?.page) || 1, limit: parseInt(req.query?.limit) || 20, total: 0 },
    });
  }
};

// ─── LIST PENDING BOOKINGS (Admin) ──────────
exports.listPending = async (req, res) => {
  req.query.status = 'pending_approval';
  return exports.list(req, res);
};

// ─── GET ONE BOOKING ────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT b.*,
        s.slot_date, s.start_time, s.end_time,
        u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
        svc.name AS service_name,
        pkg.name AS package_name,
        jc.id AS job_cart_id,
        jc.status AS job_cart_status,
        v.brand AS linked_vehicle_brand, v.model AS linked_vehicle_model,
        v.registration_no AS linked_vehicle_reg_no,
        approver.name AS approved_by_name,
        pr.status AS pickup_status, pr.id AS pickup_id, pr.address AS pickup_address
      FROM bookings b
      JOIN slots s ON b.slot_id = s.id
      JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      LEFT JOIN packages pkg ON b.package_id = pkg.id
      LEFT JOIN job_carts jc ON jc.booking_id = b.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN users approver ON b.approved_by = approver.id
      LEFT JOIN v2_pickup_requests pr ON pr.booking_id = b.id
      WHERE b.id = ?
    `, [req.params.id]);

    if (!rows.length) return res.status(404).json({ success: false, error: 'Booking not found' });
    const row = rows[0];

    // Multi-tenant isolation: non-super admin can only view bookings for their own franchise
    if (!req.isSuperAdmin && row.franchise_id && req.franchiseId && parseInt(row.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot access booking from another franchise' });
    }

    if (req.user.role === 'customer' && row.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    row.vehicle_brand = row.linked_vehicle_brand || row.vehicle_brand;
    row.vehicle_model = row.linked_vehicle_model || row.vehicle_model;
    row.vehicle_reg_no = row.linked_vehicle_reg_no || row.vehicle_reg_no;

    // Fetch linked services for multi-service bookings
    const [linkedServices] = await pool.query(`
      SELECT bs.service_id, s.name, s.duration_minutes
      FROM booking_services bs
      JOIN services s ON bs.service_id = s.id
      WHERE bs.booking_id = ?
    `, [req.params.id]);
    row.linked_services = linkedServices;

    res.json({ success: true, data: row });
  } catch (err) {
    console.error('Booking getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── VEHICLE HISTORY ────────────────────────
exports.vehicleHistory = async (req, res) => {
  try {
    const { regNo } = req.params;
    const cleanReg = (regNo || '').toUpperCase().replace(/\s/g, '');

    // Find vehicle
    const [vehicles] = await pool.query(
      `SELECT v.*, u.name AS customer_name, u.mobile AS customer_mobile
       FROM vehicles v JOIN users u ON v.customer_id = u.id
       WHERE v.registration_no = ?`,
      [cleanReg]
    );

    if (!vehicles.length) {
      return res.json({ success: true, data: { found: false, history: [] } });
    }

    const vehicle = vehicles[0];

    // Fetch all job carts for this vehicle
    const [jobCarts] = await pool.query(`
      SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.notes, jc.invoice_number,
             jc.created_at, jc.completed_at,
             (SELECT GROUP_CONCAT(js.service_name SEPARATOR ', ')
              FROM job_services js WHERE js.job_cart_id = jc.id) AS services_done,
             (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0)
              + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)
              FROM job_services js WHERE js.job_cart_id = jc.id) AS total_amount
      FROM job_carts jc
      WHERE jc.vehicle_id = ?
      ORDER BY jc.visit_date DESC
    `, [vehicle.id]);

    res.json({
      success: true,
      data: {
        found: true,
        vehicle: {
          id: vehicle.id,
          registration_no: vehicle.registration_no,
          brand: vehicle.brand,
          model: vehicle.model,
        },
        customer: {
          name: vehicle.customer_name,
          mobile: vehicle.customer_mobile,
        },
        history: jobCarts,
      },
    });
  } catch (err) {
    console.error('Vehicle history error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE BOOKING (ATOMIC — with approval workflow) ────
// UPDATED: status = pending_approval, expires in 5 min, vehicle linking, multi-service
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    console.log('[BOOKING] Request body:', JSON.stringify(req.body));

    const {
      slot_id, service_id, service_ids, cart_items, package_id,
      vehicle_id, vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category,
      is_free_wash = false, use_package = false, notes, pay_advance,
      pickup_type = 'none', pickup_address_details = null
    } = req.body;
    let package_service_name = req.body.package_service_name;

    const customerId = req.user.role === 'admin' ? (req.body.customer_id || req.user.id) : req.user.id;

    if (!slot_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Slot is required' });
    }

    // 0. Fetch Settings for booking pause & advance payment rules
    const [settingsRows] = await conn.query(
      "SELECT key_name, value FROM settings WHERE key_name IN ('bookings_paused', 'advance_type', 'advance_value')"
    );
    const settings = settingsRows.reduce((acc, curr) => {
      acc[curr.key_name] = curr.value;
      return acc;
    }, {});

    // Enforce bookings paused globally for customers
    if (settings.bookings_paused === '1' && req.user.role === 'customer') {
      await conn.rollback();
      return res.status(422).json({ success: false, error: 'Bookings are temporarily paused by administration.' });
    }

    // 1. Resolve vehicle data — prefer vehicle_id lookup, fallback to text fields
    let resolvedBrand = vehicle_brand || null;
    let resolvedModel = vehicle_model || null;
    let resolvedRegNo = vehicle_reg_no || null;
    let resolvedVehicleId = vehicle_id || null;

    if (vehicle_id) {
      const [vRows] = await conn.query(
        'SELECT id, brand, model, registration_no FROM vehicles WHERE id = ?', [vehicle_id]
      );
      if (vRows.length) {
        resolvedBrand = vRows[0].brand;
        resolvedModel = vRows[0].model;
        resolvedRegNo = vRows[0].registration_no;
        resolvedVehicleId = vRows[0].id;
      }
    }

    // 2. Calculate total duration for multi-service bookings
    let totalDuration = null;
    const allServiceIds = service_ids && service_ids.length > 0 ? service_ids : (service_id ? [service_id] : []);
    
    if (allServiceIds.length > 0) {
      const [durations] = await conn.query(
        `SELECT SUM(duration_minutes) AS total FROM services WHERE id IN (?)`,
        [allServiceIds]
      );
      totalDuration = durations[0]?.total || null;
    }

    // 3. Atomically validate & lock consecutive slots (Fixes adjacent slot bug & race conditions)
    const bookingFranchiseId = req.franchiseId || req.user?.franchise_id || 1;
    const slotLock = await validateAndLockConsecutiveSlots(conn, slot_id, totalDuration, bookingFranchiseId);
    if (!slotLock.ok) {
      await conn.rollback();
      return res.status(slotLock.status).json({ success: false, error: slotLock.error });
    }
    const slot = slotLock.startSlot;
    const requiredSlotIds = slotLock.slotIds;

    // 4. Double booking guard (prevent duplicate overlapping active booking for same vehicle)
    const [overlapCheck] = await conn.query(
      `SELECT b.id FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       WHERE b.customer_id = ?
         AND (
           (b.vehicle_id IS NOT NULL AND b.vehicle_id = ?)
           OR (b.vehicle_reg_no IS NOT NULL AND b.vehicle_reg_no = ?)
         )
         AND s.slot_date = ?
         AND b.status IN ('pending_approval', 'confirmed', 'pending_payment', 'in_progress')
         AND (
           b.slot_id IN (?)
           OR EXISTS (SELECT 1 FROM booking_slots bs WHERE bs.booking_id = b.id AND bs.slot_id IN (?))
         )`,
      [customerId, resolvedVehicleId || 0, resolvedRegNo || '', slot.slot_date, requiredSlotIds, requiredSlotIds]
    );
    if (overlapCheck.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, error: 'You already have an active booking for this vehicle at an overlapping time on this date.' });
    }

    // Determine package free pickup eligibility
    let hasFreePickup = false;
    if (use_package) {
      const [pkgRows] = await conn.query(
        `SELECT p.pickup_enabled 
         FROM user_packages up
         JOIN packages p ON up.package_id = p.id
         WHERE up.user_id = ? AND up.package_status = 'active'
           AND (up.end_date IS NULL OR up.end_date > NOW())
         ORDER BY up.start_date DESC LIMIT 1`,
        [customerId]
      );
      if (pkgRows.length && pkgRows[0].pickup_enabled === 1) {
        hasFreePickup = true;
      }
    }

    // Calculate pickup charges
    let calculatedPickupCharge = 0;
    if (pickup_type && pickup_type !== 'none' && !hasFreePickup) {
      const [chargeSettings] = await conn.query(
        `SELECT key_name, value FROM settings WHERE key_name IN ('pickup_charge', 'drop_charge', 'pickup_drop_charge')`
      );
      const cSettings = chargeSettings.reduce((acc, curr) => {
        acc[curr.key_name] = curr.value;
        return acc;
      }, {});
      
      if (pickup_type === 'pickup') {
        calculatedPickupCharge = parseFloat(cSettings.pickup_charge || '150');
      } else if (pickup_type === 'drop') {
        calculatedPickupCharge = parseFloat(cSettings.drop_charge || '150');
      } else if (pickup_type === 'both') {
        calculatedPickupCharge = parseFloat(cSettings.pickup_drop_charge || '250');
      }
    }

    let calculatedTotal = 0;
    let advanceAmount = 0;
    const isAdvanceEligible = !is_free_wash && !use_package;
    let fetchedServicesList = [];
    const cat = vehicle_category || 'sedan';
    const priceKey = `price_${cat}`;

    if (allServiceIds.length > 0) {
      const [sRows] = await conn.query(
        `SELECT id, name, price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv FROM services WHERE id IN (?)`,
        [allServiceIds]
      );
      fetchedServicesList = sRows;
    }

    let washServicesTotal = 0;
    let nonWashServicesTotal = 0;

    if (fetchedServicesList.length > 0) {
      for (const s of fetchedServicesList) {
        const price = Number(s[priceKey]) || Number(s.price_sedan) || 0;
        if (s.name && s.name.toLowerCase().includes('wash')) {
          washServicesTotal += price;
        } else {
          nonWashServicesTotal += price;
        }
      }
    }

    if (isAdvanceEligible && fetchedServicesList.length > 0) {
      let servicesTotal = washServicesTotal + nonWashServicesTotal;

      // Calculate totals based on payment selection (full advance with 10% discount, part advance of ₹200, or none)
      if (pay_advance === 'full' || pay_advance === true) {
        servicesTotal = Math.round(servicesTotal * 0.90);
        calculatedTotal = servicesTotal + calculatedPickupCharge;
        advanceAmount = calculatedTotal;
      } else if (pay_advance === 'part') {
        calculatedTotal = servicesTotal + calculatedPickupCharge;
        advanceAmount = Math.min(200, calculatedTotal);
      } else {
        // Proceed without advance (pay full standard amount at studio)
        advanceAmount = 0;
        calculatedTotal = servicesTotal + calculatedPickupCharge;
      }
    } else {
      calculatedTotal = calculatedPickupCharge;
    }

    // 5. Package Usage — DEFERRED DEDUCTION (only check eligibility, don't deduct yet)
    let packageUsed = false;
    let packageInfo = null;
    let resolvedUserPackageId = null;
    const primaryServiceId = service_id || (allServiceIds.length > 0 ? allServiceIds[0] : null);

    if (use_package) {
      let serviceNames = [];
      if (Array.isArray(package_service_name)) {
        serviceNames = package_service_name;
      } else if (typeof package_service_name === 'string') {
        serviceNames = package_service_name.split(',').map(s => s.trim()).filter(s => s);
      }
      
      // Fallback to fetching name by ID if only service_id was provided
      if (serviceNames.length === 0 && primaryServiceId) {
        const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [primaryServiceId]);
        if (svcRows.length) {
          serviceNames = [svcRows[0].name];
        }
      }

      console.log('[BOOKING] Package booking — service names resolved:', serviceNames);

      if (serviceNames.length > 0) {
        const userPkgCtrl = require('./userPackagesController');
        let allAvailable = true;
        let finalPackageName = '';
        let canonicalNames = [];
        let reasons = [];

        for (const sName of serviceNames) {
          // Only CHECK availability — do NOT deduct. Deduction happens on admin approval.
          const result = await userPkgCtrl.checkServiceAvailability(conn, customerId, sName, resolvedVehicleId);
          console.log(`[BOOKING] Package availability result for ${sName}:`, JSON.stringify(result));

          if (result.can_use) {
            finalPackageName = result.package_name;
            resolvedUserPackageId = result.user_package_id;
            canonicalNames.push(result.canonical_service_name || sName);
          } else {
            allAvailable = false;
            reasons.push(result.reason || `No credits for ${sName}`);
          }
        }

        if (allAvailable) {
          packageUsed = true;
          package_service_name = canonicalNames.join(', ');
          packageInfo = {
            package_name: finalPackageName,
            service_name: package_service_name,
            remaining: 'Multiple',
          };
        } else {
          await conn.rollback();
          return res.status(422).json({ success: false, error: reasons.join(' | ') });
        }
      } else {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Package service name or service ID required to use package' });
      }
    }

    // Determine booking type
    const bookingType = (use_package && packageUsed) ? 'package' : 'direct';

    // 50% First Wash Discount calculation (applies ONLY to wash services)
    const { checkFirstWashEligibility } = require('../utils/firstWashHelper');
    let discountPercent = 0.00;
    let discountAmount = 0.00;

    if (customerId && !use_package && !is_free_wash) {
      const fwCheck = await checkFirstWashEligibility(conn, customerId);
      if (fwCheck.isEligible && washServicesTotal > 0) {
        discountPercent = 50.00;
        discountAmount = Math.round(washServicesTotal * 0.50 * 100) / 100;
        calculatedTotal = Math.max(0, calculatedTotal - discountAmount);
        if (advanceAmount > calculatedTotal) {
          advanceAmount = calculatedTotal;
        }
        console.log(`[FIRST_WASH] Customer #${customerId} eligible for 50% wash discount — Wash total: ₹${washServicesTotal}, Discount: ₹${discountAmount}, Final total: ₹${calculatedTotal}`);
      }
    }

    // 6. Increment booked_count on all required slots
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [requiredSlotIds]);

    // Determine status & expires_at based on advance payment rules
    let targetStatus = 'pending_approval';
    let expiresAt = null;

    if (advanceAmount > 0 && req.user.role === 'customer') {
      targetStatus = 'pending_payment';
      expiresAt = conn.raw ? conn.raw('DATE_ADD(NOW(), INTERVAL 10 MINUTE)') : new Date(Date.now() + 10 * 60 * 1000);
    } else {
      expiresAt = req.user.role === 'admin' ? null : new Date(Date.now() + 5 * 60 * 1000);
    }

    // ─── Save Address Details dynamically if provided ───
    if (pickup_type && pickup_type !== 'none' && pickup_address_details) {
      const { address, landmark, city, state, pincode, latitude, longitude } = pickup_address_details;
      if (address && city && state && pincode) {
        const [existing] = await conn.query('SELECT id FROM v2_customer_addresses WHERE customer_id = ?', [customerId]);
        if (existing.length === 0) {
          await conn.query(
            `INSERT INTO v2_customer_addresses 
             (customer_id, address, landmark, city, state, pincode, latitude, longitude, is_default)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)`,
            [customerId, address, landmark || null, city, state, pincode, latitude || null, longitude || null]
          );
          console.log('[BOOKING] Saved first customer address under profile:', address);
        } else {
          const [dupe] = await conn.query(
            'SELECT id FROM v2_customer_addresses WHERE customer_id = ? AND address = ? AND pincode = ?',
            [customerId, address, pincode]
          );
          if (dupe.length === 0) {
            await conn.query(
              `INSERT INTO v2_customer_addresses 
               (customer_id, address, landmark, city, state, pincode, latitude, longitude, is_default)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
              [customerId, address, landmark || null, city, state, pincode, latitude || null, longitude || null]
            );
            console.log('[BOOKING] Saved new customer address under profile:', address);
          }
        }
      }
    }

    // 7. Insert booking
    const cartSummary = (cart_items && Array.isArray(cart_items) && cart_items.length > 0)
      ? cart_items
      : (fetchedServicesList && fetchedServicesList.length > 0
          ? fetchedServicesList.map(s => ({
              id: s.id,
              name: s.name,
              price: Number(s[priceKey]) || Number(s.price_sedan) || 0,
              is_wash: s.name && s.name.toLowerCase().includes('wash')
            }))
          : null);
    const cartItemsJsonStr = cartSummary ? JSON.stringify(cartSummary) : null;

    console.log('[BOOKING] Inserting booking — type:', bookingType, 'status:', targetStatus, 'advance_amount:', advanceAmount, 'franchise_id:', bookingFranchiseId);
    const [result] = await conn.query(
      `INSERT INTO bookings 
       (customer_id, vehicle_id, slot_id, service_id, package_id, 
        vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category, total_duration,
        status, is_free_wash, notes, booking_type, user_package_id, package_service_name, expires_at, advance_amount, total_amount, pickup_type, pickup_charge, discount_percent, discount_amount, cart_items_json, franchise_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        customerId, resolvedVehicleId, slot_id,
        primaryServiceId || null, package_id || null,
        resolvedBrand, resolvedModel, resolvedRegNo, vehicle_category || null, totalDuration,
        targetStatus, is_free_wash ? 1 : 0, notes || null,
        bookingType, resolvedUserPackageId, package_service_name || null,
        expiresAt, advanceAmount, calculatedTotal, pickup_type, calculatedPickupCharge,
        discountPercent, discountAmount, cartItemsJsonStr,
        bookingFranchiseId
      ]
    );

    const bookingId = result.insertId;
    console.log('[BOOKING] Booking created:', bookingId);

    // 8. Insert booking_services for multi-service
    if (allServiceIds.length > 0) {
      for (const sid of allServiceIds) {
        await conn.query(
          'INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)',
          [bookingId, sid]
        );
      }
    }

    // 8b. Insert booking_slots junction records for tracked slots
    for (const rSlotId of requiredSlotIds) {
      await conn.query(
        'INSERT INTO booking_slots (booking_id, slot_id) VALUES (?, ?)',
        [bookingId, rSlotId]
      );
    }

    await conn.commit();

    // 9. Send notifications only if NOT pending_payment
    if (targetStatus !== 'pending_payment') {
      try {
        const messagingService = require('../services/messagingService');
        await messagingService.notify(
          customerId,
          'BOOKING_RECEIVED',
          { booking_id: bookingId },
          { type: 'booking', id: bookingId }
        );
      } catch (msgErr) {
        console.error('[SMS/WA] Booking notification setup failed (non-blocking):', msgErr.message);
      }

      const io = req.app.get('io');
      if (io) {
        io.emit('new_booking', { bookingId, status: targetStatus });
      }
    }

    console.log(`[BOOKING] #${bookingId} created — status=${targetStatus}, customer=${customerId}, slot=${slot_id}, type=${bookingType}`);

    res.status(201).json({
      success: true,
      data: {
        id: bookingId,
        status: targetStatus,
        advance_amount: advanceAmount,
        total_amount: calculatedTotal,
        package_used: packageUsed,
        ...(packageInfo && { package_info: packageInfo }),
      },
      message: targetStatus === 'pending_payment'
        ? 'Booking created. Awaiting advance payment.'
        : (packageUsed
          ? `Booking submitted — used ${packageInfo.package_name} credit (${packageInfo.remaining} left). Awaiting admin approval.`
          : 'Booking submitted — awaiting admin approval'),
    });
  } catch (err) {
    await conn.rollback();
    console.error('Booking create error:', err);
    // Return meaningful error message
    const errorMsg = err.code === 'ER_BAD_FIELD_ERROR'
      ? `Database column missing: ${err.message}. Run migration on server.`
      : (err.sqlMessage || err.message || 'Server error');
    res.status(500).json({ success: false, error: errorMsg });
  } finally {
    conn.release();
  }
};

// ─── APPROVE BOOKING (Admin) ────────────────
exports.approve = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { booking_notes } = req.body;

    const [bookings] = await conn.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!bookings.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Booking not found' }); }

    const booking = bookings[0];
    if (!req.isSuperAdmin && booking.franchise_id && req.franchiseId && parseInt(booking.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Access denied: Cannot approve booking from another franchise' });
    }

    if (booking.status !== 'pending_approval') {
      await conn.rollback();
      return res.status(422).json({ success: false, error: `Cannot approve a ${booking.status} booking` });
    }

    // ─── DEFERRED DEDUCTION: Deduct package credit NOW (on approval) ───
    if (booking.booking_type === 'package' && booking.user_package_id) {
      let serviceNames = [];
      if (booking.package_service_name) {
        serviceNames = booking.package_service_name.split(',').map(s => s.trim()).filter(s => s);
      }
      
      // Fallback if package_service_name wasn't saved (older bookings)
      if (serviceNames.length === 0 && booking.service_id) {
        const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [booking.service_id]);
        if (svcRows.length) serviceNames = [svcRows[0].name];
      }
      
      if (serviceNames.length > 0) {
        const userPkgCtrl = require('./userPackagesController');
        for (const sName of serviceNames) {
          const result = await userPkgCtrl.checkAndUseService(conn, booking.customer_id, sName, booking.vehicle_id);
          if (!result.can_use) {
            await conn.rollback();
            return res.status(422).json({
              success: false,
              error: `Cannot approve: No package credits remaining for ${sName}. ${result.reason || ''}`,
            });
          }
          console.log(`[BOOKING] Package credit deducted for booking #${id} — service: ${sName}, remaining: ${result.remaining}`);
        }
      }
    }

    await conn.query(
      `UPDATE bookings SET status = 'confirmed', booking_notes = ?, approved_by = ?, approved_at = NOW(), expires_at = NULL WHERE id = ?`,
      [booking_notes || null, req.user.id, id]
    );

    // ─── Referral Completion & Welcome Reward Triggers ───
    try {
      // 1. Check if this is the customer's first confirmed booking ever (excluding this one)
      const [prevBookings] = await conn.query(
        'SELECT id FROM bookings WHERE customer_id = ? AND status = "confirmed" AND id != ?',
        [booking.customer_id, id]
      );

      if (prevBookings.length === 0) {
        // Yes, this is their first confirmed booking!
        
        // ─── Trigger Referral Completion & Reward ───
        const [pendingRefs] = await conn.query(
          'SELECT * FROM v2_referrals WHERE referred_id = ? AND status = "pending"',
          [booking.customer_id]
        );

        if (pendingRefs.length > 0) {
          const ref = pendingRefs[0];

          // Set status to completed temporarily
          await conn.query(
            'UPDATE v2_referrals SET status = "completed" WHERE id = ?',
            [ref.id]
          );

          // Get referral reward points setting
          let referrerPoints = 100;
          const [settingRow] = await conn.query('SELECT value FROM settings WHERE key_name = "referral_referrer_points"');
          if (settingRow.length) {
            referrerPoints = parseInt(settingRow[0].value) || 100;
          }

          // Check/Create referrer's wallet in v2_wallets
          const [referrerWallets] = await conn.query('SELECT id FROM v2_wallets WHERE customer_id = ?', [ref.referrer_id]);
          let referrerWalletId;
          if (!referrerWallets.length) {
            const [insWallet] = await conn.query(
              'INSERT INTO v2_wallets (customer_id, balance, reward_points, total_earned, total_spent) VALUES (?, 0, 0, 0, 0)',
              [ref.referrer_id]
            );
            referrerWalletId = insWallet.insertId;
          } else {
            referrerWalletId = referrerWallets[0].id;
          }

          // Credit referrer's wallet
          await conn.query(
            'UPDATE v2_wallets SET reward_points = reward_points + ?, total_earned = total_earned + ? WHERE id = ?',
            [referrerPoints, referrerPoints, referrerWalletId]
          );

          // Log in v2_wallet_transactions
          await conn.query(
            `INSERT INTO v2_wallet_transactions 
             (wallet_id, customer_id, transaction_type, amount, points, description, reference_type, reference_id, balance_after)
             VALUES (?, ?, 'referral_bonus', 0, ?, ?, 'referral', ?, 0)`,
            [referrerWalletId, ref.referrer_id, referrerPoints, `Referral reward points for referring customer ID ${booking.customer_id}`, ref.id]
          );

          // Log in v2_reward_logs
          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, ?, 'referral', ?, 'referral', ?)`,
            [ref.referrer_id, referrerPoints, `Referral bonus for customer ID ${booking.customer_id}`, ref.id]
          );

          // Transition referral to rewarded
          await conn.query(
            'UPDATE v2_referrals SET status = "rewarded", reward_given = 1 WHERE id = ?',
            [ref.id]
          );

          // Update legacy table referral_rewards in sync
          await conn.query(
            'UPDATE referral_rewards SET status = "credited", credited_at = NOW() WHERE referrer_id = ? AND referred_id = ?',
            [ref.referrer_id, booking.customer_id]
          );

          // Also update legacy loyalty table
          const [existingLoyalty] = await conn.query('SELECT id FROM loyalty WHERE customer_id = ?', [ref.referrer_id]);
          if (existingLoyalty.length > 0) {
            await conn.query('UPDATE loyalty SET credits = credits + ? WHERE customer_id = ?', [referrerPoints, ref.referrer_id]);
          } else {
            await conn.query('INSERT INTO loyalty (customer_id, credits) VALUES (?, ?)', [ref.referrer_id, referrerPoints]);
          }

          await conn.query(
            `INSERT INTO loyalty_transactions (customer_id, type, points, description) VALUES (?, 'earn', ?, 'Referral reward points awarded.')`,
            [ref.referrer_id, referrerPoints]
          );
        }

        // ─── Trigger New Customer Welcome Reward (Update 24) ───
        let welcomeType = 'points';
        let welcomeValue = 0;

        const [typeRow] = await conn.query('SELECT value FROM settings WHERE key_name = "welcome_reward_type"');
        if (typeRow.length) welcomeType = typeRow[0].value;

        const [valRow] = await conn.query('SELECT value FROM settings WHERE key_name = "welcome_reward_value"');
        if (valRow.length) welcomeValue = parseFloat(valRow[0].value) || 0;

        if (welcomeType === 'points') {
          // Credit points to v2_wallets
          const [customerWallets] = await conn.query('SELECT id FROM v2_wallets WHERE customer_id = ?', [booking.customer_id]);
          let customerWalletId;
          if (!customerWallets.length) {
            const [insWallet] = await conn.query(
              'INSERT INTO v2_wallets (customer_id, balance, reward_points, total_earned, total_spent) VALUES (?, 0, 0, 0, 0)',
              [booking.customer_id]
            );
            customerWalletId = insWallet.insertId;
          } else {
            customerWalletId = customerWallets[0].id;
          }

          await conn.query(
            'UPDATE v2_wallets SET reward_points = reward_points + ?, total_earned = total_earned + ? WHERE id = ?',
            [welcomeValue, welcomeValue, customerWalletId]
          );

          // Log in v2_wallet_transactions
          await conn.query(
            `INSERT INTO v2_wallet_transactions 
             (wallet_id, customer_id, transaction_type, amount, points, description, reference_type, reference_id, balance_after)
             VALUES (?, ?, 'welcome_bonus', 0, ?, 'New customer welcome bonus points', 'booking', ?, 0)`,
            [customerWalletId, booking.customer_id, welcomeValue, id]
          );

          // Log in v2_reward_logs
          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, ?, 'welcome', 'New customer welcome bonus points', 'booking', ?)`,
            [booking.customer_id, welcomeValue, id]
          );

          // Add to legacy customer_rewards & loyalty
          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);

          await conn.query(
            `INSERT INTO customer_rewards (customer_id, reward_type, points_awarded, discount_pct, description, expires_at)
             VALUES (?, 'welcome', ?, 0, 'New customer welcome bonus points', ?)`,
            [booking.customer_id, welcomeValue, expiresAt]
          );

          const [existingLoyalty] = await conn.query('SELECT id FROM loyalty WHERE customer_id = ?', [booking.customer_id]);
          if (existingLoyalty.length > 0) {
            await conn.query('UPDATE loyalty SET credits = credits + ? WHERE customer_id = ?', [welcomeValue, booking.customer_id]);
          } else {
            await conn.query('INSERT INTO loyalty (customer_id, credits) VALUES (?, ?)', [booking.customer_id, welcomeValue]);
          }

          await conn.query(
            `INSERT INTO loyalty_transactions (customer_id, type, points, description) VALUES (?, 'earn', ?, 'New customer welcome bonus points')`,
            [booking.customer_id, welcomeValue]
          );
        } else if (welcomeType === 'discount') {
          // Deduct from booking total_amount
          await conn.query(
            'UPDATE bookings SET total_amount = GREATEST(0, total_amount - ?) WHERE id = ?',
            [welcomeValue, id]
          );

          // Log in customer_rewards (legacy table)
          await conn.query(
            `INSERT INTO customer_rewards (customer_id, reward_type, points_awarded, discount_pct, description)
             VALUES (?, 'welcome', 0, 0, ?)`,
            [booking.customer_id, `Welcome discount of ₹${welcomeValue} applied to booking #${id}`]
          );

          // Log in v2_reward_logs
          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, 0, 'welcome', ?, 'booking', ?)`,
            [booking.customer_id, `Welcome discount of ₹${welcomeValue} applied`, id]
          );
        }
      }
    } catch (rewardsErr) {
      console.error('[REWARDS] Failed to process signup/booking rewards:', rewardsErr.message);
      // Non-fatal: do not block booking approval
    }

    await conn.commit();

    // Fire-and-forget confirmation SMS & WhatsApp
    try {
      const messagingService = require('../services/messagingService');
      const [slotRows] = await pool.query('SELECT slot_date, start_time FROM slots WHERE id = ?', [booking.slot_id]);
      
      let serviceName = booking.package_service_name || 'Service';
      if (serviceName === 'Service' && booking.service_id) {
          const [svcRows] = await pool.query('SELECT name FROM services WHERE id = ?', [booking.service_id]);
          if (svcRows.length) serviceName = svcRows[0].name;
      }

      if (slotRows.length) {
        const date = new Date(slotRows[0].slot_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const time = slotRows[0].start_time ? slotRows[0].start_time.substring(0, 5) : '';
        await messagingService.notify(
          booking.customer_id,
          'BOOKING_CONFIRMED',
          { booking_id: id, booking_date: `${date} at ${time}`, service_name: serviceName },
          { type: 'booking', id }
        );
      }
    } catch (msgErr) {
      console.error('[SMS/WA] Booking confirmation notification failed:', msgErr.message);
    }

    console.log(`[BOOKING] #${id} approved by admin ${req.user.id}`);
    res.json({ success: true, message: 'Booking approved' });
  } catch (err) {
    await conn.rollback();
    console.error('Booking approve error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── REJECT BOOKING (Admin) ────────────────
exports.reject = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { booking_notes } = req.body;

    const [bookings] = await conn.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!bookings.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Booking not found' }); }

    const booking = bookings[0];
    if (!req.isSuperAdmin && booking.franchise_id && req.franchiseId && parseInt(booking.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Access denied: Cannot reject booking from another franchise' });
    }

    if (booking.status !== 'pending_approval' && booking.status !== 'confirmed') {
      await conn.rollback();
      return res.status(422).json({ success: false, error: `Cannot reject a ${booking.status} booking` });
    }

    // Reject booking
    await conn.query(
      `UPDATE bookings SET status = 'rejected', booking_notes = ?, approved_by = ?, approved_at = NOW(), expires_at = NULL WHERE id = ?`,
      [booking_notes || 'Rejected by admin', req.user.id, id]
    );

    // Restore all booked slot(s) (including multi-hour consecutive slots)
    await restoreBookingSlots(conn, id, booking.slot_id);

    // Restore free wash if applicable
    if (booking.is_free_wash) {
      await conn.query(
        'UPDATE loyalty SET free_washes = free_washes + 1 WHERE customer_id = ?',
        [booking.customer_id]
      );
    }

    // Restore package usage if booking was a confirmed package booking (credit already deducted)
    let packageRestored = false;
    if (booking.booking_type === 'package' && booking.status === 'confirmed') {
      try {
        let serviceName = booking.package_service_name;
        if (!serviceName && booking.service_id) {
          const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [booking.service_id]);
          if (svcRows.length) serviceName = svcRows[0].name;
        }

        if (serviceName) {
          const userPackageId = booking.user_package_id;
          if (userPackageId) {
            await cancelReservation(conn, userPackageId, serviceName);
            packageRestored = true;
            console.log(`[BOOKING] Package credit restored for rejected booking #${id} — service: ${serviceName}`);
          } else {
            // Fallback: find active user_package
            const [userPkgs] = await conn.query(
              `SELECT id FROM user_packages 
               WHERE user_id = ? AND package_id = ? AND package_status = 'active'
               ORDER BY start_date DESC LIMIT 1`,
              [booking.customer_id, booking.package_id]
            );
            if (userPkgs.length) {
              await cancelReservation(conn, userPkgs[0].id, serviceName);
              packageRestored = true;
              console.log(`[BOOKING] Package credit restored (fallback) for rejected booking #${id} — service: ${serviceName}`);
            }
          }
        }
      } catch (pkgErr) {
        console.error(`[BOOKING] Failed to restore package credit for booking #${id}:`, pkgErr.message);
        // Non-fatal — don't block the rejection
      }
    }

    await conn.commit();

    // Fire-and-forget rejection SMS & WhatsApp
    try {
      const messagingService = require('../services/messagingService');
      const rejectionReason = booking_notes || 'Booking details mismatch or scheduling conflict.';
      await messagingService.notify(
        booking.customer_id,
        'BOOKING_REJECTED',
        { booking_id: id, rejection_reason: rejectionReason },
        { type: 'booking', id }
      );
    } catch (msgErr) {
      console.error('[SMS/WA] Booking rejection notification failed:', msgErr.message);
    }

    console.log(`[BOOKING] #${id} rejected by admin ${req.user.id}`);
    res.json({ success: true, message: packageRestored ? 'Booking rejected — package balance restored' : 'Booking rejected' });
  } catch (err) {
    await conn.rollback();
    console.error('Booking reject error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── CANCEL BOOKING ─────────────────────────
exports.cancel = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;

    const [bookings] = await conn.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!bookings.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Booking not found' }); }

    const booking = bookings[0];
    if (!['confirmed', 'pending_approval'].includes(booking.status)) {
      await conn.rollback();
      return res.status(422).json({ success: false, error: 'Only confirmed or pending bookings can be cancelled' });
    }

    // Customer can only cancel own
    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // 1. Cancel booking
    await conn.query("UPDATE bookings SET status = 'cancelled', expires_at = NULL WHERE id = ?", [id]);

    // 2. Restore all booked slot(s) (including multi-hour consecutive slots)
    await restoreBookingSlots(conn, id, booking.slot_id);

    // 3. Restore free wash if applicable
    if (booking.is_free_wash) {
      await conn.query(
        'UPDATE loyalty SET free_washes = free_washes + 1 WHERE customer_id = ?',
        [booking.customer_id]
      );
    }

    // 4. Restore package usage — ONLY if booking was confirmed (credit was deducted on approval)
    if (booking.booking_type === 'package' && booking.status === 'confirmed') {
      try {
        let serviceName = booking.package_service_name;
        if (!serviceName && booking.service_id) {
          const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [booking.service_id]);
          if (svcRows.length) serviceName = svcRows[0].name;
        }

        if (serviceName) {
          const userPackageId = booking.user_package_id;
          if (userPackageId) {
            await cancelReservation(conn, userPackageId, serviceName);
            console.log(`[BOOKING] Package credit restored for cancelled booking #${id} — service: ${serviceName}`);
          } else {
            // Fallback
            const [userPkgs] = await conn.query(
              `SELECT id FROM user_packages 
               WHERE user_id = ? AND package_id = ? AND package_status = 'active'
               ORDER BY start_date DESC LIMIT 1`,
              [booking.customer_id, booking.package_id]
            );
            if (userPkgs.length) {
              await cancelReservation(conn, userPkgs[0].id, serviceName);
              console.log(`[BOOKING] Package credit restored (fallback) for cancelled booking #${id} — service: ${serviceName}`);
            }
          }
        }
      } catch (pkgErr) {
        console.error(`[BOOKING] Failed to restore package credit for booking #${id}:`, pkgErr.message);
        // Non-fatal — don't block the cancellation
      }
    }
    // Note: pending_approval package bookings don't need restore since credits weren't deducted

    await conn.commit();
    res.json({ success: true, message: 'Booking cancelled' });
  } catch (err) {
    await conn.rollback();
    console.error('Cancel booking error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// Helper to check if a booking can be updated (cutoff is 24 hours before slot time)
function checkCanChangeBooking(booking, slot) {
  if (!booking || !slot) return { canChange: false, hoursRemaining: 0 };
  
  // Format slot date and time
  const slotDateStr = new Date(slot.slot_date).toISOString().split('T')[0];
  const slotDateTime = new Date(`${slotDateStr}T${slot.start_time}`);
  
  const now = new Date();
  const diffMs = slotDateTime - now;
  const hoursRemaining = diffMs / (1000 * 60 * 60);
  
  return {
    canChange: hoursRemaining >= 24,
    hoursRemaining: parseFloat(hoursRemaining.toFixed(2))
  };
}

// GET /bookings/:id/can-change
exports.canChange = async (req, res) => {
  try {
    const { id } = req.params;
    const [bookings] = await pool.query('SELECT * FROM bookings WHERE id = ?', [id]);
    if (!bookings.length) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookings[0];
    
    // Check ownership
    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    const [slots] = await pool.query('SELECT slot_date, start_time FROM slots WHERE id = ?', [booking.slot_id]);
    if (!slots.length) {
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }
    
    const { canChange, hoursRemaining } = checkCanChangeBooking(booking, slots[0]);
    
    res.json({
      success: true,
      canChange: req.user.role === 'admin' ? true : canChange,
      hoursRemaining
    });
  } catch (err) {
    console.error('canChange error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// PATCH /bookings/:id/change-services
exports.changeServices = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id } = req.params;
    const { service_ids } = req.body;
    
    if (!Array.isArray(service_ids) || service_ids.length === 0) {
      return res.status(400).json({ success: false, error: 'Service IDs must be a non-empty array' });
    }
    
    await conn.beginTransaction();
    
    const [bookings] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
    if (!bookings.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const booking = bookings[0];
    
    // Check status: only pending_approval or confirmed bookings can be updated
    if (!['confirmed', 'pending_approval'].includes(booking.status)) {
      await conn.rollback();
      return res.status(422).json({ success: false, error: 'Only pending or confirmed bookings can be modified' });
    }
    
    // Check ownership
    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    
    // Check 24-hour cutoff
    const [slots] = await conn.query('SELECT slot_date, start_time FROM slots WHERE id = ?', [booking.slot_id]);
    if (!slots.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Slot not found' });
    }
    
    const { canChange } = checkCanChangeBooking(booking, slots[0]);
    if (!canChange && req.user.role !== 'admin') {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Cannot modify service within 24 hours of slot start time' });
    }
    
    // Get existing service links to log as old_value in audit log
    const [oldLinks] = await conn.query('SELECT service_id FROM booking_services WHERE booking_id = ?', [id]);
    const oldServiceIds = oldLinks.map(l => l.service_id);
    
    // Delete old service links
    await conn.query('DELETE FROM booking_services WHERE booking_id = ?', [id]);
    
    // Insert new service links
    for (const sid of service_ids) {
      await conn.query('INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)', [id, sid]);
    }
    
    // Recalculate duration & select primary service_id (usually the first one)
    const [services] = await conn.query('SELECT id, name, duration_minutes FROM services WHERE id IN (?)', [service_ids]);
    if (services.length !== service_ids.length) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Some service IDs are invalid' });
    }
    
    const totalDuration = services.reduce((sum, s) => sum + (s.duration_minutes || 0), 0);
    const newPrimaryServiceId = service_ids[0];
    
    // Update booking row
    await conn.query(
      'UPDATE bookings SET service_id = ?, total_duration = ? WHERE id = ?',
      [newPrimaryServiceId, totalDuration, id]
    );
    
    // Log action in v2_audit_logs
    await conn.query(
      `INSERT INTO v2_audit_logs (user_id, user_type, action, resource, resource_id, old_value, new_value, ip_address) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        req.user.id,
        req.user.role,
        'change_services',
        'booking',
        id,
        JSON.stringify(oldServiceIds),
        JSON.stringify(service_ids),
        req.ip || null
      ]
    );
    
    await conn.commit();
    
    // Send notifications (fire-and-forget)
    try {
      const messagingService = require('../services/messagingService');
      const whatsappController = require('./whatsappController');
      const [custRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [booking.customer_id]);
      
      const newServiceNames = services.map(s => s.name).join(', ');
      
      if (custRows.length && custRows[0].mobile) {
        const msg = `O3 Car Spaa: Hi ${custRows[0].name}, your services for booking #${id} have been updated to: ${newServiceNames}.`;
        messagingService.sendSMS(custRows[0].mobile, null, null, { content: msg }).catch(() => {});
        
        const waMsg = `🔄 *Services Updated*\n\nHi ${custRows[0].name},\nYour booking #${id} services have been successfully updated to:\n👉 *${newServiceNames}*\n\nThank you for choosing O3 Car Spaa!`;
        whatsappController._sendWhatsAppMessage(custRows[0].mobile, null, [], waMsg).catch(() => {});
      }
    } catch (msgErr) {
      console.error('Failed to send service change notifications:', msgErr.message);
    }
    
    res.json({
      success: true,
      message: 'Booking services updated successfully',
      data: {
        booking_id: parseInt(id),
        service_id: newPrimaryServiceId,
        total_duration: totalDuration
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('changeServices error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.createManual = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const {
      customer_id, slot_id, service_id, service_ids, package_id,
      vehicle_id, vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category,
      is_free_wash = false, use_package = false, notes, booking_notes
    } = req.body;

    let package_service_name = req.body.package_service_name;

    if (!customer_id || !slot_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Customer ID and Slot ID are required' });
    }

    // 1. Resolve vehicle data
    let resolvedBrand = vehicle_brand || null;
    let resolvedModel = vehicle_model || null;
    let resolvedRegNo = vehicle_reg_no || null;
    let resolvedVehicleId = vehicle_id || null;

    if (vehicle_id) {
      const [vRows] = await conn.query(
        'SELECT id, brand, model, registration_no FROM vehicles WHERE id = ?', [vehicle_id]
      );
      if (vRows.length) {
        resolvedBrand = vRows[0].brand;
        resolvedModel = vRows[0].model;
        resolvedRegNo = vRows[0].registration_no;
        resolvedVehicleId = vRows[0].id;
      }
    }

    // 2. Calculate total duration and total estimated amount
    let totalDuration = null;
    const allServiceIds = service_ids && service_ids.length > 0 ? service_ids : (service_id ? [service_id] : []);
    
    if (allServiceIds.length > 0) {
      const [durations] = await conn.query(
        `SELECT SUM(duration_minutes) AS total FROM services WHERE id IN (?)`,
        [allServiceIds]
      );
      totalDuration = durations[0]?.total || null;
    }

    // 3. Atomically validate & lock consecutive slots
    const manualFranchiseId = req.franchiseId || req.user?.franchise_id || 1;
    const slotLock = await validateAndLockConsecutiveSlots(conn, slot_id, totalDuration, manualFranchiseId);
    if (!slotLock.ok) {
      await conn.rollback();
      return res.status(slotLock.status).json({ success: false, error: slotLock.error });
    }
    const slot = slotLock.startSlot;
    const requiredSlotIds = slotLock.slotIds;

    // 4. Double booking guard
    const [overlapCheck] = await conn.query(
      `SELECT b.id FROM bookings b
       JOIN slots s ON b.slot_id = s.id
       WHERE b.customer_id = ?
         AND (
           (b.vehicle_id IS NOT NULL AND b.vehicle_id = ?)
           OR (b.vehicle_reg_no IS NOT NULL AND b.vehicle_reg_no = ?)
         )
         AND s.slot_date = ?
         AND b.status IN ('pending_approval', 'confirmed', 'pending_payment', 'in_progress')
         AND (
           b.slot_id IN (?)
           OR EXISTS (SELECT 1 FROM booking_slots bs WHERE bs.booking_id = b.id AND bs.slot_id IN (?))
         )`,
      [customer_id, resolvedVehicleId || 0, resolvedRegNo || '', slot.slot_date, requiredSlotIds, requiredSlotIds]
    );
    if (overlapCheck.length > 0) {
      await conn.rollback();
      return res.status(409).json({ success: false, error: 'Customer already has an active booking for this vehicle at an overlapping time on this date.' });
    }

    let calculatedTotal = 0;
    if (!is_free_wash && !use_package && allServiceIds.length > 0) {
      const cat = vehicle_category || 'sedan';
      const priceKey = `price_${cat}`;
      const [servicesList] = await conn.query(
        `SELECT price_hatchback, price_medium_hatchback, price_sedan, price_premium_sedan, price_suv FROM services WHERE id IN (?)`,
        [allServiceIds]
      );
      calculatedTotal = servicesList.reduce((sum, s) => {
        return sum + (Number(s[priceKey]) || Number(s.price_sedan) || 0);
      }, 0);
    }

    // 5. Free wash deduction
    if (is_free_wash) {
      const [loyalty] = await conn.query('SELECT free_washes FROM loyalty WHERE customer_id = ?', [customer_id]);
      if (!loyalty.length || loyalty[0].free_washes <= 0) {
        await conn.rollback();
        return res.status(422).json({ success: false, error: 'No free washes available' });
      }
      await conn.query(
        'UPDATE loyalty SET free_washes = GREATEST(0, free_washes - 1) WHERE customer_id = ?',
        [customer_id]
      );
    }

    // 6. Package deduction immediately (since it's confirmed right away)
    let packageUsed = false;
    let resolvedUserPackageId = null;
    const primaryServiceId = service_id || (allServiceIds.length > 0 ? allServiceIds[0] : null);

    if (use_package && !is_free_wash) {
      let serviceNames = [];
      if (Array.isArray(package_service_name)) {
        serviceNames = package_service_name;
      } else if (typeof package_service_name === 'string') {
        serviceNames = package_service_name.split(',').map(s => s.trim()).filter(s => s);
      }
      
      if (serviceNames.length === 0 && primaryServiceId) {
        const [svcRows] = await conn.query('SELECT name FROM services WHERE id = ?', [primaryServiceId]);
        if (svcRows.length) serviceNames = [svcRows[0].name];
      }

      if (serviceNames.length > 0) {
        const userPkgCtrl = require('./userPackagesController');
        let canonicalNames = [];

        for (const sName of serviceNames) {
          const result = await userPkgCtrl.checkAndUseService(conn, customer_id, sName, vehicle_id);
          if (!result.can_use) {
            await conn.rollback();
            return res.status(422).json({ success: false, error: `No package credits remaining for ${sName}. ${result.reason || ''}` });
          }
          resolvedUserPackageId = result.user_package_id;
          canonicalNames.push(result.canonical_service_name || sName);
        }
        packageUsed = true;
        package_service_name = canonicalNames.join(', ');
      } else {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Package service name or service ID required to use package' });
      }
    }

    const bookingType = (use_package && packageUsed) ? 'package' : 'direct';

    // 7. Increment booked_count on all required slots
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [requiredSlotIds]);

    // 8. Insert booking
    const [result] = await conn.query(
      `INSERT INTO bookings 
       (customer_id, vehicle_id, slot_id, service_id, package_id, 
        vehicle_brand, vehicle_model, vehicle_reg_no, vehicle_category, total_duration,
        status, is_free_wash, notes, booking_notes, booking_type, user_package_id, package_service_name, 
        approved_by, approved_at, advance_amount, total_amount, franchise_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'confirmed', ?, ?, ?, ?, ?, ?, ?, NOW(), 0, ?, ?)`,
      [
        customer_id, resolvedVehicleId, slot_id,
        primaryServiceId || null, package_id || null,
        resolvedBrand, resolvedModel, resolvedRegNo, vehicle_category || null, totalDuration,
        is_free_wash ? 1 : 0, notes || null, booking_notes || null,
        bookingType, resolvedUserPackageId, package_service_name || null,
        req.user.id, calculatedTotal, manualFranchiseId
      ]
    );

    const bookingId = result.insertId;

    // 9. Insert booking_services
    if (allServiceIds.length > 0) {
      for (const sid of allServiceIds) {
        await conn.query(
          'INSERT INTO booking_services (booking_id, service_id) VALUES (?, ?)',
          [bookingId, sid]
        );
      }
    }

    // 10. Insert booking_slots junction records
    for (const rSlotId of requiredSlotIds) {
      await conn.query(
        'INSERT INTO booking_slots (booking_id, slot_id) VALUES (?, ?)',
        [bookingId, rSlotId]
      );
    }

    // ─── Referral Completion & Welcome Reward Triggers ───
    try {
      const [prevBookings] = await conn.query(
        'SELECT id FROM bookings WHERE customer_id = ? AND status = "confirmed" AND id != ?',
        [customer_id, bookingId]
      );

      if (prevBookings.length === 0) {
        const [pendingRefs] = await conn.query(
          'SELECT * FROM v2_referrals WHERE referred_id = ? AND status = "pending"',
          [customer_id]
        );

        if (pendingRefs.length > 0) {
          const ref = pendingRefs[0];
          await conn.query('UPDATE v2_referrals SET status = "completed" WHERE id = ?', [ref.id]);
          let referrerPoints = 100;
          const [settingRow] = await conn.query('SELECT value FROM settings WHERE key_name = "referral_referrer_points"');
          if (settingRow.length) referrerPoints = parseInt(settingRow[0].value) || 100;

          const [referrerWallets] = await conn.query('SELECT id FROM v2_wallets WHERE customer_id = ?', [ref.referrer_id]);
          let referrerWalletId;
          if (!referrerWallets.length) {
            const [insWallet] = await conn.query(
              'INSERT INTO v2_wallets (customer_id, balance, reward_points, total_earned, total_spent) VALUES (?, 0, 0, 0, 0)',
              [ref.referrer_id]
            );
            referrerWalletId = insWallet.insertId;
          } else {
            referrerWalletId = referrerWallets[0].id;
          }

          await conn.query(
            'UPDATE v2_wallets SET reward_points = reward_points + ?, total_earned = total_earned + ? WHERE id = ?',
            [referrerPoints, referrerPoints, referrerWalletId]
          );

          await conn.query(
            `INSERT INTO v2_wallet_transactions 
             (wallet_id, customer_id, transaction_type, amount, points, description, reference_type, reference_id, balance_after)
             VALUES (?, ?, 'referral_bonus', 0, ?, ?, 'referral', ?, 0)`,
            [referrerWalletId, ref.referrer_id, referrerPoints, `Referral reward points for referring customer ID ${customer_id}`, ref.id]
          );

          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, ?, 'referral', ?, 'referral', ?)`,
            [ref.referrer_id, referrerPoints, `Referral bonus for customer ID ${customer_id}`, ref.id]
          );

          await conn.query('UPDATE v2_referrals SET status = "rewarded", reward_given = 1 WHERE id = ?', [ref.id]);
          await conn.query(
            'UPDATE referral_rewards SET status = "credited", credited_at = NOW() WHERE referrer_id = ? AND referred_id = ?',
            [ref.referrer_id, customer_id]
          );

          const [existingLoyalty] = await conn.query('SELECT id FROM loyalty WHERE customer_id = ?', [ref.referrer_id]);
          if (existingLoyalty.length > 0) {
            await conn.query('UPDATE loyalty SET credits = credits + ? WHERE customer_id = ?', [referrerPoints, ref.referrer_id]);
          } else {
            await conn.query('INSERT INTO loyalty (customer_id, credits) VALUES (?, ?)', [ref.referrer_id, referrerPoints]);
          }
          await conn.query(
            `INSERT INTO loyalty_transactions (customer_id, type, points, description) VALUES (?, 'earn', ?, 'Referral reward points awarded.')`,
            [ref.referrer_id, referrerPoints]
          );
        }

        // Trigger New Customer Welcome Reward (Update 24)
        let welcomeType = 'points';
        let welcomeValue = 0;

        const [typeRow] = await conn.query('SELECT value FROM settings WHERE key_name = "welcome_reward_type"');
        if (typeRow.length) welcomeType = typeRow[0].value;

        const [valRow] = await conn.query('SELECT value FROM settings WHERE key_name = "welcome_reward_value"');
        if (valRow.length) welcomeValue = parseFloat(valRow[0].value) || 0;

        if (welcomeType === 'points') {
          const [customerWallets] = await conn.query('SELECT id FROM v2_wallets WHERE customer_id = ?', [customer_id]);
          let customerWalletId;
          if (!customerWallets.length) {
            const [insWallet] = await conn.query(
              'INSERT INTO v2_wallets (customer_id, balance, reward_points, total_earned, total_spent) VALUES (?, 0, 0, 0, 0)',
              [customer_id]
            );
            customerWalletId = insWallet.insertId;
          } else {
            customerWalletId = customerWallets[0].id;
          }

          await conn.query(
            'UPDATE v2_wallets SET reward_points = reward_points + ?, total_earned = total_earned + ? WHERE id = ?',
            [welcomeValue, welcomeValue, customerWalletId]
          );

          await conn.query(
            `INSERT INTO v2_wallet_transactions 
             (wallet_id, customer_id, transaction_type, amount, points, description, reference_type, reference_id, balance_after)
             VALUES (?, ?, 'welcome_bonus', 0, ?, 'New customer welcome bonus points', 'booking', ?, 0)`,
            [customerWalletId, customer_id, welcomeValue, bookingId]
          );

          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, ?, 'welcome', 'New customer welcome bonus points', 'booking', ?)`,
            [customer_id, welcomeValue, bookingId]
          );

          const expiresAt = new Date();
          expiresAt.setDate(expiresAt.getDate() + 30);
          await conn.query(
            `INSERT INTO customer_rewards (customer_id, reward_type, points_awarded, discount_pct, description, expires_at)
             VALUES (?, 'welcome', ?, 0, 'New customer welcome bonus points', ?)`,
            [customer_id, welcomeValue, expiresAt]
          );

          const [existingLoyalty] = await conn.query('SELECT id FROM loyalty WHERE customer_id = ?', [customer_id]);
          if (existingLoyalty.length > 0) {
            await conn.query('UPDATE loyalty SET credits = credits + ? WHERE customer_id = ?', [welcomeValue, customer_id]);
          } else {
            await conn.query('INSERT INTO loyalty (customer_id, credits) VALUES (?, ?)', [customer_id, welcomeValue]);
          }
          await conn.query(
            `INSERT INTO loyalty_transactions (customer_id, type, points, description) VALUES (?, 'earn', ?, 'New customer welcome bonus points')`,
            [customer_id, welcomeValue]
          );
        } else if (welcomeType === 'discount') {
          await conn.query(
            'UPDATE bookings SET total_amount = GREATEST(0, total_amount - ?) WHERE id = ?',
            [welcomeValue, bookingId]
          );
          await conn.query(
            `INSERT INTO customer_rewards (customer_id, reward_type, points_awarded, discount_pct, description)
             VALUES (?, 'welcome', 0, 0, ?)`,
            [customer_id, `Welcome discount of ₹${welcomeValue} applied to booking #${bookingId}`]
          );
          await conn.query(
            `INSERT INTO v2_reward_logs (customer_id, points, action, description, reference_type, reference_id)
             VALUES (?, 0, 'welcome', ?, 'booking', ?)`,
            [customer_id, `Welcome discount of ₹${welcomeValue} applied`, bookingId]
          );
        }
      }
    } catch (rewardsErr) {
      console.error('[REWARDS] Failed to process rewards (manual booking):', rewardsErr.message);
    }

    await conn.commit();

    // Send WhatsApp confirmation
    try {
      const messagingService = require('../services/messagingService');
      const whatsappController = require('./whatsappController');
      const [custRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [customer_id]);
      const [slotRows] = await pool.query('SELECT slot_date, start_time FROM slots WHERE id = ?', [slot_id]);
      
      let serviceName = package_service_name || 'Service';
      if (serviceName === 'Service' && primaryServiceId) {
        const [svcRows] = await pool.query('SELECT name FROM services WHERE id = ?', [primaryServiceId]);
        if (svcRows.length) serviceName = svcRows[0].name;
      }

      if (custRows.length && custRows[0].mobile && slotRows.length) {
        const date = new Date(slotRows[0].slot_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
        const time = slotRows[0].start_time ? slotRows[0].start_time.substring(0, 5) : '';
        const msg = `O3 Car Spaa: Hi ${custRows[0].name}, your manual booking #${bookingId} for ${date} at ${time} is CONFIRMED! See you soon.`;
        messagingService.sendSMS(custRows[0].mobile, null, null, { content: msg }).catch(() => {});

        whatsappController.sendBookingConfirmation(custRows[0].mobile, custRows[0].name, date, time, serviceName).catch(() => {});
      }
    } catch (waErr) {
      console.error('[WA] Manual booking confirmation notification failed:', waErr.message);
    }

    res.status(201).json({
      success: true,
      data: {
        id: bookingId,
        status: 'confirmed',
        total_amount: calculatedTotal,
      },
      message: 'Manual booking created and confirmed successfully.'
    });

  } catch (err) {
    await conn.rollback();
    console.error('Manual booking creation error:', err);
    res.status(500).json({ success: false, error: err.sqlMessage || err.message || 'Server error' });
  } finally {
    conn.release();
  }
};

exports.downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { generateBookingInvoicePDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generateBookingInvoicePDF(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error('Download booking invoice error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate invoice PDF' });
  }
};

exports.firstWashEligibility = async (req, res) => {
  try {
    const customerId = req.query.customer_id || req.user.id;
    const { checkFirstWashEligibility } = require('../utils/firstWashHelper');
    const result = await checkFirstWashEligibility(pool, customerId);
    res.json({ success: true, is_eligible: result.isEligible, reason: result.reason });
  } catch (err) {
    console.error('firstWashEligibility error:', err);
    res.status(500).json({ success: false, is_eligible: false });
  }
};

// ─── RESCHEDULE BOOKING (Admin or Customer) ─────
exports.reschedule = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const slot_id = req.body.slot_id || req.body.new_slot_id;

    if (!slot_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'New slot ID is required' });
    }

    const [bookings] = await conn.query('SELECT * FROM bookings WHERE id = ? FOR UPDATE', [id]);
    if (!bookings.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }

    const booking = bookings[0];
    if (req.user.role === 'customer' && booking.customer_id !== req.user.id) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Validate and lock new consecutive slot(s)
    const slotLock = await validateAndLockConsecutiveSlots(
      conn,
      slot_id,
      booking.total_duration || 60,
      booking.franchise_id || 1
    );
    if (!slotLock.ok) {
      await conn.rollback();
      return res.status(slotLock.status).json({ success: false, error: slotLock.error });
    }

    // 1. Restore old slot(s)
    await restoreBookingSlots(conn, booking.id, booking.slot_id);

    // 2. Reserve new slot(s)
    await conn.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id IN (?)', [slotLock.slotIds]);
    for (const sid of slotLock.slotIds) {
      await conn.query('INSERT INTO booking_slots (booking_id, slot_id) VALUES (?, ?)', [booking.id, sid]);
    }

    // 3. Update booking
    const prevStatus = booking.status;
    const newStatus = (prevStatus === 'reschedule_required' || prevStatus === 'confirmed') ? 'confirmed' : prevStatus;
    const noteAppend = ` [Rescheduled from slot #${booking.slot_id} to #${slot_id}]`;

    await conn.query(
      `UPDATE bookings 
       SET slot_id = ?, status = ?, notes = CONCAT(COALESCE(notes, ''), ?) 
       WHERE id = ?`,
      [slot_id, newStatus, noteAppend, booking.id]
    );

    await conn.commit();

    // Fire-and-forget customer notification
    try {
      const messagingService = require('../services/messagingService');
      await messagingService.notify(
        booking.customer_id,
        'BOOKING_UPDATE',
        {
          message: `Your booking #${booking.id} has been successfully rescheduled to ${slotLock.startSlot.slot_date} at ${slotLock.startSlot.start_time}.`
        },
        { type: 'booking', id: booking.id }
      );
    } catch (nErr) {
      console.warn('[NOTIFY] Failed to notify customer on reschedule:', nErr.message);
    }

    const io = req.app.get('io');
    if (io) {
      io.emit('booking_rescheduled', { booking_id: booking.id, new_slot_id: slot_id });
    }

    res.json({
      success: true,
      message: 'Booking rescheduled successfully',
      data: {
        id: booking.id,
        slot_id,
        status: newStatus,
        slot_date: slotLock.startSlot.slot_date,
        start_time: slotLock.startSlot.start_time,
      }
    });
  } catch (err) {
    await conn.rollback();
    console.error('Booking reschedule error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

