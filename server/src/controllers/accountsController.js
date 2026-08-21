const pool = require('../config/db');

// ─── SUMMARY (KPI Cards) ───────────────────
exports.summary = async (req, res) => {
  try {
    const defaultToday = new Date().toISOString().slice(0, 10);
    const defaultMonthStart = defaultToday.slice(0, 8) + '01';
    
    const from_date = req.query.from_date || defaultMonthStart;
    const to_date = req.query.to_date || defaultToday;

    // Today's revenue (all IN)
    const [todayRev] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE direction = 'in' AND transaction_date = ?`, [defaultToday]
    );

    // Filtered revenue (all IN inside from_date and to_date)
    const [monthRev] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE direction = 'in'
       AND transaction_date >= ? AND transaction_date <= ?`, [from_date, to_date]
    );

    // Total purchases in date range
    const [purchases] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE type = 'buy'
       AND transaction_date >= ? AND transaction_date <= ?`, [from_date, to_date]
    );

    // B2B sales in date range
    const [b2bSales] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE type = 'sell_b2b'
       AND transaction_date >= ? AND transaction_date <= ?`, [from_date, to_date]
    );

    // B2C sales in date range
    const [b2cSales] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE type = 'sell_b2c'
       AND transaction_date >= ? AND transaction_date <= ?`, [from_date, to_date]
    );

    // Pending staff payments
    const [pendingPay] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM staff_payments WHERE status = 'pending'`
    );

    // Open job carts
    const [openCarts] = await pool.query(
      `SELECT COUNT(*) AS total FROM job_carts WHERE status = 'open'`
    );

    // Low stock items
    const [lowStock] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory WHERE quantity <= low_stock_threshold AND is_deleted = 0`
    );

    res.json({
      success: true,
      data: {
        today_revenue: parseFloat(todayRev[0].total),
        month_revenue: parseFloat(monthRev[0].total),
        total_purchases_month: parseFloat(purchases[0].total),
        total_b2b_sales_month: parseFloat(b2bSales[0].total),
        total_b2c_sales_month: parseFloat(b2cSales[0].total),
        pending_staff_payments: parseFloat(pendingPay[0].total),
        open_job_carts: openCarts[0].total,
        low_stock_items: lowStock[0].total,
      },
    });
  } catch (err) {
    console.error('Accounts summary error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── TRANSACTIONS ───────────────────────────
exports.transactions = async (req, res) => {
  try {
    const { type, direction, from_date, to_date, page = 1, limit = 50 } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(limit);
    let where = '1=1';
    const params = [];

    if (type) { where += ' AND type = ?'; params.push(type); }
    if (direction) { where += ' AND direction = ?'; params.push(direction); }
    if (from_date) { where += ' AND transaction_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND transaction_date <= ?'; params.push(to_date); }

    const [countRows] = await pool.query(`SELECT COUNT(*) AS total FROM transactions WHERE ${where}`, params);

    const [rows] = await pool.query(
      `SELECT t.*, u.name AS created_by_name
       FROM transactions t
       LEFT JOIN users u ON t.created_by = u.id
       WHERE ${where}
       ORDER BY t.transaction_date DESC, t.created_at DESC
       LIMIT ? OFFSET ?`,
      [...params, parseInt(limit), offset]
    );

    res.json({
      success: true,
      data: rows,
      pagination: { page: parseInt(page), limit: parseInt(limit), total: countRows[0].total },
    });
  } catch (err) {
    console.error('Transactions list error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── REPORT (Excel/PDF) ────────────────────
exports.report = async (req, res) => {
  try {
    const { from_date, to_date, format = 'excel' } = req.query;
    if (!from_date || !to_date) {
      return res.status(400).json({ success: false, error: 'from_date and to_date are required' });
    }

    const reportService = require('../services/reportService');

    if (format === 'pdf') {
      const pdfBuffer = await reportService.generatePDFReport(from_date, to_date);
      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=GKAutoHerb_Report_${from_date}_to_${to_date}.pdf`);
      return res.send(pdfBuffer);
    }

    // Default: Excel
    const buffer = await reportService.generateExcelReport(from_date, to_date);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename=GKAutoHerb_Report_${from_date}_to_${to_date}.xlsx`);
    res.send(buffer);
  } catch (err) {
    console.error('Report generation error:', err);
    res.status(500).json({ success: false, error: 'Failed to generate report' });
  }
};

// ─── KPIs (Server-side aggregations for all Accounts tabs) ─────
exports.kpis = async (req, res) => {
  try {
    const defaultToday = new Date().toISOString().slice(0, 10);
    const defaultMonthStart = defaultToday.slice(0, 8) + '01';
    const from_date = req.query.from_date || defaultMonthStart;
    const to_date = req.query.to_date || defaultToday;

    // ── Ledger KPIs (transactions table — all records, not paginated) ──
    const [ledgerIn] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE direction = 'in' AND transaction_date >= ? AND transaction_date <= ?`,
      [from_date, to_date]
    );
    const [ledgerOut] = await pool.query(
      `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
       WHERE direction = 'out' AND transaction_date >= ? AND transaction_date <= ?`,
      [from_date, to_date]
    );

    // ── Buy & Sell KPIs (buy_sell table — all records) ──
    const [bsPurchases] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE type = 'buy' AND transaction_date >= ? AND transaction_date <= ?`,
      [from_date, to_date]
    );
    const [bsSales] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE type IN ('sell_b2b', 'sell_b2c') AND transaction_date >= ? AND transaction_date <= ?`,
      [from_date, to_date]
    );
    const [bsPending] = await pool.query(
      `SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
       WHERE status = 'pending' AND transaction_date >= ? AND transaction_date <= ?`,
      [from_date, to_date]
    );

    // ── Job Cart KPIs ──
    const [jcTotalValue] = await pool.query(
      `SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0)
         + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)
         FROM job_services js WHERE js.job_cart_id = jc.id)
      ), 0) AS total
      FROM job_carts jc WHERE jc.visit_date >= ? AND jc.visit_date <= ?`,
      [from_date, to_date]
    );
    const [jcCompletedValue] = await pool.query(
      `SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0)
         + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)
         FROM job_services js WHERE js.job_cart_id = jc.id)
      ), 0) AS total
      FROM job_carts jc WHERE jc.status = 'complete' AND jc.visit_date >= ? AND jc.visit_date <= ?`,
      [from_date, to_date]
    );
    const [jcOpenCount] = await pool.query(
      `SELECT COUNT(*) AS total FROM job_carts WHERE status = 'open' AND visit_date >= ? AND visit_date <= ?`,
      [from_date, to_date]
    );

    // ── Inventory KPIs (no date filter — snapshot) ──
    const [invTotal] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory WHERE is_deleted = 0`
    );
    const [invTotalUnits] = await pool.query(
      `SELECT COALESCE(SUM(quantity), 0) AS total FROM inventory WHERE is_deleted = 0`
    );
    const [invLowStock] = await pool.query(
      `SELECT COUNT(*) AS total FROM inventory WHERE quantity <= low_stock_threshold AND is_deleted = 0`
    );

    res.json({
      success: true,
      data: {
        ledger: {
          total_in: parseFloat(ledgerIn[0].total),
          total_out: parseFloat(ledgerOut[0].total),
          net_flow: parseFloat(ledgerIn[0].total) - parseFloat(ledgerOut[0].total),
        },
        buy_sell: {
          total_purchases: parseFloat(bsPurchases[0].total),
          total_sales: parseFloat(bsSales[0].total),
          pending_value: parseFloat(bsPending[0].total),
        },
        job_carts: {
          total_value: parseFloat(jcTotalValue[0].total),
          completed_value: parseFloat(jcCompletedValue[0].total),
          open_count: jcOpenCount[0].total,
        },
        inventory: {
          total_items: invTotal[0].total,
          total_units: parseFloat(invTotalUnits[0].total),
          low_stock_count: invLowStock[0].total,
        },
      },
    });
  } catch (err) {
    console.error('KPIs error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── CREATE RETURN NOTE (Update 29) ───────────────────
exports.createReturn = async (req, res) => {
  const connection = await pool.getConnection();
  try {
    await connection.beginTransaction();
    const { original_bill_id, return_type, amount, reason } = req.body;

    if (!original_bill_id || !return_type || !amount) {
      return res.status(400).json({ success: false, error: 'Original Bill ID, return type, and amount are required' });
    }

    // 1. Insert into return_bills
    const [result] = await connection.query(
      `INSERT INTO return_bills (original_bill_id, return_type, amount, reason)
       VALUES (?, ?, ?, ?)`,
      [original_bill_id, return_type, amount, reason || '']
    );

    // 2. Insert into transactions
    const direction = return_type === 'sales_return' ? 'out' : 'in';
    const txnType = return_type === 'sales_return' ? 'sales_return' : 'purchase_return';
    const note = return_type === 'sales_return' 
      ? `Sales Return credit note for Bill #${original_bill_id}` 
      : `Purchase Return debit note for Purchase Bill #${original_bill_id}`;

    try {
      await connection.query(
        `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by)
         VALUES (?, ?, ?, ?, ?, CURDATE(), ?)`,
        [txnType, original_bill_id, amount, direction, note, req.user ? req.user.id : null]
      );
    } catch (txnErr) {
      console.warn('Notice: logging transaction failed, proceeding with return bill:', txnErr.message);
    }

    await connection.commit();
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Return note created successfully' });
  } catch (err) {
    await connection.rollback();
    console.error('Create return error:', err);
    res.status(500).json({ success: false, error: 'Failed to create return note' });
  } finally {
    connection.release();
  }
};

// ─── LIST RETURNS (Update 29) ─────────────────────────
exports.listReturns = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM return_bills ORDER BY created_at DESC');
    res.json({ success: true, data: rows });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch returns list' });
  }
};
