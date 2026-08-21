import { NavLink, useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import { useUIStore } from '../../store/uiStore';
import { ClipboardList, PlusCircle, Sparkles, Clock, LogOut, X, Truck, MessageSquare, Package, DollarSign } from 'lucide-react';

const navItems = [
  { to: '/staff/job-carts', icon: ClipboardList, label: "Today's Jobs" },
  { to: '/staff/job-carts/new', icon: PlusCircle, label: 'New Job Cart' },
  { to: '/staff/check-in', icon: Clock, label: 'Check In/Out' },
  { to: '/staff/quick-wash', icon: Sparkles, label: 'Quick Wash Queue' },
  { to: '/staff/delivery', icon: Truck, label: 'Vehicle Deliveries' },
  { to: '/staff/inquiry', icon: MessageSquare, label: 'Lead Inquiries' },
  { to: '/staff/inventory', icon: Package, label: 'Inventory Catalogue' },
  { to: '/staff/benefits', icon: DollarSign, label: 'My Salary & Benefits' },
];

export default function StaffSidebar() {
  const { user, logout } = useAuthStore();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      <aside
        className={`w-[240px] h-screen fixed left-0 top-0 bg-gradient-to-b from-[#0F172A] to-[#0d0d0d] flex flex-col py-8 shadow-2xl z-[80] transition-transform duration-300 lg:translate-x-0 ${
          sidebarOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        {/* Brand */}
        <div className="px-6 mb-10 flex items-center justify-between">
          <div>
            <div className="flex items-center gap-2.5 mb-1">
              <div className="w-7 h-7 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center shadow-blue-glow">
                <span className="text-white font-black text-[10px]">GK</span>
              </div>
              <h1 className="text-lg font-bold text-white tracking-tight">AutoHerb</h1>
            </div>
            <p className="text-[10px] text-gray-500 uppercase tracking-widest mt-1 ml-[38px]">Staff Panel</p>
          </div>
          <button onClick={() => setSidebarOpen(false)} className="lg:hidden text-gray-400 hover:text-white transition-colors">
            <X size={20} />
          </button>
        </div>

        {/* Nav */}
        <nav className="flex-1 space-y-0.5">
          {navItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              onClick={() => setSidebarOpen(false)}
              className={({ isActive }) =>
                `px-6 py-3 flex items-center gap-3 transition-all duration-200 active:scale-95 ${
                  isActive
                    ? 'text-white border-l-4 border-[#2563EB] bg-white/5 font-semibold'
                    : 'text-gray-400 hover:text-white hover:bg-white/10 border-l-4 border-transparent'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <Icon size={20} className={`transition-all duration-200 ${isActive ? 'text-[#2563EB] drop-shadow-[0_0_6px_rgba(211,47,47,0.4)]' : ''}`} />
                  <span className="text-sm font-medium">{label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        {/* User footer */}
        <div className="px-6 mt-auto">
          <div className="flex items-center gap-3 pt-6 border-t border-white/10">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center text-white font-bold text-xs shrink-0 shadow-blue-glow">
              {user?.name?.charAt(0) || 'S'}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-xs text-white font-medium truncate">{user?.name || 'Staff'}</p>
              <p className="text-[10px] text-gray-500">Staff Member</p>
            </div>
            <button
              onClick={handleLogout}
              className="text-gray-500 hover:text-blue-400 transition-colors p-1.5 rounded-lg hover:bg-white/5"
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

