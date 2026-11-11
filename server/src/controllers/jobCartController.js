const pool = require('../config/db');

// Dates come back to the app as UTC timestamps (19 Oct IST = '2026-10-18T18:30:00.000Z'); store the studio's calendar day.
function toDateOnly(v) {
  if (!v) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(String(v))) return String(v);
  const d = new Date(v);
  if (isNaN(d)) return null;
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10);
}
const { guessCarCategory } = require('../utils/carCategory');
const cloudinary = require('../config/cloudinary');
const { generateInvoicePDF, generateJobCardPDF } = require('../services/invoiceService');


const { logAudit } = require('./auditController');
const { nextInvoiceNumber } = require('../services/numbering');

const checkStaffModifyPermission = (user, cart) => {
  if (user.role !== 'staff') return true;
  // work that is still going on (car picked up early, 2-day coating) stays editable; finished jobs only on their day
  if (cart.status && !['complete', 'cancelled'].includes(cart.status)) return true;
  const d = new Date(cart.visit_date);
  const cartDateStr = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const today = new Date();
  const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return cartDateStr === todayStr;
};

// ─── VEHICLE LOOKUP ─────────────────────────
exports.lookup = async (req, res) => {
  try {
    const { regNo } = req.params;
    const [vehicles] = await pool.query(
      `SELECT v.*, u.id AS customer_id, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
              u.custom_discount_type, u.custom_discount_value, u.crm_notes
       FROM vehicles v JOIN users u ON v.customer_id = u.id
       WHERE v.registration_no = ?`,
      [regNo.toUpperCase().replace(/\s/g, '')]
    );
    if (!vehicles.length) return res.status(404).json({ success: false, error: 'Vehicle not found' });

    const vehicle = vehicles[0];
    const [visitRows] = await pool.query(
      'SELECT COALESCE(MAX(visit_number), 0) AS max_visit FROM job_carts WHERE vehicle_id = ?',
      [vehicle.id]
    );
    res.json({
      success: true,
      data: {
        found: true,
        vehicle: {
          id: vehicle.id,
          registration_no: vehicle.registration_no,
          brand: vehicle.brand,
          model: vehicle.model,
          variant: vehicle.variant || vehicle.car_variant || null,
          customer_id: vehicle.customer_id,
          car_year: vehicle.car_year || vehicle.registration_year || vehicle.manufacture_year || null,
          registration_year: vehicle.registration_year || vehicle.car_year || vehicle.manufacture_year || null,
          manufacture_year: vehicle.manufacture_year || vehicle.car_year || null,
          // car type decides the service price — stored on the vehicle, else guessed from brand/model
          category: vehicle.category || require('../utils/carCategory').guessCarCategory(vehicle.brand, vehicle.model) || null
        },
        customer: {
          id: vehicle.customer_id,
          name: vehicle.customer_name,
          mobile: vehicle.customer_mobile,
          email: vehicle.customer_email,
          custom_discount_type: vehicle.custom_discount_type || 'none',
          custom_discount_value: parseFloat(vehicle.custom_discount_value || 0),
          crm_notes: vehicle.crm_notes || null
        },
        visit_count: visitRows[0].max_visit,
        next_visit_number: visitRows[0].max_visit + 1,
      },
    });
  } catch (err) {
    console.error('Lookup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ACCESS HELPERS ─────────────────────────
const { validateRegNo, normalizeMobile, isValidMobile, isValidEmail } = require('../utils/validators');
const referralService = require('../services/referralService');

const CAR_CATEGORIES = ['hatchback', 'semi_sedan', 'sedan', 'premium_sedan', 'suv', 'premium_suv'];

/**
 * Loads a job card and enforces franchise ownership (+ customer ownership / staff same-day rule).
 * Returns the cart row, or null after sending the error response.
 */
async function loadCartForAccess(req, res, id, { write = false, db = pool } = {}) {
  const [rows] = await db.query(
    `SELECT jc.*, v.customer_id FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE jc.id = ?`,
    [id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: 'Job card not found' }); return null; }
  const cart = rows[0];
  if (req.user.role === 'customer') {
    if (cart.customer_id !== req.user.id || write) { res.status(403).json({ success: false, error: 'Not authorized' }); return null; }
    return cart;
  }
  if (!req.isGlobalAdmin && Number(cart.franchise_id || 1) !== Number(req.franchiseId || 1)) {
    res.status(403).json({ success: false, error: 'This job card belongs to another franchise' });
    return null;
  }
  if (write && !checkStaffModifyPermission(req.user, cart)) {
    res.status(403).json({ success: false, error: "Staff can only modify today's job cards" });
    return null;
  }
  return cart;
}

// Bill totals from the card's services (same formula as Complete). advance_paid = money already received on this card.
async function recalcJobCart(db, id) {
  const [[c]] = await db.query('SELECT * FROM job_carts WHERE id = ?', [id]);
  if (!c) return null;
  const [[t]] = await db.query('SELECT COALESCE(SUM(service_price + labor_charges), 0) AS s FROM job_services WHERE job_cart_id = ?', [id]);
  const [[pr]] = await db.query('SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS s FROM job_products jp JOIN job_services js ON jp.job_service_id = js.id WHERE js.job_cart_id = ?', [id]);
  const subtotal = Number(t.s) + Number(pr.s);
  let dVal = Math.max(0, Number(c.discount_value) || 0);
  if (c.discount_type === 'percentage' && dVal > 100) dVal = 100;
  const disc = Math.min(subtotal, c.discount_type === 'percentage' ? subtotal * dVal / 100 : (c.discount_type === 'fixed' ? dVal : 0));
  const gstPct = c.gst_type === 'with_gst' ? Number(c.gst_pct || 0) : 0;
  const gst = Math.round((subtotal - disc) * gstPct) / 100;
  const total = Math.round(Math.max(0, subtotal - disc + gst + Number(c.pickup_charge || 0)) * 100) / 100;
  const paid = Number(c.advance_paid || 0);
  const balance = Math.round(Math.max(0, total - paid) * 100) / 100;
  let payStatus = c.payment_status;
  if (c.payment_status !== 'refunded' && (c.status === 'complete' || ['paid', 'partial'].includes(c.payment_status))) {
    payStatus = balance <= 0.5 ? (paid > 0 || total === 0 ? 'paid' : 'pending') : (paid > 0 ? 'partial' : 'pending');
  }
  await db.query('UPDATE job_carts SET subtotal = ?, discount_amount = ?, gst_amount = ?, total_amount = ?, balance_due = ?, payment_status = ? WHERE id = ?',
    [subtotal, disc, gst, total, balance, payStatus, id]);
  return { subtotal, total, paid, balance, payStatus, overpaid: Math.max(0, Math.round((paid - total) * 100) / 100) };
}
const isAdminUser = (u) => ['admin', 'super_admin'].includes(u?.role);
const isPaidCart = (c) => c.payment_status === 'paid' || (c.status === 'complete' && Number(c.advance_paid || 0) > 0);
const badMoney = (...vals) => vals.some(v => v !== undefined && v !== null && v !== '' && !(Number(v) >= 0));
const badProducts = (products) => Array.isArray(products) && products.some(p => badMoney(p?.quantity, p?.unit_cost));

async function validateDiscountApprover(db, approverId, franchiseId) {
  const [rows] = await db.query(
    `SELECT id, name, role FROM users WHERE id = ? AND is_active = 1 AND is_deleted = 0
       AND (role = 'super_admin' OR (role = 'admin' AND franchise_id = ?))`,
    [approverId, franchiseId]
  );
  return rows[0] || null;
}

// ─── DISCOUNT APPROVERS (Super Admin + franchise admins) ─
exports.discountApprovers = async (req, res) => {
  try {
    const fid = req.franchiseId || 1;
    const [rows] = await pool.query(
      `SELECT id, name, role FROM users
       WHERE is_active = 1 AND is_deleted = 0 AND (role = 'super_admin' OR (role = 'admin' AND franchise_id = ?))
       ORDER BY role = 'super_admin' DESC, name`,
      [fid]
    );
    res.json({ success: true, data: rows.map(r => ({ ...r, label: `${r.name} (${r.role === 'super_admin' ? 'Super Admin' : 'Admin'})` })) });
  } catch (err) {
    console.error('discountApprovers error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE JOB CARD (one transaction: customer, vehicle, card, services, referral) ─
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const b = req.body || {};
    const regCheck = validateRegNo(b.registration_no || b.regNo || b.reg_no || b.vehicle_no || '');
    if (!regCheck.valid) return res.status(400).json({ success: false, error: regCheck.error, field: 'registration_no' });
    const regNo = regCheck.value;

    const car_brand = String(b.car_brand || b.brand || '').trim();
    const car_model = String(b.car_model || b.model || '').trim();
    if (!car_brand || !car_model) return res.status(400).json({ success: false, error: 'Car brand and model are required' });
    const car_variant = b.car_variant ? String(b.car_variant).trim().slice(0, 80) : null;
    const regYear = b.car_registration_year ? parseInt(b.car_registration_year, 10) : null;
    if (regYear && (regYear < 1980 || regYear > new Date().getFullYear() + 1)) {
      return res.status(400).json({ success: false, error: 'Registration year is invalid' });
    }
    const carCategory = CAR_CATEGORIES.includes(b.car_category) ? b.car_category : null;

    const discountValue = Math.max(0, parseFloat(b.discount_value || 0) || 0);
    const discountType = b.discount_type === 'percentage' ? 'percentage' : 'fixed';
    if (discountType === 'percentage' && discountValue > 100) return res.status(400).json({ success: false, error: 'Discount cannot exceed 100%' });

    const franchiseId = req.franchiseId || req.user?.franchise_id || 1;
    let approver = null;
    if (discountValue > 0) {
      if (!b.discount_reason || !String(b.discount_reason).trim()) {
        return res.status(400).json({ success: false, error: 'Discount reason is required when a discount is applied' });
      }
      if (!b.discount_approved_by) {
        return res.status(400).json({ success: false, error: 'Select who approved the discount (Super Admin or Admin)' });
      }
      approver = await validateDiscountApprover(conn, b.discount_approved_by, franchiseId);
      if (!approver) return res.status(400).json({ success: false, error: 'Discount approver must be the Super Admin or an Admin of this franchise' });
    }

    const services = Array.isArray(b.services) ? b.services.filter(s => s && String(s.service_name || '').trim()) : [];
    for (const s of services) {
      if (/ppf|film/i.test(s.service_name) && !String(s.custom_notes || '').trim()) {
        return res.status(400).json({ success: false, error: `Add the coverage note for "${s.service_name}" (e.g. Bonnet PPF)` });
      }
      for (const k of ['service_price', 'labor_charges']) {
        if (s[k] !== undefined && (isNaN(Number(s[k])) || Number(s[k]) < 0)) {
          return res.status(400).json({ success: false, error: `Invalid ${k.replace('_', ' ')} for "${s.service_name}"` });
        }
      }
    }

    await conn.beginTransaction();

    // ── Vehicle & customer ──
    let newCustomer = false; // a brand-new customer can't have a package
    let vehicleId;
    let custId = b.customer_id ? parseInt(b.customer_id, 10) : null;
    let customerName = null;
    const [existingVehicle] = await conn.query(
      'SELECT v.id, v.customer_id, u.name FROM vehicles v JOIN users u ON u.id = v.customer_id WHERE v.registration_no = ?',
      [regNo]
    );

    if (existingVehicle.length) {
      vehicleId = existingVehicle[0].id;
      custId = existingVehicle[0].customer_id;
      customerName = existingVehicle[0].name;
      await conn.query(
        `UPDATE vehicles SET brand = ?, model = ?, registration_year = COALESCE(?, registration_year),
           category = COALESCE(?, category) WHERE id = ?`,
        [car_brand, car_model, regYear, carCategory, vehicleId]
      );
    } else {
      if (custId) {
        const [c] = await conn.query("SELECT id, name FROM users WHERE id = ? AND role = 'customer' AND is_deleted = 0", [custId]);
        if (!c.length) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Selected customer not found' }); }
        customerName = c[0].name;
      } else {
        const mobile = normalizeMobile(b.customer_mobile);
        if (!isValidMobile(b.customer_mobile)) {
          await conn.rollback();
          return res.status(400).json({ success: false, error: 'Enter a valid 10-digit customer mobile number', field: 'customer_mobile' });
        }
        const name = String(b.customer_name || '').trim();
        if (!name) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Customer name is required', field: 'customer_name' }); }

        const [byMobile] = await conn.query('SELECT id, name, role FROM users WHERE mobile = ? AND is_deleted = 0', [mobile]);
        if (byMobile.length) {
          if (byMobile[0].role !== 'customer') {
            await conn.rollback();
            return res.status(409).json({ success: false, error: `Mobile ${mobile} belongs to a staff/admin account — use the customer's own number`, field: 'customer_mobile' });
          }
          custId = byMobile[0].id;
          customerName = byMobile[0].name;
        } else {
          let email = b.customer_email ? String(b.customer_email).trim().toLowerCase() : null;
          if (email && !isValidEmail(email)) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Customer email is invalid', field: 'customer_email' }); }
          if (email) {
            const [byEmail] = await conn.query('SELECT id FROM users WHERE email = ?', [email]);
            if (byEmail.length) { await conn.rollback(); return res.status(409).json({ success: false, error: `Email ${email} is already used by another account`, field: 'customer_email' }); }
          }
          // No password: the customer activates the account with an OTP on their own phone
          const [newUser] = await conn.query(
            "INSERT INTO users (name, mobile, email, password_hash, role, franchise_id) VALUES (?, ?, ?, 'manual', 'customer', ?)",
            [name.slice(0, 100), mobile, email, franchiseId]
          );
          custId = newUser.insertId;
          customerName = name;
          newCustomer = true;
          await conn.query('INSERT IGNORE INTO loyalty (customer_id) VALUES (?)', [custId]);
        }
      }
      const [newVehicle] = await conn.query(
        'INSERT INTO vehicles (registration_no, customer_id, brand, model, registration_year, category) VALUES (?, ?, ?, ?, ?, ?)',
        [regNo, custId, car_brand, car_model, regYear, carCategory || guessCarCategory(car_brand, car_model) || 'sedan']
      );
      vehicleId = newVehicle.insertId;
    }

    // Open job card for the same car? Don't create a second one by accident (double click / retry).
    const [openCards] = await conn.query(
      "SELECT id FROM job_carts WHERE vehicle_id = ? AND status IN ('draft','open') AND DATE(created_at) = CURDATE() ORDER BY id DESC LIMIT 1",
      [vehicleId]
    );
    if (openCards.length && !b.allow_duplicate) {
      await conn.rollback();
      return res.status(409).json({
        success: false,
        error: `${regNo} already has an open job card today (#${openCards[0].id}). Open it instead of creating a new one.`,
        code: 'OPEN_JOB_EXISTS',
        existing_id: openCards[0].id,
      });
    }

    if (b.booking_id) {
      const [[forBooking]] = await conn.query("SELECT id FROM job_carts WHERE booking_id = ? AND status <> 'cancelled' LIMIT 1", [b.booking_id]);
      if (forBooking) {
        await conn.rollback();
        return res.status(409).json({ success: false, error: `This booking already has job card #${forBooking.id}`, code: 'OPEN_JOB_EXISTS', existing_id: forBooking.id });
      }
    }
    const [visitRows] = await conn.query('SELECT COALESCE(MAX(visit_number), 0) + 1 AS next_visit FROM job_carts WHERE vehicle_id = ?', [vehicleId]);

    let bAdvance = 0, bTotal = 0, bPickupType = 'none', bPickupCharge = 0;
    if (b.booking_id) {
      // the advance counts only once money was really taken (counter payment or a confirmed QR)
      const [bRows] = await conn.query('SELECT IF(advance_payment_id IS NULL, 0, advance_amount) AS advance_amount, total_amount, pickup_type, pickup_charge FROM bookings WHERE id = ?', [b.booking_id]);
      if (bRows.length) {
        bAdvance = parseFloat(bRows[0].advance_amount || 0);
        bTotal = parseFloat(bRows[0].total_amount || 0);
        bPickupType = bRows[0].pickup_type || 'none';
        bPickupCharge = parseFloat(bRows[0].pickup_charge || 0);
      }
    }

    let referrer = await referralService.resolveReferrer(conn, b, franchiseId, custId);
    if (!referrer) {
      // Customer signed up with someone's referral code → that customer earns on the first job card
      const [[rb]] = await conn.query(
        `SELECT r.id, r.name, r.mobile FROM users c JOIN users r ON r.id = c.referred_by AND r.role = 'customer'
         WHERE c.id = ? AND NOT EXISTS (SELECT 1 FROM job_carts jc JOIN vehicles v ON v.id = jc.vehicle_id WHERE v.customer_id = c.id)`,
        [custId]
      );
      if (rb) referrer = { referrer_type: 'customer', referrer_user_id: rb.id, referrer_name: rb.name, referrer_mobile: rb.mobile };
    }
    if (!referrer) {
      // Referred with "Refer a friend" (by a customer or an employee) → the referrer earns on this first job card
      const [[ri]] = await conn.query(
        `SELECT ri.referrer_type, r.id, r.name, r.mobile FROM users c
           JOIN referral_invites ri ON ri.friend_mobile = RIGHT(c.mobile, 10) AND ri.created_at >= DATE_SUB(NOW(), INTERVAL 180 DAY)
           JOIN users r ON r.id = ri.referrer_user_id AND r.is_deleted = 0
         WHERE c.id = ? AND r.id <> c.id AND NOT EXISTS (SELECT 1 FROM job_carts jc JOIN vehicles v ON v.id = jc.vehicle_id WHERE v.customer_id = c.id)
         ORDER BY ri.id DESC LIMIT 1`,
        [custId]
      ).catch(() => [[null]]);
      if (ri) referrer = { referrer_type: ri.referrer_type, referrer_user_id: ri.id, referrer_name: ri.name, referrer_mobile: ri.mobile };
    }
    const teamJson = Array.isArray(b.team_incentive_users) ? JSON.stringify(b.team_incentive_users.map(Number).filter(Boolean)) : null;
    const crypto = require('crypto');

    const [result] = await conn.query(
      `INSERT INTO job_carts
       (vehicle_id, visit_date, visit_number, status, notes, created_by, booking_id, advance_amount, advance_paid, balance_due,
        pickup_type, pickup_charge, pre_inspector_name, personal_items_notes, franchise_id, referral_person,
        referrer_type, referrer_user_id, referrer_name, referrer_mobile, handler_id, technician_id, team_incentive_users,
        incentive_amount, incentive_split_type, discount_type, discount_value, discount_reason, discount_reference,
        discount_approved_by, car_category, public_token, current_stage)
       VALUES (?, ?, ?, 'draft', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'Received')`,
      [
        vehicleId, b.visit_date || new Date(), visitRows[0].next_visit, b.notes || null, req.user.id, b.booking_id || null,
        bAdvance, bAdvance, Math.max(0, bTotal - bAdvance), bPickupType, bPickupCharge,
        b.pre_inspector_name || null, b.personal_items_notes || null, franchiseId,
        referrer ? referrer.referrer_name : null,
        referrer?.referrer_type || null, referrer?.referrer_user_id || null, referrer?.referrer_name || null, referrer?.referrer_mobile || null,
        b.handler_id || null, b.technician_id || null, teamJson,
        parseFloat(b.incentive_amount) || 0, b.incentive_split_type || 'team_split',
        discountType, discountValue, discountValue > 0 ? String(b.discount_reason).trim() : null,
        approver ? approver.name : null, approver ? approver.id : null, carCategory,
        crypto.randomBytes(16).toString('hex'),
      ]
    );
    const jobCartId = result.insertId;
    // Odometer for this visit + car colour (printed on the invoice)
    const kmReading = b.km_reading ? String(b.km_reading).replace(/[^0-9]/g, '').slice(0, 9) : null;
    if (kmReading) await conn.query('UPDATE job_carts SET km_reading = ? WHERE id = ?', [kmReading, jobCartId]);
    if (b.car_color) await conn.query('UPDATE vehicles SET color = ? WHERE id = ?', [String(b.car_color).trim().slice(0, 40), vehicleId]);

    // ── Services & products ──
    let subtotal = 0;
    for (const s of services) {
      // Walk-in visit of an existing customer with an active package: this service uses 1 package credit (free on the bill)
      if (s.use_package) {
        const used = newCustomer ? { can_use: false, reason: 'New customer has no package' }
          : await require('./userPackagesController').checkAndUseService(conn, custId, String(s.service_name).trim(), vehicleId);
        if (!used.can_use) {
          await conn.rollback();
          return res.status(422).json({ success: false, error: `Can't use package for "${s.service_name}": ${used.reason || 'no credits left'}` });
        }
        s.service_price = 0; s.labor_charges = 0;
        s._pkg = { id: used.user_package_id, name: used.canonical_service_name };
        s.custom_notes = [`From package (${used.package_name}, ${used.remaining} left)`, s.custom_notes].filter(Boolean).join(' · ');
      }
      const price = Number(s.service_price) || 0;
      const labor = Number(s.labor_charges) || 0;
      const [svc] = await conn.query(
        'INSERT INTO job_services (job_cart_id, service_name, service_price, labor_charges, custom_notes, last_edited_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [jobCartId, String(s.service_name).trim().slice(0, 150), price, labor, s.custom_notes ? String(s.custom_notes).trim() : null]
      );
      if (s._pkg) await conn.query('UPDATE job_services SET user_package_id = ?, package_service_name = ?, package_credit_held = 1 WHERE id = ?', [s._pkg.id, s._pkg.name, svc.insertId]);
      subtotal += price + labor;
      for (const p of (Array.isArray(s.products) ? s.products : [])) {
        const qty = Number(p.quantity) || 0;
        if (!p.product_id || qty <= 0) continue;
        await conn.query('INSERT INTO job_products (job_service_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
          [svc.insertId, p.product_id, qty, Number(p.unit_cost) || 0]);
        subtotal += qty * (Number(p.unit_cost) || 0);
      }
    }
    const discountAmt = discountValue > 0
      ? Math.min(subtotal, discountType === 'percentage' ? subtotal * discountValue / 100 : discountValue) : 0;
    const total = Math.max(0, subtotal - discountAmt + bPickupCharge);
    await conn.query(
      'UPDATE job_carts SET subtotal = ?, discount_amount = ?, total_amount = ?, balance_due = GREATEST(0, ? - advance_paid) WHERE id = ?',
      [subtotal, discountAmt, total, total, jobCartId]
    );

    if (referrer) {
      await referralService.syncForSource(conn, {
        sourceType: 'job_card', sourceId: jobCartId, franchiseId, referrer,
        referredCustomerId: custId, referredCustomerName: customerName, billAmount: total, finalised: false,
        label: `Job card #${jobCartId} — ${regNo}`, userId: req.user.id,
      });
    }

    await conn.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [jobCartId, franchiseId, req.user.id, req.user.name || req.user.role, req.user.role,
        `Job card created${services.length ? ` with ${services.length} service(s)` : ''}${approver ? `; discount approved by ${approver.name}` : ''}`]
    );
    // the car is now in the studio — the booking completes only when the studio completes the job card
    // auto-drafted from a confirmed booking: the car hasn't arrived yet, so the booking stays confirmed until the card is opened
    if (b.booking_id && !b.auto_from_booking) await conn.query("UPDATE bookings SET status = 'in_progress' WHERE id = ? AND status IN ('confirmed','pending_approval')", [b.booking_id]);

    await conn.commit();

    if (discountValue > 0) {
      logAudit(req.user.id, 'DISCOUNT_APPLIED', 'job_cart', jobCartId,
        { discount_type: discountType, discount_value: discountValue, approved_by: approver?.name }, req.ip).catch(() => {});
    }
    res.status(201).json({ success: true, data: { id: jobCartId, customer_id: custId }, message: 'Job card created' });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Create job cart error:', err);
    if (err.code === 'ER_DUP_ENTRY') {
      const field = /mobile/.test(err.sqlMessage) ? 'mobile number' : /email/.test(err.sqlMessage) ? 'email' : 'record';
      return res.status(409).json({ success: false, error: `This ${field} already exists in the system` });
    }
    res.status(500).json({ success: false, error: 'Could not create the job card. Please try again.' });
  } finally {
    conn.release();
  }
};

// ─── LIST JOB CARTS ─────────────────────────
// Technician view: staff-role users without any money permission see no prices and only today's cars.
// Staff-role users given money access (e.g. an accountant role) see the full card.
const MONEY_PERMS = /^(payments|accounts|invoices|billing|balance_sheet|quotations)\./;
const isTechView = (req) => req.user.role === 'staff' && !(req.userPermissions || []).some(p => MONEY_PERMS.test(p));

exports.list = async (req, res) => {
  try {
    const { status, search, page = 1, limit = 20, from_date, to_date, category } = req.query;

    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    // Tenant isolation: Scoped by franchise_id
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('jc.franchise_id')
      : { clause: ' AND (jc.franchise_id = ? OR jc.franchise_id IS NULL)', params: [req.franchiseId || 1] };
    where += fCond.clause;
    params.push(...fCond.params);

    if (req.user.role === 'customer') {
      where += " AND v.customer_id = ? AND jc.status <> 'draft'";
      params.push(req.user.id);
    }
    if (isTechView(req)) {
      where += ' AND DATE(jc.visit_date) = CURDATE()';
    }
    if (status && status !== 'all') {
      where += ' AND jc.status = ?';
      params.push(status);
    } else {
      where += " AND jc.status != 'cancelled'";
    }

    if (from_date) {
      where += ' AND jc.visit_date >= ?';
      params.push(from_date);
    }
    if (to_date) {
      where += ' AND jc.visit_date <= ?';
      params.push(to_date);
    }
    if (search) {
      where += ' AND (v.registration_no LIKE ? OR u.name LIKE ? OR v.brand LIKE ? OR v.model LIKE ? OR u.mobile LIKE ?)';
      const s = `%${search}%`;
      params.push(s, s, s, s, s);
    }

    if (category && category !== 'all') {
      let catKeyword = '';
      if (category === 'ceramic') catKeyword = 'ceramic|coating|9h|10h|graphene';
      else if (category === 'wash') catKeyword = 'wash|spaa|spa|foam|waterless|shampoo';
      else if (category === 'denting') catKeyword = 'dent|paint|tinker|scratch|rubbing';
      else if (category === 'ppf') catKeyword = 'ppf|film|wrap|tpu|tph';
      else if (category === 'interior') catKeyword = 'interior|seat|carpet|dashboard|upholstery|vacuum';

      if (catKeyword) {
        where += ` AND jc.id IN (
          SELECT js.job_cart_id FROM job_services js
          WHERE LOWER(js.service_name) REGEXP ?
        )`;
        params.push(catKeyword);
      } else if (category === 'other') {
        where += ` AND jc.id IN (
          SELECT js.job_cart_id FROM job_services js
          WHERE LOWER(js.service_name) NOT REGEXP 'ceramic|coating|9h|10h|graphene|wash|spaa|spa|foam|waterless|shampoo|dent|paint|tinker|scratch|rubbing|ppf|film|wrap|tpu|tph|interior|seat|carpet|dashboard|upholstery|vacuum'
        )`;
      }
    }


    const countQuery = `SELECT COUNT(*) AS total FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id JOIN users u ON v.customer_id = u.id WHERE ${where}`;
    const [countRows] = await pool.query(countQuery, params);

    const dataQuery = `
      SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.notes, jc.created_at, jc.completed_at, jc.invoice_number, jc.current_stage, jc.public_token,
             v.registration_no, v.brand, v.model,
             u.name AS customer_name, u.mobile AS customer_mobile,
             (SELECT COUNT(*) FROM job_services WHERE job_cart_id = jc.id) AS services_count,
             COALESCE(NULLIF(jc.total_amount, 0), GREATEST(0, ((SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)) - COALESCE(jc.discount_amount, 0))) AS total_amount
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE ${where}
      ORDER BY jc.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    if (isTechView(req)) {
      rows.forEach(r => {
        delete r.total_amount;
        delete r.customer_mobile;
      });
    }

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('List job carts error:', err.message);
    res.json({
      success: true,
      data: [],
      pagination: { page: parseInt(req.query?.page) || 1, limit: parseInt(req.query?.limit) || 20, total: 0 },
    });
  }

};

// ─── GET ONE JOB CART ───────────────────────
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params;
    const [carts] = await pool.query(`
      SELECT jc.*, v.registration_no, v.brand, v.model, v.customer_id,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
             h.name AS handler_name, h.mobile AS handler_mobile,
             t.name AS technician_name, t.mobile AS technician_mobile
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      LEFT JOIN users h ON jc.handler_id = h.id
      LEFT JOIN users t ON jc.technician_id = t.id
      WHERE jc.id = ?
    `, [id]);

    if (!carts.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    const cart = carts[0];

    // Multi-tenant isolation: non-super admin can only view job card for their own franchise
    if (!req.isSuperAdmin && cart.franchise_id && req.franchiseId && parseInt(cart.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot access job card from another franchise' });
    }

    // Customer can only see own carts
    if (req.user.role === 'customer' && cart.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    // Fetch services
    const [services] = await pool.query(
      'SELECT * FROM job_services WHERE job_cart_id = ? ORDER BY id',
      [id]
    );

    // Fetch ALL products for this job cart in ONE query (fixes N+1)
    const serviceIds = services.map(s => s.id);
    let allProducts = [];
    if (serviceIds.length > 0) {
      const [prodRows] = await pool.query(`
        SELECT jp.*, inv.product_name, inv.unit
        FROM job_products jp JOIN inventory inv ON jp.product_id = inv.id
        WHERE jp.job_service_id IN (?)
      `, [serviceIds]);
      allProducts = prodRows;
    }

    // Group products by service and calculate subtotals
    for (const svc of services) {
      svc.products = allProducts.filter(p => p.job_service_id === svc.id);
      const prodCost = svc.products.reduce((sum, p) => sum + parseFloat(p.quantity) * parseFloat(p.unit_cost), 0);
      svc.subtotal = parseFloat(svc.service_price) + parseFloat(svc.labor_charges) + prodCost;

      // Staff: hide prices
      if (isTechView(req)) {
        delete svc.service_price;
        delete svc.labor_charges;
        delete svc.subtotal;
        svc.products.forEach(p => { delete p.unit_cost; });
      }
    }

    // Fetch photos
    const [photos] = await pool.query('SELECT * FROM job_photos WHERE job_cart_id = ? ORDER BY uploaded_at', [id]);

    // Fetch edit logs (Job card dates and history)
    const [editLogs] = await pool.query(
      'SELECT * FROM job_card_edit_logs WHERE job_cart_id = ? ORDER BY edited_at DESC',
      [id]
    );

    // Fetch incentive splits
    const [incentiveSplits] = await pool.query(
      'SELECT * FROM incentive_splits WHERE job_cart_id = ? ORDER BY id ASC',
      [id]
    );

    let totalAmount = req.user.role !== 'staff'
      ? services.reduce((sum, s) => sum + (s.subtotal || 0), 0)
      : undefined;

    if (totalAmount !== undefined && cart.pickup_charge) {
      totalAmount += parseFloat(cart.pickup_charge || 0);
    }
    // the card's discount (offer / first wash / manual) comes off the total shown to the studio
    if (totalAmount !== undefined && Number(cart.discount_amount) > 0) {
      totalAmount = Math.max(0, totalAmount - Number(cart.discount_amount));
    }

    res.json({
      success: true,
      data: {
        id: cart.id,
        vehicle: { id: cart.vehicle_id, registration_no: cart.registration_no, brand: cart.brand, model: cart.model, customer_id: cart.customer_id },
        visit_date: cart.visit_date,
        visit_number: cart.visit_number,
        status: cart.status,
        notes: cart.notes,
        created_at: cart.created_at,
        updated_at: cart.updated_at,
        completed_at: cart.completed_at,
        invoice_number: cart.invoice_number,
        referral_person: cart.referral_person || null,
        referrer_type: cart.referrer_type || null,
        referrer_user_id: cart.referrer_user_id || null,
        referrer_name: cart.referrer_name || null,
        referrer_mobile: cart.referrer_mobile || null,
        discount_approved_by: cart.discount_approved_by || null,
        discount_approved_by_name: cart.discount_approved_by ? ((await pool.query('SELECT name FROM users WHERE id = ?', [cart.discount_approved_by]))[0][0]?.name || null) : null,
        car_category: cart.car_category || null,
        current_stage: cart.current_stage || 'Received',
        public_token: cart.public_token,
        franchise_id: cart.franchise_id,
        handler_id: cart.handler_id || null,
        handler_name: cart.handler_name || null,
        handler_mobile: cart.handler_mobile || null,
        technician_id: cart.technician_id || null,
        technician_name: cart.technician_name || null,
        technician_mobile: cart.technician_mobile || null,
        team_incentive_users: cart.team_incentive_users || null,
        team_incentive_names: await (async () => {
          let ids = [];
          try { ids = typeof cart.team_incentive_users === 'string' ? JSON.parse(cart.team_incentive_users) : (cart.team_incentive_users || []); } catch { ids = []; }
          ids = (Array.isArray(ids) ? ids : []).map(Number).filter(Boolean);
          if (!ids.length) return [];
          const [rows] = await pool.query('SELECT name FROM users WHERE id IN (?)', [ids]);
          return rows.map(r => r.name);
        })(),
        incentive_amount: parseFloat(cart.incentive_amount || 0),
        incentive_split_type: cart.incentive_split_type || 'team_split',
        loyalty_points_earned: cart.loyalty_points_earned || 0,
        edit_logs: editLogs,
        incentive_splits: incentiveSplits,
        customer: isTechView(req)
          ? { id: cart.customer_id, name: cart.customer_name }
          : { id: cart.customer_id, name: cart.customer_name, mobile: cart.customer_mobile, email: cart.customer_email },
        services,
        photos,
        subtotal: isTechView(req) ? undefined : (parseFloat(cart.subtotal) || (totalAmount ? totalAmount - parseFloat(cart.pickup_charge || 0) : 0)),
        total_amount: totalAmount,
        discount_type: isTechView(req) ? undefined : (cart.discount_type || 'fixed'),
        discount_value: isTechView(req) ? undefined : (parseFloat(cart.discount_value) || 0),
        discount_amount: isTechView(req) ? undefined : (parseFloat(cart.discount_amount) || 0),
        discount_reason: isTechView(req) ? undefined : (cart.discount_reason || null),
        discount_reference: isTechView(req) ? undefined : (cart.discount_reference || null),
        gst_type: isTechView(req) ? undefined : (cart.gst_type || 'with_gst'),
        gst_pct: isTechView(req) ? undefined : (parseFloat(cart.gst_pct) || 18.00),
        gst_amount: isTechView(req) ? undefined : (parseFloat(cart.gst_amount) || 0),
        invoice_notes: isTechView(req) ? undefined : cart.invoice_notes,
        advance_amount: isTechView(req) ? undefined : cart.advance_amount,
        advance_paid: isTechView(req) ? undefined : cart.advance_paid,
        balance_due: isTechView(req) ? undefined : cart.balance_due,
        payment_status: isTechView(req) ? undefined : cart.payment_status,
        pickup_type: isTechView(req) ? undefined : cart.pickup_type,
        pickup_charge: isTechView(req) ? undefined : parseFloat(cart.pickup_charge || 0),
        pre_inspector_name: cart.pre_inspector_name || null,
        personal_items_notes: cart.personal_items_notes || null,
        edit_logs: editLogs || [],
        last_edited_at: editLogs?.length ? editLogs[0].edited_at : (cart.updated_at || null),
      },
    });
  } catch (err) {
    console.error('Get job cart error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE JOB CART ────────────────────────
exports.update = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      visit_date, notes, discount_type, discount_value, discount_reason,
      gst_type, gst_pct, pickup_type, pickup_charge, advance_paid, invoice_notes,
      pre_inspector_name, personal_items_notes,
      referral_person, handler_id, technician_id, team_incentive_users,
      incentive_amount, incentive_split_type
    } = req.body;
    let discount_reference = req.body.discount_reference;
    let approverId = undefined;
    if (req.body.discount_approved_by !== undefined && req.body.discount_approved_by !== null && req.body.discount_approved_by !== '') {
      const approver = await validateDiscountApprover(pool, req.body.discount_approved_by, req.jobCart.franchise_id || 1);
      if (!approver) return res.status(400).json({ success: false, error: 'Discount approver must be the Super Admin or an Admin of this franchise' });
      discount_reference = approver.name;
      approverId = approver.id;
    }

    const [cart] = await pool.query('SELECT * FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });
    const oldCart = cart[0];
    
    // Multi-tenant isolation: non-super admin can only modify job cards in their own franchise
    if (!req.isSuperAdmin && oldCart.franchise_id && req.franchiseId && parseInt(oldCart.franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot modify job card from another franchise' });
    }

    // Staff restriction: only today's carts
    if (!checkStaffModifyPermission(req.user, oldCart)) {
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (oldCart.status === 'complete') {
      const isWithin1Day = (new Date() - new Date(oldCart.completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(422).json({ success: false, error: 'Cannot edit completed job cart after 1 day without Admin override' });
      }
    }

    if (badMoney(discount_value, pickup_charge, gst_pct, incentive_amount) || (gst_pct !== undefined && gst_pct !== null && gst_pct !== '' && Number(gst_pct) > 28)) {
      return res.status(400).json({ success: false, error: 'Discount, pickup charge, GST % (0 to 28) and incentive must be 0 or more' });
    }
    if (isPaidCart(oldCart) && !isAdminUser(req.user)) {
      const effGst = gst_type || oldCart.gst_type;
      const moneyChanged =
        (discount_value !== undefined && Number(discount_value || 0) !== Number(oldCart.discount_value || 0))
        || (discount_type !== undefined && discount_type && discount_type !== oldCart.discount_type && Number(discount_value ?? oldCart.discount_value ?? 0) > 0)
        || (gst_type !== undefined && gst_type && gst_type !== oldCart.gst_type)
        || (gst_pct !== undefined && effGst === 'with_gst' && Number(gst_pct) !== Number(oldCart.gst_pct || 0))
        || (pickup_charge !== undefined && Number(pickup_charge || 0) !== Number(oldCart.pickup_charge || 0));
      if (moneyChanged) return res.status(403).json({ success: false, error: 'This bill is already paid. Only an admin can change the discount, GST or pickup charge.' });
    }

    // Calculate subtotal from services
    const [services] = await pool.query('SELECT service_price, labor_charges FROM job_services WHERE job_cart_id = ?', [id]);
    const [productsCost] = await pool.query(`
      SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS cost
      FROM job_products jp JOIN job_services js ON jp.job_service_id = js.id
      WHERE js.job_cart_id = ?
    `, [id]);

    let subtotal = 0;
    services.forEach(s => {
      subtotal += parseFloat(s.service_price || 0) + parseFloat(s.labor_charges || 0);
    });
    subtotal += parseFloat(productsCost[0]?.cost || 0);

    let numVal = parseFloat(discount_value !== undefined ? discount_value : oldCart.discount_value);
    if (isNaN(numVal) || numVal < 0) numVal = 0;

    let dType = discount_type || oldCart.discount_type || 'fixed';
    if (dType !== 'percentage' && dType !== 'fixed') dType = 'fixed';

    if (dType === 'percentage' && numVal > 100) {
      numVal = 100;
    }

    // Validate mandatory discount reason and reference
    if (numVal > 0) {
      const dReason = discount_reason !== undefined ? discount_reason : oldCart.discount_reason;
      // an approver picked by id (e.g. first-wash discount auto-approved from the booking) counts as the reference
      const dRef = discount_reference !== undefined ? discount_reference : (oldCart.discount_reference || (approverId || oldCart.discount_approved_by ? 'approved' : ''));
      if (!dReason || !dReason.trim() || !dRef || !dRef.trim()) {
        return res.status(400).json({
          success: false,
          error: 'Discount reason and approved/referred by reference are mandatory whenever a discount is applied'
        });
      }
    }

    let discountAmt = 0;
    if (dType === 'percentage') {
      discountAmt = subtotal * (numVal / 100);
    } else if (dType === 'fixed') {
      discountAmt = Math.min(subtotal, numVal);
    }
    discountAmt = Math.min(subtotal, Math.max(0, discountAmt));
    const amountAfterDiscount = subtotal - discountAmt;

    const isWithGst = (gst_type || oldCart.gst_type) === 'with_gst';
    const effectiveGstPct = isWithGst ? (parseFloat(gst_pct !== undefined ? gst_pct : (oldCart.gst_pct || 18.00))) : 0;
    const gstAmt = isWithGst ? (amountAfterDiscount * (effectiveGstPct / 100)) : 0;

    const pCharge = parseFloat(pickup_charge !== undefined ? pickup_charge : (oldCart.pickup_charge || 0));
    const totalAmount = Math.max(0, amountAfterDiscount + gstAmt + pCharge);
    // money received changes only through Payments (advance, QR, complete), never typed in here
    const advPaid = parseFloat(oldCart.advance_paid || 0);
    // a fully paid job card stays at zero due when it is edited
    const balDue = oldCart.payment_status === 'paid' ? 0 : Math.max(0, totalAmount - advPaid);

    const teamUsersJson = team_incentive_users !== undefined
      ? (typeof team_incentive_users === 'object' ? JSON.stringify(team_incentive_users) : team_incentive_users)
      : oldCart.team_incentive_users;

    // Track all changed fields for job_card_edit_logs
    const changeLogs = [];
    if (visit_date && toDateOnly(visit_date) !== toDateOnly(oldCart.visit_date)) changeLogs.push(`Visit date changed to ${toDateOnly(visit_date)}`);
    if (notes !== undefined && notes !== oldCart.notes) changeLogs.push(`Notes updated`);
    if (numVal !== parseFloat(oldCart.discount_value || 0)) {
      changeLogs.push(`Discount updated to ${numVal} (${dType}) [Reason: ${discount_reason || oldCart.discount_reason}, Ref: ${discount_reference || oldCart.discount_reference}]`);
    }
    if (referral_person !== undefined && referral_person !== oldCart.referral_person) {
      changeLogs.push(`Referral person changed to ${referral_person || 'None'}`);
    }
    if (handler_id !== undefined && handler_id !== oldCart.handler_id) {
      changeLogs.push(`Handling manager updated`);
    }
    if (technician_id !== undefined && technician_id !== oldCart.technician_id) {
      changeLogs.push(`Technician updated`);
    }
    if (team_incentive_users !== undefined && JSON.stringify(team_incentive_users) !== JSON.stringify(oldCart.team_incentive_users)) {
      changeLogs.push(`Team incentive members updated`);
    }
    if (incentive_amount !== undefined && parseFloat(incentive_amount) !== parseFloat(oldCart.incentive_amount || 0)) {
      changeLogs.push(`Incentive amount updated to ₹${incentive_amount}`);
    }
    if (invoice_notes !== undefined && invoice_notes !== oldCart.invoice_notes) {
      changeLogs.push(`Invoice notes updated`);
    }

    await pool.query(
      `UPDATE job_carts SET 
        visit_date = COALESCE(?, visit_date),
        notes = ?,
        discount_type = ?,
        discount_value = ?,
        discount_amount = ?,
        discount_reason = ?,
        discount_reference = ?,
        gst_type = ?,
        gst_pct = ?,
        gst_amount = ?,
        subtotal = ?,
        total_amount = ?,
        pickup_type = COALESCE(?, pickup_type),
        pickup_charge = ?,
        advance_paid = ?,
        balance_due = ?,
        invoice_notes = ?,
        pre_inspector_name = COALESCE(?, pre_inspector_name),
        personal_items_notes = ?,
        referral_person = COALESCE(?, referral_person),
        handler_id = COALESCE(?, handler_id),
        technician_id = COALESCE(?, technician_id),
        team_incentive_users = COALESCE(?, team_incentive_users),
        incentive_amount = COALESCE(?, incentive_amount),
        incentive_split_type = COALESCE(?, incentive_split_type),
        updated_at = NOW()
       WHERE id = ?`, 
      [
        toDateOnly(visit_date), notes !== undefined ? notes : oldCart.notes,
        dType, numVal, discountAmt,
        discount_reason !== undefined ? (discount_reason?.trim() || null) : oldCart.discount_reason,
        discount_reference !== undefined ? (discount_reference?.trim() || null) : oldCart.discount_reference,
        gst_type || oldCart.gst_type || 'with_gst', effectiveGstPct, gstAmt, subtotal, totalAmount,
        pickup_type || oldCart.pickup_type || 'none', pCharge, advPaid, balDue,
        invoice_notes !== undefined ? invoice_notes : oldCart.invoice_notes,
        pre_inspector_name || oldCart.pre_inspector_name || null,
        personal_items_notes !== undefined ? personal_items_notes : oldCart.personal_items_notes,
        referral_person !== undefined ? referral_person : oldCart.referral_person,
        handler_id !== undefined ? handler_id : oldCart.handler_id,
        technician_id !== undefined ? technician_id : oldCart.technician_id,
        teamUsersJson,
        incentive_amount !== undefined ? parseFloat(incentive_amount) : oldCart.incentive_amount,
        incentive_split_type !== undefined ? incentive_split_type : oldCart.incentive_split_type,
        id
      ]
    );

    if (approverId) await pool.query('UPDATE job_carts SET discount_approved_by = ? WHERE id = ?', [approverId, id]);
    {
      const rc = await recalcJobCart(pool, id);
      if (rc && rc.overpaid > 0.5) changeLogs.push(`Customer has paid ₹${rc.overpaid} more than the new bill — give it back from Payments`);
    }

    // Referrer (staff / customer / external) → referral ledger
    if (req.body.referrer_type !== undefined) {
      const referrer = await referralService.resolveReferrer(pool, req.body, oldCart.franchise_id || 1, req.jobCart.customer_id);
      await pool.query(
        'UPDATE job_carts SET referrer_type = ?, referrer_user_id = ?, referrer_name = ?, referrer_mobile = ?, referral_person = ? WHERE id = ?',
        [referrer?.referrer_type || null, referrer?.referrer_user_id || null, referrer?.referrer_name || null, referrer?.referrer_mobile || null, referrer?.referrer_name || null, id]
      );
      changeLogs.push(`Referrer: ${referrer ? `${referrer.referrer_name} (${referrer.referrer_type})` : 'removed'}`);
    }
    {
      const [[fresh]] = await pool.query('SELECT * FROM job_carts WHERE id = ?', [id]);
      if (fresh.referrer_type) {
        await referralService.syncForSource(pool, {
          sourceType: 'job_card', sourceId: Number(id), franchiseId: fresh.franchise_id || 1,
          referrer: { referrer_type: fresh.referrer_type, referrer_user_id: fresh.referrer_user_id, referrer_name: fresh.referrer_name, referrer_mobile: fresh.referrer_mobile },
          referredCustomerId: req.jobCart.customer_id, billAmount: fresh.total_amount, finalised: fresh.status === 'complete',
          label: `Job card #${id}`, userId: req.user.id,
        });
      } else {
        await referralService.syncForSource(pool, { sourceType: 'job_card', sourceId: Number(id), referrer: null });
      }
    }

    // Record in job_card_edit_logs
    if (changeLogs.length > 0) {
      await pool.query(
        `INSERT INTO job_card_edit_logs 
         (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, changes_json, edited_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
        [
          id, oldCart.franchise_id || 1, req.user?.id, req.user?.name || req.user?.role, req.user?.role,
          changeLogs.join('; '), JSON.stringify(changeLogs)
        ]
      );
    }

    // Audit discount if applied or changed
    if (numVal > 0) {
      await logAudit(
        req.user?.id,
        'DISCOUNT_APPLIED',
        'job_cart',
        id,
        {
          discount_type: dType,
          discount_value: numVal,
          discount_amount: discountAmt,
          discount_reason: discount_reason || oldCart.discount_reason,
          discount_reference: discount_reference || oldCart.discount_reference
        },
        req.ip
      );
    }

    res.json({ success: true, message: 'Job cart updated successfully' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SUBMIT (draft → open) ──────────────────
exports.submit = async (req, res) => {
  try {
    const { id } = req.params;
    const [cart] = await pool.query('SELECT status, visit_date FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });
    if (cart[0].status !== 'draft') return res.status(422).json({ success: false, error: 'Only draft carts can be submitted' });

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    await pool.query("UPDATE job_carts SET status = 'open' WHERE id = ?", [id]);
    await pool.query("UPDATE bookings b JOIN job_carts j ON j.booking_id = b.id SET b.status = 'in_progress' WHERE j.id = ? AND b.status = 'confirmed'", [id]);
    await pool.query("UPDATE referral_ledger SET status = 'pending' WHERE source_type = 'job_card' AND source_id = ? AND status = 'cancelled'", [id]);

    // Trigger Service Started Notification
    try {
      const [info] = await pool.query(
        `SELECT jc.vehicle_id, v.customer_id, v.registration_no, v.brand, v.model
         FROM job_carts jc
         JOIN vehicles v ON jc.vehicle_id = v.id
         WHERE jc.id = ?`,
        [id]
      );
      if (info.length) {
        const messagingService = require('../services/messagingService');
        await messagingService.notify(
          info[0].customer_id,
          'SERVICE_STARTED',
          { 
            vehicle_number: info[0].registration_no || `${info[0].brand} ${info[0].model}`,
            estimated_time: 'soon' 
          },
          { type: 'job_cart', id }
        );
      }
    } catch (msgErr) {
      console.error('[SMS/WA] Service started notification failed (non-blocking):', msgErr.message);
    }

    res.json({ success: true, message: 'Job cart submitted' });
  } catch (err) {
    console.error('Submit error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── COMPLETE (open → complete) ─────────────
exports.complete = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { credits_awarded = 0, free_washes_awarded = 0, wax_awarded = 0 } = req.body;

    // 1. Check status is 'open' — the row is locked so "Complete" tapped twice at the same moment completes once
    const [cart] = await conn.query(
      `SELECT jc.*, v.customer_id FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE jc.id = ? FOR UPDATE`,
      [id]
    );
    if (!cart.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Not found' }); }

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status !== 'open') { await conn.rollback(); return res.status(422).json({ success: false, error: 'Only open carts can be completed' }); }

    const customerId = cart[0].customer_id;

    // 2. Set complete
    await conn.query("UPDATE job_carts SET status = 'complete', completed_at = NOW() WHERE id = ?", [id]);
    await conn.query("UPDATE bookings b JOIN job_carts j ON j.booking_id = b.id SET b.status = 'completed' WHERE j.id = ? AND b.status IN ('confirmed','in_progress')", [id]);
    await exports._closeVisits(conn, cart[0]);

    // 3. Deduct inventory
    const [services] = await conn.query('SELECT id FROM job_services WHERE job_cart_id = ?', [id]);
    for (const svc of services) {
      const [products] = await conn.query('SELECT product_id, quantity FROM job_products WHERE job_service_id = ?', [svc.id]);
      for (const prod of products) {
        await conn.query('UPDATE inventory SET quantity = quantity - ? WHERE id = ?', [prod.quantity, prod.product_id]);
      }
    }

    // 4. Award loyalty
    // Check for New Customer Welcome Reward (if this is their first completed job cart)
    const [pastCarts] = await conn.query(
      `SELECT COUNT(*) as count FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE v.customer_id = ? AND jc.status = 'complete'`,
      [customerId]
    );
    
    let welcomeCredits = 0;
    let isFirstVisit = false;
    if (pastCarts[0].count === 0) {
      welcomeCredits = 100; // 100 credits for first service
      isFirstVisit = true;
    }

    const totalCreditsToAward = Number(credits_awarded) + welcomeCredits;

    if (totalCreditsToAward > 0 || free_washes_awarded > 0 || wax_awarded > 0) {
      await conn.query(
        `INSERT INTO loyalty (customer_id, credits, free_washes, wax_count)
         VALUES (?, ?, ?, ?)
         ON DUPLICATE KEY UPDATE
           credits = credits + VALUES(credits),
           free_washes = free_washes + VALUES(free_washes),
           wax_count = wax_count + VALUES(wax_count)`,
        [customerId, totalCreditsToAward, free_washes_awarded, wax_awarded]
      );
    }

    // 5. Calculate total and create transaction
    const [totalRows] = await conn.query(`
      SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) AS svc_total
      FROM job_services js WHERE js.job_cart_id = ?
    `, [id]);
    const [prodTotal] = await conn.query(`
      SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS prod_total
      FROM job_products jp JOIN job_services js ON jp.job_service_id = js.id
      WHERE js.job_cart_id = ?
    `, [id]);
    let grandTotal = parseFloat(totalRows[0].svc_total) + parseFloat(prodTotal[0].prod_total);

    let dVal = parseFloat(cart[0].discount_value || 0);
    if (isNaN(dVal) || dVal < 0) dVal = 0;
    if (cart[0].discount_type === 'percentage' && dVal > 100) dVal = 100;

    let discountAmt = 0;
    if (cart[0].discount_type === 'percentage') {
      discountAmt = grandTotal * (dVal / 100);
    } else if (cart[0].discount_type === 'fixed') {
      discountAmt = Math.min(grandTotal, dVal);
    }
    discountAmt = Math.min(grandTotal, Math.max(0, discountAmt));
    const pickupCharge = parseFloat(cart[0].pickup_charge || 0);
    const gstPctCart = cart[0].gst_type === 'with_gst' ? parseFloat(cart[0].gst_pct || 0) : 0;
    const gstOnBill = Math.round((grandTotal - discountAmt) * gstPctCart) / 100;
    grandTotal = Math.max(0, grandTotal - discountAmt + gstOnBill + pickupCharge);

    const advancePaid = parseFloat(cart[0].advance_paid || 0);
    const dueNow = Math.max(0, grandTotal - advancePaid);
    // "Did the customer pay the full amount?" — amount_received is what they paid now (blank = paid in full).
    // Whatever is left stays as balance due and shows in Pending Payments.
    const rawReceived = req.body?.amount_received;
    const amountCollectedNow = rawReceived === undefined || rawReceived === null || rawReceived === ''
      ? dueNow : Math.min(dueNow, Math.max(0, parseFloat(rawReceived) || 0));
    const balanceLeft = Math.round((dueNow - amountCollectedNow) * 100) / 100;
    const payStatus = balanceLeft > 0 ? (advancePaid + amountCollectedNow > 0 ? 'partial' : 'pending') : 'paid';

    // ─── INCENTIVE ENGINE: per-vehicle slabs for the people who worked on it ───
    const franchiseId = cart[0].franchise_id || 1;
    {
      const engine = require('../services/incentiveEngine');
      const [svcRows] = await conn.query(
        `SELECT js.service_name, s.name, s.incentive_type FROM job_services js
         LEFT JOIN services s ON s.name = js.service_name AND s.is_active = 1 WHERE js.job_cart_id = ?`, [id]);
      const types = svcRows.map(engine.typeOfService).filter(Boolean);
      let team = [];
      if (cart[0].team_incentive_users) {
        try {
          const parsed = typeof cart[0].team_incentive_users === 'string' ? JSON.parse(cart[0].team_incentive_users) : cart[0].team_incentive_users;
          if (Array.isArray(parsed)) team = parsed.map(u => (typeof u === 'object' ? u.id : parseInt(u, 10)));
        } catch (e) {
          team = String(cart[0].team_incentive_users).split(',').map(x => parseInt(x.trim(), 10));
        }
      }
      const [[veh]] = await conn.query('SELECT category FROM vehicles WHERE id = ?', [cart[0].vehicle_id]);
      const result = await engine.awardForVehicle(conn, {
        franchiseId, jobCartId: Number(id), types,
        workerIds: [cart[0].technician_id, ...team],
        vehicleClass: engine.vehicleClassOf(cart[0].car_category || veh?.category),
      });
      await conn.query('UPDATE job_carts SET incentive_amount = ? WHERE id = ?', [result.total || 0, id]);
    }

    // ─── LOYALTY ENGINE (Auto-Credit & Full Ledger) ─── (skipped when Loyalty → Settings is switched off)
    const [[loyOn]] = await conn.query("SELECT value FROM settings WHERE key_name = 'loyalty_enabled' LIMIT 1");
    if (customerId && (!loyOn || loyOn.value !== '0')) {
      const [loyRules] = await conn.query(
        'SELECT * FROM loyalty_rules WHERE (franchise_id = ? OR franchise_id IS NULL) AND is_active = 1 ORDER BY id DESC LIMIT 1',
        [franchiseId]
      );
      let loyaltyPointsEarned = 0;
      if (loyRules.length > 0) {
        const lRule = loyRules[0];
        if (lRule.points_type === 'percentage_of_bill') {
          loyaltyPointsEarned = Math.round((grandTotal * (parseFloat(lRule.points_value) / 100)) * parseFloat(lRule.multiplier || 1));
        } else {
          loyaltyPointsEarned = Math.round(parseFloat(lRule.points_value) * parseFloat(lRule.multiplier || 1));
        }
      } else {
        loyaltyPointsEarned = Math.round(grandTotal * 0.05); // Default 5%
      }

      if (loyaltyPointsEarned > 0) {
        await conn.query(
          `INSERT INTO loyalty (customer_id, credits, free_washes, wax_count, points)
           VALUES (?, 0, 0, 0, ?)
           ON DUPLICATE KEY UPDATE points = points + VALUES(points)`,
          [customerId, loyaltyPointsEarned]
        );
        const [bRows] = await conn.query('SELECT points FROM loyalty WHERE customer_id = ?', [customerId]);
        const currentPointsBal = bRows[0]?.points || loyaltyPointsEarned;

        await conn.query(
          `INSERT INTO loyalty_transactions 
           (customer_id, type, points, balance_after, reference_type, reference_id, description, created_by)
           VALUES (?, 'earn', ?, ?, 'job_cart', ?, ?, ?)`,
          [
            customerId,
            loyaltyPointsEarned,
            currentPointsBal,
            id,
            `Earned ${loyaltyPointsEarned} points from Job Card #${id}`,
            req.user?.id || null
          ]
        );
        await conn.query('UPDATE job_carts SET loyalty_points_earned = ? WHERE id = ?', [loyaltyPointsEarned, id]);
      }
    }

    // 6. Create transaction (only the money actually received now; the advance was recorded when it was paid)
    if (amountCollectedNow > 0) await conn.query(
      'INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id) VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?)',
      ['job_revenue', id, amountCollectedNow, 'in', `Job card #${id} paid at studio${advancePaid > 0 ? ` (advance ₹${advancePaid} paid earlier)` : ''}${balanceLeft > 0 ? ` · ₹${balanceLeft} still due` : ''}`, req.user.id, franchiseId]
    );

    // How the customer paid (job_carts and v2_payments spell bank transfer differently)
    const payMethod = ['cash', 'upi', 'card', 'net_banking', 'qr'].includes(req.body?.payment_method) ? req.body.payment_method : 'cash';

    // Shows in Payments (same money as the accounts entry above)
    if (amountCollectedNow > 0) {
      await conn.query(
        `INSERT INTO v2_payments (customer_id, job_cart_id, amount, payment_method, status, notes) VALUES (?, ?, ?, ?, 'captured', ?)`,
        [customerId || null, id, amountCollectedNow, require('../services/moneyIn').toPaymentMethod(payMethod), 'Paid at studio when the job card was completed']);
    }

    // 7. Invoice number (per franchise) + final totals
    if (amountCollectedNow > 0) {
      await conn.query('UPDATE job_carts SET payment_method = ? WHERE id = ?', [payMethod, id]);
    }
    const invoiceNumber = await nextInvoiceNumber(conn, franchiseId);
    await conn.query(
      "UPDATE job_carts SET invoice_number = ?, invoice_date = COALESCE(invoice_date, NOW()), total_amount = ?, advance_paid = ?, balance_due = ?, payment_status = ?, current_stage = IF(current_stage IS NULL OR current_stage = 'Received', 'Ready for Delivery', current_stage) WHERE id = ?",
      [invoiceNumber, grandTotal, Math.round((advancePaid + amountCollectedNow) * 100) / 100, balanceLeft, payStatus, id]
    );

    // Referral earning becomes payable now that the bill is final
    if (cart[0].referrer_type) {
      await referralService.syncForSource(conn, {
        sourceType: 'job_card', sourceId: Number(id), franchiseId,
        referrer: { referrer_type: cart[0].referrer_type, referrer_user_id: cart[0].referrer_user_id, referrer_name: cart[0].referrer_name, referrer_mobile: cart[0].referrer_mobile },
        referredCustomerId: customerId, billAmount: grandTotal, finalised: true, label: `Invoice ${invoiceNumber}`, userId: req.user.id,
      });
    }

    // GST auto-logging for Completed Job Cart Tax Invoice
    const [gstSetting] = await conn.query("SELECT value FROM settings WHERE key_name = 'is_gst_applicable' AND franchise_id = ?", [franchiseId]);
    const isGstEnabled = gstSetting.length && gstSetting[0].value === '1';
    if (isGstEnabled) {
      const periodMonth = new Date().getMonth() + 1;
      const periodYear = new Date().getFullYear();
      const [gstSettingNo] = await conn.query("SELECT value FROM settings WHERE key_name = 'studio_gst' AND franchise_id = ?", [franchiseId]);
      const gstin = gstSettingNo.length ? gstSettingNo[0].value : '';

      const taxableAmount = grandTotal / 1.18;
      const totalGst = grandTotal - taxableAmount;
      const cgst = totalGst / 2;
      const sgst = totalGst / 2;
      const igst = 0;

      await conn.query(
        `INSERT INTO v2_gst_records (record_type, invoice_id, gstin, taxable_amount, cgst, sgst, igst, total_gst, period_month, period_year, franchise_id)
         VALUES ('sales', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, gstin, taxableAmount, cgst, sgst, igst, totalGst, periodMonth, periodYear, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
      );
    }

    // Log completion in job_card_edit_logs
    await conn.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, 'Job card completed and billed', NOW())`,
      [id, franchiseId, req.user?.id, req.user?.name || req.user?.role, req.user?.role]
    );

    await conn.commit();

    // Auto-trigger Feedback Request Token & WhatsApp Log
    try {
      const crypto = require('crypto');
      const token = crypto.randomBytes(32).toString('hex');
      await pool.query(
        `INSERT INTO v2_review_requests (customer_id, booking_id, job_cart_id, sent_via, status, feedback_token, franchise_id)
         VALUES (?, ?, ?, 'whatsapp', 'sent', ?, ?)`,
        [customerId, cart[0].booking_id, id, token, cart[0].franchise_id || 1]
      );

      const [cDetails] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [customerId]);
      if (cDetails.length) {
        const c = cDetails[0];
        const domain = process.env.CLIENT_URL || 'http://localhost:5173';
        const feedbackUrl = `${domain}/feedback/${token}`;
        const msgText = `Dear ${c.name || 'Customer'}, thank you for choosing O3 Car Spaa! We would love to hear your feedback. Please rate your experience here: ${feedbackUrl}`;

        require('../services/notificationService').notify({
          customerId, customMessageBody: msgText, channels: ['whatsapp'],
          referenceType: 'job_card', referenceId: Number(id), franchiseId: cart[0].franchise_id || 1,
          idempotencyKey: `feedback_job_${id}`,
        }).catch(() => {});
      }
    } catch (err) {
      console.error('Auto-feedback trigger error:', err);
    }

    // 8. Unified Notification Log triggers for WhatsApp + SMS
    try {
      const messagingService = require('../services/messagingService');
      const [custInfo] = await pool.query(
        `SELECT u.name, u.mobile, v.brand, v.model, v.registration_no
         FROM users u JOIN vehicles v ON v.customer_id = u.id
         JOIN job_carts jc ON jc.vehicle_id = v.id
         WHERE jc.id = ?`, [id]
      );
      if (custInfo.length) {
        const c = custInfo[0];
        const vehName = c.registration_no || `${c.brand} ${c.model}`;
        
        // Notify Service Completed
        await messagingService.notify(
          customerId,
          'SERVICE_COMPLETED',
          { vehicle_number: vehName, job_cart_id: id },
          { type: 'job_cart', id }
        );

        // Notify Invoice Generated
        const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
        await messagingService.notify(
          customerId,
          'INVOICE_GENERATED',
          { 
            invoice_number: invoiceNumber,
            amount: grandTotal,
            invoice_url: `${baseUrl}/invoice/${id}`
          },
          { type: 'job_cart', id }
        );
      }
    } catch (msgErr) {
      console.error('Messaging after completion failed (non-blocking):', msgErr.message);
    }

    // Customer asked for drop → make the delivery task (goes to the driver who picked the car up)
    try {
      await require('./deliveriesController').createDropTask(id);
    } catch (dErr) {
      console.error('[Delivery] drop task (non-blocking):', dErr.message);
    }

    // Phase 5 Automation: Warranty Autosend for PPF & Coating
    try {
      const notificationService = require('../services/notificationService');
      notificationService.handleWarrantyAutoSend(id).catch(wErr => {
        console.error('[WarrantyAutoSend] Hook error (non-blocking):', wErr.message);
      });
    } catch (wErr) {
      console.error('[WarrantyAutoSend] Hook error (non-blocking):', wErr.message);
    }

    res.json({
      success: true,
      message: 'Job card completed',
      data: { id: parseInt(id), status: 'complete', invoice_number: invoiceNumber, total_amount: grandTotal },
    });
  } catch (err) {
    await conn.rollback();
    console.error('Complete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── ADD SERVICE ────────────────────────────
exports.addService = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id } = req.params;
    const { service_name, service_price = 0, labor_charges = 0, custom_price = null, custom_notes = null, products = [] } = req.body;

    if (!service_name) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Service name is required' }); }
    if (badMoney(service_price, labor_charges, custom_price) || badProducts(products)) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Price, labour, quantity and cost must be 0 or more' }); }

    const [cart] = await conn.query('SELECT status, completed_at, visit_date, franchise_id, payment_status, advance_paid FROM job_carts WHERE id = ? FOR UPDATE', [id]);
    if (!cart.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Not found' }); }

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && !['admin', 'super_admin'].includes(req.user.role)) {
        await conn.rollback(); 
        return res.status(422).json({ success: false, error: 'Cannot modify completed cart after 1 day without Admin override' });
      }
    }

    // Partial PPF validation: mandatory custom note
    const isPartialPpf = Boolean(
      service_name && (service_name.toLowerCase().includes('ppf') || service_name.toLowerCase().includes('film'))
    );
    if (isPartialPpf) {
      if (!custom_notes || !custom_notes.trim()) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          error: "Note specifying Partial PPF coverage (e.g. 'bonnet PPF', 'hood PPF') is mandatory for partial PPF services"
        });
      }
    }

    const [svcResult] = await conn.query(
      'INSERT INTO job_services (job_cart_id, service_name, service_price, labor_charges, custom_price, custom_notes, last_edited_at) VALUES (?, ?, ?, ?, ?, ?, NOW())',
      [id, service_name, service_price, labor_charges, custom_price, custom_notes ? custom_notes.trim() : null]
    );

    const serviceId = svcResult.insertId;

    for (const prod of products) {
      if (!prod.product_id || !prod.quantity) continue;
      await conn.query(
        'INSERT INTO job_products (job_service_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [serviceId, prod.product_id, prod.quantity, prod.unit_cost || 0]
      );
    }

    // Log to edit history
    await conn.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, cart[0].franchise_id || 1, req.user?.id, req.user?.name || req.user?.role, req.user?.role,
        `Added service: ${service_name} (₹${service_price || custom_price || 0})${custom_notes ? ` [Note: ${custom_notes}]` : ''}`
      ]
    );
    await recalcJobCart(conn, id);

    await conn.commit();
    res.status(201).json({ success: true, data: { id: serviceId }, message: 'Service added' });
  } catch (err) {
    await conn.rollback();
    console.error('Add service error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── UPDATE SERVICE ─────────────────────────
exports.updateService = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { id, sid } = req.params;
    const { service_name, service_price, labor_charges, custom_price, custom_notes, products = [] } = req.body;
    if (badMoney(service_price, labor_charges, custom_price) || badProducts(products)) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Price, labour, quantity and cost must be 0 or more' }); }

    const [cart] = await conn.query('SELECT status, completed_at, visit_date, franchise_id, payment_status, advance_paid FROM job_carts WHERE id = ? FOR UPDATE', [id]);
    if (!cart.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Cart not found' }); }
    if (isPaidCart(cart[0]) && !isAdminUser(req.user)) { await conn.rollback(); return res.status(403).json({ success: false, error: 'This bill is already paid. Only an admin can change or remove a service.' }); }
    const [[svcRow]] = await conn.query('SELECT * FROM job_services WHERE id = ? AND job_cart_id = ?', [sid, id]);
    if (!svcRow) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Service not found on this job card' }); }

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && !['admin', 'super_admin'].includes(req.user.role)) {
        await conn.rollback(); 
        return res.status(422).json({ success: false, error: 'Cannot modify completed cart after 1 day without Admin override' });
      }
    }

    // Partial PPF validation
    const isPartialPpf = Boolean(
      service_name && (service_name.toLowerCase().includes('ppf') || service_name.toLowerCase().includes('film'))
    );
    if (isPartialPpf) {
      if (!custom_notes || !custom_notes.trim()) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          error: "Note specifying Partial PPF coverage (e.g. 'bonnet PPF', 'hood PPF') is mandatory for partial PPF services"
        });
      }
    }

    await conn.query(
      `UPDATE job_services SET 
        service_name = ?, 
        service_price = ?, 
        labor_charges = ?, 
        custom_price = ?,
        custom_notes = ?,
        last_edited_at = NOW() 
       WHERE id = ? AND job_cart_id = ?`,
      [service_name ?? svcRow.service_name, service_price ?? svcRow.service_price, labor_charges ?? svcRow.labor_charges, custom_price || null, custom_notes ? custom_notes.trim() : null, sid, id]
    );

    // Replace products
    await conn.query('DELETE FROM job_products WHERE job_service_id = ?', [sid]);
    for (const prod of products) {
      if (!prod.product_id || !prod.quantity) continue;
      await conn.query(
        'INSERT INTO job_products (job_service_id, product_id, quantity, unit_cost) VALUES (?, ?, ?, ?)',
        [sid, prod.product_id, prod.quantity, prod.unit_cost || 0]
      );
    }

    // Log to edit history
    await conn.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, cart[0].franchise_id || 1, req.user?.id, req.user?.name || req.user?.role, req.user?.role,
        `Updated service #${sid}: ${service_name ?? svcRow.service_name}${custom_notes ? ` [Note: ${custom_notes}]` : ''}`
      ]
    );
    await recalcJobCart(conn, id);

    await conn.commit();
    res.json({ success: true, message: 'Service updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Update service error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── DELETE SERVICE ─────────────────────────
exports.deleteService = async (req, res) => {
  try {
    const { id, sid } = req.params;
    const [cart] = await pool.query('SELECT status, completed_at, visit_date, franchise_id, payment_status, advance_paid FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && !['admin', 'super_admin'].includes(req.user.role)) {
        return res.status(422).json({ success: false, error: 'Cannot modify completed cart after 1 day without Admin override' });
      }
    }

    if (isPaidCart(cart[0]) && !isAdminUser(req.user)) return res.status(403).json({ success: false, error: 'This bill is already paid. Only an admin can change or remove a service.' });
    const [[svcRow]] = await pool.query('SELECT id FROM job_services WHERE id = ? AND job_cart_id = ?', [sid, id]);
    if (!svcRow) return res.status(404).json({ success: false, error: 'Service not found on this job card' });
    await releasePackageCredits(pool, Number(id), Number(sid)); // removed line gives its package credit back
    await pool.query('DELETE FROM job_services WHERE id = ? AND job_cart_id = ?', [sid, id]);

    // Log to edit history
    await pool.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, ?, NOW())`,
      [
        id, cart[0].franchise_id || 1, req.user?.id, req.user?.name || req.user?.role, req.user?.role,
        `Removed service #${sid}`
      ]
    );

    const rc = await recalcJobCart(pool, id);
    res.json({ success: true, message: rc && rc.overpaid > 0.5 ? `Service deleted. Customer has paid ₹${rc.overpaid} more than the new bill — give it back from Payments.` : 'Service deleted' });
  } catch (err) {
    console.error('Delete service error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── LIST PHOTOS (With Customer Ownership Check) ───
exports.listPhotos = async (req, res) => {
  try {
    const { id } = req.params;

    // Check ownership for customer role
    if (req.user.role === 'customer') {
      const [check] = await pool.query(
        `SELECT jc.id FROM job_carts jc 
         JOIN vehicles v ON jc.vehicle_id = v.id 
         WHERE jc.id = ? AND v.customer_id = ?`,
        [id, req.user.id]
      );
      if (!check.length) {
        return res.status(403).json({ success: false, error: 'Not authorized to view photos for this job cart' });
      }
    }

    const [photos] = await pool.query(
      'SELECT id, job_cart_id, type, url, public_id, uploaded_at FROM job_photos WHERE job_cart_id = ? ORDER BY uploaded_at DESC',
      [id]
    );

    res.json({
      success: true,
      data: photos
    });
  } catch (err) {
    console.error('List photos error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPLOAD PHOTOS (Batch Support) ───────────────────
exports.uploadPhoto = async (req, res) => {
  try {
    const { id } = req.params;
    const photoType = req.body.type || 'before';

    const files = req.files || (req.file ? [req.file] : []);
    if (!files.length) return res.status(400).json({ success: false, error: 'No files uploaded' });

    const [cart] = await pool.query('SELECT status, visit_date FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });
    if (!checkStaffModifyPermission(req.user, cart[0])) {
      return res.status(403).json({ success: false, error: "Staff can only modify today's job carts" });
    }

    const fs = require('fs');
    const pathModule = require('path');
    const uploadedPhotos = [];

    for (const file of files) {
      let photoUrl = '';
      let publicId = null;

      // Try Cloudinary if configured
      if (process.env.CLOUDINARY_CLOUD_NAME && process.env.CLOUDINARY_API_KEY && process.env.CLOUDINARY_API_SECRET) {
        try {
          const cloudinary = require('../config/cloudinary');
          const result = await new Promise((resolve, reject) => {
            const stream = cloudinary.uploader.upload_stream(
              { folder: `o3-car-spaa/job-photos/${id}`, resource_type: 'image' },
              (err, res) => { if (err) reject(err); else resolve(res); }
            );
            stream.end(file.buffer);
          });
          photoUrl = result.secure_url;
          publicId = result.public_id;
        } catch (cloudErr) {
          console.warn('Cloudinary upload failed, falling back to local disk:', cloudErr.message);
        }
      }

      // Local disk fallback
      if (!photoUrl) {
        const uploadsDir = pathModule.join(__dirname, '..', '..', 'uploads', 'job-photos', String(id));
        if (!fs.existsSync(uploadsDir)) {
          fs.mkdirSync(uploadsDir, { recursive: true });
        }

        const ext = pathModule.extname(file.originalname) || '.jpg';
        const safeName = file.originalname
          .replace(ext, '')
          .replace(/[^a-zA-Z0-9_-]/g, '_')
          .substring(0, 50);
        const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 6)}_${safeName}${ext}`;
        const filePath = pathModule.join(uploadsDir, fileName);

        fs.writeFileSync(filePath, file.buffer);
        photoUrl = `/uploads/job-photos/${id}/${fileName}`;
      }

      const [insertResult] = await pool.query(
        'INSERT INTO job_photos (job_cart_id, type, url, public_id) VALUES (?, ?, ?, ?)',
        [id, photoType, photoUrl, publicId]
      );

      uploadedPhotos.push({
        id: insertResult.insertId,
        url: photoUrl,
        type: photoType,
        public_id: publicId
      });
    }

    res.status(201).json({
      success: true,
      data: uploadedPhotos,
      message: `Successfully uploaded ${uploadedPhotos.length} photo(s)`
    });
  } catch (err) {
    console.error('Upload photo error:', err);
    res.status(500).json({ success: false, error: 'Failed to upload photo' });
  }
};

// ─── DELETE PHOTO ───────────────────────────
exports.deletePhoto = async (req, res) => {
  try {
    const { pid } = req.params;
    const [photos] = await pool.query('SELECT * FROM job_photos WHERE id = ?', [pid]);
    if (!photos.length) return res.status(404).json({ success: false, error: 'Photo not found' });

    const photo = photos[0];
    const [cart] = await pool.query('SELECT status, visit_date FROM job_carts WHERE id = ?', [photo.job_cart_id]);
    if (cart.length && !checkStaffModifyPermission(req.user, cart[0])) {
      return res.status(403).json({ success: false, error: "Staff can only modify today's job carts" });
    }

    if (photo.public_id) {
      try {
        const cloudinary = require('../config/cloudinary');
        await cloudinary.uploader.destroy(photo.public_id);
      } catch (cErr) {
        console.warn('Cloudinary delete warning:', cErr.message);
      }
    } else if (photo.url && photo.url.startsWith('/uploads/')) {
      const fs = require('fs');
      const pathModule = require('path');
      const localPath = pathModule.join(__dirname, '..', '..', photo.url);
      if (fs.existsSync(localPath)) {
        try {
          fs.unlinkSync(localPath);
          console.log(`[JOB_PHOTO] Deleted local file: ${localPath}`);
        } catch (fsErr) {
          console.error('[JOB_PHOTO] Failed to delete local file:', fsErr.message);
        }
      }
    }

    await pool.query('DELETE FROM job_photos WHERE id = ?', [pid]);
    res.json({ success: true, message: 'Photo deleted' });
  } catch (err) {
    console.error('Delete photo error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DOWNLOAD ALL PHOTOS ───────────────────────────
exports.downloadAllPhotos = async (req, res) => {
  try {
    const { id } = req.params;
    const [photos] = await pool.query('SELECT public_id FROM job_photos WHERE job_cart_id = ? AND public_id IS NOT NULL', [id]);
    
    if (!photos.length) {
      return res.status(404).json({ success: false, error: 'No photos found to download' });
    }

    const publicIds = photos.map(p => p.public_id);
    
    const zipUrl = cloudinary.utils.download_zip_url({
      public_ids: publicIds,
      resource_type: 'image',
      target_public_id: `job_${id}_photos`
    });

    res.json({ success: true, data: { url: zipUrl } });
  } catch (err) {
    console.error('Download photos error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


// ─── GET INVOICE PDF ────────────────────────
exports.getInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const [cart] = await pool.query(
      `SELECT jc.status, v.customer_id FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE jc.id = ?`,
      [id]
    );
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });

    // Customer can only download own
    if (req.user.role === 'customer' && cart[0].customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { pdfBuffer, invoiceNumber } = await generateInvoicePDF(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Invoice error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET JOB CARD PDF ────────────────────────
exports.getJobCardPDF = async (req, res) => {
  try {
    const { id } = req.params;
    const [cart] = await pool.query(
      `SELECT jc.status, v.customer_id FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE jc.id = ?`,
      [id]
    );
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });

    if (req.user.role === 'customer' && cart[0].customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const { pdfBuffer, jobCardNumber } = await generateJobCardPDF(id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `inline; filename="${jobCardNumber}.pdf"`,
      'Content-Length': pdfBuffer.length,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Job card PDF error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


// Package credits held by walk-in lines of a job card: give back on cancel, take again on restore
async function releasePackageCredits(conn, jobCartId, serviceId = null) {
  const { cancelReservation } = require('./userPackagesController');
  const [rows] = await conn.query(
    `SELECT id, user_package_id, package_service_name FROM job_services WHERE job_cart_id = ? AND package_credit_held = 1${serviceId ? ' AND id = ?' : ''}`,
    serviceId ? [jobCartId, serviceId] : [jobCartId]);
  for (const r of rows) {
    await cancelReservation(conn, r.user_package_id, r.package_service_name);
    await conn.query('UPDATE job_services SET package_credit_held = 0 WHERE id = ?', [r.id]);
  }
  return rows.length;
}
async function retakePackageCredits(conn, jobCartId) {
  const [rows] = await conn.query(
    `SELECT js.id, js.package_service_name, up.user_id, up.vehicle_id FROM job_services js JOIN user_packages up ON up.id = js.user_package_id
     WHERE js.job_cart_id = ? AND js.user_package_id IS NOT NULL AND js.package_credit_held = 0`, [jobCartId]);
  let missing = 0;
  for (const r of rows) {
    const used = await require('./userPackagesController').checkAndUseService(conn, r.user_id, r.package_service_name, r.vehicle_id);
    if (used.can_use) await conn.query('UPDATE job_services SET package_credit_held = 1 WHERE id = ?', [r.id]); else missing++;
  }
  return missing;
}

// ─── SOFT DELETE (CANCEL) JOB CART ──────────────
exports.softDelete = async (req, res) => {
  try {
    const { id } = req.params;
    const [existingCart] = await pool.query('SELECT franchise_id FROM job_carts WHERE id = ?', [id]);
    if (!existingCart.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    if (!req.isSuperAdmin && existingCart[0].franchise_id && req.franchiseId && parseInt(existingCart[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot cancel job card from another franchise' });
    }

    await pool.query("UPDATE job_carts SET status = 'cancelled' WHERE id = ?", [id]);
    await referralService.cancelForSource(pool, 'job_card', Number(id));
    const back = await releasePackageCredits(pool, Number(id));
    // Not done after all: staff don't earn incentive for it (unless already paid in salary), and its booking is cancelled too
    await pool.query("UPDATE incentive_splits SET status = 'withheld' WHERE job_cart_id = ? AND status IN ('pending','approved') AND complaint_id IS NULL", [id]);
    const [[bk]] = await pool.query("SELECT b.* FROM bookings b JOIN job_carts j ON j.booking_id = b.id WHERE j.id = ? AND b.status IN ('confirmed','in_progress')", [id]);
    await pool.query("UPDATE bookings SET status = 'cancelled' WHERE id = (SELECT booking_id FROM job_carts WHERE id = ?) AND status IN ('confirmed','in_progress')", [id]);
    if (bk) {
      // same as cancelling the booking itself: free its slot(s), stop pickup, owe back any advance
      const bc = require('./bookingsController');
      await bc.restoreBookingSlots(pool, bk.id, bk.slot_id);
      await bc.closeBookingExtras(pool, bk);
    }
    res.json({ success: true, message: back ? `Job cart cancelled — ${back} package credit(s) given back` : 'Job cart cancelled' });
  } catch (err) {
    console.error('Job cart soft-delete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── RESTORE CANCELLED JOB CART ─────────────────
exports.restore = async (req, res) => {
  try {
    const { id } = req.params;
    const [existingCart] = await pool.query('SELECT franchise_id FROM job_carts WHERE id = ?', [id]);
    if (!existingCart.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    if (!req.isSuperAdmin && existingCart[0].franchise_id && req.franchiseId && parseInt(existingCart[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Cannot restore job card from another franchise' });
    }

    await pool.query("UPDATE job_carts SET status = 'open' WHERE id = ?", [id]);
    await pool.query("UPDATE referral_ledger SET status = 'pending' WHERE source_type = 'job_card' AND source_id = ? AND status = 'cancelled'", [id]);
    const missing = await retakePackageCredits(pool, Number(id));
    await pool.query("UPDATE incentive_splits SET status = 'approved' WHERE job_cart_id = ? AND status = 'withheld' AND complaint_id IS NULL", [id]);
    const [[bk]] = await pool.query("SELECT b.id, b.slot_id FROM bookings b JOIN job_carts j ON j.booking_id = b.id WHERE j.id = ? AND b.status = 'cancelled'", [id]);
    await pool.query("UPDATE bookings SET status = 'confirmed' WHERE id = (SELECT booking_id FROM job_carts WHERE id = ?) AND status = 'cancelled'", [id]);
    if (bk) {
      // take its slot back and undo the "advance to refund" made when it was cancelled (if not refunded yet)
      if (bk.slot_id) {
        await pool.query('UPDATE slots SET booked_count = booked_count + 1 WHERE id = ?', [bk.slot_id]);
        await pool.query('INSERT INTO booking_slots (booking_id, slot_id) VALUES (?, ?)', [bk.id, bk.slot_id]);
      }
      await pool.query('UPDATE bookings SET refund_due = 0 WHERE id = ? AND refunded_at IS NULL', [bk.id]);
      await pool.query("UPDATE advance_payments SET status = 'advance_paid' WHERE booking_id = ? AND status = 'cancelled'", [bk.id]);
    }
    res.json({ success: true, message: missing ? `Job cart restored — ${missing} package credit(s) could not be taken again (none left)` : 'Job cart restored' });
  } catch (err) {
    console.error('Job cart restore error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── PIPELINE (one-click stages, live to customer, auto WhatsApp) ─────────
const DEFAULT_STAGES = ['Received', 'Pre-Inspection', 'Washing & Prep', 'Detailing / Polishing', 'Coating / PPF', 'Quality Check', 'Ready for Delivery', 'Delivered'];

async function pipelineFor(jobCartId) {
  const [svcRows] = await pool.query(
    `SELECT s.process_json FROM job_services js JOIN services s ON js.service_name = s.name
     WHERE js.job_cart_id = ? AND s.process_json IS NOT NULL`,
    [jobCartId]
  );
  for (const s of svcRows) {
    try {
      const parsed = typeof s.process_json === 'string' ? JSON.parse(s.process_json) : s.process_json;
      const names = Array.isArray(parsed) ? parsed.map(x => (typeof x === 'string' ? x : x?.name || x?.title)).filter(Boolean) : [];
      if (names.length >= 2) {
        const list = names.map(String);
        if (list[0] !== 'Received') list.unshift('Received');
        if (list[list.length - 1] !== 'Delivered') list.push('Delivered');
        return list;
      }
    } catch { /* fall back to default */ }
  }
  return DEFAULT_STAGES;
}

/**
 * Set the job's tracker stages. delivered=true marks every stage done (car handed over);
 * delivered=false puts it back at "Ready for Delivery" (admin undo).
 */
exports.setJobDelivered = async (jobCartId, delivered, userId = null) => {
  const names = await pipelineFor(jobCartId);
  const back = names.includes('Ready for Delivery') ? 'Ready for Delivery' : names[Math.max(0, names.length - 2)];
  const idx = delivered ? names.length - 1 : names.indexOf(back);
  for (let i = 0; i < names.length; i++) {
    const st = delivered || i < idx ? 'completed' : i === idx ? 'in_progress' : 'pending';
    await pool.query(
      `INSERT INTO job_card_stages (job_cart_id, stage_name, status, updated_at) VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE updated_at = IF(status <> VALUES(status), NOW(), updated_at), status = VALUES(status)`,
      [jobCartId, names[i], st]);
  }
  const stage = delivered ? 'Delivered' : back;
  await pool.query('UPDATE job_carts SET current_stage = ? WHERE id = ?', [stage, jobCartId]);
  await pool.query(
    'INSERT INTO job_card_stage_history (job_cart_id, stage_name, status, notes, updated_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
    [jobCartId, stage, delivered ? 'completed' : 'in_progress', delivered ? null : 'Delivery undone by admin', userId]);
};

async function buildPipeline(cart) {
  const names = await pipelineFor(cart.id);
  const [records] = await pool.query('SELECT stage_name, status, notes, updated_at FROM job_card_stages WHERE job_cart_id = ?', [cart.id]);
  const map = Object.fromEntries(records.map(r => [r.stage_name, r]));
  const currentName = cart.current_stage && names.includes(cart.current_stage) ? cart.current_stage : names[0];
  const currentIdx = names.indexOf(currentName);
  const delivered = map['Delivered']?.status === 'completed';
  const stages = names.map((name, idx) => ({
    index: idx + 1,
    stage_name: name,
    status: delivered || idx < currentIdx ? 'completed' : idx === currentIdx ? 'in_progress' : 'pending',
    notes: map[name]?.notes || null,
    updated_at: map[name]?.updated_at || null,
  }));
  return { stages, current_stage: delivered ? 'Delivered' : currentName, is_delivered: delivered };
}

exports.getStages = async (req, res) => {
  try {
    const key = String(req.params.id);
    const isToken = /^[a-f0-9]{32}$/.test(key);
    const [rows] = await pool.query(
      `SELECT jc.id, jc.status, jc.franchise_id, jc.visit_date, jc.completed_at, jc.total_amount, jc.current_stage, jc.public_token,
              v.registration_no, v.brand, v.model, u.id AS customer_id, u.name AS customer_name, u.mobile, u.email
       FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id JOIN users u ON v.customer_id = u.id
       WHERE ${isToken ? 'jc.public_token = ?' : 'jc.id = ?'}`,
      [key]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Job card not found' });
    const cart = rows[0];

    const u = req.user;
    const internal = u && ['super_admin', 'admin', 'manager', 'staff'].includes(u.role);
    const owner = u && u.role === 'customer' && u.id === cart.customer_id;
    if (!isToken) {
      if (!internal && !owner) return res.status(401).json({ success: false, error: 'Use your tracking link to view this job' });
      if (internal && u.role !== 'super_admin' && Number(cart.franchise_id) !== Number(u.franchise_id)) {
        return res.status(403).json({ success: false, error: 'This job card belongs to another franchise' });
      }
    }

    const pipeline = await buildPipeline(cart);
    let history = [];
    if (internal || owner || isToken) {
      [history] = await pool.query(
        `SELECT h.id, h.stage_name, h.status, h.notes, h.created_at, ${internal ? 'u.name AS updated_by_name' : 'NULL AS updated_by_name'}
         FROM job_card_stage_history h LEFT JOIN users u ON h.updated_by = u.id
         WHERE h.job_cart_id = ? ORDER BY h.created_at ASC`,
        [cart.id]
      );
    }
    const firstName = (cart.customer_name || '').split(' ')[0];
    res.json({
      success: true,
      data: {
        job_card: {
          id: cart.id, status: cart.status, visit_date: cart.visit_date, completed_at: cart.completed_at,
          registration_no: cart.registration_no, brand: cart.brand, model: cart.model,
          customer_name: internal || owner ? cart.customer_name : firstName,
          ...(internal || owner ? { mobile: cart.mobile, total_amount: cart.total_amount, public_token: cart.public_token } : {}),
        },
        ...pipeline,
        history,
      },
    });
  } catch (err) {
    console.error('Get stages error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/**
 * One click: PUT /job-carts/:id/stages { stage_name, notes? }
 * Every earlier stage becomes completed, the clicked stage becomes current. Clicking "Delivered" requires the
 * job card to be completed & billed first. The customer sees the change live and gets a WhatsApp message.
 */
exports.updateStage = async (req, res) => {
  try {
    const { id } = req.params;
    const cart = await loadCartForAccess(req, res, id, { write: true });
    if (!cart) return;
    const stageName = String(req.body.stage_name || '').trim();
    const notes = req.body.notes ? String(req.body.notes).trim().slice(0, 500) : null;
    if (cart.status === 'cancelled') return res.status(422).json({ success: false, error: 'Job card is cancelled' });

    const names = await pipelineFor(id);
    const idx = names.indexOf(stageName);
    if (idx === -1) return res.status(400).json({ success: false, error: 'Unknown stage' });
    const isDelivered = stageName === 'Delivered';
    if (isDelivered && cart.status !== 'complete') {
      return res.status(422).json({ success: false, error: 'Complete & bill the job card before marking it Delivered' });
    }
    if (cart.current_stage === stageName && !notes && !isDelivered) {
      return res.json({ success: true, message: 'Already at this stage' });
    }

    const conn = await pool.getConnection();
    try {
      await conn.beginTransaction();
      for (let i = 0; i < names.length; i++) {
        const st = i < idx || isDelivered ? 'completed' : i === idx ? 'in_progress' : 'pending';
        await conn.query(
          `INSERT INTO job_card_stages (job_cart_id, stage_name, status, notes, updated_at) VALUES (?, ?, ?, ?, NOW())
           ON DUPLICATE KEY UPDATE status = VALUES(status), notes = IF(? IS NULL, notes, VALUES(notes)), updated_at = IF(status <> VALUES(status) OR ? IS NOT NULL, NOW(), updated_at)`,
          [id, names[i], st, i === idx ? notes : null, i === idx ? notes : null, i === idx ? notes : null]
        );
      }
      await conn.query('UPDATE job_carts SET current_stage = ? WHERE id = ?', [stageName, id]);
      await conn.query(
        'INSERT INTO job_card_stage_history (job_cart_id, stage_name, status, notes, updated_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
        [id, stageName, isDelivered ? 'completed' : 'in_progress', notes, req.user.id]
      );
      // Delivered on the job card also closes the driver's drop task, so both screens agree.
      if (isDelivered) {
        await conn.query(
          "UPDATE deliveries SET status = 'delivered', delivered_at = NOW(), started_at = COALESCE(started_at, NOW()) WHERE job_cart_id = ? AND status <> 'delivered'", [id]);
      }
      await conn.commit();
    } catch (e) {
      await conn.rollback();
      throw e;
    } finally {
      conn.release();
    }

    const io = req.app.get('io');
    if (io) {
      const payload = { jobCartId: Number(id), stage_name: stageName, status: isDelivered ? 'completed' : 'in_progress', notes, timestamp: new Date().toISOString() };
      io.to(`job_${id}`).to(`user_${cart.customer_id}`).to(`franchise_${cart.franchise_id || 1}`).emit('pipeline:stage_updated', payload);
    }

    // Automatic WhatsApp to the customer (one message per stage change)
    try {
      const [[c]] = await pool.query(
        `SELECT v.registration_no, v.brand, v.model, u.id AS customer_id, u.mobile FROM job_carts jc
         JOIN vehicles v ON jc.vehicle_id = v.id JOIN users u ON v.customer_id = u.id WHERE jc.id = ?`, [id]);
      if (c && c.mobile) {
        const base = process.env.CLIENT_URL || 'http://localhost:5173';
        const notificationService = require('../services/notificationService');
        notificationService.notify({
          eventTrigger: 'PIPELINE_STATUS_UPDATE',
          customerId: c.customer_id,
          variables: {
            vehicle_number: c.registration_no || `${c.brand} ${c.model}`,
            stage_name: stageName,
            status_label: isDelivered ? 'Delivered' : 'In progress',
            entity_type: 'job card', entity_id: id,
            tracking_url: `${base}/job/${cart.public_token}`,
          },
          customMessageBody: `Update on your ${c.brand} ${c.model} (${c.registration_no}): it is now at *${stageName}*.${notes ? `\nNote: ${notes}` : ''}\nTrack live: ${base}/job/${cart.public_token}\n— O3 Car Spaa`,
          channels: ['whatsapp'],
          idempotencyKey: `pipeline_job_${id}_${stageName.replace(/\W+/g, '_')}_${Date.now()}`,
          referenceType: 'job_card', referenceId: Number(id), franchiseId: cart.franchise_id || 1,
        }).catch(e => console.error('[Pipeline] WhatsApp failed:', e.message));
      }
    } catch (e) {
      console.error('[Pipeline] notify error:', e.message);
    }

    res.json({ success: true, message: `Moved to "${stageName}" — customer notified on WhatsApp` });
  } catch (err) {
    console.error('Update stage error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};


// ─── Franchise / ownership guards for every per-card action ────────────
const guard = (fn, opts) => async (req, res) => {
  const cart = await loadCartForAccess(req, res, req.params.id, opts);
  if (!cart) return;
  req.jobCart = cart;
  return fn(req, res);
};
exports.update = guard(exports.update, { write: true });
exports.submit = guard(exports.submit, { write: true });
exports.complete = guard(exports.complete, { write: true });
exports.addService = guard(exports.addService, { write: true });
exports.updateService = guard(exports.updateService, { write: true });
exports.deleteService = guard(exports.deleteService, { write: true });
exports.listPhotos = guard(exports.listPhotos);
exports.uploadPhoto = guard(exports.uploadPhoto, { write: true });
exports.downloadAllPhotos = guard(exports.downloadAllPhotos);
exports.getInvoice = guard(exports.getInvoice);
exports.getJobCardPDF = guard(exports.getJobCardPDF);
exports.softDelete = guard(exports.softDelete, { write: true });
exports.restore = guard(exports.restore, { write: true });

/**
 * Draft job card for a booking the studio just confirmed — car, customer, services (priced for the car type)
 * and visit date come from the booking, so the card is ready when the car arrives. Never throws.
 */
exports.draftFromBooking = async (bookingId, user) => {
  try {
    const [[bk]] = await pool.query(
      `SELECT b.*, s.slot_date, v.registration_no AS v_reg, v.brand AS v_brand, v.model AS v_model, v.category AS v_cat
       FROM bookings b LEFT JOIN slots s ON s.id = b.slot_id LEFT JOIN vehicles v ON v.id = b.vehicle_id WHERE b.id = ?`, [bookingId]);
    if (!bk) return null;
    const { normalizeCarType } = require('../utils/carCategory');
    const carType = normalizeCarType(bk.vehicle_category || bk.v_cat) || 'sedan';
    let services = [];
    if (bk.user_package_id && bk.package_service_name) {
      services = [{ service_name: bk.package_service_name, service_price: 0, custom_notes: 'From package' }];
    } else {
      const [svcs] = await pool.query(
        `SELECT s.* FROM services s WHERE s.id IN (SELECT service_id FROM booking_services WHERE booking_id = ?) OR (s.id = ? AND NOT EXISTS (SELECT 1 FROM booking_services WHERE booking_id = ?))`,
        [bookingId, bk.service_id || 0, bookingId]);
      services = svcs.map(s => ({ service_name: s.name, service_price: Number(s[`price_${carType}`]) || Number(s.price_sedan) || 0,
        custom_notes: /ppf|film/i.test(s.name) ? 'As booked' : null }));
    }
    const fakeReq = {
      body: {
        registration_no: bk.vehicle_reg_no || bk.v_reg, car_brand: bk.vehicle_brand || bk.v_brand, car_model: bk.vehicle_model || bk.v_model,
        car_category: carType, customer_id: bk.customer_id, booking_id: bookingId, visit_date: bk.slot_date || new Date(),
        notes: `Auto-created from booking #${bookingId}${bk.booking_notes ? ' — ' + bk.booking_notes : ''}`,
        services, auto_from_booking: true, allow_duplicate: true,
      },
      user, franchiseId: bk.franchise_id || user.franchise_id || 1, ip: null,
    };
    let out = null;
    const fakeRes = { status() { return this; }, json(j) { out = j; return this; } };
    await exports.create(fakeReq, fakeRes);
    if (!out?.success) console.error('[AUTO JOB CARD] booking', bookingId, out?.error);
    const disc = Number(bk.discount_amount) || 0;
    if (out?.success && disc > 0 && !bk.user_package_id) {
      const reason = bk.offer_code ? `Offer ${bk.offer_code}` : (Number(bk.discount_percent) === 50 ? 'First wash 50% off' : 'Booking discount');
      await pool.query(
        `UPDATE job_carts SET discount_type = 'fixed', discount_value = ?, discount_reason = ?, discount_amount = LEAST(subtotal, ?), discount_approved_by = ${Number(user.id) || 'NULL'},
           total_amount = GREATEST(0, subtotal - LEAST(subtotal, ?) + pickup_charge), balance_due = GREATEST(0, subtotal - LEAST(subtotal, ?) + pickup_charge - advance_paid)
         WHERE id = ?`, [disc, reason, disc, disc, disc, out.data.id]);
    }
    return out?.data?.id || null;
  } catch (e) {
    console.error('[AUTO JOB CARD] failed:', e.message);
    return null;
  }
};

/**
 * Visits: a completed job card ticks off its scheduled visit (package visits also use one service from the
 * package), and services with a repeat setting get their future visits scheduled for this car.
 */
exports._closeVisits = async (conn, cart) => {
  try {
    const id = cart.id;
    const [svcRows] = await conn.query('SELECT service_name FROM job_services WHERE job_cart_id = ?', [id]);
    // a) the scheduled visit this card was created for
    const [visits] = await conn.query("SELECT * FROM package_service_schedules WHERE job_cart_id = ? AND status = 'pending'", [id]);
    for (const v of visits) {
      await conn.query("UPDATE package_service_schedules SET status = 'completed', completed_at = NOW() WHERE id = ?", [v.id]);
      if (v.user_package_id && !cart.booking_id) {
        await conn.query(
          'UPDATE package_usage SET used_count = used_count + 1 WHERE user_package_id = ? AND service_name = ? LIMIT 1',
          [v.user_package_id, v.service_name]).catch(() => {});
      }
    }
    // b) a package booking: tick the next pending visit of that service
    if (cart.booking_id) {
      const [[bk]] = await conn.query('SELECT user_package_id, package_service_name FROM bookings WHERE id = ?', [cart.booking_id]);
      if (bk && bk.user_package_id && bk.package_service_name) {
        for (const name of String(bk.package_service_name).split(',').map(x => x.trim()).filter(Boolean)) {
          await conn.query(
            `UPDATE package_service_schedules SET status = 'completed', completed_at = NOW(), job_cart_id = COALESCE(job_cart_id, ?)
             WHERE user_package_id = ? AND service_name = ? AND status = 'pending' ORDER BY scheduled_date ASC LIMIT 1`,
            [id, bk.user_package_id, name]);
        }
      }
    }
    // b2) walk-in card that took washes from a package: tick the next pending visit of those services
    if (!cart.booking_id) {
      const done = new Set(visits.map(v => `${v.user_package_id}|${v.service_name}`));
      const [held] = await conn.query('SELECT user_package_id, package_service_name FROM job_services WHERE job_cart_id = ? AND user_package_id IS NOT NULL AND package_service_name IS NOT NULL', [id]);
      for (const h of held) {
        if (done.has(`${h.user_package_id}|${h.package_service_name}`)) continue;
        await conn.query(
          `UPDATE package_service_schedules SET status = 'completed', completed_at = NOW(), job_cart_id = COALESCE(job_cart_id, ?)
           WHERE user_package_id = ? AND service_name = ? AND status = 'pending' AND (job_cart_id IS NULL OR job_cart_id = ?) ORDER BY scheduled_date ASC LIMIT 1`,
          [id, h.user_package_id, h.package_service_name, id]);
      }
    }
    // c) repeat visits for services that come back (e.g. every 12 months)
    for (const { service_name } of svcRows) {
      const [[svc]] = await conn.query('SELECT revisit_every_months, revisit_times FROM services WHERE name = ? AND revisit_every_months > 0 LIMIT 1', [service_name]);
      if (!svc) continue;
      const [[exists]] = await conn.query('SELECT id FROM package_service_schedules WHERE source_job_cart_id = ? AND service_name = ? LIMIT 1', [id, service_name]);
      if (exists) continue;
      for (let i = 1; i <= Math.max(1, Number(svc.revisit_times) || 1); i++) {
        await conn.query(
          `INSERT INTO package_service_schedules (user_package_id, user_id, vehicle_id, franchise_id, source_job_cart_id, service_name, instance_number, scheduled_date, status)
           VALUES (NULL, ?, ?, ?, ?, ?, ?, DATE_ADD(CURDATE(), INTERVAL ? MONTH), 'pending')`,
          [cart.customer_id, cart.vehicle_id, cart.franchise_id || 1, id, service_name, i, Number(svc.revisit_every_months) * i]);
      }
    }
  } catch (e) {
    console.error('[VISITS] close/schedule failed:', e.message);
  }
};

/** Visit day: a draft job card is waiting for every scheduled visit due today (package or repeat visit). */
exports.draftsForDueVisits = async (onDate) => {
  const made = [];
  const [due] = await pool.query(
    `SELECT s.*, v.registration_no, v.brand, v.model, v.category, v.customer_id
     FROM package_service_schedules s
     JOIN vehicles v ON v.id = COALESCE(s.vehicle_id, (SELECT up.vehicle_id FROM user_packages up WHERE up.id = s.user_package_id))
     LEFT JOIN user_packages up2 ON up2.id = s.user_package_id
     WHERE s.status = 'pending' AND s.job_cart_id IS NULL AND s.scheduled_date <= ?
       AND (s.user_package_id IS NULL OR (up2.package_status = 'active' AND up2.end_date >= ?))`, [onDate, onDate]);
  for (const v of due) {
    const [[sys]] = await pool.query("SELECT id, name, role, franchise_id FROM users WHERE role IN ('super_admin','admin') AND is_active = 1 AND (franchise_id = ? OR role = 'super_admin') ORDER BY role = 'admin' DESC LIMIT 1", [v.franchise_id || 1]);
    let out = null;
    const fakeRes = { status() { return this; }, json(j) { out = j; return this; } };
    await exports.create({
      body: {
        registration_no: v.registration_no, car_brand: v.brand, car_model: v.model, car_category: v.category, customer_id: v.customer_id,
        visit_date: onDate, allow_duplicate: true,
        notes: v.user_package_id ? `Package visit #${v.instance_number}: ${v.service_name}` : `Repeat visit #${v.instance_number}: ${v.service_name}`,
        services: [{ service_name: v.service_name, service_price: 0, custom_notes: v.user_package_id ? 'From package' : 'Scheduled repeat visit' }],
      },
      user: sys || { id: 1, role: 'super_admin', name: 'System' }, franchiseId: v.franchise_id || 1, ip: null,
    }, fakeRes);
    if (out?.success) {
      await pool.query('UPDATE package_service_schedules SET job_cart_id = ? WHERE id = ?', [out.data.id, v.id]);
      made.push(out.data.id);
    } else console.error('[VISITS] draft failed for schedule', v.id, out?.error);
  }
  return made;
};
