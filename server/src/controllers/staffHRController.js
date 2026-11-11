/**
 * HR — tasks, leave requests, attendance overview, payroll (delegates to salaryController).
 * Employees always see/act on their own records; users with the staff_hr permission manage the
 * whole franchise. Approved leave feeds automatic salary (paid-leave allowance per employee).
 */
const pool = require('../config/db');
const { getEffectivePermissions } = require('../middleware/accessControl');
const salaryController = require('./salaryController');

const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
const LEAVE_TYPES = ['casual', 'sick', 'earned', 'unpaid'];

async function canManage(req, action = 'view') {
  if (req.user.role === 'super_admin') return true;
  const perms = await getEffectivePermissions(req.user);
  return perms.includes(`staff_hr.${action}`);
}

async function employeeInFranchise(id, fid) {
  const [[u]] = await pool.query(
    "SELECT id, name, mobile FROM users WHERE id = ? AND role IN ('manager','staff') AND is_deleted = 0 AND franchise_id = ?",
    [id, fid]
  );
  return u || null;
}

function notifyUser(req, userId, event, payload) {
  const io = req.app.get('io');
  if (io) io.to(`user_${userId}`).emit(event, payload);
}

// ─── TASKS ──────────────────────────────────
exports.getStaffTasks = async (req, res) => {
  try {
    const manage = await canManage(req);
    const where = ['u.franchise_id = ?']; const params = [fidOf(req)];
    if (!manage || req.query.mine === '1') { where.push('t.assigned_to = ?'); params.push(req.user.id); }
    else if (req.query.staff_id) { where.push('t.assigned_to = ?'); params.push(req.query.staff_id); }
    if (req.query.status) { where.push('t.status = ?'); params.push(req.query.status); }
    const [rows] = await pool.query(
      `SELECT t.*, u.name AS staff_name, a.name AS assigned_by_name, jc.invoice_number
       FROM v2_tasks t JOIN users u ON u.id = t.assigned_to LEFT JOIN users a ON a.id = t.assigned_by
       LEFT JOIN job_carts jc ON jc.id = t.job_cart_id
       WHERE ${where.join(' AND ')}
       ORDER BY FIELD(t.status,'in_progress','pending','completed','cancelled'), t.due_date IS NULL, t.due_date, t.id DESC`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
};

exports.createStaffTask = async (req, res) => {
  try {
    if (!(await canManage(req, 'create'))) return res.status(403).json({ success: false, error: 'You cannot assign tasks' });
    const { assigned_to, title, description, priority, due_date, job_cart_id } = req.body;
    if (!assigned_to || !title || !String(title).trim()) return res.status(400).json({ success: false, error: 'Staff member and title are required' });
    const emp = await employeeInFranchise(assigned_to, fidOf(req));
    if (!emp) return res.status(400).json({ success: false, error: 'Staff member not found in this franchise' });
    const pr = ['low', 'medium', 'high', 'urgent'].includes(priority) ? priority : 'medium';
    const [r] = await pool.query(
      'INSERT INTO v2_tasks (assigned_to, assigned_by, title, description, priority, due_date, job_cart_id) VALUES (?,?,?,?,?,?,?)',
      [emp.id, req.user.id, String(title).trim().slice(0, 200), description || '', pr, due_date || null, job_cart_id || null]
    );
    notifyUser(req, emp.id, 'hr:task_assigned', { id: r.insertId, title });
    res.status(201).json({ success: true, data: { id: r.insertId }, message: `Task assigned to ${emp.name}` });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
};

exports.updateTaskStatus = async (req, res) => {
  try {
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const [[task]] = await pool.query(
      'SELECT t.*, u.franchise_id FROM v2_tasks t JOIN users u ON u.id = t.assigned_to WHERE t.id = ?', [req.params.id]);
    if (!task || (req.user.role !== 'super_admin' && Number(task.franchise_id) !== fidOf(req))) {
      return res.status(404).json({ success: false, error: 'Task not found' });
    }
    const manage = await canManage(req, 'edit');
    if (!manage && task.assigned_to !== req.user.id) return res.status(403).json({ success: false, error: 'Not your task' });
    if (!manage && status === 'cancelled') return res.status(403).json({ success: false, error: 'Only HR can cancel tasks' });
    await pool.query(`UPDATE v2_tasks SET status = ?, completed_at = ${status === 'completed' ? 'NOW()' : 'NULL'} WHERE id = ?`, [status, task.id]);
    res.json({ success: true, message: 'Task updated' });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
};

// ─── LEAVES ─────────────────────────────────
exports.getStaffLeaves = async (req, res) => {
  try {
    const manage = await canManage(req);
    const where = ['u.franchise_id = ?']; const params = [fidOf(req)];
    if (!manage || req.query.mine === '1') { where.push('l.staff_id = ?'); params.push(req.user.id); }
    else if (req.query.staff_id) { where.push('l.staff_id = ?'); params.push(req.query.staff_id); }
    if (req.query.status) { where.push('l.status = ?'); params.push(req.query.status); }
    const [rows] = await pool.query(
      `SELECT l.*, l.from_date AS start_date, l.to_date AS end_date, u.name AS staff_name, a.name AS approved_by_name
       FROM v2_leaves l JOIN users u ON u.id = l.staff_id LEFT JOIN users a ON a.id = l.approved_by
       WHERE ${where.join(' AND ')} ORDER BY FIELD(l.status,'pending','approved','rejected'), l.from_date DESC`,
      params
    );
    const [[bal]] = await pool.query(
      `SELECT paid_leaves_per_month,
              (SELECT COALESCE(SUM(days_count),0) FROM v2_leaves WHERE staff_id = ? AND status = 'approved' AND leave_type <> 'unpaid'
                 AND DATE_FORMAT(from_date,'%Y-%m') = DATE_FORMAT(CURDATE(),'%Y-%m')) AS used_this_month
       FROM users WHERE id = ?`, [req.user.id, req.user.id]);
    res.json({ success: true, data: rows, my_balance: bal || null });
  } catch (err) {
    console.error('Get leaves error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaves' });
  }
};

exports.requestLeave = async (req, res) => {
  try {
    const { leave_type, from_date, to_date, reason } = req.body;
    // HR may file leave on behalf of an employee; everyone else files for themselves
    let staffId = req.user.id;
    if (req.body.staff_id && Number(req.body.staff_id) !== req.user.id) {
      if (!(await canManage(req, 'create'))) return res.status(403).json({ success: false, error: 'You can only request leave for yourself' });
      const emp = await employeeInFranchise(req.body.staff_id, fidOf(req));
      if (!emp) return res.status(400).json({ success: false, error: 'Staff member not found' });
      staffId = emp.id;
    }
    if (!['manager', 'staff'].includes(req.user.role) && staffId === req.user.id) {
      return res.status(400).json({ success: false, error: 'Select the staff member this leave is for' });
    }
    if (!from_date || !to_date) return res.status(400).json({ success: false, error: 'From and to dates are required' });
    const f = new Date(from_date), t = new Date(to_date);
    if (isNaN(f) || isNaN(t) || t < f) return res.status(400).json({ success: false, error: 'To-date must be on or after from-date' });
    const days = Math.round((t - f) / 86400000) + 1;
    if (days > 60) return res.status(400).json({ success: false, error: 'Leave cannot exceed 60 days per request' });
    if (!reason || !String(reason).trim()) return res.status(400).json({ success: false, error: 'Please give a reason' });
    const [overlap] = await pool.query(
      "SELECT id FROM v2_leaves WHERE staff_id = ? AND status IN ('pending','approved') AND from_date <= ? AND to_date >= ?",
      [staffId, to_date, from_date]
    );
    if (overlap.length) return res.status(409).json({ success: false, error: 'You already have a leave request covering these dates' });
    const [r] = await pool.query(
      "INSERT INTO v2_leaves (staff_id, leave_type, from_date, to_date, days_count, reason, status) VALUES (?,?,?,?,?,?,'pending')",
      [staffId, LEAVE_TYPES.includes(leave_type) ? leave_type : 'casual', from_date, to_date, days, String(reason).trim()]
    );
    const io = req.app.get('io');
    if (io) io.to(`franchise_${fidOf(req)}`).emit('hr:leave_requested', { id: r.insertId, staff_id: staffId });
    res.status(201).json({ success: true, data: { id: r.insertId }, message: 'Leave request sent for approval' });
  } catch (err) {
    console.error('Request leave error:', err);
    res.status(500).json({ success: false, error: 'Failed to request leave' });
  }
};

exports.updateLeaveStatus = async (req, res) => {
  try {
    if (!(await canManage(req, 'edit'))) return res.status(403).json({ success: false, error: 'You cannot approve leaves' });
    const { status, note } = req.body;
    if (!['approved', 'rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    const payType = req.body.pay_type === 'unpaid' ? 'unpaid' : req.body.pay_type === 'paid' ? 'paid' : null;
    if (status === 'approved' && !payType) return res.status(400).json({ success: false, error: 'Choose paid or unpaid leave' });
    const [[leave]] = await pool.query(
      'SELECT l.*, u.franchise_id FROM v2_leaves l JOIN users u ON u.id = l.staff_id WHERE l.id = ?', [req.params.id]);
    if (!leave || (req.user.role !== 'super_admin' && Number(leave.franchise_id) !== fidOf(req))) {
      return res.status(404).json({ success: false, error: 'Leave request not found' });
    }
    if (leave.staff_id === req.user.id) return res.status(403).json({ success: false, error: 'You cannot approve your own leave' });
    await pool.query('UPDATE v2_leaves SET status = ?, pay_type = ?, approved_by = ?, approved_at = NOW() WHERE id = ?', [status, status === 'approved' ? payType : null, req.user.id, leave.id]);
    // attendance follows the decision: each leave day shows as paid / unpaid leave (a day the person actually worked is kept)
    await pool.query("DELETE FROM staff_attendance WHERE staff_id = ? AND status = 'leave' AND att_date BETWEEN ? AND ?", [leave.staff_id, leave.from_date, leave.to_date]);
    if (status === 'approved') {
      const d = new Date(leave.from_date), end = new Date(leave.to_date);
      const label = `${payType === 'paid' ? 'Paid' : 'Unpaid'} leave (${leave.leave_type}) — approved by ${req.user.name || req.user.role}`;
      for (; d <= end; d.setDate(d.getDate() + 1)) {
        await pool.query(
          `INSERT INTO staff_attendance (staff_id, att_date, status, note, franchise_id) VALUES (?, ?, 'leave', ?, ?)
           ON DUPLICATE KEY UPDATE status = IF(check_in_time IS NULL, 'leave', status), note = IF(check_in_time IS NULL, VALUES(note), note)`,
          [leave.staff_id, d.toLocaleDateString('en-CA'), label, leave.franchise_id || 1]);
      }
    }
    notifyUser(req, leave.staff_id, 'hr:leave_updated', { id: leave.id, status, note: note || null });
    res.json({ success: true, message: status === 'approved' ? `Leave approved as ${payType}. Attendance and salary are updated.` : 'Leave rejected.' });
  } catch (err) {
    console.error('Update leave status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update leave' });
  }
};

// ─── ATTENDANCE ─────────────────────────────
exports.getStaffAttendanceList = async (req, res) => {
  try {
    const manage = await canManage(req);
    const where = ['u.franchise_id = ?']; const params = [fidOf(req)];
    if (!manage) { where.push('sa.staff_id = ?'); params.push(req.user.id); }
    else if (req.query.staff_id) { where.push('sa.staff_id = ?'); params.push(req.query.staff_id); }
    if (req.query.from_date) { where.push('sa.att_date >= ?'); params.push(req.query.from_date); }
    if (req.query.to_date) { where.push('sa.att_date <= ?'); params.push(req.query.to_date); }
    const [rows] = await pool.query(
      `SELECT sa.*, u.name AS staff_name, u.mobile AS staff_mobile
       FROM staff_attendance sa JOIN users u ON u.id = sa.staff_id
       WHERE ${where.join(' AND ')} ORDER BY sa.att_date DESC, sa.check_in_time DESC LIMIT 1000`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance logs' });
  }
};

// ─── PAYROLL (single source of truth = Salary module) ─
exports.getPayrollList = async (req, res) => {
  if (!(await canManage(req))) return salaryController.mySalary(req, res);
  const m = req.query.month && req.query.year ? `${req.query.year}-${String(req.query.month).padStart(2, '0')}` : req.query.month_year;
  req.query.month_year = m || new Date().toISOString().slice(0, 7);
  return salaryController.getSalary(req, res);
};

exports.processPayroll = async (req, res) => {
  if (!(await canManage(req, 'edit'))) return res.status(403).json({ success: false, error: 'Not allowed' });
  const { month, year } = req.body;
  if (month && year) req.body.month_year = `${year}-${String(month).padStart(2, '0')}`;
  return salaryController.calculateSalary(req, res);
};

exports.updatePayrollItem = async (req, res) => {
  if (!(await canManage(req, 'edit'))) return res.status(403).json({ success: false, error: 'Not allowed' });
  return salaryController.updateSalary(req, res);
};

// ─── PERFORMANCE (live, per staff member for a month) ───
// jobs completed as technician, average customer rating, attendance %, incentives earned
exports.getPerformance = async (req, res) => {
  try {
    const fid = req.franchiseId || req.user.franchise_id || 1;
    const month = /^\d{4}-\d{2}$/.test(req.query.month || '') ? req.query.month : new Date().toISOString().slice(0, 7);
    const [rows] = await pool.query(
      `SELECT u.id, u.name AS staff_name, ? AS period,
              (SELECT COUNT(*) FROM job_carts j WHERE j.technician_id = u.id AND j.status = 'complete'
                 AND DATE_FORMAT(j.completed_at, '%Y-%m') = ?) AS jobs_completed,
              (SELECT COALESCE(AVG(COALESCE(f.staff_rating, f.overall_rating)), 0) FROM v2_feedback f JOIN job_carts j ON j.id = f.job_cart_id
                 WHERE j.technician_id = u.id AND DATE_FORMAT(f.created_at, '%Y-%m') = ?) AS avg_rating,
              (SELECT COUNT(*) FROM staff_attendance a WHERE a.staff_id = u.id AND a.status IN ('present','half_day')
                 AND DATE_FORMAT(a.att_date, '%Y-%m') = ?) AS days_present,
              COALESCE(u.working_days_per_month, 26) AS working_days,
              (SELECT COALESCE(SUM(j.incentive_amount), 0) FROM job_carts j WHERE j.technician_id = u.id AND j.status = 'complete'
                 AND DATE_FORMAT(j.completed_at, '%Y-%m') = ?) AS bonus_amount
         FROM users u
        WHERE u.role IN ('staff', 'manager') AND u.is_active = 1 AND u.is_deleted = 0 AND COALESCE(u.franchise_id, 1) = ?
        ORDER BY jobs_completed DESC, u.name`,
      [month, month, month, month, month, fid]
    );
    const data = rows.map(r => ({ ...r, attendance_pct: Math.min(100, Math.round((Number(r.days_present) / (Number(r.working_days) || 26)) * 100)) }));
    res.json({ success: true, data });
  } catch (err) {
    console.error('Staff performance error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
