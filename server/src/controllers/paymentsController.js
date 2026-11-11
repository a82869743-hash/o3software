const pool = require('../config/db');
const { scopeOf } = require('../utils/franchiseScope');
const { recordMoneyIn, toPaymentMethod, methodFor } = require('../services/moneyIn');
const messagingService = require('../services/messagingService');

// ─── Get wallet balance ────────────────────────────
exports.getWalletBalance = async (req, res) => {
  try {
    const { customer_id } = req.params;
    if (req.user.role === 'customer' && Number(customer_id) !== Number(req.user.id)) {
      return res.status(403).json({ success: false, error: 'Access denied' });
    }
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
    // each studio sees only its own customers' payments (Super Admin viewing all studios sees everything)
    const sc = scopeOf(req);
    if (!sc.all) where.push(`COALESCE(u.franchise_id, 1) = ${sc.fid}`);

    const countSql = `SELECT COUNT(*) as total FROM v2_payments p LEFT JOIN users u ON u.id = p.customer_id WHERE ${where.join(' AND ')}`;
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

    // A job card payment can't be more than what is still due on it
    if (job_cart_id) {
      const [[jcChk]] = await connection.query('SELECT status, total_amount, advance_paid FROM job_carts WHERE id = ? FOR UPDATE', [job_cart_id]);
      if (!jcChk) {
        await connection.rollback();
        return res.status(404).json({ success: false, error: 'Job card not found' });
      }
      if (jcChk.status === 'cancelled') {
        await connection.rollback();
        return res.status(400).json({ success: false, error: 'This job card is cancelled' });
      }
      const due = Math.max(0, parseFloat(jcChk.total_amount || 0) - parseFloat(jcChk.advance_paid || 0));
      if (finalAmount + walletDeducted > due + 0.5) {
        await connection.rollback();
        return res.status(400).json({ success: false, error: due > 0 ? `Only ₹${due.toFixed(2)} is due on this job card` : 'Nothing is due on this job card' });
      }
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
        `INSERT INTO v2_payments (customer_id, job_cart_id, booking_id, amount, payment_method, status, transaction_ref, notes)
         VALUES (?, ?, ?, ?, ?, 'captured', ?, ?)`,
        [customer_id, job_cart_id || null, booking_id || null, finalAmount, toPaymentMethod(payment_method), transaction_ref ? String(transaction_ref).slice(0, 100) : null, notes]
      );
      insertId = result.insertId;

      await connection.query(
        `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status)
         VALUES (?, 'credit', ?, 'success')`,
        [insertId, finalAmount]
      );
    }

    // Accounts: money in (kept apart from the payments list by type, so totals never count it twice)
    if (finalAmount > 0) {
      await connection.query(
        `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
         VALUES (?, ?, ?, 'in', ?, CURDATE(), ?, ?)`,
        [job_cart_id ? 'job_revenue' : 'payment_in', job_cart_id || insertId, finalAmount,
          job_cart_id ? `Job card #${job_cart_id} payment (${payment_method || 'cash'})` : `Payment #${insertId} (${payment_method || 'cash'})`,
          req.user.id, Number(req.franchiseId) || Number(req.user?.franchise_id) || 1]);
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
      [customer_id, finalBookingId, finalJobCartId, advance_amount, total_amount || 0, balance, methodFor('advance_payments', payment_method), due_date, notes, req.user.id]
    );

    // Record the money in Payments AND Accounts (same helper as every other money in)
    const [[cu]] = await pool.query('SELECT franchise_id FROM users WHERE id = ?', [customer_id]);
    const advPaymentId = await recordMoneyIn(pool, {
      customerId: customer_id, amount: advance_amount, method: payment_method || 'cash', type: 'advance_revenue',
      note: notes || 'Advance payment recorded', jobCartId: finalJobCartId, bookingId: finalBookingId,
      franchiseId: (cu && cu.franchise_id) || 1, userId: req.user.id,
    });
    const payResult = { insertId: advPaymentId };

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
      SELECT ap.*, CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END AS balance_due, u.name as customer_name, u.mobile as customer_mobile, b.advance_payment_id
      FROM advance_payments ap
      LEFT JOIN users u ON u.id = ap.customer_id
      LEFT JOIN bookings b ON b.id = ap.booking_id
      LEFT JOIN job_carts jc ON jc.id = ap.job_cart_id
      WHERE ap.status = ?${status === 'advance_paid' ? ` AND (CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END) > 0` : ''}${scopeOf(req).and('u.franchise_id')}
      ORDER BY ap.created_at DESC
    `, [status]);

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getAdvancePayments error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch advance payments' });
  }
};
// ─── Collect a balance due (old / manual dues; job card dues are collected on the job card) ──
exports.collectAdvanceBalance = async (req, res) => {
  const amount = Math.round((Number(req.body.amount) || 0) * 100) / 100;
  const method = ['cash', 'upi', 'card', 'net_banking', 'qr', 'wallet', 'other'].includes(req.body.payment_method) ? req.body.payment_method : 'cash';
  if (amount <= 0) return res.status(400).json({ success: false, error: 'Enter the amount received' });
  const conn = await pool.getConnection();
  try {
    await conn.beginTransaction();
    const [[ap]] = await conn.query(
      `SELECT ap.*, u.name, u.franchise_id FROM advance_payments ap JOIN users u ON u.id = ap.customer_id
       WHERE ap.id = ?${scopeOf(req).and('u.franchise_id')} FOR UPDATE`, [req.params.id]);
    if (!ap) { await conn.rollback(); return res.status(404).json({ success: false, error: 'Balance not found' }); }
    if (ap.status !== 'advance_paid' || Number(ap.balance_due) <= 0) { await conn.rollback(); return res.status(400).json({ success: false, error: 'Nothing is due on this' }); }
    if (ap.job_cart_id) { await conn.rollback(); return res.status(400).json({ success: false, error: `Collect this on job card #${ap.job_cart_id} (Billing), so the bill shows it` }); }
    if (amount > Number(ap.balance_due)) { await conn.rollback(); return res.status(400).json({ success: false, error: `Only ₹${Number(ap.balance_due)} is due` }); }
    const left = Math.round((Number(ap.balance_due) - amount) * 100) / 100;
    const pkg = /package #(\d+)/.exec(ap.notes || '');
    const what = String(ap.notes || '').split('\n')[0].replace(/^Imported balance: /, '').slice(0, 120);
    const note = `Balance received: ${what}`;
    const paymentId = await recordMoneyIn(conn, {
      customerId: ap.customer_id, amount, method, type: 'payment_in', note, bookingId: ap.booking_id,
      franchiseId: ap.franchise_id || 1, userId: req.user.id,
    });
    await conn.query(
      `UPDATE advance_payments SET advance_amount = advance_amount + ?, balance_due = ?, status = ?,
         notes = CONCAT(COALESCE(notes, ''), ?) WHERE id = ?`,
      [amount, left, left <= 0 ? 'balance_paid' : 'advance_paid', `\n₹${amount} received ${new Date().toISOString().slice(0, 10)} (${method})`, ap.id]);
    if (pkg) {
      await conn.query(`UPDATE user_packages SET price_paid = price_paid + ?, payment_status = IF(? <= 0, 'paid', payment_status) WHERE id = ? AND user_id = ?`,
        [amount, left, pkg[1], ap.customer_id]);
    }
    await conn.commit();
    res.json({ success: true, message: left <= 0 ? 'Balance fully paid' : `₹${amount} received, ₹${left} still due`, data: { id: ap.id, payment_id: paymentId, balance_due: left } });
  } catch (err) {
    await conn.rollback().catch(() => {});
    console.error('collectAdvanceBalance error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to record the payment' });
  } finally {
    conn.release();
  }
};
// ─── Process refund ─────────────────────────────────
exports.createRefund = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { payment_id, amount, reason } = req.body;
    const refundAmount = parseFloat(amount);
    if (!refundAmount || refundAmount <= 0) {
      conn.release();
      return res.status(400).json({ success: false, error: 'Valid refund amount is required' });
    }
    await conn.beginTransaction();
    // Lock the payment row so two refunds tapped at the same moment run one after the other.
    const [payment] = await conn.query(
      'SELECT p.*, u.franchise_id AS customer_franchise_id FROM v2_payments p LEFT JOIN users u ON u.id = p.customer_id WHERE p.id = ? FOR UPDATE', [payment_id]);
    if (!payment.length || (req.user.role !== 'super_admin' && payment[0].customer_franchise_id && Number(payment[0].customer_franchise_id) !== (Number(req.franchiseId) || Number(req.user?.franchise_id) || 1))) {
      await conn.rollback(); conn.release();
      return res.status(404).json({ success: false, error: 'Payment not found' });
    }

    const [[done]] = await conn.query('SELECT COALESCE(SUM(amount), 0) AS total FROM v2_refunds WHERE payment_id = ?', [payment_id]);
    const canRefund = parseFloat(payment[0].amount) - parseFloat(done.total || 0);
    if (refundAmount > canRefund + 0.001) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, error: canRefund > 0.001 ? `Only ₹${canRefund.toFixed(2)} can still be refunded on this payment` : 'This payment is already fully refunded' });
    }

    const [result] = await conn.query(
      `INSERT INTO v2_refunds (payment_id, amount, reason, status, processed_at) VALUES (?, ?, ?, 'pending', NOW())`,
      [payment_id, refundAmount, reason]
    );

    // Update payment status in v2_payments
    const newStatus = refundAmount < canRefund - 0.001 ? 'partial_refund' : 'refunded';
    await conn.query('UPDATE v2_payments SET status = ? WHERE id = ?', [newStatus, payment_id]);

    // Insert refund transaction record
    await conn.query(
      `INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status) VALUES (?, 'refund', ?, 'success')`,
      [payment_id, refundAmount]
    );

    // Accounts: money out
    await conn.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES ('refund', ?, ?, 'out', ?, CURDATE(), ?, ?)`,
      [payment_id, refundAmount, `Refund on payment #${payment_id}${reason ? ` — ${String(reason).slice(0, 120)}` : ''}`,
        req.user.id, Number(req.franchiseId) || Number(req.user?.franchise_id) || 1]);

    await conn.commit();
    conn.release();
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Refund processed successfully' });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error('createRefund error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to process refund' });
  }
};


// ─── Payment summary stats ──────────────────────────
exports.getPaymentStats = async (req, res) => {
  try {
    const [v2Stats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN status IN ('captured', 'completed') AND payment_method <> 'wallet' AND DATE(created_at) = CURDATE() THEN amount END), 0) as v2_today,
        COALESCE(SUM(CASE WHEN status IN ('captured', 'completed') AND payment_method <> 'wallet' AND MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount END), 0) as v2_month,
        COALESCE(SUM(CASE WHEN status = 'pending' THEN amount END), 0) as v2_pending
      FROM v2_payments
      WHERE 1=1${scopeOf(req).all ? '' : ` AND customer_id IN (SELECT id FROM users WHERE franchise_id = ${scopeOf(req).fid})`}
    `);

    const [txStats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN direction = 'in' AND transaction_date = CURDATE() THEN amount END), 0) as tx_today,
        COALESCE(SUM(CASE WHEN direction = 'in' AND MONTH(transaction_date) = MONTH(CURDATE()) AND YEAR(transaction_date) = YEAR(CURDATE()) THEN amount END), 0) as tx_month
      FROM transactions
      WHERE type NOT IN (${require('../services/moneyIn').MIRRORED_TYPES.map(t => `'${t}'`).join(', ')})${scopeOf(req).and()}
    `);

    const [billStats] = await pool.query(`
      SELECT
        COALESCE(SUM(CASE WHEN DATE(created_at) = CURDATE() THEN amount END), 0) as bill_today,
        COALESCE(SUM(CASE WHEN MONTH(created_at) = MONTH(CURDATE()) AND YEAR(created_at) = YEAR(CURDATE()) THEN amount END), 0) as bill_month
      FROM manual_bills${scopeOf(req).where()}
    `);

    const [advances] = await pool.query(`
      SELECT COALESCE(SUM(CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END), 0) as total_balance_due, COUNT(*) as pending_count
      FROM advance_payments ap JOIN users u ON u.id = ap.customer_id LEFT JOIN job_carts jc ON jc.id = ap.job_cart_id
      WHERE ap.status = 'advance_paid' AND (CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END) > 0${scopeOf(req).and('u.franchise_id')}
    `);

    const [jcPending] = await pool.query(`
      SELECT COALESCE(SUM(balance_due), 0) as jc_pending FROM job_carts WHERE balance_due > 0 AND status != 'cancelled'${scopeOf(req).and()}
    `);

    // Same money the list shows (payments) + other income kept only in accounts (quick wash etc.) + manual bills
    const todayCollected = parseFloat(v2Stats[0].v2_today) + parseFloat(txStats[0].tx_today) + parseFloat(billStats[0].bill_today);
    const monthCollected = parseFloat(v2Stats[0].v2_month) + parseFloat(txStats[0].tx_month) + parseFloat(billStats[0].bill_month);
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
    const id = /^\d+$/.test(String(req.params.id)) ? Number(req.params.id) : 0;
    const [[pay]] = await pool.query('SELECT id, customer_id FROM v2_payments WHERE id = ?', [id]);
    if (!pay || (req.user.role === 'customer' && pay.customer_id !== req.user.id)) {
      return res.status(404).json({ success: false, error: 'Receipt not found' });
    }
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
      SELECT ap.*, CASE WHEN jc.id IS NULL THEN ap.balance_due WHEN jc.status = 'cancelled' THEN 0 ELSE GREATEST(jc.balance_due, 0) END AS balance_due, u.name as customer_name, u.mobile as customer_mobile
      FROM advance_payments ap
      LEFT JOIN users u ON u.id = ap.customer_id
      LEFT JOIN job_carts jc ON jc.id = ap.job_cart_id
      WHERE ap.id = ? AND ap.status = 'advance_paid'${scopeOf(req).and('u.franchise_id')}
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
// Studio confirmed the QR money: count it everywhere (Payments, Accounts, booking, job card, package request).
async function applyConfirmedQr(conn, pay, userId) {
  const notes = (() => { try { return JSON.parse(pay.notes || '{}'); } catch { return {}; } })();
  const [[cu]] = await conn.query('SELECT franchise_id FROM users WHERE id = ?', [pay.customer_id]);
  const fid = (cu && Number(cu.franchise_id)) || 1;
  await conn.query("UPDATE v2_payments SET status = 'captured' WHERE id = ?", [pay.id]);
  const amount = Number(pay.amount);

  if (notes.package_request_id) {
    // activates the package and writes the Accounts row, using this payment
    const r = await require('./packagesController')._approveRequestInternal(conn, notes.package_request_id, pay.id, { method: 'qr', userId });
    if (r && r.success === false) return { error: `${r.error}. Reject this payment and return the money to the customer.` };
    return {};
  }

  await recordMoneyIn(conn, { customerId: pay.customer_id, amount, method: 'qr', type: 'advance_revenue', refId: pay.id, skipPayment: true,
    bookingId: pay.booking_id, note: `QR advance${pay.booking_id ? ` for booking #${pay.booking_id}` : ''} (UTR ${pay.transaction_ref})`, franchiseId: fid, userId });

  if (pay.booking_id) {
    const [[bk]] = await conn.query('SELECT id, total_amount, advance_amount, advance_payment_id, status FROM bookings WHERE id = ? FOR UPDATE', [pay.booking_id]);
    if (bk && ['cancelled', 'rejected', 'expired'].includes(bk.status)) {
      // money did come in, but the booking is closed: show it under "Refunds to give"
      await conn.query('UPDATE bookings SET refund_due = COALESCE(refund_due, 0) + ?, refunded_at = NULL WHERE id = ?', [amount, bk.id]);
      return {};
    }
    if (bk) {
      const prev = bk.advance_payment_id ? Number(bk.advance_amount || 0) : 0;
      const adv = Math.round((prev + amount) * 100) / 100;
      await conn.query(
        `UPDATE bookings SET advance_amount = ?, advance_payment_id = ?, advance_collected_by = ?,
           status = IF(status = 'pending_payment', 'pending_approval', status), expires_at = NULL WHERE id = ?`,
        [adv, pay.id, userId, bk.id]);
      const [[jc]] = await conn.query("SELECT id, total_amount, advance_paid FROM job_carts WHERE booking_id = ? AND status <> 'cancelled' ORDER BY id DESC LIMIT 1 FOR UPDATE", [bk.id]);
      if (jc) {
        const paid = Math.round((Number(jc.advance_paid || 0) + amount) * 100) / 100;
        await conn.query(
          "UPDATE job_carts SET advance_paid = ?, balance_due = GREATEST(0, total_amount - ?), payment_status = IF(total_amount - ? <= 0.5, 'paid', IF(? > 0, 'partial', payment_status)) WHERE id = ?",
          [paid, paid, paid, paid, jc.id]);
      }
      await conn.query(
        `INSERT INTO advance_payments (customer_id, booking_id, job_cart_id, advance_amount, total_amount, balance_due, payment_method, status, notes, created_by)
         VALUES (?, ?, ?, ?, ?, ?, 'qr', 'advance_paid', ?, ?)`,
        [pay.customer_id, bk.id, jc ? jc.id : null, amount, bk.total_amount || 0, Math.max(0, Number(bk.total_amount || 0) - adv), `QR payment, UTR ${pay.transaction_ref}`, userId]);
    }
  }
  return {};
}

// POST /payments/qr-confirm — the customer (or the studio) sends the UPI reference (UTR) of a QR payment.
// From a customer it waits as "pending" until the studio checks the bank and confirms it (POST /payments/:id/qr-verify).
// From the studio it counts straight away.
exports.confirmQrPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const { booking_id, package_request_id } = req.body;
    const amount = Math.round(Number(req.body.amount) * 100) / 100;
    const utr = String(req.body.transaction_id || '').trim();
    const isCustomer = req.user.role === 'customer';
    if (!(amount > 0)) { conn.release(); return res.status(400).json({ success: false, error: 'Enter the amount you paid' }); }
    if (!/^[A-Za-z0-9]{6,40}$/.test(utr)) { conn.release(); return res.status(400).json({ success: false, error: 'Enter the UPI reference (UTR) — 6 to 40 letters or numbers' }); }
    if (!booking_id === !package_request_id) { conn.release(); return res.status(400).json({ success: false, error: 'Choose the booking or the package this payment is for' }); }

    await conn.beginTransaction();
    const myFid = Number(req.franchiseId) || Number(req.user.franchise_id) || 1;
    let customerId, maxAmount, label;
    if (booking_id) {
      const [[bk]] = await conn.query('SELECT id, customer_id, status, total_amount, franchise_id FROM bookings WHERE id = ? FOR UPDATE', [booking_id]);
      if (!bk || (isCustomer && Number(bk.customer_id) !== Number(req.user.id))
        || (!isCustomer && req.user.role !== 'super_admin' && Number(bk.franchise_id || 1) !== myFid)) {
        await conn.rollback(); conn.release(); return res.status(404).json({ success: false, error: 'Booking not found' });
      }
      if (!['pending_payment', 'pending_approval', 'confirmed', 'in_progress', 'reschedule_required'].includes(bk.status)) {
        await conn.rollback(); conn.release(); return res.status(422).json({ success: false, error: `This booking is ${String(bk.status).replace('_', ' ')} — no payment can be added` });
      }
      const [[paid]] = await conn.query("SELECT COALESCE(SUM(amount), 0) AS s FROM v2_payments WHERE booking_id = ? AND status IN ('pending', 'captured')", [bk.id]);
      customerId = bk.customer_id; maxAmount = Number(bk.total_amount || 0) - Number(paid.s || 0); label = `booking #${bk.id}`;
    } else {
      const [[pr]] = await conn.query('SELECT id, customer_id, status, price, franchise_id FROM package_requests WHERE id = ? FOR UPDATE', [package_request_id]);
      if (!pr || (isCustomer && Number(pr.customer_id) !== Number(req.user.id))
        || (!isCustomer && req.user.role !== 'super_admin' && Number(pr.franchise_id || 1) !== myFid)) {
        await conn.rollback(); conn.release(); return res.status(404).json({ success: false, error: 'Package request not found' });
      }
      if (pr.status !== 'pending') { await conn.rollback(); conn.release(); return res.status(422).json({ success: false, error: `This package request is already ${pr.status}` }); }
      const [[paid]] = await conn.query(
        "SELECT COALESCE(SUM(amount), 0) AS s FROM v2_payments WHERE payment_method = 'qr' AND status IN ('pending', 'captured') AND JSON_VALID(notes) AND JSON_EXTRACT(notes, '$.package_request_id') = ?",
        [pr.id]);
      customerId = pr.customer_id; maxAmount = Number(pr.price || 0) - Number(paid.s || 0); label = `package request #${pr.id}`;
      // a package is paid in full in one go (it is switched on when the payment is confirmed)
      if (maxAmount > 0.5 && Math.abs(amount - maxAmount) > 0.5) {
        await conn.rollback(); conn.release();
        return res.status(400).json({ success: false, error: `Pay the full package price of ₹${maxAmount.toFixed(2)}` });
      }
    }
    if (amount > maxAmount + 0.5) {
      await conn.rollback(); conn.release();
      return res.status(400).json({ success: false, error: maxAmount > 0.5 ? `Only ₹${maxAmount.toFixed(2)} is left to pay on this ${label.split(' #')[0]}` : 'This is already fully paid' });
    }
    const [[dupUtr]] = await conn.query("SELECT id FROM v2_payments WHERE transaction_ref = ? AND status IN ('pending', 'captured') LIMIT 1", [utr]);
    if (dupUtr) { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, error: 'This UPI reference was already used for another payment' }); }

    const [pResult] = await conn.query(
      `INSERT INTO v2_payments (customer_id, booking_id, package_id, amount, payment_method, status, transaction_ref, notes)
       VALUES (?, ?, NULL, ?, 'qr', 'pending', ?, ?)`,
      [customerId, booking_id || null, amount, utr, JSON.stringify({ qr_transaction_id: utr, package_request_id: package_request_id ? Number(package_request_id) : undefined,
        payment_qr_id: req.body.payment_qr_id ? Number(req.body.payment_qr_id) : undefined, entered_by: req.user.id })]
    );
    const pay = { id: pResult.insertId, customer_id: customerId, booking_id: booking_id || null, amount, transaction_ref: utr,
      notes: JSON.stringify({ qr_transaction_id: utr, package_request_id: package_request_id ? Number(package_request_id) : undefined }) };

    if (isCustomer) {
      // keep the booking waiting for the studio (it must not expire while the studio checks the bank)
      if (booking_id) await conn.query("UPDATE bookings SET status = IF(status = 'pending_payment', 'pending_approval', status), expires_at = NULL WHERE id = ?", [booking_id]);
    } else {
      const r = await applyConfirmedQr(conn, pay, req.user.id);
      if (r.error) { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, error: r.error.replace(' Reject this payment and return the money to the customer.', '') }); }
    }
    await conn.query("INSERT INTO v2_payment_transactions (payment_id, transaction_type, amount, status) VALUES (?, 'credit', ?, ?)",
      [pay.id, amount, isCustomer ? 'pending' : 'success']);

    await conn.commit(); conn.release();
    res.json({ success: true, data: { payment_id: pay.id, status: isCustomer ? 'pending' : 'captured' },
      message: isCustomer ? 'Payment reference sent. The studio will check it and confirm.' : 'QR payment recorded' });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error('confirmQrPayment error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to save the QR payment' });
  }
};

// POST /payments/:id/qr-verify { action: 'confirm' | 'reject', reason } — studio checked the bank app.
exports.verifyQrPayment = async (req, res) => {
  const conn = await pool.getConnection();
  try {
    const action = req.body?.action;
    if (!['confirm', 'reject'].includes(action)) { conn.release(); return res.status(400).json({ success: false, error: 'Choose confirm or reject' }); }
    await conn.beginTransaction();
    const [[pay]] = await conn.query(
      "SELECT p.*, u.franchise_id AS cust_fid FROM v2_payments p LEFT JOIN users u ON u.id = p.customer_id WHERE p.id = ? FOR UPDATE", [req.params.id]);
    const myFid = Number(req.franchiseId) || Number(req.user.franchise_id) || 1;
    if (!pay || pay.payment_method !== 'qr' || (req.user.role !== 'super_admin' && Number(pay.cust_fid || 1) !== myFid)) {
      await conn.rollback(); conn.release(); return res.status(404).json({ success: false, error: 'QR payment not found' });
    }
    if (pay.status !== 'pending') { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, error: `This payment is already ${pay.status === 'captured' ? 'confirmed' : pay.status}` }); }
    if (action === 'confirm') {
      const r = await applyConfirmedQr(conn, pay, req.user.id);
      if (r.error) { await conn.rollback(); conn.release(); return res.status(409).json({ success: false, error: r.error }); }
      await conn.query("UPDATE v2_payment_transactions SET status = 'success' WHERE payment_id = ?", [pay.id]);
    } else {
      const reason = String(req.body?.reason || 'Not found in the bank').slice(0, 200);
      await conn.query("UPDATE v2_payments SET status = 'failed', notes = JSON_SET(IF(JSON_VALID(notes), notes, '{}'), '$.rejected_reason', ?) WHERE id = ?", [reason, pay.id]);
      await conn.query("UPDATE v2_payment_transactions SET status = 'failed' WHERE payment_id = ?", [pay.id]);
    }
    await conn.commit(); conn.release();
    if (action === 'reject' && pay.customer_id) {
      pool.query('SELECT name, mobile FROM users WHERE id = ?', [pay.customer_id]).then(([[u]]) => {
        if (u && u.mobile) messagingService.sendWhatsApp(u.mobile, `Dear ${u.name}, we could not find your UPI payment of Rs ${Number(pay.amount)} (ref ${pay.transaction_ref}). Please send the right reference, or pay at the studio. - O3 Car Spaa`).catch(() => {});
      }).catch(() => {});
    }
    res.json({ success: true, message: action === 'confirm' ? 'Payment confirmed and counted' : 'Payment marked as not received' });
  } catch (err) {
    try { await conn.rollback(); } catch {}
    conn.release();
    console.error('verifyQrPayment error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to update the QR payment' });
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
        jc.payment_reminder_count, jc.last_payment_reminder_at,
        COALESCE(jc.payment_status, 'pending') AS payment_status,
        jc.visit_date,
        jc.status AS job_status,
        jc.completed_at,
        COALESCE(v.registration_no, 'N/A') AS registration_no,
        COALESCE(v.brand, '') AS brand,
        COALESCE(v.model, '') AS model,
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


// POST /payments/pending-reminders/:jobCartId/sent — remember each payment reminder ("Reminded twice")
exports.markPaymentReminded = async (req, res) => {
  try {
    const [r] = await pool.query('UPDATE job_carts SET payment_reminder_count = payment_reminder_count + 1, last_payment_reminder_at = NOW() WHERE id = ?', [req.params.jobCartId]);
    if (!r.affectedRows) return res.status(404).json({ success: false, error: 'Job card not found' });
    res.json({ success: true });
  } catch (err) {
    console.error('markPaymentReminded error:', err.message);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── Refunds due: advance paid on bookings that were cancelled / rejected ───
exports.getRefundsDue = async (req, res) => {
  try {
    const [rows] = await pool.query(
      `SELECT b.id AS booking_id, b.refund_due, b.status, u.id AS customer_id, u.name AS customer_name, u.mobile AS customer_mobile
       FROM bookings b JOIN users u ON u.id = b.customer_id
       WHERE b.refund_due > 0 AND b.refunded_at IS NULL${scopeOf(req).and('b.franchise_id')} ORDER BY b.id DESC`);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('getRefundsDue error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to load refunds' });
  }
};

// POST /payments/refunds/:bookingId/done { payment_method } — money given back → Accounts (out)
exports.markRefunded = async (req, res) => {
  try {
    const [[b]] = await pool.query(`SELECT id, refund_due, franchise_id FROM bookings WHERE id = ? AND refund_due > 0 AND refunded_at IS NULL${scopeOf(req).and('COALESCE(franchise_id, 1)')}`, [req.params.bookingId]);
    if (!b) return res.status(404).json({ success: false, error: 'No refund due on this booking' });
    await pool.query('UPDATE bookings SET refunded_at = NOW() WHERE id = ?', [b.id]);
    await pool.query(
      `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
       VALUES ('refund', ?, ?, 'out', ?, CURDATE(), ?, ?)`,
      [b.id, b.refund_due, `Advance refunded for booking #${b.id} (${req.body?.payment_method || 'cash'})`, req.user.id, b.franchise_id || 1]);
    res.json({ success: true, message: `₹${b.refund_due} marked refunded` });
  } catch (err) {
    console.error('markRefunded error:', err.message);
    res.status(500).json({ success: false, error: 'Could not mark refunded' });
  }
};
