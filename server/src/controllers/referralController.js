/**
 * Referrals module — who referred whom, how much they earned, paid / unpaid.
 * Staff earnings can also be paid inside salary (salaryController.paySalary), which marks rows paid here.
 */
const pool = require('../config/db');
const referralService = require('../services/referralService');
const { normalizeMobile } = require('../utils/validators');

const fidOf = (req) => Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;

// GET /referrals?status=&referrer_type=&search=&from=&to=
exports.list = async (req, res) => {
  try {
    const where = ['rl.franchise_id = ?'];
    const params = [fidOf(req)];
    const { status, referrer_type, search, from, to, referrer_user_id } = req.query;
    if (status && status !== 'all') { where.push('rl.status = ?'); params.push(status); }
    if (referrer_type && referrer_type !== 'all') { where.push('rl.referrer_type = ?'); params.push(referrer_type); }
    if (referrer_user_id) { where.push('rl.referrer_user_id = ?'); params.push(referrer_user_id); }
    if (from) { where.push('DATE(rl.created_at) >= ?'); params.push(from); }
    if (to) { where.push('DATE(rl.created_at) <= ?'); params.push(to); }
    if (search) {
      where.push('(rl.referrer_name LIKE ? OR rl.referrer_mobile LIKE ? OR rl.referred_customer_name LIKE ? OR rl.source_label LIKE ?)');
      const t = `%${search}%`; params.push(t, t, t, t);
    }
    const [rows] = await pool.query(
      `SELECT rl.*, s.month_year AS salary_month FROM referral_ledger rl
       LEFT JOIN staff_salary s ON s.id = rl.salary_id
       WHERE ${where.join(' AND ')} ORDER BY rl.created_at DESC LIMIT 1000`,
      params
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('referrals list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /referrals/summary — totals + leaderboards
exports.summary = async (req, res) => {
  try {
    const fid = fidOf(req);
    const [[totals]] = await pool.query(
      `SELECT COUNT(*) AS total_referrals,
              COALESCE(SUM(CASE WHEN status <> 'cancelled' THEN bill_amount END),0) AS business_generated,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END),0) AS paid_amount,
              COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount END),0) AS unpaid_amount,
              COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END),0) AS pending_amount
       FROM referral_ledger WHERE franchise_id = ?`, [fid]);
    const [top] = await pool.query(
      `SELECT referrer_type, referrer_user_id, referrer_name, MAX(referrer_mobile) AS referrer_mobile,
              COUNT(*) AS referrals, COALESCE(SUM(bill_amount),0) AS business,
              COALESCE(SUM(CASE WHEN status IN ('unpaid','paid') THEN amount END),0) AS earned,
              COALESCE(SUM(CASE WHEN status = 'paid' THEN amount END),0) AS paid,
              COALESCE(SUM(CASE WHEN status = 'unpaid' THEN amount END),0) AS unpaid
       FROM referral_ledger WHERE franchise_id = ? AND status <> 'cancelled'
       GROUP BY referrer_type, referrer_user_id, referrer_name
       ORDER BY earned DESC, referrals DESC LIMIT 50`, [fid]);
    const [topCustomers] = await pool.query(
      `SELECT referred_customer_id, MAX(referred_customer_name) AS customer_name, COUNT(*) AS visits, COALESCE(SUM(bill_amount),0) AS spent
       FROM referral_ledger WHERE franchise_id = ? AND status <> 'cancelled' AND referred_customer_id IS NOT NULL
       GROUP BY referred_customer_id ORDER BY spent DESC LIMIT 20`, [fid]);
    res.json({ success: true, data: { totals, top_referrers: top, top_referred_customers: topCustomers } });
  } catch (err) {
    console.error('referrals summary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

async function loadRow(req, res, id) {
  const [[row]] = await pool.query('SELECT * FROM referral_ledger WHERE id = ?', [id]);
  if (!row) { res.status(404).json({ success: false, error: 'Referral not found' }); return null; }
  if (req.user.role !== 'super_admin' && Number(row.franchise_id) !== fidOf(req)) {
    res.status(403).json({ success: false, error: 'Not your franchise' }); return null;
  }
  return row;
}

// POST /referrals/pay { ids: [], paid_via }
exports.markPaid = async (req, res) => {
  try {
    const ids = (Array.isArray(req.body.ids) ? req.body.ids : [req.body.id]).map(Number).filter(Boolean);
    const via = ['cash', 'upi', 'bank', 'wallet'].includes(req.body.paid_via) ? req.body.paid_via : 'cash';
    if (!ids.length) return res.status(400).json({ success: false, error: 'Select at least one referral' });
    const [rows] = await pool.query('SELECT id, franchise_id, status, amount, referrer_type, referrer_user_id FROM referral_ledger WHERE id IN (?)', [ids]);
    const fid = fidOf(req);
    const payable = rows.filter(r => r.status === 'unpaid' && (req.user.role === 'super_admin' || Number(r.franchise_id) === fid));
    if (!payable.length) return res.status(400).json({ success: false, error: 'Only unpaid referrals (bill completed) can be marked paid' });
    await pool.query(
      "UPDATE referral_ledger SET status='paid', paid_at=NOW(), paid_via=?, paid_by=? WHERE id IN (?)",
      [via, req.user.id, payable.map(r => r.id)]
    );
    // Wallet payout → credit the customer's wallet
    if (via === 'wallet') {
      for (const r of payable.filter(x => x.referrer_type === 'customer' && x.referrer_user_id)) {
        try {
          await pool.query(
            // same wallet the customer spends from at billing (payments → wallet_spend)
            'INSERT INTO wallets (customer_id, balance, total_earned) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE balance = balance + VALUES(balance), total_earned = total_earned + VALUES(total_earned)',
            [r.referrer_user_id, r.amount, r.amount]
          );
        } catch (e) { console.warn('[referrals] wallet credit skipped:', e.message); }
      }
    }
    const total = payable.reduce((s, r) => s + Number(r.amount), 0);
    await pool.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES ('referral_payout', ?, ?, 'out', ?, CURDATE(), ?, ?)`,
      [payable[0].id, total, `Referral payout (${payable.length}) via ${via}`, req.user.id, fid]
    );
    res.json({ success: true, message: `${payable.length} referral(s) marked paid — ₹${total.toFixed(2)}` });
  } catch (err) {
    console.error('referrals markPaid error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /referrals/:id/unpay — undo a payout made outside salary
exports.markUnpaid = async (req, res) => {
  try {
    const row = await loadRow(req, res, req.params.id);
    if (!row) return;
    if (row.status !== 'paid') return res.status(422).json({ success: false, error: 'Referral is not paid' });
    if (row.paid_via === 'salary') return res.status(422).json({ success: false, error: 'Paid through salary — undo it from the salary record' });
    // Wallet payout: take the money back from the customer's wallet (only if it is still there)
    if (row.paid_via === 'wallet' && row.referrer_type === 'customer' && row.referrer_user_id) {
      const [w] = await pool.query(
        'UPDATE wallets SET balance = balance - ?, total_earned = GREATEST(0, total_earned - ?) WHERE customer_id = ? AND balance >= ?',
        [row.amount, row.amount, row.referrer_user_id, row.amount]);
      if (!w.affectedRows) return res.status(422).json({ success: false, error: 'The customer has already spent this wallet money — it cannot be undone' });
    }
    await pool.query("UPDATE referral_ledger SET status='unpaid', paid_at=NULL, paid_via=NULL, paid_by=NULL WHERE id = ?", [row.id]);
    // Accounts: cancel the money-out entry (a minus row, so a batch payout of several referrals stays right)
    await pool.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES ('referral_payout', ?, ?, 'out', ?, CURDATE(), ?, ?)`,
      [row.id, -Number(row.amount), `Undo referral payout #${row.id}`, req.user.id, Number(row.franchise_id) || fidOf(req)]);
    res.json({ success: true, message: 'Marked unpaid' });
  } catch (err) {
    console.error('referrals markUnpaid error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /referrals — manual referral (e.g. corporate tie-up) { referrer_type, referrer_user_id|referrer_name, referrer_mobile, amount, notes, customer_id }
exports.createManual = async (req, res) => {
  try {
    const fid = fidOf(req);
    const referrer = await referralService.resolveReferrer(pool, req.body, fid, req.body.customer_id);
    if (!referrer) return res.status(400).json({ success: false, error: 'Referrer is required' });
    const amount = Number(req.body.amount);
    if (!(amount > 0)) return res.status(400).json({ success: false, error: 'Amount must be greater than 0' });
    let customerName = null;
    if (req.body.customer_id) {
      const [[c]] = await pool.query("SELECT name FROM users WHERE id = ? AND role = 'customer'", [req.body.customer_id]);
      customerName = c?.name || null;
    }
    const [ins] = await pool.query(
      `INSERT INTO referral_ledger (franchise_id, referrer_type, referrer_user_id, referrer_name, referrer_mobile, referred_customer_id,
         referred_customer_name, source_type, source_id, source_label, bill_amount, reward_type, reward_rate, amount, status, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'manual', NULL, ?, 0, 'fixed', ?, ?, 'unpaid', ?, ?)`,
      [fid, referrer.referrer_type, referrer.referrer_user_id, referrer.referrer_name, referrer.referrer_mobile,
        req.body.customer_id || null, customerName, String(req.body.notes || 'Manual referral').slice(0, 150), amount, amount,
        req.body.notes || null, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: ins.insertId }, message: 'Referral added' });
  } catch (err) {
    if (err.status === 400) return res.status(400).json({ success: false, error: err.message });
    console.error('referrals createManual error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET/PUT /referrals/settings — reward per referrer type (fixed ₹ or % of bill)
exports.getSettings = async (req, res) => {
  try {
    res.json({ success: true, data: await referralService.getRewardConfig(fidOf(req)) });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const fid = fidOf(req);
    for (const kind of ['staff', 'customer', 'external']) {
      const c = req.body[kind];
      if (!c) continue;
      const type = c.type === 'percent' ? 'percent' : 'fixed';
      const value = Number(c.value);
      if (isNaN(value) || value < 0 || (type === 'percent' && value > 100)) {
        return res.status(400).json({ success: false, error: `Invalid reward for ${kind}` });
      }
      for (const [k, v] of [[`referral_${kind}_reward_type`, type], [`referral_${kind}_reward_value`, String(value)]]) {
        await pool.query('INSERT INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)', [fid, k, v]);
      }
    }
    res.json({ success: true, message: 'Referral rewards saved (applies to new and unpaid referrals as bills are updated)' });
  } catch (err) {
    console.error('referrals updateSettings error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /referrals/my — customer / staff: own referral code + earnings
exports.mine = async (req, res) => {
  try {
    const type = req.user.role === 'customer' ? 'customer' : 'staff';
    const [rows] = await pool.query(
      `SELECT id, source_label, referred_customer_id, referred_customer_name, bill_amount, amount, status, paid_via, paid_at, created_at
       FROM referral_ledger WHERE referrer_type = ? AND referrer_user_id = ? AND status <> 'cancelled' ORDER BY created_at DESC LIMIT 200`,
      [type, req.user.id]
    );
    let code = null;
    if (type === 'customer') {
      const [[rc]] = await pool.query('SELECT code FROM referral_codes WHERE customer_id = ? AND is_active = 1 LIMIT 1', [req.user.id]);
      code = rc?.code || null;
      if (!code) {
        code = 'O3' + require('crypto').randomBytes(3).toString('hex').toUpperCase();
        await pool.query('INSERT INTO referral_codes (customer_id, code, reward_points, max_uses, current_uses, is_active) VALUES (?, ?, 0, 1000, 0, 1)', [req.user.id, code]);
        await pool.query('UPDATE users SET referral_code = ? WHERE id = ?', [code, req.user.id]);
      }
    }
    // Friends referred with the form, and how far each has got
    const [inv] = await pool.query(
      `SELECT ri.id, ri.friend_name, ri.friend_mobile, ri.car_brand, ri.car_model, ri.car_colour, ri.created_at,
              (SELECT u.id FROM users u WHERE u.mobile = ri.friend_mobile AND u.role = 'customer' AND u.is_deleted = 0 LIMIT 1) AS customer_id
       FROM referral_invites ri WHERE ri.referrer_type = ? AND ri.referrer_user_id = ? ORDER BY ri.id DESC LIMIT 100`,
      [type, req.user.id]
    ).catch(() => [[]]);
    const invites = inv.map(i => {
      const earned = i.customer_id && rows.find(r => Number(r.referred_customer_id) === Number(i.customer_id));
      const stage = earned ? (earned.status === 'pending' ? 'in_service' : 'service_done') : (i.customer_id ? 'joined' : 'invited');
      return { id: i.id, friend_name: i.friend_name, friend_mobile: i.friend_mobile, car: [i.car_colour, i.car_brand, i.car_model].filter(Boolean).join(' '),
        created_at: i.created_at, stage, amount: earned ? Number(earned.amount) : 0, paid: earned?.status === 'paid' };
    });
    const sum = (st) => rows.filter(r => r.status === st).reduce((s, r) => s + Number(r.amount), 0);
    res.json({ success: true, data: { code, invites, referrals: rows, earned: sum('paid') + sum('unpaid'), paid: sum('paid'), unpaid: sum('unpaid'), pending: sum('pending') } });
  } catch (err) {
    console.error('referrals mine error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// POST /referrals/invite — customer or employee refers a friend: name, mobile, car name, colour, model.
// Creates a lead for the studio. The referrer earns only once the friend's first service is done.
exports.invite = async (req, res) => {
  try {
    const type = req.user.role === 'customer' ? 'customer' : 'staff';
    const fid = Number(req.user.franchise_id) || Number(req.franchiseId) || 1;
    const b = req.body || {};
    const name = String(b.friend_name || '').trim();
    const mobile = normalizeMobile(b.friend_mobile || '');
    const brand = String(b.car_brand || '').trim().slice(0, 80);
    const model = String(b.car_model || '').trim().slice(0, 80);
    const colour = String(b.car_colour || '').trim().slice(0, 40);
    if (!name) return res.status(400).json({ success: false, error: "Enter your friend's name" });
    if (!/^[6-9]\d{9}$/.test(mobile)) return res.status(400).json({ success: false, error: 'Enter a valid 10-digit mobile number' });
    if (!brand || !model) return res.status(400).json({ success: false, error: 'Enter the car name and model' });
    if (!colour) return res.status(400).json({ success: false, error: 'Enter the car colour' });

    const [[me]] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [req.user.id]);
    if (me && normalizeMobile(me.mobile) === mobile) return res.status(400).json({ success: false, error: "You can't refer yourself" });
    const [[existing]] = await pool.query(
      `SELECT u.id FROM users u WHERE u.mobile = ? AND u.role = 'customer' AND u.is_deleted = 0
         AND EXISTS (SELECT 1 FROM job_carts jc JOIN vehicles v ON v.id = jc.vehicle_id WHERE v.customer_id = u.id)`, [mobile]);
    if (existing) return res.status(409).json({ success: false, error: 'This person is already our customer, so the referral can’t be counted' });
    const [[dup]] = await pool.query('SELECT id FROM referral_invites WHERE friend_mobile = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY) LIMIT 1', [mobile]);
    if (dup) return res.status(409).json({ success: false, error: 'Someone has already referred this number' });

    // A lead the front desk can follow up (Leads / WhatsApp inbox)
    const car = [colour, brand, model].join(' ');
    let leadId = null;
    try {
      const [[lead]] = await pool.query('SELECT id FROM leads WHERE franchise_id = ? AND phone LIKE ? LIMIT 1', [fid, `%${mobile}`]);
      if (lead) leadId = lead.id;
      else {
        const [ins] = await pool.query(
          `INSERT INTO leads (franchise_id, phone, name, vehicle_model, stage, source, notes) VALUES (?, ?, ?, ?, 'new', 'referral', ?)`,
          [fid, `91${mobile}`, name.slice(0, 150), `${brand} ${model}`.slice(0, 100), `Referred by ${me?.name || 'a customer'} (${type}). Car: ${car}`.slice(0, 1000)]
        );
        leadId = ins.insertId;
      }
    } catch (e) { console.warn('[referral invite] lead not created:', e.message); }

    const [r] = await pool.query(
      `INSERT INTO referral_invites (franchise_id, referrer_type, referrer_user_id, friend_name, friend_mobile, car_brand, car_model, car_colour, lead_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [fid, type, req.user.id, name.slice(0, 150), mobile, brand, model, colour, leadId]
    );
    res.status(201).json({ success: true, data: { id: r.insertId }, message: 'Thanks! Our team will contact your friend. You earn once their first service is done.' });
  } catch (err) {
    console.error('referral invite error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// GET /referrals/validate/:code — public check of a customer referral code (registration form)
exports.validateCode = async (req, res) => {
  try {
    const [[rc]] = await pool.query(
      "SELECT rc.code, u.name FROM referral_codes rc JOIN users u ON u.id = rc.customer_id WHERE rc.code = ? AND rc.is_active = 1",
      [String(req.params.code || '').trim().toUpperCase()]
    );
    if (!rc) return res.status(404).json({ success: false, error: 'Invalid referral code' });
    res.json({ success: true, data: { code: rc.code, referrer_first_name: (rc.name || '').split(' ')[0] } });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
