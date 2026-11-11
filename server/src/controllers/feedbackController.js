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
    // one rating per job (or booking), even if several review links were sent
    const [[rated]] = await conn.query(
      'SELECT id FROM v2_feedback WHERE customer_id = ? AND ((? IS NOT NULL AND job_cart_id = ?) OR (? IS NOT NULL AND booking_id = ?)) LIMIT 1',
      [request.customer_id, request.job_cart_id, request.job_cart_id, request.booking_id, request.booking_id]);
    if (rated) {
      await conn.query("UPDATE v2_review_requests SET status = 'responded' WHERE customer_id = ? AND (job_cart_id <=> ?)", [request.customer_id, request.job_cart_id]);
      await conn.commit();
      return res.status(400).json({ success: false, error: 'You have already rated this service — thank you!' });
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
      `SELECT f.*, f.overall_rating AS rating, f.comments AS review_text, u.name as customer_name, u.mobile as customer_mobile, jc.invoice_number
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
    if (!admin_reply || !String(admin_reply).trim()) return res.status(400).json({ success: false, error: 'Type a reply first' });

    const [r] = await pool.query(
      'UPDATE v2_feedback SET admin_reply = ?, admin_replied_at = NOW() WHERE id = ?',
      [String(admin_reply).trim(), id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, error: 'Feedback not found' });

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

    const [r] = await pool.query(
      'UPDATE v2_feedback SET is_public = ? WHERE id = ?',
      [is_public ? 1 : 0, id]
    );
    if (!r.affectedRows) return res.status(404).json({ success: false, error: 'Feedback not found' });

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

    const [[done]] = await pool.query('SELECT id FROM v2_feedback WHERE job_cart_id = ? LIMIT 1', [cart.id]);
    if (done) return res.status(400).json({ success: false, error: 'The customer has already rated this job' });
    // re-use the open link for this job instead of creating a second one
    const [[open]] = await pool.query("SELECT feedback_token FROM v2_review_requests WHERE job_cart_id = ? AND status <> 'responded' AND feedback_token IS NOT NULL ORDER BY id DESC LIMIT 1", [cart.id]);
    const token = open?.feedback_token || crypto.randomBytes(32).toString('hex');
    if (!open) {
      await pool.query(
        `INSERT INTO v2_review_requests (customer_id, booking_id, job_cart_id, sent_via, status, feedback_token)
         VALUES (?, ?, ?, 'whatsapp', 'sent', ?)`,
        [cart.customer_id, cart.booking_id, cart.id, token]
      );
    }

    // Construct Redirect URL for manual send
    const domain = process.env.CLIENT_URL || 'http://localhost:5173';
    const feedbackUrl = `${domain}/feedback/${token}`;
    const message = `Dear ${cart.customer_name || 'Customer'}, thank you for choosing O3 Car Spaa! We would love to hear your feedback. Please rate your experience here: ${feedbackUrl}`;    // Log Click-to-Chat notification
    await require('../services/notificationService').notify({
      customerId: cart.customer_id, customMessageBody: message, channels: ['whatsapp'],
      referenceType: 'job_card', referenceId: cart.id,
    });
    res.json({ success: true, message: 'Feedback request sent to the customer on WhatsApp' });
  } catch (err) {
    console.error('Request feedback manual error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── KEEP REFERRAL FUNCTIONS UNCHANGED ─────────────────
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

// ─── CUSTOMER: pending review requests (after delivery) + my submitted feedback ──
exports.mine = async (req, res) => {
  try {
    const [pending] = await pool.query(
      `SELECT r.feedback_token AS token, r.job_cart_id, r.booking_id, r.sent_at,
              COALESCE(v.registration_no, b.vehicle_reg_no) AS registration_no,
              COALESCE(CONCAT(v.brand,' ',v.model), CONCAT(b.vehicle_brand,' ',b.vehicle_model)) AS vehicle,
              IF(r.job_cart_id IS NOT NULL, 'Job card', 'Quick wash') AS service_type
       FROM v2_review_requests r
       LEFT JOIN job_carts jc ON jc.id = r.job_cart_id
       LEFT JOIN vehicles v ON v.id = jc.vehicle_id
       LEFT JOIN bookings b ON b.id = r.booking_id
       WHERE r.customer_id = ? AND r.status <> 'responded' AND r.feedback_token IS NOT NULL
       ORDER BY r.sent_at DESC LIMIT 20`,
      [req.user.id]
    );
    const [given] = await pool.query(
      'SELECT id, job_cart_id, booking_id, overall_rating, comments, admin_reply, created_at FROM v2_feedback WHERE customer_id = ? ORDER BY created_at DESC LIMIT 20',
      [req.user.id]
    );
    res.json({ success: true, data: { pending, given } });
  } catch (err) {
    console.error('feedback mine error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
