const pool = require('../config/db');
const bcrypt = require('bcryptjs');
const { normalizeMobile, isValidMobile, isValidEmail } = require('../utils/validators');
const { clearPermissionCache } = require('../middleware/accessControl');

const EMPLOYEE_ROLES = ['manager', 'staff'];
const SALARY_TYPES = ['monthly', 'daily', 'hourly'];
const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;

async function loadEmployee(req, res, id) {
  const [rows] = await pool.query(
    "SELECT * FROM users WHERE id = ? AND role IN ('manager','staff') AND is_deleted = 0",
    [id]
  );
  if (!rows.length) { res.status(404).json({ success: false, error: 'Staff member not found' }); return null; }
  if (req.user.role !== 'super_admin' && Number(rows[0].franchise_id) !== fidOf(req)) {
    res.status(403).json({ success: false, error: 'This staff member belongs to another franchise' });
    return null;
  }
  return rows[0];
}

async function validateCustomRole(db, roleId, franchiseId) {
  if (!roleId) return null;
  const [rows] = await db.query('SELECT id FROM v2_roles WHERE id = ? AND is_system_role = 0 AND (franchise_id IS NULL OR franchise_id = ?)', [roleId, franchiseId]);
  return rows.length ? rows[0].id : undefined;
}

function salaryFields(body) {
  const out = {};
  if (body.salary_type !== undefined) {
    if (!SALARY_TYPES.includes(body.salary_type)) throw Object.assign(new Error('Salary type must be monthly, daily or hourly'), { status: 400 });
    out.salary_type = body.salary_type;
  }
  for (const k of ['salary_rate', 'working_days_per_month', 'paid_leaves_per_month']) {
    if (body[k] !== undefined && body[k] !== '') {
      const n = Number(body[k]);
      if (isNaN(n) || n < 0) throw Object.assign(new Error(`${k.replace(/_/g, ' ')} must be a positive number`), { status: 400 });
      out[k] = n;
    }
  }
  if (out.working_days_per_month !== undefined && (out.working_days_per_month < 1 || out.working_days_per_month > 31)) {
    throw Object.assign(new Error('Working days per month must be between 1 and 31'), { status: 400 });
  }
  if (body.joining_date !== undefined) out.joining_date = body.joining_date || null;
  return out;
}

// ─── LIST (franchise scoped; managers + staff) ─────────
exports.list = async (req, res) => {
  try {
    const fid = fidOf(req);
    const includeInactive = req.query.include_inactive === '1';
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.role, u.is_active, u.created_at, u.custom_role_id, u.base_salary,
              u.salary_type, u.salary_rate, u.working_days_per_month, u.paid_leaves_per_month, u.joining_date,
              r.role_name AS custom_role_name, sp.specialisations,
              (SELECT status FROM staff_attendance sa WHERE sa.staff_id = u.id AND sa.att_date = CURDATE() LIMIT 1) AS today_attendance,
              (SELECT COALESCE(SUM(amount),0) FROM referral_ledger rl WHERE rl.referrer_type = 'staff' AND rl.referrer_user_id = u.id AND rl.status = 'unpaid') AS unpaid_referrals
       FROM users u
       LEFT JOIN staff_profiles sp ON u.id = sp.user_id
       LEFT JOIN v2_roles r ON u.custom_role_id = r.id
       WHERE u.role IN ('manager','staff') AND u.is_deleted = 0 AND u.franchise_id = ? ${includeInactive ? '' : 'AND u.is_active = 1'}
       ORDER BY u.is_active DESC, u.name`,
      [fid]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Staff list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── TECHNICIANS (picker for job cards — names only) ───
exports.technicians = async (req, res) => {
  try {
    const [rows] = await pool.query(
      "SELECT id, name, role FROM users WHERE role IN ('manager','staff') AND is_active = 1 AND is_deleted = 0 AND franchise_id = ? ORDER BY name",
      [fidOf(req)]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('technicians error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getOne = async (req, res) => {
  try {
    const emp = await loadEmployee(req, res, req.params.id);
    if (!emp) return;
    const [rows] = await pool.query(
      `SELECT u.id, u.name, u.mobile, u.email, u.role, u.is_active, u.created_at, u.custom_role_id, u.base_salary,
              u.salary_type, u.salary_rate, u.working_days_per_month, u.paid_leaves_per_month, u.joining_date,
              r.role_name AS custom_role_name, sp.specialisations
       FROM users u LEFT JOIN staff_profiles sp ON u.id = sp.user_id LEFT JOIN v2_roles r ON u.custom_role_id = r.id
       WHERE u.id = ?`, [emp.id]);
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    console.error('Staff getOne error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE (franchise admin creates own staff; Super Admin for any franchise) ──
exports.create = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { name, password, specialisations, email, custom_role_id } = req.body;
    const role = EMPLOYEE_ROLES.includes(req.body.role) ? req.body.role : 'staff';
    const mobile = normalizeMobile(req.body.mobile);
    if (!name || !String(name).trim()) return res.status(400).json({ success: false, error: 'Name is required' });
    if (!isValidMobile(req.body.mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });
    if (!password || String(password).length < 8 || !/\d/.test(password) || !/[a-zA-Z]/.test(password)) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters with letters and numbers' });
    }
    if (email && !isValidEmail(email)) return res.status(400).json({ success: false, error: 'Email is invalid' });
    const franchiseId = req.user.role === 'super_admin' && req.body.franchise_id ? Number(req.body.franchise_id) : fidOf(req);
    const sal = salaryFields(req.body);

    const [dup] = await conn.query('SELECT id FROM users WHERE mobile = ?', [mobile]);
    if (dup.length) return res.status(409).json({ success: false, error: 'This mobile number is already registered' });
    if (email) {
      const [dupE] = await conn.query('SELECT id FROM users WHERE email = ?', [email.trim().toLowerCase()]);
      if (dupE.length) return res.status(409).json({ success: false, error: 'This email is already registered' });
    }
    const roleId = await validateCustomRole(conn, custom_role_id, franchiseId);
    if (roleId === undefined) return res.status(400).json({ success: false, error: 'Selected role is not available for this franchise' });

    await conn.beginTransaction();
    const [ins] = await conn.query(
      `INSERT INTO users (name, mobile, email, password_hash, role, custom_role_id, base_salary, franchise_id, must_change_password,
                          salary_type, salary_rate, working_days_per_month, paid_leaves_per_month, joining_date)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?, ?, ?, ?)`,
      [String(name).trim(), mobile, email ? email.trim().toLowerCase() : null, await bcrypt.hash(password, 10), role, roleId,
        sal.salary_type === 'monthly' || !sal.salary_type ? (sal.salary_rate || 0) : 0, franchiseId,
        sal.salary_type || 'monthly', sal.salary_rate || 0, sal.working_days_per_month || 26, sal.paid_leaves_per_month ?? 1,
        sal.joining_date || new Date()]
    );
    await conn.query('INSERT INTO staff_profiles (user_id, specialisations) VALUES (?, ?)', [ins.insertId, specialisations || null]);
    await conn.commit();
    res.status(201).json({ success: true, data: { id: ins.insertId }, message: `${role === 'manager' ? 'Manager' : 'Staff'} account created. They must change the password on first login.` });
  } catch (err) {
    try { await conn.rollback(); } catch { /* ignore */ }
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Staff create error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.update = async (req, res) => {
  try {
    const emp = await loadEmployee(req, res, req.params.id);
    if (!emp) return;
    const b = req.body;
    const sets = [];
    const params = [];
    if (b.name !== undefined) { if (!String(b.name).trim()) return res.status(400).json({ success: false, error: 'Name is required' }); sets.push('name = ?'); params.push(String(b.name).trim()); }
    if (b.mobile !== undefined) {
      if (!isValidMobile(b.mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });
      const m = normalizeMobile(b.mobile);
      const [dup] = await pool.query('SELECT id FROM users WHERE mobile = ? AND id <> ?', [m, emp.id]);
      if (dup.length) return res.status(409).json({ success: false, error: 'This mobile number is already registered' });
      sets.push('mobile = ?'); params.push(m);
    }
    if (b.email !== undefined) {
      if (b.email && !isValidEmail(b.email)) return res.status(400).json({ success: false, error: 'Email is invalid' });
      sets.push('email = ?'); params.push(b.email ? b.email.trim().toLowerCase() : null);
    }
    if (b.role !== undefined && EMPLOYEE_ROLES.includes(b.role)) { sets.push('role = ?'); params.push(b.role); }
    if (b.custom_role_id !== undefined) {
      const roleId = await validateCustomRole(pool, b.custom_role_id, emp.franchise_id);
      if (roleId === undefined) return res.status(400).json({ success: false, error: 'Selected role is not available for this franchise' });
      sets.push('custom_role_id = ?'); params.push(roleId);
    }
    const sal = salaryFields(b);
    for (const [k, v] of Object.entries(sal)) { sets.push(`${k} = ?`); params.push(v); }
    if (sal.salary_rate !== undefined && (sal.salary_type || emp.salary_type) === 'monthly') { sets.push('base_salary = ?'); params.push(sal.salary_rate); }
    if (b.base_salary !== undefined && sal.salary_rate === undefined) { sets.push('base_salary = ?', 'salary_rate = ?'); params.push(b.base_salary, b.base_salary); }

    if (sets.length) {
      params.push(emp.id);
      await pool.query(`UPDATE users SET ${sets.join(', ')} WHERE id = ?`, params);
    }
    if (b.specialisations !== undefined) {
      await pool.query('INSERT INTO staff_profiles (user_id, specialisations) VALUES (?, ?) ON DUPLICATE KEY UPDATE specialisations = VALUES(specialisations)', [emp.id, b.specialisations]);
    }
    if (b.role !== undefined || b.custom_role_id !== undefined) {
      clearPermissionCache(emp.id);
    }
    res.json({ success: true, message: 'Staff updated' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('Staff update error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.resetPassword = async (req, res) => {
  try {
    const emp = await loadEmployee(req, res, req.params.id);
    if (!emp) return;
    const pw = String(req.body.new_password || '');
    if (pw.length < 8 || !/\d/.test(pw) || !/[a-zA-Z]/.test(pw)) {
      return res.status(400).json({ success: false, error: 'Password must be at least 8 characters with letters and numbers' });
    }
    await pool.query(
      'UPDATE users SET password_hash = ?, must_change_password = 0, token_version = token_version + 1, failed_login_attempts = 0, locked_until = NULL WHERE id = ?',
      [await bcrypt.hash(pw, 10), emp.id]
    );
    res.json({ success: true, message: 'Password changed. The new password works right away (old sessions are signed out).' });
  } catch (err) {
    console.error('Staff resetPassword error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.toggleStatus = async (req, res) => {
  try {
    const emp = await loadEmployee(req, res, req.params.id);
    if (!emp) return;
    const next = emp.is_active ? 0 : 1;
    await pool.query('UPDATE users SET is_active = ?, token_version = token_version + 1 WHERE id = ?', [next, emp.id]);
    res.json({ success: true, data: { is_active: next }, message: next ? 'Account activated' : 'Account deactivated and logged out' });
  } catch (err) {
    console.error('Staff toggleStatus error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── MARK ATTENDANCE ────────────────────────
exports.markAttendance = async (req, res) => {
  try {
    const { status, note, att_date, check_in_time, check_out_time } = req.body;
    const staffId = req.params.id;
    const date = att_date || new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    if (!status || !['present', 'absent', 'half_day'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      return res.status(400).json({ success: false, error: 'Invalid date' });
    }
    if (date > new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' })) {
      return res.status(400).json({ success: false, error: 'Attendance cannot be marked for a future day' });
    }

    // Verify staff exists
    const emp = await loadEmployee(req, res, staffId);
    if (!emp) return;

    // Build timestamps from date + time (e.g. "2026-05-02" + "09:30" → "2026-05-02 09:30:00")
    const checkIn = check_in_time ? `${date} ${check_in_time}:00` : null;
    const checkOut = check_out_time ? `${date} ${check_out_time}:00` : null;

    // Upsert attendance with check-in/out times
    await pool.query(
      `INSERT INTO staff_attendance (staff_id, att_date, status, note, check_in_time, check_out_time, franchise_id)
       VALUES (?, ?, ?, ?, ?, ?, ${Number(emp.franchise_id) || 1})
       ON DUPLICATE KEY UPDATE status = VALUES(status), note = VALUES(note),
         check_in_time = COALESCE(VALUES(check_in_time), check_in_time), check_out_time = COALESCE(VALUES(check_out_time), check_out_time)`,
      // keep a self check-in's times when the admin only changes the status; record who marked it
      [staffId, date, status, note || `Marked ${status.replace('_', ' ')} by ${req.user.name || req.user.role}`, checkIn, checkOut]
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
    if (!(await loadEmployee(req, res, req.params.id))) return;
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
    if (!(Number(amount) > 0)) return res.status(400).json({ success: false, error: 'Amount must be more than 0' });

    // Verify staff exists
    const emp = await loadEmployee(req, res, staffId);
    if (!emp) return;

    const [result] = await pool.query(
      'INSERT INTO staff_payments (staff_id, amount, purpose, payment_date, franchise_id) VALUES (?, ?, ?, ?, ?)',
      [staffId, amount, purpose, payment_date, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
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
    if (!(await loadEmployee(req, res, req.params.id))) return;
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
  if (!(await loadEmployee(req, res, req.params.id))) return;
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
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES (?, ?, ?, ?, ?, CURDATE(), ?, ?)`,
      ['staff_payment', parseInt(pid), payment[0].amount, 'out', `Staff payment: ${payment[0].purpose}`, req.user.id, (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1)]
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

/**
 * Is (lat, lng) inside the studio premises the admin set? Phone GPS can be off by tens of metres
 * indoors, so the reported accuracy (capped at 100 m) is allowed on top of the radius.
 */
async function checkPremises(franchiseId, latitude, longitude, accuracy) {
  const [[fr]] = await pool.query('SELECT name, latitude, longitude, geofence_radius_m FROM franchises WHERE id = ?', [franchiseId]);
  if (!fr || fr.latitude == null || fr.longitude == null) {
    return { ok: false, status: 409, code: 'PREMISES_NOT_SET', error: 'Studio location is not set yet. Ask your admin to set it in Staff & HR → Studio premises.' };
  }
  const lat = Number(latitude), lng = Number(longitude);
  // junk like "abc" gave NaN, and "NaN > radius" is false, so it used to count as inside the studio
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || Math.abs(lat) > 90 || Math.abs(lng) > 180 || (lat === 0 && lng === 0)) {
    return { ok: false, status: 400, code: 'BAD_LOCATION', error: 'Location could not be read. Turn on GPS and try again.' };
  }
  const radius = Number(fr.geofence_radius_m) || 150;
  const slack = Math.min(Math.max(Number(accuracy) || 0, 0), 100);
  const distance = Math.round(getDistanceKm(lat, lng, parseFloat(fr.latitude), parseFloat(fr.longitude)) * 1000);
  if (!Number.isFinite(distance) || distance > radius + slack) {
    return { ok: false, status: 403, code: 'OUTSIDE_PREMISES', distance, error: `You are ${distance} m from ${fr.name}. Attendance works only within ${radius} m of the studio.` };
  }
  return { ok: true, name: fr.name, distance };
}

// ─── STUDIO PREMISES (admin sets the attendance pin + radius) ───
exports.getPremises = async (req, res) => {
  try {
    const [[fr]] = await pool.query('SELECT id, name, address, latitude, longitude, geofence_radius_m FROM franchises WHERE id = ?', [req.user.franchise_id || 1]);
    res.json({ success: true, data: fr || null });
  } catch (err) {
    console.error('getPremises error:', err);
    res.status(500).json({ success: false, error: 'Failed to load studio location' });
  }
};

exports.updatePremises = async (req, res) => {
  try {
    const lat = parseFloat(req.body.latitude);
    const lng = parseFloat(req.body.longitude);
    const radius = parseInt(req.body.radius_m, 10);
    if (!(lat >= -90 && lat <= 90) || !(lng >= -180 && lng <= 180)) {
      return res.status(400).json({ success: false, error: 'Enter a valid location' });
    }
    if (!(radius >= 30 && radius <= 1000)) {
      return res.status(400).json({ success: false, error: 'Radius must be between 30 and 1000 m' });
    }
    await pool.query('UPDATE franchises SET latitude = ?, longitude = ?, geofence_radius_m = ? WHERE id = ?', [lat, lng, radius, req.user.franchise_id || 1]);
    res.json({ success: true, message: 'Studio premises saved' });
  } catch (err) {
    console.error('updatePremises error:', err);
    res.status(500).json({ success: false, error: 'Failed to save studio location' });
  }
};

// ─── STAFF CHECK-IN ─────────────────────────
exports.checkIn = async (req, res) => {
  try {
    const staffId = req.user.id;
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const { latitude, longitude } = req.body;
    let face_photo_url = null;
    // Selfie arrives as a data: URL → store as a file (the DB column holds the path only)
    const raw = String(req.body.face_photo_url || '');
    const m = /^data:image\/(jpeg|jpg|png|webp);base64,([A-Za-z0-9+/=]+)$/.exec(raw);
    if (m) {
      const buf = Buffer.from(m[2], 'base64');
      if (buf.length > 3 * 1024 * 1024) return res.status(400).json({ success: false, error: 'Photo is too large' });
      const fs = require('fs');
      const path = require('path');
      const dir = path.join(__dirname, '..', '..', 'uploads', 'attendance');
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      const name = `att_${staffId}_${Date.now()}_${require('crypto').randomBytes(4).toString('hex')}.${m[1] === 'png' ? 'png' : m[1] === 'webp' ? 'webp' : 'jpg'}`;
      fs.writeFileSync(path.join(dir, name), buf);
      face_photo_url = `/uploads/attendance/${name}`;
    }
    if (!face_photo_url) return res.status(400).json({ success: false, error: 'A selfie photo is required to check in' });
    const activeFranchiseId = req.user.franchise_id || 1;

    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'GPS is off. Turn on location to check in.', code: 'GPS_OFF' });
    }
    const fence = await checkPremises(activeFranchiseId, latitude, longitude, req.body.accuracy);
    if (!fence.ok) return res.status(fence.status).json({ success: false, error: fence.error, code: fence.code, distance_m: fence.distance });
    const studioName = fence.name;
    const isValidLocation = true;

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
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    const [existing] = await pool.query(
      'SELECT id, check_in_time, check_out_time FROM staff_attendance WHERE staff_id = ? AND att_date = ?',
      [staffId, today]
    );

    if (!existing.length || !existing[0].check_in_time) {
      return res.status(422).json({ success: false, error: 'Must check in before checking out' });
    }
    // Check-out also has to happen at the studio (same premises as check-in)
    const { latitude, longitude, accuracy } = req.body || {};
    if (!latitude || !longitude) {
      return res.status(400).json({ success: false, error: 'GPS is off. Turn on location to check out.', code: 'GPS_OFF' });
    }
    const fence = await checkPremises(req.user.franchise_id || 1, latitude, longitude, accuracy);
    if (!fence.ok) return res.status(fence.status).json({ success: false, error: fence.error, code: fence.code, distance_m: fence.distance });
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
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

    // Fetch active staff
    let staffSql = "SELECT id, name, mobile, email, franchise_id FROM users WHERE role IN ('manager','staff') AND is_active = 1 AND is_deleted = 0 AND franchise_id = ?";
    const staffParams = [fidOf(req)];
    staffSql += " ORDER BY name ASC";
    const [staffRows] = await pool.query(staffSql, staffParams);

    const ist = (d) => d.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
    const weekAgo = ist(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)); // last 7 days incl. today
    const monthStart = today.slice(0, 8) + '01';
    const yearStart = today.slice(0, 5) + '01-01';

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
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 WHEN att_date >= ? AND status = 'half_day' THEN 0.5 ELSE 0 END) AS weekly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS weekly_absent,
        SUM(CASE WHEN att_date >= ? AND status = 'leave' THEN 1 ELSE 0 END) AS monthly_leave,
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 ELSE 0 END) AS monthly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS monthly_absent,
        SUM(CASE WHEN att_date >= ? AND status = 'half_day' THEN 1 ELSE 0 END) AS monthly_half_day,
        SUM(CASE WHEN att_date >= ? AND status = 'present' THEN 1 WHEN att_date >= ? AND status = 'half_day' THEN 0.5 ELSE 0 END) AS yearly_present,
        SUM(CASE WHEN att_date >= ? AND status = 'absent' THEN 1 ELSE 0 END) AS yearly_absent,
        COUNT(CASE WHEN att_date >= ? THEN 1 END) AS total_monthly_logs
      FROM staff_attendance
      WHERE att_date <= ?
      GROUP BY staff_id
    `, [weekAgo, weekAgo, weekAgo, monthStart, monthStart, monthStart, monthStart, yearStart, yearStart, yearStart, monthStart, today]);

    const statsMap = {};
    statsRows.forEach(s => { statsMap[s.staff_id] = s; });

    const list = staffRows.map(s => {
      const att = todayMap[s.id] || null;
      const st = statsMap[s.id] || {};

      const monthlyPresent = Number(st.monthly_present || 0);
      const monthlyHalfDay = Number(st.monthly_half_day || 0);
      // % of the days marked this month (leave days are left out, they are neither present nor absent)
      const monthlyMarked = Number(st.total_monthly_logs || 0) - Number(st.monthly_leave || 0);
      const attendancePct = monthlyMarked > 0 ? Math.min(100, Math.round(((monthlyPresent + monthlyHalfDay * 0.5) / monthlyMarked) * 100)) : 0;

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
          monthly_leave: Number(st.monthly_leave || 0),
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

