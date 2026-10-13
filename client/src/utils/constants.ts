export const APP_NAME = 'O3 Car Spaaa';

export const APP_VERSION = '2.0.0';

export const BRAND_COLORS = {
  blue: '#0284C7',
  blueDark: '#0369A1',
  blueLight: '#E0F2FE',
  black: '#0F172A',
  white: '#FFFFFF',
  sidebar: '#0F172A',
} as const;

export const STATUS_COLORS: Record<string, string> = {
  complete: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  open: 'bg-sky-50 text-sky-900 border-sky-200/50',
  draft: 'bg-slate-100 text-slate-700 border-slate-200/50',
  cancelled: 'bg-rose-50 text-rose-900 border-rose-200/50',
  confirmed: 'bg-sky-50 text-sky-900 border-sky-200/50',
  in_transit: 'bg-amber-50 text-amber-900 border-amber-200/50',
  delivered: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  pending: 'bg-amber-50 text-amber-900 border-amber-200/50',
  paid: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  new: 'bg-sky-50 text-sky-900 border-sky-200/50',
  followed_up: 'bg-amber-50 text-amber-900 border-amber-200/50',
  pending_payment: 'bg-amber-50 text-amber-900 border-amber-200/50',
  converted: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  sent: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  failed: 'bg-rose-50 text-rose-900 border-rose-200/50',
  queued: 'bg-slate-100 text-slate-700 border-slate-200/50',
  present: 'bg-emerald-50 text-emerald-900 border-emerald-200/50',
  absent: 'bg-rose-50 text-rose-900 border-rose-200/50',
  half_day: 'bg-amber-50 text-amber-900 border-amber-200/50',
};

export const VEHICLE_CATEGORIES = ['hatchback', 'sedan', 'suv'] as const;

export const UNITS = ['pcs', 'ml', 'ltr', 'ft', 'kg', 'gm', 'rolls'] as const;
