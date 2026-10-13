const pool = require('../config/db');
const reportService = require('../services/reportService');

// ─── SALES REPORT ───────────────────────────
exports.salesReport = async (req, res) => {
  try {
    const today = new Date().toISOString().split('T')[0];
    const firstDay = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString().split('T')[0];
    const from_date = req.query.from_date || firstDay;
    const to_date = req.query.to_date || today;
    const { format = 'json' } = req.query;

    // Revenue breakdown by day
    const [dailyRevenue] = await pool.query(`
      SELECT transaction_date AS date,
             SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END) AS income,
             SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END) AS expenses,
             SUM(CASE WHEN direction = 'in' THEN amount ELSE -amount END) AS net
      FROM transactions
      WHERE transaction_date >= ? AND transaction_date <= ?
      GROUP BY transaction_date
      ORDER BY transaction_date ASC
    `, [from_date, to_date]);

    // Summary totals
    const [totals] = await pool.query(`
      SELECT 
        COALESCE(SUM(CASE WHEN direction = 'in' AND type = 'job_revenue' THEN amount END), 0) AS job_revenue,
        COALESCE(SUM(CASE WHEN direction = 'in' AND type = 'sale_b2b' THEN amount END), 0) AS b2b_sales,
        COALESCE(SUM(CASE WHEN direction = 'in' AND type = 'sale_b2c' THEN amount END), 0) AS b2c_sales,
        COALESCE(SUM(CASE WHEN direction = 'out' AND type = 'purchase' THEN amount END), 0) AS purchases,
        COALESCE(SUM(CASE WHEN direction = 'out' AND type = 'staff_payment' THEN amount END), 0) AS staff_payments,
        COALESCE(SUM(CASE WHEN direction = 'in' THEN amount ELSE 0 END), 0) AS total_income,
        COALESCE(SUM(CASE WHEN direction = 'out' THEN amount ELSE 0 END), 0) AS total_expenses
      FROM transactions
      WHERE transaction_date >= ? AND transaction_date <= ?
    `, [from_date, to_date]);

    const data = {
      period: { from: from_date, to: to_date },
      summary: totals[0],
      daily: dailyRevenue,
    };

    // Export formats
    if (format === 'xlsx') {
      const buffer = await reportService.generateSalesExcel(from_date, to_date, data);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="sales_report_${from_date}_${to_date}.xlsx"`,
      });
      return res.send(buffer);
    }
    if (format === 'pdf') {
      const buffer = await reportService.generatePDFReport(from_date, to_date);
      res.set({
        'Content-Type': 'application/pdf',
        'Content-Disposition': `attachment; filename="sales_report_${from_date}_${to_date}.pdf"`,
      });
      return res.send(buffer);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Sales report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── INVENTORY REPORT ───────────────────────
exports.inventoryReport = async (req, res) => {
  try {
    const { format = 'json' } = req.query;

    // Current stock with low-stock flags
    const [stock] = await pool.query(`
      SELECT id, product_name, unit, quantity, low_stock_threshold,
             (quantity <= low_stock_threshold) AS is_low_stock
      FROM inventory WHERE is_deleted = 0
      ORDER BY product_name ASC
    `);

    // Usage from job products (last 30 days)
    const [usage] = await pool.query(`
      SELECT inv.product_name, SUM(jp.quantity) AS total_used
      FROM job_products jp
      JOIN inventory inv ON jp.product_id = inv.id
      JOIN job_services js ON jp.job_service_id = js.id
      JOIN job_carts jc ON js.job_cart_id = jc.id
      WHERE jc.completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)
      GROUP BY inv.id
      ORDER BY total_used DESC
    `);

    const data = {
      total_items: stock.length,
      low_stock_count: stock.filter(s => s.is_low_stock).length,
      stock,
      usage_last_30_days: usage,
    };

    if (format === 'xlsx') {
      const buffer = await reportService.generateInventoryExcel(data);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="inventory_report.xlsx"`,
      });
      return res.send(buffer);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Inventory report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── JOB CARD REPORT ────────────────────────
exports.jobCardReport = async (req, res) => {
  try {
    const { from_date, to_date, status, staff_id, format = 'json' } = req.query;
    let where = '1=1';
    const params = [];

    if (from_date) { where += ' AND jc.visit_date >= ?'; params.push(from_date); }
    if (to_date) { where += ' AND jc.visit_date <= ?'; params.push(to_date); }
    if (status && status !== 'all') { where += ' AND jc.status = ?'; params.push(status); }
    if (staff_id) { where += ' AND jc.created_by = ?'; params.push(staff_id); }

    const [rows] = await pool.query(`
      SELECT jc.id, jc.visit_date, jc.visit_number, jc.status, jc.notes, jc.invoice_number,
             jc.created_at, jc.completed_at,
             v.registration_no, v.brand, v.model,
             u.name AS customer_name, u.mobile AS customer_mobile,
             creator.name AS created_by_name,
             (SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0)
              + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp 
                          JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)
              FROM job_services js WHERE js.job_cart_id = jc.id) AS total_amount,
             (SELECT GROUP_CONCAT(js3.service_name SEPARATOR ', ')
              FROM job_services js3 WHERE js3.job_cart_id = jc.id) AS services_done
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      LEFT JOIN users creator ON jc.created_by = creator.id
      WHERE ${where}
      ORDER BY jc.visit_date DESC
    `, params);

    // Summary stats
    const totalRevenue = rows.reduce((sum, r) => sum + parseFloat(r.total_amount || 0), 0);
    const statusBreakdown = {};
    rows.forEach(r => { statusBreakdown[r.status] = (statusBreakdown[r.status] || 0) + 1; });

    const data = {
      total_jobs: rows.length,
      total_revenue: totalRevenue,
      status_breakdown: statusBreakdown,
      jobs: rows,
    };

    if (format === 'xlsx') {
      const buffer = await reportService.generateJobCardExcel(data);
      res.set({
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename="job_card_report.xlsx"`,
      });
      return res.send(buffer);
    }

    res.json({ success: true, data });
  } catch (err) {
    console.error('Job card report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── WELCOME REWARDS REPORT ──────────────────────────
exports.welcomeRewardsReport = async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT cr.*, u.name AS customer_name, u.mobile AS customer_mobile
      FROM customer_rewards cr
      JOIN users u ON cr.customer_id = u.id
      WHERE cr.reward_type = 'welcome'
      ORDER BY cr.created_at DESC
    `);
    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('Welcome rewards report error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── BULK CUSTOMER PACKAGE HISTORY EXPORT (Update 19) ───
exports.packageHistoryReport = async (req, res) => {
  try {
    const { date_from, date_to, format = 'xlsx' } = req.query;
    let query = `
      SELECT up.*, u.name as customer_name, u.mobile as customer_mobile, p.name as package_name
      FROM user_packages up
      JOIN users u ON up.user_id = u.id
      JOIN packages p ON up.package_id = p.id
      WHERE 1=1
    `;
    const params = [];
    if (date_from) {
      query += ` AND DATE(up.created_at) >= ?`;
      params.push(date_from);
    }
    if (date_to) {
      query += ` AND DATE(up.created_at) <= ?`;
      params.push(date_to);
    }
    query += ` ORDER BY up.created_at DESC`;

    const [rows] = await pool.query(query, params);

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'O3 Car Spaa';
      const sheet = workbook.addWorksheet('Bulk Package History');

      sheet.columns = [
        { header: 'Customer', key: 'customer_name', width: 25 },
        { header: 'Mobile', key: 'customer_mobile', width: 15 },
        { header: 'Package', key: 'package_name', width: 20 },
        { header: 'Price Paid (₹)', key: 'price_paid', width: 15 },
        { header: 'Purchase Date', key: 'created_at', width: 18 },
        { header: 'Expiry Date', key: 'end_date', width: 18 },
        { header: 'Status', key: 'package_status', width: 15 },
      ];
      sheet.getRow(1).font = { bold: true };

      rows.forEach(r => {
        sheet.addRow({
          customer_name: r.customer_name,
          customer_mobile: r.customer_mobile,
          package_name: r.package_name,
          price_paid: parseFloat(r.price_paid || 0),
          created_at: new Date(r.created_at).toLocaleDateString('en-IN'),
          end_date: r.end_date ? new Date(r.end_date).toLocaleDateString('en-IN') : 'N/A',
          package_status: r.package_status || 'active'
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=Package_History_Report.xlsx`);
      return res.send(Buffer.from(buffer));
    }

    res.json({ success: true, data: rows });
  } catch (err) {
    console.error('packageHistoryReport error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};

// ─── SPECIFIC CUSTOMER PACKAGE HISTORY EXPORT (Update 19) ─
exports.customerPackageHistoryReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'xlsx' } = req.query;

    const [user] = await pool.query('SELECT name, mobile, email FROM users WHERE id = ?', [id]);
    if (!user.length) return res.status(404).json({ success: false, error: 'Customer not found' });
    const customer = user[0];

    const [packages] = await pool.query(`
      SELECT up.*, p.name as package_name
      FROM user_packages up
      JOIN packages p ON up.package_id = p.id
      WHERE up.user_id = ?
      ORDER BY up.created_at DESC
    `, [id]);

    const [renewals] = await pool.query(`
      SELECT pr.*, p.name as package_name
      FROM v2_package_renewals pr
      JOIN packages p ON pr.package_id = p.id
      WHERE pr.customer_id = ?
      ORDER BY pr.renewal_date DESC
    `, [id]);

    const [usage] = await pool.query(`
      SELECT ul.*, s.name as service_name
      FROM v2_package_usage_logs ul
      LEFT JOIN services s ON ul.service_id = s.id
      WHERE ul.customer_id = ?
      ORDER BY ul.created_at DESC
    `, [id]);

    if (format === 'xlsx') {
      const ExcelJS = require('exceljs');
      const workbook = new ExcelJS.Workbook();
      workbook.creator = 'O3 Car Spaa';

      const pkgSheet = workbook.addWorksheet('Packages');
      pkgSheet.columns = [
        { header: 'Package Name', key: 'package_name', width: 25 },
        { header: 'Price Paid (₹)', key: 'price_paid', width: 15 },
        { header: 'Start Date', key: 'start_date', width: 18 },
        { header: 'End Date', key: 'end_date', width: 18 },
        { header: 'Status', key: 'package_status', width: 15 },
      ];
      pkgSheet.getRow(1).font = { bold: true };
      packages.forEach(p => {
        pkgSheet.addRow({
          package_name: p.package_name,
          price_paid: parseFloat(p.price_paid || 0),
          start_date: p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN') : 'N/A',
          end_date: p.end_date ? new Date(p.end_date).toLocaleDateString('en-IN') : 'N/A',
          package_status: p.package_status || 'active'
        });
      });

      const usageSheet = workbook.addWorksheet('Usage Logs');
      usageSheet.columns = [
        { header: 'Service Redeemed', key: 'service_name', width: 25 },
        { header: 'Usage Date', key: 'created_at', width: 18 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      usageSheet.getRow(1).font = { bold: true };
      usage.forEach(u => {
        usageSheet.addRow({
          service_name: u.service_name || 'N/A',
          created_at: new Date(u.created_at).toLocaleDateString('en-IN'),
          notes: u.notes || '—'
        });
      });

      const renSheet = workbook.addWorksheet('Renewals');
      renSheet.columns = [
        { header: 'Renewal Date', key: 'renewal_date', width: 18 },
        { header: 'Package Name', key: 'package_name', width: 25 },
        { header: 'Renewal Price (₹)', key: 'amount_paid', width: 18 },
        { header: 'Notes', key: 'notes', width: 35 },
      ];
      renSheet.getRow(1).font = { bold: true };
      renewals.forEach(r => {
        renSheet.addRow({
          renewal_date: new Date(r.renewal_date).toLocaleDateString('en-IN'),
          package_name: r.package_name,
          amount_paid: parseFloat(r.amount_paid || 0),
          notes: r.notes || '—'
        });
      });

      const buffer = await workbook.xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=PackageHistory_${customer.name.replace(/\s+/g, '_')}.xlsx`);
      return res.send(Buffer.from(buffer));
    }

    if (format === 'pdf') {
      const html = `
      <html>
      <head>
        <style>
          body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; padding: 40px; color: #1c1b1b; }
          .header { border-bottom: 2px solid #D32F2F; padding-bottom: 20px; margin-bottom: 30px; }
          .title { font-size: 22px; font-weight: bold; color: #D32F2F; margin: 0; }
          .subtitle { font-size: 13px; color: #5f5e5e; margin-top: 5px; }
          .customer-box { margin-bottom: 30px; font-size: 14px; background: #f9f9f9; padding: 15px; border-radius: 8px; border: 1px solid #e0e0e0; }
          h3 { font-size: 16px; font-weight: bold; margin-top: 25px; margin-bottom: 10px; border-bottom: 1px solid #e0e0e0; padding-bottom: 5px; }
          table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
          th { background: #f1f1f1; text-align: left; padding: 8px; font-size: 11px; text-transform: uppercase; }
          td { padding: 8px; border-bottom: 1px solid #e0e0e0; font-size: 12px; }
        </style>
      </head>
      <body>
        <div class="header">
          <div class="title">GK AUTO HERB STUDIO</div>
          <div class="subtitle">CUSTOMER PACKAGE CYCLE & USAGE HISTORY</div>
        </div>
        <div class="customer-box">
          <strong>Customer:</strong> ${customer.name}<br/>
          <strong>Mobile:</strong> ${customer.mobile}<br/>
          <strong>Email:</strong> ${customer.email || '—'}<br/>
        </div>

        <h3>Active & Past Packages</h3>
        <table>
          <thead>
            <tr>
              <th>Package Name</th>
              <th>Price Paid</th>
              <th>Start Date</th>
              <th>End Date</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            ${packages.map(p => `
              <tr>
                <td>${p.package_name}</td>
                <td>₹${parseFloat(p.price_paid || 0).toLocaleString('en-IN')}</td>
                <td>${p.start_date ? new Date(p.start_date).toLocaleDateString('en-IN') : 'N/A'}</td>
                <td>${p.end_date ? new Date(p.end_date).toLocaleDateString('en-IN') : 'N/A'}</td>
                <td><span style="font-weight: bold; color: ${p.package_status === 'active' ? '#4CAF50' : '#FF9800'};">${p.package_status || 'active'}</span></td>
              </tr>
            `).join('')}
            ${packages.length === 0 ? '<tr><td colspan="5" style="text-align: center; color: #999;">No packages purchased</td></tr>' : ''}
          </tbody>
        </table>

        <h3>Redemption / Usage Logs</h3>
        <table>
          <thead>
            <tr>
              <th>Service Redeemed</th>
              <th>Usage Date</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${usage.map(u => `
              <tr>
                <td>${u.service_name || 'N/A'}</td>
                <td>${new Date(u.created_at).toLocaleDateString('en-IN')}</td>
                <td>${u.notes || '—'}</td>
              </tr>
            `).join('')}
            ${usage.length === 0 ? '<tr><td colspan="3" style="text-align: center; color: #999;">No service redemptions logged</td></tr>' : ''}
          </tbody>
        </table>

        <h3>Renewal Logs</h3>
        <table>
          <thead>
            <tr>
              <th>Renewal Date</th>
              <th>Package Name</th>
              <th>Amount Paid</th>
              <th>Notes</th>
            </tr>
          </thead>
          <tbody>
            ${renewals.map(r => `
              <tr>
                <td>${new Date(r.renewal_date).toLocaleDateString('en-IN')}</td>
                <td>${r.package_name}</td>
                <td>₹${parseFloat(r.amount_paid || 0).toLocaleString('en-IN')}</td>
                <td>${r.notes || '—'}</td>
              </tr>
            `).join('')}
            ${renewals.length === 0 ? '<tr><td colspan="4" style="text-align: center; color: #999;">No renewals processed</td></tr>' : ''}
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
      res.setHeader('Content-Disposition', `attachment; filename=PackageHistory_${customer.name.replace(/\s+/g, '_')}.pdf`);
      return res.send(pdf);
    }

    res.status(400).json({ success: false, error: 'Invalid format requested' });
  } catch (err) {
    console.error('customerPackageHistoryReport error:', err);
    res.status(500).json({ success: false, error: 'Server error' });
  }
};
