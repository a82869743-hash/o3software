/**
 * Shared input validation (mirrored in client/src/utils/validators.ts — keep both in sync).
 */

// RTO state / UT codes currently in use (incl. legacy CG/UA/OR still on older plates)
const STATE_CODES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL',
  'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UA',
  'UK', 'UP', 'WB',
];

function normalizeRegNo(value) {
  return String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
}

/**
 * Indian registration numbers:
 *   Standard: GJ06AB1234, MH12A1234, DL3CAB1234 (state + 1-2 digit RTO + 0-3 letter series + 4 digit number)
 *   Bharat series: 22BH1234AB
 * Rejects made-up input like GH5555555 (unknown state, no proper number block).
 */
function validateRegNo(value) {
  const reg = normalizeRegNo(value);
  if (!reg) return { valid: false, value: reg, error: 'Registration number is required' };

  const bh = /^(\d{2})BH(\d{4})([A-HJ-NP-Z]{1,2})$/.exec(reg);
  if (bh) {
    const year = parseInt(bh[1], 10);
    if (year < 21) return { valid: false, value: reg, error: 'BH series started in 2021 (e.g. 22BH1234AB)' };
    if (bh[2] === '0000') return { valid: false, value: reg, error: 'Number part cannot be 0000' };
    return { valid: true, value: reg };
  }

  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(reg);
  if (!m) {
    return { valid: false, value: reg, error: 'Invalid registration number. Use the format GJ06AB1234 (state, RTO, series, 4-digit number)' };
  }
  const [, state, rto, , num] = m;
  if (!STATE_CODES.includes(state)) return { valid: false, value: reg, error: `"${state}" is not a valid Indian state code` };
  if (parseInt(rto, 10) === 0) return { valid: false, value: reg, error: 'RTO code cannot be 00' };
  if (num === '0000') return { valid: false, value: reg, error: 'Number part cannot be 0000' };
  return { valid: true, value: reg };
}

function normalizeMobile(value) {
  return String(value || '').replace(/\D/g, '').slice(-10);
}

function isValidMobile(value) {
  return /^[6-9]\d{9}$/.test(normalizeMobile(value)) && String(value || '').replace(/\D/g, '').length >= 10;
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(value || '').trim());
}

module.exports = { STATE_CODES, normalizeRegNo, validateRegNo, normalizeMobile, isValidMobile, isValidEmail };
