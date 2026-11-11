/**
 * ═══════════════════════════════════════════════════════════
 * LOYALTY CONTROLLER — Phase 2 Enhanced
 * ═══════════════════════════════════════════════════════════
 *
 * Features:
 *   - Configurable point earning ratio (from settings table)
 *   - Points earn/redeem/adjust with full transaction history
 *   - Points balance management
 *   - Backward-compatible with existing loyalty credits/free_washes
 *
 * Tables used:
 *   - loyalty (credits, free_washes, wax_count, points)
 *   - loyalty_transactions (earn/redeem/bonus/adjust/expire)
 *   - settings (loyalty_points_ratio, loyalty_point_value)
 */

const pool = require('../config/db');

// ─── HELPERS ─────────────────────────────────

/**
 * getLoyaltySettings — Fetch loyalty config from settings table
 */
async function getLoyaltySettings(conn, franchiseId = 1) {
  const db = conn || pool;
  // the studio's own values, falling back to the main studio's (studio rows come last, so they win)
  const fid = Number(franchiseId) || 1;
  const [settings] = await db.query(
    "SELECT key_name, value FROM settings WHERE key_name LIKE 'loyalty_%' AND franchise_id IN (1, ?) ORDER BY (franchise_id = ?) ASC",
    [fid, fid]
  );
  const config = {
    points_ratio: 100,   // ₹100 spent = 1 point
    min_redeem: 50,      // Minimum 50 points to redeem
    point_value: 1,      // 1 point = ₹1
    free_wash_points: 1000, // points a customer turns into 1 free wash
    enabled: true,
  };
  for (const s of settings) {
    if (s.key_name === 'loyalty_points_ratio') config.points_ratio = parseFloat(s.value) || 100;
    if (s.key_name === 'loyalty_min_redeem') config.min_redeem = parseFloat(s.value) || 50;
    if (s.key_name === 'loyalty_point_value') config.point_value = parseFloat(s.value) || 1;
    if (s.key_name === 'loyalty_free_wash_points') config.free_wash_points = parseInt(s.value, 10) || 1000;
    if (s.key_name === 'loyalty_enabled') config.enabled = s.value === '1';
  }
  return config;
}

/**
 * ensureLoyaltyRow — Ensures loyalty row exists for customer
 */
async function customerFid(db, customerId) {
  const [[u]] = await (db || pool).query('SELECT franchise_id FROM users WHERE id = ?', [customerId]);
  return Number(u?.franchise_id) || 1;
}

async function ensureLoyaltyRow(conn, customerId) {
  await conn.query(
    'INSERT IGNORE INTO loyalty (customer_id, credits, free_washes, wax_count, points) VALUES (?, 0, 0, 0, 0)',
    [customerId]
  );
}

// ═══════════════════════════════════════════════════════════
// GET LOYALTY — Customer's loyalty data
// GET /loyalty/mine or /loyalty/:customerId
// ═══════════════════════════════════════════════════════════
exports.get = async (req, res) => {
  try {
    const customerId = req.params.customerId || req.user.id;

    const [rows] = await pool.query(
      'SELECT * FROM loyalty WHERE customer_id = ?', [customerId]
    );

    if (!rows.length) {
      return res.json({
        success: true,
        data: { customer_id: customerId, credits: 0, free_washes: 0, wax_count: 0, points: 0 },
      });
    }

    // Also get loyalty settings for display
    const config = await getLoyaltySettings(null, await customerFid(pool, customerId));

    res.json({
      success: true,
      data: { ...rows[0], loyalty_settings: config },
    });
  } catch (err) {
    console.error('Get loyalty error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch loyalty data' });
  }
};

// ═══════════════════════════════════════════════════════════
// UPDATE LOYALTY — Admin manual adjust
// PATCH /loyalty/:customerId
// ═══════════════════════════════════════════════════════════
exports.update = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customerId } = req.params;
    const { credits, free_washes, wax_count, points, description } = req.body;
    for (const [k, v] of [['Credits', credits], ['Free washes', free_washes], ['Wax count', wax_count], ['Points', points]]) {
      if (v !== undefined && v !== null && !(Number.isInteger(Number(v)) && Number(v) >= 0)) {
        await conn.rollback();
        return res.status(400).json({ success: false, error: `${k} must be a whole number, 0 or more` });
      }
    }
    // loyalty belongs to customers of this studio only
    const [[lc]] = await conn.query('SELECT role, franchise_id FROM users WHERE id = ? AND is_deleted = 0', [customerId]);
    if (!lc || lc.role !== 'customer' || (req.user.role !== 'super_admin' && Number(lc.franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1))) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }
    await ensureLoyaltyRow(conn, customerId);

    // Get current values
    const [current] = await conn.query(
      'SELECT * FROM loyalty WHERE customer_id = ? FOR UPDATE', [customerId]
    );
    const cur = current[0] || { credits: 0, free_washes: 0, wax_count: 0, points: 0 };

    // Build update
    const updates = {};
    if (credits !== undefined) updates.credits = credits;
    if (free_washes !== undefined) updates.free_washes = free_washes;
    if (wax_count !== undefined) updates.wax_count = wax_count;
    if (points !== undefined) updates.points = points;

    if (Object.keys(updates).length === 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'No fields to update' });
    }

    const setClauses = Object.keys(updates).map(k => `${k} = ?`).join(', ');
    const values = Object.values(updates);

    await conn.query(
      `UPDATE loyalty SET ${setClauses} WHERE customer_id = ?`,
      [...values, customerId]
    );

    // Log point change in transactions
    if (points !== undefined && points !== cur.points) {
      const pointDiff = points - cur.points;
      await conn.query(
        `INSERT INTO loyalty_transactions
         (customer_id, type, points, balance_after, reference_type, description, created_by)
         VALUES (?, 'adjustment', ?, ?, 'manual', ?, ?)`,
        [customerId, pointDiff, points, description || 'Admin adjustment', req.user.id]
      );
    }

    await conn.commit();

    const [updated] = await pool.query('SELECT * FROM loyalty WHERE customer_id = ?', [customerId]);
    res.json({ success: true, data: updated[0], message: 'Loyalty updated' });
  } catch (err) {
    await conn.rollback();
    console.error('Update loyalty error:', err);
    res.status(500).json({ success: false, error: 'Failed to update loyalty' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// EARN POINTS — Called after invoice/payment
// POST /loyalty/earn (internal or admin)
// ═══════════════════════════════════════════════════════════
exports.earnPoints = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customer_id, amount, reference_type, reference_id, description } = req.body;
    if (!customer_id || !amount || amount <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'customer_id and positive amount required' });
    }
    const [[ec]] = await conn.query('SELECT role, franchise_id FROM users WHERE id = ? AND is_deleted = 0', [customer_id]);
    if (!ec || ec.role !== 'customer' || (req.user.role !== 'super_admin' && Number(ec.franchise_id || 1) !== (Number(req.franchiseId) || Number(req.user.franchise_id) || 1))) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Customer not found' });
    }

    const config = await getLoyaltySettings(conn, await customerFid(conn, customer_id));
    if (!config.enabled) {
      await conn.rollback();
      return res.json({ success: true, data: { points_earned: 0 }, message: 'Loyalty system is disabled' });
    }

    const pointsEarned = Math.floor(amount / config.points_ratio);
    if (pointsEarned <= 0) {
      await conn.rollback();
      return res.json({ success: true, data: { points_earned: 0 }, message: 'Amount too low for points' });
    }

    await ensureLoyaltyRow(conn, customer_id);

    // Lock and update
    const [current] = await conn.query(
      'SELECT points FROM loyalty WHERE customer_id = ? FOR UPDATE', [customer_id]
    );
    const newBalance = Number(current[0]?.points || 0) + pointsEarned;

    await conn.query(
      'UPDATE loyalty SET points = ? WHERE customer_id = ?',
      [newBalance, customer_id]
    );

    // Log transaction
    await conn.query(
      `INSERT INTO loyalty_transactions
       (customer_id, type, points, balance_after, reference_type, reference_id, description, created_by)
       VALUES (?, 'earn', ?, ?, ?, ?, ?, ?)`,
      [customer_id, pointsEarned, newBalance, reference_type || 'invoice', reference_id || null,
       description || `Earned ${pointsEarned} points from ₹${amount} spend`, req.user?.id || null]
    );

    await conn.commit();

    res.json({
      success: true,
      data: { points_earned: pointsEarned, new_balance: newBalance },
      message: `Earned ${pointsEarned} loyalty points`,
    });
  } catch (err) {
    await conn.rollback();
    console.error('Earn points error:', err);
    res.status(500).json({ success: false, error: 'Failed to earn points' });
  } finally {
    conn.release();
  }
};

// Callable from other controllers without req/res
exports.awardPointsInternal = async (conn, customerId, amount, referenceType, referenceId, createdBy) => {
  try {
    const config = await getLoyaltySettings(conn, await customerFid(conn, customerId));
    if (!config.enabled) return 0;

    // Idempotency safeguard: check if points were already awarded for this reference
    const [existing] = await conn.query(
      "SELECT id FROM loyalty_transactions WHERE customer_id = ? AND reference_type = ? AND reference_id = ? AND type = 'earn'",
      [customerId, referenceType, referenceId]
    );
    if (existing.length > 0) {
      console.log(`[LOYALTY] Points already awarded for ${referenceType} #${referenceId}`);
      return 0;
    }

    // 10% point earning ratio (₹10 spent = 1 point)
    const ratio = config.points_ratio <= 10 ? config.points_ratio : 10;
    const pointsEarned = Math.floor(amount / ratio);
    if (pointsEarned <= 0) return 0;

    await ensureLoyaltyRow(conn, customerId);

    const [current] = await conn.query(
      'SELECT points FROM loyalty WHERE customer_id = ? FOR UPDATE', [customerId]
    );
    const newBalance = Number(current[0]?.points || 0) + pointsEarned;

    await conn.query(
      'UPDATE loyalty SET points = ? WHERE customer_id = ?',
      [newBalance, customerId]
    );

    await conn.query(
      `INSERT INTO loyalty_transactions
       (customer_id, type, points, balance_after, reference_type, reference_id, description, created_by)
       VALUES (?, 'earn', ?, ?, ?, ?, ?, ?)`,
      [customerId, pointsEarned, newBalance, referenceType, referenceId,
       `Earned ${pointsEarned} loyalty points (10% back)`, createdBy || null]
    );

    console.log(`[LOYALTY] Awarded ${pointsEarned} points to customer #${customerId} for ${referenceType} #${referenceId}`);
    return pointsEarned;
  } catch (err) {
    console.error('Award points internal error:', err);
    return 0;
  }
};

// ═══════════════════════════════════════════════════════════
// REDEEM POINTS
// POST /loyalty/redeem
// ═══════════════════════════════════════════════════════════
exports.redeemPoints = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { customer_id, points, description } = req.body;
    const targetCustomer = customer_id || req.user.id;

    if (!points || points <= 0) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Positive points amount required' });
    }

    const config = await getLoyaltySettings(conn, await customerFid(conn, targetCustomer));
    if (!config.enabled) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Loyalty system is disabled' });
    }

    if (points < config.min_redeem) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: `Minimum ${config.min_redeem} points required to redeem`
      });
    }

    await ensureLoyaltyRow(conn, targetCustomer);

    const [current] = await conn.query(
      'SELECT points FROM loyalty WHERE customer_id = ? FOR UPDATE', [targetCustomer]
    );
    const currentBalance = Number(current[0]?.points || 0);

    if (currentBalance < points) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: `Insufficient points. Balance: ${currentBalance}`
      });
    }

    const newBalance = currentBalance - points;
    const rupeesValue = points * config.point_value;

    await conn.query(
      'UPDATE loyalty SET points = ? WHERE customer_id = ?',
      [newBalance, targetCustomer]
    );

    await conn.query(
      `INSERT INTO loyalty_transactions
       (customer_id, type, points, balance_after, reference_type, description, created_by)
       VALUES (?, 'redeem', ?, ?, 'manual', ?, ?)`,
      [targetCustomer, -points, newBalance, description || `Redeemed ${points} points (₹${rupeesValue})`, req.user.id]
    );

    await conn.commit();

    res.json({
      success: true,
      data: { points_redeemed: points, rupees_value: rupeesValue, new_balance: newBalance },
      message: `Redeemed ${points} points (₹${rupeesValue} value)`,
    });
  } catch (err) {
    await conn.rollback();
    console.error('Redeem points error:', err);
    res.status(500).json({ success: false, error: 'Failed to redeem points' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// LOYALTY HISTORY (transactions)
// ═══════════════════════════════════════════════════════════
exports.history = async (req, res) => {
  try {
    const customerId = req.params.customerId || req.user.id;
    const { page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);

    const [countRows] = await pool.query(
      'SELECT COUNT(*) AS total FROM loyalty_transactions WHERE customer_id = ?',
      [customerId]
    );

    const [rows] = await pool.query(
      `SELECT lt.*, u.name AS created_by_name
       FROM loyalty_transactions lt
       LEFT JOIN users u ON lt.created_by = u.id
       WHERE lt.customer_id = ?
       ORDER BY lt.created_at DESC
       LIMIT ? OFFSET ?`,
      [customerId, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('Loyalty history error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch loyalty history' });
  }
};

// ═══════════════════════════════════════════════════════════
// SEARCH CUSTOMERS BY LOYALTY
// ═══════════════════════════════════════════════════════════
exports.search = async (req, res) => {
  try {
    const { q } = req.query;
    const hasQuery = q && q.trim().length >= 2;
    const search = hasQuery ? `%${q.trim()}%` : null;

    const sql = `
      SELECT u.id, u.name, u.mobile,
        COALESCE(l.credits, 0) AS credits,
        COALESCE(l.free_washes, 0) AS free_washes,
        COALESCE(l.wax_count, 0) AS wax_count,
        COALESCE(l.points, 0) AS points
      FROM users u
      LEFT JOIN loyalty l ON u.id = l.customer_id
      WHERE u.role = 'customer' ${hasQuery ? 'AND (u.name LIKE ? OR u.mobile LIKE ?)' : ''}
      ORDER BY l.points DESC, u.name ASC
      LIMIT 50
    `;

    const [rows] = await pool.query(sql, hasQuery ? [search, search] : []);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Loyalty search error:', err);
    res.status(500).json({ success: false, error: 'Search failed' });
  }
};

// ═══════════════════════════════════════════════════════════
// GET/UPDATE LOYALTY SETTINGS (admin)
// ═══════════════════════════════════════════════════════════
exports.getSettings = async (req, res) => {
  try {
    const config = await getLoyaltySettings(null, Number(req.franchiseId) || Number(req.user?.franchise_id) || 1);
    res.json({ success: true, data: config });
  } catch (err) {
    console.error('Get loyalty settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch settings' });
  }
};

exports.updateSettings = async (req, res) => {
  try {
    const { points_ratio, min_redeem, point_value, free_wash_points, enabled } = req.body;
    const fid = Number(req.franchiseId) || Number(req.user?.franchise_id) || 1;
    for (const [k, v, min] of [['Points ratio', points_ratio, 1], ['Minimum redeem', min_redeem, 0], ['Point value', point_value, 0.01], ['Points for 1 free wash', free_wash_points, 1]]) {
      if (v !== undefined && !(Number(v) >= min)) return res.status(400).json({ success: false, error: `${k} must be ${min} or more` });
    }

    const updates = [];
    if (points_ratio !== undefined) updates.push(['loyalty_points_ratio', String(points_ratio)]);
    if (min_redeem !== undefined) updates.push(['loyalty_min_redeem', String(min_redeem)]);
    if (point_value !== undefined) updates.push(['loyalty_point_value', String(point_value)]);
    if (free_wash_points !== undefined) {
      if (!Number.isInteger(Number(free_wash_points))) return res.status(400).json({ success: false, error: 'Points for 1 free wash must be a whole number' });
      updates.push(['loyalty_free_wash_points', String(Number(free_wash_points))]);
    }
    if (enabled !== undefined) updates.push(['loyalty_enabled', enabled ? '1' : '0']);

    // Ensure settings rows exist before updating
    // this studio's rows only
    for (const [key, val] of updates) {
      await pool.query(
        'INSERT INTO settings (franchise_id, key_name, value) VALUES (?, ?, ?) ON DUPLICATE KEY UPDATE value = VALUES(value)',
        [fid, key, val]
      );
    }

    const config = await getLoyaltySettings(null, fid);
    res.json({ success: true, data: config, message: 'Loyalty settings updated' });
  } catch (err) {
    console.error('Update loyalty settings error:', err);
    res.status(500).json({ success: false, error: 'Failed to update settings' });
  }
};

// ═══════════════════════════════════════════════════════════
// REDEEM POINTS TO WASH
// POST /loyalty/redeem-wash
// ═══════════════════════════════════════════════════════════
exports.redeemPointsToWash = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const targetCustomer = req.user.id;
    // the studio's own rule (Loyalty settings → points for 1 free wash), shown on the customer's Loyalty page
    const pointsNeeded = (await getLoyaltySettings(null, await customerFid(null, targetCustomer))).free_wash_points;

    await ensureLoyaltyRow(pool, targetCustomer); // outside the transaction, so fast repeated taps don't deadlock
    await conn.beginTransaction();

    const [current] = await conn.query(
      'SELECT points, free_washes FROM loyalty WHERE customer_id = ? FOR UPDATE', [targetCustomer]
    );
    const currentPoints = Number(current[0]?.points || 0);
    const currentWashes = current[0]?.free_washes || 0;

    if (currentPoints < pointsNeeded) {
      await conn.rollback();
      return res.status(400).json({
        success: false,
        error: `Not enough points. ${pointsNeeded} points are needed for a free wash. You have ${currentPoints} points.`
      });
    }

    const newPoints = currentPoints - pointsNeeded;
    const newWashes = currentWashes + 1;

    await conn.query(
      'UPDATE loyalty SET points = ?, free_washes = ? WHERE customer_id = ?',
      [newPoints, newWashes, targetCustomer]
    );

    await conn.query(
      `INSERT INTO loyalty_transactions
       (customer_id, type, points, balance_after, reference_type, description, created_by)
       VALUES (?, 'redeem', ?, ?, 'manual', ?, ?)`,
      [targetCustomer, -pointsNeeded, newPoints, `Redeemed ${pointsNeeded} points for 1 free wash`, req.user.id]
    );

    await conn.commit();

    res.json({
      success: true,
      data: {
        points_redeemed: pointsNeeded,
        new_points_balance: newPoints,
        new_washes_balance: newWashes
      },
      message: `Redeemed ${pointsNeeded} points for 1 free wash`,
    });
  } catch (err) {
    await conn.rollback();
    console.error('Redeem points to wash error:', err);
    res.status(500).json({ success: false, error: 'Failed to redeem points to wash' });
  } finally {
    conn.release();
  }
};

// ═══════════════════════════════════════════════════════════
// LOYALTY RULES (Franchise-scoped)
// ═══════════════════════════════════════════════════════════
exports.getRules = async (req, res) => {
  try {
    const fCond = req.getFranchiseCondition
      ? req.getFranchiseCondition('franchise_id')
      : { clause: ' AND (franchise_id = ? OR franchise_id IS NULL)', params: [req.franchiseId || 1] };

    const [rules] = await pool.query(
      `SELECT * FROM loyalty_rules WHERE 1=1 ${fCond.clause} ORDER BY is_active DESC, id ASC`,
      fCond.params
    );
    res.json({ success: true, data: rules });
  } catch (err) {
    console.error('getLoyaltyRules error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch loyalty rules' });
  }
};

exports.createRule = async (req, res) => {
  try {
    const {
      rule_name,
      service_id,
      points_type = 'percentage_of_bill',
      points_value = 5.0,
      multiplier = 1.0,
      expiry_days = 365,
      is_active = 1
    } = req.body;

    if (!rule_name || !rule_name.trim()) {
      return res.status(400).json({ success: false, error: 'Rule name is required' });
    }

    const franchiseId = req.franchiseId || req.body.franchise_id || 1;

    const [result] = await pool.query(
      `INSERT INTO loyalty_rules 
       (franchise_id, rule_name, service_id, points_type, points_value, multiplier, expiry_days, is_active)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        franchiseId,
        rule_name.trim(),
        service_id || null,
        points_type,
        parseFloat(points_value) || 0,
        parseFloat(multiplier) || 1.0,
        parseInt(expiry_days, 10) || 365,
        is_active ? 1 : 0
      ]
    );

    res.status(201).json({
      success: true,
      message: 'Loyalty rule created successfully',
      data: { id: result.insertId }
    });
  } catch (err) {
    console.error('createLoyaltyRule error:', err);
    res.status(500).json({ success: false, error: 'Failed to create loyalty rule' });
  }
};

exports.updateRule = async (req, res) => {
  try {
    const { id } = req.params;
    const {
      rule_name,
      service_id,
      points_type,
      points_value,
      multiplier,
      expiry_days,
      is_active
    } = req.body;

    const [existing] = await pool.query('SELECT franchise_id FROM loyalty_rules WHERE id = ?', [id]);
    if (!existing.length) return res.status(404).json({ success: false, error: 'Rule not found' });

    if (!req.isSuperAdmin && existing[0].franchise_id && req.franchiseId && parseInt(existing[0].franchise_id, 10) !== parseInt(req.franchiseId, 10)) {
      return res.status(403).json({ success: false, error: 'Access denied: Rule belongs to another franchise' });
    }

    await pool.query(
      `UPDATE loyalty_rules SET
        rule_name = COALESCE(?, rule_name),
        service_id = ?,
        points_type = COALESCE(?, points_type),
        points_value = COALESCE(?, points_value),
        multiplier = COALESCE(?, multiplier),
        expiry_days = COALESCE(?, expiry_days),
        is_active = COALESCE(?, is_active)
       WHERE id = ?`,
      [
        rule_name ? rule_name.trim() : null,
        service_id !== undefined ? service_id : null,
        points_type || null,
        points_value !== undefined ? parseFloat(points_value) : null,
        multiplier !== undefined ? parseFloat(multiplier) : null,
        expiry_days !== undefined ? parseInt(expiry_days, 10) : null,
        is_active !== undefined ? (is_active ? 1 : 0) : null,
        id
      ]
    );

    res.json({ success: true, message: 'Loyalty rule updated successfully' });
  } catch (err) {
    console.error('updateLoyaltyRule error:', err);
    res.status(500).json({ success: false, error: 'Failed to update loyalty rule' });
  }
};

// ═══════════════════════════════════════════════════════════
// FULL CUSTOMER LOYALTY LEDGER
// GET /loyalty/ledger/:customerId
// ═══════════════════════════════════════════════════════════
exports.getLedger = async (req, res) => {
  try {
    const customerId = req.params.customerId || req.user.id;

    if (req.user.role === 'customer' && parseInt(customerId, 10) !== req.user.id) {
      return res.status(403).json({ success: false, error: 'Not authorized' });
    }

    const [loyaltyRows] = await pool.query('SELECT * FROM loyalty WHERE customer_id = ?', [customerId]);
    const balance = loyaltyRows[0] || { credits: 0, free_washes: 0, wax_count: 0, points: 0 };

    const [txRows] = await pool.query(
      `SELECT lt.*, u.name AS created_by_name
       FROM loyalty_transactions lt
       LEFT JOIN users u ON lt.created_by = u.id
       WHERE lt.customer_id = ?
       ORDER BY lt.created_at DESC`,
      [customerId]
    );

    let totalEarned = 0;
    let totalRedeemed = 0;
    txRows.forEach(tx => {
      const p = parseFloat(tx.points) || 0;
      if (p > 0) totalEarned += p;
      else totalRedeemed += Math.abs(p);
    });

    res.json({
      success: true,
      data: {
        customer_id: parseInt(customerId, 10),
        balance,
        total_earned: totalEarned,
        total_redeemed: totalRedeemed,
        ledger: txRows
      }
    });
  } catch (err) {
    console.error('getLedger error:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch loyalty ledger' });
  }
};

