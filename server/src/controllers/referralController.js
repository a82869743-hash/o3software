const pool = require('../config/db');

// ─── Generate/Get Referral Code ──────────────────────────
exports.getReferralCode = async (req, res, next) => {
  try {
    let customer_id;
    if (req.user && req.user.role === 'customer') {
      if (req.params.customer_id !== 'mine' && parseInt(req.params.customer_id) !== parseInt(req.user.id)) {
        return res.status(403).json({ success: false, error: "Access denied — Cannot view another customer's referral code" });
      }
      customer_id = req.user.id;
    } else {
      customer_id = req.params.customer_id === 'mine' ? req.user.id : req.params.customer_id;
    }

    let [rows] = await pool.query('SELECT * FROM referral_codes WHERE customer_id = ?', [customer_id]);
    
    if (!rows.length) {
      // Generate a new code: e.g., GK-{hash}
      const code = 'GK' + Math.random().toString(36).substring(2, 8).toUpperCase();
      const [insert] = await pool.query(
        'INSERT INTO referral_codes (customer_id, code) VALUES (?, ?)',
        [customer_id, code]
      );
      [rows] = await pool.query('SELECT * FROM referral_codes WHERE id = ?', [insert.insertId]);
    }
    
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── Apply Referral Code ─────────────────────────────────
exports.applyReferral = async (req, res, next) => {
  let connection;
  try {
    const { code, new_customer_id } = req.body;
    connection = await pool.getConnection();
    await connection.beginTransaction();
    
    const [codes] = await connection.query('SELECT * FROM referral_codes WHERE code = ? AND is_active = 1', [code]);
    if (!codes.length) {
      await connection.rollback();
      return res.status(404).json({ success: false, error: 'Invalid or inactive referral code' });
    }
    const refCode = codes[0];

    if (refCode.customer_id == new_customer_id) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'Cannot refer yourself' });
    }

    if (refCode.current_uses >= refCode.max_uses) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'Referral code usage limit reached' });
    }

    // Check if already referred
    const [existing] = await connection.query('SELECT id FROM referral_rewards WHERE referred_id = ?', [new_customer_id]);
    if (existing.length) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'Customer has already used a referral code' });
    }

    // Log the referral reward (pending state until first purchase)
    await connection.query(
      `INSERT INTO referral_rewards (referrer_id, referred_id, referral_code, reward_type, reward_value, status) 
       VALUES (?, ?, ?, 'points', ?, 'pending')`,
      [refCode.customer_id, new_customer_id, code, refCode.reward_points]
    );

    // Update uses
    await connection.query('UPDATE referral_codes SET current_uses = current_uses + 1 WHERE id = ?', [refCode.id]);

    await connection.commit();
    res.json({ success: true, message: 'Referral code applied successfully' });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch(e) {}
    }
    next(err);
  } finally {
    if (connection) connection.release();
  }
};

// ─── Get Referral History ───────────────────────────────
exports.getHistory = async (req, res, next) => {
  try {
    let customer_id;
    if (req.user && req.user.role === 'customer') {
      if (req.params.customer_id !== 'mine' && parseInt(req.params.customer_id) !== parseInt(req.user.id)) {
        return res.status(403).json({ success: false, error: "Access denied — Cannot view another customer's referral history" });
      }
      customer_id = req.user.id;
    } else {
      customer_id = req.params.customer_id === 'mine' ? req.user.id : req.params.customer_id;
    }

    const [rows] = await pool.query(
      `SELECT r.*, u.name as referred_name 
       FROM referral_rewards r 
       LEFT JOIN users u ON r.referred_id = u.id 
       WHERE r.referrer_id = ? 
       ORDER BY r.created_at DESC`,
      [customer_id]
    );
    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};
