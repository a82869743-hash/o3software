const pool = require('../config/db');

// ─── LIST CUSTOMER REWARDS ─────────────────────────────
exports.list = async (req, res) => {
  try {
    let { customer_id, redeemed } = req.query;

    // IDOR Protection: Customers can only view their own rewards
    if (req.user && req.user.role === 'customer') {
      customer_id = req.user.id;
    }

    let where = '1=1';
    const params = [];

    if (customer_id) { where += ' AND cr.customer_id = ?'; params.push(customer_id); }
    if (redeemed !== undefined) { where += ' AND cr.redeemed = ?'; params.push(redeemed === 'true' ? 1 : 0); }

    const [rows] = await pool.query(
      `SELECT cr.*, u.name as customer_name, u.mobile as customer_mobile 
       FROM customer_rewards cr 
       LEFT JOIN users u ON u.id = cr.customer_id 
       WHERE ${where} 
       ORDER BY cr.created_at DESC`,
      params
    );
    res.json({ success: true, data: rows || [] });
  } catch (err) {
    console.error('Customer rewards list error:', err);
    res.json({ success: true, data: [] });
  }
};

// ─── AWARD WELCOME REWARD INTERNAL ──────────────────────
const awardWelcomeRewardInternal = async (customerId, conn = pool) => {
  if (!customerId) throw new Error('Customer ID required');

  // Check if already awarded
  const [existing] = await conn.query('SELECT id FROM customer_rewards WHERE customer_id = ? AND reward_type = "welcome"', [customerId]);
  if (existing.length) return null;

  // Ensure loyalty record exists with 0 bonus credits and 0 free washes
  const [existingLoyalty] = await conn.query('SELECT id FROM loyalty WHERE customer_id = ?', [customerId]);
  if (existingLoyalty.length === 0) {
    await conn.query('INSERT INTO loyalty (customer_id, credits, free_washes) VALUES (?, 0, 0)', [customerId]);
  }

  const [ins] = await conn.query(`
    INSERT INTO customer_rewards (customer_id, reward_type, points_awarded, discount_pct, description, redeemed)
    VALUES (?, 'welcome', 100, 10, 'Welcome to O3 Car Spaa reward: 100 bonus points & 10% discount', 0)
  `, [customerId]);

  return ins.insertId;
};
exports.awardWelcomeRewardInternal = awardWelcomeRewardInternal;

// ─── AWARD WELCOME REWARD ───────────────────────────────
exports.awardWelcome = async (req, res) => {
  try {
    const { customer_id } = req.body;
    if (!customer_id) return res.status(400).json({ success: false, error: 'Customer ID required' });
    // the reward must go to a customer of this studio (not a staff member, not another studio)
    const [[cust]] = await pool.query(
      "SELECT id FROM users WHERE id = ? AND role = 'customer' AND COALESCE(is_deleted, 0) = 0" +
      (req.user.role === 'super_admin' ? '' : ' AND COALESCE(franchise_id, 1) = ?'),
      req.user.role === 'super_admin' ? [customer_id] : [customer_id, Number(req.franchiseId) || Number(req.user.franchise_id) || 1]);
    if (!cust) return res.status(404).json({ success: false, error: 'Customer not found' });

    const insertId = await awardWelcomeRewardInternal(customer_id);
    if (!insertId) {
      return res.status(400).json({ success: false, error: 'Welcome reward already awarded' });
    }

    res.status(201).json({ success: true, message: 'Welcome reward awarded', data: { id: insertId } });
  } catch (err) {
    console.error('Customer rewards awardWelcome error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── REDEEM REWARD ──────────────────────────────────────
exports.redeem = async (req, res) => {
  try {
    const { id } = req.params;
    const [existing] = await pool.query('SELECT * FROM customer_rewards WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Reward not found' });
    if (existing[0].redeemed) return res.status(400).json({ success: false, error: 'Reward already redeemed' });
    if (existing[0].expires_at && new Date(existing[0].expires_at) < new Date()) {
      return res.status(400).json({ success: false, error: 'Reward expired' });
    }

    // IDOR Protection: If customer, verify ownership
    if (req.user && req.user.role === 'customer' && existing[0].customer_id !== req.user.id) {
      return res.status(403).json({ success: false, error: 'You are not authorized to redeem this reward' });
    }

    if (req.user && req.user.role !== 'customer' && req.user.role !== 'super_admin') {
      const [[owner]] = await pool.query('SELECT franchise_id FROM users WHERE id = ?', [existing[0].customer_id]);
      if (owner && Number(owner.franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1)) {
        return res.status(404).json({ success: false, error: 'Reward not found' });
      }
    }

    // Mark used only if it is still unused — two taps at the same moment cannot both pass this.
    const [upd] = await pool.query('UPDATE customer_rewards SET redeemed = 1, redeemed_at = NOW() WHERE id = ? AND redeemed = 0', [id]);
    if (!upd.affectedRows) return res.status(400).json({ success: false, error: 'Reward already redeemed' });

    // Add the points to the customer's balance and the points history
    const pts = Number(existing[0].points_awarded) || 0;
    if (pts > 0) {
      await pool.query('INSERT INTO loyalty (customer_id, credits, free_washes, wax_count, points) VALUES (?, 0, 0, 0, ?) ON DUPLICATE KEY UPDATE points = points + VALUES(points)', [existing[0].customer_id, pts]);
      const [[bal]] = await pool.query('SELECT points FROM loyalty WHERE customer_id = ?', [existing[0].customer_id]);
      await pool.query(
        `INSERT INTO loyalty_transactions (customer_id, type, points, balance_after, description) VALUES (?, 'earn', ?, ?, ?)`,
        [existing[0].customer_id, pts, bal ? bal.points : pts, existing[0].description]
      );
    }

    res.json({ success: true, message: 'Reward redeemed successfully' });
  } catch (err) {
    console.error('Customer rewards redeem error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
