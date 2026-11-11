// Currency formatter (Indian Rupees)
export const formatINR = (amount: number | string | null | undefined): string => {
  const parsed = Number(amount);
  // Whole rupees show as ₹1,000; amounts with paise (GST) show as ₹1,178.82, the same as the bill PDF
  const v = isNaN(parsed) ? 0 : Math.round(parsed * 100) / 100;
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', minimumFractionDigits: Number.isInteger(v) ? 0 : 2, maximumFractionDigits: 2 }).format(v);
};

/**
 * "YYYY-MM-DD" in India time. Use instead of toISOString().slice(0, 10), which gives the UTC date:
 * between midnight and 5:30 am IST that is yesterday, and local midnight dates (1st of the month) shift back a day.
 */
export const ymd = (d: Date | string | number = new Date()): string => {
  const x = d instanceof Date ? d : new Date(d);
  return isNaN(x.getTime()) ? '' : x.toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
};

/** Day part of an API date, in India time, whether it came as "2026-11-12" or as a timestamp. */
export const dateOnly = (v: string | Date | null | undefined): string => {
  if (!v) return '';
  const s = String(v);
  return /^\d{4}-\d{2}-\d{2}$/.test(s) ? s : ymd(v);
};

// Date formatter (IST Asia/Kolkata)
export const formatDate = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  let d: Date;
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    d = new Date(`${date}T00:00:00`);
  } else {
    d = new Date(date);
  }
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' });
};

// Date-Time formatter (IST Asia/Kolkata 12-hour format)
export const formatDateTime = (date: string | Date | null | undefined): string => {
  if (!date) return '-';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '-';
  return d.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' });
};

// Time formatter (12-hour)
export const formatTime = (time: string): string => {
  const [h, m] = time.split(':').map(Number);
  const ampm = h >= 12 ? 'PM' : 'AM';
  return `${((h % 12) || 12)}:${m.toString().padStart(2, '0')} ${ampm}`;
};

// Mobile masking
export const maskMobile = (mobile: string): string =>
  mobile.replace(/(\d{6})(\d{4})/, '$1****');

// Registration number formatting
export const formatRegNo = (regNo: string): string =>
  regNo.toUpperCase().replace(/\s+/g, '');

// Relative time
export const timeAgo = (date: string): string => {
  const seconds = Math.floor((Date.now() - new Date(date).getTime()) / 1000);
  if (seconds < 60) return 'just now';
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return `${days}d ago`;
};

/** 45 → "45 min", 60 → "1 hour", 125 → "2 hours 5 min", 2880 → "48 hours" */
export const formatDuration = (minutes: number | string | null | undefined): string => {
  const m = Math.round(Number(minutes) || 0);
  if (m < 60) return `${m} min`;
  const h = Math.floor(m / 60), r = m % 60;
  return `${h} hour${h > 1 ? 's' : ''}${r ? ` ${r} min` : ''}`;
};
