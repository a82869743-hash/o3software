// Mirrors server/src/utils/validators.js — keep both in sync.

export const STATE_CODES = [
  'AN', 'AP', 'AR', 'AS', 'BR', 'CG', 'CH', 'DD', 'DL', 'DN', 'GA', 'GJ', 'HP', 'HR', 'JH', 'JK', 'KA', 'KL',
  'LA', 'LD', 'MH', 'ML', 'MN', 'MP', 'MZ', 'NL', 'OD', 'OR', 'PB', 'PY', 'RJ', 'SK', 'TN', 'TR', 'TS', 'UA',
  'UK', 'UP', 'WB',
];

export const normalizeRegNo = (value: string): string =>
  String(value || '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Returns an error message, or '' when the registration number is valid (GJ06AB1234, 22BH1234AB). */
export function regNoError(value: string): string {
  const reg = normalizeRegNo(value);
  if (!reg) return 'Registration number is required';
  const bh = /^(\d{2})BH(\d{4})([A-HJ-NP-Z]{1,2})$/.exec(reg);
  if (bh) {
    if (parseInt(bh[1], 10) < 21) return 'BH series started in 2021 (e.g. 22BH1234AB)';
    if (bh[2] === '0000') return 'Number part cannot be 0000';
    return '';
  }
  const m = /^([A-Z]{2})(\d{1,2})([A-Z]{0,3})(\d{4})$/.exec(reg);
  if (!m) return /^[A-Z]{2}\d{0,2}[A-Z]{0,3}\d{0,3}$/.test(reg) ? 'Number looks incomplete: state + RTO + series + 4 digits, like MH01AB1234 or DL3CAB1234' : 'Use your number plate as written, like MH01AB1234, KA05MN4321 or 22BH1234AB';
  if (!STATE_CODES.includes(m[1])) return `"${m[1]}" is not a valid Indian state code`;
  if (parseInt(m[2], 10) === 0) return 'RTO code cannot be 00';
  if (m[4] === '0000') return 'Number part cannot be 0000';
  return '';
}

export const isValidRegNo = (regNo: string): boolean => regNoError(regNo) === '';

export const normalizeMobile = (mobile: string): string => String(mobile || '').replace(/\D/g, '').slice(-10);

// Indian mobile: 10 digits starting 6-9
export const isValidMobile = (mobile: string): boolean => /^[6-9]\d{9}$/.test(normalizeMobile(mobile));

export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(String(email || '').trim());

export const isNonEmpty = (value: string): boolean =>
  value.trim().length > 0;
