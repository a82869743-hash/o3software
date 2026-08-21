import { useState } from 'react';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useCustomerDashboard } from '../../api/hooks/useDashboard';
import { Wrench, Calendar, Gift, Car, User, LogOut, ClipboardList, LayoutDashboard, MoreHorizontal, X, PackageOpen, Bell, ShoppingBag } from 'lucide-react';
import Logo from '../shared/Logo';

const tabItems = [
  { to: '/customer', icon: LayoutDashboard, label: 'Home', end: true },
  { to: '/customer/services', icon: Wrench, label: 'Services' },
  { to: '/customer/job-carts', icon: ClipboardList, label: 'Job Cards' },
  { to: '/customer/bookings', icon: Calendar, label: 'Bookings' },
  { to: '/customer/loyalty', icon: Gift, label: 'Loyalty' },
  { to: '/customer/buy-packages', icon: PackageOpen, label: 'Buy Packages' },
  { to: '/customer/products', icon: ShoppingBag, label: 'Products' },
  { to: '/customer/vehicles', icon: Car, label: 'My Cars' },
  { to: '/customer/profile', icon: User, label: 'Profile' },
];

const mobileTabItems = tabItems.slice(0, 4);

export default function CustomerNavbar() {
  const { user, logout } = useAuthStore();
  const navigate = useNavigate();
  const location = useLocation();
  const [isMoreOpen, setIsMoreOpen] = useState(false);
  const [showNotif, setShowNotif] = useState(false);
  const { data } = useCustomerDashboard();

  const activePackage = data?.active_package || null;
  const hasExpiryWarning = activePackage?.end_date && Math.ceil((new Date(activePackage.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24)) <= 30;

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Top navbar — clean white */}
      <header className="fixed top-0 left-0 right-0 bg-white z-40 px-4 sm:px-6 h-16 flex items-center justify-between shadow-sm border-b border-slate-200">
        <div className="flex items-center gap-3">
          <Logo size="md" variant="dark" />
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs text-slate-600 font-semibold hidden sm:inline-block">
            Hi, <span className="text-[#2563EB] font-bold">{user?.name?.split(' ')[0] || 'Customer'}</span>
          </span>
          {/* Notification Bell */}
          <div className="relative">
            <button
              onClick={() => setShowNotif(!showNotif)}
              className="relative p-2 rounded-xl hover:bg-slate-100 transition-colors text-slate-500 hover:text-slate-700"
              title="Notifications"
            >
              <Bell size={18} />
              {hasExpiryWarning && (
                <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 bg-[#2563EB] rounded-full border-2 border-white" />
              )}
            </button>
            {showNotif && (
              <div className="absolute right-0 top-12 w-80 bg-white rounded-2xl shadow-xl border border-slate-200 z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-100 bg-slate-50">
                  <p className="text-xs font-bold text-slate-900 uppercase tracking-wider">Notifications</p>
                </div>
                {activePackage?.end_date ? (() => {
                  const daysLeft = Math.ceil((new Date(activePackage.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
                  const startStr = activePackage.start_date ? new Date(activePackage.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
                  const endStr = new Date(activePackage.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
                  const isExpired = daysLeft <= 0;
                  return (
                    <div className="p-4">
                      <div className={`rounded-xl p-3 ${isExpired ? 'bg-orange-50 border border-orange-200' : daysLeft <= 30 ? 'bg-amber-50 border border-amber-200' : 'bg-blue-50 border border-blue-200'}`}>
                        <p className={`text-xs font-bold ${isExpired ? 'text-orange-700' : daysLeft <= 30 ? 'text-amber-700' : 'text-[#2563EB]'}`}>
                          {isExpired ? '⚠️ Package Expired' : daysLeft <= 30 ? `⚠️ Expires in ${daysLeft} day${daysLeft !== 1 ? 's' : ''}` : '✅ Active Package'}
                        </p>
                        <p className="text-xs text-slate-800 mt-1 font-bold">{activePackage.package_name}</p>
                        <div className="flex gap-4 mt-2 text-[10px] text-slate-500">
                          <span>Start: <strong>{startStr}</strong></span>
                          <span>End: <strong>{endStr}</strong></span>
                        </div>
                      </div>
                    </div>
                  );
                })() : (
                  <div className="p-6 text-center text-slate-400 text-xs font-medium">
                    No active package
                  </div>
                )}
              </div>
            )}
          </div>
          <button
            onClick={handleLogout}
            className="text-slate-400 hover:text-[#2563EB] transition-colors p-2 rounded-xl hover:bg-slate-100"
            title="Logout"
          >
            <LogOut size={18} />
          </button>
        </div>
      </header>

      {/* Bottom tab bar (mobile) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white border-t border-slate-200 z-40 sm:hidden shadow-[0_-2px_10px_rgba(0,0,0,0.04)] pb-[env(safe-area-inset-bottom)]">
        <div className="flex items-center justify-around h-16">
          {mobileTabItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all duration-200 relative ${
                  isActive ? 'text-[#2563EB]' : 'text-slate-400'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  {isActive && (
                    <div className="absolute -top-0 left-1/2 -translate-x-1/2 w-8 h-[3px] bg-[#2563EB] rounded-full" />
                  )}
                  <Icon size={20} strokeWidth={isActive ? 2.5 : 1.5} />
                  <span className="text-[10px] font-semibold">{label}</span>
                </>
              )}
            </NavLink>
          ))}
          <button
            onClick={() => setIsMoreOpen(true)}
            className={`flex flex-col items-center justify-center gap-0.5 px-2 py-1 transition-all duration-200 relative ${
              isMoreOpen ? 'text-[#2563EB]' : 'text-slate-400'
            }`}
          >
            <MoreHorizontal size={20} strokeWidth={isMoreOpen ? 2.5 : 1.5} />
            <span className="text-[10px] font-semibold">More</span>
          </button>
        </div>
      </nav>

      {/* Mobile Slide-up Menu (More) */}
      {isMoreOpen && (
        <div className="fixed inset-0 bg-slate-900/30 backdrop-blur-xs z-50 sm:hidden" onClick={() => setIsMoreOpen(false)}>
          <div 
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-3xl shadow-xl overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-5 border-b border-slate-100">
              <h3 className="font-extrabold text-slate-900 text-lg">Menu</h3>
              <button onClick={() => setIsMoreOpen(false)} className="p-2 rounded-full bg-slate-100 text-slate-500 hover:bg-slate-200">
                <X size={18} />
              </button>
            </div>
            <div className="max-h-[70vh] overflow-y-auto p-4 space-y-1 pb-10">
              {tabItems.map(({ to, icon: Icon, label, end }) => {
                const isActive = end ? location.pathname === to : location.pathname.startsWith(to);
                return (
                  <NavLink
                    key={to}
                    to={to}
                    end={end}
                    onClick={() => setIsMoreOpen(false)}
                    className={`flex items-center gap-4 p-3.5 rounded-xl transition-colors ${
                      isActive ? 'bg-blue-50 text-[#2563EB] font-bold' : 'text-slate-700 hover:bg-slate-50 font-medium'
                    }`}
                  >
                    <Icon size={20} className={isActive ? 'text-[#2563EB]' : 'text-slate-400'} />
                    <span className="text-sm">{label}</span>
                  </NavLink>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Desktop horizontal nav */}
      <nav className="fixed top-16 left-0 right-0 bg-white border-b border-slate-200 z-30 hidden sm:block">
        <div className="max-w-6xl mx-auto px-6 flex items-center gap-1 overflow-x-auto scrollbar-none">
          {tabItems.map(({ to, icon: Icon, label, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `px-4 py-3 flex items-center gap-2 text-xs font-semibold border-b-2 transition-all duration-200 ${
                  isActive
                    ? 'border-[#2563EB] text-[#2563EB] bg-blue-50/40'
                    : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`
              }
            >
              <Icon size={16} />
              <span>{label}</span>
            </NavLink>
          ))}
        </div>
      </nav>
    </>
  );
}
