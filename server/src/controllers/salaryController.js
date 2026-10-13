const pool = require('../config/db');

exports.getSalary = async (req, res) => {
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const month_year = req.query.month_year || currentMonth;

    const [rows] = await pool.query(`
      SELECT s.*, u.name as staff_name, u.mobile as staff_mobile
      FROM staff_salary s
      JOIN users u ON s.staff_id = u.id
      WHERE s.month_year = ?
    `, [month_year]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.calculateSalary = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const currentMonth = new Date().toISOString().slice(0, 7);
    const month_year = req.body.month_year || currentMonth;

    await conn.beginTransaction();

    // Get active staff users
    const [staff] = await conn.query('SELECT id, name, mobile FROM users WHERE role = "staff" AND is_active = 1');
    
    // Query attendance records grouped by status for target month
    const [attendanceRows] = await conn.query(`
      SELECT staff_id, status, COUNT(DISTINCT att_date) as cnt
      FROM staff_attendance 
      WHERE DATE_FORMAT(att_date, '%Y-%m') = ?
      GROUP BY staff_id, status
    `, [month_year]);
    
    for (const s of staff) {
      const staffAtt = attendanceRows.filter(a => a.staff_id === s.id);
      const daysPresent = staffAtt.find(a => a.status === 'present')?.cnt || 0;
      const halfDays = staffAtt.find(a => a.status === 'half_day')?.cnt || 0;
      const daysAbsent = staffAtt.find(a => a.status === 'absent')?.cnt || 0;
      
      const payableDays = daysPresent + (halfDays * 0.5);
      const dailyRate = 500; // Standard daily wage
      const baseSalary = Math.round(payableDays * dailyRate);
      const notes = `Auto-calculated from Attendance Logs: ${daysPresent} Present, ${halfDays} Half-day, ${daysAbsent} Absent (Payable: ${payableDays} days @ ₹${dailyRate}/day)`;
      
      await conn.query(`
        INSERT INTO staff_salary (staff_id, month_year, base_salary, final_salary, notes)
        VALUES (?, ?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE 
          base_salary = VALUES(base_salary),
          final_salary = VALUES(base_salary) + bonus - deductions,
          notes = VALUES(notes)
      `, [s.id, month_year, baseSalary, baseSalary, notes]);
    }
    
    await conn.commit();
    res.json({ success: true, message: `Salary auto-generated for ${staff.length} staff member(s) linked to attendance logs.` });
  } catch (err) {
    await conn.rollback();
    console.error('calculateSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

exports.createSalary = async (req, res) => {
  try {
    const { staff_id, month_year, base_salary, bonus, deductions, status, notes } = req.body;
    if (!staff_id || !month_year) {
      return res.status(400).json({ success: false, error: 'staff_id and month_year are required' });
    }

    const final_salary = parseFloat(base_salary || 0) + parseFloat(bonus || 0) - parseFloat(deductions || 0);

    const [result] = await pool.query(`
      INSERT INTO staff_salary (staff_id, month_year, base_salary, bonus, deductions, final_salary, status, notes)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      ON DUPLICATE KEY UPDATE 
        base_salary = VALUES(base_salary), 
        bonus = VALUES(bonus), 
        deductions = VALUES(deductions), 
        final_salary = VALUES(final_salary), 
        status = VALUES(status), 
        notes = VALUES(notes)
    `, [staff_id, month_year, base_salary || 0, bonus || 0, deductions || 0, final_salary, status || 'pending', notes]);

    res.json({ success: true, message: 'Salary record created', data: { id: result.insertId } });
  } catch (err) {
    console.error('createSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateSalary = async (req, res) => {
  try {
    const { id } = req.params;
    const { base_salary, bonus, deductions, status, notes } = req.body;
    
    const final_salary = parseFloat(base_salary || 0) + parseFloat(bonus || 0) - parseFloat(deductions || 0);
    
    await pool.query(`
      UPDATE staff_salary 
      SET base_salary = ?, bonus = ?, deductions = ?, final_salary = ?, status = ?, notes = ?
      WHERE id = ?
    `, [base_salary, bonus, deductions, final_salary, status, notes, id]);
    
    res.json({ success: true, message: 'Salary updated' });
  } catch (err) {
    console.error('updateSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── DOWNLOAD SALARY SLIP PDF ────────────────
exports.downloadSlip = async (req, res) => {
  try {
    const { generateSalarySlipPDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generateSalarySlipPDF(req.params.id);
    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
    });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Salary slip PDF error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate salary slip' });
  }
};

