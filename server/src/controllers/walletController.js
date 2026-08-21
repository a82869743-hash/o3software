const pool = require('../config/db');

// ─── Wallet Balance & Stats ───────────────────────────────
exports.getWallet = async (req, res, next) => {
  try {
    const { customer_id } = req.params;

    // IDOR Protection: Customers can only view their own wallet
    if (req.user && req.user.role === 'customer' && parseInt(customer_id) !== parseInt(req.user.id)) {
      return res.status(403).json({ success: false, error: "Access denied — Cannot view another customer's wallet" });
    }

    const [rows] = await pool.query('SELECT * FROM wallets WHERE customer_id = ?', [customer_id]);
    
    if (!rows.length) {
      return res.json({ success: true, data: { balance: 0, total_earned: 0, total_spent: 0 } });
    }
    res.json({ success: true, data: rows[0] });
  } catch (err) {
    next(err);
  }
};

// ─── Wallet Transactions History ───────────────────────────
exports.getTransactions = async (req, res, next) => {
  try {
    const { customer_id } = req.params;
    const { limit = 50, offset = 0 } = req.query;

    // IDOR Protection: Customers can only view their own transaction history
    if (req.user && req.user.role === 'customer' && parseInt(customer_id) !== parseInt(req.user.id)) {
      return res.status(403).json({ success: false, error: "Access denied — Cannot view another customer's wallet transactions" });
    }

    const [rows] = await pool.query(
      `SELECT * FROM wallet_transactions 
       WHERE customer_id = ? 
       ORDER BY created_at DESC 
       LIMIT ? OFFSET ?`,
      [customer_id, parseInt(limit), parseInt(offset)]
    );

    res.json({ success: true, data: rows });
  } catch (err) {
    next(err);
  }
};

// ─── Admin: Add/Deduct Wallet Balance ──────────────────────
exports.adjustBalance = async (req, res, next) => {
  let connection;
  try {
    const { customer_id } = req.params;
    const { amount, type, reason } = req.body; // type: 'credit' or 'debit'
    
    if (!amount || amount <= 0 || !['credit', 'debit'].includes(type)) {
      return res.status(400).json({ success: false, error: 'Invalid amount or type' });
    }

    connection = await pool.getConnection();
    await connection.beginTransaction();

    let [wallet] = await connection.query('SELECT id, balance FROM wallets WHERE customer_id = ? FOR UPDATE', [customer_id]);
    let walletId;
    let newBalance = 0;

    if (!wallet.length) {
      if (type === 'debit') {
        await connection.rollback();
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
      }
      // Create wallet
      const [insertRes] = await connection.query(
        'INSERT INTO wallets (customer_id, balance, total_earned) VALUES (?, ?, ?)',
        [customer_id, amount, amount]
      );
      walletId = insertRes.insertId;
      newBalance = amount;
    } else {
      walletId = wallet[0].id;
      const currentBalance = parseFloat(wallet[0].balance);
      
      if (type === 'debit' && currentBalance < amount) {
        await connection.rollback();
        return res.status(400).json({ success: false, error: 'Insufficient balance' });
      }

      if (type === 'credit') {
        await connection.query(
          'UPDATE wallets SET balance = balance + ?, total_earned = total_earned + ? WHERE id = ?',
          [amount, amount, walletId]
        );
        newBalance = currentBalance + parseFloat(amount);
      } else {
        await connection.query(
          'UPDATE wallets SET balance = balance - ?, total_spent = total_spent + ? WHERE id = ?',
          [amount, amount, walletId]
        );
        newBalance = currentBalance - parseFloat(amount);
      }
    }

    // Log transaction
    await connection.query(
      `INSERT INTO wallet_transactions (wallet_id, customer_id, amount, type, source, description) 
       VALUES (?, ?, ?, ?, 'admin', ?)`,
      [walletId, customer_id, amount, type, reason || 'Admin adjustment']
    );

    await connection.commit();
    res.json({ success: true, message: `Balance ${type === 'credit' ? 'added' : 'deducted'} successfully`, data: { new_balance: newBalance } });
  } catch (err) {
    if (connection) {
      try { await connection.rollback(); } catch(e) {}
    }
    next(err);
  } finally {
    if (connection) connection.release();
  }
};
