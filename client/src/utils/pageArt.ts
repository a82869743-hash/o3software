/**
 * Picks a 3D picture (public/illustrations) for an admin page or empty state from its title,
 * so every screen gets a fitting symbol without hand-wiring each page.
 */
const RULES: Array<[RegExp, string]> = [
  [/quick ?wash/i, 'tab-services'],
  [/import|export|excel|bulk/i, 'adm-excel'],
  [/job ?card|job ?cart|pipeline|archive|audit|history/i, 'history'],
  [/slot|calendar|schedule|timing/i, 'adm-slots'],
  [/booking/i, 'tab-bookings'],
  [/salary|payroll/i, 'adm-salary'],
  [/attendance|leave|hr\b|staff|team|employee|technician/i, 'adm-team'],
  [/whatsapp|chat|message|inbox|broadcast/i, 'adm-whatsapp'],
  [/lead|inquir|enquir/i, 'adm-leads'],
  [/support|notification/i, 'help'],
  [/quotation|estimate/i, 'adm-quotation'],
  [/package|membership|amc/i, 'packages'],
  [/referral|refer/i, 'tab-refer'],
  [/loyalty|reward|incentive|benefit/i, 'rewards'],
  [/invoice|bill|receivable|gst/i, 'adm-invoice'],
  [/payment|account|balance|expense|finance/i, 'ic-wallet'],
  [/vendor|supplier|purchase/i, 'adm-vendor'],
  [/inventory|stock/i, 'adm-inventory'],
  [/product|order/i, 'shop'],
  [/deliver|pickup|location|tracking/i, 'ic-location'],
  [/feedback|review|rating/i, 'ic-rate'],
  [/role|permission|access/i, 'adm-permissions'],
  [/setting|config|connection/i, 'ic-settings'],
  [/customer|user|profile|franchise/i, 'tab-profile'],
  [/service|premium/i, 'ceramic'],
  [/vehicle|car/i, 'ic-vehicles'],
  [/report|dashboard|analytics|performance/i, 'adm-reports'],
];

export function pageArt(title: string = ''): string | null {
  for (const [rx, name] of RULES) if (rx.test(title)) return `/illustrations/${name}.webp`;
  return null;
}
