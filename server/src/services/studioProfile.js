/**
 * studioProfile.js — One place to read a franchise's studio details + active payment QR.
 * Used by settings APIs, invoices, job-card PDFs, quotations and WhatsApp messages so that
 * whatever the admin saves in Settings shows up everywhere.
 */
const pool = require('../config/db');

async function getSettingsMap(franchiseId = 1) {
  const fid = Number(franchiseId) || 1;
  // HQ (franchise 1) values act as defaults for every franchise; franchise values override them.
  const [rows] = await pool.query(
    'SELECT franchise_id, key_name, value FROM settings WHERE franchise_id IN (1, ?) ORDER BY (franchise_id = ?) ASC',
    [fid, fid]
  );
  return rows.reduce((acc, r) => { acc[r.key_name] = r.value; return acc; }, {});
}

async function getPaymentQrs(franchiseId = 1) {
  const fid = Number(franchiseId) || 1;
  const [rows] = await pool.query(
    'SELECT * FROM payment_qrs WHERE franchise_id = ? ORDER BY is_active DESC, id DESC',
    [fid]
  );
  if (rows.length || fid === 1) return rows;
  // A new franchise without its own QR falls back to HQ's
  const [hq] = await pool.query('SELECT * FROM payment_qrs WHERE franchise_id = 1 ORDER BY is_active DESC, id DESC');
  return hq;
}

/**
 * Full studio profile for documents and customer screens.
 */
/**
 * place = 'invoice' | 'jobcard' | 'payment' → uses the QR the admin picked for that place
 * (Settings → Payment QRs → "Which QR to show where"); otherwise the main (active) QR.
 */
async function getStudioProfile(franchiseId = 1, place = null) {
  const fid = Number(franchiseId) || 1;
  const [[franchise]] = await pool.query('SELECT * FROM franchises WHERE id = ?', [fid]);
  const s = await getSettingsMap(fid);
  const qrs = await getPaymentQrs(fid);
  const mainQr = qrs.find(q => q.is_active === 1) || qrs[0] || null;
  const pickedId = place ? Number(s[`qr_for_${place}`]) : 0;
  const activeQr = (pickedId && qrs.find(q => q.id === pickedId)) || mainQr;

  return {
    franchise_id: fid,
    studio_name: s.studio_name || 'O3 Car Spaa',
    branch_name: franchise ? franchise.name : null,
    tagline: s.tagline || 'Premium Car Detailing Studio',
    address: s.studio_address || franchise?.address || '',
    mobile: s.studio_mobile || franchise?.phone || '',
    email: s.studio_email || franchise?.email || '',
    gstin: s.studio_gst || s.gstin || franchise?.gstin || '',
    invoice_footer: s.invoice_footer || '',
    upi_id: activeQr ? activeQr.upi_id : (franchise?.upi_id || ''),
    upi_name: activeQr ? activeQr.upi_name : (franchise?.upi_name || s.studio_name || 'O3 Car Spaa'),
    upi_number: activeQr ? activeQr.upi_number : '',
    upi_qr_url: activeQr ? activeQr.qr_image_url : (franchise?.qr_image_url || null),
    active_qr: activeQr,
    all_qrs: qrs,
    settings: s,
  };
}

/** UPI deep link for a payable amount (used for dynamic QR codes in PDFs). */
function buildUpiLink(profile, amount, note) {
  if (!profile || !profile.upi_id) return null;
  const params = new URLSearchParams({ pa: profile.upi_id, pn: profile.upi_name || 'O3 Car Spaa', cu: 'INR' });
  if (amount && Number(amount) > 0) params.set('am', Number(amount).toFixed(2));
  if (note) params.set('tn', String(note).slice(0, 60));
  return `upi://pay?${params.toString()}`;
}

/**
 * Data-URI image of the studio's payment QR for embedding into PDFs/HTML:
 * uses the uploaded QR image when available, otherwise generates one from the UPI ID.
 */
async function getQrDataUri(profile, amount, note) {
  const path = require('path');
  const fs = require('fs');
  if (profile && profile.upi_qr_url && profile.upi_qr_url.startsWith('/uploads/')) {
    const file = path.join(__dirname, '..', '..', profile.upi_qr_url.replace(/^\//, ''));
    if (fs.existsSync(file)) {
      const ext = path.extname(file).slice(1).toLowerCase() || 'png';
      const mime = ext === 'jpg' ? 'jpeg' : ext;
      return `data:image/${mime};base64,${fs.readFileSync(file).toString('base64')}`;
    }
  }
  const link = buildUpiLink(profile, amount, note);
  if (!link) return null;
  const QRCode = require('qrcode');
  return QRCode.toDataURL(link, { margin: 1, width: 240 });
}

module.exports = { getSettingsMap, getPaymentQrs, getStudioProfile, buildUpiLink, getQrDataUri };
