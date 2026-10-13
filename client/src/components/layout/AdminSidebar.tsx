import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import {
  LayoutDashboard, ClipboardList, Package, Calendar, CalendarCheck, Wrench, Users,
  DollarSign, MessageSquare, HelpCircle, Upload, Settings, LogOut, X, ShoppingCart,
  Layers, FileText, Wallet, Archive, PlusCircle, Trash2, ChevronDown, ChevronRight,
  Droplets, Star, Truck, Sparkles, CreditCard, BarChart3, Shield, CheckSquare, Gift, MapPin,
  ShoppingBag, Bell, Building2
} from 'lucide-react';
import Logo from '../shared/Logo';
import FranchiseSwitcher from '../admin/FranchiseSwitcher';


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
  permission?: string;
  superAdminOnly?: boolean;
}

const navCategories: NavCategory[] = [
  {
    label: 'Overview',
    defaultOpen: true,
    items: [
      { to: '/admin', icon: LayoutDashboard, label: 'Dashboard', end: true },
    ],
  },
  {
    label: 'Operations',
    defaultOpen: true,
    items: [
      { to: '/admin/job-carts', icon: ClipboardList, label: 'All Job Cards', permission: 'bookings.view' },
      { to: '/admin/job-carts/new', icon: PlusCircle, label: 'New Job Card', permission: 'bookings.create' },
      { to: '/admin/quick-wash', icon: Droplets, label: 'Quick Wash', badge: 'New', permission: 'bookings.view' },
      { to: '/admin/slots', icon: Calendar, label: 'Slots & Bookings', permission: 'bookings.view' },
      { to: '/admin/customer-bookings', icon: CalendarCheck, label: 'Customer Bookings', permission: 'bookings.view' },
      { to: '/admin/pickups', icon: MapPin, label: 'Pickups', badge: 'New', permission: 'bookings.view' },
      { to: '/admin/deliveries', icon: Truck, label: 'Deliveries', permission: 'bookings.view' },
    ],
  },
  {
    label: 'Customers',
    defaultOpen: true,
    items: [
      { to: '/admin/customers', icon: Users, label: 'Customers CRM', permission: 'customers.view' },
      { to: '/admin/leads', icon: Users, label: 'Lead Management', badge: 'New', permission: 'customers.view' },
      { to: '/admin/package-alerts', icon: Bell, label: 'Package Alerts', badge: 'Alerts', permission: 'customers.view' },
      { to: '/admin/pending-payments', icon: CreditCard, label: 'Pending Payments', badge: 'Due', permission: 'accounts.view' },
      { to: '/admin/add-customer', icon: PlusCircle, label: 'Add Customer', permission: 'customers.create' },
      { to: '/admin/packages', icon: Layers, label: 'Packages', permission: 'packages.view' },
      { to: '/admin/package-approvals', icon: Package, label: 'Package Approvals', permission: 'packages.view' },
      { to: '/admin/package-tracking', icon: Layers, label: 'Package Tracking', badge: 'New', permission: 'packages.view' },
      { to: '/admin/loyalty', icon: Star, label: 'Loyalty Points', badge: 'New', permission: 'settings.view' },
      { to: '/admin/customer-rewards', icon: Gift, label: 'Customer Rewards', badge: 'New', permission: 'settings.view' },
    ],
  },
  {
    label: 'Services',
    defaultOpen: true,
    items: [
      { to: '/admin/services', icon: Wrench, label: 'All Services', permission: 'settings.view' },
      { to: '/admin/premium-services', icon: Sparkles, label: 'Premium Services', badge: 'New', permission: 'settings.view' },
    ],
  },
  {
    label: 'Inventory & Stock',
    defaultOpen: true,
    items: [
      { to: '/admin/inventory', icon: Package, label: 'Inventory', permission: 'inventory.view' },
      { to: '/admin/franchise-orders', icon: ShoppingBag, label: 'Franchise Stock Order', badge: 'Order', permission: 'inventory.view' },
      { to: '/admin/stock-approvals', icon: ShoppingCart, label: 'Stock Approvals Console', badge: 'Super', permission: 'inventory.view', superAdminOnly: true },
      { to: '/admin/buy-sell', icon: ShoppingCart, label: 'Buy & Sell', permission: 'inventory.view' },
      { to: '/admin/product-orders', icon: ShoppingBag, label: 'Product Orders', permission: 'inventory.view' },
    ],
  },
  {
    label: 'Finance',
    defaultOpen: true,
    items: [
      { to: '/admin/accounts', icon: DollarSign, label: 'Accounts', permission: 'accounts.view' },
      { to: '/admin/vendors', icon: Users, label: 'Vendors', permission: 'accounts.view' },
      { to: '/admin/payments', icon: CreditCard, label: 'Payments', badge: 'New', permission: 'payments.view' },
      { to: '/admin/billing', icon: FileText, label: 'Manual Billing', permission: 'accounts.view' },
      { to: '/admin/invoices', icon: Archive, label: 'All Invoices', permission: 'accounts.view' },
      { to: '/admin/quotations', icon: ClipboardList, label: 'Quotations', badge: 'New', permission: 'accounts.view' },
      { to: '/admin/balance-sheet', icon: BarChart3, label: 'Balance Sheet', badge: 'New', permission: 'accounts.view' },
    ],
  },
  {
    label: 'Staff & HR',
    defaultOpen: true,
    items: [
      { to: '/admin/staff', icon: Users, label: 'Staff', permission: 'staff.view' },
      { to: '/admin/salary', icon: Wallet, label: 'Salary', permission: 'payroll.view' },
      { to: '/admin/staff-hr', icon: CheckSquare, label: 'Tasks & HR', badge: 'New', permission: 'tasks.view' },
    ],
  },
  {
    label: 'Communication',
    defaultOpen: true,
    items: [
      { to: '/admin/messages', icon: MessageSquare, label: 'Messages', permission: 'notifications.send' },
      { to: '/admin/whatsapp', icon: MessageSquare, label: 'WhatsApp', badge: 'New', permission: 'notifications.send' },
      { to: '/admin/inquiries', icon: HelpCircle, label: 'Inquiries', permission: 'notifications.send' },
      { to: '/admin/feedback', icon: Star, label: 'Feedback', badge: 'New', permission: 'feedback.view' },
    ],
  },
  {
    label: 'System',
    defaultOpen: true,
    items: [
      { to: '/admin/franchises', icon: Building2, label: 'Franchise Network', badge: 'Super', permission: 'settings.view', superAdminOnly: true },
      { to: '/admin/roles', icon: Shield, label: 'Roles & RBAC', badge: 'Super', permission: 'settings.view', superAdminOnly: true },
      { to: '/admin/audit-logs', icon: Shield, label: 'Audit Logs', badge: 'Super', permission: 'settings.view', superAdminOnly: true },
      { to: '/admin/import', icon: Upload, label: 'Import', permission: 'settings.view' },
      { to: '/admin/archive', icon: Trash2, label: 'Recycle Bin', badge: 'Super', permission: 'settings.view', superAdminOnly: true },
      { to: '/admin/settings', icon: Settings, label: 'Settings', permission: 'settings.view' },
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
          isOpen ? 'max-h-[500px] opacity-100' : 'max-h-0 opacity-0'
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
        `px-3.5 py-2.5 flex items-center gap-3 rounded-xl transition-all duration-200 group relative ${
          isActive
            ? 'bg-[#2563EB] text-white shadow-md shadow-blue-500/20 font-bold'
            : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100/80 font-semibold'
        }`
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            size={18}
            className={`transition-all duration-200 shrink-0 ${
              isActive ? 'text-white' : 'text-slate-400 group-hover:text-[#2563EB]'
            }`}
          />
          <span className="text-xs font-semibold truncate tracking-wide">{item.label}</span>
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

  const activeFranchiseId = parseInt(localStorage.getItem('active_franchise_id') || '1', 10);
  const isMainStudioAdmin = user?.role === 'admin' || user?.role === 'super_admin';

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
        // Enforce Super Admin only items strictly on Super Admin role
        if (item.superAdminOnly && user?.role !== 'super_admin') return false;

        // Main Studio holds master stock & central pricing; cannot order for itself (only approves/rejects)
        if (item.to === '/admin/franchise-orders' && (user?.franchise_id === 1 || !user?.franchise_id) && activeFranchiseId === 1) return false;

        if (user?.role === 'super_admin') return true;
        if (!item.permission) return true;
        if (user?.role === 'admin') return true;
        return user?.permissions?.includes(item.permission);
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

        {/* Separator */}
        <div className="mx-6 mb-4 h-px bg-slate-200/80" />

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
                {user?.role === 'super_admin' ? 'Super Admin' : user?.role === 'admin' ? 'Franchise Admin' : (user?.role || 'Staff')}
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
