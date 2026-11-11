/**
 * Salary — generated automatically from each employee's salary method:
 *   monthly : rate per month, pro-rated by payable days / working days per month
 *   daily   : rate × payable days
 *   hourly  : rate × hours worked (check-in → check-out)
 * Payable days = present + ½ half days + approved paid leave (up to the monthly allowance).
 * Incentives (job card splits, approved) are added. Unpaid referral earnings can be included on payout;
 * when included they are marked paid in the Referrals ledger (and vice-versa shown everywhere).
 */
const pool = require('../config/db');
const referralService = require('../services/referralService');

const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
const round2 = (n) => Math.round((Number(n) || 0) * 100) / 100;

function monthBounds(monthYear) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(monthYear || '')) return null;
  const [y, m] = monthYear.split('-').map(Number);
  const start = `${monthYear}-01`;
  const last = new Date(y, m, 0).getDate();
  return { y, m, start, end: `${monthYear}-${String(last).padStart(2, '0')}` };
}

async function computeFor(conn, emp, mb) {
  const [att] = await conn.query(
    `SELECT status, COUNT(DISTINCT att_date) AS days,
            SUM(CASE WHEN check_in_time IS NOT NULL AND check_out_time IS NOT NULL
                     THEN TIMESTAMPDIFF(MINUTE, check_in_time, check_out_time) ELSE 0 END) AS minutes
     FROM staff_attendance WHERE staff_id = ? AND att_date BETWEEN ? AND ? GROUP BY status`,
    [emp.id, mb.start, mb.end]
  );
  const get = (st) => att.find(a => a.status === st) || { days: 0, minutes: 0 };
  const present = Number(get('present').days);
  const half = Number(get('half_day').days);
  const absent = Number(get('absent').days);
  const hours = round2(att.reduce((s, a) => s + Number(a.minutes || 0), 0) / 60);

  // Approved leave days falling inside this month
  const [lv] = await conn.query(
    `SELECT leave_type, pay_type, SUM(DATEDIFF(LEAST(to_date, ?), GREATEST(from_date, ?)) + 1) AS days
     FROM v2_leaves WHERE staff_id = ? AND status = 'approved' AND from_date <= ? AND to_date >= ?
     GROUP BY leave_type, pay_type`,
    [mb.end, mb.start, emp.id, mb.end, mb.start]
  );
  const leaveTotal = lv.reduce((s, l) => s + Number(l.days || 0), 0);
  const decidedPaid = lv.filter(l => l.pay_type === 'paid').reduce((s, l) => s + Number(l.days || 0), 0);
  const legacy = lv.filter(l => !l.pay_type);
  const legacyUnpaid = legacy.filter(l => l.leave_type === 'unpaid').reduce((s, l) => s + Number(l.days || 0), 0);
  const legacyRest = legacy.reduce((s, l) => s + Number(l.days || 0), 0) - legacyUnpaid;
  const allowance = Number(emp.paid_leaves_per_month ?? 1);
  const paidLeave = decidedPaid + Math.min(Math.max(0, allowance - decidedPaid), legacyRest);
  const unpaidLeave = leaveTotal - paidLeave;

  const payableDays = present + half * 0.5 + paidLeave;
  const rate = Number(emp.salary_rate || emp.base_salary || 0);
  const wd = Number(emp.working_days_per_month || 26);
  let base;
  if (emp.salary_type === 'daily') base = rate * payableDays;
  else if (emp.salary_type === 'hourly') base = rate * hours;
  else base = Math.min(rate, (rate / wd) * payableDays);

  // incentive not yet paid in any salary (carried forward if left out before) + complaint deductions
  const owed = await require('../services/incentiveEngine').owedFor(conn, emp.id, mb.y, mb.m);
  const inc = { total: owed.incentive };
  const referrals = await referralService.unpaidForStaff(conn, emp.id, mb.end);
  const referralAmount = round2(referrals.reduce((s, r) => s + Number(r.amount), 0));

  return {
    days_present: present, half_days: half, absent_days: absent, paid_leave_days: paidLeave, unpaid_leave_days: unpaidLeave,
    hours_worked: hours, salary_type: emp.salary_type || 'monthly', salary_rate: rate,
    base_salary: round2(base), incentive_amount: round2(inc.total), complaint_deduction: owed.penalty, referral_amount: referralAmount,
    notes: `${emp.salary_type || 'monthly'} @ ₹${rate}${emp.salary_type === 'hourly' ? '/hr' : emp.salary_type === 'daily' ? '/day' : '/month'} · ` +
      `${present} present, ${half} half-day, ${paidLeave} paid leave, ${unpaidLeave} unpaid leave, ${absent} absent` +
      (emp.salary_type === 'hourly' ? `, ${hours} h` : ''),
  };
}

// incentive only when the admin ticks "Add incentive"; complaint deductions always apply
const incOn = (r) => r.include_incentive === undefined || r.include_incentive === null || Number(r.include_incentive) === 1;
const finalOf = (r) => Math.max(0, finalRaw(r));
const finalRaw = (r) => round2(Number(r.base_salary) + (incOn(r) ? Number(r.incentive_amount || 0) : 0) + Number(r.bonus || 0)
  - Number(r.deductions || 0) - Number(r.complaint_deduction || 0)
  + (Number(r.include_referral) ? Number(r.referral_amount || 0) : 0));

/**
 * Pending (not paid) rows always show today's numbers: current salary method and rate, attendance,
 * approved leave, incentives and referrals. Bonus, deductions, toggles and a hand-typed base are kept.
 */
async function refreshPending(rows) {
  for (const r of rows) {
    if (r.status === 'paid') continue;
    const mb = monthBounds(String(r.month_year));
    const [[emp]] = await pool.query('SELECT * FROM users WHERE id = ?', [r.staff_id]);
    if (!mb || !emp) continue;
    const c = await computeFor(pool, emp, mb);
    const base = Number(r.manual_base) ? Number(r.base_salary) : c.base_salary;
    const next = { ...r, ...c, base_salary: base };
    const final = finalOf(next);
    await pool.query(
      `UPDATE staff_salary SET salary_type=?, salary_rate=?, days_present=?, half_days=?, paid_leave_days=?, unpaid_leave_days=?,
          absent_days=?, hours_worked=?, base_salary=?, incentive_amount=?, complaint_deduction=?, referral_amount=?, final_salary=?, notes=?
        WHERE id = ? AND status <> 'paid'`,
      [c.salary_type, c.salary_rate, c.days_present, c.half_days, c.paid_leave_days, c.unpaid_leave_days, c.absent_days, c.hours_worked,
        base, c.incentive_amount, c.complaint_deduction, c.referral_amount, final, Number(r.manual_base) ? r.notes : c.notes, r.id]
    );
    Object.assign(r, c, { base_salary: base, final_salary: final, notes: Number(r.manual_base) ? r.notes : c.notes });
  }
  return rows;
}
exports.refreshPending = refreshPending;

// GET /salary?month_year=2026-10
exports.getSalary = async (req, res) => {
  try {
    const monthYear = req.query.month_year || new Date().toISOString().slice(0, 7);
    const [rows] = await pool.query(
      `SELECT s.*, u.name AS staff_name, u.mobile AS staff_mobile, u.role AS staff_role
       FROM staff_salary s JOIN users u ON s.staff_id = u.id
       WHERE s.month_year = ? AND s.franchise_id = ? ORDER BY u.name`,
      [monthYear, fidOf(req)]
    );
    await refreshPending(rows); // live: rate, attendance, leave, incentive, referrals
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /salary/calculate { month_year } — (re)generate for every active employee; paid slips are never touched
exports.calculateSalary = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const monthYear = req.body.month_year || new Date().toISOString().slice(0, 7);
    const mb = monthBounds(monthYear);
    if (!mb) return res.status(400).json({ success: false, error: 'month_year must look like 2026-10' });
    const fid = fidOf(req);
    const [emps] = await conn.query(
      "SELECT * FROM users WHERE role IN ('manager','staff') AND is_active = 1 AND is_deleted = 0 AND franchise_id = ?",
      [fid]
    );
    await conn.beginTransaction();
    let generated = 0;
    for (const emp of emps) {
      const [[existing]] = await conn.query('SELECT * FROM staff_salary WHERE staff_id = ? AND month_year = ?', [emp.id, monthYear]);
      if (existing && existing.status === 'paid') continue;
      const c = await computeFor(conn, emp, mb);
      const row = { ...c, bonus: existing?.bonus || 0, deductions: existing?.deductions || 0, include_referral: existing ? existing.include_referral : 1, include_incentive: existing ? existing.include_incentive : 1 };
      if (existing && Number(existing.manual_base)) { row.base_salary = Number(existing.base_salary); c.base_salary = row.base_salary; }
      await conn.query(
        `INSERT INTO staff_salary (staff_id, franchise_id, month_year, salary_type, salary_rate, days_present, half_days, paid_leave_days,
            unpaid_leave_days, absent_days, hours_worked, base_salary, incentive_amount, referral_amount, include_referral, bonus,
            deductions, final_salary, status, notes)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
         ON DUPLICATE KEY UPDATE salary_type=VALUES(salary_type), salary_rate=VALUES(salary_rate), days_present=VALUES(days_present),
            half_days=VALUES(half_days), paid_leave_days=VALUES(paid_leave_days), unpaid_leave_days=VALUES(unpaid_leave_days),
            absent_days=VALUES(absent_days), hours_worked=VALUES(hours_worked), base_salary=VALUES(base_salary),
            incentive_amount=VALUES(incentive_amount), referral_amount=VALUES(referral_amount), final_salary=VALUES(final_salary),
            notes=VALUES(notes), franchise_id=VALUES(franchise_id)`,
        [emp.id, fid, monthYear, c.salary_type, c.salary_rate, c.days_present, c.half_days, c.paid_leave_days, c.unpaid_leave_days,
          c.absent_days, c.hours_worked, c.base_salary, c.incentive_amount, c.referral_amount, row.include_referral, row.bonus,
          row.deductions, finalOf(row), c.notes]
      );
      await conn.query('UPDATE staff_salary SET complaint_deduction = ?, include_incentive = ? WHERE staff_id = ? AND month_year = ?',
        [c.complaint_deduction, row.include_incentive ? 1 : 0, emp.id, monthYear]);
      generated++;
    }
    await conn.commit();
    res.json({ success: true, message: `Salary generated for ${generated} employee(s) for ${monthYear}` });
  } catch (err) {
    await conn.rollback();
    console.error('calculateSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// POST /salary (manual entry for one employee)
exports.createSalary = async (req, res) => {
  try {
    const { staff_id, month_year } = req.body;
    const mb = monthBounds(month_year);
    if (!staff_id || !mb) return res.status(400).json({ success: false, error: 'Employee and month (YYYY-MM) are required' });
    const [[emp]] = await pool.query("SELECT * FROM users WHERE id = ? AND role IN ('manager','staff') AND franchise_id = ?", [staff_id, fidOf(req)]);
    if (!emp) return res.status(404).json({ success: false, error: 'Employee not found' });
    const [[existing]] = await pool.query('SELECT status FROM staff_salary WHERE staff_id = ? AND month_year = ?', [staff_id, month_year]);
    if (existing && existing.status === 'paid') return res.status(422).json({ success: false, error: 'This month is already paid' });
    const c = await computeFor(pool, emp, mb);
    const row = { ...c, bonus: Number(req.body.bonus || 0), deductions: Number(req.body.deductions || 0), include_referral: req.body.include_referral ? 1 : 0, include_incentive: req.body.include_incentive === false || req.body.include_incentive === 0 ? 0 : 1 };
    if (req.body.base_salary !== undefined && req.body.base_salary !== '') row.base_salary = Number(req.body.base_salary);
    await pool.query(
      `INSERT INTO staff_salary (staff_id, franchise_id, month_year, salary_type, salary_rate, days_present, half_days, paid_leave_days,
          unpaid_leave_days, absent_days, hours_worked, base_salary, incentive_amount, referral_amount, include_referral, bonus, deductions,
          final_salary, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?)
       ON DUPLICATE KEY UPDATE base_salary=VALUES(base_salary), bonus=VALUES(bonus), deductions=VALUES(deductions),
          include_referral=VALUES(include_referral), final_salary=VALUES(final_salary), notes=VALUES(notes)`,
      [emp.id, fidOf(req), month_year, c.salary_type, c.salary_rate, c.days_present, c.half_days, c.paid_leave_days, c.unpaid_leave_days,
        c.absent_days, c.hours_worked, row.base_salary, c.incentive_amount, c.referral_amount, row.include_referral, row.bonus,
        row.deductions, finalOf(row), req.body.notes || c.notes]
    );
    await pool.query('UPDATE staff_salary SET complaint_deduction = ?, include_incentive = ?, manual_base = ? WHERE staff_id = ? AND month_year = ?',
      [c.complaint_deduction, row.include_incentive, row.base_salary !== c.base_salary ? 1 : 0, emp.id, month_year]);
    res.json({ success: true, message: 'Salary saved' });
  } catch (err) {
    console.error('createSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

async function loadSlip(req, res, id) {
  const [[row]] = await pool.query('SELECT * FROM staff_salary WHERE id = ?', [id]);
  if (!row) { res.status(404).json({ success: false, error: 'Salary record not found' }); return null; }
  if (req.user.role !== 'super_admin' && Number(row.franchise_id) !== fidOf(req)) {
    res.status(403).json({ success: false, error: 'Not your franchise' }); return null;
  }
  return row;
}

// PUT /salary/:id { base_salary?, bonus?, deductions?, include_referral?, notes? }
exports.updateSalary = async (req, res) => {
  try {
    const row = await loadSlip(req, res, req.params.id);
    if (!row) return;
    if (row.status === 'paid') return res.status(422).json({ success: false, error: 'Paid salary cannot be edited' });
    const next = { ...row };
    for (const k of ['base_salary', 'bonus', 'deductions']) {
      if (req.body[k] !== undefined && req.body[k] !== '') {
        const n = Number(req.body[k]);
        if (isNaN(n) || n < 0) return res.status(400).json({ success: false, error: `${k.replace('_', ' ')} must be a positive number` });
        next[k] = n;
      }
    }
    if (req.body.include_referral !== undefined) next.include_referral = req.body.include_referral ? 1 : 0;
    if (req.body.include_incentive !== undefined) next.include_incentive = req.body.include_incentive ? 1 : 0;
    const manualBase = req.body.base_salary !== undefined && req.body.base_salary !== '' && round2(next.base_salary) !== round2(row.base_salary) ? 1 : Number(row.manual_base || 0);
    const refs = await referralService.unpaidForStaff(pool, row.staff_id);
    next.referral_amount = round2(refs.reduce((s, r) => s + Number(r.amount), 0));
    if (finalRaw(next) < 0) return res.status(400).json({ success: false, error: 'Deductions are more than the salary. Lower the deductions.' });
    await pool.query(
      'UPDATE staff_salary SET base_salary=?, bonus=?, deductions=?, include_referral=?, include_incentive=?, referral_amount=?, final_salary=?, manual_base=?, notes=COALESCE(?, notes) WHERE id=?',
      [next.base_salary, next.bonus, next.deductions, next.include_referral, incOn(next) ? 1 : 0, next.referral_amount, finalOf(next), manualBase, req.body.notes || null, row.id]
    );
    res.json({ success: true, message: 'Salary updated', data: { final_salary: finalOf(next) } });
  } catch (err) {
    console.error('updateSalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /salary/:id/pay { payment_mode, include_referral }
exports.paySalary = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const row = await loadSlip(req, res, req.params.id);
    if (!row) return;
    if (row.status === 'paid') return res.status(422).json({ success: false, error: 'Already paid' });
    await refreshPending([row]); // pay on today's attendance / rate, not an old snapshot
    const mode = ['cash', 'upi', 'bank'].includes(req.body.payment_mode) ? req.body.payment_mode : 'cash';
    const include = req.body.include_referral !== undefined ? (req.body.include_referral ? 1 : 0) : Number(row.include_referral);

    await conn.beginTransaction();
    // Lock the slip so "Pay" tapped twice at the same moment pays once.
    const [[lock]] = await conn.query('SELECT status FROM staff_salary WHERE id = ? FOR UPDATE', [row.id]);
    if (!lock || lock.status === 'paid') { await conn.rollback(); return res.status(422).json({ success: false, error: 'Already paid' }); }
    const refs = await referralService.unpaidForStaff(conn, row.staff_id);
    const refAmount = include ? round2(refs.reduce((s, r) => s + Number(r.amount), 0)) : 0;
    const incInclude = req.body.include_incentive !== undefined ? (req.body.include_incentive ? 1 : 0) : (incOn(row) ? 1 : 0);
    const [yy, mm] = String(row.month_year).split('-').map(Number);
    const owed = await require('../services/incentiveEngine').owedFor(conn, row.staff_id, yy, mm);
    const incAmount = incInclude ? owed.incentive : 0;
    const final = finalOf({ ...row, include_referral: include, referral_amount: refAmount, include_incentive: incInclude, incentive_amount: owed.incentive, complaint_deduction: owed.penalty });
    await conn.query(
      "UPDATE staff_salary SET status='paid', paid_at=NOW(), payment_mode=?, include_referral=?, referral_amount=?, include_incentive=?, incentive_amount=?, complaint_deduction=?, final_salary=? WHERE id=?",
      [mode, include, refAmount, incInclude, incAmount, owed.penalty, final, row.id]
    );
    // incentive paid now is settled; if left out it stays owed for the next salary. Deductions are settled either way.
    if (incInclude && owed.incentiveIds.length) await conn.query("UPDATE incentive_splits SET status='paid', salary_id=? WHERE id IN (?)", [row.id, owed.incentiveIds]);
    if (owed.penaltyIds.length) await conn.query('UPDATE incentive_splits SET penalty_salary_id=? WHERE id IN (?)', [row.id, owed.penaltyIds]);
    if (include && refs.length) {
      await conn.query(
        "UPDATE referral_ledger SET status='paid', paid_at=NOW(), paid_via='salary', salary_id=?, paid_by=? WHERE id IN (?) AND status='unpaid'",
        [row.id, req.user.id, refs.map(r => r.id)]
      );
    }
    await conn.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES ('salary', ?, ?, 'out', ?, CURDATE(), ?, ?)`,
      [row.id, final, `Salary ${row.month_year}${include && refAmount ? ` incl. referrals ₹${refAmount}` : ''}`, req.user.id, row.franchise_id]
    );
    await conn.commit();
    res.json({ success: true, message: `Salary paid (₹${final})${include && refAmount ? ` including ₹${refAmount} referral earnings` : ''}` });
  } catch (err) {
    await conn.rollback();
    console.error('paySalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /salary/my — employee's own slips + referral earnings
exports.mySalary = async (req, res) => {
  try {
    const [slips] = await pool.query('SELECT * FROM staff_salary WHERE staff_id = ? ORDER BY month_year DESC LIMIT 24', [req.user.id]);
    await refreshPending(slips);
    const [refs] = await pool.query(
      "SELECT id, source_label, referred_customer_name, amount, status, paid_via, paid_at, created_at FROM referral_ledger WHERE referrer_type='staff' AND referrer_user_id = ? ORDER BY created_at DESC LIMIT 100",
      [req.user.id]
    );
    const [[u]] = await pool.query('SELECT salary_type, salary_rate, working_days_per_month, paid_leaves_per_month FROM users WHERE id = ?', [req.user.id]);
    res.json({ success: true, data: { salary_method: u, slips, referrals: refs } });
  } catch (err) {
    console.error('mySalary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.downloadSlip = async (req, res) => {
  try {
    // "my slip" route, or a staff/manager without Salary permission → only their own slip
    const ownOnly = (req.originalUrl || '').includes('/salary/my/')
      || ((req.user.role === 'manager' || req.user.role === 'staff') && !req.rbacGranted);
    const row = ownOnly
      ? (await pool.query('SELECT * FROM staff_salary WHERE id = ? AND staff_id = ?', [req.params.id, req.user.id]))[0][0]
      : await loadSlip(req, res, req.params.id);
    if (!row) { if (!res.headersSent) res.status(404).json({ success: false, error: 'Not found' }); return; }
    const { generateSalarySlipPDF } = require('../services/invoiceService');
    const { pdfBuffer, invoiceNumber } = await generateSalarySlipPDF(row.id);
    res.set({ 'Content-Type': 'application/pdf', 'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"` });
    res.send(pdfBuffer);
  } catch (err) {
    console.error('Salary slip PDF error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate salary slip' });
  }
};
