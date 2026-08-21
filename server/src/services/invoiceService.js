const pool = require('../config/db');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// ─── Puppeteer Browser Singleton ───────────────────────────────
// Reuse a single browser instance across all PDF requests to avoid
// cold-starting Chrome for every single invoice (the #1 cause of slow PDFs).
let _browser = null;
let _browserLaunchPromise = null;

async function getBrowser() {
  if (_browser && _browser.isConnected()) return _browser;
  if (_browserLaunchPromise) return _browserLaunchPromise;
  _browserLaunchPromise = (async () => {
    try {
      const launchOptions = {
        headless: 'new',
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
      };
      if (process.env.PUPPETEER_EXECUTABLE_PATH) {
        launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
      }
      _browser = await puppeteer.launch(launchOptions);
      _browser.on('disconnected', () => { _browser = null; _browserLaunchPromise = null; });
      return _browser;
    } catch (e) {
      _browserLaunchPromise = null;
      throw e;
    }
  })();
  return _browserLaunchPromise;
}

async function htmlToPdfBuffer(html, pdfOptions = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    await page.setContent(html, { waitUntil: 'networkidle0', timeout: 15000 });
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
      ...pdfOptions,
    });
    return pdfBuffer;
  } finally {
    await page.close();
  }
}


// â”€â”€â”€ Number-to-Words Converter (Indian format) â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
const ONES = ['', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine',
  'Ten', 'Eleven', 'Twelve', 'Thirteen', 'Fourteen', 'Fifteen', 'Sixteen', 'Seventeen', 'Eighteen', 'Nineteen'];
const TENS = ['', '', 'Twenty', 'Thirty', 'Forty', 'Fifty', 'Sixty', 'Seventy', 'Eighty', 'Ninety'];

function numberToWords(num) {
  if (num === 0) return 'Zero Rupees';
  num = Math.round(num);
  if (num < 0) return 'Minus ' + numberToWords(-num);

  let result = '';

  if (Math.floor(num / 10000000) > 0) {
    result += numberToWords(Math.floor(num / 10000000)) + ' Crore ';
    num %= 10000000;
  }
  if (Math.floor(num / 100000) > 0) {
    result += numberToWords(Math.floor(num / 100000)) + ' Lakh ';
    num %= 100000;
  }
  if (Math.floor(num / 1000) > 0) {
    result += numberToWords(Math.floor(num / 1000)) + ' Thousand ';
    num %= 1000;
  }
  if (Math.floor(num / 100) > 0) {
    result += ONES[Math.floor(num / 100)] + ' Hundred ';
    num %= 100;
  }
  if (num > 0) {
    if (result !== '') result += 'and ';
    if (num < 20) {
      result += ONES[num];
    } else {
      result += TENS[Math.floor(num / 10)];
      if (num % 10 > 0) result += ' ' + ONES[num % 10];
    }
  }
  return result.trim();
}

function amountInWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = numberToWords(rupees) + ' Rupees';
  if (paise > 0) words += ' and ' + numberToWords(paise) + ' Paise';
  return words;
}

// ─── Format currency Indian style ──────────────────────────────
function formatINR(num) {
  const n = parseFloat(num) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Load logo as base64 ───────────────────────────────────────
function getLogoBase64() {
  try {
    const candidates = ['o3_logo.jpeg', 'logo.jpeg', 'logo.png', 'gk_logo.png'];
    for (const f of candidates) {
      const logoPath = path.join(__dirname, '..', 'assets', f);
      if (fs.existsSync(logoPath)) {
        const data = fs.readFileSync(logoPath);
        const mime = (f.endsWith('.jpeg') || f.endsWith('.jpg')) ? 'image/jpeg' : 'image/png';
        return `data:${mime};base64,${data.toString('base64')}`;
      }
    }
  } catch (e) { /* silent */ }
  return null;
}

async function generateInvoicePDF(jobCartId) {
  const conn = await pool.getConnection();
  try {
    const [carts] = await conn.query(`
      SELECT jc.*, v.registration_no, v.brand, v.model, v.customer_id,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE jc.id = ?
    `, [jobCartId]);

    if (!carts.length) throw new Error('Job cart not found');
    const cart = carts[0];

    const [services] = await conn.query(`
      SELECT js.*, 
        COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS products_cost
      FROM job_services js
      LEFT JOIN job_products jp ON js.id = jp.job_service_id
      WHERE js.job_cart_id = ?
      GROUP BY js.id
      ORDER BY js.id
    `, [jobCartId]);

    const [settingsRows] = await conn.query('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    let invoiceNumber = cart.invoice_number;
    if (!invoiceNumber) {
      const prefix = settings.invoice_prefix || 'O3';
      invoiceNumber = `${prefix}-DRAFT`;
    }

    let subtotal = 0;
    const serviceRows = services.map((s) => {
      const servicePrice = parseFloat(s.service_price) || 0;
      const laborCharges = parseFloat(s.labor_charges) || 0;
      const productsTotal = parseFloat(s.products_cost) || 0;
      const amount = servicePrice + laborCharges + productsTotal;
      subtotal += amount;

      return {
        name: (s.service_name || '').toUpperCase(),
        qty: '1 PCS',
        rate: `₹${formatINR(amount)}`,
        amount: `₹${formatINR(amount)}`,
      };
    });

    let discountAmt = 0;
    if (cart.discount_type === 'percentage') {
      discountAmt = subtotal * (parseFloat(cart.discount_value || 0) / 100);
    } else if (cart.discount_type === 'fixed') {
      discountAmt = parseFloat(cart.discount_value || 0);
    }
    discountAmt = Math.min(subtotal, Math.max(0, discountAmt));
    const amountAfterDiscount = subtotal - discountAmt;

    const isWithGst = cart.gst_type === 'with_gst';
    const gstPct = isWithGst ? (parseFloat(cart.gst_pct) || 18.00) : 0;
    const gstAmt = isWithGst ? (amountAfterDiscount * (gstPct / 100)) : 0;

    const pickupCharge = parseFloat(cart.pickup_charge || 0);
    const finalTotal = Math.max(0, amountAfterDiscount + gstAmt + pickupCharge);

    const isJobPaid = cart.payment_status === 'paid';
    const advancePaid = parseFloat(cart.advance_paid) || 0;
    const receivedStudio = isJobPaid ? Math.max(0, finalTotal - advancePaid) : 0;
    const balanceDue = isJobPaid ? 0 : Math.max(0, finalTotal - advancePaid);
    const paymentStatusText = isJobPaid ? 'PAID' : 'PENDING';

    const invoiceDate = cart.completed_at
      ? new Date(cart.completed_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : cart.visit_date
        ? new Date(cart.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
        : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const studioGst = settings.studio_gst || '24AAAFO3303J1Z2';

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const serviceRowsHtml = serviceRows.map((s) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">${s.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">${s.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${s.rate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${s.amount}</td>
      </tr>
    `).join('');

    const emptyRowsCount = Math.max(0, 6 - serviceRows.length);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const html = buildInvoiceHTML({
      title: isWithGst ? 'TAX INVOICE' : 'BILL OF SUPPLY',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: cart.customer_name || 'Customer',
      partyMobile: cart.customer_mobile || '-',
      rightLabel: 'Vehicle / Registration',
      rightValue: `${cart.brand || ''} ${cart.model || ''} [${cart.registration_no || '-'}]`.toUpperCase(),
      serviceRowsHtml,
      emptyRows,
      totalQty: serviceRows.length,
      grandTotal: subtotal,
      discountAmt,
      discountType: cart.discount_type,
      discountValue: cart.discount_value,
      isWithGst,
      gstPct,
      gstAmt,
      studioGst,
      finalTotal,
      receivedAmt: receivedStudio,
      balanceDue,
      statusText: paymentStatusText,
      notes: cart.invoice_notes || '',
    });

    const pdfBuffer = await htmlToPdfBuffer(html);
    return { pdfBuffer, invoiceNumber };
  } finally {
    conn.release();
  }
}

async function generateJobCardPDF(jobCartId) {
  const conn = await pool.getConnection();
  try {
    const [carts] = await conn.query(`
      SELECT jc.*, v.registration_no, v.brand, v.model, v.registration_year, v.customer_id,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE jc.id = ?
    `, [jobCartId]);

    if (!carts.length) throw new Error('Job cart not found');
    const cart = carts[0];

    const [services] = await conn.query(`
      SELECT js.*, 
        COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS products_cost
      FROM job_services js
      LEFT JOIN job_products jp ON js.id = jp.job_service_id
      WHERE js.job_cart_id = ?
      GROUP BY js.id
      ORDER BY js.id
    `, [jobCartId]);

    const [belongings] = await conn.query(`
      SELECT description, image_url FROM job_cart_belongings WHERE job_cart_id = ? ORDER BY id ASC
    `, [jobCartId]);

    let totalQty = 0;
    let grandTotal = 0;
    const serviceRows = services.map((s) => {
      const servicePrice = parseFloat(s.service_price) || 0;
      const laborCharges = parseFloat(s.labor_charges) || 0;
      const productsTotal = parseFloat(s.products_cost) || 0;
      const amount = servicePrice + laborCharges + productsTotal;
      totalQty += 1;
      grandTotal += amount;

      return {
        name: (s.service_name || '').toUpperCase(),
        qty: '1 PCS',
        rate: `₹${formatINR(amount)}`,
        amount: `₹${formatINR(amount)}`,
      };
    });

    const advancePaid = parseFloat(cart.advance_paid) || 0;
    const balanceDue = (cart.balance_due !== undefined && cart.balance_due !== null)
      ? parseFloat(cart.balance_due)
      : Math.max(0, grandTotal - advancePaid);

    const visitDateStr = cart.visit_date
      ? new Date(cart.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const invoiceNumber = `JC-${cart.id}`;

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:75px;height:75px;object-fit:contain;" />`
      : `<div style="width:75px;height:75px;background:#2563EB;border-radius:10px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:18px;">O3</div>`;

    const serviceRowsHtml = serviceRows.length > 0 ? serviceRows.map((s) => `
      <tr>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;font-weight:700;text-transform:uppercase;color:#0f172a;">${s.name}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:center;color:#475569;">${s.qty}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;color:#475569;">${s.rate}</td>
        <td style="padding:10px 14px;border-bottom:1px solid #e2e8f0;font-size:11px;text-align:right;font-weight:800;color:#0f172a;">${s.amount}</td>
      </tr>
    `).join('') : `
      <tr>
        <td colspan="4" style="padding:12px;text-align:center;font-size:11px;color:#64748b;font-style:italic;">General Detailing Inspection & Service</td>
      </tr>
    `;

    const belongingsHtml = belongings.length > 0
      ? `<div style="display:flex;flex-direction:column;gap:8px;">
          <div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;">
            ${belongings.map(b => `<div style="font-size:10px;font-weight:700;background:#f8fafc;padding:5px 10px;border-radius:6px;border:1px solid #cbd5e1;color:#0f172a;">✓ ${b.description}</div>`).join('')}
          </div>
          ${belongings.some(b => b.image_url) ? `
            <div style="margin-top:6px;padding-top:6px;border-top:1px dashed #cbd5e1;">
              <div style="font-size:10px;font-weight:800;color:#1e293b;margin-bottom:6px;text-transform:uppercase;letter-spacing:0.5px;">📸 Customer Personal Item Photos:</div>
              <div style="display:flex;flex-wrap:wrap;gap:10px;">
                ${belongings.filter(b => b.image_url).map(b => `
                  <div style="text-align:center;background:#f1f5f9;padding:4px;border-radius:8px;border:1px solid #e2e8f0;">
                    <img src="${b.image_url}" style="width:90px;height:90px;object-fit:cover;border-radius:6px;" />
                    <div style="font-size:8px;font-weight:700;color:#475569;margin-top:4px;max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;">${b.description}</div>
                  </div>
                `).join('')}
              </div>
            </div>
          ` : ''}
        </div>`
      : `<div style="font-size:10px;color:#64748b;font-style:italic;">No customer belongings declared at entry.</div>`;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <title>Job Card #${cart.id}</title>
      <style>
        body { font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #0f172a; margin: 0; padding: 20px; background: #ffffff; }
        .header-box { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #2563eb; padding-bottom: 16px; margin-bottom: 20px; }
        .company-name { font-size: 22px; font-weight: 900; color: #0f172a; text-transform: uppercase; letter-spacing: 0.5px; }
        .company-sub { font-size: 11px; color: #2563eb; font-weight: 700; margin-top: 2px; }
        .jc-title { font-size: 18px; font-weight: 900; color: #2563eb; text-transform: uppercase; text-align: right; }
        .jc-number { font-size: 12px; font-weight: 700; color: #475569; text-align: right; margin-top: 2px; }
        .info-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; margin-bottom: 20px; }
        .info-card { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; }
        .info-title { font-size: 10px; font-weight: 900; text-transform: uppercase; color: #64748b; tracking: 1px; margin-bottom: 6px; }
        .info-row { font-size: 11px; line-height: 1.6; color: #1e293b; }
        .inspector-pill { background: #eff6ff; border: 1px solid #bfdbfe; color: #1e40af; padding: 4px 10px; border-radius: 6px; font-size: 11px; font-weight: 800; display: inline-block; margin-top: 6px; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; }
        th { background: #f1f5f9; color: #334155; font-size: 10px; font-weight: 900; text-transform: uppercase; padding: 10px 14px; border-bottom: 2px solid #cbd5e1; }
        .totals-box { margin-left: auto; width: 240px; background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 10px; padding: 12px 16px; font-size: 11px; margin-bottom: 20px; }
        .totals-row { display: flex; justify-content: space-between; padding: 3px 0; font-weight: 700; }
        .belongings-box { background: #fffbebfb; border: 1px solid #fde68a; border-radius: 10px; padding: 14px 16px; margin-bottom: 20px; }
        .signature-box { display: grid; grid-template-columns: 1fr 1fr; gap: 20px; margin-top: 30px; pt: 20px; border-top: 1px solid #e2e8f0; }
        .sig-line { border-top: 1px solid #94a3b8; margin-top: 40px; font-size: 10px; font-weight: 800; color: #475569; text-align: center; text-transform: uppercase; }
      </style>
    </head>
    <body>
      <div class="header-box">
        <div style="display:flex;align-items:center;gap:12px;">
          ${logoHtml}
          <div>
            <div class="company-name">O3 Car Spa</div>
            <div class="company-sub">Official Job Card & Vehicle Intake Inspection</div>
            <div style="font-size:10px;color:#64748b;margin-top:2px;">Anand Branch • Premier Detailing Studio</div>
          </div>
        </div>
        <div>
          <div class="jc-title">JOB CARD</div>
          <div class="jc-number">JC #${cart.id}</div>
          <div style="font-size:10px;color:#64748b;text-align:right;margin-top:4px;">Date: ${visitDateStr}</div>
        </div>
      </div>

      <div class="info-grid">
        <div class="info-card">
          <div class="info-title">Vehicle & Pre-Inspection Details</div>
          <div class="info-row"><strong>Registration No:</strong> <span style="font-size:13px;font-weight:900;color:#2563eb;">${cart.registration_no || 'GJ06AB1234'}</span></div>
          <div class="info-row"><strong>Car Model:</strong> ${cart.brand || ''} ${cart.model || ''}</div>
          <div class="info-row"><strong>Visit Count:</strong> Visit #${cart.visit_number || 1}</div>
          <div class="inspector-pill">🔍 Pre-Inspected By: ${cart.pre_inspector_name || 'Sunil Patel (Quality Inspector)'}</div>
        </div>

        <div class="info-card">
          <div class="info-title">Customer Information</div>
          <div class="info-row"><strong>Customer Name:</strong> ${cart.customer_name || 'Walk-in Customer'}</div>
          <div class="info-row"><strong>Mobile:</strong> ${cart.customer_mobile || 'N/A'}</div>
          <div class="info-row"><strong>Email:</strong> ${cart.customer_email || 'N/A'}</div>
          <div class="info-row"><strong>Status:</strong> <span style="text-transform:uppercase;font-weight:800;color:#10b981;">${cart.status || 'open'}</span></div>
        </div>
      </div>

      <!-- Services Table -->
      <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#1e293b;margin-bottom:8px;">Requested Services & Detailing Tasks</div>
      <table>
        <thead>
          <tr>
            <th style="text-align:left;">Service / Package Name</th>
            <th style="text-align:center;width:80px;">Qty</th>
            <th style="text-align:right;width:100px;">Rate</th>
            <th style="text-align:right;width:100px;">Amount</th>
          </tr>
        </thead>
        <tbody>
          ${serviceRowsHtml}
        </tbody>
      </table>

      <div class="totals-box">
        <div class="totals-row"><span>Estimated Total:</span> <span>₹${formatINR(grandTotal)}</span></div>
        <div class="totals-row"><span>Advance Amount:</span> <span>₹${formatINR(advancePaid)}</span></div>
        <div class="totals-row" style="color:#2563eb;font-size:12px;font-weight:900;border-top:1px solid #e2e8f0;padding-top:4px;margin-top:4px;">
          <span>Balance Due:</span> <span>₹${formatINR(balanceDue)}</span>
        </div>
      </div>

      <!-- Customer Belongings & Personal Items Photos Section -->
      <div class="belongings-box">
        <div style="font-size:11px;font-weight:900;text-transform:uppercase;color:#92400e;margin-bottom:8px;display:flex;align-items:center;gap:6px;">
          💼 Declared Customer Personal Items & Inspection Photos
        </div>
        ${belongingsHtml}
      </div>

      <!-- Terms & Customer Declaration Signature -->
      <div class="signature-box">
        <div>
          <div style="font-size:9px;color:#64748b;line-height:1.4;">
            <strong>Declaration & Pre-Inspection Agreement:</strong><br/>
            1. All listed personal belongings have been verified by the inspector.<br/>
            2. Workshop is not liable for items not declared above.<br/>
            3. Customer authorizes O3 Car Spa to perform the above detailing tasks.
          </div>
          <div class="sig-line">Customer Signature</div>
        </div>

        <div>
          <div style="font-size:9px;color:#64748b;line-height:1.4;text-align:right;">
            <strong>Verified & Authorized By:</strong><br/>
            Inspector: ${cart.pre_inspector_name || 'Quality Inspector'}<br/>
            Studio Location: 03 Car Spa Anand Premises
          </div>
          <div class="sig-line">Inspector / Manager Signature</div>
        </div>
      </div>
    </body>
    </html>
    `;

    const pdfBuffer = await htmlToPdfBuffer(html);

    return { pdfBuffer, invoiceNumber };
  } finally {
    conn.release();
  }
}

/**
 * Generate "Bill of Supply" PDF for Buy/Sell transactions matching exact O3 Car Spa template
 */
async function generateBuySellInvoicePDF(buySellId) {
  const conn = await pool.getConnection();
  try {
    const [settingsRows] = await conn.query('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const invoiceTitle = record.type === 'buy' ? 'Purchase Invoice' : 'Sales Invoice';
    const invoiceNumber = `${record.type === 'buy' ? 'PUR' : 'SAL'}-${record.id}`;
    
    const invoiceDate = new Date(record.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="max-width: 150px; height: auto;">`
      : `<h1 style="margin:0;color:#c00;font-size:24px;">O3 CAR SPA</h1>`;

    const grandTotal = parseFloat(record.total_amount) || 0;
    
    const htmlContent = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <style>
        @import url('https://fonts.googleapis.com/css2?family=Montserrat:wght@400;600;700&display=swap');
        body { font-family: 'Montserrat', sans-serif; color: #333; line-height: 1.4; padding: 40px; margin: 0; }
        .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 30px; }
        .company-details { text-align: right; font-size: 11px; }
        .title { color: #5f5e5e; font-size: 20px; font-weight: 700; text-transform: uppercase; letter-spacing: 2px; border-bottom: 2px solid #0284C7; padding-bottom: 5px; margin-bottom: 20px; text-align: center; }
        .info-section { display: flex; justify-content: space-between; margin-bottom: 30px; font-size: 12px; }
        .info-box { width: 48%; }
        .info-box strong { color: #0284C7; }
        table { width: 100%; border-collapse: collapse; margin-bottom: 20px; font-size: 11px; }
        th { background-color: #1c1b1b; color: white; padding: 10px; text-align: left; text-transform: uppercase; letter-spacing: 1px; }
        td { padding: 10px; border-bottom: 1px solid #eee; }
        .totals { margin-left: auto; width: 40%; font-size: 12px; }
        .totals-row { display: flex; justify-content: space-between; padding: 5px 0; }
        .totals-row.grand { font-weight: 700; font-size: 14px; border-top: 2px solid #1c1b1b; padding-top: 10px; margin-top: 5px; }
        .amount-words { margin-top: 30px; font-size: 11px; color: #5f5e5e; }
        .footer { margin-top: 50px; border-top: 1px solid #eee; padding-top: 20px; font-size: 10px; color: #777; text-align: center; }
        .notes-section { margin-top: 20px; padding: 10px; background-color: #f9f9f9; border-left: 3px solid #0284C7; font-size: 11px; }
      </style>
    </head>
    <body>
      <div class="header">
        <div>${logoHtml}</div>
        <div class="company-details">
          <strong style="font-size: 14px;">${settings.studio_name || 'O3 Car Spa'}</strong><br>
          ${settings.studio_address || 'Address line 1'}<br>
          Mobile: ${settings.studio_mobile || 'N/A'} | Email: ${settings.studio_email || 'N/A'}<br>
          ${settings.studio_gst ? `GSTIN: ${settings.studio_gst}` : ''}
        </div>
      </div>

      <div class="title">Bill of Supply - ${invoiceTitle}</div>

      <div class="info-section">
        <div class="info-box">
          <p><strong>Billed To:</strong><br>
          ${record.party_name}<br>
          ${record.party_mobile ? 'Mob: ' + record.party_mobile : ''}</p>
        </div>
        <div class="info-box" style="text-align: right;">
          <p><strong>Invoice No:</strong> ${invoiceNumber}<br>
          <strong>Date:</strong> ${invoiceDate}</p>
        </div>
      </div>

      <table>
        <thead>
          <tr>
            <th style="width: 50%">Item / Product</th>
            <th style="width: 15%">Qty</th>
            <th style="width: 15%">Rate</th>
            <th style="width: 20%; text-align: right;">Amount</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td><strong>${record.product_name}</strong></td>
            <td>${parseFloat(record.quantity)}</td>
            <td>₹${formatINR(record.unit_price)}</td>
            <td style="text-align: right;">₹${formatINR(record.total_amount)}</td>
          </tr>
        </tbody>
      </table>

      <div class="totals">
        <div class="totals-row grand">
          <span>Net Amount:</span>
          <span>₹${formatINR(grandTotal)}</span>
        </div>
      </div>

      <div class="amount-words">
        <strong>Amount in words:</strong> ${amountInWords(grandTotal)}
      </div>

      ${record.note ? `
      <div class="notes-section">
        <strong>Notes:</strong><br>
        ${record.note}
      </div>` : ''}

      <div class="footer">
        <p>This is a computer-generated document. No signature is required.</p>
        <p>Thank you for your business!</p>
      </div>
    </body>
    </html>
    `;

    const pdfBuffer = await htmlToPdfBuffer(htmlContent);
    return pdfBuffer;
  } finally {
    conn.release();
  }
}


/**
 * Generate "Bill of Supply" PDF for a Manual Bill (Quick Billing)
 */
async function generateManualBillPDF(billId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`
      SELECT mb.*, u.name AS created_by_name
      FROM manual_bills mb
      LEFT JOIN users u ON mb.created_by = u.id
      WHERE mb.id = ?
    `, [billId]);
    if (!rows.length) throw new Error('Manual bill not found');
    const bill = rows[0];

    const [settingsRows] = await conn.query('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const invoiceNumber = `MB-${bill.id}`;
    const invoiceDate = new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const services = bill.services_json ? (typeof bill.services_json === 'string' ? JSON.parse(bill.services_json) : bill.services_json) : [];
    const products = bill.products_json ? (typeof bill.products_json === 'string' ? JSON.parse(bill.products_json) : bill.products_json) : [];

    let grandTotal = 0;
    const itemRows = [];
    for (const s of services) {
      const price = parseFloat(s.price || s.service_price || 0);
      grandTotal += price;
      itemRows.push({ name: (s.service_name || s.name || 'Service').toUpperCase(), qty: '1 PCS', rate: `₹${formatINR(price)}`, amount: `₹${formatINR(price)}` });
    }
    for (const p of products) {
      const qty = parseInt(p.quantity || 1);
      const price = parseFloat(p.price || p.unit_cost || 0);
      const total = price * qty;
      grandTotal += total;
      itemRows.push({ name: (p.product_name || p.name || 'Product').toUpperCase(), qty: `${qty} PCS`, rate: `₹${formatINR(price)}`, amount: `₹${formatINR(total)}` });
    }

    let discountAmt = 0;
    if (bill.discount_type === 'percentage') {
      discountAmt = grandTotal * (parseFloat(bill.discount_value || 0) / 100);
    } else if (bill.discount_type === 'fixed') {
      discountAmt = parseFloat(bill.discount_value || 0);
    }
    const finalTotal = Math.max(0, grandTotal - discountAmt);

    const emptyRowsCount = Math.max(0, 6 - itemRows.length);
    const serviceRowsHtml = itemRows.map(s => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">${s.name}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">${s.qty}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${s.rate}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${s.amount}</td>
      </tr>
    `).join('');
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const html = buildInvoiceHTML({
      title: 'BILL OF SUPPLY',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: bill.customer_name || 'Walk-in Customer',
      partyMobile: bill.customer_mobile || '-',
      rightLabel: 'Vehicle / Payment',
      rightValue: `${bill.vehicle_reg_no ? (bill.vehicle_brand + ' ' + bill.vehicle_model + ' [' + bill.vehicle_reg_no + ']').toUpperCase() + ' / ' : ''}${(bill.payment_method || 'cash').toUpperCase()}`,
      serviceRowsHtml,
      emptyRows,
      totalQty: itemRows.length,
      grandTotal,
      discountAmt,
      finalTotal,
      notes: bill.description || '',
    });

    return renderPDF(html, invoiceNumber);
  } finally {
    conn.release();
  }
}

/**
 * Generate "Salary Slip" PDF for a staff salary record
 */
async function generateSalarySlipPDF(salaryId) {
  const conn = await pool.getConnection();
  try {
    const [rows] = await conn.query(`
      SELECT ss.*, u.name AS staff_name, u.mobile AS staff_mobile
      FROM staff_salary ss
      JOIN users u ON ss.staff_id = u.id
      WHERE ss.id = ?
    `, [salaryId]);
    if (!rows.length) throw new Error('Salary record not found');
    const rec = rows[0];

    const invoiceNumber = `SAL-${rec.month_year}-${rec.id}`;
    const invoiceDate = new Date(rec.created_at || Date.now()).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const base = parseFloat(rec.base_salary || 0);
    const bonus = parseFloat(rec.bonus || 0);
    const deductions = parseFloat(rec.deductions || 0);
    const finalTotal = parseFloat(rec.final_salary || 0);
    const grandTotal = base + bonus;

    const serviceRowsHtml = `
      <tr><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;">BASE SALARY - ${rec.month_year}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(base)}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(base)}</td></tr>
      ${bonus > 0 ? `<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;">BONUS</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(bonus)}</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(bonus)}</td></tr>` : ''}
    `;
    const emptyCount = Math.max(0, 6 - (bonus > 0 ? 2 : 1));
    const emptyRows = Array(emptyCount).fill(`<tr><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td><td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td></tr>`).join('');

    const html = buildInvoiceHTML({
      title: 'SALARY SLIP',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: rec.staff_name,
      partyMobile: rec.staff_mobile || '-',
      rightLabel: 'Month',
      rightValue: rec.month_year,
      serviceRowsHtml,
      emptyRows,
      totalQty: bonus > 0 ? 2 : 1,
      grandTotal,
      discountAmt: deductions,
      finalTotal,
      notes: rec.notes || '',
    });

    return renderPDF(html, invoiceNumber);
  } finally {
    conn.release();
  }
}

// ─── Shared HTML builder ─────────────────────────────────────────
function buildInvoiceHTML({
  title = 'BILL OF SUPPLY',
  invoiceNumber,
  invoiceDate,
  logoHtml,
  partyName,
  partyMobile,
  rightLabel,
  rightValue,
  serviceRowsHtml,
  emptyRows,
  totalQty,
  grandTotal,
  discountAmt = 0,
  discountType = 'fixed',
  discountValue = 0,
  isWithGst = false,
  gstPct = 18,
  gstAmt = 0,
  studioGst = '24AAAFO3303J1Z2',
  finalTotal,
  receivedAmt = null,
  balanceDue = 0,
  statusText = 'PAID',
  notes = ''
}) {
  const isTaxInvoice = isWithGst || gstAmt > 0;
  const headerTitle = isTaxInvoice ? 'TAX INVOICE' : title;
  const headerBadge = isTaxInvoice ? 'ORIGINAL FOR RECIPIENT' : 'BILL OF SUPPLY (NON-GST)';
  const gstRowHtml = isTaxInvoice
    ? `<span>GSTIN: ${studioGst}</span>&nbsp;&nbsp;&nbsp;<span>PAN Number: [PAN Number]</span>`
    : `<span>Non-GST Bill of Supply</span>&nbsp;&nbsp;&nbsp;<span>PAN Number: [PAN Number]</span>`;

  const paidVal = receivedAmt !== null ? receivedAmt : finalTotal;
  const cgstAmt = gstAmt / 2;
  const sgstAmt = gstAmt / 2;

  return `
  <!DOCTYPE html>
  <html>
  <head>
    <meta charset="utf-8" />
    <style>
      @page { size: A4; margin: 0; }
      * { margin: 0; padding: 0; box-sizing: border-box; }
      body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 30px 35px; font-size: 12px; line-height: 1.4; }
      .bill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
      .bill-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
      .original-badge { display: inline-block; border: 1px solid #999; padding: 2px 8px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; color: #666; }
      .company-header { display: flex; align-items: center; gap: 15px; background: #0284C7; padding: 12px 15px; border-radius: 4px; margin-bottom: 15px; margin-top: 8px; }
      .company-logo { flex-shrink: 0; background: white; padding: 4px; border-radius: 4px; }
      .company-info { color: white; }
      .company-info h1 { font-size: 22px; font-weight: 800; margin-bottom: 3px; }
      .company-info p { font-size: 10px; line-height: 1.5; opacity: 0.95; }
      .company-info .gst-row { margin-top: 4px; font-size: 10px; font-weight: 600; }
      .invoice-meta { display: flex; border: 1px solid #0284C7; margin-bottom: 12px; }
      .invoice-meta-left, .invoice-meta-right { flex: 1; padding: 8px 12px; }
      .invoice-meta-right { text-align: right; border-left: 1px solid #0284C7; }
      .meta-label { font-size: 10px; color: #0284C7; font-weight: 700; }
      .meta-value { font-size: 13px; font-weight: 700; }
      .bill-details { display: flex; border: 1px solid #0284C7; border-top: none; margin-top: -12px; margin-bottom: 15px; }
      .bill-to-section { flex: 1; padding: 10px 12px; }
      .vehicle-section { flex: 0 0 220px; padding: 10px 12px; border-left: 1px solid #0284C7; text-align: right; }
      .bill-to-label, .vehicle-label { font-size: 10px; font-weight: 700; color: #0284C7; text-transform: uppercase; }
      .bill-to-name { font-size: 13px; font-weight: 700; margin-top: 3px; }
      .bill-to-detail { font-size: 11px; color: #444; margin-top: 1px; }
      .vehicle-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
      .services-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
      .services-table thead th { background: #0284C7; color: white; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
      .subtotal-row { display: flex; justify-content: space-between; padding: 10px 12px; border: 1px solid #0284C7; font-weight: 700; font-size: 13px; margin-top: 20px; }
      .bottom-grid { display: flex; gap: 0; border: 1px solid #0284C7; border-top: none; }
      .bank-section { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
      .amounts-section { flex: 0 0 260px; padding: 0; }
      .bank-title { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
      .bank-row { display: flex; font-size: 10px; margin-bottom: 2px; }
      .bank-label { width: 85px; font-weight: 600; }
      .bank-value { flex: 1; }
      .amount-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 11px; border-bottom: 1px solid #eee; }
      .amount-row.total { background: #0284C7; color: white; font-weight: 700; font-size: 13px; }
      .terms-section { border: 1px solid #0284C7; border-top: none; display: flex; }
      .terms-left { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
      .terms-right { flex: 0 0 260px; padding: 12px; }
      .terms-title { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
      .terms-text { font-size: 9px; color: #444; line-height: 1.5; }
      .words-label { font-size: 10px; font-weight: 700; margin-bottom: 4px; }
      .words-value { font-size: 11px; font-style: italic; color: #333; }
      .signatory { border: 1px solid #0284C7; border-top: none; padding: 20px 12px 12px; text-align: right; }
      .signatory-line { width: 200px; margin-left: auto; text-align: center; }
      .signatory-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284C7; }
      .signatory-name { font-size: 11px; font-weight: 600; margin-top: 2px; }
    </style>
  </head>
  <body>
    <div class="bill-header">
      <div>
        <span class="bill-title">${headerTitle}</span>
        <span class="original-badge">${headerBadge}</span>
      </div>
    </div>
    <div class="company-header">
      <div class="company-logo">${logoHtml}</div>
      <div class="company-info">
        <h1>O3 Car Spa</h1>
        <p>Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC,<br>Vitthal Udyognagar, Anand, Gujarat - 388121</p>
        <div class="gst-row">
          <span>Mobile: 7225030303</span>&nbsp;&nbsp;&nbsp;
          ${gstRowHtml}
        </div>
        <p>Email: o3carspavvn@gmail.com</p>
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-meta-left">
        <span class="meta-label">Invoice No.: </span>
        <span class="meta-value">${invoiceNumber}</span>
      </div>
      <div class="invoice-meta-right">
        <span class="meta-label">Invoice Date: </span>
        <span class="meta-value">${invoiceDate}</span>
      </div>
    </div>
    <div class="bill-details">
      <div class="bill-to-section">
        <div class="bill-to-label">BILL TO</div>
        <div class="bill-to-name">${partyName}</div>
        <div class="bill-to-detail">Mobile: ${partyMobile}</div>
        <div class="bill-to-detail">Place of Supply: Gujarat</div>
      </div>
      <div class="vehicle-section">
        <div>
          <span class="vehicle-label">${rightLabel}</span>
          <div class="vehicle-value">${rightValue}</div>
        </div>
      </div>
    </div>
    <table class="services-table">
      <thead>
        <tr>
          <th style="width:50%;">DESCRIPTION</th>
          <th style="width:15%;text-align:center;">QTY.</th>
          <th style="width:17%;text-align:right;">RATE</th>
          <th style="width:18%;text-align:right;">AMOUNT</th>
        </tr>
      </thead>
      <tbody>
        ${serviceRowsHtml}
        ${emptyRows}
      </tbody>
    </table>
    <div class="subtotal-row">
      <div><span style="font-size:11px;font-weight:700;">SUBTOTAL</span></div>
      <div style="display:flex;gap:40px;">
        <span>${totalQty}</span>
        <span>₹ ${formatINR(grandTotal)}</span>
      </div>
    </div>
    <div class="bottom-grid">
      <div class="bank-section">
        <div class="bank-title">BANK DETAILS</div>
        <div class="bank-row"><span class="bank-label">Name:</span><span class="bank-value">O3 Car Spa</span></div>
        <div class="bank-row"><span class="bank-label">IFSC Code:</span><span class="bank-value">[IFSC Code]</span></div>
        <div class="bank-row"><span class="bank-label">Account No:</span><span class="bank-value">[Account No]</span></div>
        <div class="bank-row"><span class="bank-label">Bank:</span><span class="bank-value">[Bank Name & Branch]</span></div>
      </div>
      <div class="amounts-section">
        <div class="amount-row"><span>Subtotal</span><span>₹ ${formatINR(grandTotal)}</span></div>
        ${discountAmt > 0 ? `<div class="amount-row" style="color:#0284C7;"><span>Discount (${discountType === 'percentage' ? discountValue + '%' : 'Fixed'})</span><span>- ₹ ${formatINR(discountAmt)}</span></div>` : ''}
        ${isTaxInvoice ? `
        <div class="amount-row"><span>CGST (${gstPct / 2}%)</span><span>+ ₹ ${formatINR(cgstAmt)}</span></div>
        <div class="amount-row"><span>SGST (${gstPct / 2}%)</span><span>+ ₹ ${formatINR(sgstAmt)}</span></div>
        ` : ''}
        <div class="amount-row total"><span>Total Payable</span><span>₹ ${formatINR(finalTotal)}</span></div>
        <div class="amount-row"><span>Received Amount</span><span>₹ ${formatINR(paidVal)}</span></div>
        <div class="amount-row"><span>Balance</span><span>₹ ${formatINR(balanceDue)}</span></div>
        ${statusText ? `<div class="amount-row"><span>Status</span><span style="color:${statusText === 'PAID' ? '#2e7d32' : '#0369A1'}; font-weight:bold;">${statusText}</span></div>` : ''}
      </div>
    </div>
    <div class="terms-section">
      <div class="terms-left">
        ${notes ? `<div class="terms-title">NOTES</div><div class="terms-text" style="margin-bottom:8px;">${notes}</div>` : ''}
        <div class="terms-title">TERMS AND CONDITIONS</div>
        <div class="terms-text">
          1. Your car belongings are not our responsibility and make sure you check your belongings before dropping your car at our workshop.<br>
          2. Please check if any cash or others important documents are there.<br>
          3. All disputes are subject to Anand jurisdiction only.
        </div>
      </div>
      <div class="terms-right">
        <div class="words-label">Total Amount (in words)</div>
        <div class="words-value">${amountInWords(finalTotal)}</div>
      </div>
    </div>
    <div class="signatory">
      <div class="signatory-line">
        <div style="border-top:1px solid #999;padding-top:6px;margin-top:30px;">
          <div class="signatory-label">AUTHORISED SIGNATORY FOR</div>
          <div class="signatory-name">O3 Car Spa</div>
        </div>
      </div>
    </div>
  </body>
  </html>
  `;
}

// â”€â”€â”€ Shared PDF renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
async function renderPDF(html, invoiceNumber) {
  const pdfBuffer = await htmlToPdfBuffer(html);
  return { pdfBuffer, invoiceNumber };
}

/**
 * Generate "Bill of Supply" PDF for Package Purchase matching exact O3 Car Spa template
 */
async function generatePackageInvoicePDF(requestId) {
  const conn = await pool.getConnection();
  try {
    const [records] = await conn.query(`
      SELECT pr.*, u.name AS customer_name, u.mobile AS customer_mobile,
             v.registration_no, v.brand, v.model,
             p.name AS package_name,
             pay.status AS payment_status
      FROM package_requests pr
      JOIN users u ON pr.customer_id = u.id
      JOIN vehicles v ON pr.vehicle_id = v.id
      JOIN packages p ON pr.package_id = p.id
      LEFT JOIN v2_payments pay ON (
        pay.booking_id IS NULL AND
        JSON_UNQUOTE(JSON_EXTRACT(pay.notes, '$.package_request_id')) = pr.id
      )
      WHERE pr.id = ?
    `, [requestId]);

    if (!records.length) throw new Error('Package request not found');
    const record = records[0];

    const isPaid = record.status === 'approved' || record.payment_status === 'captured' || record.payment_status === 'completed';
    const receivedAmount = isPaid ? parseFloat(record.price || 0) : 0;
    const balanceDue = isPaid ? 0 : parseFloat(record.price || 0);
    const paymentStatusText = isPaid ? 'PAID' : 'PENDING';

    // Fetch settings
    const [settingsRows] = await conn.query('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const invoiceNumber = `PKG-${record.id}`;
    const invoiceDate = new Date(record.approved_at || record.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const grandTotal = parseFloat(record.price) || 0;
    
    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 30px 35px; font-size: 12px; line-height: 1.4; }
        .bill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .bill-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .company-header { display: flex; align-items: center; gap: 15px; background: #0284C7; padding: 12px 15px; border-radius: 4px; margin-bottom: 15px; margin-top: 8px; }
        .company-logo { flex-shrink: 0; background: white; padding: 4px; border-radius: 4px; }
        .company-info { color: white; }
        .company-info h1 { font-size: 22px; font-weight: 800; margin-bottom: 3px; }
        .company-info p { font-size: 10px; line-height: 1.5; opacity: 0.95; }
        .company-info .gst-row { margin-top: 4px; font-size: 10px; font-weight: 600; }
        .invoice-meta { display: flex; border: 1px solid #0284C7; margin-bottom: 12px; }
        .invoice-meta-left, .invoice-meta-right { flex: 1; padding: 8px 12px; }
        .invoice-meta-right { text-align: right; border-left: 1px solid #0284C7; }
        .meta-label { font-size: 10px; color: #0284C7; font-weight: 700; }
        .meta-value { font-size: 13px; font-weight: 700; }
        .bill-details { display: flex; border: 1px solid #0284C7; border-top: none; margin-top: -12px; margin-bottom: 15px; }
        .bill-to-section { flex: 1; padding: 10px 12px; }
        .vehicle-section { flex: 0 0 220px; padding: 10px 12px; border-left: 1px solid #0284C7; text-align: right; }
        .bill-to-label, .vehicle-label { font-size: 10px; font-weight: 700; color: #0284C7; text-transform: uppercase; }
        .bill-to-name { font-size: 13px; font-weight: 700; margin-top: 3px; }
        .bill-to-detail { font-size: 11px; color: #444; margin-top: 1px; }
        .vehicle-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
        .services-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        .services-table thead th { background: #0284C7; color: white; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
        .services-table thead th:nth-child(2), .services-table thead th:nth-child(3), .services-table thead th:nth-child(4) { text-align: center; }
        .services-table thead th:last-child { text-align: right; }
        .subtotal-row { display: flex; justify-content: space-between; padding: 10px 12px; border: 1px solid #0284C7; font-weight: 700; font-size: 13px; margin-top: 20px; margin-bottom: 0; }
        .bottom-grid { display: flex; gap: 0; border: 1px solid #0284C7; border-top: none; }
        .bank-section { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .amounts-section { flex: 0 0 260px; padding: 0; }
        .bank-title { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .bank-row { display: flex; font-size: 10px; margin-bottom: 2px; }
        .bank-label { width: 85px; font-weight: 600; }
        .bank-value { flex: 1; }
        .amount-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 11px; border-bottom: 1px solid #eee; }
        .amount-row.total { background: #0284C7; color: white; font-weight: 700; font-size: 13px; }
        .amount-label { font-weight: 600; }
        .amount-value { font-weight: 700; }
        .terms-section { border: 1px solid #0284C7; border-top: none; display: flex; }
        .terms-left { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .terms-right { flex: 0 0 260px; padding: 12px; }
        .terms-title { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .terms-text { font-size: 9px; color: #444; line-height: 1.5; }
        .words-label { font-size: 10px; font-weight: 700; margin-bottom: 4px; }
        .words-value { font-size: 11px; font-style: italic; color: #333; }
        .signatory { border: 1px solid #0284C7; border-top: none; padding: 20px 12px 12px; text-align: right; }
        .signatory-line { width: 200px; margin-left: auto; text-align: center; }
        .signatory-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284C7; }
        .signatory-name { font-size: 11px; font-weight: 600; margin-top: 2px; }
      </style>
    </head>
    <body>
      <div class="bill-header">
        <div><span class="bill-title">BILL OF SUPPLY</span></div>
      </div>
      <div class="company-header">
        <div class="company-logo">${logoHtml}</div>
        <div class="company-info">
          <h1>O3 Car Spa</h1>
          <p>Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC,<br>Vitthal Udyognagar, Anand, Gujarat - 388121</p>
          <div class="gst-row">
            <span>Mobile: 7225030303</span>&nbsp;&nbsp;&nbsp;
            <span>GSTIN: [GSTIN]</span>&nbsp;&nbsp;&nbsp;
            <span>PAN Number: [PAN Number]</span>
          </div>
          <p>Email: o3carspavvn@gmail.com</p>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-meta-left">
          <span class="meta-label">Invoice No.: </span><span class="meta-value">${invoiceNumber}</span>
        </div>
        <div class="invoice-meta-right">
          <span class="meta-label">Invoice Date: </span><span class="meta-value">${invoiceDate}</span>
        </div>
      </div>
      <div class="bill-details">
        <div class="bill-to-section">
          <div class="bill-to-label">BILL TO</div>
          <div class="bill-to-name">${record.customer_name || '-'}</div>
          <div class="bill-to-detail">Mobile: ${record.customer_mobile || '-'}</div>
          <div class="bill-to-detail">Place of Supply: Gujarat</div>
        </div>
        <div class="vehicle-section">
          <div><span class="vehicle-label">Vehicle Name</span><div class="vehicle-value">${(record.brand || '')} ${(record.model || '').toUpperCase()}</div></div>
          <div style="margin-top:8px;"><span class="vehicle-label">Vehicle No.</span><div class="vehicle-value">${record.registration_no || '-'}</div></div>
        </div>
      </div>
      <table class="services-table">
        <thead>
          <tr>
            <th style="width:50%;">PACKAGE</th>
            <th style="width:15%;text-align:center;">QTY.</th>
            <th style="width:17%;text-align:right;">RATE</th>
            <th style="width:18%;text-align:right;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">${record.package_name}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(grandTotal)}</td>
            <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹${formatINR(grandTotal)}</td>
          </tr>
        </tbody>
      </table>
      <div class="subtotal-row">
        <div><span style="font-size:11px;font-weight:700;">SUBTOTAL</span></div>
        <div style="display:flex;gap:40px;"><span>1</span><span>₹ ${formatINR(grandTotal)}</span></div>
      </div>
      <div class="bottom-grid">
        <div class="bank-section">
          <div class="bank-title">BANK DETAILS</div>
          <div class="bank-row"><span class="bank-label">Name:</span><span class="bank-value">O3 Car Spa</span></div>
          <div class="bank-row"><span class="bank-label">IFSC Code:</span><span class="bank-value">[IFSC Code]</span></div>
          <div class="bank-row"><span class="bank-label">Account No:</span><span class="bank-value">[Account No]</span></div>
          <div class="bank-row"><span class="bank-label">Bank:</span><span class="bank-value">[Bank Name & Branch]</span></div>
        </div>
        <div class="amounts-section">
          <div class="amount-row"><span class="amount-label">Subtotal</span><span class="amount-value">₹ ${formatINR(grandTotal)}</span></div>
          <div class="amount-row total"><span class="amount-label">Total Payable</span><span class="amount-value">₹ ${formatINR(grandTotal)}</span></div>
          <div class="amount-row"><span class="amount-label">Received Amount</span><span class="amount-value">₹ ${formatINR(receivedAmount)}</span></div>
          <div class="amount-row"><span class="amount-label">Balance Due</span><span class="amount-value">₹ ${formatINR(balanceDue)}</span></div>
          <div class="amount-row"><span class="amount-label">Status</span><span class="amount-value" style="color: ${isPaid ? '#2e7d32' : '#0369A1'}; font-weight: bold;">${paymentStatusText}</span></div>
        </div>
      </div>
      <div class="terms-section">
        <div class="terms-left">
          <div class="terms-title">TERMS AND CONDITIONS</div>
          <div class="terms-text">1. Your car belongings are not our responsibility and make sure you check your belongings before dropping your car at our workshop.<br>2. Please check if any cash or others important documents are there.<br>3. All disputes are subject to Anand jurisdiction only.</div>
        </div>
        <div class="terms-right">
          <div class="words-label">Total Amount (in words)</div>
          <div class="words-value">${amountInWords(grandTotal)}</div>
        </div>
      </div>
      <div class="signatory">
        <div class="signatory-line">
          <div style="border-top:1px solid #999;padding-top:6px;margin-top:30px;">
            <div class="signatory-label">AUTHORISED SIGNATORY FOR</div>
            <div class="signatory-name">O3 Car Spa</div>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    return await renderPDF(html, invoiceNumber);
  } finally {
    conn.release();
  }
}






/**
 * Generate "Bill of Supply" PDF for a Quick Wash
 */
async function generateQuickWashInvoicePDF(bookingId) {
  const conn = await pool.getConnection();
  try {
    const [bookings] = await conn.query(`
      SELECT b.*,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
             svc.name AS service_name, 
             CASE b.vehicle_category
                WHEN 'hatchback' THEN svc.price_hatchback
                WHEN 'medium_hatchback' THEN svc.price_medium_hatchback
                WHEN 'sedan' THEN svc.price_sedan
                WHEN 'premium_sedan' THEN svc.price_premium_sedan
                WHEN 'suv' THEN svc.price_suv
                ELSE svc.price_hatchback
             END AS service_price,
             pkg.name AS package_name,
             v.brand AS linked_vehicle_brand, v.model AS linked_vehicle_model, v.registration_no AS linked_vehicle_reg_no
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.id
      LEFT JOIN services svc ON b.service_id = svc.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN user_packages up ON b.package_id = up.id
      LEFT JOIN packages pkg ON up.package_id = pkg.id
      WHERE b.id = ? AND b.job_type = 'quick_wash'
    `, [bookingId]);

    if (!bookings.length) throw new Error('Quick Wash booking not found');
    const record = bookings[0];

    // Format fields
    const brand = record.linked_vehicle_brand || record.vehicle_brand || '';
    const model = record.linked_vehicle_model || record.vehicle_model || '';
    const regNo = record.linked_vehicle_reg_no || record.vehicle_reg_no || '-';
    const customerName = record.customer_name || 'Walk-in Customer';
    const customerMobile = record.customer_mobile || '-';
    
    // Service calculation
    const serviceName = record.service_name || 'Quick Wash Service';
    const hasPackage = !!record.package_id;
    const servicePrice = hasPackage ? 0 : (parseFloat(record.service_price) || 0);
    const grandTotal = servicePrice;
    
    const invoiceNumber = `QW-${record.id}`;
    const invoiceDate = new Date(record.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    // Logo
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const serviceRowsHtml = `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">${serviceName}${hasPackage ? ` (Package: ${record.package_name || 'Subscription'})` : ''}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${hasPackage ? 'Included' : `₹ ${formatINR(servicePrice)}`}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">${hasPackage ? '₹ 0.00' : `₹ ${formatINR(servicePrice)}`}</td>
      </tr>
    `;
    const emptyRowsCount = Math.max(0, 6 - 1);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const rightValue = `${brand} ${model.toUpperCase()}` + (regNo !== '-' ? ` (${regNo})` : '');

    const html = buildInvoiceHTML({
      title: 'BILL OF SUPPLY - QUICK WASH',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: customerName,
      partyMobile: customerMobile,
      rightLabel: 'Vehicle',
      rightValue,
      serviceRowsHtml,
      emptyRows,
      totalQty: 1,
      grandTotal,
      discountAmt: 0,
      finalTotal: grandTotal,
      notes: record.notes || '',
    });

    return await renderPDF(html, invoiceNumber);
  } finally {
    conn.release();
  }
}

/**
 * Generate "Payment Receipt" PDF
 */
async function generatePaymentReceiptPDF(paymentId) {
  const conn = await pool.getConnection();
  try {
    const [payments] = await conn.query(`
      SELECT p.*,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email
      FROM v2_payments p
      LEFT JOIN users u ON p.customer_id = u.id
      WHERE p.id = ?
    `, [paymentId]);

    if (!payments.length) throw new Error('Payment not found');
    const record = payments[0];

    const customerName = record.customer_name || 'Walk-in Customer';
    const customerMobile = record.customer_mobile || '-';
    
    const invoiceNumber = `RCPT-${record.id}`;
    const invoiceDate = new Date(record.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const grandTotal = parseFloat(record.amount) || 0;
    
    let paymentDesc = 'Payment received';
    if (record.booking_id) paymentDesc = `Advance Payment (Booking #${record.booking_id})`;
    else if (record.job_cart_id) paymentDesc = `Service Billing (Job Card #${record.job_cart_id})`;
    else if (record.package_id || (record.notes && record.notes.includes('package_request_id'))) paymentDesc = 'Package Purchase Payment';

    const serviceRowsHtml = `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">${paymentDesc}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(grandTotal)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(grandTotal)}</td>
      </tr>
    `;
    const emptyRowsCount = Math.max(0, 6 - 1);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const html = buildInvoiceHTML({
      title: 'PAYMENT RECEIPT',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: customerName,
      partyMobile: customerMobile,
      rightLabel: 'Method',
      rightValue: (record.payment_method || '').toUpperCase(),
      serviceRowsHtml,
      emptyRows,
      totalQty: 1,
      grandTotal,
      discountAmt: 0,
      finalTotal: grandTotal,
      notes: record.notes || 'Thank you for your payment.',
    });

    return await renderPDF(html, invoiceNumber);
  } finally {
    conn.release();
  }
}

async function generateQuotationPDF(quotationId) {
  const conn = await pool.getConnection();
  try {
    const [quotations] = await conn.query('SELECT * FROM quotations WHERE id = ?', [quotationId]);
    if (!quotations.length) throw new Error('Quotation not found');
    const q = quotations[0];

    const [items] = await conn.query('SELECT * FROM quotation_items WHERE quotation_id = ?', [quotationId]);

    const quotationNumber = q.quotation_number;
    const quotationDate = new Date(q.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const validUntil = q.valid_until ? new Date(q.valid_until).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '-';

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const itemRowsHtml = items.map((item) => `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">
          <strong>[${item.item_type.toUpperCase()}]</strong> ${item.name}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">${item.quantity} PCS</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(item.price)}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(item.total)}</td>
      </tr>
    `).join('');

    const emptyRowsCount = Math.max(0, 6 - items.length);
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const subtotal = parseFloat(q.subtotal) || 0;
    const discountAmt = parseFloat(q.discount_amount) || 0;
    const taxAmt = parseFloat(q.tax_amount) || 0;
    const grandTotal = parseFloat(q.grand_total) || 0;

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 30px 35px; font-size: 12px; line-height: 1.4; }
        .bill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .bill-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .original-badge { display: inline-block; border: 1px solid #999; padding: 2px 8px; font-size: 9px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.5px; margin-left: 8px; color: #666; }
        .company-header { display: flex; align-items: center; gap: 15px; background: #0284C7; padding: 12px 15px; border-radius: 4px; margin-bottom: 15px; margin-top: 8px; }
        .company-logo { flex-shrink: 0; background: white; padding: 4px; border-radius: 4px; }
        .company-info { color: white; }
        .company-info h1 { font-size: 22px; font-weight: 800; margin-bottom: 3px; }
        .company-info p { font-size: 10px; line-height: 1.5; opacity: 0.95; }
        .company-info .gst-row { margin-top: 4px; font-size: 10px; font-weight: 600; }
        .invoice-meta { display: flex; border: 1px solid #0284C7; margin-bottom: 12px; }
        .invoice-meta-left, .invoice-meta-right { flex: 1; padding: 8px 12px; }
        .invoice-meta-right { text-align: right; border-left: 1px solid #0284C7; }
        .meta-label { font-size: 10px; color: #0284C7; font-weight: 700; }
        .meta-value { font-size: 13px; font-weight: 700; }
        .bill-details { display: flex; border: 1px solid #0284C7; border-top: none; margin-top: -12px; margin-bottom: 15px; }
        .bill-to-section { flex: 1; padding: 10px 12px; }
        .vehicle-section { flex: 0 0 220px; padding: 10px 12px; border-left: 1px solid #0284C7; text-align: right; }
        .bill-to-label, .vehicle-label { font-size: 10px; font-weight: 700; color: #0284C7; text-transform: uppercase; }
        .bill-to-name { font-size: 13px; font-weight: 700; margin-top: 3px; }
        .bill-to-detail { font-size: 11px; color: #444; margin-top: 1px; }
        .vehicle-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
        .services-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        .services-table thead th { background: #0284C7; color: white; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
        .subtotal-row { display: flex; justify-content: space-between; padding: 10px 12px; border: 1px solid #0284C7; font-weight: 700; font-size: 13px; margin-top: 20px; }
        .bottom-grid { display: flex; gap: 0; border: 1px solid #0284C7; border-top: none; }
        .bank-section { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .amounts-section { flex: 0 0 260px; padding: 0; }
        .bank-title { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .bank-row { display: flex; font-size: 10px; margin-bottom: 2px; }
        .bank-label { width: 85px; font-weight: 600; }
        .bank-value { flex: 1; }
        .amount-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 11px; border-bottom: 1px solid #eee; }
        .amount-row.total { background: #0284C7; color: white; font-weight: 700; font-size: 13px; }
        .terms-section { border: 1px solid #0284C7; border-top: none; display: flex; }
        .terms-left { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .terms-right { flex: 0 0 260px; padding: 12px; }
        .terms-title { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .terms-text { font-size: 9px; color: #444; line-height: 1.5; }
        .words-label { font-size: 10px; font-weight: 700; margin-bottom: 4px; }
        .words-value { font-size: 11px; font-style: italic; color: #333; }
        .signatory { border: 1px solid #0284C7; border-top: none; padding: 20px 12px 12px; text-align: right; }
        .signatory-line { width: 200px; margin-left: auto; text-align: center; }
        .signatory-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284C7; }
        .signatory-name { font-size: 11px; font-weight: 600; margin-top: 2px; }
      </style>
    </head>
    <body>
      <div class="bill-header">
        <div>
          <span class="bill-title">VEHICLE SERVICE QUOTATION</span>
          <span class="original-badge">ESTIMATE ONLY</span>
        </div>
      </div>
      <div class="company-header">
        <div class="company-logo">${logoHtml}</div>
        <div class="company-info">
          <h1>O3 Car Spa</h1>
          <p>Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC,<br>Vitthal Udyognagar, Anand, Gujarat - 388121</p>
          <div class="gst-row">
            <span>Mobile: 7225030303</span>&nbsp;&nbsp;&nbsp;
            <span>GSTIN: [GSTIN]</span>&nbsp;&nbsp;&nbsp;
            <span>PAN Number: [PAN Number]</span>
          </div>
          <p>Email: o3carspavvn@gmail.com</p>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-meta-left">
          <span class="meta-label">Quotation No.: </span>
          <span class="meta-value">${quotationNumber}</span>
        </div>
        <div class="invoice-meta-right">
          <span class="meta-label">Quotation Date: </span>
          <span class="meta-value">${quotationDate}</span>
          &nbsp;&nbsp;&nbsp;&nbsp;
          <span class="meta-label">Valid Until: </span>
          <span class="meta-value">${validUntil}</span>
        </div>
      </div>
      <div class="bill-details">
        <div class="bill-to-section">
          <div class="bill-to-label">QUOTATION TO</div>
          <div class="bill-to-name">${q.customer_name || '-'}</div>
          <div class="bill-to-detail">Mobile: ${q.customer_mobile || '-'}</div>
          ${q.customer_email ? `<div class="bill-to-detail">Email: ${q.customer_email}</div>` : ''}
          <div class="bill-to-detail">Place of Supply: Gujarat</div>
        </div>
        <div class="vehicle-section">
          <div>
            <span class="vehicle-label">Vehicle Details</span>
            <div class="vehicle-value">${(q.car_brand || '')} ${(q.car_model || '').toUpperCase()}</div>
            ${q.car_segment ? `<div style="font-size:10px;color:#0284C7;font-weight:700;margin-top:2px;">Segment: ${q.car_segment.toUpperCase()}</div>` : ''}
          </div>
          <div style="margin-top:8px;">
            <span class="vehicle-label">Vehicle No.</span>
            <div class="vehicle-value">${q.vehicle_no || '-'}</div>
          </div>
        </div>
      </div>
      <table class="services-table">
        <thead>
          <tr>
            <th style="width:50%;">DESCRIPTION</th>
            <th style="width:15%;text-align:center;">QTY.</th>
            <th style="width:17%;text-align:right;">RATE</th>
            <th style="width:18%;text-align:right;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${itemRowsHtml}
          ${emptyRows}
        </tbody>
      </table>
      <div class="subtotal-row">
        <div><span style="font-size:11px;font-weight:700;">SUBTOTAL</span></div>
        <div style="display:flex;gap:40px;">
          <span>${items.length} items</span>
          <span>₹ ${formatINR(subtotal)}</span>
        </div>
      </div>
      <div class="bottom-grid">
        <div class="bank-section">
          <div class="bank-title">BANK DETAILS</div>
          <div class="bank-row"><span class="bank-label">Name:</span><span class="bank-value">O3 Car Spa</span></div>
          <div class="bank-row"><span class="bank-label">IFSC Code:</span><span class="bank-value">[IFSC Code]</span></div>
          <div class="bank-row"><span class="bank-label">Account No:</span><span class="bank-value">[Account No]</span></div>
          <div class="bank-row"><span class="bank-label">Bank:</span><span class="bank-value">[Bank Name & Branch]</span></div>
        </div>
        <div class="amounts-section">
          <div class="amount-row"><span>Subtotal</span><span>₹ ${formatINR(subtotal)}</span></div>
          ${discountAmt > 0 ? `<div class="amount-row" style="color:#0284C7;"><span>Discount (${q.discount_type === 'percentage' ? q.discount_value + '%' : 'Fixed'})</span><span>- ₹ ${formatINR(discountAmt)}</span></div>` : ''}
          ${taxAmt > 0 ? `<div class="amount-row"><span>GST (${q.tax_percentage}%)</span><span>₹ ${formatINR(taxAmt)}</span></div>` : ''}
          <div class="amount-row total"><span>Grand Total</span><span>₹ ${formatINR(grandTotal)}</span></div>
        </div>
      </div>
      <div class="terms-section">
        <div class="terms-left">
          ${q.notes ? `<div class="terms-title">NOTES / ESTIMATE DETAILS</div><div class="terms-text" style="margin-bottom:8px;">${q.notes}</div>` : ''}
          <div class="terms-title">TERMS AND CONDITIONS</div>
          <div class="terms-text">
            1. This is a price estimate / quotation only. Prices are subject to vehicle inspection.<br>
            2. The estimate is valid until the date shown above.<br>
            3. All disputes are subject to Anand jurisdiction only.
          </div>
        </div>
        <div class="terms-right">
          <div class="words-label">Total Amount (in words)</div>
          <div class="words-value">${amountInWords(grandTotal)}</div>
        </div>
      </div>
      <div class="signatory">
        <div class="signatory-line">
          <div style="border-top:1px solid #999;padding-top:6px;margin-top:30px;">
            <div class="signatory-label">ESTIMATE PREPARED BY</div>
            <div class="signatory-name">O3 Car Spa</div>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    const pdfBuffer = await htmlToPdfBuffer(html);
    return { pdfBuffer, quotationNumber };
  } finally {
    conn.release();
  }
}

async function generateBookingInvoicePDF(bookingId) {
  const conn = await pool.getConnection();
  try {
    const [bookings] = await conn.query(`
      SELECT b.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
             v.registration_no, v.brand, v.model,
             s.name AS service_name, s.price_hatchback, s.price_medium_hatchback, s.price_sedan, s.price_premium_sedan, s.price_suv
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.id = ?
    `, [bookingId]);

    if (!bookings.length) throw new Error('Booking not found');
    const booking = bookings[0];

    const [settingsRows] = await conn.query('SELECT key_name, value FROM settings');
    const settings = {};
    settingsRows.forEach(r => { settings[r.key_name] = r.value; });

    const invoiceNumber = `BKG-${booking.id}`;
    const invoiceDate = new Date(booking.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spa</div>`;

    const finalTotal = parseFloat(booking.total_amount) || 0;
    const advancePaid = booking.advance_payment_id ? parseFloat(booking.advance_amount) : 0;
    const balanceDue = Math.max(0, finalTotal - advancePaid);
    const isPaid = balanceDue <= 0;
    const paymentStatusText = isPaid ? 'PAID' : 'PENDING';

    const serviceRowsHtml = `
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-transform:uppercase;">
          ${(booking.service_name || booking.package_service_name || 'Wash Service').toUpperCase()}
        </td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:center;">1 PCS</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(finalTotal - parseFloat(booking.pickup_charge || 0))}</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;text-align:right;">₹ ${formatINR(finalTotal - parseFloat(booking.pickup_charge || 0))}</td>
      </tr>
    `;

    const emptyRowsCount = 5;
    const emptyRows = Array(emptyRowsCount).fill(`
      <tr>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
        <td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>
      </tr>
    `).join('');

    const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8" />
      <style>
        @page { size: A4; margin: 0; }
        * { margin: 0; padding: 0; box-sizing: border-box; }
        body { font-family: 'Segoe UI', Arial, Helvetica, sans-serif; color: #1a1a1a; padding: 30px 35px; font-size: 12px; line-height: 1.4; }
        .bill-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 4px; }
        .bill-title { font-size: 13px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; }
        .company-header { display: flex; align-items: center; gap: 15px; background: #0284C7; padding: 12px 15px; border-radius: 4px; margin-bottom: 15px; margin-top: 8px; }
        .company-logo { flex-shrink: 0; background: white; padding: 4px; border-radius: 4px; }
        .company-info { color: white; }
        .company-info h1 { font-size: 22px; font-weight: 800; margin-bottom: 3px; }
        .company-info p { font-size: 10px; line-height: 1.5; opacity: 0.95; }
        .company-info .gst-row { margin-top: 4px; font-size: 10px; font-weight: 600; }
        .invoice-meta { display: flex; border: 1px solid #0284C7; margin-bottom: 12px; }
        .invoice-meta-left, .invoice-meta-right { flex: 1; padding: 8px 12px; }
        .invoice-meta-right { text-align: right; border-left: 1px solid #0284C7; }
        .meta-label { font-size: 10px; color: #0284C7; font-weight: 700; }
        .meta-value { font-size: 13px; font-weight: 700; }
        .bill-details { display: flex; border: 1px solid #0284C7; border-top: none; margin-top: -12px; margin-bottom: 15px; }
        .bill-to-section { flex: 1; padding: 10px 12px; }
        .vehicle-section { flex: 0 0 220px; padding: 10px 12px; border-left: 1px solid #0284C7; text-align: right; }
        .bill-to-label, .vehicle-label { font-size: 10px; font-weight: 700; color: #0284C7; text-transform: uppercase; }
        .bill-to-name { font-size: 13px; font-weight: 700; margin-top: 3px; }
        .bill-to-detail { font-size: 11px; color: #444; margin-top: 1px; }
        .vehicle-value { font-size: 12px; font-weight: 600; margin-top: 2px; }
        .services-table { width: 100%; border-collapse: collapse; margin-bottom: 0; }
        .services-table thead th { background: #0284C7; color: white; padding: 8px 12px; font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; text-align: left; }
        .services-table thead th:nth-child(2), .services-table thead th:nth-child(3), .services-table thead th:nth-child(4) { text-align: center; }
        .services-table thead th:last-child { text-align: right; }
        .subtotal-row { display: flex; justify-content: space-between; padding: 10px 12px; border: 1px solid #0284C7; font-weight: 700; font-size: 13px; margin-top: 20px; margin-bottom: 0; }
        .bottom-grid { display: flex; gap: 0; border: 1px solid #0284C7; border-top: none; }
        .bank-section { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .amounts-section { flex: 0 0 260px; padding: 0; }
        .bank-title { font-size: 11px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .bank-row { display: flex; font-size: 10px; margin-bottom: 2px; }
        .bank-label { width: 85px; font-weight: 600; }
        .bank-value { flex: 1; }
        .amount-row { display: flex; justify-content: space-between; padding: 6px 12px; font-size: 11px; border-bottom: 1px solid #eee; }
        .amount-row.total { background: #0284C7; color: white; font-weight: 700; font-size: 13px; }
        .amount-label { font-weight: 600; }
        .amount-value { font-weight: 700; }
        .terms-section { border: 1px solid #0284C7; border-top: none; display: flex; }
        .terms-left { flex: 1; padding: 12px; border-right: 1px solid #0284C7; }
        .terms-right { flex: 0 0 260px; padding: 12px; }
        .terms-title { font-size: 10px; font-weight: 700; text-transform: uppercase; margin-bottom: 6px; }
        .terms-text { font-size: 9px; color: #444; line-height: 1.5; }
        .words-label { font-size: 10px; font-weight: 700; margin-bottom: 4px; }
        .words-value { font-size: 11px; font-style: italic; color: #333; }
        .signatory { border: 1px solid #0284C7; border-top: none; padding: 20px 12px 12px; text-align: right; }
        .signatory-line { width: 200px; margin-left: auto; text-align: center; }
        .signatory-label { font-size: 10px; font-weight: 700; text-transform: uppercase; color: #0284C7; }
        .signatory-name { font-size: 11px; font-weight: 600; margin-top: 2px; }
      </style>
    </head>
    <body>
      <div class="bill-header">
        <div><span class="bill-title">BILL OF SUPPLY</span></div>
      </div>
      <div class="company-header">
        <div class="company-logo">${logoHtml}</div>
        <div class="company-info">
          <h1>O3 Car Spa</h1>
          <p>Plot No. 37, Zone No. D5, Opp. Bank of Baroda, GIDC,<br>Vitthal Udyognagar, Anand, Gujarat - 388121</p>
          <div class="gst-row">
            <span>Mobile: 7225030303</span>&nbsp;&nbsp;&nbsp;
            <span>GSTIN: [GSTIN]</span>&nbsp;&nbsp;&nbsp;
            <span>PAN Number: [PAN Number]</span>
          </div>
          <p>Email: o3carspavvn@gmail.com</p>
        </div>
      </div>
      <div class="invoice-meta">
        <div class="invoice-meta-left">
          <span class="meta-label">Invoice No.: </span><span class="meta-value">${invoiceNumber}</span>
        </div>
        <div class="invoice-meta-right">
          <span class="meta-label">Invoice Date: </span><span class="meta-value">${invoiceDate}</span>
        </div>
      </div>
      <div class="bill-details">
        <div class="bill-to-section">
          <div class="bill-to-label">BILL TO</div>
          <div class="bill-to-name">${booking.customer_name || '-'}</div>
          <div class="bill-to-detail">Mobile: ${booking.customer_mobile || '-'}</div>
          <div class="bill-to-detail">Place of Supply: Gujarat</div>
        </div>
        <div class="vehicle-section">
          <div><span class="vehicle-label">Vehicle Name</span><div class="vehicle-value">${(booking.brand || '')} ${(booking.model || '').toUpperCase()}</div></div>
          <div style="margin-top:8px;"><span class="vehicle-label">Vehicle No.</span><div class="vehicle-value">${booking.registration_no || '-'}</div></div>
        </div>
      </div>
      <table class="services-table">
        <thead>
          <tr>
            <th style="width:50%;">SERVICE</th>
            <th style="width:15%;text-align:center;">QTY.</th>
            <th style="width:17%;text-align:right;">RATE</th>
            <th style="width:18%;text-align:right;">AMOUNT</th>
          </tr>
        </thead>
        <tbody>
          ${serviceRowsHtml}
          ${emptyRows}
        </tbody>
      </table>
      <div class="subtotal-row">
        <div><span style="font-size:11px;font-weight:700;">SUBTOTAL</span></div>
        <div style="display:flex;gap:40px;"><span>1</span><span>₹ ${formatINR(finalTotal)}</span></div>
      </div>
      <div class="bottom-grid">
        <div class="bank-section">
          <div class="bank-title">BANK DETAILS</div>
          <div class="bank-row"><span class="bank-label">Name:</span><span class="bank-value">O3 Car Spa</span></div>
          <div class="bank-row"><span class="bank-label">IFSC Code:</span><span class="bank-value">[IFSC Code]</span></div>
          <div class="bank-row"><span class="bank-label">Account No:</span><span class="bank-value">[Account No]</span></div>
          <div class="bank-row"><span class="bank-label">Bank:</span><span class="bank-value">[Bank Name & Branch]</span></div>
        </div>
        <div class="amounts-section">
          <div class="amount-row"><span class="amount-label">Subtotal</span><span class="amount-value">₹ ${formatINR(finalTotal)}</span></div>
          ${parseFloat(booking.pickup_charge || 0) > 0 ? `
          <div class="amount-row">
            <span class="amount-label">Pickup & Drop (${(booking.pickup_type || 'both').toUpperCase()})</span>
            <span class="amount-value">₹ ${formatINR(booking.pickup_charge)}</span>
          </div>
          ` : ''}
          <div class="amount-row total"><span class="amount-label">Total Payable</span><span class="amount-value">₹ ${formatINR(finalTotal)}</span></div>
          <div class="amount-row"><span class="amount-label">Received Amount</span><span class="amount-value">₹ ${formatINR(advancePaid)}</span></div>
          <div class="amount-row"><span class="amount-label">Balance Due</span><span class="amount-value">₹ ${formatINR(balanceDue)}</span></div>
          <div class="amount-row"><span class="amount-label">Status</span><span class="amount-value" style="color: ${isPaid ? '#2e7d32' : '#0369A1'}; font-weight: bold;">${paymentStatusText}</span></div>
        </div>
      </div>
      <div class="terms-section">
        <div class="terms-left">
          <div class="terms-title">TERMS AND CONDITIONS</div>
          <div class="terms-text">1. Your car belongings are not our responsibility and make sure you check your belongings before dropping your car at our workshop.<br>2. Please check if any cash or others important documents are there.<br>3. All disputes are subject to Anand jurisdiction only.</div>
        </div>
        <div class="terms-right">
          <div class="words-label">Total Amount (in words)</div>
          <div class="words-value">${amountInWords(finalTotal)}</div>
        </div>
      </div>
      <div class="signatory">
        <div class="signatory-line">
          <div style="border-top:1px solid #999;padding-top:6px;margin-top:30px;">
            <div class="signatory-label">AUTHORISED SIGNATORY FOR</div>
            <div class="signatory-name">O3 Car Spa</div>
          </div>
        </div>
      </div>
    </body>
    </html>
    `;

    const pdfBuffer = await htmlToPdfBuffer(html);
    return { pdfBuffer, invoiceNumber };
  } finally {
    conn.release();
  }
}

module.exports = {
  generateInvoicePDF,
  generateBuySellInvoicePDF,
  generateManualBillPDF,
  generateSalarySlipPDF,
  generatePackageInvoicePDF,
  generateQuickWashInvoicePDF,
  generatePaymentReceiptPDF,
  generateQuotationPDF,
  generateBookingInvoicePDF,
  generateJobCardPDF
};

