/**
 * fieldFormats — one place that enforces the phone and number-plate formats on every API request.
 *   phone fields  → 10-digit Indian mobile (6–9 first), "+91 98…" / spaces are cleaned up
 *   plate fields  → Indian registration format (GJ06AB1234 or 22BH1234AB), uppercased, spaces removed
 * Empty values are left alone (each screen decides what is required).
 */
const { validateRegNo, normalizeRegNo } = require('../utils/validators');

const PHONE_FIELDS = new Set(['mobile', 'phone', 'customer_mobile', 'party_mobile', 'referrer_mobile', 'whatsapp_number',
  'owner_mobile', 'contact_number', 'contact_mobile', 'alternate_mobile', 'driver_mobile', 'staff_mobile', 'emergency_contact']);
const PLATE_FIELDS = new Set(['registration_no', 'vehicle_reg_no', 'car_reg_no', 'vehicle_no', 'reg_no', 'registration_number', 'vehicle_number']);
const LABEL = { mobile: 'Mobile number', phone: 'Phone number', whatsapp_number: 'WhatsApp number' };

function check(obj, path = '') {
  if (!obj || typeof obj !== 'object') return null;
  for (const [key, val] of Object.entries(obj)) {
    if (val && typeof val === 'object') { const e = check(val, `${path}${key}.`); if (e) return e; continue; }
    if (val === null || val === undefined || val === '') continue;
    if (PHONE_FIELDS.has(key)) {
      let digits = String(val).replace(/\D/g, '');
      if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
      if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
      if (!/^[6-9]\d{9}$/.test(digits)) return `${LABEL[key] || 'Phone number'} must be a valid 10-digit mobile number`;
      obj[key] = digits;
    } else if (PLATE_FIELDS.has(key)) {
      const rc = validateRegNo(val);
      if (!rc.valid) return rc.error;
      obj[key] = normalizeRegNo(val);
    }
  }
  return null;
}

module.exports = function fieldFormats(req, res, next) {
  if (!['POST', 'PUT', 'PATCH'].includes(req.method) || /\/webhook/.test(req.originalUrl || '')) return next();
  // bulk imports check each row themselves and skip bad rows with the row number, so one bad phone does not block the file
  if (/^\/api\/leads\/import(\?|$)/.test(req.originalUrl || '')) return next();
  const error = check(req.body);
  if (error) return res.status(400).json({ success: false, error });
  next();
};
