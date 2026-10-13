const pool = require('../config/db');
const crypto = require('crypto');
const messagingService = require('../services/messagingService');

// ... skipped Razorpay logic, adding it below

// ─── Razorpay Order Creation ───────────────────────
exports.createRazorpayOrder = async (req, res) => {
  try {
    const { amount, currency = 'INR', receipt, package_id, booking_id, invoice_id, user_package_id, package_request_id } = req.body;
    if (!amount) return res.status(400).json({ success: false, error: 'Amount is required' });

    let order;
    if (razorpayInstance) {
      const options = {
        amount: Math.round(amount * 100), // amount in the smallest currency unit (paise)
        currency,
        receipt: receipt || `receipt_${Date.now()}`
      };
      order = await razorpayInstance.orders.create(options);
    } else {
      console.warn('[RAZORPAY MOCK MODE] Creating simulated order because credentials are missing');
      order = {
        id: `order_mock_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        amount: Math.round(amount * 100),
        currency,
        receipt: receipt || `receipt_${Date.now()}`
      };
    }

    // Save pending payment record to v2_payments
    const metadata = { user_package_id, package_request_id };
    await pool.query(
      `INSERT INTO v2_payments 
       (customer_id, booking_id, invoice_id, package_id, amount, currency, payment_method, status, razorpay_order_id, notes)
       VALUES (?, ?, ?, ?, ?, ?, 'razorpay', 'pending', ?, ?)`,
      [req.user.id, booking_id || null, invoice_id || null, package_id || null, amount, currency, order.id, JSON.stringify(metadata)]
    );

    res.json({ success: true, data: order });
  } catch (error) {
    console.error('createRazorpayOrder error:', error);
    res.status(500).json({ success: false, error: 'Failed to create Razorpay order' });
  }
};

// Internal Helper to process successful captured payment (from verify or webhook)
exports._processCapturedPayment = async (connection, razorpayOrderId, razorpayPaymentId, razorpaySignature) => {
  // 1. Get the pending payment from v2_payments
  const [rows] = await connection.query(
    "SELECT * FROM v2_payments WHERE razorpay_order_id = ? AND status = 'pending' FOR UPDATE",
    [razorpayOrderId]
  );
  if (!rows.length) {
    return { success: false, error: 'Pending payment not found or already processed' };
  }
  const payment = rows[0];

  // 2. Update payment status to captured
  await connection.query(
    `UPDATE v2_payments 
     SET status = 'captured', razorpay_payment_id = ?, razorpay_signature = ?, updated_at = NOW() 
     WHERE id = ?`,
    [razorpayPaymentId, razorpaySignature || null, payment.id]
  );

  // 3. Insert transaction log
  await connection.query(
    `INSERT INTO v2_payment_transactions 
     (payment_id, transaction_type, amount, status) 
     VALUES (?, 'credit', ?, 'success')`,
    [payment.id, payment.amount]
  );

  // 4. Parse metadata/notes
  let metadata = {};
  if (payment.notes) {
    try {
      metadata = JSON.parse(payment.notes);
    } catch (e) {
      console.warn('Failed to parse payment notes/metadata:', e.message);
    }
  }

  // 5. Handle package purchase request
  if (metadata.package_request_id) {
    const packagesController = require('./packagesController');
    const appResult = await packagesController._approveRequestInternal(connection, metadata.package_request_id, payment.id);
    if (!appResult.success) {
      console.warn('Auto-approval failed during payment processing:', appResult.error);
    }
  }

  // 6. Handle package renewal
  else if (metadata.user_package_id) {
    const userPackagesController = require('./userPackagesController');
    const renResult = await userPackagesController._renewPackageInternal(connection, {
      user_package_id: metadata.user_package_id,
      package_id: payment.package_id,
      payment_amount: payment.amount,
      payment_mode: 'razorpay',
      payment_id: payment.id,
      notes: 'Online renewal via Razorpay'
    });
    if (!renResult.success) {
      console.warn('Auto-renewal failed during payment processing:', renResult.error);
    }
  }

  // 7. Handle booking advance payment
  else if (payment.booking_id) {
    // A. Update booking: status = 'pending_approval', advance_payment_id = payment.id, expires_at = NULL
    await connection.query(
      `UPDATE bookings 
       SET status = 'pending_approval', advance_payment_id = ?, expires_at = NULL 
       WHERE id = ?`,
      [payment.id, payment.booking_id]
    );

    // B. Fetch booking details to insert into advance_payments
    const [bookings] = await connection.query(
      `SELECT customer_id, total_amount, advance_amount FROM bookings WHERE id = ?`,
      [payment.booking_id]
    );

    if (bookings.length) {
      const booking = bookings[0];
      const balance = Math.max(0, parseFloat(booking.total_amount || 0) - parseFloat(payment.amount));

      // C. Insert into advance_payments table
      await connection.query(
        `INSERT INTO advance_payments 
         (customer_id, booking_id, advance_amount, total_amount, balance_due, payment_method, status, notes)
         VALUES (?, ?, ?, ?, ?, 'card', 'advance_paid', ?)`,
        [
          booking.customer_id,
          payment.booking_id,
          payment.amount,
          booking.total_amount || 0,
          balance,
          'Online advance payment via Razorpay'
        ]
      );

      // D. Log transaction to the accounts transactions table
      await connection.query(
        `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
         VALUES (?, ?, ?, ?, ?, CURDATE(), ?)`,
        [
          'advance_revenue',
          payment.booking_id,
          payment.amount,
          'in',
          `Advance payment for booking #${payment.booking_id}`,
          booking.customer_id
        ]
      );

      // E. Send confirmation notifications (deferred from bookingsController.create)
      try {
        const [custRows] = await connection.query('SELECT name, mobile FROM users WHERE id = ?', [booking.customer_id]);
        const [slotRows] = await connection.query(
          `SELECT s.slot_date, s.start_time 
           FROM bookings b JOIN slots s ON b.slot_id = s.id 
           WHERE b.id = ?`,
          [payment.booking_id]
        );
        if (custRows.length && custRows[0].mobile && slotRows.length) {
          const date = new Date(slotRows[0].slot_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
          const time = slotRows[0].start_time ? slotRows[0].start_time.substring(0, 5) : '';
          const msg = `O3 Car Spaa: Hi ${custRows[0].name}, we received your advance payment of ₹${payment.amount}. Your booking #${payment.booking_id} is pending approval for ${date} at ${time}.`;
          
          const messagingService = require('../services/messagingService');
          const whatsappController = require('./whatsappController');
          messagingService.sendSMS(custRows[0].mobile, null, null, { content: msg }).catch(() => {});

          const waMsg = `⏳ *Advance Paid & Booking Pending*\n\nHi ${custRows[0].name},\nWe received your advance payment of *₹${payment.amount}*. Your booking #${payment.booking_id} is pending approval for ${date} at ${time}.\n\nThank you for choosing O3 Car Spaa! 🚗`;
          whatsappController._sendWhatsAppMessage(custRows[0].mobile, null, [], waMsg).catch(() => {});
        }
      } catch (msgErr) {
        console.warn('Booking advance WhatsApp/SMS notification failed:', msgErr.message);
      }
    }
  }

  return { success: true, payment };
};

// ─── Razorpay Verification ─────────────────────────
exports.verifyRazorpayPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();

    const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = req.body;
    
    if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Missing payment details' });
    }

    let signatureIsValid = false;
    if (razorpay_order_id.startsWith('order_mock_') || !razorpayInstance) {
      console.warn('[RAZORPAY MOCK MODE] Bypassing payment signature verification');
      signatureIsValid = true;
    } else {
      const body = razorpay_order_id + "|" + razorpay_payment_id;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body.toString())
        .digest('hex');
      signatureIsValid = (expectedSignature === razorpay_signature);
    }

    if (!signatureIsValid) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Invalid payment signature' });
    }

    // Process the payment status transition
    const processResult = await exports._processCapturedPayment(conn, razorpay_order_id, razorpay_payment_id, razorpay_signature);
    if (!processResult.success && processResult.error !== 'Pending payment not found or already processed') {
      await conn.rollback();
      return res.status(400).json({ success: false, error: processResult.error });
    }

    await conn.commit();
    res.json({ success: true, message: 'Payment verified successfully' });
  } catch (error) {
    await conn.rollback();
    console.error('verifyRazorpayPayment error:', error);
    res.status(500).json({ success: false, error: 'Failed to verify payment' });
  } finally {
    conn.release();
  }
};

// ─── Razorpay Webhook ──────────────────────────────
exports.webhook = async (req, res) => {
  const secret = process.env.RAZORPAY_WEBHOOK_SECRET || 'gka_webhook_secret_123';
  const signature = req.headers['x-razorpay-signature'];

  if (!signature) {
    return res.status(400).json({ success: false, error: 'Signature is missing' });
  }

  // Get raw body
  const rawBody = req.body.toString();

  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(rawBody)
    .digest('hex');

  if (expectedSignature !== signature) {
    return res.status(400).json({ success: false, error: 'Invalid webhook signature' });
  }

  // Signature verified, parse event
  let event;
  try {
    event = JSON.parse(rawBody);
  } catch (err) {
    return res.status(400).json({ success: false, error: 'Invalid JSON body' });
  }

  console.log(`[RAZORPAY WEBHOOK] Event: ${event.event}`);

  // Handle captured payment
  if (event.event === 'payment.captured') {
    const payload = event.payload.payment.entity;
    const razorpay_order_id = payload.order_id;
    const razorpay_payment_id = payload.id;

    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();

      const result = await exports._processCapturedPayment(connection, razorpay_order_id, razorpay_payment_id, signature);
      console.log('[RAZORPAY WEBHOOK] Payment processed result:', result);

      await connection.commit();
    } catch (err) {
      await connection.rollback();
      console.error('[RAZORPAY WEBHOOK] processing error:', err);
    } finally {
      connection.release();
    }
  }

  res.json({ status: 'ok' });
};

// ─── Get wallet balance ────────────────────────────
exports.getWalletBalance = async (req, res) => {
  try {
    const { customer_id } = req.params;
    const [rows] = await pool.query('SELECT balance FROM wallets WHERE customer_id = ?', [customer_id]);
    const balance = rows.length ? parseFloat(rows[0].balance) : 0;
    res.json({ success: true, data: { balance } });
  } catch (error) {
    console.error('getWalletBalance error:', error);
    res.status(500).json({ success: false, error: 'Failed to fetch wallet balance' });
  }
};
// ─── Get all payments with filters ──────────────────
exports.getPayments = async (req, res) => {
  try {
    const { page = 1, limit = 20, status, method, from, to, customer_id } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1'];
    const params = [];

    if (status) { where.push('p.status = ?'); params.push(status); }
    if (method) { where.push('p.payment_method = ?'); params.push(method); }
    if (customer_id) { where.push('p.customer_id = ?'); params.push(customer_id); }
    if (from) { where.push('p.created_at >= ?'); params.push(from); }
    if (to) { where.push('p.created_at <= ?'); params.push(`${to} 23:59:59`); }

    const countSql = `SELECT COUNT(*) as total FROM v2_payments p WHERE ${where.join(' AND ')}`;
    const [countRows] = await pool.query(countSql, params);

    const sql = `
      SELECT p.*, p.status AS payment_status, p.created_at AS paid_at, u.name as customer_name, u.mobile as customer_mobile
      FROM v2_payments p
      LEFT JOIN users u ON u.id = p.customer_id
      WHERE ${where.join(' AND ')}
      ORDER BY p.created_at DESC
      LIMIT ? OFFSET ?
    `;
    const [rows] = await pool.query(sql, [...params, parseInt(limit), parseInt(offset)]);

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total }
    });
  } catch (err) {
    console.error('getPayments error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch payments' });
  }
};

// ─── Create payment ─────────────────────────────────
exports.createPayment = async (req, res) => {
  const connection = await pool.getConnection();
  await connection.beginTransaction();
  try {
    const { customer_id, job_cart_id, booking_id, amount, wallet_spend, payment_type, payment_method, transaction_ref, notes } = req.body;
    
    let finalAmount = parseFloat(amount) || 0;
    let walletDeducted = parseFloat(wallet_spend) || 0;

    if (finalAmount <= 0 && walletDeducted <= 0) {
      await connection.rollback();
      return res.status(400).json({ success: false, error: 'Valid amount or wallet spend is required' });
    }

    // Process Wallet Spend if requested
    if (walletDeducted > 0 && customer_id) {
      const [wallet] = await connection.query('SELECT id, balance FROM wallets WHERE customer_id = ? FOR UPDATE', [customer_id]);
      if (!wallet.length || parseFloat(wallet[0].balance) < walletDeducted) {
        await connection.rollback();
        return res.status(400).json({ success: false, error: 'Insufficient wallet balance' });
      }

      await connection.query(
        'UPDATE wallets SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?',
        [walletDeducted, walletDeducted, wallet[0].id]
      );
      
      await connection.query(
        `INSERT INTO wallet_transactions (wallet_id, customer_id, amount, type, source, reference_id, description)
         VALUES (?, ?, ?, 'debit', 'payment', ?, 'Used wallet balance for payment')`,
        [wallet[0].id, customer_id, walletDeducted, job_cart_id || booking_id || null]
      );
    }

    let insertId = null;
    if (finalAmount > 0) {
      const [result] = await connection.query(
        `INSERT INTO v2_payments (customer_id, job_cart_id, booking_id, amount, payment_method, status, notes)
         VALUES (?, ?, ?, ?, ?, 'captured', ?)`,
        [customer_id, job_cart_id || null, booking_id || null, finalAmount, payment_method || 'cash', notes]
      );
      insertId = result.insertId;

      await connection.query(
        `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status)
         VALUES (?, 'credit', ?, 'success')`,
        [insertId, finalAmount]
      );
    }
    
    if (walletDeducted > 0) {
      const [walletResult] = await connection.query(
        `INSERT INTO v2_payments (customer_id, job_cart_id, booking_id, amount, payment_method, status, notes)
         VALUES (?, ?, ?, ?, 'wallet', 'captured', ?)`,
        [customer_id, job_cart_id || null, booking_id || null, walletDeducted, 'Wallet deduction applied']
      );
      if (!insertId) insertId = walletResult.insertId;

      await connection.query(
        `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status)
         VALUES (?, 'credit', ?, 'success')`,
        [walletResult.insertId, walletDeducted]
      );
    }

    // Update job_cart payment status if linked
    if (job_cart_id) {
      const [jcRows] = await connection.query('SELECT total_amount, advance_paid FROM job_carts WHERE id = ? FOR UPDATE', [job_cart_id]);
      if (jcRows.length) {
        const jc = jcRows[0];
        const totalPaid = parseFloat(jc.advance_paid || 0) + finalAmount + walletDeducted;
        const balanceDue = Math.max(0, parseFloat(jc.total_amount || 0) - totalPaid);
        const paymentStatus = balanceDue <= 0 ? 'paid' : 'partial';
        await connection.query(
          'UPDATE job_carts SET payment_status = ?, advance_paid = ?, balance_due = ? WHERE id = ?',
          [paymentStatus, totalPaid, balanceDue, job_cart_id]
        );
      }
    }

    // Send WhatsApp receipt
    if (customer_id && finalAmount > 0) {
      const [uRows] = await connection.query('SELECT name, mobile FROM users WHERE id = ?', [customer_id]);
      if (uRows.length && uRows[0].mobile) {
        const msg = `Dear ${uRows[0].name}, we have received your payment of ₹${finalAmount} via ${payment_method || 'cash'}. Thank you for choosing O3 Car Spaa!`;
        messagingService.sendWhatsApp(uRows[0].mobile, msg).catch(console.error);
      }
    }

    await connection.commit();
    res.status(201).json({ success: true, data: { id: insertId, wallet_deducted: walletDeducted }, message: 'Payment recorded' });
  } catch (err) {
    await connection.rollback();
    console.error('createPayment error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to create payment' });
  } finally {
    connection.release();
  }
};

// ─── Create advance payment ─────────────────────────
exports.createAdvancePayment = async (req, res) => {
  try {
    const { customer_id, booking_id, job_cart_id, advance_amount, total_amount, payment_method, due_date, notes } = req.body;

    if (!customer_id || !advance_amount) {
      return res.status(400).json({ success: false, error: 'Customer and advance amount required' });
    }

    const balance = (total_amount || 0) - advance_amount;

    let finalBookingId = booking_id || null;
    let finalJobCartId = job_cart_id || null;

    if (finalJobCartId && !finalBookingId) {
      const [jcRows] = await pool.query('SELECT booking_id FROM job_carts WHERE id = ?', [finalJobCartId]);
      if (jcRows.length && jcRows[0].booking_id) {
        finalBookingId = jcRows[0].booking_id;
      }
    } else if (finalBookingId && !finalJobCartId) {
      const [jcRows] = await pool.query('SELECT id FROM job_carts WHERE booking_id = ?', [finalBookingId]);
      if (jcRows.length) {
        finalJobCartId = jcRows[0].id;
      }
    }

    const [result] = await pool.query(
      `INSERT INTO advance_payments (customer_id, booking_id, job_cart_id, advance_amount, total_amount, balance_due, payment_method, due_date, notes, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [customer_id, finalBookingId, finalJobCartId, advance_amount, total_amount || 0, balance, payment_method || 'cash', due_date, notes, req.user.id]
    );

    // Also record as a payment in v2_payments
    const [payResult] = await pool.query(
      `INSERT INTO v2_payments (customer_id, booking_id, job_cart_id, amount, payment_method, status, notes)
       VALUES (?, ?, ?, ?, ?, 'captured', ?)`,
      [customer_id, finalBookingId, finalJobCartId, advance_amount, payment_method || 'cash', notes || 'Advance payment recorded']
    );

    // Also record transaction in v2_payment_transactions
    await pool.query(
      `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status)
       VALUES (?, 'credit', ?, 'success')`,
      [payResult.insertId, advance_amount]
    );

    // Sync bookings & job_carts tables
    if (finalBookingId) {
      await pool.query(
        'UPDATE bookings SET advance_amount = ?, advance_payment_id = ?, advance_collected_by = ? WHERE id = ?',
        [advance_amount, payResult.insertId, req.user.id, finalBookingId]
      );
    }

    if (finalJobCartId) {
      await pool.query(
        'UPDATE job_carts SET advance_paid = ?, balance_due = ? WHERE id = ?',
        [advance_amount, balance, finalJobCartId]
      );
    }

    // Send WhatsApp receipt for advance
    const [uRows] = await pool.query('SELECT name, mobile FROM users WHERE id = ?', [customer_id]);
    if (uRows.length && uRows[0].mobile) {
      const msg = `Dear ${uRows[0].name}, we have received your advance payment of ₹${advance_amount} via ${payment_method || 'cash'}. Balance due: ₹${balance}. Thank you for choosing O3 Car Spaa!`;
      messagingService.sendWhatsApp(uRows[0].mobile, msg).catch(console.error);
    }

    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Advance payment recorded' });
  } catch (err) {
    console.error('createAdvancePayment error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to record advance payment' });
  }
};
// ─── Get advance payments with balance due ──────────
exports.getAdvancePayments = async (req, res) => {
  try {
    const { status = 'advance_paid' } = req.query;
    const [rows] = await pool.query(`
      SELECT ap.*, u.name as customer_name, u.mobile as customer_mobile, b.advance_payment_id
      FROM advance_payments ap
      LEFT JOIN users u ON u.id = ap.customer_id
      LEFT JOIN bookings b ON b.id = ap.booking_id
      WHERE ap.status = ?
      ORDER BY ap.created_at DESC
    `, [status]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getAdvancePayments error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch advance payments' });
  }
};
// ─── Process refund ─────────────────────────────────
exports.createRefund = async (req, res) => {
  try {
    const { payment_id, amount, reason } = req.body;

    const [payment] = await pool.query('SELECT * FROM v2_payments WHERE id = ?', [payment_id]);
    if (!payment.length) return res.status(404).json({ success: false, error: 'Payment not found' });

    const refundAmount = parseFloat(amount);
    if (!refundAmount || refundAmount <= 0) {
      return res.status(400).json({ success: false, error: 'Valid refund amount is required' });
    }

    if (refundAmount > parseFloat(payment[0].amount)) {
      return res.status(400).json({ success: false, error: 'Refund amount exceeds payment amount' });
    }

    let razorpayRefundId = null;
    if (payment[0].payment_method === 'razorpay' && payment[0].razorpay_payment_id && razorpayInstance) {
      try {
        console.log(`[RAZORPAY REFUND] Refunding payment ID: ${payment[0].razorpay_payment_id} for amount: ${refundAmount}`);
        const refundObj = await razorpayInstance.payments.refund(payment[0].razorpay_payment_id, {
          amount: Math.round(refundAmount * 100), // in paise
          notes: { reason: reason || 'Admin refund' }
        });
        razorpayRefundId = refundObj.id;
      } catch (rzpErr) {
        console.error('Razorpay Refund API error:', rzpErr);
        return res.status(500).json({ success: false, error: `Razorpay Refund failed: ${rzpErr.message}` });
      }
    }

    const [result] = await pool.query(
      `INSERT INTO v2_refunds (payment_id, amount, reason, status, razorpay_refund_id, processed_at) VALUES (?, ?, ?, ?, ?, NOW())`,
      [payment_id, refundAmount, reason, razorpayRefundId ? 'processed' : 'pending', razorpayRefundId]
    );

    // Update payment status in v2_payments
    const newStatus = refundAmount < parseFloat(payment[0].amount) ? 'partial_refund' : 'refunded';
    await pool.query('UPDATE v2_payments SET status = ? WHERE id = ?', [newStatus, payment_id]);
    
    // Insert refund transaction record
    await pool.query(
      `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status) VALUES (?, 'refund', ?, 'success')`,
      [payment_id, refundAmount]
    );

    res.status(201).json({ success: true, data: { id: result.insertId, razorpay_refund_id: razorpayRefundId }, message: 'Refund processed successfully' });
  } catch (err) {
    console.error('createRefund error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to process refund' });
  }
};

// ─── Payment summary stats ──────────────────────────
exports.getPaymentStats = async (req, res) => {
  try {
    const [v2Stats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('captured', 'completed') AND DATE(created_at) = CURDATE() THEN amount END), 0) as v2_today,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'completed') AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount END), 0) as v2_month,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) as v2_pending
      FROM v2_payments
    `);

    const [txStats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' AND transaction_date = CURDATE() THEN amount END), 0) as tx_today,
        COALESCE(SUM(CASE WHEN direction = 'in' AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE()) THEN amount END), 0) as tx_month
      FROM transactions
    `);

    const [billStats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount END), 0) as bill_today,
        COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount END), 0) as bill_month
      FROM manual_bills
    `);

    const [advances] = await pool.query(`
      SELECT COALESCE(SUM(balance_due), 0) as total_balance_due, COUNT(*) as pending_count
      FROM advance_payments WHERE status = 'advance_paid'
    `);

    const [jcPending] = await pool.query(`
      SELECT COALESCE(SUM(balance_due), 0) as jc_pending FROM job_carts WHERE balance_due > 0 AND status != 'cancelled'
    `);

    const todayCollected = Math.max(parseFloat(v2Stats[0].v2_today), parseFloat(txStats[0].tx_today) + parseFloat(billStats[0].bill_today));
    const monthCollected = Math.max(parseFloat(v2Stats[0].v2_month), parseFloat(txStats[0].tx_month) + parseFloat(billStats[0].bill_month));
    const pendingAmount = parseFloat(v2Stats[0].v2_pending) + parseFloat(jcPending[0].jc_pending);

    res.json({
      success: true,
      data: {
        today_collected: todayCollected,
        month_collected: monthCollected,
        pending_amount: pendingAmount,
        total_balance_due: parseFloat(advances[0].total_balance_due)
      }
    });
  } catch (err) {
    console.error('getPaymentStats error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch payment stats' });
  }
};

// ─── Download Invoice PDF ───────────────────────────
const { generatePaymentReceiptPDF } = require('../services/invoiceService');

exports.downloadInvoice = async (req, res) => {
  try {
    const { id } = req.params;
    const { pdfBuffer, invoiceNumber } = await generatePaymentReceiptPDF(id);

    res.set({
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${invoiceNumber}.pdf"`,
      'Content-Length': pdfBuffer.length
    });

    res.send(pdfBuffer);
  } catch (err) {
    console.error('downloadInvoice error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate invoice PDF' });
  }
};

// --- Send Advance Payment Due Reminder ----------------
const { sendPaymentReminder } = require('./whatsappController');
exports.sendReminder = async (req, res) => {
  try {
    const { id } = req.params;
    const [rows] = await pool.query(`
      SELECT ap.*, u.name as customer_name, u.mobile as customer_mobile
      FROM advance_payments ap
      LEFT JOIN users u ON u.id = ap.customer_id
      WHERE ap.id = ?
    `, [id]);
    
    if (!rows.length) return res.status(404).json({ success: false, error: 'Advance payment not found' });
    
    const ap = rows[0];
    if (ap.balance_due <= 0) return res.status(400).json({ success: false, error: 'Balance is already cleared' });
    
    const dueDateStr = ap.due_date ? new Date(ap.due_date).toLocaleDateString('en-IN') : 'Soon';
    await sendPaymentReminder(ap.customer_mobile, ap.customer_name, ap.balance_due, dueDateStr);
    
    res.json({ success: true, message: 'Reminder sent successfully' });
  } catch (err) {
    console.error('sendReminder error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send reminder' });
  }
};

// ─── QR Payment Confirmation ────────────────────────
exports.confirmQrPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const { booking_id, package_request_id, amount, transaction_id } = req.body;
    const customerId = req.user.id;

    if (!amount || !transaction_id) {
      await conn.rollback();
      return res.status(400).json({ success: false, error: 'Amount and transaction_id are required' });
    }

    // Insert into v2_payments
    const [pResult] = await conn.query(
      `INSERT INTO v2_payments 
       (customer_id, booking_id, package_id, amount, payment_method, status, razorpay_payment_id, notes) 
       VALUES (?, ?, ?, ?, 'qr', 'captured', ?, ?)`,
      [
        customerId, 
        booking_id || null, 
        package_request_id ? null : null,
        amount, 
        transaction_id, 
        JSON.stringify({ qr_transaction_id: transaction_id, package_request_id })
      ]
    );
    const paymentId = pResult.insertId;

    // Log transaction
    await conn.query(
      `INSERT INTO v2_payment_transactions 
       (payment_id, transaction_type, amount, status) 
       VALUES (?, 'credit', ?, 'success')`,
      [paymentId, amount]
    );

    // If it's a booking
    if (booking_id) {
      // Fetch booking details
      const [bookings] = await conn.query(
        `SELECT total_amount FROM bookings WHERE id = ?`,
        [booking_id]
      );
      if (bookings.length) {
        const booking = bookings[0];
        const balance = Math.max(0, parseFloat(booking.total_amount || 0) - parseFloat(amount));

        await conn.query(
          `UPDATE bookings 
           SET status = 'pending_approval', advance_payment_id = ?, expires_at = NULL 
           WHERE id = ?`,
          [paymentId, booking_id]
        );

        await conn.query(
          `INSERT INTO advance_payments 
           (customer_id, booking_id, advance_amount, total_amount, balance_due, payment_method, status, notes)
           VALUES (?, ?, ?, ?, ?, 'qr', 'advance_paid', ?)`,
          [
            customerId,
            booking_id,
            amount,
            booking.total_amount || 0,
            balance,
            `Manual QR Payment Ref: ${transaction_id}`
          ]
        );
      }
    }

    await conn.commit();
    res.json({ success: true, message: 'QR payment reference submitted successfully for admin verification.' });
  } catch (err) {
    await conn.rollback();
    console.error('confirmQrPayment error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to confirm QR payment' });
  } finally {
    conn.release();
  }
};

exports.getPendingReminders = async (req, res) => {
  try {
    const franchiseId = req.user?.franchise_id || 1;
    const [rows] = await pool.query(`
      SELECT 
        jc.id AS job_cart_id,
        COALESCE(jc.balance_due, 0) AS balance_due,
        COALESCE(jc.total_amount, COALESCE(jc.advance_paid, 0) + COALESCE(jc.balance_due, 0), 0) AS total_amount,
        COALESCE(jc.advance_paid, 0) AS advance_paid,
        COALESCE(jc.payment_status, 'pending') AS payment_status,
        jc.visit_date,
        jc.status AS job_status,
        jc.completed_at,
        COALESCE(v.registration_no, 'N/A') AS registration_no,
        COALESCE(v.brand, '') AS brand,
        v.customer_id AS customer_id,
        COALESCE(u.name, 'Customer') AS customer_name,
        COALESCE(u.mobile, '') AS customer_mobile
      FROM job_carts jc
      LEFT JOIN vehicles v ON jc.vehicle_id = v.id
      LEFT JOIN users u ON u.id = v.customer_id
      WHERE COALESCE(jc.balance_due, 0) > 0 AND (jc.status != 'cancelled' OR jc.status IS NULL)
        AND (jc.franchise_id = ? OR (jc.franchise_id IS NULL AND ? = 1))
      ORDER BY jc.balance_due DESC, jc.visit_date DESC
    `, [franchiseId, franchiseId]);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getPendingReminders error:', err.message);
    res.json({ success: true, data: [] });
  }
};

