const pool = require('../config/db');

// Shared SELECT for delivery queries — uses correct vehicle column names
const DELIVERY_SELECT = `
  SELECT d.*, 
         u.name as staff_name, u.mobile as staff_mobile,
         c.name as customer_name, c.mobile as customer_mobile,
         v.registration_no, v.brand, v.model
  FROM deliveries d
  LEFT JOIN users u ON d.staff_id = u.id
  JOIN users c ON d.customer_id = c.id
  JOIN job_carts jc ON d.job_cart_id = jc.id
  JOIN vehicles v ON jc.vehicle_id = v.id
`;

// ─── LIST ──────────────────────────────────
exports.list = async (req, res) => {
  try {
    const { status } = req.query;
    let where = '1=1';
    const params = [];
    
    // Filter by role
    if (req.user.role === 'customer') {
      where += ' AND d.customer_id = ?';
      params.push(req.user.id);
    } else if (req.user.role === 'staff') {
      where += ' AND d.staff_id = ?';
      params.push(req.user.id);
    }

    if (status) {
      where += ' AND d.status = ?';
      params.push(status);
    }

    const [rows] = await pool.query(
      `${DELIVERY_SELECT} WHERE ${where} ORDER BY FIELD(d.status,'assigned','in_transit','delivered'), COALESCE(d.started_at, NOW()) DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Deliveries list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE ─────────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${DELIVERY_SELECT} WHERE d.id = ?`,
      [req.params.id]
    );

    if (!rows.length) return res.status(404).json({ success: false, error: 'Delivery not found' });
    
    const delivery = rows[0];

    if (!(await canSeeDelivery(req, delivery))) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, data: delivery });
  } catch (err) {
    console.error('Delivery getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ACTIVE DELIVERY (Staff) ─────────
// Who may see a delivery: assigned driver, the customer, or internal users of the same franchise
async function canSeeDelivery(req, d) {
  if (!d) return false;
  if (req.user.role === 'super_admin') return true;
  if (d.staff_id === req.user.id || d.customer_id === req.user.id) return true;
  if (['admin', 'manager'].includes(req.user.role) && Number(d.franchise_id || 1) === Number(req.franchiseId || 1)) return true;
  if (req.user.role === 'staff' && Number(d.franchise_id || 1) === Number(req.franchiseId || 1)) {
    const { getEffectivePermissions } = require('../middleware/accessControl');
    return (await getEffectivePermissions(req.user)).includes('deliveries.view');
  }
  return false;
}

// ─── ASSIGNED TO ME (driver) ────────────
exports.getAssigned = async (req, res) => {
  try {
    const [rows] = await pool.query(`${DELIVERY_SELECT} WHERE d.staff_id = ? AND d.status IN ('assigned','in_transit') ORDER BY d.status = 'in_transit' DESC, d.id DESC`, [req.user.id]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Delivery assigned error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getActiveDelivery = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${DELIVERY_SELECT} WHERE d.staff_id = ? AND d.status = 'in_transit'`,
      [req.user.id]
    );

    res.json({ success: true, data: rows.length ? rows[0] : null });
  } catch (err) {
    console.error('Delivery active error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET MY DELIVERY (Customer) ────────
exports.getMyDelivery = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `${DELIVERY_SELECT} WHERE d.customer_id = ? AND d.status = 'in_transit'`,
      [req.user.id]
    );

    res.json({ success: true, data: rows.length ? rows[0] : null });
  } catch (err) {
    console.error('Delivery my error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── START DELIVERY (Staff only) ───────
// a driver is an active team member (not a customer) of the delivery's studio
async function isStudioDriver(userId, franchiseId) {
  const [[u]] = await pool.query("SELECT id FROM users WHERE id = ? AND role NOT IN ('customer') AND is_active = 1 AND is_deleted = 0 AND COALESCE(franchise_id, 1) = ?", [userId, Number(franchiseId) || 1]);
  return !!u;
}

/** Phone alert to the driver a delivery was just given to. */
function alertDriver(deliveryId, staffId) {
  (async () => {
    const [[d]] = await pool.query(
      `SELECT v.registration_no, v.brand, v.model, d.address_to FROM deliveries d
       JOIN job_carts jc ON jc.id = d.job_cart_id JOIN vehicles v ON v.id = jc.vehicle_id WHERE d.id = ?`, [deliveryId]);
    const car = d ? [d.brand, d.model].filter(Boolean).join(' ') + (d.registration_no ? ` (${d.registration_no})` : '') : 'A car';
    await require('../services/pushService').sendToUsers([staffId], {
      title: 'Delivery assigned to you',
      body: `${car}${d && d.address_to ? ' → ' + d.address_to : ''}. Tap Start when you leave the studio.`,
      url: '/admin/my/deliveries',
      tag: `delivery-${deliveryId}`,
    });
  })().catch((e) => console.error('[push] delivery alert failed:', e.message));
}

exports.startDelivery = async (req, res) => {
  try {
    const { job_cart_id } = req.body;
    
    // Check if job cart exists and get customer_id from vehicles join
    const [jobRows] = await pool.query(
      `SELECT jc.id, jc.booking_id, jc.franchise_id, jc.status, v.customer_id, v.registration_no, v.brand, v.model
       FROM job_carts jc 
       JOIN vehicles v ON jc.vehicle_id = v.id
       WHERE jc.id = ?`,
      [job_cart_id]
    );
    if (!jobRows.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    
    const job = jobRows[0];
    if (job.status !== 'complete') return res.status(422).json({ success: false, error: 'Finish the job card first, then start the delivery' });
    const driverId = Number(req.body.staff_id) || req.user.id;
    if (!(await isStudioDriver(driverId, job.franchise_id))) return res.status(400).json({ success: false, error: 'The driver must be an active team member of this studio' });
    const [existing] = await pool.query('SELECT id, status FROM deliveries WHERE job_cart_id = ?', [job_cart_id]);
    if (existing.length) {
      const ex = existing[0];
      if (ex.status === 'delivered') return res.status(400).json({ success: false, error: 'This car is already delivered' });
      if (ex.status === 'in_transit') return res.status(400).json({ success: false, error: 'Delivery already in progress for this job cart' });
      await pool.query('UPDATE deliveries SET staff_id = ? WHERE id = ?', [driverId, ex.id]);
      if (driverId !== req.user.id) { alertDriver(ex.id, driverId); return res.json({ success: true, data: { id: ex.id }, message: 'Driver assigned' }); }
      return exports._beginTrip(req, res, ex.id);
    }

    // Starts at the studio; the destination is the pin the customer gave for pickup/drop,
    // else their default saved address.
    const [[studio]] = await pool.query('SELECT name, address, latitude, longitude FROM franchises WHERE id = ?', [job.franchise_id || 1]);
    let dest = null;
    if (job.booking_id) {
      [[dest]] = await pool.query(
        'SELECT address, latitude, longitude FROM v2_pickup_requests WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [job.booking_id]);
    }
    if (!dest) {
      [[dest]] = await pool.query(
        `SELECT CONCAT_WS(', ', address, landmark, city, pincode) AS address, latitude, longitude
         FROM v2_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1`, [job.customer_id]);
    }
    const [result] = await pool.query(`
      INSERT INTO deliveries (job_cart_id, staff_id, customer_id, status, last_lat, last_lng, location_updated_at,
                              address_from, address_to, customer_lat, customer_lng, franchise_id)
      VALUES (?, ?, ?, 'assigned', ?, ?, NOW(), ?, ?, ?, ?, ?)
    `, [job.id, driverId, job.customer_id, studio?.latitude ?? null, studio?.longitude ?? null,
        studio?.address || studio?.name || null, dest?.address || null, dest?.latitude ?? null, dest?.longitude ?? null, job.franchise_id || 1]);

    const deliveryId = result.insertId;
    // admin picked a driver -> it waits in that driver's list until they tap Start
    if (driverId !== req.user.id) { alertDriver(deliveryId, driverId); return res.json({ success: true, data: { id: deliveryId }, message: 'Driver assigned' }); }
    return exports._beginTrip(req, res, deliveryId);
  } catch (err) {
    console.error('Delivery start error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

/** Driver leaves the studio: in_transit + "on the way" message to the customer. */
exports._beginTrip = async (req, res, deliveryId) => {
  try {
    const [[d]] = await pool.query(
      `SELECT d.id, d.staff_id, d.status, d.customer_id, v.registration_no, v.brand, v.model
       FROM deliveries d JOIN job_carts jc ON jc.id = d.job_cart_id JOIN vehicles v ON v.id = jc.vehicle_id WHERE d.id = ?`, [deliveryId]);
    if (!d) return res.status(404).json({ success: false, error: 'Delivery not found' });
    if (d.status === 'delivered') return res.status(400).json({ success: false, error: 'This car is already delivered' });
    if (d.status === 'in_transit') return res.json({ success: true, data: { id: d.id }, message: 'Delivery already started' });
    await pool.query("UPDATE deliveries SET status = 'in_transit', started_at = NOW(), staff_id = COALESCE(staff_id, ?) WHERE id = ?", [req.user.id, d.id]);
    const job = d;

    // Trigger Delivery Started Notification
    try {
      const messagingService = require('../services/messagingService');
      const [staffRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [d.staff_id || req.user.id]);
      const driverName = staffRows[0]?.name || 'Staff';
      const driverMobile = staffRows[0]?.mobile || '';
      const baseUrl = (process.env.CLIENT_URL || 'http://localhost:5173').replace(/\/$/, '');
      
      await messagingService.notify(
        job.customer_id,
        'DELIVERY_STARTED',
        {
          vehicle_number: job.registration_no || `${job.brand} ${job.model}`,
          driver_name: driverName,
          driver_mobile: driverMobile,
          tracking_url: `${baseUrl}/customer/delivery/${deliveryId}`
        },
        { type: 'delivery', id: deliveryId }
      );
    } catch (msgErr) {
      console.error('[SMS/WA] Delivery start notification failed:', msgErr.message);
    }
    res.json({ success: true, data: { id: deliveryId }, message: 'Delivery started' });
  } catch (err) {
    console.error('Delivery start error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DRIVER TAPS START (assigned -> in_transit) ────
exports.beginDelivery = async (req, res) => {
  const [[d]] = await pool.query('SELECT staff_id FROM deliveries WHERE id = ?', [req.params.id]);
  if (!d) return res.status(404).json({ success: false, error: 'Delivery not found' });
  if (d.staff_id && d.staff_id !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, error: 'This delivery is assigned to another driver' });
  }
  return exports._beginTrip(req, res, Number(req.params.id));
};

/**
 * Called when a job card is completed. If the customer asked for drop (drop / both),
 * a delivery task is made and given to the driver who picked the car up.
 */
exports.createDropTask = async (jobCartId) => {
  const [[job]] = await pool.query(
    `SELECT jc.id, jc.booking_id, jc.franchise_id, jc.pickup_type AS jc_type, b.pickup_type AS b_type, v.customer_id
     FROM job_carts jc JOIN vehicles v ON v.id = jc.vehicle_id LEFT JOIN bookings b ON b.id = jc.booking_id WHERE jc.id = ?`, [jobCartId]);
  if (!job) return null;
  const type = job.b_type || job.jc_type || 'none';
  if (!['drop', 'both'].includes(type)) return null;
  const [[ex]] = await pool.query('SELECT id FROM deliveries WHERE job_cart_id = ?', [jobCartId]);
  if (ex) return ex.id;
  const [[studio]] = await pool.query('SELECT name, address, latitude, longitude FROM franchises WHERE id = ?', [job.franchise_id || 1]);
  let pick = null;
  if (job.booking_id) {
    [[pick]] = await pool.query(
      `SELECT address, latitude, longitude, assigned_staff_id FROM v2_pickup_requests
       WHERE booking_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1`, [job.booking_id]);
  }
  if (!pick) {
    [[pick]] = await pool.query(
      `SELECT CONCAT_WS(', ', address, landmark, city, pincode) AS address, latitude, longitude, NULL AS assigned_staff_id
       FROM v2_customer_addresses WHERE customer_id = ? ORDER BY is_default DESC, id DESC LIMIT 1`, [job.customer_id]);
  }
  const [r] = await pool.query(
    `INSERT INTO deliveries (job_cart_id, staff_id, customer_id, status, started_at, last_lat, last_lng,
                             address_from, address_to, customer_lat, customer_lng, franchise_id)
     VALUES (?, ?, ?, 'assigned', NULL, ?, ?, ?, ?, ?, ?, ?)`,
    [jobCartId, pick?.assigned_staff_id || null, job.customer_id, studio?.latitude ?? null, studio?.longitude ?? null,
     studio?.address || studio?.name || null, pick?.address || null, pick?.latitude ?? null, pick?.longitude ?? null, job.franchise_id || 1]);
  return r.insertId;
};

// ─── ASSIGN / CHANGE DRIVER (admin; any time, also mid-trip or to correct records) ────
exports.assignDriver = async (req, res) => {
  const staffId = Number(req.body.staff_id);
  if (!staffId) return res.status(400).json({ success: false, error: 'Choose a driver' });
  const [[dl]] = await pool.query('SELECT franchise_id, status FROM deliveries WHERE id = ?', [req.params.id]);
  if (!dl) return res.status(404).json({ success: false, error: 'Delivery not found' });
  if (dl.status === 'delivered' || dl.status === 'cancelled') return res.status(422).json({ success: false, error: `This delivery is already ${dl.status}` });
  if (!(await isStudioDriver(staffId, dl.franchise_id))) return res.status(400).json({ success: false, error: 'The driver must be an active team member of this studio' });
  const [r] = await pool.query('UPDATE deliveries SET staff_id = ? WHERE id = ?', [staffId, req.params.id]);
  if (!r.affectedRows) return res.status(404).json({ success: false, error: 'Delivery not found' });
  if (staffId !== req.user.id) alertDriver(Number(req.params.id), staffId);
  res.json({ success: true, message: 'Driver assigned' });
};

// ─── CHANGE STATUS (admin): to deliver / on the way / delivered, including undoing a wrong "delivered" ────
exports.setStatus = async (req, res) => {
  try {
    if (!['admin', 'super_admin'].includes(req.user.role)) return res.status(403).json({ success: false, error: 'Only an admin can change the delivery status' });
    const status = String(req.body.status || '');
    if (!['assigned', 'in_transit', 'delivered'].includes(status)) return res.status(400).json({ success: false, error: 'Choose a valid status' });
    const [[d]] = await pool.query('SELECT id, job_cart_id, status FROM deliveries WHERE id = ?', [req.params.id]);
    if (!d) return res.status(404).json({ success: false, error: 'Delivery not found' });
    if (d.status === status) return res.json({ success: true, message: 'No change' });
    if (status === 'delivered') return exports.completeDelivery(req, res);
    if (status === 'in_transit') {
      if (d.status === 'delivered') {
        await pool.query("UPDATE deliveries SET status = 'in_transit', delivered_at = NULL WHERE id = ?", [d.id]);
        await require('./jobCartController').setJobDelivered(d.job_cart_id, false, req.user.id);
        return res.json({ success: true, message: 'Marked on the way again' });
      }
      return exports._beginTrip(req, res, d.id);
    }
    await pool.query("UPDATE deliveries SET status = 'assigned', started_at = NULL, delivered_at = NULL WHERE id = ?", [d.id]);
    if (d.status === 'delivered') await require('./jobCartController').setJobDelivered(d.job_cart_id, false, req.user.id);
    res.json({ success: true, message: 'Marked to deliver' });
  } catch (err) {
    console.error('Delivery status error:', err);
    res.status(500).json({ success: false, error: 'Could not change the status' });
  }
};

// ─── COMPLETE DELIVERY (Staff only) ────
exports.completeDelivery = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Delivery not found' });
    
    const delivery = rows[0];

    if (delivery.staff_id !== req.user.id && !['admin', 'super_admin'].includes(req.user.role)) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (delivery.status === 'delivered') {
      return res.status(400).json({ success: false, error: 'Delivery already completed' });
    }

    await pool.query('UPDATE deliveries SET status = "delivered", delivered_at = NOW(), started_at = COALESCE(started_at, NOW()) WHERE id = ?', [req.params.id]);
    // the job card tracker and the customer's app now show every stage done, Delivered included
    await require('./jobCartController').setJobDelivered(delivery.job_cart_id, true, req.user.id);

    // Emit socket event for real-time update
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery_${req.params.id}`).emit('delivery_completed', { delivery_id: parseInt(req.params.id) });
    }

    // Trigger Delivery Completed Notification
    try {
      const messagingService = require('../services/messagingService');
      const [infoRows] = await pool.query(
        `SELECT d.customer_id, v.registration_no, v.brand, v.model
         FROM deliveries d
         JOIN job_carts jc ON d.job_cart_id = jc.id
         JOIN vehicles v ON jc.vehicle_id = v.id
         WHERE d.id = ?`,
        [req.params.id]
      );
      if (infoRows.length) {
        const info = infoRows[0];
        await messagingService.notify(
          info.customer_id,
          'DELIVERY_COMPLETED',
          { vehicle_number: info.registration_no || `${info.brand} ${info.model}` },
          { type: 'delivery', id: req.params.id }
        );
      }
    } catch (msgErr) {
      console.error('[SMS/WA] Delivery completion notification failed:', msgErr.message);
    }

    res.json({ success: true, message: 'Delivery completed' });
  } catch (err) {
    console.error('Delivery complete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── UPDATE LOCATION (Staff → live tracking) ────
exports.updateLocation = async (req, res) => {
  try {
    const { lat, lng, gps_status } = req.body;
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM deliveries WHERE id = ? AND status = "in_transit"', [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No active delivery found' });

    const delivery = rows[0];
    if (delivery.staff_id !== req.user.id && req.user.role !== 'super_admin') {
      return res.status(403).json({ success: false, error: 'Only the assigned driver can send location' });
    }

    // Driver's GPS is off / permission denied → tell the customer & studio instead of showing a stale dot
    if (gps_status && gps_status !== 'on') {
      await pool.query('UPDATE deliveries SET gps_status = ? WHERE id = ?', [String(gps_status).slice(0, 20), id]);
      const io = req.app.get('io');
      if (io) io.to(`delivery_${id}`).emit('gps_status', { delivery_id: parseInt(id), gps_status, timestamp: new Date().toISOString() });
      return res.json({ success: true, message: 'GPS status recorded' });
    }
    const pLat = parseFloat(lat), pLng = parseFloat(lng);
    if (isNaN(pLat) || isNaN(pLng) || Math.abs(pLat) > 90 || Math.abs(pLng) > 180) {
      return res.status(400).json({ success: false, error: 'Invalid coordinates' });
    }
    await pool.query("UPDATE deliveries SET gps_status = 'on' WHERE id = ?", [id]);

    await pool.query(
      'UPDATE deliveries SET last_lat = ?, last_lng = ?, location_updated_at = NOW() WHERE id = ?',
      [lat, lng, id]
    );

    // Emit to Socket.io room for live tracking
    const io = req.app.get('io');
    if (io) {
      io.to(`delivery_${id}`).emit('location_update', {
        delivery_id: parseInt(id),
        lat: parseFloat(lat),
        lng: parseFloat(lng),
        timestamp: new Date().toISOString(),
      });
    }

    res.json({ success: true, message: 'Location updated' });
  } catch (err) {
    console.error('Delivery location update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET LOCATION (for tracking) ────
exports.getLocation = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(
      'SELECT last_lat, last_lng, location_updated_at, status, gps_status, staff_id, customer_id, franchise_id FROM deliveries WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Delivery not found' });
    if (!(await canSeeDelivery(req, rows[0]))) return res.status(403).json({ success: false, error: 'Not authorized' });
    const { staff_id, customer_id, franchise_id, ...loc } = rows[0];
    rows[0] = { ...loc, is_stale: !loc.location_updated_at || (Date.now() - new Date(loc.location_updated_at).getTime()) > 2 * 60 * 1000 };

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Delivery location get error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
