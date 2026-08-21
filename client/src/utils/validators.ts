// Mobile number validator (10 digits)
export const isValidMobile = (mobile: string): boolean =>
  /^[0-9]{10}$/.test(mobile);

// Registration number validator
export const isValidRegNo = (regNo: string): boolean =>
  /^[A-Z]{2}\d{1,2}[A-Z]{0,3}\d{1,4}$/i.test(regNo.replace(/\s+/g, ''));

// Email validator
export const isValidEmail = (email: string): boolean =>
  /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

// Non-empty string
export const isNonEmpty = (value: string): boolean =>
  value.trim().length > 0;
