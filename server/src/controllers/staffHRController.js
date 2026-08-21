const pool = require('../config/db');

// ─── Get staff tasks (v2_tasks) ────────────────────────
exports.getStaffTasks = async (req, res) => {
  try {
    const { staff_id, status } = req.query;
    let where = ['1=1']; const params = [];
    
    // If user is staff, force filter by their own ID
    if (req.user.role === 'staff') {
      where.push('st.assigned_to = ?');
      params.push(req.user.id);
    } else if (staff_id) {
      where.push('st.assigned_to = ?');
      params.push(staff_id);
    }
    
    if (status) {
      where.push('st.status = ?');
      params.push(status);
    }

    const [rows] = await pool.query(`
      SELECT st.*, u.name as staff_name, jc.invoice_number
      FROM v2_tasks st
      LEFT JOIN users u ON u.id = st.assigned_to
      LEFT JOIN job_carts jc ON jc.id = st.job_cart_id
      WHERE ${where.join(' AND ')}
      ORDER BY st.due_date ASC, st.priority DESC
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get tasks error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch tasks' });
  }
};

// ─── Create staff task (v2_tasks) ──────────────────────
exports.createStaffTask = async (req, res) => {
  try {
    const { assigned_to, title, description, priority, due_date, job_cart_id } = req.body;
    if (!assigned_to || !title) return res.status(400).json({ success: false, error: 'Staff and title required' });
    
    const [result] = await pool.query(
      'INSERT INTO v2_tasks (assigned_to, assigned_by, title, description, priority, due_date, job_cart_id) VALUES (?,?,?,?,?,?,?)',
      [assigned_to, req.user.id, title, description || '', priority || 'medium', due_date || null, job_cart_id || null]
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Task assigned' });
  } catch (err) {
    console.error('Create task error:', err);
    res.status(500).json({ success: false, error: 'Failed to create task' });
  }
};

// ─── Update task status (v2_tasks) ─────────────────────
exports.updateTaskStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'in_progress', 'completed', 'cancelled'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const [existing] = await pool.query('SELECT * FROM v2_tasks WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Task not found' });

    // Staff can only update their own tasks
    if (req.user.role === 'staff' && existing[0].assigned_to !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized to modify this task' });
    }

    if (status === 'completed') {
      await pool.query('UPDATE v2_tasks SET status = ?, completed_at = NOW() WHERE id = ?', [status, id]);
    } else {
      await pool.query('UPDATE v2_tasks SET status = ?, completed_at = NULL WHERE id = ?', [status, id]);
    }

    res.json({ success: true, message: 'Task updated' });
  } catch (err) {
    console.error('Update task error:', err);
    res.status(500).json({ success: false, error: 'Failed to update task' });
  }
};

// ─── Get staff leaves (v2_leaves) ──────────────────────
exports.getStaffLeaves = async (req, res) => {
  try {
    const { staff_id, status } = req.query;
    let where = ['1=1']; const params = [];
    
    if (req.user.role === 'staff') {
      where.push('sl.staff_id = ?');
      params.push(req.user.id);
    } else if (staff_id) {
      where.push('sl.staff_id = ?');
      params.push(staff_id);
    }

    if (status) {
      where.push('sl.status = ?');
      params.push(status);
    }

    const [rows] = await pool.query(`
      SELECT sl.*, u.name as staff_name, a.name as approved_by_name
      FROM v2_leaves sl
      LEFT JOIN users u ON u.id = sl.staff_id
      LEFT JOIN users a ON a.id = sl.approved_by
      WHERE ${where.join(' AND ')}
      ORDER BY sl.created_at DESC
    `, params);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get leaves error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch leaves' });
  }
};

// ─── Request leave (v2_leaves) ─────────────────────────
exports.requestLeave = async (req, res) => {
  try {
    const { leave_type, from_date, to_date, reason } = req.body;
    const staff_id = req.user.id;
    if (!from_date || !to_date) return res.status(400).json({ success: false, error: 'Dates required' });
    
    const days = Math.ceil((new Date(to_date) - new Date(from_date)) / (1000*60*60*24)) + 1;
    const [result] = await pool.query(
      'INSERT INTO v2_leaves (staff_id, leave_type, from_date, to_date, days_count, reason, status) VALUES (?,?,?,?,?,?,"pending")',
      [staff_id, leave_type || 'casual', from_date, to_date, days, reason || '']
    );

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Leave request submitted' });
  } catch (err) {
    console.error('Request leave error:', err);
    res.status(500).json({ success: false, error: 'Failed to request leave' });
  }
};

// ─── Approve/Reject leave (v2_leaves) ──────────────────
exports.updateLeaveStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['approved','rejected'].includes(status)) return res.status(400).json({ success: false, error: 'Invalid status' });
    
    await pool.query('UPDATE v2_leaves SET status = ?, approved_by = ?, approved_at = NOW() WHERE id = ?', [status, req.user.id, id]);
    res.json({ success: true, message: `Leave request ${status}` });
  } catch (err) {
    console.error('Update leave status error:', err);
    res.status(500).json({ success: false, error: 'Failed to update leave' });
  }
};

// ─── Get staff attendance list (staff_attendance) ──────
exports.getStaffAttendanceList = async (req, res) => {
  try {
    const { staff_id, from_date, to_date } = req.query;
    const isGlobalAdmin = req.user.role === 'admin' || req.user.role === 'super_admin';
    const activeFranchiseId = req.headers['x-franchise-id']
      ? parseInt(req.headers['x-franchise-id'], 10)
      : (req.user.franchise_id || 1);

    let where = ['1=1']; const params = [];
    
    if (req.user.role === 'staff') {
      where.push('sa.staff_id = ?');
      params.push(req.user.id);
    } else if (staff_id) {
      where.push('sa.staff_id = ?');
      params.push(staff_id);
    } else if (!isGlobalAdmin) {
      where.push('(sa.franchise_id = ? OR u.franchise_id = ?)');
      params.push(activeFranchiseId, activeFranchiseId);
    } else if (req.query.franchise_id) {
      where.push('(sa.franchise_id = ? OR u.franchise_id = ?)');
      params.push(parseInt(req.query.franchise_id, 10), parseInt(req.query.franchise_id, 10));
    }
    
    if (from_date) { where.push('sa.att_date >= ?'); params.push(from_date); }
    if (to_date) { where.push('sa.att_date <= ?'); params.push(to_date); }

    const [rows] = await pool.query(
      `SELECT sa.*, u.name as staff_name, u.mobile as staff_mobile, f.name AS franchise_name
       FROM staff_attendance sa
       LEFT JOIN users u ON u.id = sa.staff_id
       LEFT JOIN franchises f ON sa.franchise_id = f.id
       WHERE ${where.join(' AND ')}
       ORDER BY sa.att_date DESC, sa.check_in_time DESC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get attendance error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch attendance logs' });
  }
};

// ─── Process monthly payroll (v2_payroll) ──────────────
exports.processPayroll = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { month, year } = req.body;
    if (!month || !year) {
      return res.status(400).json({ success: false, error: 'Month and year are required' });
    }

    // Fetch all active staff
    const [staffUsers] = await conn.query("SELECT id, base_salary FROM users WHERE role = 'staff' AND is_active = 1");
    const workingDays = 26; // standard month standard

    for (const staff of staffUsers) {
      const staffId = staff.id;
      const baseSalary = parseFloat(staff.base_salary || 15000);

      // Get present days (present = 1, half_day = 0.5)
      const [attRows] = await conn.query(
        `SELECT
           SUM(CASE WHEN status = 'present' THEN 1 WHEN status = 'half_day' THEN 0.5 ELSE 0 END) as present_days,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) as absent_days
         FROM staff_attendance
         WHERE staff_id = ? AND MONTH(att_date) = ? AND YEAR(att_date) = ?`,
        [staffId, month, year]
      );

      const presentDays = parseFloat(attRows[0].present_days || 0);
      const absentDays = parseFloat(attRows[0].absent_days || 0);

      // Get approved leave days count
      const [leaveRows] = await conn.query(
        `SELECT SUM(days_count) as leave_days FROM v2_leaves
         WHERE staff_id = ? AND status = 'approved' AND MONTH(from_date) = ? AND YEAR(from_date) = ?`,
        [staffId, month, year]
      );
      const leaveDays = parseInt(leaveRows[0].leave_days || 0);

      const ratio = workingDays > 0 ? (presentDays / workingDays) : 1;
      const calculatedSalary = baseSalary * Math.min(1, ratio);
      const netSalary = Math.max(0, calculatedSalary);

      const [existing] = await conn.query(
        'SELECT id FROM v2_payroll WHERE staff_id = ? AND month = ? AND year = ?',
        [staffId, month, year]
      );

      if (existing.length) {
        await conn.query(
          `UPDATE v2_payroll
           SET base_salary = ?, present_days = ?, absent_days = ?, leave_days = ?, net_salary = ?
           WHERE id = ?`,
          [baseSalary, presentDays, absentDays, leaveDays, netSalary, existing[0].id]
        );
      } else {
        await conn.query(
          `INSERT INTO v2_payroll
           (staff_id, month, year, base_salary, present_days, absent_days, leave_days, overtime_hours, overtime_pay, deductions, bonuses, net_salary, payment_status)
           VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, 0, 0, ?, 'pending')`,
          [staffId, month, year, baseSalary, presentDays, absentDays, leaveDays, netSalary]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: `Payroll processed successfully for month ${month}/${year}.` });
  } catch (err) {
    await conn.rollback();
    console.error('Process payroll error:', err);
    res.status(500).json({ success: false, error: 'Failed to process payroll' });
  } finally {
    conn.release();
  }
};

// ─── Get payroll list (v2_payroll) ─────────────────────
exports.getPayrollList = async (req, res) => {
  try {
    const { month, year, staff_id } = req.query;
    let where = ['1=1']; const params = [];
    
    if (req.user.role === 'staff') {
      where.push('p.staff_id = ?');
      params.push(req.user.id);
    } else if (staff_id) {
      where.push('p.staff_id = ?');
      params.push(staff_id);
    }
    
    if (month) { where.push('p.month = ?'); params.push(month); }
    if (year) { where.push('p.year = ?'); params.push(year); }

    const [rows] = await pool.query(
      `SELECT p.*, u.name as staff_name, u.email as staff_email, u.mobile as staff_mobile
       FROM v2_payroll p
       LEFT JOIN users u ON u.id = p.staff_id
       WHERE ${where.join(' AND ')}
       ORDER BY p.year DESC, p.month DESC, u.name ASC`,
      params
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Get payroll error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch payroll list' });
  }
};

// ─── Update payroll item details (v2_payroll) ──────────
exports.updatePayrollItem = async (req, res) => {
  try {
    const { id } = req.params;
    const { base_salary, bonuses, deductions, overtime_hours, overtime_pay, payment_status, payment_mode } = req.body;

    const [existing] = await pool.query('SELECT * FROM v2_payroll WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Payroll record not found' });

    const updates = []; const params = [];
    if (base_salary !== undefined) { updates.push('base_salary = ?'); params.push(base_salary); }
    if (bonuses !== undefined) { updates.push('bonuses = ?'); params.push(bonuses); }
    if (deductions !== undefined) { updates.push('deductions = ?'); params.push(deductions); }
    if (overtime_hours !== undefined) { updates.push('overtime_hours = ?'); params.push(overtime_hours); }
    if (overtime_pay !== undefined) { updates.push('overtime_pay = ?'); params.push(overtime_pay); }
    if (payment_status !== undefined) {
      updates.push('payment_status = ?');
      params.push(payment_status);
      if (payment_status === 'paid') {
        updates.push('paid_at = NOW()');
      } else {
        updates.push('paid_at = NULL');
      }
    }
    if (payment_mode !== undefined) { updates.push('payment_mode = ?'); params.push(payment_mode); }

    if (updates.length) {
      const finalBase = base_salary !== undefined ? parseFloat(base_salary) : parseFloat(existing[0].base_salary);
      const finalBonus = bonuses !== undefined ? parseFloat(bonuses) : parseFloat(existing[0].bonuses);
      const finalDeductions = deductions !== undefined ? parseFloat(deductions) : parseFloat(existing[0].deductions);
      const finalOvertime = overtime_pay !== undefined ? parseFloat(overtime_pay) : parseFloat(existing[0].overtime_pay);

      const workingDays = 26;
      const presentDays = parseFloat(existing[0].present_days);
      const calcSal = finalBase * Math.min(1, presentDays / workingDays);
      const finalNet = Math.max(0, calcSal + finalOvertime + finalBonus - finalDeductions);

      updates.push('net_salary = ?');
      params.push(finalNet);

      params.push(id);
      await pool.query(`UPDATE v2_payroll SET ${updates.join(', ')} WHERE id = ?`, params);
    }

    res.json({ success: true, message: 'Payroll record updated successfully' });
  } catch (err) {
    console.error('Update payroll item error:', err);
    res.status(500).json({ success: false, error: 'Failed to update payroll record' });
  }
};
