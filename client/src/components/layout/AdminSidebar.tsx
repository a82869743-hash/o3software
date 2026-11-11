import { useState, useEffect } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import {
  LayoutDashboard, ClipboardList, Package, Calendar, CalendarCheck, Wrench, Users,
  DollarSign, MessageSquare, HelpCircle, Upload, Settings, LogOut, X, ShoppingCart,
  Layers, FileText, Wallet, Archive, PlusCircle, Trash2, ChevronDown, ChevronRight,
  Droplets, Star, Truck, Sparkles, CreditCard, BarChart3, Shield, CheckSquare, Gift, MapPin,
  ShoppingBag, Bell, Building2, Clock
} from 'lucide-react';
import { can } from '../../utils/access';
import Logo from '../shared/Logo';
import FranchiseSwitcher from '../admin/FranchiseSwitcher';
import { pageArt } from '../../utils/pageArt';
import { PHOTOS } from '../customer/serviceVisuals';


interface NavCategory {
  label: string;
  defaultOpen?: boolean;
  items: NavItem[];
}

interface NavItem {
  to: string;
  icon: React.ElementType;
  label: string;
  end?: boolean;
  badge?: string;
  /** module key from the permission catalog; item shows when the user can `${module}.${action}` */
  module?: string;
  action?: string;
  superAdminOnly?: boolean;
  /** only for branch studios (hidden while the main studio is open) */
  branchOnly?: boolean;
  /** personal pages (own attendance, leaves, salary) shown to managers & staff */
  self?: boolean;
}

const navCategories: NavCategory[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true, module: 'dashboard' },
      { to: '/admin/reports', icon: BarChart3, label: 'Reports', module: 'reports' },
    ],
  },
  {
    label: 'My Workspace',
    defaultOpen: true,
    items: [
      { to: '/admin/my/attendance', icon: Clock, label: 'Check In / Out', self: true },
      { to: '/admin/my/hr', icon: CheckSquare, label: 'My Leaves & Tasks', self: true },
      { to: '/admin/my/benefits', icon: Wallet, label: 'My Salary & Referrals', self: true },
      { to: '/admin/my/deliveries', icon: Truck, label: 'My Deliveries', self: true },
    ],
  },
  {
    label: 'Operations',
    defaultOpen: true,
    items: [
      { to: '/admin/job-carts', icon: ClipboardList, label: 'All Job Cards', end: true, module: 'job_cards' },
      { to: '/admin/job-carts/new', icon: PlusCircle, label: 'New Job Card', module: 'job_cards', action: 'create' },
      { to: '/admin/quick-wash', icon: Droplets, label: 'Quick Wash', module: 'quick_wash' },
      { to: '/admin/slots', icon: Calendar, label: 'Slots & Calendar', module: 'slots' },
      { to: '/admin/customer-bookings', icon: CalendarCheck, label: 'Customer Bookings', module: 'bookings' },
      { to: '/admin/pickups', icon: MapPin, label: 'Pickups', module: 'pickups' },
      { to: '/admin/deliveries', icon: Truck, label: 'Deliveries', module: 'deliveries' },
    ],
  },
  {
    label: 'Customers & Sales',
    defaultOpen: true,
    items: [
      { to: '/admin/customers', icon: Users, label: 'Customers', module: 'customers' },
      { to: '/admin/add-customer', icon: PlusCircle, label: 'Add Customer', module: 'customers', action: 'create' },
      { to: '/admin/leads', icon: Sparkles, label: 'Leads (New Business)', module: 'leads' },
      { to: '/admin/inquiries', icon: HelpCircle, label: 'Inquiries (Support)', module: 'inquiries' },
      { to: '/admin/referrals', icon: Gift, label: 'Referrals', module: 'referrals' },
      { to: '/admin/feedback', icon: Star, label: 'Feedback & Reviews', module: 'feedback' },
      { to: '/admin/packages', icon: Layers, label: 'Packages', module: 'packages' },
      { to: '/admin/package-approvals', icon: Package, label: 'Package Approvals', module: 'packages' },
      { to: '/admin/package-tracking', icon: Layers, label: 'Package Tracking', module: 'packages' },
      { to: '/admin/package-alerts', icon: Bell, label: 'Package Alerts', module: 'packages' },
      { to: '/admin/loyalty', icon: Star, label: 'Loyalty Points', module: 'loyalty' },
      { to: '/admin/customer-rewards', icon: Gift, label: 'Customer Rewards', module: 'loyalty' },
    ],
  },
  {
    label: 'Catalog & Stock',
    defaultOpen: true,
    items: [
      { to: '/admin/services', icon: Wrench, label: 'Services', module: 'services' },
      { to: '/admin/premium-services', icon: Sparkles, label: 'Premium Services', module: 'services' },
      { to: '/admin/inventory', icon: Package, label: 'Inventory & Products', module: 'inventory' },
      { to: '/admin/buy-sell', icon: ShoppingCart, label: 'Buy & Sell', module: 'inventory' },
      { to: '/admin/product-orders', icon: ShoppingBag, label: 'Product Orders', module: 'inventory' },
      { to: '/admin/franchise-orders', icon: ShoppingBag, label: 'Order Stock from HQ', module: 'franchise_stock', branchOnly: true },
      { to: '/admin/stock-approvals', icon: ShoppingCart, label: 'Stock Approvals', superAdminOnly: true },
    ],
  },
  {
    label: 'Finance',
    defaultOpen: true,
    items: [
      { to: '/admin/billing', icon: FileText, label: 'Manual Billing', module: 'billing' },
      { to: '/admin/invoices', icon: Archive, label: 'Invoices', module: 'invoices' },
      { to: '/admin/quotations', icon: ClipboardList, label: 'Quotations', module: 'quotations' },
      { to: '/admin/payments', icon: CreditCard, label: 'Payments', module: 'payments' },
      { to: '/admin/pending-payments', icon: CreditCard, label: 'Pending Payments', module: 'payments' },
      { to: '/admin/accounts', icon: DollarSign, label: 'Accounts', module: 'accounts' },
      { to: '/admin/vendors', icon: Users, label: 'Vendors', module: 'accounts' },
      { to: '/admin/balance-sheet', icon: BarChart3, label: 'Balance Sheet & GST', module: 'balance_sheet' },
    ],
  },
  {
    label: 'Staff & HR',
    defaultOpen: true,
    items: [
      { to: '/admin/staff', icon: Users, label: 'Staff', module: 'staff' },
      { to: '/admin/salary', icon: Wallet, label: 'Salary', module: 'salary' },
      { to: '/admin/staff-hr', icon: CheckSquare, label: 'Leaves, Tasks & HR', module: 'staff_hr' },
    ],
  },
  {
    label: 'Communication',
    defaultOpen: true,
    items: [
      { to: '/admin/whatsapp', icon: MessageSquare, label: 'WhatsApp', module: 'whatsapp' },
      { to: '/admin/messages', icon: Bell, label: 'Notification History', module: 'whatsapp' },
    ],
  },
  {
    label: 'System',
    defaultOpen: true,
    items: [
      { to: '/admin/franchises', icon: Building2, label: 'Franchises & Access', badge: 'HQ', superAdminOnly: true },
      { to: '/admin/roles', icon: Shield, label: 'Staff Roles & Permissions', module: 'roles' },
      { to: '/admin/import', icon: Upload, label: 'Excel Import', module: 'import', action: 'create' },
      { to: '/admin/settings', icon: Settings, label: 'Settings', module: 'settings' },
      { to: '/admin/audit-logs', icon: Shield, label: 'Audit Logs', badge: 'HQ', superAdminOnly: true },
      { to: '/admin/archive', icon: Trash2, label: 'Recycle Bin', badge: 'HQ', superAdminOnly: true },
    ],
  },
];

function CollapsibleCategory({
  category,
  onNavClick,
}: {
  category: NavCategory;
  onNavClick: () => void;
}) {
  const [isOpen, setIsOpen] = useState(category.defaultOpen ?? false);

  if (category.items.length === 1 && category.label === 'Overview') {
    return (
      <div className="mb-2 px-3">
        {category.items.map((item) => (
          <SidebarNavLink key={item.to} item={item} onClick={onNavClick} />
        ))}
      </div>
    );
  }

  return (
    <div className="mb-2 px-3">
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-3 py-2 flex items-center justify-between text-[10px] font-extrabold uppercase tracking-widest text-slate-400 hover:text-slate-700 transition-colors rounded-xl hover:bg-slate-100/60"
      >
        <span>{category.label}</span>
        {isOpen
          ? <ChevronDown size={12} className="text-slate-400" />
          : <ChevronRight size={12} className="text-slate-400" />
        }
      </button>

      <div
        className={`overflow-hidden transition-all duration-200 space-y-1 mt-1 ${
          isOpen ? 'max-h-[900px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        {category.items.map((item) => (
          <SidebarNavLink key={item.to} item={item} onClick={onNavClick} />
        ))}
      </div>
    </div>
  );
}

function SidebarNavLink({ item, onClick }: { item: NavItem; onClick: () => void }) {
  return (
    <NavLink
      to={item.to}
      end={item.end}
      onClick={onClick}
      className={({ isActive }) =>
        `px-2.5 py-1.5 flex items-center gap-3 rounded-xl transition-all duration-200 group relative ${
          isActive
            ? 'bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white shadow-md shadow-blue-600/25 font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-blue-50/60 font-semibold'
        }`
      }
    >
      {({ isActive }) => (
        <>
          {pageArt(item.label)
            ? <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 transition ${isActive ? 'bg-white shadow' : 'bg-slate-50 border border-slate-100 group-hover:bg-white'}`}>
                <img src={pageArt(item.label)!} alt="" className="w-7 h-7 object-contain mix-blend-multiply" loading="lazy" />
              </span>
            : <span className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${isActive ? 'bg-white/20' : 'bg-blue-50'}`}>
                <item.icon size={17} className={isActive ? 'text-white' : 'text-[#2563EB]'} />
              </span>}
          <span className="text-[13px] font-semibold truncate">{item.label}</span>
          {item.badge && (
            <span className={`ml-auto text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              isActive ? 'bg-white text-[#2563EB]' : 'bg-blue-50 text-[#2563EB] border border-blue-200'
            }`}>
              {item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

export default function AdminSidebar() {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();
  const { pathname } = useLocation();
  // On phones, close the menu after picking a page
  useEffect(() => { if (window.innerWidth < 1024) setSidebarOpen(false); }, [pathname, setSidebarOpen]);

  const isEmployee = user?.role === 'manager' || user?.role === 'staff';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const handleNavClick = () => {
    setSidebarOpen(false);
  };

  const filteredCategories = navCategories
    .map((category) => {
      const items = category.items.filter((item) => {
        if (item.superAdminOnly) return user?.role === 'super_admin';
        if (item.branchOnly && Number(localStorage.getItem('active_franchise_id') || user?.franchise_id || 1) === 1) return false;
        if (item.self) return isEmployee;
        if (!item.module) return true;
        return can(user, item.module, item.action || 'view');
      });
      return { ...category, items };
    })
    .filter((category) => category.items.length > 0);

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-[70] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-[260px] h-screen fixed left-0 top-0 bg-white border-r border-slate-200 flex flex-col py-6 shadow-sm z-[80] transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand Header */}
        <div className="px-6 mb-6 flex items-center justify-between">
          <Logo size="md" variant="dark" />
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-slate-400 hover:text-slate-700 transition-colors p-1">
            <X size={20} />
          </button>
        </div>

        {/* Studio card */}
        <div className="mx-4 mb-4 relative overflow-hidden rounded-2xl h-20 shadow-sm">
          <img src={PHOTOS.studio} alt="" className="absolute inset-0 w-full h-full object-cover" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/95 via-[#0B1F4D]/70 to-transparent" />
          <div className="relative p-3 text-white">
            <p className="text-[10px] font-bold uppercase tracking-wider text-sky-200">{user?.role === 'super_admin' ? 'Head office' : 'Your studio'}</p>
            <p className="text-[14px] font-black leading-tight">O3 Car Spaa</p>
            <p className="text-[10.5px] text-white/75 truncate">Hi {(user?.name || '').split(' ')[0]} — have a great day</p>
          </div>
        </div>

        {/* Multi-Franchise Switcher (O3 Main vs O3 Lite vs Custom Franchises) */}
        <FranchiseSwitcher />



        {/* Nav - Collapsible Categories */}
        <nav className="flex-1 overflow-y-auto pb-4 space-y-1">
          {filteredCategories.map((category) => (
            <CollapsibleCategory
              key={category.label}
              category={category}
              onNavClick={handleNavClick}
            />
          ))}
        </nav>

        {/* User Footer Profile */}
        <div className="px-4 mt-auto shrink-0 pt-3 border-t border-slate-100 bg-white">
          <div className="flex items-center gap-3 p-2.5 rounded-2xl bg-slate-50 border border-slate-200/80">
            <div className="w-9 h-9 rounded-xl bg-[#2563EB] flex items-center justify-center text-white font-extrabold text-xs shrink-0 shadow-sm">
              {user?.name?.charAt(0) || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-slate-900 font-extrabold truncate">{user?.name || 'Administrator'}</p>
              <p className="text-[10px] text-slate-500 font-medium truncate">
                {user?.role === 'super_admin' ? 'Super Admin (HQ)' : user?.role === 'admin' ? 'Franchise Admin' : user?.role === 'manager' ? 'Manager' : 'Staff'}
              </p>
            </div>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-[#2563EB] transition-colors p-1.5 rounded-lg hover:bg-white"
              title="Logout"
            >
              <LogOut size={16} />
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
