const ExcelJS = require('exceljs');
const pool = require('../config/db');

// ─── Generate Excel Report ──────────────────
exports.generateExcelReport = async (fromDate, toDate, scope = { and: () => '' }) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'O3 Car Spaa';
  workbook.created = new Date();

  // ─── Summary Sheet ───────────────────
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 35 },
    { header: 'Amount (₹)', key: 'amount', width: 20 },
  ];

  // Revenue
  const [revenue] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'in' AND type = 'job_revenue'
     AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`, [fromDate, toDate]
  );
  // Purchases
  const [purchases] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'out' AND type = 'purchase'
     AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`, [fromDate, toDate]
  );
  // Staff payments
  const [staffPay] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'out' AND type = 'staff_payment'
     AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`, [fromDate, toDate]
  );
  // B2B sales
  const [b2b] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'in' AND type = 'sale_b2b'
     AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`, [fromDate, toDate]
  );
  // B2C sales
  const [b2c] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'in' AND type = 'sale_b2c'
     AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`, [fromDate, toDate]
  );

  const totalIn = parseFloat(revenue[0].total) + parseFloat(b2b[0].total) + parseFloat(b2c[0].total);
  const totalOut = parseFloat(purchases[0].total) + parseFloat(staffPay[0].total);

  summarySheet.addRow({ metric: `O3 Car Spaa Report: ${fromDate} to ${toDate}`, amount: '' });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'Job Revenue', amount: parseFloat(revenue[0].total) });
  summarySheet.addRow({ metric: 'B2B Sales', amount: parseFloat(b2b[0].total) });
  summarySheet.addRow({ metric: 'B2C Sales', amount: parseFloat(b2c[0].total) });
  summarySheet.addRow({ metric: 'Total Income', amount: totalIn });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'Purchases', amount: parseFloat(purchases[0].total) });
  summarySheet.addRow({ metric: 'Staff Payments', amount: parseFloat(staffPay[0].total) });
  summarySheet.addRow({ metric: 'Total Expenses', amount: totalOut });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'NET PROFIT / LOSS', amount: totalIn - totalOut });

  // Bold headers and totals
  summarySheet.getRow(1).font = { bold: true };
  summarySheet.getRow(6).font = { bold: true, color: { argb: 'FF2E7D32' } };
  summarySheet.getRow(10).font = { bold: true, color: { argb: 'FFC62828' } };
  summarySheet.getRow(12).font = { bold: true, size: 14 };

  // ─── Transactions Sheet ──────────────
  const txnSheet = workbook.addWorksheet('Transactions');
  txnSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 18 },
    { header: 'Direction', key: 'direction', width: 10 },
    { header: 'Amount (₹)', key: 'amount', width: 15 },
    { header: 'Note', key: 'note', width: 45 },
  ];
  txnSheet.getRow(1).font = { bold: true };

  const [txns] = await pool.query(
    `SELECT transaction_date, type, direction, amount, note FROM transactions
     WHERE transaction_date >= ? AND transaction_date <= ?${scope.and()}
     ORDER BY transaction_date DESC`,
    [fromDate, toDate]
  );
  txns.forEach(t => {
    txnSheet.addRow({
      date: t.transaction_date,
      type: t.type.replace(/_/g, ' '),
      direction: t.direction === 'in' ? 'IN ↑' : 'OUT ↓',
      amount: parseFloat(t.amount),
      note: t.note || '',
    });
  });

  // ─── Buy/Sell Sheet ──────────────────
  const bsSheet = workbook.addWorksheet('Buy & Sell');
  bsSheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Type', key: 'type', width: 12 },
    { header: 'Party', key: 'party', width: 25 },
    { header: 'Product', key: 'product', width: 25 },
    { header: 'Qty', key: 'qty', width: 10 },
    { header: 'Unit Price (₹)', key: 'unit_price', width: 15 },
    { header: 'Total (₹)', key: 'total', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  bsSheet.getRow(1).font = { bold: true };

  const [bsRows] = await pool.query(
    `SELECT * FROM buy_sell WHERE transaction_date >= ? AND transaction_date <= ?${scope.and()}
     ORDER BY transaction_date DESC`,
    [fromDate, toDate]
  );
  bsRows.forEach(r => {
    bsSheet.addRow({
      date: r.transaction_date,
      type: r.type.replace(/_/g, ' '),
      party: r.party_name,
      product: r.product_name,
      qty: parseFloat(r.quantity),
      unit_price: parseFloat(r.unit_price),
      total: parseFloat(r.total_amount),
      status: r.status,
    });
  });

  const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
  return Buffer.from(buffer);
};

// ─── Generate PDF Report ────────────────────
exports.generatePDFReport = async (fromDate, toDate, scope = { and: () => '' }) => {
  // Fetch data
  const [txns] = await pool.query(
    `SELECT transaction_date, type, direction, amount, note FROM transactions
     WHERE transaction_date >= ? AND transaction_date <= ?${scope.and()}
     ORDER BY transaction_date DESC`,
    [fromDate, toDate]
  );

  const [revenue] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'in' AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`,
    [fromDate, toDate]
  );
  const [expenses] = await pool.query(
    `SELECT COALESCE(SUM(amount), 0) AS total FROM transactions
     WHERE direction = 'out' AND transaction_date >= ? AND transaction_date <= ?${scope.and()}`,
    [fromDate, toDate]
  );

  const totalIn = parseFloat(revenue[0].total);
  const totalOut = parseFloat(expenses[0].total);

  const html = `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8">
    <style>
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Manrope', Arial, sans-serif; color: #212121; font-size: 12px; }
      .header { background: #D32F2F; color: white; padding: 20px 30px; }
      .header h1 { font-size: 22px; margin-bottom: 4px; }
      .header p { font-size: 12px; opacity: 0.9; }
      .content { padding: 24px 30px; }
      .summary { display: flex; gap: 20px; margin-bottom: 24px; }
      .summary .card { flex: 1; border: 1px solid #E0E0E0; border-radius: 8px; padding: 16px; }
      .card-title { font-size: 11px; color: #616161; text-transform: uppercase; margin-bottom: 4px; }
      .card-value { font-size: 22px; font-weight: 700; }
      .green { color: #2E7D32; }
      .red { color: #C62828; }
      table { width: 100%; border-collapse: collapse; margin-top: 16px; }
      th { background: #FAFAFA; text-align: left; padding: 8px 12px; font-size: 11px; text-transform: uppercase;
           color: #616161; border-bottom: 2px solid #E0E0E0; }
      td { padding: 8px 12px; border-bottom: 1px solid #EEEEEE; }
      .in { color: #2E7D32; }
      .out { color: #C62828; }
      .footer { text-align: center; color: #9E9E9E; font-size: 10px; margin-top: 30px; padding-top: 12px;
                border-top: 1px solid #E0E0E0; }
    </style>
  </head>
  <body>
    <div class="header">
      <h1>O3 Car Spaa</h1>
      <p>Financial Report: ${fromDate} to ${toDate}</p>
    </div>
    <div class="content">
      <div class="summary">
        <div class="card">
          <div class="card-title">Total Income</div>
          <div class="card-value green">₹${totalIn.toLocaleString('en-IN')}</div>
        </div>
        <div class="card">
          <div class="card-title">Total Expenses</div>
          <div class="card-value red">₹${totalOut.toLocaleString('en-IN')}</div>
        </div>
        <div class="card">
          <div class="card-title">Net Profit</div>
          <div class="card-value ${totalIn - totalOut >= 0 ? 'green' : 'red'}">₹${(totalIn - totalOut).toLocaleString('en-IN')}</div>
        </div>
      </div>
      <h3 style="margin-bottom: 8px;">Transaction Ledger</h3>
      <table>
        <thead><tr><th>Date</th><th>Type</th><th>Direction</th><th>Amount</th><th>Note</th></tr></thead>
        <tbody>
          ${txns.map(t => `
            <tr>
              <td>${t.transaction_date}</td>
              <td>${t.type.replace(/_/g, ' ')}</td>
              <td class="${t.direction}">${t.direction === 'in' ? 'IN ↑' : 'OUT ↓'}</td>
              <td class="${t.direction}">₹${parseFloat(t.amount).toLocaleString('en-IN')}</td>
              <td>${t.note || '—'}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
      <div class="footer">Generated by O3 Car Spaa Studio Management Software</div>
    </div>
  </body>
  </html>`;

  return require('./invoiceService').htmlToPdfBuffer(html, { margin: { top: '0', right: '0', bottom: '0', left: '0' } });
};

// ─── Generate Sales Excel Report (new) ──────
exports.generateSalesExcel = async (fromDate, toDate, data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'O3 Car Spaa';

  // Summary sheet
  const summarySheet = workbook.addWorksheet('Summary');
  summarySheet.columns = [
    { header: 'Metric', key: 'metric', width: 30 },
    { header: 'Amount (₹)', key: 'amount', width: 20 },
  ];
  summarySheet.getRow(1).font = { bold: true };

  const s = data.summary;
  summarySheet.addRow({ metric: `Sales Report: ${fromDate} to ${toDate}`, amount: '' });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'Job Revenue', amount: parseFloat(s.job_revenue) });
  summarySheet.addRow({ metric: 'B2B Sales', amount: parseFloat(s.b2b_sales) });
  summarySheet.addRow({ metric: 'B2C Sales', amount: parseFloat(s.b2c_sales) });
  summarySheet.addRow({ metric: 'Total Income', amount: parseFloat(s.total_income) });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'Purchases', amount: parseFloat(s.purchases) });
  summarySheet.addRow({ metric: 'Staff Payments', amount: parseFloat(s.staff_payments) });
  summarySheet.addRow({ metric: 'Total Expenses', amount: parseFloat(s.total_expenses) });
  summarySheet.addRow({ metric: '', amount: '' });
  summarySheet.addRow({ metric: 'NET PROFIT', amount: parseFloat(s.total_income) - parseFloat(s.total_expenses) });

  // Daily sheet
  const dailySheet = workbook.addWorksheet('Daily Breakdown');
  dailySheet.columns = [
    { header: 'Date', key: 'date', width: 14 },
    { header: 'Income (₹)', key: 'income', width: 15 },
    { header: 'Expenses (₹)', key: 'expenses', width: 15 },
    { header: 'Net (₹)', key: 'net', width: 15 },
  ];
  dailySheet.getRow(1).font = { bold: true };
  data.daily.forEach(d => {
    dailySheet.addRow({
      date: d.date,
      income: parseFloat(d.income),
      expenses: parseFloat(d.expenses),
      net: parseFloat(d.net),
    });
  });

  const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
  return Buffer.from(buffer);
};

// ─── Generate Inventory Excel Report (new) ──
exports.generateInventoryExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'O3 Car Spaa';

  const stockSheet = workbook.addWorksheet('Current Stock');
  stockSheet.columns = [
    { header: 'Product', key: 'product_name', width: 30 },
    { header: 'Unit', key: 'unit', width: 10 },
    { header: 'Quantity', key: 'quantity', width: 12 },
    { header: 'Low Threshold', key: 'low_stock_threshold', width: 15 },
    { header: 'Status', key: 'status', width: 12 },
  ];
  stockSheet.getRow(1).font = { bold: true };
  data.stock.forEach(s => {
    stockSheet.addRow({
      ...s,
      status: s.is_low_stock ? '⚠ LOW' : 'OK',
    });
  });

  const usageSheet = workbook.addWorksheet('Usage (30 Days)');
  usageSheet.columns = [
    { header: 'Product', key: 'product_name', width: 30 },
    { header: 'Total Used', key: 'total_used', width: 15 },
  ];
  usageSheet.getRow(1).font = { bold: true };
  data.usage_last_30_days.forEach(u => usageSheet.addRow(u));

  const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
  return Buffer.from(buffer);
};

// ─── Generate Job Card Excel Report (new) ───
exports.generateJobCardExcel = async (data) => {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'O3 Car Spaa';

  const sheet = workbook.addWorksheet('Job Cards');
  sheet.columns = [
    { header: 'ID', key: 'id', width: 8 },
    { header: 'Date', key: 'visit_date', width: 14 },
    { header: 'Vehicle', key: 'vehicle', width: 25 },
    { header: 'Customer', key: 'customer_name', width: 20 },
    { header: 'Services', key: 'services_done', width: 40 },
    { header: 'Status', key: 'status', width: 12 },
    { header: 'Amount (₹)', key: 'total_amount', width: 15 },
    { header: 'Invoice', key: 'invoice_number', width: 18 },
  ];
  sheet.getRow(1).font = { bold: true };

  data.jobs.forEach(j => {
    sheet.addRow({
      ...j,
      vehicle: `${j.brand} ${j.model} (${j.registration_no})`,
      total_amount: parseFloat(j.total_amount || 0),
    });
  });

  // Summary row
  sheet.addRow({});
  sheet.addRow({ id: '', visit_date: '', vehicle: 'TOTAL', customer_name: `${data.total_jobs} jobs`, services_done: '', status: '', total_amount: data.total_revenue, invoice_number: '' });

  const buffer = await require('../utils/excelFormat').polishWorkbook(workbook).xlsx.writeBuffer();
  return Buffer.from(buffer);
};
