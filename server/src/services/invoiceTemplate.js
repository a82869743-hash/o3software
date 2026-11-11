/**
 * invoiceTemplate.js — the O3 Car Spaa invoice design (A4, printed by Puppeteer).
 *
 * Everything shown comes from the studio's own Settings (name, tagline, address, phone, GSTIN, PAN,
 * Instagram, website, slogan, header picture, terms, highlight strips) — nothing is hard-coded.
 * Used by every invoice/bill/receipt through buildInvoiceHTML() in invoiceService.js.
 */
const fs = require('fs');
const path = require('path');

let ICONS = {};
try { ICONS = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'assets', 'invoiceIcons.json'), 'utf8')); } catch { /* icons optional */ }

const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const money = (n) => Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const icon = (name, size = 18, color = 'currentColor', stroke = 1.6) =>
  `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="${color}" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round">${ICONS[name] || ICONS.sparkles || ''}</svg>`;

function serviceIcon(label) {
  const n = label.toLowerCase();
  if (/wash|foam|clean/.test(n)) return 'droplets';
  if (/graphene/.test(n)) return 'hexagon';
  if (/ceramic|coat/.test(n)) return 'shield-check';
  if (/ppf|film|wrap/.test(n)) return 'layers';
  if (/dent|paint/.test(n)) return 'paintbrush';
  if (/interior|seat|upholster/.test(n)) return 'armchair';
  if (/detail|polish|rubbing/.test(n)) return 'sparkles';
  if (/accessor|product/.test(n)) return 'package';
  if (/repair|service|mechanic/.test(n)) return 'wrench';
  return 'car';
}
function highlightIcon(label) {
  const n = label.toLowerCase();
  if (/premium|product|quality/.test(n)) return 'gem';
  if (/expert|technician|team|staff/.test(n)) return 'user-check';
  if (/tech|machine|advanced/.test(n)) return 'cpu';
  if (/protect|last|warranty/.test(n)) return 'shield';
  if (/appear|shine|look|finish/.test(n)) return 'wand-sparkles';
  return 'sparkles';
}
const list = (v, fallback) => {
  const items = String(v || '').split(/\r?\n|,/).map(x => x.trim()).filter(Boolean);
  return items.length ? items : fallback;
};

/** Older callers pass pre-rendered <tr> rows — turn them into items so they get the new table too. */
function itemsFromRowsHtml(rowsHtml = '') {
  const out = [];
  for (const tr of String(rowsHtml).match(/<tr[\s\S]*?<\/tr>/gi) || []) {
    const cells = (tr.match(/<td[^>]*>([\s\S]*?)<\/td>/gi) || []).map(td => td.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/g, ' ').replace(/\s+/g, ' ').trim());
    if (!cells.length || !cells.some(Boolean)) continue;
    if (cells.length >= 4) out.push({ name: cells[0], qty: cells[1], rate: cells[2], amount: cells[cells.length - 1], preformatted: true });
    else out.push({ name: cells[0], qty: '', rate: '', amount: cells[cells.length - 1], preformatted: true });
  }
  return out;
}

function renderInvoice(o) {
  const st = o.studio || {};
  const s = st.settings || {};
  const studioName = st.studio_name || s.studio_name || 'O3 Car Spaa';
  const tagline = st.tagline || s.tagline || 'Premium Car Care & Detailing Studio';
  const slogan = s.invoice_slogan || ''; // no slogan unless the studio types one in Settings → Invoice
  const servicesStrip = list(s.invoice_services_strip, ['Washing', 'Ceramic Coating', 'Graphene Coating', 'PPF', 'Denting & Painting', 'Detailing', 'Accessories']).slice(0, 8);
  const highlights = list(s.invoice_highlights, ['Premium Products', 'Expert Technicians', 'Advanced Technology', 'Long Lasting Protection', 'Enhanced Appearance']).slice(0, 5);
  const terms = list(s.invoice_terms && s.invoice_terms.replace(/,/g, '‚'), [
    `Thank you for choosing ${studioName}.`,
    'All services are non-refundable.',
    'Please check your vehicle and belongings before leaving.',
    'We are not responsible for any valuables left in the vehicle.',
    'Warranty is as per product and service terms.',
    'This is a computer generated invoice and does not require a signature.',
  ]).map(t => t.replace(/‚/g, ','));
  const footerWords = list(s.invoice_footer_words && s.invoice_footer_words.replace(/\|/g, ','), ['Clean', 'Protect', 'Enhance', 'Maintain']);
  const heroUrl = o.heroUri || null;
  const minimal = !!o.minimal; // salary slips etc. — no marketing strips

  const items = (o.items && o.items.length ? o.items : itemsFromRowsHtml(o.serviceRowsHtml)).slice(0, 40);
  const status = String(o.statusText || '').toUpperCase();
  const statusCls = /PAID|RECEIVED|SETTLED/.test(status) && !/UN|PENDING|PARTIAL/.test(status) ? 'paid' : (status ? 'due' : '');

  const t = o.totals || {};
  const totalRows = [
    ['Subtotal', t.subtotal],
    ...(Number(t.discountAmt) > 0 ? [[`Discount${t.discountLabel ? ` (${esc(t.discountLabel)})` : ''}`, -Number(t.discountAmt)]] : []),
    ...(t.extra || []).filter(x => Number(x.amount)).map(x => [esc(x.label), x.amount]),
    ...(Number(t.gstAmt) > 0 ? [[`CGST @ ${(Number(t.gstPct) / 2).toFixed(1)}%`, t.gstAmt / 2], [`SGST @ ${(Number(t.gstPct) / 2).toFixed(1)}%`, t.gstAmt / 2]] : []),
  ].filter(([, v]) => v !== undefined && v !== null);
  const paidRows = [
    ...(Number(t.advance) > 0 ? [['Advance paid', -Number(t.advance)]] : []),
    ...(t.paid !== undefined && t.paid !== null && Number(t.paid) > 0 ? [[Number(t.advance) > 0 ? 'Paid at studio' : 'Paid', -Number(t.paid)]] : []),
    ...(Number(t.balance) > 0 ? [['Balance due', t.balance]] : []),
  ];

  const v = o.vehicle;
  const vehicleRows = v ? [
    ['Make / Model', v.model], ['Registration No.', v.reg], ['Colour', v.colour], ['KM Reading', v.km ? Number(v.km).toLocaleString('en-IN') : ''], ['Car Type', v.type],
  ].filter(([, val]) => val) : o.detailsRows ? o.detailsRows.filter(([, val]) => val !== '' && val !== null && val !== undefined)
    : (o.rightLabel ? [[o.rightLabel, o.rightValue]] : []);

  const contact = [
    st.mobile && `<div class="fc">${icon('phone', 15, '#fff')}<span>${esc(st.mobile)}</span></div>`,
    st.address && `<div class="fc">${icon('map-pin', 15, '#fff')}<span>${esc(studioName)}<br>${esc(st.address)}</span></div>`,
    s.studio_instagram && `<div class="fc">${icon('instagram', 15, '#fff')}<span>@${esc(String(s.studio_instagram).replace(/^@/, ''))}</span></div>`,
    s.studio_website && `<div class="fc">${icon('globe', 15, '#fff')}<span>${esc(String(s.studio_website).replace(/^https?:\/\//, ''))}</span></div>`,
    !s.studio_website && st.email && `<div class="fc">${icon('mail', 15, '#fff')}<span>${esc(st.email)}</span></div>`,
  ].filter(Boolean);

  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Manrope', Arial, sans-serif; color: #0F172A; -webkit-print-color-adjust: exact; print-color-adjust: exact; font-size: 11px; }
  .page { width: 210mm; min-height: 297mm; position: relative; display: flex; flex-direction: column; background: #fff; }
  .script { font-family: 'Manrope', Arial, sans-serif; font-weight: 400; }
  /* Header */
  .hdr { display: flex; height: 58mm; position: relative; overflow: hidden; }
  .hdr-l { width: 55%; padding: 9mm 0 0 10mm; position: relative; z-index: 2; }
  .brand { display: flex; align-items: center; gap: 10px; }
  .brand img { height: 54px; width: auto; border-radius: 8px; }
  .brand .nm { font-size: 25px; font-weight: 800; letter-spacing: 3px; text-transform: uppercase; line-height: 1; }
  .brand .tg { font-size: 7.6px; font-weight: 700; letter-spacing: 2.6px; text-transform: uppercase; color: #334155; margin-top: 6px; }
  .strip { display: flex; margin-top: 8mm; }
  .strip .it { flex: 1; text-align: center; padding: 0 3px; border-right: 1px solid #E2E8F0; color: #0F172A; }
  .strip .it:last-child { border-right: 0; }
  .strip .it span { display: block; font-size: 6.4px; font-weight: 700; text-transform: uppercase; letter-spacing: .3px; margin-top: 3px; line-height: 1.25; }
  .hdr-r { position: absolute; right: 0; top: 0; bottom: 0; width: 39%; clip-path: polygon(26% 0, 100% 0, 100% 100%, 0 100%);
    background: ${heroUrl ? `#0B1220 url('${heroUrl}') center/cover no-repeat` : 'radial-gradient(120% 90% at 70% 70%, #1E3A8A 0%, #0B1220 55%, #05080F 100%)'}; }
  .hdr-r .shade { position: absolute; inset: 0; background: linear-gradient(90deg, rgba(5,8,15,.55), rgba(5,8,15,.05)); }
  .hdr-r .car { position: absolute; right: 6mm; bottom: 3mm; opacity: .16; }
  .hdr-r .slogan { position: absolute; right: 7mm; top: 7mm; color: #fff; font-size: 24px; transform: rotate(-6deg); text-shadow: 0 2px 8px rgba(0,0,0,.4); }
  .acc1 { position: absolute; top: 0; left: 59%; width: 16mm; height: 100%; background: linear-gradient(180deg, #2563EB, #1D4ED8); clip-path: polygon(40% 0, 100% 0, 60% 100%, 0 100%); z-index: 1; opacity: .95; }
  .acc2 { position: absolute; top: 0; left: 56.5%; width: 10mm; height: 100%; background: #0F172A; clip-path: polygon(55% 0, 100% 0, 45% 100%, 0 100%); z-index: 1; }
  /* Title row */
  .ttl { display: flex; justify-content: space-between; align-items: flex-start; padding: 6mm 10mm 0; }
  .badge { background: linear-gradient(90deg, #0F3D91, #2563EB); color: #fff; font-weight: 900; font-size: 24px; letter-spacing: 2px; padding: 9px 30px 9px 22px; clip-path: polygon(0 0, 100% 0, 94% 100%, 0 100%); }
  .sub { font-size: 8.5px; color: #64748B; margin-top: 5px; font-weight: 600; letter-spacing: .4px; }
  .meta { border-left: 2px solid #E2E8F0; padding-left: 12px; }
  .meta td { padding: 1.8px 6px 1.8px 0; font-size: 10.5px; }
  .meta td.k { color: #475569; } .meta td.v { font-weight: 700; }
  .pill { display: inline-block; margin-top: 6px; padding: 3px 12px; border-radius: 999px; font-size: 9px; font-weight: 800; letter-spacing: 1.2px; }
  .pill.paid { background: #DCFCE7; color: #166534; border: 1px solid #86EFAC; }
  .pill.due { background: #FEF3C7; color: #92400E; border: 1px solid #FCD34D; }
  /* Cards */
  .cards { display: flex; gap: 5mm; padding: 5mm 10mm 0; }
  .card { flex: 1; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; }
  .card h4 { font-size: 9px; font-weight: 800; letter-spacing: 1px; text-transform: uppercase; padding: 6px 12px; background: #EEF4FF; color: #0F3D91; }
  .card .bd { padding: 8px 12px 10px; }
  .card .who { font-size: 15px; font-weight: 800; margin-bottom: 4px; }
  .card .ln { font-size: 10.5px; color: #334155; line-height: 1.55; }
  .kv { width: 100%; border-collapse: collapse; }
  .kv td { padding: 3.6px 0; font-size: 10.5px; border-bottom: 1px solid #F1F5F9; }
  .kv tr:last-child td { border-bottom: 0; }
  .kv td.k { color: #475569; width: 45%; } .kv td.v { font-weight: 700; }
  /* Items */
  .items { margin: 5mm 10mm 0; border-collapse: separate; border-spacing: 0; width: calc(100% - 20mm); border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; }
  .items th { background: #0F172A; color: #fff; font-size: 10px; font-weight: 700; padding: 8px 10px; text-align: left; letter-spacing: .3px; }
  .items td { padding: 7px 10px; font-size: 10.5px; border-top: 1px solid #EEF2F7; vertical-align: top; }
  .items tr:nth-child(even) td { background: #F8FAFC; }
  .items .r { text-align: right; } .items .c { text-align: center; }
  .items .note { display: block; font-size: 8.8px; color: #64748B; margin-top: 2px; }
  /* Totals */
  .tot { display: flex; gap: 6mm; padding: 4mm 10mm 0; align-items: flex-start; }
  .tot-l { flex: 1; }
  .words { font-size: 9.5px; color: #334155; background: #F8FAFC; border: 1px dashed #CBD5E1; border-radius: 6px; padding: 7px 10px; }
  .words b { color: #0F172A; }
  .tot-r { width: 78mm; }
  .tr { display: flex; justify-content: space-between; font-size: 10.5px; padding: 3px 4px; }
  .tr.neg span:last-child { color: #DC2626; }
  .tr.bal { font-weight: 800; color: #B45309; }
  .grand { margin-top: 5px; display: flex; justify-content: space-between; align-items: center; color: #fff; background: linear-gradient(90deg, #0F172A 0%, #0F3D91 60%, #2563EB 100%); padding: 10px 14px; border-radius: 4px; clip-path: polygon(3% 0, 100% 0, 100% 100%, 0 100%); }
  .grand .l { font-weight: 800; letter-spacing: 1.5px; font-size: 13px; } .grand .a { font-weight: 900; font-size: 17px; }
  .notes { margin-top: 6px; font-size: 9.5px; color: #475569; }
  /* Highlights */
  .hl { display: flex; margin: 6mm 10mm 0; background: #EEF4FF; border-radius: 6px; padding: 8px 0; }
  .hl .it { flex: 1; text-align: center; border-right: 1px solid #D6E2FB; color: #0F3D91; }
  .hl .it:last-child { border-right: 0; }
  .hl .it span { display: block; font-size: 8.6px; font-weight: 700; color: #0F172A; margin-top: 3px; }
  /* Terms */
  .tm { display: flex; padding: 5mm 10mm 4mm; gap: 8mm; align-items: center; }
  .tm-l { flex: 1; } .tm-l h5 { font-size: 10px; font-weight: 800; margin-bottom: 4px; }
  .tm-l ol { padding-left: 14px; } .tm-l li { font-size: 8.8px; color: #334155; line-height: 1.55; }
  .ty { width: 62mm; text-align: center; }
  .ty .script { font-size: 40px; line-height: 1; color: #0F172A; }
  .ty .f { font-size: 8.5px; letter-spacing: 3px; font-weight: 700; color: #334155; margin-top: 4px; }
  .ty .bar { width: 26px; height: 3px; background: #2563EB; margin: 6px auto 0; border-radius: 2px; }
  /* Footer */
  .ftr { margin-top: auto; background: #0B1220; color: #fff; padding: 6mm 10mm 5mm; position: relative; overflow: hidden; }
  .fcs { display: flex; gap: 6mm; align-items: flex-start; flex-wrap: nowrap; justify-content: space-between; }
  .fc { display: flex; gap: 7px; align-items: flex-start; font-size: 9.6px; line-height: 1.45; }
  .fc span { max-width: 80mm; }
  .fc svg { flex-shrink: 0; margin-top: 1px; }
  .fline { height: 2px; background: linear-gradient(90deg, #2563EB, rgba(37,99,235,.15)); margin: 4mm 0 3mm; }
  .fwords { text-align: center; font-size: 9.5px; letter-spacing: 4px; color: #CBD5E1; font-weight: 600; text-transform: uppercase; }
  .facc { position: absolute; right: -6mm; bottom: -2mm; width: 34mm; height: 30mm; background: linear-gradient(135deg, #2563EB, #1D4ED8); clip-path: polygon(70% 0, 100% 0, 30% 100%, 0 100%); opacity: .9; }
  .qr-slot > div { margin-top: 6px !important; }
  .min .hl, .min .tm-r { display: none; }
  /* Statement blocks (package history) */
  .sec { margin: 5mm 10mm 0; border: 1px solid #E2E8F0; border-radius: 6px; overflow: hidden; page-break-inside: avoid; }
  .sec-h { display: flex; justify-content: space-between; align-items: center; background: #0F172A; color: #fff; padding: 7px 12px; }
  .sec-h b { font-size: 12.5px; letter-spacing: .3px; } .sec-h span.m { font-size: 9.5px; color: #CBD5E1; display: block; margin-top: 1px; }
  .sec .pill { margin-top: 0; }
  .facts { display: grid; grid-template-columns: repeat(6, 1fr); border-bottom: 1px solid #EEF2F7; }
  .facts div { padding: 6px 10px; border-right: 1px solid #EEF2F7; } .facts div:last-child { border-right: 0; }
  .facts span { display: block; font-size: 8px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #64748B; }
  .facts b { font-size: 11px; }
  .st { width: 100%; border-collapse: collapse; table-layout: fixed; }
  .st th { background: #EEF4FF; color: #0F3D91; font-size: 9px; font-weight: 800; letter-spacing: .5px; text-transform: uppercase; padding: 6px 10px; text-align: left; }
  .st td { padding: 6px 10px; font-size: 10.5px; border-top: 1px solid #EEF2F7; }
  .st .r { text-align: right; } .st .empty { text-align: center; color: #94A3B8; }
  .sec .lbl { font-size: 9px; font-weight: 800; letter-spacing: .6px; text-transform: uppercase; color: #0F3D91; padding: 7px 10px 2px; }
</style></head>
<body><div class="page${minimal ? ' min' : ''}">

  <div class="hdr">
    <div class="hdr-l">
      <div class="brand">
        ${o.logoUri ? `<img src="${o.logoUri}" alt="">` : ''}
        <div><div class="nm">${esc(studioName)}</div><div class="tg">${esc(tagline)}</div></div>
      </div>
      ${minimal ? '' : `<div class="strip">${servicesStrip.map(x => `<div class="it">${icon(serviceIcon(x), 17, '#0F172A', 1.5)}<span>${esc(x)}</span></div>`).join('')}</div>`}
    </div>
    <div class="acc2"></div><div class="acc1"></div>
    <div class="hdr-r"><div class="shade"></div>${heroUrl ? '' : `<div class="car">${icon('car', 120, '#fff', 1)}</div>`}${slogan ? `<div class="slogan script">${esc(slogan)}</div>` : ''}</div>
  </div>

  <div class="ttl">
    <div>
      <div class="badge">${esc(o.docTitle || 'INVOICE')}</div>
      ${o.docSubtitle ? `<div class="sub">${esc(o.docSubtitle)}</div>` : ''}
    </div>
    <div class="meta"><table>
      <tr><td class="k">${esc(o.numberLabel || 'Invoice No.')}</td><td>:</td><td class="v">${esc(o.invoiceNumber || '-')}</td></tr>
      <tr><td class="k">${esc(o.dateLabel || 'Invoice Date')}</td><td>:</td><td class="v">${esc(o.invoiceDate || '')}</td></tr>
      ${o.dueDate ? `<tr><td class="k">${esc(o.dueLabel || 'Due Date')}</td><td>:</td><td class="v">${esc(o.dueDate)}</td></tr>` : ''}
      ${st.gstin && o.showGstin !== false ? `<tr><td class="k">GSTIN</td><td>:</td><td class="v">${esc(st.gstin)}</td></tr>` : ''}
      ${s.studio_pan ? `<tr><td class="k">PAN</td><td>:</td><td class="v">${esc(s.studio_pan)}</td></tr>` : ''}
    </table>${statusCls ? `<span class="pill ${statusCls}">${esc(status)}</span>` : ''}</div>
  </div>

  <div class="cards">
    <div class="card"><h4>${esc(o.billToLabel || 'Bill To')}</h4><div class="bd">
      <div class="who">${esc(o.billTo?.name || 'Customer')}</div>
      ${o.billTo?.address ? `<div class="ln">${esc(o.billTo.address)}</div>` : ''}
      ${o.billTo?.mobile && o.billTo.mobile !== '-' ? `<div class="ln">Phone: ${/^\d{10}$/.test(o.billTo.mobile) ? '+91 ' : ''}${esc(o.billTo.mobile)}</div>` : ''}
      ${o.billTo?.email ? `<div class="ln">${esc(o.billTo.email)}</div>` : ''}
      ${o.billTo?.gstin ? `<div class="ln">GSTIN: ${esc(o.billTo.gstin)}</div>` : ''}
    </div></div>
    ${vehicleRows.length ? `<div class="card"><h4>${esc(o.detailsLabel || (v ? 'Vehicle Details' : 'Details'))}</h4><div class="bd"><table class="kv">
      ${vehicleRows.map(([k, val]) => `<tr><td class="k">${esc(k)}</td><td class="v">${esc(val)}</td></tr>`).join('')}
    </table></div></div>` : ''}
  </div>

  ${o.bodyHtml ? o.bodyHtml : `<table class="items">
    <thead><tr><th style="width:9mm" class="c">No.</th><th>${esc(o.itemsLabel || 'Services')}</th><th class="c" style="width:14mm">Qty</th><th class="r" style="width:26mm">Rate (₹)</th><th class="r" style="width:30mm">Amount (₹)</th></tr></thead>
    <tbody>
      ${items.map((it, i) => `<tr>
        <td class="c">${i + 1}</td>
        <td>${esc(it.name)}${it.note ? `<span class="note">${esc(it.note)}</span>` : ''}</td>
        <td class="c">${esc(it.qty ?? '')}</td>
        <td class="r">${it.preformatted ? esc(it.rate) : (it.rate !== undefined && it.rate !== '' ? money(it.rate) : '')}</td>
        <td class="r"><b>${it.preformatted ? esc(it.amount) : money(it.amount)}</b></td>
      </tr>`).join('') || '<tr><td colspan="5" class="c" style="color:#94A3B8">No items</td></tr>'}
    </tbody>
  </table>

  <div class="tot">
    <div class="tot-l">
      ${o.amountWords ? `<div class="words">Amount in words: <b>${esc(o.amountWords)}</b></div>` : ''}
      <div class="qr-slot"><!--PAY_QR--></div>
      ${o.notes ? `<div class="notes"><b>Note:</b> ${esc(o.notes).replace(/\n/g, '<br>')}</div>` : ''}
    </div>
    <div class="tot-r">
      ${totalRows.map(([k, val]) => `<div class="tr${Number(val) < 0 ? ' neg' : ''}"><span>${k}</span><span>${Number(val) < 0 ? '−' : ''}₹${money(Math.abs(val))}</span></div>`).join('')}
      <div class="grand"><span class="l">GRAND TOTAL</span><span class="a">₹ ${money(t.finalTotal)}</span></div>
      ${paidRows.map(([k, val]) => `<div class="tr${k === 'Balance due' ? ' bal' : ''}"><span>${k}</span><span>₹${money(Math.abs(val))}</span></div>`).join('')}
    </div>
  </div>`}

  ${o.photosHtml ? o.photosHtml : minimal ? '' : `<div class="hl">${highlights.map(x => `<div class="it">${icon(highlightIcon(x), 22, '#0F3D91', 1.5)}<span>${esc(x)}</span></div>`).join('')}</div>`}

  <div class="tm">
    <div class="tm-l">${minimal ? '' : `<h5>Terms &amp; Conditions:</h5><ol>${terms.map(x => `<li>${esc(x)}</li>`).join('')}</ol>`}${st.invoice_footer ? `<div class="notes" style="margin-top:6px">${esc(st.invoice_footer)}</div>` : ''}</div>
    <div class="ty tm-r"><div class="script">Thank You</div><div class="f">FOR YOUR TRUST</div><div class="bar"></div></div>
  </div>

  <div class="ftr">
    <div class="fcs">${contact.join('')}</div>
    <div class="fline"></div>
    <div class="fwords">${footerWords.map(esc).join('&nbsp;&nbsp;|&nbsp;&nbsp;')}</div>
    <div class="facc"></div>
  </div>

</div></body></html>`;
}

module.exports = { renderInvoice, itemsFromRowsHtml };
