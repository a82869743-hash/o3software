const pool = require('../config/db');
const bcrypt = require('bcryptjs');

// ─── LIST ALL STAFF ─────────────────────────
exports.list = async (req, res) => {
  try {
    const franchiseId = req.user?.franchise_id || 1;
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.is_active, u.created_at,
              u.custom_role_id, u.base_salary, r.role_name as custom_role_name,
              sp.specialisations
       FROM users u
       LEFT JOIN staff_profiles sp ON u.id = sp.user_id
       LEFT JOIN v2_roles r ON u.custom_role_id = r.id
       WHERE u.role = 'staff' AND u.is_active = 1
         AND (u.franchise_id = ? OR (u.franchise_id IS NULL AND ? = 1))
       ORDER BY u.created_at DESC`,
      [franchiseId, franchiseId]
    );

    // Get today's attendance for each staff
    const today = new Date().toISOString().slice(0, 10);
    const [attendance] = await pool.query(
      `SELECT staff_id, status FROM staff_attendance WHERE att_date = ? AND (franchise_id = ? OR (franchise_id IS NULL AND ? = 1))`,
      [today, franchiseId, franchiseId]
    );
    const attMap = {};
    attendance.forEach(a => { attMap[a.staff_id] = a.status; });

    const data = rows.map(r => ({
      ...r,
      today_attendance: attMap[r.id] || null,
    }));

    res.json({ success: true, data });
  } catch (err) {
    console.error('Staff list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ONE STAFF ──────────────────────────
exports.getOne = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.is_active, u.created_at,
              u.custom_role_id, u.base_salary, r.role_name as custom_role_name,
              sp.specialisations
       FROM users u
       LEFT JOIN staff_profiles sp ON u.id = sp.user_id
       LEFT JOIN v2_roles r ON u.custom_role_id = r.id
       WHERE u.id = ? AND u.role = 'staff'`,
      [req.params.id]
    );
    if (!rows.length) return res.status(404).json({ success: false, error: 'Staff not found' });
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Staff getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE STAFF ───────────────────────────
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, mobile, password, specialisations, email, custom_role_id, base_salary } = req.body;
    if (!name || !mobile || !password) {
      return res.status(400).json({ success: false, error: 'Name, mobile, and password are required' });
    }

    // Validate mobile format (10 digits)
    if (!/^\d{10}$/.test(mobile)) {
      return res.status(400).json({ success: false, error: 'Mobile must be a 10-digit number' });
    }

    // Check duplicate mobile
    const [existing] = await conn.query('SELECT id FROM users WHERE mobile = ?', [mobile]);
    if (existing.length) return res.status(409).json({ success: false, error: 'Mobile number already in use' });

    await conn.beginTransaction();

    const franchiseId = req.user?.franchise_id || 1;
    const password_hash = await bcrypt.hash(password, 10);
    const [userResult] = await conn.query(
      'INSERT INTO users (name, mobile, email, password_hash, role, custom_role_id, base_salary, franchise_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [name, mobile, email || null, password_hash, 'staff', custom_role_id || null, base_salary || 15000.00, franchiseId]
    );

    await conn.query(
      'INSERT INTO staff_profiles (user_id, specialisations) VALUES (?, ?)',
      [userResult.insertId, specialisations || null]
    );

    await conn.commit();
    res.status(201).json({ success: true, data: { id: userResult.insertId }, message: 'Staff created' });
  } catch (err) {
    await conn.rollback();
    console.error('Staff create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── UPDATE STAFF ───────────────────────────
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, mobile, email, specialisations, custom_role_id, base_salary } = req.body;
    const [existing] = await conn.query('SELECT id FROM users WHERE id = ? AND role = ?', [req.params.id, 'staff']);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Staff not found' });

    await conn.beginTransaction();

    const updates = [];
    const params = [];
    if (name !== undefined) { updates.push('name = ?'); params.push(name); }
    if (mobile !== undefined) { updates.push('mobile = ?'); params.push(mobile); }
    if (email !== undefined) { updates.push('email = ?'); params.push(email); }
    if (custom_role_id !== undefined) { updates.push('custom_role_id = ?'); params.push(custom_role_id || null); }
    if (base_salary !== undefined) { updates.push('base_salary = ?'); params.push(base_salary); }

    if (updates.length) {
      params.push(req.params.id);
      await conn.query(`UPDATE users SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    if (specialisations !== undefined) {
      await conn.query(
        'INSERT INTO staff_profiles (user_id, specialisations) VALUES (?, ?) ON DUPLICATE KEY UPDATE specialisations = ?',
        [req.params.id, specialisations, specialisations]
      );
    }

    await conn.commit();
    res.json({ success: true, message: 'Staff updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Staff update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── MARK ATTENDANCE ────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    const { status, note, att_date, check_in_time, check_out_time } = req.body;
    const staffId = req.params.id;
    const date = att_date || new Date().toISOString().slice(0, 10);

    if (!status || !['present', 'absent', 'half_day'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    // Verify staff exists
    const [staff] = await pool.query('SELECT id FROM users WHERE id = ? AND role = ?', [staffId, 'staff']);
    if (!staff.length) return res.status(404).json({ success: false, error: 'Staff not found' });

    // Build timestamps from date + time (e.g. "2026-05-02" + "09:30" → "2026-05-02 09:30:00")
    const checkIn = check_in_time ? `${date} ${check_in_time}:00` : null;
    const checkOut = check_out_time ? `${date} ${check_out_time}:00` : null;

    // Upsert attendance with check-in/out times
    await pool.query(
      `INSERT INTO staff_attendance (staff_id, att_date, status, note, check_in_time, check_out_time)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note), check_in_time = VALUES(check_in_time), check_out_time = VALUES(check_out_time)`,
      [staffId, date, status, note || null, checkIn, checkOut]
    );

    res.json({ success: true, message: 'Attendance marked' });
  } catch (err) {
    console.error('Attendance mark error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ATTENDANCE ─────────────────────────
exports.getAttendance = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let where = 'staff_id = ?';
    const params = [req.params.id];

    if (from_date) { where += ' AND att_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND att_date <= ?'; params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT * FROM staff_attendance WHERE ${where} ORDER BY att_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Attendance get error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADD PAYMENT ────────────────────────────
exports.addPayment = async (req, res) => {
  try {
    const { amount, purpose, payment_date } = req.body;
    const staffId = req.params.id;

    if (!amount || !purpose || !payment_date) {
      return res.status(400).json({ success: false, error: 'Amount, purpose, and payment date are required' });
    }

    // Verify staff exists
    const [staff] = await pool.query('SELECT id FROM users WHERE id = ? AND role = ?', [staffId, 'staff']);
    if (!staff.length) return res.status(404).json({ success: false, error: 'Staff not found' });

    const [result] = await pool.query(
      'INSERT INTO staff_payments (staff_id, amount, purpose, payment_date) VALUES (?, ?, ?, ?)',
      [staffId, amount, purpose, payment_date]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Payment added' });
  } catch (err) {
    console.error('Payment add error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET PAYMENTS ───────────────────────────
exports.getPayments = async (req, res) => {
  try {
    const [rows] = await pool.query(
      'SELECT * FROM staff_payments WHERE staff_id = ? ORDER BY payment_date DESC',
      [req.params.id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Payment get error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── COMPLETE PAYMENT (mark as paid) ────────
exports.completePayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { id: staffId, pid } = req.params;

    const [payment] = await conn.query(
      'SELECT * FROM staff_payments WHERE id = ? AND staff_id = ? AND status = ?',
      [pid, staffId, 'pending']
    );
    if (!payment.length) return res.status(404).json({ success: false, error: 'Pending payment not found' });

    await conn.beginTransaction();

    // Mark as paid
    await conn.query(
      'UPDATE staff_payments SET status = ?, paid_at = NOW() WHERE id = ?',
      ['paid', pid]
    );

    // Create transaction record
    await conn.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?)`,
      ['staff_payment', parseInt(pid), payment[0].amount, 'out', `Staff payment: ${payment[0].purpose}`, req.user.id]
    );

    await conn.commit();
    res.json({ success: true, message: 'Payment marked as paid' });
  } catch (err) {
    await conn.rollback();
    console.error('Payment complete error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// ─── GET MY PAYMENTS (staff self-service) ───
exports.getMyPayments = async (req, res) => {
  try {
    const [payments] = await pool.query(
      'SELECT * FROM staff_payments WHERE staff_id = ? ORDER BY created_at DESC',
      [req.user.id]
    );
    res.json({ success: true, data: payments });
  } catch (err) {
    console.error('getMyPayments error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
};

// Haversine distance calculator in km
function getDistanceKm(lat1, lon1, lat2, lon2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

// ─── STAFF CHECK-IN ─────────────────────────
exports.checkIn = async (req, res) => {
  try {
    const staffId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);
    const { latitude, longitude, face_photo_url } = req.body;
    const activeFranchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.user.franchise_id || 1);

    // Fetch dynamic franchise geofence location
    const [franRows] = await pool.query('SELECT name, latitude, longitude FROM franchises WHERE id = ?', [activeFranchiseId]);
    const studioLat = (franRows.length && franRows[0].latitude) ? parseFloat(franRows[0].latitude) : 22.5645;
    const studioLng = (franRows.length && franRows[0].longitude) ? parseFloat(franRows[0].longitude) : 72.9289;
    const studioName = franRows.length ? franRows[0].name : 'O3 Car Spaa Anand';
    let isValidLocation = true;

    if (latitude && longitude) {
      const dist = getDistanceKm(parseFloat(latitude), parseFloat(longitude), studioLat, studioLng);
      if (dist > 0.2) {
        return res.status(403).json({
          success: false,
          error: `Attendance check-in denied: Photo & geotag location can only be taken inside ${studioName} location premises. You are ${(dist * 1000).toFixed(0)}m away.`
        });
      }
    }

    // Check if already checked in today
    const [existing] = await pool.query(
      'SELECT id, check_in_time FROM staff_attendance WHERE staff_id = ? AND att_date = ?',
      [staffId, today]
    );

    if (existing.length && existing[0].check_in_time) {
      return res.status(422).json({ success: false, error: 'Already checked in today' });
    }

    if (existing.length) {
      // Update existing record
      await pool.query(
        "UPDATE staff_attendance SET status = 'present', check_in_time = NOW(), note = 'Self check-in (Geofenced)', face_photo_url = ?, latitude = ?, longitude = ?, is_geofenced_valid = ?, franchise_id = ? WHERE id = ?",
        [face_photo_url || null, latitude || null, longitude || null, isValidLocation ? 1 : 0, activeFranchiseId, existing[0].id]
      );
    } else {
      // Create new record
      await pool.query(
        "INSERT INTO staff_attendance (staff_id, att_date, status, check_in_time, note, face_photo_url, latitude, longitude, is_geofenced_valid, franchise_id) VALUES (?, ?, 'present', NOW(), 'Self check-in (Geofenced)', ?, ?, ?, ?, ?)",
        [staffId, today, face_photo_url || null, latitude || null, longitude || null, isValidLocation ? 1 : 0, activeFranchiseId]
      );
    }

    console.log(`[STAFF] Geofenced Check-in: staff ${staffId} at ${new Date().toISOString()} (${studioName})`);
    res.json({ success: true, message: `Checked in successfully (${studioName} location verified)` });
  } catch (err) {
    console.error('Staff check-in error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── STAFF CHECK-OUT ────────────────────────
exports.checkOut = async (req, res) => {
  try {
    const staffId = req.user.id;
    const today = new Date().toISOString().slice(0, 10);

    const [existing] = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM staff_attendance WHERE staff_id = ? AND att_date = ?',
      [staffId, today]
    );

    if (!existing.length || !existing[0].check_in_time) {
      return res.status(422).json({ success: false, error: 'Must check in before checking out' });
    }
    if (existing[0].check_out_time) {
      return res.status(422).json({ success: false, error: 'Already checked out today' });
    }

    await pool.query(
      'UPDATE staff_attendance SET check_out_time = NOW() WHERE id = ?',
      [existing[0].id]
    );

    console.log(`[STAFF] Check-out: staff ${staffId} at ${new Date().toISOString()}`);
    res.json({ success: true, message: 'Checked out successfully' });
  } catch (err) {
    console.error('Staff check-out error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET MY ATTENDANCE (staff self-service) ──
exports.getMyAttendance = async (req, res) => {
  try {
    const { from_date, to_date } = req.query;
    let where = 'staff_id = ?';
    const params = [req.user.id];

    if (from_date) { where += ' AND att_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND att_date <= ?'; params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT * FROM staff_attendance WHERE ${where} ORDER BY att_date DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getMyAttendance error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── GET ALL STAFF ATTENDANCE SUMMARY (ADMIN / FRANCHISE ADMIN) ───
exports.getAllAttendanceSummary = async (req, res) => {
  try {
    const { period = 'today', franchise_id } = req.query;
    const today = new Date().toISOString().slice(0, 10);
    const activeFranchiseId = franchise_id
      ? parseInt(franchise_id, 10)
      : (req.headers['x-franchise-id'] ? parseInt(req.headers['x-franchise-id'], 10) : 1);

    // Fetch active staff
    let staffSql = "SELECT id, name, mobile, email, franchise_id FROM users WHERE role = 'staff' AND is_active = 1";
    const staffParams = [];
    if (activeFranchiseId && activeFranchiseId !== 1) {
      staffSql += " AND (franchise_id = ? OR franchise_id IS NULL)";
      staffParams.push(activeFranchiseId);
    }
    staffSql += " ORDER BY name ASC";
    const [staffRows] = await pool.query(staffSql, staffParams);

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-01`;
    const yearStart = `${now.getFullYear()}-01-01`;

    // Fetch today's attendance records
    const [todayAtt] = await pool.query(
      `SELECT sa.*, f.name AS franchise_name 
       FROM staff_attendance sa 
       LEFT JOIN franchises f ON sa.franchise_id = f.id 
       WHERE sa.att_date = ?`,
      [today]
    );
    const todayMap = {};
    todayAtt.forEach(a => { todayMap[a.staff_id] = a; });

    // Fetch stats aggregations
    const [statsRows] = await pool.query(`
      SELECT 
        staff_id,
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 ELSE 0 END) AS weekly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS weekly_absent,
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 ELSE 0 END) AS monthly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS monthly_absent,
        SUM(CASE WHEN att_date >= ? AND status = 'half_day' THEN 1 ELSE 0 END) AS monthly_half_day,
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 ELSE 0 END) AS yearly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS yearly_absent,
        COUNT(CASE WHEN att_date >= ? THEN 1 END) AS total_monthly_logs
      FROM staff_attendance
      GROUP BY staff_id
    `, [weekAgo, weekAgo, monthStart, monthStart, monthStart, yearStart, yearStart, monthStart]);

    const statsMap = {};
    statsRows.forEach(s => { statsMap[s.staff_id] = s; });

    const list = staffRows.map(s => {
      const att = todayMap[s.id] || null;
      const st = statsMap[s.id] || {};

      const monthlyPresent = Number(st.monthly_present || 0);
      const monthlyHalfDay = Number(st.monthly_half_day || 0);
      const monthlyTotal = Number(st.total_monthly_logs || 0) || 1;
      const attendancePct = Math.min(100, Math.round(((monthlyPresent + monthlyHalfDay * 0.5) / Math.max(monthlyTotal, 1)) * 100));

      return {
        staff_id: s.id,
        staff_name: s.name,
        staff_mobile: s.mobile,
        staff_email: s.email,
        today_record: att,
        today_status: att ? att.status : 'not_checked_in',
        check_in_time: att?.check_in_time || null,
        check_out_time: att?.check_out_time || null,
        face_photo_url: att?.face_photo_url || null,
        latitude: att?.latitude || null,
        longitude: att?.longitude || null,
        is_geofenced_valid: att?.is_geofenced_valid || 0,
        franchise_name: att?.franchise_name || 'Main Studio (Anand)',
        stats: {
          weekly_present: Number(st.weekly_present || 0),
          weekly_absent: Number(st.weekly_absent || 0),
          monthly_present: monthlyPresent,
          monthly_absent: Number(st.monthly_absent || 0),
          monthly_half_day: monthlyHalfDay,
          yearly_present: Number(st.yearly_present || 0),
          yearly_absent: Number(st.yearly_absent || 0),
          attendance_pct: attendancePct,
        }
      };
    });

    const presentTodayCount = list.filter(l => l.today_status === 'present' || l.today_status === 'half_day').length;
    const absentTodayCount = list.filter(l => l.today_status === 'absent' || l.today_status === 'not_checked_in').length;
    const photoVerifiedCount = list.filter(l => l.face_photo_url).length;

    res.json({
      success: true,
      data: list,
      summary: {
        total_staff: list.length,
        present_today: presentTodayCount,
        absent_today: absentTodayCount,
        photo_verified: photoVerifiedCount,
      }
    });
  } catch (err) {
    console.error('getAllAttendanceSummary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

