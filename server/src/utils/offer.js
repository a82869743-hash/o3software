// Home-screen offer (Admin → Settings → Customer App — Offers) applied as a real discount at booking.
// Settings per studio: app_offer_code, app_offer_type ('percent' | 'flat'), app_offer_value, app_offer_valid_till (YYYY-MM-DD),
// app_offer_min_amount, app_offer_once ('1' = once per customer).

async function loadOffer(db, franchiseId) {
  const [rows] = await db.query("SELECT key_name, value FROM settings WHERE franchise_id = ? AND key_name LIKE 'app_offer_%'", [franchiseId || 1]);
  const s = Object.fromEntries(rows.map(r => [r.key_name, r.value]));
  return {
    code: String(s.app_offer_code || '').trim().toUpperCase(),
    type: s.app_offer_type === 'flat' ? 'flat' : 'percent',
    value: Number(s.app_offer_value) || 0,
    validTill: s.app_offer_valid_till || '',
    minAmount: Number(s.app_offer_min_amount) || 0,
    once: s.app_offer_once !== '0',
    title: s.app_offer_title || '',
  };
}

/** → { ok, error?, discount, percent, code, label } for a bill of `amount` (services only, before pickup charges). */
async function evaluateOffer(db, { franchiseId, customerId, code, amount }) {
  const want = String(code || '').trim().toUpperCase();
  if (!want) return { ok: false, error: 'Enter an offer code', discount: 0, percent: 0 };
  const o = await loadOffer(db, franchiseId);
  if (!o.code || want !== o.code) return { ok: false, error: 'This offer code is not valid', discount: 0, percent: 0 };
  if (!o.value) return { ok: false, error: 'This offer has no discount set yet', discount: 0, percent: 0 };
  const today = new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
  if (o.validTill && today > o.validTill) return { ok: false, error: `This offer ended on ${o.validTill}`, discount: 0, percent: 0 };
  if (o.minAmount && amount < o.minAmount) return { ok: false, error: `Offer needs a booking of at least ₹${o.minAmount}`, discount: 0, percent: 0 };
  if (o.once && customerId) {
    const [[used]] = await db.query(
      "SELECT COUNT(*) AS n FROM bookings WHERE customer_id = ? AND offer_code = ? AND status NOT IN ('cancelled','rejected','expired')",
      [customerId, o.code]);
    if (used.n > 0) return { ok: false, error: 'You have already used this offer', discount: 0, percent: 0 };
  }
  const discount = o.type === 'percent'
    ? Math.round(amount * Math.min(100, o.value) / 100)
    : Math.min(amount, Math.round(o.value));
  return {
    ok: true, code: o.code, discount, percent: o.type === 'percent' ? Math.min(100, o.value) : 0,
    label: o.type === 'percent' ? `${o.value}% off with ${o.code}` : `₹${o.value} off with ${o.code}`,
  };
}

module.exports = { loadOffer, evaluateOffer };
