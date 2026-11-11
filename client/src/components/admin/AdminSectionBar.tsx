import { Link, useLocation } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';

const I = (n: string) => `/illustrations/${n}.webp`;
// Longest matching prefix wins
const SECTIONS: [string, string, string, string][] = [
  ['/admin/reports', 'Overview', 'Reports', I('adm-reports')],
  ['/admin/my', 'My Workspace', 'My workspace', I('adm-team')],
  ['/admin/job-carts/new', 'Operations', 'New job card', I('lib-inspection')],
  ['/admin/job-carts', 'Operations', 'Job cards', I('lib-inspection')],
  ['/admin/quick-wash', 'Operations', 'Quick wash', I('wash')],
  ['/admin/slots', 'Operations', 'Slots & calendar', I('adm-slots')],
  ['/admin/customer-bookings', 'Operations', 'Customer bookings', I('tab-bookings')],
  ['/admin/pickups', 'Operations', 'Pickups', I('lib-pickup')],
  ['/admin/deliveries', 'Operations', 'Deliveries', I('lib-doorstep')],
  ['/admin/customers', 'Customers & Sales', 'Customers', I('ic-vehicles')],
  ['/admin/add-customer', 'Customers & Sales', 'Add customer', I('ic-vehicles')],
  ['/admin/leads', 'Customers & Sales', 'Leads', I('adm-leads')],
  ['/admin/inquiries', 'Customers & Sales', 'Inquiries', I('help')],
  ['/admin/referrals', 'Customers & Sales', 'Referrals', I('refer')],
  ['/admin/feedback', 'Customers & Sales', 'Feedback & reviews', I('ic-rate')],
  ['/admin/package', 'Customers & Sales', 'Packages', I('packages')],
  ['/admin/loyalty', 'Customers & Sales', 'Loyalty', I('rewards')],
  ['/admin/customer-rewards', 'Customers & Sales', 'Customer rewards', I('rewards')],
  ['/admin/services', 'Catalogue', 'Services', I('tab-services')],
  ['/admin/premium-services', 'Catalogue', 'Premium services', I('ceramic')],
  ['/admin/inventory', 'Stock', 'Inventory', I('adm-inventory')],
  ['/admin/buy-sell', 'Stock', 'Buy & sell', I('shop')],
  ['/admin/product-orders', 'Stock', 'Product orders', I('shop')],
  ['/admin/franchise-orders', 'Stock', 'Studio stock orders', I('adm-inventory')],
  ['/admin/stock-approvals', 'Stock', 'Stock approvals', I('adm-inventory')],
  ['/admin/billing', 'Money', 'Billing', I('adm-invoice')],
  ['/admin/invoices', 'Money', 'Invoices', I('adm-invoice')],
  ['/admin/quotations', 'Money', 'Quotations', I('adm-quotation')],
  ['/admin/payments', 'Money', 'Payments', I('ic-wallet')],
  ['/admin/pending-payments', 'Money', 'Pending payments', I('ic-wallet')],
  ['/admin/accounts', 'Money', 'Accounts', I('adm-excel')],
  ['/admin/vendors', 'Money', 'Vendors', I('adm-vendor')],
  ['/admin/balance-sheet', 'Money', 'Balance sheet', I('adm-excel')],
  ['/admin/staff', 'Team', 'Staff', I('adm-team')],
  ['/admin/salary', 'Team', 'Salary', I('adm-salary')],
  ['/admin/staff-hr', 'Team', 'Staff HR', I('adm-team')],
  ['/admin/whatsapp', 'Messages', 'WhatsApp', I('adm-whatsapp')],
  ['/admin/messages', 'Messages', 'Messages', I('adm-whatsapp')],
  ['/admin/franchises', 'Head office', 'Studios', I('ic-location')],
  ['/admin/roles', 'Head office', 'Roles & access', I('adm-permissions')],
  ['/admin/import', 'Settings', 'Import data', I('adm-excel')],
  ['/admin/settings', 'Settings', 'Settings', I('ic-settings')],
  ['/admin/audit-logs', 'Head office', 'Audit log', I('adm-permissions')],
  ['/admin/archive', 'Head office', 'Archive', I('history')],
];

/** Section (group, label, picture) for an admin path. */
export function sectionFor(pathname: string): { group: string; label: string; img: string } | null {
  const hit = SECTIONS.filter(([p]) => pathname === p || pathname.startsWith(p + '/') || (p.endsWith('package') && pathname.startsWith(p)))
    .sort((a, b) => b[0].length - a[0].length)[0];
  return hit ? { group: hit[1], label: hit[2], img: hit[3] } : null;
}

/** Picture breadcrumb (kept for pages without the shared header). */
export default function AdminSectionBar() {
  const { pathname } = useLocation();
  const hit = SECTIONS.filter(([p]) => pathname === p || pathname.startsWith(p + '/') || (p.endsWith('package') && pathname.startsWith(p)))
    .sort((a, b) => b[0].length - a[0].length)[0];
  if (!hit) return null;
  const [, group, label, img] = hit;
  return (
    <div className="relative mb-4 flex items-center gap-3 overflow-hidden rounded-2xl bg-gradient-to-r from-[#EAF2FF] via-white to-white border border-blue-100/70 px-3 py-2 shadow-[0_4px_16px_rgba(37,99,235,0.06)]">
      <img src={img} alt="" className="w-11 h-11 object-contain mix-blend-multiply shrink-0" />
      <nav className="min-w-0 flex items-center gap-1 text-[12px] font-semibold text-slate-500">
        <Link to="/admin" className="hover:text-[#2563EB]">Dashboard</Link>
        <ChevronRight size={13} className="shrink-0" />
        <span className="hidden sm:inline">{group}</span>
        <ChevronRight size={13} className="shrink-0 hidden sm:inline" />
        <span className="font-extrabold text-slate-900 truncate">{label}</span>
      </nav>
      <span className="pointer-events-none absolute -right-6 -top-8 w-28 h-28 rounded-full bg-[#2563EB]/[0.06]" />
    </div>
  );
}
