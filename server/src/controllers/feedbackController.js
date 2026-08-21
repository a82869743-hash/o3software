const pool = require('../config/db');
const crypto = require('crypto');

// ─── PUBLIC: LOOKUP CONTEXT BY TOKEN ─────────────────
exports.getFormContext = async (req, res) => {
  try {
    const { token } = req.params;
    if (!token) return res.status(400).json({ success: false, error: 'Token is required' });

    const [requests] = await pool.query(
      `SELECT r.*, u.name as customer_name, u.mobile as customer_mobile, jc.invoice_number
       FROM v2_review_requests r
       LEFT JOIN users u ON r.customer_id = u.id
       LEFT JOIN job_carts jc ON r.job_cart_id = jc.id
       WHERE r.feedback_token = ?`,
      [token]
    );

    if (!requests.length) {
      return res.status(404).json({ success: false, error: 'Invalid or expired feedback token' });
    }

    const request = requests[0];
    if (request.status === 'responded') {
      return res.status(400).json({ success: false, error: 'Feedback has already been submitted for this request' });
    }

    res.json({
      success: true,
      data: {
        customer_name: request.customer_name,
        invoice_number: request.invoice_number,
        job_cart_id: request.job_cart_id,
        booking_id: request.booking_id
      }
    });
  } catch (err) {
    console.error('Get feedback form context error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── PUBLIC: SUBMIT FEEDBACK ─────────────────────────
exports.submitFeedback = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { token, overall_rating, service_rating, staff_rating, cleanliness_rating, comments } = req.body;

    if (!token) return res.status(400).json({ success: false, error: 'Token is required' });
    if (!overall_rating || overall_rating < 1 || overall_rating > 5) {
      return res.status(400).json({ success: false, error: 'Valid overall rating (1-5) is required' });
    }

    // 1. Validate token
    const [requests] = await conn.query(
      `SELECT * FROM v2_review_requests WHERE feedback_token = ? FOR UPDATE`,
      [token]
    );

    if (!requests.length) {
      await conn.rollback();
      return res.status(404).json({ success: false, error: 'Invalid or expired feedback token' });
    }

    const request = requests[0];
    if (request.status === 'responded') {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Feedback has already been submitted for this request' });
    }

    // 2. Insert into v2_feedback
    await conn.query(
      `INSERT INTO v2_feedback 
       (customer_id, booking_id, job_cart_id, overall_rating, service_rating, staff_rating, cleanliness_rating, comments, is_public)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)`,
      [
        request.customer_id,
        request.booking_id,
        request.job_cart_id,
        overall_rating,
        service_rating || overall_rating,
        staff_rating || overall_rating,
        cleanliness_rating || overall_rating,
        comments || ''
      ]
    );

    // 3. Mark request as responded
    await conn.query(
      `UPDATE v2_review_requests SET status = 'responded', responded_at = NOW() WHERE id = ?`,
      [request.id]
    );

    await conn.commit();
    res.status(201).json({ success: true, message: 'Thank you for your feedback!' });
  } catch (err) {
    await conn.rollback();
    console.error('Submit feedback error:', err);
    res.status(500).json({ success: false, error: 'Failed to submit feedback' });
  } finally {
    conn.release();
  }
};

// ─── ADMIN: GET ALL FEEDBACK ─────────────────────────
exports.getFeedback = async (req, res) => {
  try {
    const { page = 1, limit = 20, rating } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = ['1=1']; const params = [];
    
    if (rating) {
      where.push('f.overall_rating = ?');
      params.push(rating);
    }

    const [countRows] = await pool.query(
      `SELECT COUNT(*) as total FROM v2_feedback f WHERE ${where.join(' AND ')}`,
      params
    );

    const [rows] = await pool.query(
      `SELECT f.*, u.name as customer_name, u.mobile as customer_mobile, jc.invoice_number
       FROM v2_feedback f
       LEFT JOIN users u ON u.id = f.customer_id
       LEFT JOIN job_carts jc ON jc.id = f.job_cart_id
       WHERE ${where.join(' AND ')}
       ORDER BY f.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total }
    });
  } catch (err) {
    console.error('Get feedback error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADMIN: REPLY TO FEEDBACK ────────────────────────
exports.replyToFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { admin_reply } = req.body;

    await pool.query(
      'UPDATE v2_feedback SET admin_reply = ?, admin_replied_at = NOW() WHERE id = ?',
      [admin_reply, id]
    );

    res.json({ success: true, message: 'Reply saved successfully' });
  } catch (err) {
    console.error('Reply feedback error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADMIN: TOGGLE PUBLIC VISIBILITY ──────────────────
exports.publishFeedback = async (req, res) => {
  try {
    const { id } = req.params;
    const { is_public } = req.body;

    await pool.query(
      'UPDATE v2_feedback SET is_public = ? WHERE id = ?',
      [is_public ? 1 : 0, id]
    );

    res.json({ success: true, message: 'Visibility updated successfully' });
  } catch (err) {
    console.error('Publish feedback error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADMIN: GET STATS ────────────────────────────────
exports.getFeedbackStats = async (req, res) => {
  try {
    const [stats] = await pool.query(
      `SELECT COUNT(*) as total_reviews, COALESCE(ROUND(AVG(overall_rating), 1), 0) as avg_rating,
              SUM(CASE WHEN overall_rating >= 4 THEN 1 ELSE 0 END) as positive_count,
              SUM(CASE WHEN overall_rating <= 2 THEN 1 ELSE 0 END) as negative_count
       FROM v2_feedback`
    );

    const [dist] = await pool.query(
      `SELECT overall_rating as rating, COUNT(*) as count
       FROM v2_feedback
       GROUP BY overall_rating
       ORDER BY overall_rating DESC`
    );

    res.json({
      success: true,
      data: {
        total_reviews: stats[0].total_reviews || 0,
        avg_rating: parseFloat(stats[0].avg_rating || 0),
        positive_count: stats[0].positive_count || 0,
        negative_count: stats[0].negative_count || 0,
        distribution: dist
      }
    });
  } catch (err) {
    console.error('Get feedback stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── ADMIN: MANUAL REQUEST FEEDBACK LINK ──────────────
exports.requestFeedbackManual = async (req, res) => {
  try {
    const { job_cart_id } = req.body;
    if (!job_cart_id) return res.status(400).json({ success: false, error: 'Job cart ID is required' });

    const [carts] = await pool.query(
      `SELECT jc.*, v.customer_id, u.name as customer_name, u.mobile as customer_mobile
       FROM job_carts jc
       JOIN vehicles v ON jc.vehicle_id = v.id
       JOIN users u ON v.customer_id = u.id
       WHERE jc.id = ?`,
      [job_cart_id]
    );

    if (!carts.length) return res.status(404).json({ success: false, error: 'Job cart not found' });
    const cart = carts[0];

    const token = crypto.randomBytes(32).toString('hex');
    await pool.query(
      `INSERT INTO v2_review_requests (customer_id, booking_id, job_cart_id, sent_via, status, feedback_token)
       VALUES (?, ?, ?, 'whatsapp', 'sent', ?)`,
      [cart.customer_id, cart.booking_id, cart.id, token]
    );

    // Construct Redirect URL for manual send
    const domain = process.env.CLIENT_URL || 'http://localhost:5173';
    const feedbackUrl = `${domain}/feedback/${token}`;
    const message = `Dear ${cart.customer_name || 'Customer'}, thank you for choosing O3 Car Spa! We would love to hear your feedback. Please rate your experience here: ${feedbackUrl}`;    // Log Click-to-Chat notification
    await pool.query(
      `INSERT INTO v2_notification_logs (customer_id, template_name, channel, mobile, message_body, status, response_data)
       VALUES (?, 'FEEDBACK_REQUEST', 'whatsapp', ?, ?, 'pending', ?)`,
      [
        cart.customer_id,
        cart.customer_mobile,
        message,
        JSON.stringify({ redirect_url: `https://api.whatsapp.com/send?phone=${cart.customer_mobile}&text=${encodeURIComponent(message)}` })
      ]
    );
    res.json({ success: true, message: 'Feedback request logged and ready to send via WhatsApp' });
  } catch (err) {
    console.error('Request feedback manual error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── KEEP REFERRAL FUNCTIONS UNCHANGED ─────────────────
exports.generateReferralCode = async (req, res) => {
  try {
    const cid = req.user.id;
    const [existing] = await pool.query('SELECT * FROM referral_codes WHERE customer_id=? AND is_active=1', [cid]);
    if (existing.length) return res.json({ success: true, data: existing[0] });
    const code = `GK${cid}${Math.random().toString(36).substring(2,6).toUpperCase()}`;
    const [result] = await pool.query('INSERT INTO referral_codes (customer_id,code,reward_points) VALUES (?,?,100)', [cid, code]);
    await pool.query('UPDATE users SET referral_code=? WHERE id=?', [code, cid]);
    res.status(201).json({ success: true, data: { id: result.insertId, code, reward_points: 100 } });
  } catch (err) {
    console.error('Generate referral error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.applyReferralCode = async (req, res) => {
  try {
    const { code } = req.body; const rid = req.user.id;
    const [cr] = await pool.query('SELECT * FROM referral_codes WHERE code=? AND is_active=1', [code]);
    if (!cr.length) return res.status(404).json({ success: false, error: 'Invalid referral code' });
    if (cr[0].customer_id === rid) return res.status(400).json({ success: false, error: 'Cannot use own code' });
    const [used] = await pool.query('SELECT id FROM referral_rewards WHERE referred_id=?', [rid]);
    if (used.length) return res.status(400).json({ success: false, error: 'Already used a referral code' });
    await pool.query(`INSERT INTO referral_rewards (referrer_id,referred_id,referral_code,reward_type,reward_value,status,credited_at) VALUES (?,?,?,'points',?,'credited',NOW())`, [cr[0].customer_id, rid, code, cr[0].reward_points]);
    await pool.query('UPDATE referral_codes SET current_uses=current_uses+1 WHERE id=?', [cr[0].id]);
    await pool.query('UPDATE users SET referred_by=? WHERE id=?', [cr[0].customer_id, rid]);
    await pool.query(`INSERT INTO wallets (customer_id,balance,total_earned) VALUES (?,?,?) ON DUPLICATE KEY UPDATE balance=balance+?,total_earned=total_earned+?`, [cr[0].customer_id, cr[0].reward_points, cr[0].reward_points, cr[0].reward_points, cr[0].reward_points]);
    res.json({ success: true, message: `Referral applied! ${cr[0].reward_points} points credited.` });
  } catch (err) {
    console.error('Apply referral error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

exports.getReferralStats = async (req, res) => {
  try {
    const cid = req.user.role === 'admin' ? req.query.customer_id : req.user.id;
    const [code] = await pool.query('SELECT * FROM referral_codes WHERE customer_id=? AND is_active=1', [cid]);
    const [rewards] = await pool.query(`SELECT COUNT(*) as total_referrals, COALESCE(SUM(reward_value),0) as total_earned FROM referral_rewards WHERE referrer_id=? AND status='credited'`, [cid]);
    const [wallet] = await pool.query('SELECT * FROM wallets WHERE customer_id=?', [cid]);
    res.json({ success: true, data: { referral_code: code[0]||null, ...rewards[0], wallet: wallet[0]||{balance:0} } });
  } catch (err) {
    console.error('Get referral stats error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
