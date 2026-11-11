const pool = require('../config/db');

// ─── GET INCENTIVE RULES (Franchise Scoped) ─────────────────────
exports.getRules = async (req, res) => {
  try {
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('franchise_id')
      : { clause: ' AND (franchise_id = ? OR franchise_id IS NULL)', params: [req.franchiseId || 1] };

    const [rules] = await pool.query(
      `SELECT * FROM incentive_rules WHERE 1=1 ${fCond.clause} ORDER BY is_active DESC, id ASC`,
      fCond.params
    );

    res.json({ success: true, data: rules });
  } catch (err) {
    console.error('getRules error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch incentive rules' });
  }
};

// ─── CREATE INCENTIVE RULE ──────────────────────────────────────
exports.createRule = async (req, res) => {
  try {
    const {
      rule_name,
      service_id,
      rule_type = 'percentage',
      rule_value = 5.0,
      min_job_amount = 0.0,
      lead_technician_share_pct = 50.0,
      team_share_pct = 40.0,
      manager_share_pct = 10.0,
      is_active = 1
    } = req.body;

    if (!rule_name || !rule_name.trim()) {
      return res.status(400).json({ success: false, error: 'Rule name is required' });
    }

    const franchiseId = req.franchiseId || req.body.franchise_id || 1;

    const [result] = await pool.query(
      `INSERT INTO incentive_rules 
       (franchise_id, rule_name, service_id, rule_type, rule_value, min_job_amount, lead_technician_share_pct, team_share_pct, manager_share_pct, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        franchiseId,
        rule_name.trim(),
        service_id || null,
        rule_type,
        parseFloat(rule_value) || 0,
        parseFloat(min_job_amount) || 0,
        parseFloat(lead_technician_share_pct) || 0,
        parseFloat(team_share_pct) || 0,
        parseFloat(manager_share_pct) || 0,
        is_active ? 1 : 0
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Incentive rule created successfully',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('createRule error:', err);
    res.status(500).json({ success: false, error: 'Failed to create incentive rule' });
  }
};

// ─── UPDATE INCENTIVE RULE ──────────────────────────────────────
exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      service_id,
      rule_type,
      rule_value,
      min_job_amount,
      lead_technician_share_pct,
      team_share_pct,
      manager_share_pct,
      is_active
    } = req.body;

    const [existing] = await pool.query('SELECT franchise_id FROM incentive_rules WHERE id = ?', [id]);
    if (!existing.length) {
      return res.status(404).json({ success: false, error: 'Rule not found' });
    }

    if (!req.isSuperAdmin && existing[0].franchise_id && req.franchiseId && parseInt(existing[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Rule belongs to another franchise' });
    }

    await pool.query(
      `UPDATE incentive_rules SET
        rule_name = COALESCE(?, rule_name),
        service_id = ?,
        rule_type = COALESCE(?, rule_type),
        rule_value = COALESCE(?, rule_value),
        min_job_amount = COALESCE(?, min_job_amount),
        lead_technician_share_pct = COALESCE(?, lead_technician_share_pct),
        team_share_pct = COALESCE(?, team_share_pct),
        manager_share_pct = COALESCE(?, manager_share_pct),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        rule_name ? rule_name.trim() : null,
        service_id !== undefined ? service_id : null,
        rule_type || null,
        rule_value !== undefined ? parseFloat(rule_value) : null,
        min_job_amount !== undefined ? parseFloat(min_job_amount) : null,
        lead_technician_share_pct !== undefined ? parseFloat(lead_technician_share_pct) : null,
        team_share_pct !== undefined ? parseFloat(team_share_pct) : null,
        manager_share_pct !== undefined ? parseFloat(manager_share_pct) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    res.json({ success: true, message: 'Incentive rule updated successfully' });
  } catch (err) {
    console.error('updateRule error:', err);
    res.status(500).json({ success: false, error: 'Failed to update incentive rule' });
  }
};

// ─── PER-EMPLOYEE, PER-PERIOD INCENTIVE REPORT ──────────────────
exports.getIncentiveReport = async (req, res) => {
  try {
    const now = new Date();
    const period_month = req.query.period_month ? parseInt(req.query.period_month, 10) : now.getMonth() + 1;
    const period_year = req.query.period_year ? parseInt(req.query.period_year, 10) : now.getFullYear();
    const user_id = req.query.user_id ? parseInt(req.query.user_id, 10) : null;

    let whereClause = 'WHERE s.period_month = ? AND s.period_year = ?';
    const params = [period_month, period_year];

    // Franchise scoping
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('s.franchise_id')
      : { clause: ' AND (s.franchise_id = ? OR s.franchise_id IS NULL)', params: [req.franchiseId || 1] };
    whereClause += fCond.clause;
    params.push(...fCond.params);

    if (user_id) {
      whereClause += ' AND s.user_id = ?';
      params.push(user_id);
    }

    const [splits] = await pool.query(
      `SELECT s.*, 
              u.name AS user_name, u.mobile AS user_mobile, u.role AS user_role,
              jc.visit_date, jc.invoice_number, jc.total_amount AS job_total_amount, jc.referral_person,
              v.registration_no, v.brand, v.model
       FROM incentive_splits s
       JOIN users u ON s.user_id = u.id
       JOIN job_carts jc ON s.job_cart_id = jc.id
       JOIN vehicles v ON jc.vehicle_id = v.id
       ${whereClause}
       ORDER BY s.created_at DESC`,
      params
    );

    // Summary calculations
    let totalIncentive = 0;
    const uniqueEmployees = new Set();
    const uniqueJobs = new Set();
    const employeeMap = {};

    splits.forEach(s => {
      const amt = parseFloat(s.amount) || 0;
      totalIncentive += amt;
      uniqueEmployees.add(s.user_id);
      uniqueJobs.add(s.job_cart_id);

      if (!employeeMap[s.user_id]) {
        employeeMap[s.user_id] = {
          user_id: s.user_id,
          user_name: s.user_name,
          user_mobile: s.user_mobile,
          user_role: s.user_role,
          total_amount: 0,
          jobs_count: 0,
          job_ids: new Set(),
          roles_breakdown: {
            lead_technician: 0,
            team_member: 0,
            handling_manager: 0
          }
        };
      }

      employeeMap[s.user_id].total_amount += amt;
      employeeMap[s.user_id].job_ids.add(s.job_cart_id);
      if (employeeMap[s.user_id].roles_breakdown[s.role_in_job] !== undefined) {
        employeeMap[s.user_id].roles_breakdown[s.role_in_job] += amt;
      }
    });

    const perEmployee = Object.values(employeeMap).map(e => ({
      user_id: e.user_id,
      user_name: e.user_name,
      user_mobile: e.user_mobile,
      user_role: e.user_role,
      total_amount: parseFloat(e.total_amount.toFixed(2)),
      jobs_count: e.job_ids.size,
      roles_breakdown: {
        lead_technician: parseFloat(e.roles_breakdown.lead_technician.toFixed(2)),
        team_member: parseFloat(e.roles_breakdown.team_member.toFixed(2)),
        handling_manager: parseFloat(e.roles_breakdown.handling_manager.toFixed(2))
      }
    }));

    res.json({
      success: true,
      data: {
        period: { month: period_month, year: period_year },
        summary: {
          total_incentive: parseFloat(totalIncentive.toFixed(2)),
          total_jobs: uniqueJobs.size,
          total_employees: uniqueEmployees.size
        },
        per_employee: perEmployee,
        splits: splits
      }
    });
  } catch (err) {
    console.error('getIncentiveReport error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate incentive report' });
  }
};

// ─── UPDATE SPLIT STATUS (Approve / Pay) ─────────────────────────
exports.updateSplitStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;
    if (!['pending', 'approved', 'paid'].includes(status)) {
      return res.status(400).json({ success: false, error: 'Invalid status' });
    }

    const [existing] = await pool.query('SELECT franchise_id FROM incentive_splits WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Split record not found' });

    if (!req.isSuperAdmin && existing[0].franchise_id && req.franchiseId && parseInt(existing[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Split belongs to another franchise' });
    }

    await pool.query('UPDATE incentive_splits SET status = ? WHERE id = ?', [status, id]);
    res.json({ success: true, message: `Incentive split marked as ${status}` });
  } catch (err) {
    console.error('updateSplitStatus error:', err);
    res.status(500).json({ success: false, error: 'Failed to update split status' });
  }
};

// ─── SLAB INCENTIVES: complaints + rate card ───
const engine = require('../services/incentiveEngine');
const fidOfReq = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;

// POST /incentives/complaints { job_cart_id | booking_id, reason }
exports.logComplaint = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const jobCartId = req.body.job_cart_id ? Number(req.body.job_cart_id) : null;
    const bookingId = !jobCartId && req.body.booking_id ? Number(req.body.booking_id) : null;
    const reason = String(req.body.reason || '').trim();
    if (!jobCartId && !bookingId) return res.status(400).json({ success: false, error: 'Choose the job card or quick wash' });
    if (reason.length < 3) return res.status(400).json({ success: false, error: 'Write what the complaint is about' });
    const fid = fidOfReq(req);
    const [[src]] = jobCartId
      ? await conn.query('SELECT id, franchise_id FROM job_carts WHERE id = ?', [jobCartId])
      : await conn.query('SELECT id, franchise_id FROM bookings WHERE id = ?', [bookingId]);
    if (!src || (req.user.role !== 'super_admin' && Number(src.franchise_id || 1) !== fid)) return res.status(404).json({ success: false, error: 'Not found' });
    const [[dup]] = await conn.query(`SELECT id FROM job_complaints WHERE ${jobCartId ? 'job_cart_id' : 'booking_id'} = ?`, [jobCartId || bookingId]);
    if (dup) return res.status(409).json({ success: false, error: 'A complaint is already logged for this vehicle visit' });

    await conn.beginTransaction();
    const [ins] = await conn.query('INSERT INTO job_complaints (franchise_id, job_cart_id, booking_id, reason, logged_by) VALUES (?, ?, ?, ?, ?)',
      [src.franchise_id || 1, jobCartId, bookingId, reason.slice(0, 500), req.user.id]);
    const affected = await engine.applyComplaint(conn, { complaintId: ins.insertId, jobCartId, bookingId });
    await conn.commit();
    const msg = affected.length
      ? affected.map(a => `${a.name}: ₹${a.withheld} incentive withheld${a.salary_deducted ? ` and ₹${a.withheld} deducted from salary (complaint #${a.complaint_number} this month)` : ` (complaint #${a.complaint_number} this month)`}`).join('; ')
      : 'Complaint logged. No incentive had been given for this vehicle.';
    res.status(201).json({ success: true, message: msg, data: { id: ins.insertId, affected } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('logComplaint error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  } finally {
    conn.release();
  }
};

// GET /incentives/complaints?month=2026-11
exports.listComplaints = async (req, res) => {
  try {
    const [y, m] = String(req.query.month || new Date().toISOString().slice(0, 7)).split('-').map(Number);
    const [rows] = await pool.query(
      `SELECT c.*, u.name AS logged_by_name,
              (SELECT GROUP_CONCAT(DISTINCT s.user_name SEPARATOR ', ') FROM incentive_splits s WHERE s.complaint_id = c.id) AS staff,
              (SELECT COALESCE(SUM(s.penalty_amount), 0) FROM incentive_splits s WHERE s.complaint_id = c.id) AS salary_deduction
       FROM job_complaints c LEFT JOIN users u ON u.id = c.logged_by
       WHERE c.franchise_id = ? AND YEAR(c.created_at) = ? AND MONTH(c.created_at) = ? ORDER BY c.id DESC`,
      [fidOfReq(req), y, m]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('listComplaints error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /incentives/slabs — this studio's rate card
exports.getSlabs = async (req, res) => {
  res.json({ success: true, data: await engine.getSlabs(pool, fidOfReq(req)), free_complaints: engine.FREE_COMPLAINTS });
};

// PUT /incentives/slabs { washing: { car: [{upto, amount}], bike: [...] }, ... }
exports.updateSlabs = async (req, res) => {
  try {
    const out = {};
    for (const type of engine.TYPES) {
      const t = req.body[type];
      if (!t) continue;
      out[type] = {};
      for (const vc of ['car', 'bike']) {
        if (!Array.isArray(t[vc])) continue;
        const tiers = t[vc].map(x => ({ upto: x.upto === null || x.upto === '' || x.upto === undefined ? null : Number(x.upto), amount: Number(x.amount) }));
        if (tiers.some(x => !(x.amount >= 0) || (x.upto !== null && !(x.upto > 0)))) return res.status(400).json({ success: false, error: `Check the ${type} ${vc} amounts` });
        out[type][vc] = tiers;
      }
    }
    await pool.query(
      `INSERT INTO settings (franchise_id, key_name, value) VALUES (?, 'incentive_slabs', ?)
       ON DUPLICATE KEY UPDATE value = VALUES(value)`, [fidOfReq(req), JSON.stringify(out)]);
    res.json({ success: true, message: 'Incentive rates saved' });
  } catch (err) {
    console.error('updateSlabs error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
