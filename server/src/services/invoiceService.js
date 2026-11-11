const pool = require('../config/db');

/** Who allowed a job card's discount: the approver picked on the job card, else the typed reference. */
async function discountApprover(cart) {
  if (!cart || !(Number(cart.discount_amount) > 0 || Number(cart.discount_value) > 0)) return '';
  if (cart.discount_approved_by) {
    try {
      const [[u]] = await pool.query('SELECT name FROM users WHERE id = ?', [cart.discount_approved_by]);
      if (u?.name) return u.name;
    } catch (_) { /* fall back to the reference */ }
  }
  return cart.discount_reference || '';
}
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// ─── Puppeteer Browser Singleton ───────────────────────────────
// Reuse a single browser instance across all PDF requests to avoid
// cold-starting Chrome for every single invoice (the #1 cause of slow PDFs).
let _browser = null;
let _browserLaunchPromise = null;


// ─── Live studio profile (Settings → studio details + active payment QR) ───
const { getStudioProfile, getQrDataUri } = require('./studioProfile');
let STUDIO = {};
async function loadStudio(franchiseId) {
  try { STUDIO = await getStudioProfile(franchiseId || 1, 'invoice'); } catch { STUDIO = {}; }
  return STUDIO;
}
function studioSettings() {
  return { ...(STUDIO.settings || {}), studio_name: STUDIO.studio_name, studio_address: STUDIO.address, studio_mobile: STUDIO.mobile,
    studio_email: STUDIO.email, studio_gst: STUDIO.gstin, upi_id: STUDIO.upi_id, upi_name: STUDIO.upi_name };
}
/** "Scan & pay" block for a document (dynamic UPI QR for the amount due, or the uploaded QR). */
async function paymentQrHtml(amount, note) {
  try {
    const uri = await getQrDataUri(STUDIO, amount > 0 ? amount : null, note);
    if (!uri) return '';
    return `<div style="display:flex;align-items:center;gap:12px;margin-top:10px;padding:8px 10px;border:1px solid #DBEAFE;background:#F8FBFF;border-radius:8px;page-break-inside:avoid;">
      <img src="${uri}" style="width:84px;height:84px;border-radius:4px;background:#fff;" alt="UPI QR"/>
      <div style="font-size:10px;color:#334155;line-height:1.5;"><b style="font-size:11px;color:#0F172A;">Scan &amp; pay with any UPI app</b><br>${STUDIO.upi_id ? `UPI ID: ${STUDIO.upi_id}<br>` : ''}${amount > 0 ? `Amount due: <b>₹${Number(amount).toLocaleString('en-IN', { minimumFractionDigits: 2 })}</b>` : 'GPay · PhonePe · Paytm · BHIM'}</div>
    </div>`;
  } catch { return ''; }
}

/** Image for a PDF: local /uploads files are embedded (the PDF browser cannot reach them), web links are kept. */
function pdfImageSrc(url) {
  if (!url) return null;
  if (/^(https?:|data:)/.test(url)) return url;
  try {
    const path = require('path'); const fs = require('fs');
    const file = path.join(__dirname, '..', '..', String(url).replace(/^\//, ''));
    if (!fs.existsSync(file)) return null;
    const ext = (path.extname(file).slice(1).toLowerCase() || 'jpeg').replace('jpg', 'jpeg');
    return `data:image/${ext};base64,${fs.readFileSync(file).toString('base64')}`;
  } catch { return null; }
}

/** One slim row for the job card: small Before / After / Belongings thumbnails, so it stays one page. */
function jobPhotosHtml(photos, belongings) {
  const esc = (t) => String(t || '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const thumb = (src, cap) => `<div style="width:19mm;text-align:center">${src
    ? `<img src="${src}" style="width:19mm;height:14mm;object-fit:cover;border-radius:3px;border:1px solid #DBEAFE;display:block"/>`
    : `<div style="width:19mm;height:14mm;border-radius:3px;border:1px dashed #CBD5E1;background:#F8FAFC;display:flex;align-items:center;justify-content:center;font-size:7px;color:#94A3B8">no photo</div>`}${cap ? `<div style="font-size:7px;color:#334155;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${esc(cap)}</div>` : ''}</div>`;
  const group = (label, cells) => cells.length ? `<div style="min-width:0"><div style="font-size:7.5px;font-weight:800;letter-spacing:.6px;color:#0F3D91;margin-bottom:2px">${label}</div><div style="display:flex;gap:1.5mm">${cells.join('')}</div></div>` : '';
  const before = photos.filter(p => p.type === 'before').slice(0, 2).map(p => thumb(pdfImageSrc(p.url)));
  const after = photos.filter(p => p.type === 'after').slice(0, 2).map(p => thumb(pdfImageSrc(p.url)));
  const items = belongings.slice(0, 4).map(b => thumb(pdfImageSrc(b.image_url), b.description));
  const more = belongings.length > 4 ? `<div style="font-size:7px;color:#64748B;align-self:center">+${belongings.length - 4} more: ${esc(belongings.slice(4).map(b => b.description).join(', '))}</div>` : '';
  const groups = [group('BEFORE', before), group('AFTER', after), group(`BELONGINGS (${belongings.length})`, items) + more].filter(Boolean);
  if (!groups.length) return '';
  return `<div style="display:flex;gap:5mm;align-items:flex-start;margin:5mm 10mm 0;padding:2.5mm 4mm;border:1px solid #DBEAFE;background:#F8FBFF;border-radius:6px;page-break-inside:avoid">${groups.join('<div style="width:1px;align-self:stretch;background:#DBEAFE"></div>')}</div>`;
}

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

// Open the PDF engine a few seconds after start, so the first bill a customer downloads does not wait ~4 s for it
if (process.env.NODE_ENV !== 'test') {
  const t = setTimeout(() => { getBrowser().catch(e => console.warn('[pdf] engine warm-up failed:', e.message)); }, 8000);
  if (t.unref) t.unref();
}

// Same document asked again (double tap, re-download, share) → served from memory instantly
const _pdfCache = new Map();
async function htmlToPdfBuffer(html, pdfOptions = {}) {
  const key = require('crypto').createHash('sha1').update(html).update(JSON.stringify(pdfOptions)).digest('hex');
  if (_pdfCache.has(key)) return _pdfCache.get(key);
  const out = await renderHtmlToPdf(html, pdfOptions);
  _pdfCache.set(key, out);
  if (_pdfCache.size > 60) _pdfCache.delete(_pdfCache.keys().next().value);
  return out;
}
async function renderHtmlToPdf(html, pdfOptions = {}) {
  const browser = await getBrowser();
  const page = await browser.newPage();
  try {
    // fonts and images are inlined, so there is nothing to wait for on the network
    await page.setContent(require('./pdfFonts').inlineFonts(html), { waitUntil: 'load', timeout: 15000 });
    await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
    // fitOnePage: shrink the whole document just enough to fit one A4 page (job card with many services / photos)
    const { fitOnePage, ...opts } = pdfOptions;
    if (fitOnePage) {
      await page.setViewport({ width: 733, height: 1000 }); // A4 width minus 8 mm margins, in CSS px
      // photos are shown small — re-encode them at 3× their printed size so the PDF stays light for WhatsApp
      await page.evaluate(async () => {
        for (const img of Array.from(document.images)) {
          const w = img.clientWidth, h = img.clientHeight;
          if (!w || !h || !img.naturalWidth || img.naturalWidth <= w * 3) continue;
          const c = document.createElement('canvas');
          c.width = w * 3; c.height = h * 3;
          const ctx = c.getContext('2d');
          const r = Math.max(c.width / img.naturalWidth, c.height / img.naturalHeight); // same crop as object-fit: cover
          const dw = img.naturalWidth * r, dh = img.naturalHeight * r;
          ctx.drawImage(img, (c.width - dw) / 2, (c.height - dh) / 2, dw, dh);
          img.src = c.toDataURL('image/jpeg', 0.8);
          await img.decode().catch(() => {});
        }
      }).catch(() => {});
      const h = await page.evaluate(() => document.documentElement.scrollHeight);
      const scale = Math.max(0.5, Math.min(1, 1058 / (h || 1058))); // A4 height minus margins ≈ 1062 px
      Object.assign(opts, { scale, pageRanges: '1' });
    }
    const pdfBuffer = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '8mm', right: '8mm', bottom: '8mm', left: '8mm' },
      ...opts,
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
  if (num === 0) return 'Zero';
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

/** Line note for a ₹0 service paid by the customer's package, so the bill says why it is free. */
function packageNote(s, amount) {
  const fromPkg = s.user_package_id || s.package_service_name || /from package/i.test(s.custom_notes || '');
  if (!fromPkg || amount > 0) return '';
  return '₹0 — included in your package' + (s.package_name ? ` (${s.package_name})` : '');
}

function amountInWords(amount) {
  const rupees = Math.floor(amount);
  const paise = Math.round((amount - rupees) * 100);
  let words = numberToWords(rupees) + ' Rupees';
  if (paise > 0) words += ' and ' + numberToWords(paise) + ' Paise';
  return words;
}

// ─── Format currency Indian style ──────────────────────────────
/** dd/mm/yyyy in Indian time (server may run in UTC). */
function istDate(d) {
  return new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'Asia/Kolkata' });
}

function formatINR(num) {
  const n = parseFloat(num) || 0;
  return n.toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

// ─── Load logo as base64 ───────────────────────────────────────
let _logoCache;
function getLogoBase64() {
  if (_logoCache !== undefined) return _logoCache;
  _logoCache = getLogoBase64Uncached();
  return _logoCache;
}
function getLogoBase64Uncached() {
  try {
    const candidates = ['o3_logo.jpeg', 'logo.jpeg', 'logo.png'];
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
      SELECT jc.*, v.registration_no, v.brand, v.model, v.customer_id, v.color AS car_color, v.category AS vehicle_category,
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email, u.address AS customer_address
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      WHERE jc.id = ?
    `, [jobCartId]);

    if (!carts.length) throw new Error('Job cart not found');
    const cart = carts[0];

    const [services] = await conn.query(`
      SELECT js.*, 
        COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS products_cost,
        MAX(pk.name) AS package_name
      FROM job_services js
      LEFT JOIN job_products jp ON js.id = jp.job_service_id
      LEFT JOIN user_packages upk ON upk.id = js.user_package_id
      LEFT JOIN packages pk ON pk.id = upk.package_id
      WHERE js.job_cart_id = ?
      GROUP BY js.id
      ORDER BY js.id
    `, [jobCartId]);

    await loadStudio(1);
    const settings = studioSettings();

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

      const pn = packageNote(s, amount);
      const noteText = [pn && /^from package$/i.test(s.custom_notes || '') ? '' : s.custom_notes, pn].filter(Boolean).map(x => ` [${x}]`).join('');

      return {
        name: `${(s.service_name || '').toUpperCase()}${noteText.toUpperCase()}`,
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
    // advance_paid = everything paid so far (booking advance + money taken at the studio)
    const paidSoFar = isJobPaid ? finalTotal : Math.min(finalTotal, advancePaid);
    const bookingAdvance = Math.min(paidSoFar, parseFloat(cart.advance_amount) || 0);
    const receivedStudio = Math.max(0, paidSoFar - bookingAdvance);
    const balanceDue = isJobPaid ? 0 : Math.max(0, finalTotal - advancePaid);
    const paymentStatusText = isJobPaid ? 'PAID' : paidSoFar > 0 ? 'PARTIALLY PAID' : 'PENDING';

    // the day the invoice was made (bill raised), never the visit date
    const invoiceDate = istDate(cart.invoice_date || cart.completed_at || new Date());

    const studioGst = settings.studio_gst || '';

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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
      billTo: { name: cart.customer_name || 'Customer', mobile: cart.customer_mobile, email: cart.customer_email, address: cart.customer_address },
      vehicle: {
        model: `${cart.brand || ''} ${cart.model || ''}`.trim(),
        reg: cart.registration_no,
        colour: cart.car_color,
        km: cart.km_reading,
        type: ({ hatchback: 'Hatchback', semi_sedan: 'Mini SUV', sedan: 'Sedan', premium_sedan: 'Luxury', suv: 'SUV', premium_suv: 'Luxury + SUV' })[cart.car_category || cart.vehicle_category] || '',
      },
      rightLabel: 'Vehicle / Registration',
      rightValue: `${cart.brand || ''} ${cart.model || ''} [${cart.registration_no || '-'}]`.toUpperCase(),
      extraCharges: Number(cart.pickup_charge) > 0 ? [{ label: 'Pickup / drop', amount: Number(cart.pickup_charge) }] : [],
      serviceRowsHtml,
      emptyRows,
      totalQty: serviceRows.length,
      grandTotal: subtotal,
      discountAmt,
      discountType: cart.discount_type,
      discountValue: cart.discount_value,
      discountReason: cart.discount_reason,
      discountReference: cart.discount_reference,
      discountBy: await discountApprover(cart),
      isWithGst,
      gstPct,
      gstAmt,
      studioGst,
      finalTotal,
      advanceAmt: bookingAdvance,
      receivedAmt: receivedStudio,
      balanceDue,
      statusText: paymentStatusText,
      notes: cart.invoice_notes || '',
    });

    const pdfBuffer = await htmlToPdfBuffer(withQr(html, await paymentQrHtml(balanceDue, invoiceNumber)));
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
             u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
             m.name AS handler_name, t.name AS technician_name
      FROM job_carts jc
      JOIN vehicles v ON jc.vehicle_id = v.id
      JOIN users u ON v.customer_id = u.id
      LEFT JOIN users m ON jc.handler_id = m.id
      LEFT JOIN users t ON jc.technician_id = t.id
      WHERE jc.id = ?
    `, [jobCartId]);

    if (!carts.length) throw new Error('Job cart not found');
    const cart = carts[0];

    let teamMemberNames = [];
    if (cart.team_incentive_users) {
      try {
        const teamIds = typeof cart.team_incentive_users === 'string' ? JSON.parse(cart.team_incentive_users) : cart.team_incentive_users;
        if (Array.isArray(teamIds) && teamIds.length > 0) {
          const [teamUsers] = await conn.query('SELECT name FROM users WHERE id IN (?)', [teamIds]);
          teamMemberNames = teamUsers.map(u => u.name);
        }
      } catch (e) { /* ignore */ }
    }

    const [services] = await conn.query(`
      SELECT js.*, 
        COALESCE(SUM(jp.quantity * jp.unit_cost), 0) AS products_cost,
        MAX(pk.name) AS package_name
      FROM job_services js
      LEFT JOIN job_products jp ON js.id = jp.job_service_id
      LEFT JOIN user_packages upk ON upk.id = js.user_package_id
      LEFT JOIN packages pk ON pk.id = upk.package_id
      WHERE js.job_cart_id = ?
      GROUP BY js.id
      ORDER BY js.id
    `, [jobCartId]);

    const [belongings] = await conn.query(`
      SELECT description, image_url FROM job_cart_belongings WHERE job_cart_id = ? ORDER BY id ASC
    `, [jobCartId]);
    const [jobPhotos] = await conn.query(
      "SELECT type, url, uploaded_at FROM job_photos WHERE job_cart_id = ? AND type IN ('before', 'after') ORDER BY uploaded_at ASC", [jobCartId]);

    await loadStudio(cart.franchise_id || 1);
    const rows = services.map((sv) => {
      const amount = (parseFloat(sv.service_price) || 0) + (parseFloat(sv.labor_charges) || 0) + (parseFloat(sv.products_cost) || 0);
      const pn = packageNote(sv, amount);
      return { name: `${sv.service_name || ''}${sv.custom_notes ? ` — ${sv.custom_notes}` : ''}`, note: pn, amount };
    });
    const grandTotal = rows.reduce((t, r) => t + r.amount, 0);
    let discountAmt = cart.discount_type === 'percentage'
      ? grandTotal * (parseFloat(cart.discount_value || 0) / 100) : parseFloat(cart.discount_value || 0);
    discountAmt = Math.min(grandTotal, Math.max(0, discountAmt || 0));
    const pickup = Number(cart.pickup_charge) || 0;
    const finalTotal = Math.max(0, grandTotal - discountAmt + pickup);
    const advancePaid = parseFloat(cart.advance_paid) || 0;
    const balanceDue = Math.max(0, finalTotal - advancePaid);
    const td = 'padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;';
    const serviceRowsHtml = rows.map((r, i) => `
      <tr>
        <td style="${td}">${String(r.name).replace(/</g, "&lt;")}${r.note ? `<div style="font-size:10px;color:#64748B">${r.note}</div>` : ''}</td>
        <td style="${td}text-align:center;">1</td>
        <td style="${td}text-align:right;">₹${formatINR(r.amount)}</td>
        <td style="${td}text-align:right;">₹${formatINR(r.amount)}</td>
      </tr>`).join('');
    const emptyRows = Array(Math.max(0, 4 - rows.length)).fill(`<tr>${'<td style="padding:8px 12px;border-bottom:1px solid #e0e0e0;">&nbsp;</td>'.repeat(4)}</tr>`).join('');
    const team = [cart.handler_name && `Manager: ${cart.handler_name}`, cart.technician_name && `Technician: ${cart.technician_name}`,
      teamMemberNames.length && `Team: ${teamMemberNames.join(', ')}`, cart.pre_inspector_name && `Pre-inspected by: ${cart.pre_inspector_name}`].filter(Boolean);
    const notes = [
      team.join(' · '),
      belongings.length && !jobPhotos.length && !belongings.some(b => b.image_url) ? `Belongings in car: ${belongings.map(b => b.description).join(', ')}` : '',
      cart.personal_items_notes ? `Notes: ${cart.personal_items_notes}` : '',
      cart.notes ? `Job notes: ${cart.notes}` : '',
      'Customer authorises the studio to carry out the services above. Please check your car and belongings at delivery.',
    ].filter(Boolean).join('\n');
    const created = cart.created_at || cart.visit_date || new Date();
    const invoiceNumber = `JC-${String(jobCartId).padStart(5, '0')}`;
    const html = buildInvoiceHTML({
      title: 'JOB CARD',
      invoiceNumber,
      invoiceDate: new Date(created).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }),
      numberLabel: 'Job card no.', dateLabel: 'Created', dueLabel: 'Visit', dueDateOverride: cart.visit_date ? new Date(cart.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '',
      partyName: cart.customer_name || 'Customer',
      partyMobile: cart.customer_mobile || '-',
      billTo: { name: cart.customer_name || 'Customer', mobile: cart.customer_mobile, email: cart.customer_email },
      billToLabel: 'Customer',
      vehicle: {
        model: `${cart.brand || ''} ${cart.model || ''}`.trim(), reg: cart.registration_no, colour: cart.car_color, km: cart.km_reading,
        type: ({ hatchback: 'Hatchback', semi_sedan: 'Mini SUV', sedan: 'Sedan', premium_sedan: 'Luxury', suv: 'SUV', premium_suv: 'Luxury + SUV' })[cart.car_category] || '',
      },
      rightLabel: 'Vehicle / Registration',
      rightValue: `${cart.brand || ''} ${cart.model || ''} [${cart.registration_no || '-'}]`.toUpperCase(),
      extraCharges: pickup > 0 ? [{ label: 'Pickup / drop', amount: pickup }] : [],
      serviceRowsHtml, emptyRows, totalQty: rows.length,
      grandTotal, discountAmt, discountType: 'fixed', discountValue: discountAmt, discountReason: cart.discount_reason || '', discountBy: await discountApprover(cart),
      finalTotal, receivedAmt: advancePaid || null, balanceDue,
      statusText: String(cart.status || 'draft').replace('complete', 'completed').toUpperCase(),
      notes,
      photosHtml: jobPhotosHtml(jobPhotos, belongings),
    });

    const pdfBuffer = await htmlToPdfBuffer(withQr(html, await paymentQrHtml(balanceDue, `Job card ${jobCartId}`)), { fitOnePage: true });

    return { pdfBuffer, invoiceNumber };
  } finally {
    conn.release();
  }
}

/**
 * Generate "Bill of Supply" PDF for Buy/Sell transactions matching exact O3 Car Spaa template
 */
async function generateBuySellInvoicePDF(buySellId) {
  const conn = await pool.getConnection();
  try {
    const [recRows] = await conn.query('SELECT * FROM buy_sell WHERE id = ?', [buySellId]);
    if (!recRows.length) throw new Error('Record not found');
    const record = recRows[0];
    await loadStudio(record.franchise_id || 1);
    const settings = studioSettings();

    const invoiceTitle = record.type === 'buy' ? 'Purchase Invoice' : 'Sales Invoice';
    const invoiceNumber = `${record.type === 'buy' ? 'PUR' : 'SAL'}-${record.id}`;
    
    const invoiceDate = new Date(record.transaction_date).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="max-width: 150px; height: auto;">`
      : `<h1 style="margin:0;color:#c00;font-size:24px;">O3 CAR SPAA</h1>`;

    const grandTotal = parseFloat(record.total_amount) || 0;
    
    const isBuy = record.type === 'buy';
    const qty = parseFloat(record.quantity) || 1;
    const htmlContent = buildInvoiceHTML({
      title: isBuy ? 'PURCHASE BILL' : 'SALES INVOICE',
      invoiceNumber,
      invoiceDate,
      billToLabel: isBuy ? 'Supplier' : 'Bill To',
      partyName: record.party_name || (isBuy ? 'Supplier' : 'Customer'),
      partyMobile: record.party_mobile || '-',
      items: [{ name: record.product_name || 'Product', qty, rate: parseFloat(record.unit_price) || (grandTotal / qty), amount: grandTotal }],
      itemsLabel: 'Products',
      grandTotal,
      finalTotal: grandTotal,
      receivedAmt: record.status === 'completed' ? grandTotal : null,
      balanceDue: record.status === 'completed' ? 0 : grandTotal,
      statusText: record.status === 'completed' ? (isBuy ? 'SETTLED' : 'PAID') : 'PENDING',
      notes: record.note || '',
    });

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

    await loadStudio(1);
    const settings = studioSettings();

    const invoiceNumber = `MB-${bill.id}`;
    const invoiceDate = new Date(bill.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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

    if (itemRows.length === 0 && (parseFloat(bill.grand_total) > 0 || parseFloat(bill.amount) > 0)) {
      const amt = parseFloat(bill.grand_total || bill.amount || 0);
      grandTotal = amt;
      itemRows.push({ name: (bill.description || 'MANUAL COUNTER BILL').toUpperCase(), qty: '1 PCS', rate: `₹${formatINR(amt)}`, amount: `₹${formatINR(amt)}` });
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
      discountType: bill.discount_type || 'fixed',
      discountValue: bill.discount_value || 0,
      discountReason: bill.discount_reason || '',
      discountReference: bill.discount_reference || '',
      discountBy: bill.discount_reference || '',
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
      SELECT ss.*, u.name AS staff_name, u.mobile AS staff_mobile, COALESCE(u.working_days_per_month, 26) AS working_days
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
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

    // Every part of the pay is its own line, so Subtotal = sum of lines and Total = Subtotal - deductions
    const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
    const [yy, mm] = String(rec.month_year).split('-').map(Number);
    const monthName = new Date(yy, (mm || 1) - 1, 1).toLocaleString('en-IN', { month: 'long', year: 'numeric' });
    const type = rec.salary_type || 'monthly';
    const unit = type === 'hourly' ? 'hour' : type === 'daily' ? 'day' : 'month';
    const payable = r2(Number(rec.days_present) + Number(rec.half_days) * 0.5 + Number(rec.paid_leave_days));
    const manual = Number(rec.manual_base) === 1;
    // [label, qty, rate, amount]
    const baseLine = !manual && type === 'hourly' ? [`Base pay - ${monthName} (hours worked)`, r2(rec.hours_worked), r2(rec.salary_rate), r2(rec.base_salary)]
      : !manual && type === 'daily' ? [`Base pay - ${monthName} (payable days)`, payable, r2(rec.salary_rate), r2(rec.base_salary)]
      : [`Base pay - ${monthName} (${manual ? 'set by admin' : `${payable} of ${rec.working_days} working days`})`, 1, r2(rec.base_salary), r2(rec.base_salary)];
    const lines = [
      baseLine,
      ...(Number(rec.include_incentive) !== 0 && Number(rec.incentive_amount) > 0 ? [['Incentives (job cards)', 1, r2(rec.incentive_amount), r2(rec.incentive_amount)]] : []),
      ...(Number(rec.include_referral) && Number(rec.referral_amount) > 0 ? [['Referral earnings', 1, r2(rec.referral_amount), r2(rec.referral_amount)]] : []),
      ...(Number(rec.bonus) > 0 ? [['Bonus', 1, r2(rec.bonus), r2(rec.bonus)]] : []),
    ];
    const grandTotal = r2(lines.reduce((a, l) => a + l[3], 0));
    const deductions = r2(Number(rec.deductions || 0) + Number(rec.complaint_deduction || 0));
    const finalTotal = r2(rec.final_salary);
    const td = 'padding:8px 12px;border-bottom:1px solid #e0e0e0;font-size:12px;';
    const serviceRowsHtml = lines.map(([k, q, rt, v]) =>
      `<tr><td style="${td}">${k}</td><td style="${td}text-align:center;">${q}</td><td style="${td}text-align:right;">₹${formatINR(rt)}</td><td style="${td}text-align:right;">₹${formatINR(v)}</td></tr>`).join('');
    const paidOn = rec.paid_at ? new Date(rec.paid_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '';
    const detailsRows = [
      ['Month', monthName],
      ['Pay method', `${type[0].toUpperCase() + type.slice(1)} @ ₹${formatINR(rec.salary_rate)} / ${unit}`],
      ['Present', `${Number(rec.days_present)} day(s)`],
      ['Half day', Number(rec.half_days) ? `${Number(rec.half_days)} day(s)` : ''],
      ['Paid leave', Number(rec.paid_leave_days) ? `${Number(rec.paid_leave_days)} day(s)` : ''],
      ['Unpaid leave', Number(rec.unpaid_leave_days) ? `${Number(rec.unpaid_leave_days)} day(s)` : ''],
      ['Absent', `${Number(rec.absent_days || 0)} day(s)`],
      ['Hours worked', type === 'hourly' ? `${Number(rec.hours_worked)} h` : ''],
      ['Paid on', paidOn ? `${paidOn}${rec.payment_mode ? ' · ' + String(rec.payment_mode).toUpperCase() : ''}` : ''],
    ];
    const emptyRows = '';

    const html = buildInvoiceHTML({
      title: 'SALARY SLIP',
      numberLabel: 'Slip No.',
      dateLabel: 'Date',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: rec.staff_name,
      partyMobile: rec.staff_mobile || '-',
      rightLabel: 'Month',
      rightValue: monthName,
      detailsRows,
      serviceRowsHtml,
      emptyRows,
      totalQty: lines.length,
      grandTotal,
      discountAmt: deductions,
      discountReason: deductions > 0 ? 'Deductions' : '',
      finalTotal,
      statusText: rec.status === 'paid' ? 'PAID' : 'PENDING',
      notes: manual ? (rec.notes || '') : '', // attendance is shown in Details; keep only an admin's own note
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
  discountReason = '',
  discountReference = '',
  discountBy = '',
  isWithGst = false,
  gstPct = 18,
  gstAmt = 0,
  studioGst = '',
  finalTotal,
  receivedAmt = null,
  advanceAmt = 0,
  balanceDue = 0,
  statusText = 'PAID',
  notes = '',
  // new, optional
  billTo = null,
  vehicle = null,
  items = null,
  extraCharges = [],
  itemsLabel,
  numberLabel,
  dateLabel,
  dueLabel,
  dueDateOverride,
  billToLabel,
  photosHtml = '',
  detailsRows = null,
}) {
  const { renderInvoice } = require('./invoiceTemplate');
  const isTaxInvoice = isWithGst || gstAmt > 0;
  const upper = String(title || '').toUpperCase();
  const minimal = /SALARY/.test(upper);
  const isBill = !upper || /^(BILL OF SUPPLY|TAX INVOICE|INVOICE)$/.test(upper);
  const docTitle = isBill ? (isTaxInvoice ? 'TAX INVOICE' : 'INVOICE') : upper;
  const docSubtitle = isBill ? (isTaxInvoice ? 'Original for recipient' : 'Bill of supply') : '';
  const s = (STUDIO && STUDIO.settings) || {};

  // Due date = invoice date + "invoice_due_days" (Settings → Invoice); same day by default
  let dueDate = '';
  const dmy = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(invoiceDate || '').trim());
  const d = dmy ? new Date(Number(dmy[3]), Number(dmy[2]) - 1, Number(dmy[1])) : new Date(invoiceDate);
  if (!isNaN(d)) {
    d.setDate(d.getDate() + (parseInt(s.invoice_due_days, 10) || 0));
    dueDate = d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
  }
  const discountLabel = Number(discountAmt) > 0
    ? [discountType === 'percentage' ? `${Number(discountValue)}%` : '', discountReason, discountBy ? `Approved by ${discountBy}` : ''].filter(Boolean).join(' · ')
    : '';

  return renderInvoice({
    studio: { ...STUDIO, gstin: STUDIO.gstin || studioGst || '' },
    logoUri: getLogoBase64(),
    heroUri: invoiceHeroDataUri(),
    docTitle, docSubtitle, minimal, photosHtml, detailsRows,
    invoiceNumber, invoiceDate, dueDate: dueDateOverride !== undefined ? dueDateOverride : (minimal || !isBill ? '' : dueDate),
    numberLabel, dateLabel, dueLabel,
    showGstin: isTaxInvoice || !!(STUDIO.gstin),
    billTo: billTo || { name: partyName, mobile: partyMobile },
    billToLabel: billToLabel || (minimal ? 'Employee' : 'Bill To'),
    vehicle,
    rightLabel, rightValue,
    items, serviceRowsHtml, itemsLabel: itemsLabel || (minimal ? 'Earnings' : 'Services'),
    totals: {
      subtotal: grandTotal, discountAmt, discountLabel, gstPct, gstAmt, extra: extraCharges,
      finalTotal, advance: advanceAmt, paid: receivedAmt, balance: balanceDue,
    },
    amountWords: amountInWords(finalTotal),
    statusText,
    notes,
  });
}

/** Optional invoice header picture uploaded in Settings → Invoice (embedded so the PDF needs no network). */
const _heroCache = {};
function invoiceHeroDataUri() {
  try {
    const rel = STUDIO.settings && STUDIO.settings.invoice_hero_url;
    let file = rel && rel.startsWith('/uploads/') ? path.join(__dirname, '..', '..', rel.replace(/^\//, '')) : null;
    // no photo uploaded in Settings → the studio's blue-car showroom photo
    if (!file || !fs.existsSync(file)) file = path.join(__dirname, '..', 'assets', 'invoice-hero.jpg');
    if (!fs.existsSync(file)) return null;
    const mtime = fs.statSync(file).mtimeMs;
    if (_heroCache[file] && _heroCache[file].mtime === mtime) return _heroCache[file].uri;
    const ext = path.extname(file).toLowerCase();
    const mime = ext === '.png' ? 'image/png' : ext === '.webp' ? 'image/webp' : 'image/jpeg';
    const uri = `data:${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    _heroCache[file] = { mtime, uri };
    return uri;
  } catch { return null; }
}

/** Put the "scan & pay" block next to the totals when the template has a slot, else at the end. */
function withQr(html, qrHtml) {
  if (!qrHtml) return html;
  return html.includes('<!--PAY_QR-->') ? html.replace('<!--PAY_QR-->', qrHtml) : html.replace('</body>', qrHtml + '</body>');
}

// â”€â”€â”€ Shared PDF renderer â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€
/** A statement (package history etc.) in the same design as the invoice / job card: header, title, two cards, body, footer. */
async function renderStatementPDF({ franchiseId, title, number, numberLabel, date, billTo, billToLabel, detailsLabel, detailsRows, bodyHtml, statusText = '' }) {
  await loadStudio(franchiseId);
  const { renderInvoice } = require('./invoiceTemplate');
  const html = renderInvoice({
    studio: STUDIO, logoUri: getLogoBase64(), heroUri: invoiceHeroDataUri(), minimal: true,
    docTitle: title, invoiceNumber: number, numberLabel, invoiceDate: date, dateLabel: 'Date', showGstin: false,
    billTo, billToLabel, detailsLabel, detailsRows, bodyHtml, statusText,
  });
  return htmlToPdfBuffer(html);
}

async function renderPDF(html, invoiceNumber) {
  const pdfBuffer = await htmlToPdfBuffer(html);
  return { pdfBuffer, invoiceNumber };
}

/**
 * Generate "Bill of Supply" PDF for Package Purchase matching exact O3 Car Spaa template
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
        (CASE WHEN JSON_VALID(pay.notes) THEN JSON_UNQUOTE(JSON_EXTRACT(pay.notes, '$.package_request_id')) END) = pr.id
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
    await loadStudio(1);
    const settings = studioSettings();

    const invoiceNumber = `PKG-${record.id}`;
    const invoiceDate = new Date(record.approved_at || record.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

    const grandTotal = parseFloat(record.price) || 0;
    
    const html = buildInvoiceHTML({
      title: 'INVOICE',
      invoiceNumber,
      invoiceDate,
      partyName: record.customer_name || 'Customer',
      partyMobile: record.customer_mobile || '-',
      vehicle: { model: `${record.brand || ''} ${record.model || ''}`.trim(), reg: record.registration_no },
      items: [{ name: record.package_name || 'Package', note: 'Package / membership', qty: 1, rate: grandTotal, amount: grandTotal }],
      itemsLabel: 'Package',
      grandTotal,
      finalTotal: grandTotal,
      receivedAmt: receivedAmount,
      balanceDue,
      statusText: paymentStatusText,
    });

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
                WHEN 'semi_sedan' THEN svc.price_semi_sedan
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
      WHERE b.id = ? AND (b.job_type = 'quick_wash' OR b.job_type IS NULL OR b.job_type = 'standard' OR b.job_type = 'wash')
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
    const charged = parseFloat(record.total_amount) || 0;
    const qwDiscount = parseFloat(record.discount_amount) || 0;
    // price before the first-wash discount (what the studio set on the quick wash form)
    const servicePrice = hasPackage ? 0 : (charged + qwDiscount || parseFloat(record.service_price) || 0);
    const grandTotal = servicePrice;
    
    const invoiceNumber = `QW-${record.id}`;
    const invoiceDate = istDate(record.completed_at || new Date());

    // Logo
    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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
      title: 'INVOICE',
      invoiceNumber,
      invoiceDate,
      logoHtml,
      partyName: customerName,
      partyMobile: customerMobile,
      vehicle: { model: `${brand} ${model}`.trim(), reg: regNo !== '-' ? regNo : '' },
      rightLabel: 'Vehicle',
      rightValue,
      serviceRowsHtml,
      emptyRows,
      totalQty: 1,
      grandTotal,
      discountAmt: hasPackage ? 0 : qwDiscount,
      discountType: 'fixed',
      discountReason: qwDiscount > 0 ? `First wash ${Number(record.discount_percent) || 50}% off` : '',
      finalTotal: hasPackage ? 0 : Math.max(0, servicePrice - qwDiscount),
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
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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

    const html = buildInvoiceHTML({
      title: 'QUOTATION',
      numberLabel: 'Quotation No.',
      dateLabel: 'Date',
      dueLabel: 'Valid Till',
      dueDateOverride: validUntil !== '-' ? validUntil : '',
      invoiceNumber: quotationNumber,
      invoiceDate: quotationDate,
      partyName: q.customer_name || 'Customer',
      partyMobile: q.customer_mobile || '-',
      billTo: { name: q.customer_name || 'Customer', mobile: q.customer_mobile, email: q.customer_email },
      vehicle: (q.car_brand || q.car_model || q.vehicle_no) ? { model: `${q.car_brand || ''} ${q.car_model || ''}`.trim(), reg: q.vehicle_no } : null,
      items: items.map(it => ({ name: it.name, note: it.item_type && it.item_type !== 'service' ? it.item_type : '', qty: it.quantity, rate: it.price, amount: it.total })),
      grandTotal: subtotal,
      discountAmt,
      isWithGst: taxAmt > 0,
      gstPct: parseFloat(q.tax_percentage) || 18,
      gstAmt: taxAmt,
      finalTotal: grandTotal,
      receivedAmt: null,
      balanceDue: 0,
      statusText: 'ESTIMATE',
      notes: [q.notes, 'This is an estimate, not a bill. Prices may change after inspection.'].filter(Boolean).join(' '),
    });

    const pdfBuffer = await htmlToPdfBuffer(html);
    return { pdfBuffer, quotationNumber };
  } finally {
    conn.release();
  }
}

async function generateBookingInvoicePDF(bookingId) {
  const conn = await pool.getConnection();
  let released = false;
  try {
    const [bookings] = await conn.query(`
      SELECT b.*, u.name AS customer_name, u.mobile AS customer_mobile, u.email AS customer_email,
             v.registration_no, v.brand, v.model,
             s.name AS service_name, s.price_hatchback, s.price_semi_sedan, s.price_sedan, s.price_premium_sedan, s.price_suv, s.price_premium_suv
      FROM bookings b
      LEFT JOIN users u ON b.customer_id = u.id
      LEFT JOIN vehicles v ON b.vehicle_id = v.id
      LEFT JOIN services s ON b.service_id = s.id
      WHERE b.id = ?
    `, [bookingId]);

    if (!bookings.length) throw new Error('Booking not found');
    const booking = bookings[0];

    // Job card made for this booking: that is the real bill (services done, discount, payment)
    const [[jc]] = await conn.query('SELECT id FROM job_carts WHERE booking_id = ? ORDER BY id DESC LIMIT 1', [booking.id]);
    if (jc) { conn.release(); released = true; return await generateInvoicePDF(jc.id); }

    await loadStudio(1);
    const settings = studioSettings();

    const invoiceNumber = `BKG-${booking.id}`;
    // the day the invoice is made
    const invoiceDate = istDate(booking.completed_at || new Date());

    const logoBase64 = getLogoBase64();
    const logoHtml = logoBase64
      ? `<img src="${logoBase64}" alt="O3 Car Spaa" style="width:80px;height:80px;object-fit:contain;" />`
      : `<div style="width:80px;height:80px;background:#0284C7;border-radius:8px;display:flex;align-items:center;justify-content:center;color:white;font-weight:900;font-size:14px;text-align:center;">O3<br>Spaa</div>`;

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

    const pickup = parseFloat(booking.pickup_charge || 0);
    const bkDiscount = parseFloat(booking.discount_amount || 0);
    // every booked service on its own line
    let cartItems = [];
    try { cartItems = JSON.parse(booking.cart_items_json || '[]') || []; } catch { cartItems = []; }
    const items = cartItems.length
      ? cartItems.map(c => ({ name: c.name, note: !Number(c.price) && booking.package_id ? `₹0 — included in your package${booking.package_name ? ` (${booking.package_name})` : ''}` : '', qty: 1, rate: Number(c.price) || 0, amount: Number(c.price) || 0 }))
      : [{ name: booking.service_name || booking.package_service_name || 'Car wash service', qty: 1, rate: finalTotal - pickup + bkDiscount, amount: finalTotal - pickup + bkDiscount }];
    const itemsTotal = items.reduce((a, i) => a + i.amount, 0);
    const html = buildInvoiceHTML({
      title: 'INVOICE',
      invoiceNumber,
      invoiceDate,
      partyName: booking.customer_name || 'Customer',
      partyMobile: booking.customer_mobile || '-',
      billTo: { name: booking.customer_name || 'Customer', mobile: booking.customer_mobile, email: booking.customer_email },
      vehicle: { model: `${booking.brand || ''} ${booking.model || ''}`.trim(), reg: booking.registration_no },
      items,
      extraCharges: pickup > 0 ? [{ label: 'Pickup / drop', amount: pickup }] : [],
      grandTotal: itemsTotal,
      discountAmt: bkDiscount,
      discountType: 'fixed',
      discountReason: bkDiscount > 0 ? (Number(booking.discount_percent) > 0 ? `First wash ${Number(booking.discount_percent)}% off` : 'Discount') : '',
      finalTotal,
      receivedAmt: advancePaid,
      balanceDue,
      statusText: paymentStatusText,
    });

    const pdfBuffer = await htmlToPdfBuffer(withQr(html, await paymentQrHtml(balanceDue, invoiceNumber)));
    return { pdfBuffer, invoiceNumber };
  } finally {
    if (!released) conn.release();
  }
}

/** Sample invoice with the studio's current Settings — for the "Preview invoice" button. */
async function generateSampleInvoicePDF(franchiseId = 1) {
  await loadStudio(franchiseId);
  const today = new Date().toLocaleDateString('en-IN', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const items = [
    { name: 'Premium Foam Wash', qty: 1, rate: 800, amount: 800 },
    { name: 'Ceramic Coating', note: '3-year protection', qty: 1, rate: 6500, amount: 6500 },
    { name: 'Interior Detailing', qty: 1, rate: 2000, amount: 2000 },
  ];
  const subtotal = items.reduce((a, b) => a + b.amount, 0);
  const html = buildInvoiceHTML({
    title: 'INVOICE',
    invoiceNumber: `${(STUDIO.settings && STUDIO.settings.invoice_prefix) || 'O3'}-SAMPLE`,
    invoiceDate: today,
    partyName: 'Sample Customer',
    partyMobile: '9XXXXXXXXX',
    billTo: { name: 'Sample Customer', mobile: '9XXXXXXXXX', address: 'Customer address appears here' },
    vehicle: { model: 'Toyota Fortuner', reg: 'GJ06AB1234', colour: 'White', km: 45230, type: 'SUV' },
    items,
    grandTotal: subtotal,
    finalTotal: subtotal,
    receivedAmt: null,
    balanceDue: subtotal,
    statusText: 'SAMPLE',
  });
  return htmlToPdfBuffer(withQr(html, await paymentQrHtml(subtotal, 'Sample')));
}

module.exports = {
  htmlToPdfBuffer,
  renderStatementPDF,
  warmUp: () => getBrowser().catch(() => null),
  generateSampleInvoicePDF,
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

