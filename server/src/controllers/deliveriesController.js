const pool = require('../config/db');

// Shared SELECT for delivery queries — uses correct vehicle column names
const DELIVERY_SELECT = `
  SELECT d.*, 
         u.name as staff_name, u.mobile as staff_mobile,
         c.name as customer_name, c.mobile as customer_mobile,
         v.registration_no, v.brand, v.model
  FROM deliveries d
  JOIN users u ON d.staff_id = u.id
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
      `${DELIVERY_SELECT} WHERE ${where} ORDER BY d.started_at DESC`,
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

    // Auth check
    if (req.user.role === 'customer' && req.user.id !== delivery.customer_id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }
    if (req.user.role === 'staff' && req.user.id !== delivery.staff_id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    res.json({ success: true, data: delivery });
  } catch (err) {
    console.error('Delivery getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ACTIVE DELIVERY (Staff) ─────────
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
exports.startDelivery = async (req, res) => {
  try {
    const { job_cart_id } = req.body;
    
    // Check if job cart exists and get customer_id from vehicles join
    const [jobRows] = await pool.query(
      `SELECT jc.id, v.customer_id, v.registration_no, v.brand, v.model 
       FROM job_carts jc 
       JOIN vehicles v ON jc.vehicle_id = v.id
       WHERE jc.id = ?`,
      [job_cart_id]
    );
    if (!jobRows.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    
    const job = jobRows[0];
    
    // Check for existing active delivery
    const [existing] = await pool.query(
      'SELECT id FROM deliveries WHERE job_cart_id = ? AND status = "in_transit"',
      [job_cart_id]
    );
    if (existing.length) {
      return res.status(400).json({ success: false, error: 'Delivery already in progress for this job cart' });
    }

    const [result] = await pool.query(`
      INSERT INTO deliveries (job_cart_id, staff_id, customer_id, status, last_lat, last_lng, location_updated_at)
      VALUES (?, ?, ?, 'in_transit', 22.3072, 73.1812, NOW())
    `, [job.id, req.user.id, job.customer_id]);

    const deliveryId = result.insertId;

    // Trigger Delivery Started Notification
    try {
      const messagingService = require('../services/messagingService');
      const [staffRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [req.user.id]);
      const driverName = staffRows[0]?.name || 'Staff';
      const driverMobile = staffRows[0]?.mobile || '';
      const baseUrl = process.env.APP_BASE_URL || 'http://localhost:5000';
      
      await messagingService.notify(
        job.customer_id,
        'DELIVERY_STARTED',
        {
          vehicle_number: job.registration_no || `${job.brand} ${job.model}`,
          driver_name: driverName,
          driver_mobile: driverMobile,
          tracking_url: `${baseUrl}/track/delivery/${deliveryId}`
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

// ─── COMPLETE DELIVERY (Staff only) ────
exports.completeDelivery = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM deliveries WHERE id = ?', [req.params.id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'Delivery not found' });
    
    const delivery = rows[0];

    if (delivery.staff_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    if (delivery.status === 'delivered') {
      return res.status(400).json({ success: false, error: 'Delivery already completed' });
    }

    await pool.query('UPDATE deliveries SET status = "delivered", delivered_at = NOW() WHERE id = ?', [req.params.id]);

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
    const { lat, lng } = req.body;
    const { id } = req.params;

    const [rows] = await pool.query('SELECT * FROM deliveries WHERE id = ? AND status = "in_transit"', [id]);
    if (!rows.length) return res.status(404).json({ success: false, error: 'No active delivery found' });

    const delivery = rows[0];
    if (delivery.staff_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

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
      'SELECT last_lat, last_lng, location_updated_at, status FROM deliveries WHERE id = ?',
      [id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Delivery not found' });

    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Delivery location get error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
