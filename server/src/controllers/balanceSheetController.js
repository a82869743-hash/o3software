const pool = require('../config/db');
const ExcelJS = require('exceljs');
const crypto = require('crypto');

// Helper to compile balance sheet details
const fetchBalanceSheetData = async (startDate, endDate) => {
  // 1. Income: Job Cart completions
  const [jobRevenue] = await pool.query(`
    SELECT COALESCE(SUM(
      (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) +
      (SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id) -
      CASE 
        WHEN jc.discount_type = 'fixed' THEN COALESCE(jc.discount_value, 0)
        WHEN jc.discount_type = 'percentage' THEN 
          ( (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) +
            (SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id)
          ) * COALESCE(jc.discount_value, 0) / 100
        ELSE 0
      END
    ), 0) AS total
    FROM job_carts jc
    WHERE jc.status = 'complete' AND DATE(jc.completed_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 2. Income: Package sales
  const [pkgRevenue] = await pool.query(`
    SELECT COALESCE(SUM(price_paid), 0) AS total FROM user_packages
    WHERE payment_status = 'paid' AND DATE(created_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 3. Income: Manual bills
  const [billRevenue] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM manual_bills
    WHERE DATE(created_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 4. Income: Buy-Sell Sell transactions
  const [sellRevenue] = await pool.query(`
    SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
    WHERE type IN ('sell_b2b', 'sell_b2c') AND status = 'completed' AND DATE(transaction_date) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 5. Expense: expenses table (operational)
  const [expRevenue1] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total, COALESCE(SUM(gst_amount), 0) as gst_total
    FROM expenses WHERE DATE(expense_date) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 6. Expense: v2_expenses table (operational)
  const [expRevenue2] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM v2_expenses
    WHERE DATE(expense_date) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 7. Expense: staff salary paid
  const [staffPay] = await pool.query(`
    SELECT COALESCE(SUM(final_salary), 0) AS total FROM staff_salary
    WHERE status = 'paid' AND DATE(updated_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 8. Expense: v2_purchases (inventory purchases)
  const [inventoryPurchases] = await pool.query(`
    SELECT COALESCE(SUM(total_amount), 0) AS total FROM v2_purchases
    WHERE status = 'received' AND DATE(purchase_date) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 9. Expense: refunds
  const [refunds] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM refunds
    WHERE status IN ('approved','processed') AND DATE(created_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // 10. Returns: Sales & Purchase Returns
  const [salesReturns] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM return_bills
    WHERE return_type = 'sales_return' AND DATE(created_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  const [purchaseReturns] = await pool.query(`
    SELECT COALESCE(SUM(amount), 0) AS total FROM return_bills
    WHERE return_type = 'purchase_return' AND DATE(created_at) BETWEEN ? AND ?
  `, [startDate, endDate]);

  // Breakdown expense categories from both tables
  const [expByCategory] = await pool.query(`
    SELECT category, SUM(amount) as total FROM (
      SELECT ec.name as category, e.amount
      FROM expenses e JOIN expense_categories ec ON ec.id = e.category_id
      WHERE DATE(e.expense_date) BETWEEN ? AND ?
      UNION ALL
      SELECT category, amount
      FROM v2_expenses
      WHERE DATE(expense_date) BETWEEN ? AND ?
    ) combined
    GROUP BY category
    ORDER BY total DESC
  `, [startDate, endDate, startDate, endDate]);

  const totalIncome = parseFloat(jobRevenue[0].total) + parseFloat(pkgRevenue[0].total) + parseFloat(billRevenue[0].total) + parseFloat(sellRevenue[0].total) - parseFloat(salesReturns[0].total);
  const totalExpenses = parseFloat(expRevenue1[0].total) + parseFloat(expRevenue2[0].total) + parseFloat(staffPay[0].total) + parseFloat(inventoryPurchases[0].total) + parseFloat(refunds[0].total) - parseFloat(purchaseReturns[0].total);
  const netProfit = totalIncome - totalExpenses;

  // Monthly trends (last 6 months)
  const monthlyTrend = [];
  for (let i = 5; i >= 0; i--) {
    const d = new Date();
    d.setMonth(d.getMonth() - i);
    const year = d.getFullYear();
    const month = d.getMonth() + 1;
    const monthLabel = d.toLocaleString('default', { month: 'long' });
    
    const startOfMonth = `${year}-${String(month).padStart(2, '0')}-01`;
    const endOfMonth = new Date(year, month, 0).toISOString().split('T')[0];

    const [mJob] = await pool.query(`
      SELECT COALESCE(SUM(
        (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) +
        (SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id) -
        CASE 
          WHEN jc.discount_type = 'fixed' THEN COALESCE(jc.discount_value, 0)
          WHEN jc.discount_type = 'percentage' THEN 
            ( (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) +
              (SELECT COALESCE(SUM(jp.quantity * jp.unit_cost), 0) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id)
            ) * COALESCE(jc.discount_value, 0) / 100
          ELSE 0
        END
      ), 0) AS total FROM job_carts jc
      WHERE jc.status = 'complete' AND DATE(jc.completed_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mPkg] = await pool.query(`
      SELECT COALESCE(SUM(price_paid), 0) AS total FROM user_packages
      WHERE payment_status = 'paid' AND DATE(created_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mBill] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM manual_bills
      WHERE DATE(created_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mSell] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total FROM buy_sell
      WHERE type IN ('sell_b2b', 'sell_b2c') AND status = 'completed' AND DATE(transaction_date) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mExp1] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM expenses WHERE DATE(expense_date) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mExp2] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM v2_expenses WHERE DATE(expense_date) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mSalary] = await pool.query(`
      SELECT COALESCE(SUM(final_salary), 0) AS total FROM staff_salary WHERE status = 'paid' AND DATE(updated_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mPurch] = await pool.query(`
      SELECT COALESCE(SUM(total_amount), 0) AS total FROM v2_purchases WHERE status = 'received' AND DATE(purchase_date) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mRef] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM refunds WHERE status IN ('approved','processed') AND DATE(created_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mSR] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM return_bills WHERE return_type = 'sales_return' AND DATE(created_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const [mPR] = await pool.query(`
      SELECT COALESCE(SUM(amount), 0) AS total FROM return_bills WHERE return_type = 'purchase_return' AND DATE(created_at) BETWEEN ? AND ?
    `, [startOfMonth, endOfMonth]);

    const mInc = parseFloat(mJob[0].total) + parseFloat(mPkg[0].total) + parseFloat(mBill[0].total) + parseFloat(mSell[0].total) - parseFloat(mSR[0].total);
    const mExp = parseFloat(mExp1[0].total) + parseFloat(mExp2[0].total) + parseFloat(mSalary[0].total) + parseFloat(mPurch[0].total) + parseFloat(mRef[0].total) - parseFloat(mPR[0].total);

    monthlyTrend.push({
      month: monthLabel,
      year,
      income: mInc,
      expense: mExp,
      profit: mInc - mExp
    });
  }

  return {
    period: { from: startDate, to: endDate },
    income: {
      job_revenue: parseFloat(jobRevenue[0].total),
      bill_revenue: parseFloat(billRevenue[0].total),
      package_revenue: parseFloat(pkgRevenue[0].total),
      trade_revenue: parseFloat(sellRevenue[0].total),
      sales_returns: parseFloat(salesReturns[0].total),
      total: totalIncome
    },
    expenses: {
      operational: parseFloat(expRevenue1[0].total) + parseFloat(expRevenue2[0].total),
      staff_payments: parseFloat(staffPay[0].total),
      purchases: parseFloat(inventoryPurchases[0].total),
      refunds: parseFloat(refunds[0].total),
      purchase_returns: parseFloat(purchaseReturns[0].total),
      total: totalExpenses,
      by_category: expByCategory
    },
    net_profit: netProfit,
    profit_margin: totalIncome > 0 ? ((netProfit / totalIncome) * 100).toFixed(1) : 0,
    monthly_trend: monthlyTrend
  };
};

exports.getBalanceSheet = async (req, res) => {
  try {
    const { from, to } = req.query;
    const startDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];

    const data = await fetchBalanceSheetData(startDate, endDate);
    res.json({ success: true, data });
  } catch (err) {
    console.error('getBalanceSheet error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to generate balance sheet' });
  }
};

exports.exportBalanceSheet = async (req, res) => {
  try {
    const { from, to, format } = req.query;
    const startDate = from || new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const endDate = to || new Date().toISOString().split('T')[0];

    const data = await fetchBalanceSheetData(startDate, endDate);

    if (format === 'xlsx') {
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'O3 Car Spa';
      workbook.created = new Date();

      const summarySheet = workbook.addWorksheet('Balance Sheet');
      summarySheet.columns = [
        { header: 'Particulars', key: 'name', width: 35 },
        { header: 'Amount (₹)', key: 'value', width: 20 },
      ];
      summarySheet.getRow(1).font = { bold: true };

      summarySheet.addRow({ name: `Balance Sheet Statement: ${startDate} to ${endDate}`, value: '' });
      summarySheet.addRow({ name: '', value: '' });
      summarySheet.addRow({ name: 'INCOME / REVENUE', value: '' }).font = { bold: true };
      summarySheet.addRow({ name: '  Job Cart Revenue', value: data.income.job_revenue });
      summarySheet.addRow({ name: '  Package Sales', value: data.income.package_revenue });
      summarySheet.addRow({ name: '  Manual Bills', value: data.income.bill_revenue });
      summarySheet.addRow({ name: '  Trading Sales (B2B/B2C)', value: data.income.trade_revenue });
      summarySheet.addRow({ name: '  Less: Sales Returns', value: -data.income.sales_returns });
      summarySheet.addRow({ name: 'TOTAL REVENUE (A)', value: data.income.total }).font = { bold: true };
      
      summarySheet.addRow({ name: '', value: '' });
      summarySheet.addRow({ name: 'EXPENSES / OUTFLOW', value: '' }).font = { bold: true };
      summarySheet.addRow({ name: '  Operational Expenses', value: data.expenses.operational });
      summarySheet.addRow({ name: '  Staff Salaries Paid', value: data.expenses.staff_payments });
      summarySheet.addRow({ name: '  Inventory Purchases', value: data.expenses.purchases });
      summarySheet.addRow({ name: '  Refunds Processed', value: data.expenses.refunds });
      summarySheet.addRow({ name: '  Less: Purchase Returns', value: -data.expenses.purchase_returns });
      summarySheet.addRow({ name: 'TOTAL EXPENSES (B)', value: data.expenses.total }).font = { bold: true };

      summarySheet.addRow({ name: '', value: '' });
      summarySheet.addRow({ name: 'NET PROFIT / LOSS (A - B)', value: data.net_profit }).font = { bold: true, size: 12 };
      summarySheet.addRow({ name: 'Profit Margin', value: `${data.profit_margin}%` }).font = { italic: true };

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=GKAutoHerb_BalanceSheet_${startDate}_to_${endDate}.xlsx`);
      return res.send(Buffer.from(buffer));
    }

    if (format === 'pdf') {
      const html = `
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1c1b1b; }
          .header { text-align: center; border-bottom: 2px solid #D32F2F; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 24px; font-weight: bold; color: #D32F2F; margin: 0; }
          .subtitle { font-size: 14px; color: #5f5e5e; margin-top: 5px; }
          .summary-grid { display: flex; justify-content: space-between; margin-bottom: 30px; gap: 15px; }
          .card { flex: 1; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0; text-align: center; }
          .card-title { font-size: 12px; font-weight: bold; text-transform: uppercase; color: #5f5e5e; margin-bottom: 5px; }
          .card-value { font-size: 20px; font-weight: bold; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 30px; }
          th { background: #f1f1f1; text-align: left; padding: 10px; font-size: 12px; text-transform: uppercase; }
          td { padding: 10px; border-bottom: 1px solid #e0e0e0; font-size: 13px; }
          .indent { padding-left: 25px; }
          .total-row { font-weight: bold; background: #fafafa; }
          .net-profit { font-size: 16px; font-weight: bold; color: #D32F2F; background: #fff5f5; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">GK AUTO HERB STUDIO</div>
          <div class="subtitle">BALANCE SHEET STATEMENT</div>
          <div class="subtitle">Period: ${startDate} to ${endDate}</div>
        </div>
        <div class="summary-grid">
          <div class="card">
            <div class="card-title">Total Income</div>
            <div class="card-value" style="color: #4CAF50;">₹${data.income.total.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Total Expenses</div>
            <div class="card-value" style="color: #F44336;">₹${data.expenses.total.toLocaleString('en-IN')}</div>
          </div>
          <div class="card">
            <div class="card-title">Net Profit</div>
            <div class="card-value" style="color: ${data.net_profit >= 0 ? '#4CAF50' : '#F44336'};">₹${data.net_profit.toLocaleString('en-IN')}</div>
          </div>
        </div>
        <table>
          <thead>
            <tr>
              <th>Particulars</th>
              <th style="text-align: right;">Amount (₹)</th>
            </tr>
          </thead>
          <tbody>
            <tr class="total-row"><td>INCOME / REVENUE</td><td></td></tr>
            <tr><td class="indent">Job Cart Completed Revenue</td><td style="text-align: right;">₹${data.income.job_revenue.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Package Purchases</td><td style="text-align: right;">₹${data.income.package_revenue.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Manual Invoices</td><td style="text-align: right;">₹${data.income.bill_revenue.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Buy & Sell Trading Sales</td><td style="text-align: right;">₹${data.income.trade_revenue.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Less: Sales Returns</td><td style="text-align: right;">-₹${data.income.sales_returns.toLocaleString('en-IN')}</td></tr>
            <tr class="total-row"><td>Total Income (A)</td><td style="text-align: right; color: #4CAF50;">₹${data.income.total.toLocaleString('en-IN')}</td></tr>
            
            <tr class="total-row"><td>EXPENSES</td><td></td></tr>
            <tr><td class="indent">Operational Expenses</td><td style="text-align: right;">₹${data.expenses.operational.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Staff Salaries Paid</td><td style="text-align: right;">₹${data.expenses.staff_payments.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Inventory Purchases</td><td style="text-align: right;">₹${data.expenses.purchases.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Customer Refunds</td><td style="text-align: right;">₹${data.expenses.refunds.toLocaleString('en-IN')}</td></tr>
            <tr><td class="indent">Less: Purchase Returns</td><td style="text-align: right;">-₹${data.expenses.purchase_returns.toLocaleString('en-IN')}</td></tr>
            <tr class="total-row"><td>Total Expenses (B)</td><td style="text-align: right; color: #F44336;">₹${data.expenses.total.toLocaleString('en-IN')}</td></tr>
            
            <tr class="net-profit">
              <td>NET PROFIT / LOSS (A - B)</td>
              <td style="text-align: right;">₹${data.net_profit.toLocaleString('en-IN')}</td>
            </tr>
          </tbody>
        </table>
      </body>
      </html>`;

      const puppeteer = require('puppeteer');
      const browser = await puppeteer.launch({
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox'],
        executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined,
      });
      const page = await browser.newPage();
      await page.setContent(html, { waitUntil: 'networkidle0' });
      const pdf = await page.pdf({ format: 'A4', printBackground: true });
      await browser.close();

      res.setHeader('Content-Type', 'application/pdf');
      res.setHeader('Content-Disposition', `attachment; filename=GKAutoHerb_BalanceSheet_${startDate}_to_${endDate}.pdf`);
      return res.send(pdf);
    }

    res.status(400).json({ success: false, error: 'Invalid format requested' });
  } catch (err) {
    console.error('exportBalanceSheet error:', err.message);
    res.status(500).json({ success: false, error: 'Failed to export balance sheet' });
  }
};

exports.getExpenses = async (req, res) => {
  try {
    const { page = 1, limit = 20, category_id, from, to } = req.query;
    const offset = (page - 1) * limit;
    let where = ['1=1']; const params = [];
    if (category_id) { where.push('e.category_id=?'); params.push(category_id); }
    if (from) { where.push('e.expense_date>=?'); params.push(from); }
    if (to) { where.push('e.expense_date<=?'); params.push(to); }
    const [cnt] = await pool.query(`SELECT COUNT(*) as total FROM expenses e WHERE ${where.join(' AND ')}`, params);
    const [rows] = await pool.query(`
      SELECT e.*, ec.name as category_name, u.name as created_by_name
      FROM expenses e LEFT JOIN expense_categories ec ON ec.id=e.category_id
      LEFT JOIN users u ON u.id=e.created_by
      WHERE ${where.join(' AND ')} ORDER BY e.expense_date DESC LIMIT ? OFFSET ?
    `, [...params, parseInt(limit), parseInt(offset)]);
    res.json({ success: true, data: rows, pagination: { page: parseInt(page), limit: parseInt(limit), total: cnt[0].total } });
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch expenses' }); }
};

exports.createExpense = async (req, res) => {
  try {
    const { category_id, amount, description, expense_date, payment_method, gst_amount, gst_number } = req.body;
    if (!amount || !category_id) return res.status(400).json({ success: false, error: 'Amount and category required' });
    const [result] = await pool.query(
      `INSERT INTO expenses (category_id, amount, description, expense_date, payment_method, gst_amount, gst_number, created_by) VALUES (?,?,?,?,?,?,?,?)`,
      [category_id, amount, description, expense_date || new Date().toISOString().split('T')[0], payment_method || 'cash', gst_amount || 0, gst_number, req.user.id]
    );
    res.status(201).json({ success: true, data: { id: result.insertId }, message: 'Expense recorded' });
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to create expense' }); }
};

exports.getExpenseCategories = async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM expense_categories WHERE is_active=1 ORDER BY name');
    res.json({ success: true, data: rows });
  } catch (err) { res.status(500).json({ success: false, error: 'Failed to fetch categories' }); }
};
