/**
 * One place to record money received, so it always shows in BOTH Payments (v2_payments) and Accounts (transactions).
 * Payments → Stats skips these transaction types (they are already counted from v2_payments), so nothing is counted twice.
 */
const MIRRORED_TYPES = ['job_revenue', 'advance_revenue', 'payment_in', 'package_sale', 'quick_wash', 'product_sale'];

// v2_payments.payment_method only accepts these values; forms elsewhere use "net_banking" / "other".
const V2_METHODS = ['razorpay', 'upi', 'qr', 'netbanking', 'card', 'cash', 'wallet'];
function toPaymentMethod(m) {
  const v = String(m || 'cash').toLowerCase().trim();
  if (V2_METHODS.includes(v)) return v;
  if (['net_banking', 'bank', 'bank_transfer', 'neft', 'imps', 'rtgs'].includes(v)) return 'netbanking';
  if (['gpay', 'phonepe', 'paytm', 'upi_manual'].includes(v)) return 'upi';
  return 'cash';
}

async function recordMoneyIn(conn, { customerId = null, amount, method = 'cash', type, refId = null, note, jobCartId = null,
  bookingId = null, packageId = null, productId = null, franchiseId = 1, userId = null, skipPayment = false }) {
  const amt = Math.round((Number(amount) || 0) * 100) / 100;
  if (amt <= 0) return null;
  let paymentId = null;
  if (!skipPayment) {
    const [r] = await conn.query(
      `INSERT INTO v2_payments (customer_id, job_cart_id, booking_id, package_id, product_id, amount, payment_method, status, notes)
       VALUES (?, ?, ?, ?, ?, ?, ?, 'captured', ?)`,
      [customerId, jobCartId, bookingId, packageId, productId, amt, toPaymentMethod(method), note || null]);
    paymentId = r.insertId;
  }
  await conn.query(
    `INSERT INTO transactions (type, reference_id, amount, direction, note, transaction_date, created_by, franchise_id)
     VALUES (?, ?, ?, 'in', ?, CURDATE(), ?, ?)`,
    [type, refId || paymentId, amt, note || type, userId, franchiseId || 1]);
  return paymentId;
}

// Each table spells payment methods its own way; convert any form value to the spelling that table accepts.
const BANK = ['net_banking', 'netbanking', 'bank', 'bank_transfer', 'neft', 'imps', 'rtgs'];
const TABLE_METHODS = {
  v2_payments:      { bank: 'netbanking',    list: ['razorpay', 'upi', 'qr', 'netbanking', 'card', 'cash', 'wallet'], fallback: 'cash' },
  manual_bills:     { bank: 'bank_transfer', list: ['cash', 'upi', 'card', 'bank_transfer', 'other'], fallback: 'other', alias: { qr: 'upi' } },
  expenses:         { bank: 'net_banking',   list: ['cash', 'upi', 'card', 'net_banking', 'other'], fallback: 'other', alias: { qr: 'upi' } },
  v2_expenses:      { bank: 'bank',          list: ['cash', 'bank', 'upi', 'card'], fallback: 'cash', alias: { qr: 'upi' } },
  v2_payroll:       { bank: 'bank_transfer', list: ['cash', 'bank_transfer', 'upi'], fallback: 'cash', alias: { qr: 'upi' } },
  advance_payments: { bank: 'net_banking',   list: ['cash', 'upi', 'card', 'net_banking', 'qr', 'wallet', 'other'], fallback: 'other' },
  job_carts:        { bank: 'net_banking',   list: ['cash', 'upi', 'card', 'net_banking', 'qr', 'wallet', 'other'], fallback: 'other' },
  package_renewals: { bank: 'net_banking',   list: ['cash', 'upi', 'card', 'net_banking', 'qr', 'wallet', 'other'], fallback: 'other' },
};
function methodFor(table, m) {
  const t = TABLE_METHODS[table]; if (!t) return String(m || 'cash');
  const v = String(m || 'cash').toLowerCase().trim();
  if (BANK.includes(v)) return t.bank;
  if (['gpay', 'phonepe', 'paytm', 'upi_manual'].includes(v)) return 'upi';
  const a = (t.alias && t.alias[v]) || v;
  return t.list.includes(a) ? a : t.fallback;
}

module.exports = { recordMoneyIn, MIRRORED_TYPES, toPaymentMethod, methodFor };
