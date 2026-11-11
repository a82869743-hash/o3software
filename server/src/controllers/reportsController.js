const pool = require('../config/db');
const { scopeOf } = require('../utils/franchiseScope');
const reportService = require('../services/reportService');

// ─── SALES REPORT ───────────────────────────
exports.salesReport = async (req, res) => {
  try {
    const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
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
      WHERE transaction_date >= ? AND transaction_date <= ?${scopeOf(req).and()}
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
      WHERE transaction_date >= ? AND transaction_date <= ?${scopeOf(req).and()}
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
             ((low_stock_threshold > 0 AND quantity <= low_stock_threshold)) AS is_low_stock
      FROM inventory WHERE is_deleted = 0${scopeOf(req).and()}
      ORDER BY product_name ASC
    `);

    // Usage from job products (last 30 days)
    const [usage] = await pool.query(`
      SELECT inv.product_name, SUM(jp.quantity) AS total_used
      FROM job_products jp
      JOIN inventory inv ON jp.product_id = inv.id
      JOIN job_services js ON jp.job_service_id = js.id
      JOIN job_carts jc ON js.job_cart_id = jc.id
      WHERE jc.completed_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)${scopeOf(req).and('jc.franchise_id')}
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
    let where = '1=1' + scopeOf(req).and('jc.franchise_id');
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
             COALESCE(NULLIF(jc.total_amount, 0), GREATEST(0, ((SELECT COALESCE(SUM(js.service_price + js.labor_charges), 0) FROM job_services js WHERE js.job_cart_id = jc.id) + COALESCE((SELECT SUM(jp.quantity * jp.unit_cost) FROM job_products jp JOIN job_services js2 ON jp.job_service_id = js2.id WHERE js2.job_cart_id = jc.id), 0)) - COALESCE(jc.discount_amount, 0))) AS total_amount,
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
      WHERE cr.reward_type = 'welcome'${scopeOf(req).and('u.franchise_id')}
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
      WHERE 1=1${scopeOf(req).and('up.franchise_id')}
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

      const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
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
/**
 * Package History PDF for one customer, in the invoice / job card design.
 * Per package: car, validity, payment, every service's balance and each use. Same numbers as the app.
 */
async function packageStatementPdf(customerId, franchiseId) {
  const [[customer]] = await pool.query('SELECT id, name, mobile, email FROM users WHERE id = ?', [customerId]);
  if (!customer) throw new Error('Customer not found');
  const [packages] = await pool.query(
    'SELECT up.*, p.name AS package_name FROM user_packages up JOIN packages p ON up.package_id = p.id WHERE up.user_id = ? ORDER BY up.created_at DESC', [customerId]);
  const [renewals] = await pool.query(
    'SELECT pr.*, p.name AS package_name FROM v2_package_renewals pr JOIN packages p ON pr.package_id = p.id WHERE pr.customer_id = ? ORDER BY pr.renewal_date DESC', [customerId]);
  const [usage] = await pool.query(
    'SELECT ul.*, s.name AS service_name FROM v2_package_usage_logs ul LEFT JOIN services s ON ul.service_id = s.id WHERE ul.customer_id = ? ORDER BY ul.created_at DESC', [customerId]);

  const esc = (v) => String(v ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const day = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }) : '—';
  const inr = (n) => '₹' + Number(n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
  const TYPE = { hatchback: 'Hatchback', semi_sedan: 'Mini SUV', sedan: 'Sedan', premium_sedan: 'Luxury', suv: 'SUV', premium_suv: 'Luxury + SUV' };
  const { getServiceBreakdown, calendarDaysLeft } = require('./userPackagesController');
  const ids = packages.map(p => p.id);
  const [cars] = ids.length ? await pool.query('SELECT up.id, v.brand, v.model, v.registration_no, v.category FROM user_packages up LEFT JOIN vehicles v ON v.id = up.vehicle_id WHERE up.id IN (?)', [ids]) : [[]];
  // balance per service = package's service count − used count (same rule as booking with a package)
  const [usedRows] = ids.length ? await pool.query('SELECT user_package_id, service_name, used_count, consumed_at, updated_at, job_card_id, booking_id FROM package_usage WHERE user_package_id IN (?)', [ids]) : [[]];
  const bal = [];
  for (const p of packages) {
    for (const sv of await getServiceBreakdown(pool, p.package_id, p.package_name)) {
      const u = usedRows.find(r => r.user_package_id === p.id && String(r.service_name).trim().toLowerCase() === String(sv.service_name).trim().toLowerCase());
      const total = Number(sv.total_count || 0), used = Math.min(total, Number(u?.used_count || 0));
      bal.push({ user_package_id: p.id, service_name: sv.service_name, total_count: total, used_count: used, remaining: Math.max(0, total - used) });
    }
  }
  const [jcs] = await pool.query('SELECT id, invoice_number, booking_id FROM job_carts WHERE booking_id IN (?)', [[0, ...usage.map(u => u.booking_id).filter(Boolean)]]);
  const uses = [
    ...usage.map(u => ({ user_package_id: u.customer_package_id, service_name: u.service_name, used_count: u.services_used || 1, created_at: u.created_at,
      invoice_number: (jcs.find(j => j.booking_id === u.booking_id) || {}).invoice_number, booking_id: u.booking_id })),
    ...usedRows.filter(r => Number(r.used_count) > 0 && !usage.some(u => u.customer_package_id === r.user_package_id))
      .map(r => ({ ...r, created_at: r.consumed_at || r.updated_at })),
  ].sort((a, b) => new Date(b.created_at) - new Date(a.created_at));

  const statusOf = (p) => {
    const left = p.end_date ? calendarDaysLeft(p.end_date) : null;
    const st = String(p.package_status || 'active');
    return st === 'active' && left !== null && left < 0 ? 'expired' : st;
  };
  const blocks = packages.map(p => {
    const car = cars.find(c => c.id === p.id) || {};
    const rows = bal.filter(r => r.user_package_id === p.id);
    const used = uses.filter(u => u.user_package_id === p.id);
    const left = p.end_date ? calendarDaysLeft(p.end_date) : null;
    const status = statusOf(p);
    const carText = [car.brand, car.model].filter(Boolean).join(' ') || 'Car not linked';
    const typeText = TYPE[p.vehicle_segment || car.category] || '';
    return `<div class="sec">
      <div class="sec-h"><div><b>${esc(p.package_name)}</b><span class="m">${esc(carText)}${car.registration_no ? ' · ' + esc(car.registration_no) : ''}${typeText ? ' · ' + typeText : ''}</span></div>
        <span class="pill ${status === 'active' ? 'paid' : 'due'}">${esc(status.toUpperCase())}</span></div>
      <div class="facts">
        <div><span>Price paid</span><b>${inr(p.price_paid)}</b></div>
        <div><span>Payment</span><b>${esc(String(p.payment_status || '—').replace(/_/g, ' '))}</b></div>
        <div><span>Start</span><b>${day(p.start_date)}</b></div>
        <div><span>Valid till</span><b>${day(p.end_date)}</b></div>
        <div><span>Days left</span><b>${left === null ? '—' : left < 0 ? 'Ended' : left}</b></div>
        <div><span>Services left</span><b>${rows.reduce((a, r) => a + r.remaining, 0)}</b></div>
      </div>
      <table class="st"><colgroup><col><col style="width:16%"><col style="width:16%"><col style="width:16%"></colgroup><thead><tr><th>Service</th><th class="r">Total</th><th class="r">Used</th><th class="r">Left</th></tr></thead>
        <tbody>${rows.map(r => `<tr><td>${esc(r.service_name)}</td><td class="r">${r.total_count}</td><td class="r">${r.used_count}</td><td class="r"><b>${r.remaining}</b></td></tr>`).join('')
          || '<tr><td colspan="4" class="empty">No services set on this package</td></tr>'}</tbody></table>
      <div class="lbl">Usage history</div>
      <table class="st"><colgroup><col style="width:18%"><col><col style="width:16%"><col style="width:22%"></colgroup><thead><tr><th>Date</th><th>Service</th><th class="r">Count</th><th>Bill / job card</th></tr></thead>
        <tbody>${used.map(u => `<tr><td>${day(u.consumed_at || u.created_at)}</td><td>${esc(u.service_name)}</td><td class="r">${Number(u.used_count || 1)}</td><td>${esc(u.invoice_number || (u.job_card_id ? 'JC-' + u.job_card_id : u.booking_id ? 'Booking #' + u.booking_id : '—'))}</td></tr>`).join('')
          || '<tr><td colspan="4" class="empty">Not used yet</td></tr>'}</tbody></table>
    </div>`;
  }).join('');
  const renewHtml = renewals.length ? `<div class="sec"><div class="sec-h"><b>Purchases &amp; renewals</b></div>
    <table class="st"><colgroup><col style="width:18%"><col><col style="width:16%"><col style="width:30%"></colgroup><thead><tr><th>Date</th><th>Package</th><th class="r">Amount</th><th>Notes</th></tr></thead><tbody>
    ${renewals.map(r => `<tr><td>${day(r.renewal_date)}</td><td>${esc(r.package_name)}</td><td class="r">${inr(r.amount_paid)}</td><td>${esc(r.notes || '—')}</td></tr>`).join('')}</tbody></table></div>` : '';

  const active = packages.filter(p => statusOf(p) === 'active').length;
  return require('../services/invoiceService').renderStatementPDF({
    franchiseId,
    title: 'PACKAGE HISTORY',
    number: `CUST-${customer.id}`, numberLabel: 'Customer ID',
    date: day(new Date()),
    billTo: { name: customer.name, mobile: customer.mobile, email: customer.email }, billToLabel: 'Customer',
    detailsLabel: 'Summary',
    detailsRows: [
      ['Packages', `${packages.length} (${active} active)`],
      ['Total paid', inr(packages.reduce((a, p) => a + Number(p.price_paid || 0), 0))],
      ['Services left', String(bal.filter(r => packages.some(p => p.id === r.user_package_id && statusOf(p) === 'active')).reduce((a, r) => a + r.remaining, 0))],
      ['Purchases & renewals', String(renewals.length)],
    ],
    bodyHtml: (blocks || '<div class="sec"><table class="st"><tr><td class="empty">No packages bought yet</td></tr></table></div>') + renewHtml,
  });
}
exports.packageStatementPdf = packageStatementPdf;

exports.customerPackageHistoryReport = async (req, res) => {
  try {
    const { id } = req.params;
    const { format = 'xlsx' } = req.query;

    const [user] = await pool.query(`SELECT name, mobile, email FROM users WHERE id = ?${scopeOf(req).and()}`, [id]);
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

      const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
      res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.setHeader('Content-Disposition', `attachment; filename=PackageHistory_${customer.name.replace(/\s+/g, '_')}.xlsx`);
      return res.send(Buffer.from(buffer));
    }

    if (format === 'pdf') {
      const pdf = await packageStatementPdf(id, Number(req.franchiseId) || Number(req.user?.franchise_id) || 1);
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
