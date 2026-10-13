const pool = require('../config/db');
const cloudinary = require('../config/cloudinary');
const { generateInvoicePDF, generateJobCardPDF } = require('../services/invoiceService');


const { logAudit } = require('./auditController');

const checkStaffModifyPermission = (user, cart) => {
  if (user.role !== 'staff') return true;
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
          manufacture_year: vehicle.manufacture_year || vehicle.car_year || null
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

// ─── CREATE JOB CART ────────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const {
      customer_id, customer_name, customer_mobile, customer_email, visit_date, notes,
      booking_id, pre_inspector_name, personal_items_notes,
      referral_person, handler_id, technician_id, team_incentive_users,
      incentive_amount = 0, incentive_split_type = 'team_split',
      discount_type = 'fixed', discount_value = 0, discount_reason, discount_reference
    } = req.body;
    const rawReg = req.body.registration_no || req.body.regNo || req.body.reg_no || req.body.vehicle_no || '';
    const car_brand = req.body.car_brand || req.body.brand || '';
    const car_model = req.body.car_model || req.body.model || '';
    const car_registration_year = req.body.car_registration_year || req.body.registration_year || req.body.year || null;
    const regNo = (rawReg || '').toUpperCase().replace(/\s/g, '');

    if (!regNo || !car_brand || !car_model) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Registration number, brand, and model are required' });
    }

    const numDisc = parseFloat(discount_value || 0);
    if (numDisc > 0) {
      if (!discount_reason || !discount_reason.trim() || !discount_reference || !discount_reference.trim()) {
        await conn.rollback();
        return res.status(400).json({
          success: false,
          error: 'Discount reason and discount reference (approved/referred by) are mandatory whenever a discount is applied'
        });
      }
    }

    let vehicleId, custId = customer_id;

    // Check if vehicle exists
    const [existingVehicle] = await conn.query('SELECT id, customer_id FROM vehicles WHERE registration_no = ?', [regNo]);

    if (existingVehicle.length) {
      vehicleId = existingVehicle[0].id;
      custId = existingVehicle[0].customer_id;
      if (car_registration_year) {
         await conn.query('UPDATE vehicles SET registration_year = ? WHERE id = ?', [car_registration_year, vehicleId]);
      }
    } else {
      // Need customer — find or create
      if (!custId && customer_mobile) {
        const [existingUser] = await conn.query('SELECT id FROM users WHERE mobile = ? AND role = ?', [customer_mobile, 'customer']);
        if (existingUser.length) {
          custId = existingUser[0].id;
        } else {
          // Create customer
          const bcrypt = require('bcryptjs');
          const password = customer_mobile.slice(-4) + 'GKA';
          const hash = await bcrypt.hash(password, 10);
          const [newUser] = await conn.query(
            'INSERT INTO users (name, mobile, email, password_hash, role, franchise_id) VALUES (?, ?, ?, ?, ?, ?)',
            [customer_name || 'Customer', customer_mobile, customer_email || null, hash, 'customer', req.franchiseId || 1]
          );
          custId = newUser.insertId;
          await conn.query('INSERT INTO loyalty (customer_id) VALUES (?)', [custId]);
        }
      }
      if (!custId) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: 'Customer information required for new vehicle' });
      }

      // Create vehicle
      const [newVehicle] = await conn.query(
        'INSERT INTO vehicles (registration_no, customer_id, brand, model, registration_year) VALUES (?, ?, ?, ?, ?)',
        [regNo, custId, car_brand, car_model, car_registration_year || null]
      );
      vehicleId = newVehicle.insertId;
    }

    // Calculate visit number
    const [visitRows] = await conn.query(
      'SELECT COALESCE(MAX(visit_number), 0) + 1 AS next_visit FROM job_carts WHERE vehicle_id = ?',
      [vehicleId]
    );

    let bAdvanceAmount = 0;
    let bTotalAmount = 0;
    let bPickupType = 'none';
    let bPickupCharge = 0;
    if (booking_id) {
      const [bRows] = await conn.query(
        'SELECT advance_amount, total_amount, pickup_type, pickup_charge FROM bookings WHERE id = ?',
        [booking_id]
      );
      if (bRows.length) {
        bAdvanceAmount = parseFloat(bRows[0].advance_amount || 0);
        bTotalAmount = parseFloat(bRows[0].total_amount || 0);
        bPickupType = bRows[0].pickup_type || 'none';
        bPickupCharge = parseFloat(bRows[0].pickup_charge || 0);
      }
    }

    const bBalanceDue = Math.max(0, bTotalAmount - bAdvanceAmount);
    const cartFranchiseId = req.franchiseId || req.user?.franchise_id || 1;
    const teamIncentiveJson = team_incentive_users
      ? (typeof team_incentive_users === 'object' ? JSON.stringify(team_incentive_users) : team_incentive_users)
      : null;

    const [result] = await conn.query(
      `INSERT INTO job_carts 
       (vehicle_id, visit_date, visit_number, status, notes, created_by, booking_id, 
        advance_amount, advance_paid, balance_due, pickup_type, pickup_charge, pre_inspector_name, personal_items_notes, franchise_id,
        referral_person, handler_id, technician_id, team_incentive_users, incentive_amount, incentive_split_type,
        discount_type, discount_value, discount_reason, discount_reference) 
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        vehicleId, visit_date || new Date(), visitRows[0].next_visit, 'draft', notes || null, req.user.id, booking_id || null, 
        bAdvanceAmount, bAdvanceAmount, bBalanceDue, bPickupType, bPickupCharge, pre_inspector_name || null, personal_items_notes || null,
        cartFranchiseId,
        referral_person || null, handler_id || null, technician_id || null, teamIncentiveJson,
        parseFloat(incentive_amount) || 0, incentive_split_type || 'team_split',
        discount_type || 'fixed', numDisc, discount_reason?.trim() || null, discount_reference?.trim() || null
      ]
    );

    const jobCartId = result.insertId;

    // Log creation in job_card_edit_logs
    await conn.query(
      `INSERT INTO job_card_edit_logs (job_cart_id, franchise_id, user_id, user_name, user_role, change_summary, edited_at)
       VALUES (?, ?, ?, ?, ?, 'Job card created', NOW())`,
      [jobCartId, cartFranchiseId, req.user.id, req.user.name || req.user.role, req.user.role]
    );

    // Update booking status if converted from slot
    if (booking_id) {
      await conn.query("UPDATE bookings SET status = 'completed' WHERE id = ?", [booking_id]);
    }

    await conn.commit();

    res.status(201).json({ success: true, data: { id: jobCartId }, message: 'Job cart created' });
  } catch (err) {
    await conn.rollback();
    console.error('Create job cart error:', err);
    if (err.code === 'ER_DUP_ENTRY') return res.status(409).json({ success: false, error: 'Duplicate entry' });
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── LIST JOB CARTS ─────────────────────────
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
      where += ' AND v.customer_id = ?';
      params.push(req.user.id);
    }
    if (req.user.role === 'staff') {
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
      SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.notes, jc.created_at, jc.completed_at, jc.invoice_number,
             v.registration_no, v.brand, v.model,
             u.name AS customer_name, u.mobile AS customer_mobile,
             (SELECT COUNT(*) FROM job_services WHERE job_cart_id = jc.id) AS services_count,
             (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0)
              + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)
              FROM job_services js WHERE js.job_cart_id = jc.id) AS total_amount
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE ${where}
      ORDER BY jc.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(dataQuery, [...params, parseInt(limit), offset]);

    if (req.user.role === 'staff') {
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
      if (req.user.role === 'staff') {
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
        handler_id: cart.handler_id || null,
        handler_name: cart.handler_name || null,
        handler_mobile: cart.handler_mobile || null,
        technician_id: cart.technician_id || null,
        technician_name: cart.technician_name || null,
        technician_mobile: cart.technician_mobile || null,
        team_incentive_users: cart.team_incentive_users || null,
        incentive_amount: parseFloat(cart.incentive_amount || 0),
        incentive_split_type: cart.incentive_split_type || 'team_split',
        loyalty_points_earned: cart.loyalty_points_earned || 0,
        edit_logs: editLogs,
        incentive_splits: incentiveSplits,
        customer: req.user.role === 'staff'
          ? { id: cart.customer_id, name: cart.customer_name }
          : { id: cart.customer_id, name: cart.customer_name, mobile: cart.customer_mobile, email: cart.customer_email },
        services,
        photos,
        subtotal: req.user.role === 'staff' ? undefined : (parseFloat(cart.subtotal) || (totalAmount ? totalAmount - parseFloat(cart.pickup_charge || 0) : 0)),
        total_amount: totalAmount,
        discount_type: req.user.role === 'staff' ? undefined : (cart.discount_type || 'fixed'),
        discount_value: req.user.role === 'staff' ? undefined : (parseFloat(cart.discount_value) || 0),
        discount_amount: req.user.role === 'staff' ? undefined : (parseFloat(cart.discount_amount) || 0),
        discount_reason: req.user.role === 'staff' ? undefined : (cart.discount_reason || null),
        discount_reference: req.user.role === 'staff' ? undefined : (cart.discount_reference || null),
        gst_type: req.user.role === 'staff' ? undefined : (cart.gst_type || 'with_gst'),
        gst_pct: req.user.role === 'staff' ? undefined : (parseFloat(cart.gst_pct) || 18.00),
        gst_amount: req.user.role === 'staff' ? undefined : (parseFloat(cart.gst_amount) || 0),
        invoice_notes: req.user.role === 'staff' ? undefined : cart.invoice_notes,
        advance_amount: req.user.role === 'staff' ? undefined : cart.advance_amount,
        advance_paid: req.user.role === 'staff' ? undefined : cart.advance_paid,
        balance_due: req.user.role === 'staff' ? undefined : cart.balance_due,
        pickup_type: req.user.role === 'staff' ? undefined : cart.pickup_type,
        pickup_charge: req.user.role === 'staff' ? undefined : parseFloat(cart.pickup_charge || 0),
        pre_inspector_name: cart.pre_inspector_name || null,
        personal_items_notes: cart.personal_items_notes || null,
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
      visit_date, notes, discount_type, discount_value, discount_reason, discount_reference,
      gst_type, gst_pct, pickup_type, pickup_charge, advance_paid, invoice_notes,
      pre_inspector_name, personal_items_notes,
      referral_person, handler_id, technician_id, team_incentive_users,
      incentive_amount, incentive_split_type
    } = req.body;

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
      if (!isWithin1Day && req.user.role !== 'admin') {
        return res.status(422).json({ success: false, error: 'Cannot edit completed job cart after 1 day without Admin override' });
      }
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
      const dRef = discount_reference !== undefined ? discount_reference : oldCart.discount_reference;
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
    const advPaid = parseFloat(advance_paid !== undefined ? advance_paid : (oldCart.advance_paid || 0));
    const balDue = Math.max(0, totalAmount - advPaid);

    const teamUsersJson = team_incentive_users !== undefined
      ? (typeof team_incentive_users === 'object' ? JSON.stringify(team_incentive_users) : team_incentive_users)
      : oldCart.team_incentive_users;

    // Track all changed fields for job_card_edit_logs
    const changeLogs = [];
    if (visit_date && String(visit_date) !== String(oldCart.visit_date).slice(0, 10)) changeLogs.push(`Visit date changed to ${visit_date}`);
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
    if (advance_paid !== undefined && parseFloat(advance_paid) !== parseFloat(oldCart.advance_paid || 0)) {
      changeLogs.push(`Advance paid updated to ₹${advance_paid}`);
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
        visit_date || null, notes !== undefined ? notes : oldCart.notes,
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
            estimated_time: '2 hours' 
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

    // 1. Check status is 'open'
    const [cart] = await conn.query(
      `SELECT jc.*, v.customer_id FROM job_carts jc JOIN vehicles v ON jc.vehicle_id = v.id WHERE jc.id = ?`,
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
    grandTotal = Math.max(0, grandTotal - discountAmt + pickupCharge);

    const advancePaid = parseFloat(cart[0].advance_paid || 0);
    const amountCollectedNow = Math.max(0, grandTotal - advancePaid);

    // ─── INCENTIVE ENGINE (Calculations & Splits) ───
    let totalIncentive = parseFloat(cart[0].incentive_amount || 0);
    const franchiseId = cart[0].franchise_id || 1;

    // Fetch active franchise incentive rule
    const [incRuleRows] = await conn.query(
      'SELECT * FROM incentive_rules WHERE (franchise_id = ? OR franchise_id IS NULL) AND is_active = 1 ORDER BY id DESC LIMIT 1',
      [franchiseId]
    );
    const incRule = incRuleRows[0] || {
      rule_type: 'percentage',
      rule_value: 5.0,
      min_job_amount: 0.0,
      lead_technician_share_pct: 50.0,
      team_share_pct: 40.0,
      manager_share_pct: 10.0
    };

    if (totalIncentive <= 0 && grandTotal >= parseFloat(incRule.min_job_amount || 0)) {
      totalIncentive = incRule.rule_type === 'percentage'
        ? Math.round((grandTotal * (parseFloat(incRule.rule_value) / 100)) * 100) / 100
        : parseFloat(incRule.rule_value);
    }

    if (totalIncentive > 0) {
      // Clear previous splits for idempotency
      await conn.query('DELETE FROM incentive_splits WHERE job_cart_id = ?', [id]);

      const leadPct = parseFloat(incRule.lead_technician_share_pct || 50);
      const teamPct = parseFloat(incRule.team_share_pct || 40);
      const mgrPct = parseFloat(incRule.manager_share_pct || 10);
      const periodMonth = new Date().getMonth() + 1;
      const periodYear = new Date().getFullYear();

      // 1. Lead Technician split
      if (cart[0].technician_id) {
        const techAmt = Math.round((totalIncentive * (leadPct / 100)) * 100) / 100;
        const [tUser] = await conn.query('SELECT name FROM users WHERE id = ?', [cart[0].technician_id]);
        await conn.query(
          `INSERT INTO incentive_splits 
           (job_cart_id, franchise_id, user_id, user_name, role_in_job, amount, status, period_month, period_year)
           VALUES (?, ?, ?, ?, 'lead_technician', ?, 'approved', ?, ?)`,
          [id, franchiseId, cart[0].technician_id, tUser[0]?.name || 'Lead Technician', techAmt, periodMonth, periodYear]
        );
      }

      // 2. Handling Manager split
      if (cart[0].handler_id) {
        const mgrAmt = Math.round((totalIncentive * (mgrPct / 100)) * 100) / 100;
        const [mUser] = await conn.query('SELECT name FROM users WHERE id = ?', [cart[0].handler_id]);
        await conn.query(
          `INSERT INTO incentive_splits 
           (job_cart_id, franchise_id, user_id, user_name, role_in_job, amount, status, period_month, period_year)
           VALUES (?, ?, ?, ?, 'handling_manager', ?, 'approved', ?, ?)`,
          [id, franchiseId, cart[0].handler_id, mUser[0]?.name || 'Handling Manager', mgrAmt, periodMonth, periodYear]
        );
      }

      // 3. Team Incentive Members split
      let teamMemberIds = [];
      if (cart[0].team_incentive_users) {
        try {
          const parsed = typeof cart[0].team_incentive_users === 'string'
            ? JSON.parse(cart[0].team_incentive_users)
            : cart[0].team_incentive_users;
          if (Array.isArray(parsed)) {
            teamMemberIds = parsed.map(u => typeof u === 'object' ? u.id : parseInt(u, 10)).filter(Boolean);
          }
        } catch (e) {
          teamMemberIds = String(cart[0].team_incentive_users).split(',').map(s => parseInt(s.trim(), 10)).filter(Boolean);
        }
      }

      if (teamMemberIds.length > 0) {
        const teamPool = totalIncentive * (teamPct / 100);
        const perMemberAmt = Math.round((teamPool / teamMemberIds.length) * 100) / 100;
        for (const memId of teamMemberIds) {
          const [memUser] = await conn.query('SELECT name FROM users WHERE id = ?', [memId]);
          await conn.query(
            `INSERT INTO incentive_splits 
             (job_cart_id, franchise_id, user_id, user_name, role_in_job, amount, status, period_month, period_year)
             VALUES (?, ?, ?, ?, 'team_member', ?, 'approved', ?, ?)`,
            [id, franchiseId, memId, memUser[0]?.name || 'Team Member', perMemberAmt, periodMonth, periodYear]
          );
        }
      }

      await conn.query('UPDATE job_carts SET incentive_amount = ? WHERE id = ?', [totalIncentive, id]);
    }

    // ─── LOYALTY ENGINE (Auto-Credit & Full Ledger) ───
    if (customerId) {
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

    // 6. Create transaction
    await conn.query(
      'INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by) VALUES (?, ?, ?, ?, ?, CURDATE(), ?)',
      ['job_revenue', id, amountCollectedNow, 'in', `Job Cart #${id} balance completed (Advance ₹${advancePaid} paid previously)`, req.user.id]
    );

    // 7. Generate invoice number
    const [settingsRows] = await conn.query("SELECT value FROM settings WHERE key_name = 'invoice_prefix'");
    const [counterRows] = await conn.query("SELECT value FROM settings WHERE key_name = 'invoice_counter' FOR UPDATE");
    const prefix = settingsRows[0]?.value || 'O3';
    const counter = parseInt(counterRows[0]?.value || '1000', 10);
    const invoiceNumber = `${prefix}-${new Date().getFullYear()}-${counter}`;

    await conn.query("UPDATE settings SET value = CAST(CAST(value AS UNSIGNED) + 1 AS CHAR) WHERE key_name = 'invoice_counter'");
    await conn.query(
      "UPDATE job_carts SET invoice_number = ?, balance_due = 0, payment_status = 'paid' WHERE id = ?",
      [invoiceNumber, id]
    );

    // GST auto-logging for Completed Job Cart Tax Invoice
    const [gstSetting] = await conn.query("SELECT value FROM settings WHERE key_name = 'is_gst_applicable'");
    const isGstEnabled = gstSetting.length && gstSetting[0].value === '1';
    if (isGstEnabled) {
      const periodMonth = new Date().getMonth() + 1;
      const periodYear = new Date().getFullYear();
      const [gstSettingNo] = await conn.query("SELECT value FROM settings WHERE key_name = 'gstin'");
      const gstin = gstSettingNo.length ? gstSettingNo[0].value : '';

      const taxableAmount = grandTotal / 1.18;
      const totalGst = grandTotal - taxableAmount;
      const cgst = totalGst / 2;
      const sgst = totalGst / 2;
      const igst = 0;

      await conn.query(
        `INSERT INTO v2_gst_records (record_type, invoice_id, gstin, taxable_amount, cgst, sgst, igst, total_gst, period_month, period_year)
         VALUES ('sales', ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [id, gstin, taxableAmount, cgst, sgst, igst, totalGst, periodMonth, periodYear]
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
        `INSERT INTO v2_review_requests (customer_id, booking_id, job_cart_id, sent_via, status, feedback_token)
         VALUES (?, ?, ?, 'whatsapp', 'sent', ?)`,
        [customerId, cart[0].booking_id, id, token]
      );

      const [cDetails] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [customerId]);
      if (cDetails.length) {
        const c = cDetails[0];
        const domain = process.env.CLIENT_URL || 'http://localhost:5173';
        const feedbackUrl = `${domain}/feedback/${token}`;
        const msgText = `Dear ${c.name || 'Customer'}, thank you for choosing O3 Car Spaa! We would love to hear your feedback. Please rate your experience here: ${feedbackUrl}`;

        await pool.query(
          `INSERT INTO v2_notification_logs (customer_id, template_name, channel, mobile, message_body, status, response_data)
           VALUES (?, 'FEEDBACK_REQUEST', 'whatsapp', ?, ?, 'pending', ?)`,
          [
            customerId,
            c.mobile,
            msgText,
            JSON.stringify({ redirect_url: `https://api.whatsapp.com/send?phone=${c.mobile}&text=${encodeURIComponent(msgText)}` })
          ]
        );
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

    if (!service_name) return res.status(400).json({ success: false, error: 'Service name is required' });

    const [cart] = await conn.query('SELECT status, completed_at, visit_date, franchise_id FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Not found' }); }

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && req.user.role !== 'admin') {
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

    const [cart] = await conn.query('SELECT status, completed_at, visit_date, franchise_id FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Cart not found' }); }

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      await conn.rollback();
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && req.user.role !== 'admin') {
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
      [service_name, service_price, labor_charges, custom_price || null, custom_notes ? custom_notes.trim() : null, sid, id]
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
        `Updated service #${sid}: ${service_name}${custom_notes ? ` [Note: ${custom_notes}]` : ''}`
      ]
    );

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
    const [cart] = await pool.query('SELECT status, completed_at, visit_date, franchise_id FROM job_carts WHERE id = ?', [id]);
    if (!cart.length) return res.status(404).json({ success: false, error: 'Not found' });

    if (!checkStaffModifyPermission(req.user, cart[0])) {
      return res.status(403).json({ success: false, error: 'Staff can only modify today\'s job carts' });
    }

    if (cart[0].status === 'complete') {
      const isWithin1Day = (new Date() - new Date(cart[0].completed_at)) < 24 * 60 * 60 * 1000;
      if (!isWithin1Day && req.user.role !== 'admin') {
        return res.status(422).json({ success: false, error: 'Cannot modify completed cart after 1 day without Admin override' });
      }
    }

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

    res.json({ success: true, message: 'Service deleted' });
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

    const [cart] = await pool.query('SELECT visit_date FROM job_carts WHERE id = ?', [id]);
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
              { folder: `gk-autoherb/job-photos/${id}`, resource_type: 'image' },
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
    const [cart] = await pool.query('SELECT visit_date FROM job_carts WHERE id = ?', [photo.job_cart_id]);
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
    res.json({ success: true, message: 'Job cart cancelled' });
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
    res.json({ success: true, message: 'Job cart restored' });
  } catch (err) {
    console.error('Job cart restore error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET / UPDATE JOB CARD STAGES (PHASE 6 PIPELINE) ────────
exports.getStages = async (req, res) => {
  try {
    const { id } = req.params;

    // 1. Get job cart details + vehicle + customer info
    const [jcRows] = await pool.query(`
      SELECT jc.id, jc.status, jc.franchise_id, jc.visit_date, jc.completed_at, jc.total_amount,
             v.registration_no, v.brand, v.model,
             u.id AS customer_id, u.name AS customer_name, u.mobile, u.email
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE jc.id = ?
    `, [id]);

    if (!jcRows.length) {
      return res.status(404).json({ success: false, error: 'Job card not found' });
    }
    const jobCart = jcRows[0];

    // 2. Check if services in this job card define custom process stages
    const [servicesRows] = await pool.query(`
      SELECT s.id, s.name, s.process_json
      FROM job_services js
      JOIN services s ON js.service_name = s.name
      WHERE js.job_cart_id = ?
    `, [id]);

    // Standard default 7 stages as specified in Phase 6 prompt
    let pipelineStages = [
      'Received',
      'Inspection',
      'Stage 1 done',
      'Stage 2 done',
      'Quality check',
      'Ready',
      'Delivered'
    ];

    // If any service has custom process_json with array of stages, use them
    for (const s of servicesRows) {
      if (s.process_json) {
        try {
          const parsed = typeof s.process_json === 'string' ? JSON.parse(s.process_json) : s.process_json;
          if (Array.isArray(parsed) && parsed.length > 0) {
            pipelineStages = parsed;
            break;
          }
        } catch (e) {
          // ignore json parse error, keep default
        }
      }
    }

    // 3. Fetch existing stage records from job_card_stages
    const [stageRecords] = await pool.query(
      'SELECT * FROM job_card_stages WHERE job_cart_id = ? ORDER BY id ASC',
      [id]
    );
    const stageMap = {};
    stageRecords.forEach(s => { stageMap[s.stage_name] = s; });

    // 4. Fetch timestamped transition history from job_card_stage_history
    const [historyRows] = await pool.query(`
      SELECT h.*, u.name AS updated_by_name
      FROM job_card_stage_history h
      LEFT JOIN users u ON h.updated_by = u.id
      WHERE h.job_cart_id = ?
      ORDER BY h.created_at ASC
    `, [id]);

    // 5. Build structured stage objects
    let lastCompletedIdx = -1;
    let foundInProgress = false;

    const stages = pipelineStages.map((stageName, idx) => {
      const record = stageMap[stageName];
      const isCompleted = record?.status === 'completed';
      const isInProgress = record?.status === 'in_progress';
      if (isCompleted) lastCompletedIdx = idx;
      if (isInProgress) foundInProgress = true;

      return {
        index: idx + 1,
        stage_name: stageName,
        status: record?.status || (idx === 0 && !record && !foundInProgress ? 'in_progress' : 'pending'),
        notes: record?.notes || null,
        updated_at: record?.updated_at || null,
        completed_at: isCompleted ? (record?.updated_at || null) : null
      };
    });

    // 6. Calculate current active stage
    let currentStage = pipelineStages[0];
    const inProgressStage = stages.find(s => s.status === 'in_progress');
    if (inProgressStage) {
      currentStage = inProgressStage.stage_name;
    } else if (lastCompletedIdx >= 0 && lastCompletedIdx < stages.length - 1) {
      currentStage = stages[lastCompletedIdx + 1].stage_name;
    } else if (lastCompletedIdx === stages.length - 1) {
      currentStage = 'Delivered';
    }

    res.json({
      success: true,
      data: {
        job_card: jobCart,
        stages,
        current_stage: currentStage,
        history: historyRows,
        is_delivered: jobCart.status === 'complete' || stageMap['Delivered']?.status === 'completed'
      }
    });
  } catch (err) {
    console.error('Get stages error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateStage = async (req, res) => {
  try {
    const { id } = req.params;
    const { stage_name, status, notes, notify = true } = req.body;
    const updatedBy = req.user?.id || null;

    if (!stage_name || !status) {
      return res.status(400).json({ success: false, error: 'stage_name and status are required' });
    }

    const [existing] = await pool.query(
      'SELECT id, status FROM job_card_stages WHERE job_cart_id = ? AND stage_name = ?',
      [id, stage_name]
    );
    const prevStatus = existing.length ? existing[0].status : 'pending';

    // 1. Upsert into job_card_stages
    if (existing.length) {
      await pool.query(
        'UPDATE job_card_stages SET status = ?, notes = COALESCE(?, notes), updated_at = NOW() WHERE id = ?',
        [status, notes || null, existing[0].id]
      );
    } else {
      await pool.query(
        'INSERT INTO job_card_stages (job_cart_id, stage_name, status, notes, updated_at) VALUES (?, ?, ?, ?, NOW())',
        [id, stage_name, status, notes || null]
      );
    }

    // 2. Log immutable transition in job_card_stage_history with timestamp
    await pool.query(
      'INSERT INTO job_card_stage_history (job_cart_id, stage_name, status, notes, updated_by, created_at) VALUES (?, ?, ?, ?, ?, NOW())',
      [id, stage_name, status, notes || null, updatedBy]
    );

    // 3. If stage is 'Delivered' and completed, mark job card as complete
    if ((stage_name === 'Delivered' || stage_name.toLowerCase() === 'delivered') && status === 'completed') {
      await pool.query(
        "UPDATE job_carts SET status = 'complete', completed_at = COALESCE(completed_at, NOW()) WHERE id = ?",
        [id]
      );
    }

    // 4. Emit Socket.io real-time broadcast
    const io = req.app.get('io');
    if (io) {
      const eventPayload = {
        jobCartId: parseInt(id),
        stage_name,
        status,
        notes: notes || null,
        timestamp: new Date().toISOString()
      };
      io.emit('pipeline:stage_updated', eventPayload);
      io.to(`job_${id}`).emit('pipeline:stage_updated', eventPayload);
    }

    // 5. Phase 5 / Phase 6 Hook: Pipeline status-change notification
    if (notify !== false) {
      try {
        const [jcCust] = await pool.query(`
          SELECT jc.franchise_id, v.registration_no, v.brand, v.model, u.id AS customer_id, u.mobile, u.email
          FROM job_carts jc
          JOIN vehicles v ON jc.vehicle_id = v.id
          JOIN users u ON v.customer_id = u.id
          WHERE jc.id = ?
        `, [id]);
        if (jcCust.length) {
          const c = jcCust[0];
          const notificationService = require('../services/notificationService');
          notificationService.notifyPipelineStageChange({
            entityType: 'job_card',
            entityId: id,
            fromStatus: prevStatus,
            toStatus: status,
            customerId: c.customer_id,
            mobile: c.mobile,
            email: c.email,
            vehicleNumber: c.registration_no || `${c.brand || ''} ${c.model || ''}`.trim(),
            stageName: stage_name,
            statusLabel: status,
            franchiseId: c.franchise_id || 1
          }).catch(err => {
            console.error('[PipelineHook] Stage notification failed (non-blocking):', err.message);
          });
        }
      } catch (hookErr) {
        console.error('[PipelineHook] Hook trigger error:', hookErr.message);
      }
    }

    res.json({
      success: true,
      message: `Stage ${stage_name} updated to ${status}`,
      timestamp: new Date().toISOString()
    });
  } catch (err) {
    console.error('Update stage error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

