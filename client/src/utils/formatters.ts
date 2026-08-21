// Currency formatter (Indian Rupees)
export const formatINR = (amount: number | string | null | undefined): string => {
  const parsed = Number(amount);
  return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(isNaN(parsed) ? 0 : parsed);
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
