const pool = require('../config/db');
const messagingService = require('../services/messagingService');

// ─── GET LAST PICKUP ADDRESS ──────────────────────────────────────────────
exports.getLastAddress = async (req, res) => {
  try {
    const customerId = req.user.id;
    const [rows] = await pool.query(
      'SELECT address FROM v2_pickup_requests WHERE customer_id = ? ORDER BY id DESC LIMIT 1',
      [customerId]
    );
    res.json({ success: true, address: rows.length > 0 ? rows[0].address : '' });
  } catch (err) {
    console.error('Get last pickup address error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch last address' });
  }
};

// ─── CREATE PICKUP REQUEST ────────────────────────────────────────────────
exports.create = async (req, res) => {
  try {
    const { booking_id, address, scheduled_time, notes, request_type } = req.body;
    const lat = parseFloat(req.body.latitude), lng = parseFloat(req.body.longitude);
    const pin = Math.abs(lat) <= 90 && Math.abs(lng) <= 180 ? [lat, lng] : [null, null];

    if (!booking_id || !address) {
      return res.status(400).json({ success: false, error: 'Booking ID and address are required' });
    }

    // Verify booking and get customer_id and pickup_charge
    const [bookings] = await pool.query('SELECT customer_id, pickup_charge, pickup_type FROM bookings WHERE id = ?', [booking_id]);
    if (!bookings.length) {
      return res.status(404).json({ success: false, error: 'Booking not found' });
    }
    const customerId = bookings[0].customer_id;
    const pickupCharges = bookings[0].pickup_charge || 0;
    const resolvedRequestType = request_type || bookings[0].pickup_type || 'pickup';

    // Check permissions: only customer who owns the booking or admin can create pickup
    if (req.user.role === 'customer' && customerId !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to request pickup for this booking' });
    }

    // the booking already made its pickup request → just update time / pin, never a second one
    const [[already]] = await pool.query("SELECT id FROM v2_pickup_requests WHERE booking_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1", [booking_id]);
    if (already) {
      await pool.query(
        `UPDATE v2_pickup_requests SET address = ?, scheduled_time = COALESCE(?, scheduled_time), notes = COALESCE(?, notes),
                latitude = COALESCE(?, latitude), longitude = COALESCE(?, longitude) WHERE id = ?`,
        [address, scheduled_time || null, notes || null, pin[0], pin[1], already.id]);
      return res.status(200).json({ success: true, message: 'Pickup request updated', data: { id: already.id } });
    }

    const [result] = await pool.query(
      `INSERT INTO v2_pickup_requests (booking_id, customer_id, address, scheduled_time, notes, pickup_charges, status, request_type, latitude, longitude)
       VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?)`,
      [booking_id, customerId, address, scheduled_time || null, notes || null, pickupCharges, resolvedRequestType, ...pin]
    );

    res.status(201).json({
      success: true,
      message: 'Pickup request created successfully',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('Create pickup request error:', err);
    res.status(500).json({ success: false, error: 'Failed to create pickup request' });
  }
};

// ─── LIST PICKUP REQUESTS ──────────────────────────────────────────────────
exports.list = async (req, res) => {
  try {
    let query = `
      SELECT pr.*, 
             u.name AS customer_name, u.mobile AS customer_mobile,
             s.name AS staff_name, s.mobile AS staff_mobile,
             b.status AS booking_status
      FROM v2_pickup_requests pr
      JOIN users u ON pr.customer_id = u.id
      JOIN bookings b ON pr.booking_id = b.id
      LEFT JOIN users s ON pr.assigned_staff_id = s.id
    `;
    const params = [];

    if (req.user.role === 'customer') {
      query += ' WHERE pr.customer_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'staff') {
      // front desk with the Pickups module sees every pickup; drivers see only the ones given to them
      const perms = await require('../middleware/accessControl').getEffectivePermissions(req.user);
      if (!perms.includes('pickups.view')) {
        query += ' WHERE pr.assigned_staff_id = ?';
        params.push(req.user.id);
      }
    }

    query += ' ORDER BY pr.created_at DESC';

    const [rows] = await pool.query(query, params);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('List pickup requests error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pickup requests' });
  }
};

// ─── ASSIGN STAFF TO PICKUP ───────────────────────────────────────────────
exports.assign = async (req, res) => {
  try {
    const { id } = req.params;
    const { assigned_staff_id } = req.body;

    if (!assigned_staff_id) {
      return res.status(400).json({ success: false, error: 'Staff ID is required' });
    }

    // Verify pickup request exists
    const [pickups] = await pool.query('SELECT * FROM v2_pickup_requests WHERE id = ?', [id]);
    if (!pickups.length) {
      return res.status(404).json({ success: false, error: 'Pickup request not found' });
    }
    const pickup = pickups[0];
    if (['cancelled', 'picked_up', 'completed', 'delivered'].includes(pickup.status)) {
      return res.status(422).json({ success: false, error: `This pickup is already ${String(pickup.status).replace('_', ' ')}` });
    }
    const [staffUsers] = await pool.query("SELECT id, name, mobile FROM users WHERE id = ? AND role NOT IN ('customer') AND is_active = 1 AND is_deleted = 0 AND COALESCE(franchise_id, 1) = ?",
      [assigned_staff_id, Number(pickup.franchise_id) || Number(req.franchiseId) || 1]);
    if (!staffUsers.length) {
      return res.status(400).json({ success: false, error: 'Invalid staff ID' });
    }
    const staff = staffUsers[0];

    // Update pickup status
    await pool.query(
      "UPDATE v2_pickup_requests SET assigned_staff_id = ?, status = 'assigned' WHERE id = ?",
      [assigned_staff_id, id]
    );

    // Get customer info for notification
    const [custUsers] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [pickup.customer_id]);
    if (custUsers.length && staff.mobile) {
      const customer = custUsers[0];
      const timeStr = pickup.scheduled_time 
        ? new Date(pickup.scheduled_time).toLocaleString('en-IN', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
        : 'scheduled time';
      
      const driverMsg = `O3 Car Spaa: Hi ${staff.name}, you have been assigned to pick up vehicle for booking #${pickup.booking_id} from ${customer.name}. Address: ${pickup.address}. Scheduled Time: ${timeStr}.`;
      messagingService.sendWhatsApp(staff.mobile, null, { body: driverMsg }).catch(() => {});
    }

    res.json({ success: true, message: 'Driver assigned successfully' });
  } catch (err) {
    console.error('Assign pickup staff error:', err);
    res.status(500).json({ success: false, error: 'Failed to assign staff' });
  }
};

// ─── MARK VEHICLE AS PICKED UP ────────────────────────────────────────────
exports.markPickedUp = async (req, res) => {
  try {
    const { id } = req.params;

    // Verify pickup request exists
    const [pickups] = await pool.query('SELECT * FROM v2_pickup_requests WHERE id = ?', [id]);
    if (!pickups.length) {
      return res.status(404).json({ success: false, error: 'Pickup request not found' });
    }
    const pickup = pickups[0];

    // Authorize: Only admin or assigned staff
    if (req.user.role === 'staff' && pickup.assigned_staff_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized. You are not assigned to this pickup' });
    }
    if (pickup.status !== 'assigned' && pickup.status !== 'pending' && pickup.status !== 'requested') {
      return res.status(422).json({ success: false, error: `This pickup is ${String(pickup.status).replace('_', ' ')} — it cannot be marked picked up` });
    }

    // Update status to picked_up
    await pool.query("UPDATE v2_pickup_requests SET status = 'picked_up' WHERE id = ?", [id]);

    // Send WhatsApp notification to customer
    const [custUsers] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [pickup.customer_id]);
    if (custUsers.length && custUsers[0].mobile) {
      const customer = custUsers[0];
      
      // Get driver info
      let driverName = 'our executive';
      if (pickup.assigned_staff_id) {
        const [driverRows] = await pool.query('SELECT name FROM users WHERE id = ?', [pickup.assigned_staff_id]);
        if (driverRows.length) driverName = driverRows[0].name;
      }

      const custMsg = `🚙 *Vehicle Picked Up*\n\nHi ${customer.name},\nYour vehicle has been successfully picked up by ${driverName} for Booking #${pickup.booking_id} and is on the way to the studio.\n\nThank you, O3 Car Spaa!`;
      messagingService.sendWhatsApp(customer.mobile, null, { body: custMsg }).catch(() => {});
    }

    res.json({ success: true, message: 'Pickup status updated to picked_up' });
  } catch (err) {
    console.error('Mark picked up error:', err);
    res.status(500).json({ success: false, error: 'Failed to update pickup status' });
  }
};

// ─── GET SINGLE PICKUP BY ID OR BOOKING ID ─────────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const { id } = req.params; // Can be pickup id or booking id (using query param or standard identifier)
    
    // We search by pickup ID or booking ID depending on routing
    const [pickups] = await pool.query(
      `SELECT pr.*, 
              u.name AS customer_name, u.mobile AS customer_mobile,
              s.name AS staff_name, s.mobile AS staff_mobile,
              b.status AS booking_status
       FROM v2_pickup_requests pr
       JOIN users u ON pr.customer_id = u.id
       JOIN bookings b ON pr.booking_id = b.id
       LEFT JOIN users s ON pr.assigned_staff_id = s.id
       WHERE pr.id = ? OR pr.booking_id = ?`,
      [id, id]
    );

    if (!pickups.length) {
      return res.status(404).json({ success: false, error: 'Pickup request not found' });
    }
    const pickup = pickups[0];

    // Check ownership
    if (req.user.role === 'customer' && pickup.customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, data: pickup });
  } catch (err) {
    console.error('Get pickup details error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch pickup details' });
  }
};

// ─── GET CUSTOMER SAVED ADDRESSES ──────────────────────────────────────────
exports.getAddresses = async (req, res) => {
  try {
    const customerId = req.user.role === 'admin' && req.query.customer_id
      ? req.query.customer_id
      : req.user.id;

    const [rows] = await pool.query(
      'SELECT * FROM v2_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, created_at DESC',
      [customerId]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get customer addresses error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch saved addresses' });
  }
};

// ─── SAVE NEW CUSTOMER ADDRESS ─────────────────────────────────────────────
exports.createAddress = async (req, res) => {
  try {
    const customerId = req.user.id;
    const { address, landmark, city, state, pincode, latitude, longitude, is_default } = req.body;

    if (!address || !city || !state || !pincode) {
      return res.status(400).json({ success: false, error: 'Address, city, state and pincode are required' });
    }

    if (is_default) {
      await pool.query('UPDATE v2_customer_addresses SET is_default = 0 WHERE customer_id = ?', [customerId]);
    }

    const [result] = await pool.query(
      `INSERT INTO v2_customer_addresses 
       (customer_id, address, landmark, city, state, pincode, latitude, longitude, is_default)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customerId, address, landmark || null, city, state, pincode, latitude || null, longitude || null, is_default ? 1 : 0]
    );

    res.status(201).json({ success: true, message: 'Address saved successfully', data: { id: result.insertId } });
  } catch (err) {
    console.error('Create customer address error:', err);
    res.status(500).json({ success: false, error: 'Failed to save address' });
  }
};

// ─── CANCEL a pickup / drop ─────────────────
// Admin: any request that is not picked up yet. Customer: only their own, before a driver is assigned.
exports.cancel = async (req, res) => {
  try {
    const { id } = req.params;
    const [[p]] = await pool.query('SELECT * FROM v2_pickup_requests WHERE id = ?', [id]);
    if (!p) return res.status(404).json({ success: false, error: 'Pickup request not found' });
    if (req.user.role === 'customer') {
      if (Number(p.customer_id) !== Number(req.user.id)) return res.status(404).json({ success: false, error: 'Pickup request not found' });
      if (p.status !== 'pending') return res.status(400).json({ success: false, error: 'A driver is already assigned — please call the studio to cancel' });
    }
    if (p.status === 'picked_up') return res.status(400).json({ success: false, error: 'The car has already been picked up' });
    if (p.status === 'cancelled') return res.json({ success: true, message: 'Already cancelled' });
    await pool.query("UPDATE v2_pickup_requests SET status = 'cancelled' WHERE id = ?", [id]);
    res.json({ success: true, message: 'Pickup cancelled' });
  } catch (err) {
    console.error('Cancel pickup error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
