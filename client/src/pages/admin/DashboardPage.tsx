import { useState, useEffect } from 'react';
import { 
  Briefcase, IndianRupee, Package, Users, TrendingUp,
  Calendar, Clock, ChevronRight, Car, CalendarCheck, AlertTriangle,
  UserCheck, Zap, BarChart3, Bell, FileText, Wrench, Plus,
  ClipboardList, ArrowRight, CreditCard, MessageCircle, ShoppingCart
} from 'lucide-react';

import { useDashboardStats } from '../../api/hooks/useDashboard';
import { useJobCarts } from '../../api/hooks/useJobCarts';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axiosInstance';
import { formatTime, formatINR, timeAgo } from '../../utils/formatters';
import io from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';

export default function DashboardPage() {
  const { token } = useAuthStore();
  const { data: stats, isLoading: statsLoading } = useDashboardStats();
  const { data: recentJobs, isLoading: jobsLoading } = useJobCarts({ limit: 5 });

  const [todayBookings, setTodayBookings] = useState<any[]>([]);
  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pendingPkgCount, setPendingPkgCount] = useState(0);
  const [expiryAlerts, setExpiryAlerts] = useState<any[]>([]);
  const [showExpiryModal, setShowExpiryModal] = useState(false);

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchBookings = async () => {
    try {
      const res = await api.get('/bookings/pending', { params: { limit: 10 } });
      setTodayBookings(res.data.data || []);
    } catch {
      setTodayBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  useEffect(() => {
    fetchBookings();
    api.get('/packages/requests').then(res => {
      const pending = (res.data.data || []).filter((r: any) => r.status === 'pending');
      setPendingPkgCount(pending.length);
    }).catch(() => {});

    api.get('/user-packages/expiry-alerts').then(res => {
      const data = res.data?.data || [];
      setExpiryAlerts(data);
      const isDismissed = sessionStorage.getItem('pkg_expiry_popup_dismissed') === 'true';
      if (data.length > 0 && !isDismissed) {
        setShowExpiryModal(true);
      }
    }).catch(() => {});
    
    if (!token) return;
    const socket = io(import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000', {
      auth: { token }
    });
    socket.on('new_booking', () => fetchBookings());
    return () => { socket.disconnect(); };
  }, [token]);

  const jobs = recentJobs?.data || [];
  const greeting = currentTime.getHours() < 12 ? 'Good Morning' : currentTime.getHours() < 17 ? 'Good Afternoon' : 'Good Evening';

  return (
    <div className="space-y-6">
      {/* ── Welcome Header ──────────────── */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <p className="text-sm text-slate-500 font-medium">Welcome back,</p>
          <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">O3 Studio</h1>
        </div>
        <div className="flex items-center gap-3">
          <Link 
            to="/admin/job-carts/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-[#2563EB] hover:bg-[#1D4ED8] text-white font-bold rounded-xl shadow-sm hover:shadow-md transition-all text-sm"
          >
            <Plus size={16} /> New Job Card
          </Link>
        </div>
      </div>

      {/* ── Today's Overview Sky Gradient Banner ──────────────── */}
      <div className="relative overflow-hidden bg-gradient-to-r from-sky-400 via-blue-500 to-indigo-600 rounded-3xl p-6 shadow-md border border-sky-300/30">
        {/* Glowing background highlights */}
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/15 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-40 h-40 bg-sky-200/20 rounded-full blur-xl pointer-events-none" />

        <div className="relative z-10 flex items-center justify-between mb-5">
          <div className="flex items-center gap-2.5">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-400 animate-pulse" />
            <h2 className="text-white font-extrabold text-base tracking-wide uppercase">Today's Studio Overview</h2>
          </div>
          <span className="text-sky-100 text-xs font-semibold bg-white/20 backdrop-blur-md px-3 py-1 rounded-full border border-white/25 shadow-xs">
            {currentTime.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}
          </span>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
            {[1,2,3,4].map(i => <div key={i} className="h-24 bg-white/15 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 relative z-10">
            <Link to="/admin/job-carts" className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all duration-300 rounded-2xl p-4 text-center group hover:-translate-y-1 hover:shadow-xl">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-2 text-[#2563EB] shadow-xs group-hover:scale-110 transition-transform">
                <Briefcase size={20} />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{stats?.open_job_carts || 0}</p>
              <p className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Jobs Today</p>
            </Link>

            <Link to="/admin/customer-bookings" className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all duration-300 rounded-2xl p-4 text-center group hover:-translate-y-1 hover:shadow-xl">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-2 text-[#2563EB] shadow-xs group-hover:scale-110 transition-transform">
                <CalendarCheck size={20} />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{stats?.todayBookings || 0}</p>
              <p className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Bookings</p>
            </Link>

            <Link to="/admin/job-carts" className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all duration-300 rounded-2xl p-4 text-center group hover:-translate-y-1 hover:shadow-xl">
              <div className="w-11 h-11 rounded-xl bg-blue-50 border border-blue-100 flex items-center justify-center mx-auto mb-2 text-[#2563EB] shadow-xs group-hover:scale-110 transition-transform">
                <Clock size={20} />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{stats?.completedLast7Days || 0}</p>
              <p className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">In Progress</p>
            </Link>

            <Link to="/admin/accounts" className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all duration-300 rounded-2xl p-4 text-center group hover:-translate-y-1 hover:shadow-xl">
              <div className="w-11 h-11 rounded-xl bg-emerald-50 border border-emerald-100 flex items-center justify-center mx-auto mb-2 text-emerald-600 shadow-xs group-hover:scale-110 transition-transform">
                <IndianRupee size={20} />
              </div>
              <p className="text-2xl sm:text-3xl font-black text-slate-900 tracking-tight">{formatINR(stats?.today_revenue || 0)}</p>
              <p className="text-[11px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Today Revenue</p>
            </Link>
          </div>
        )}
      </div>

      {/* ── Quick Actions Grid ──────────────── */}
      <div>
        <h2 className="text-base font-bold text-slate-900 mb-3">Quick Actions</h2>
        <div className="grid grid-cols-3 sm:grid-cols-6 gap-3">
          {[
            { to: '/admin/job-carts/new', icon: ClipboardList, label: 'New Job Card' },
            { to: '/admin/customer-bookings', icon: CalendarCheck, label: 'New Booking' },
            { to: '/admin/customers', icon: Users, label: 'Customers' },
            { to: '/admin/invoices', icon: FileText, label: 'Invoices' },
            { to: '/admin/services', icon: Wrench, label: 'Services' },
            { to: '/admin/accounts', icon: BarChart3, label: 'Reports' },
          ].map(({ to, icon: Icon, label }) => (
            <Link
              key={to}
              to={to}
              className="bg-white border border-slate-200 rounded-2xl p-4 text-center hover:border-blue-300 hover:shadow-md transition-all group"
            >
              <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-100 transition-colors">
                <Icon size={20} className="text-[#2563EB]" />
              </div>
              <p className="text-[11px] font-bold text-slate-700 leading-tight">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Pending Approvals Alert ──────────────── */}
      {stats && ((stats.total_pending_approvals || 0) > 0 || pendingPkgCount > 0) && (
        <div className="bg-blue-50 border border-blue-200 rounded-2xl p-5">
          <div className="flex items-center gap-3 mb-3">
            <div className="w-10 h-10 rounded-xl bg-[#2563EB] flex items-center justify-center">
              <Bell size={18} className="text-white" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-slate-900">Pending Approvals</h3>
              <p className="text-xs text-slate-500">Review and approve customer requests</p>
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <Link to="/admin/customer-bookings" className="bg-white rounded-xl p-3 border border-slate-200 hover:border-blue-300 transition-colors flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Service Bookings</p>
                <p className="text-lg font-extrabold text-slate-900">{stats?.pending_service_bookings || 0}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
            <Link to="/admin/package-approvals" className="bg-white rounded-xl p-3 border border-slate-200 hover:border-blue-300 transition-colors flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Package Requests</p>
                <p className="text-lg font-extrabold text-slate-900">{stats?.pending_package_requests || pendingPkgCount || 0}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
            <Link to="/admin/product-orders" className="bg-white rounded-xl p-3 border border-slate-200 hover:border-blue-300 transition-colors flex items-center justify-between">
              <div>
                <p className="text-xs font-medium text-slate-500">Product Orders</p>
                <p className="text-lg font-extrabold text-slate-900">{stats?.pending_product_orders || 0}</p>
              </div>
              <ChevronRight size={16} className="text-slate-300" />
            </Link>
          </div>
        </div>
      )}

      {/* ── Franchise Low Stock Inventory Reminder Widget ──────────────── */}
      {stats && (stats.low_stock_items || 0) > 0 && (
        <div className="bg-gradient-to-r from-amber-50/90 via-orange-50/50 to-amber-50/90 border border-amber-200/90 rounded-3xl p-5 shadow-sm space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center shadow-xs shrink-0">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Franchise Low Stock Alert</h3>
                  <span className="px-2.5 py-0.5 bg-amber-200/80 text-amber-900 font-extrabold text-[10px] rounded-full uppercase tracking-wider">
                    {stats.low_stock_items} Items Low
                  </span>
                </div>
                <p className="text-xs text-slate-600 font-medium">
                  Products running low in active outlet inventory. Replenish stock to avoid service delays.
                </p>
              </div>
            </div>

            {parseInt(localStorage.getItem('active_franchise_id') || '1', 10) === 1 ? (
              <Link
                to="/admin/stock-approvals"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0"
              >
                <ShoppingCart size={15} />
                <span>Review Transfer Approvals</span>
              </Link>
            ) : (
              <Link
                to="/admin/franchise-orders"
                className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-extrabold rounded-xl transition-all flex items-center justify-center gap-1.5 shadow-xs shrink-0"
              >
                <ShoppingCart size={15} />
                <span>⚡ Replenish Stock Now</span>
              </Link>
            )}
          </div>

          {/* Low Stock Item Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {(stats.low_stock_details || []).slice(0, 6).map((item: any) => (
              <div
                key={item.id}
                className="bg-white rounded-2xl p-3.5 border border-amber-100/90 shadow-2xs flex items-center justify-between gap-3 group hover:border-amber-300 transition-all"
              >
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-[9px] font-black uppercase px-1.5 py-0.2 rounded bg-slate-100 text-slate-600">
                      {item.franchise_name || 'Studio'}
                    </span>
                    <span className="text-[9px] font-extrabold text-amber-700 bg-amber-50 px-1.5 py-0.2 rounded">
                      Low Stock
                    </span>
                  </div>
                  <p className="text-xs font-extrabold text-slate-900 truncate group-hover:text-[#2563EB] transition-colors">
                    {item.product_name}
                  </p>
                  <p className="text-[11px] font-extrabold text-red-600 mt-0.5">
                    Stock: {item.quantity} / {item.low_stock_threshold || 5} {item.unit || 'pcs'}
                  </p>
                </div>

                {parseInt(localStorage.getItem('active_franchise_id') || '1', 10) === 1 ? (
                  <Link
                    to="/admin/stock-approvals"
                    className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-colors shrink-0 text-xs font-bold flex items-center gap-1"
                    title="Review Transfer Approvals"
                  >
                    Approvals
                  </Link>
                ) : (
                  <Link
                    to="/admin/franchise-orders"
                    className="p-2 bg-amber-50 hover:bg-amber-100 text-amber-800 rounded-xl transition-colors shrink-0 text-xs font-bold flex items-center gap-1"
                    title="Order Replenishment"
                  >
                    <Plus size={14} /> Order
                  </Link>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Permanent Package Expiry Alerts Widget ──────────────── */}
      {expiryAlerts.length > 0 && (
        <div className="bg-gradient-to-r from-amber-50 via-orange-50 to-amber-50 border border-amber-200 rounded-3xl p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-2xl bg-amber-500 text-white flex items-center justify-center font-bold shadow-xs">
                <Bell size={20} />
              </div>
              <div>
                <h3 className="text-sm font-extrabold text-slate-900 tracking-tight">Active Package Expiry Reminders</h3>
                <p className="text-xs text-slate-600 font-medium">
                  {expiryAlerts.length} customer package(s) expiring within 30 days. Send WhatsApp reminders directly.
                </p>
              </div>
            </div>
            <Link
              to="/admin/package-alerts"
              className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white font-extrabold text-xs rounded-xl transition-all shadow-xs"
            >
              View All Alerts ({expiryAlerts.length})
            </Link>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3 pt-1">
            {expiryAlerts.slice(0, 3).map((item: any) => {
              const vehicleInfo = item.registration_no 
                ? `${item.registration_no} (${item.brand || ''} ${item.model || ''})`
                : item.brand ? `${item.brand} ${item.model || ''}` : 'N/A';
              const defaultMsg = `Hi ${item.customer_name},\n\nYour *${item.package_name}* package for *${vehicleInfo}* is about to expire (*${new Date(item.end_date).toLocaleDateString('en-IN')}*).\n\nKindly visit O3 Car Spa to redeem your remaining services!`;
              const waUrl = item.whatsapp_url || `https://wa.me/91${item.customer_mobile}?text=${encodeURIComponent(defaultMsg)}`;

              return (
                <div key={item.user_package_id} className="bg-white rounded-2xl p-3.5 border border-amber-200/80 shadow-2xs flex items-center justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="text-xs font-black text-slate-900 truncate">{item.customer_name}</p>
                    <p className="text-[11px] text-slate-500 font-medium truncate">{item.package_name} • {vehicleInfo}</p>
                    <p className="text-[10px] font-extrabold text-amber-700 mt-0.5">Expires in {item.days_remaining} day(s)</p>
                  </div>
                  <a
                    href={waUrl}
                    target="_blank"
                    rel="noreferrer"
                    className="p-2 bg-emerald-500 hover:bg-emerald-600 text-white rounded-xl transition-colors shrink-0 text-xs font-bold flex items-center gap-1"
                    title="Send WhatsApp Reminder"
                  >
                    <MessageCircle size={14} /> Remind
                  </a>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Studio Analytics & Performance Graphs ──────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Weekly Revenue & Volume Bar Chart - Real Data from API */}
        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-3xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-[#2563EB] rounded-lg">
                  <TrendingUp size={16} />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">Weekly Revenue & Volume</h3>
              </div>
              <p className="text-xs text-slate-500 mt-0.5">7-day rolling studio throughput</p>
            </div>
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                <span className="w-3 h-3 rounded-full bg-[#2563EB]" /> Revenue (₹)
              </div>
              <div className="flex items-center gap-1.5 text-xs text-slate-600 font-semibold">
                <span className="w-3 h-3 rounded-full bg-sky-300" /> Jobs
              </div>
            </div>
          </div>

          {/* Real weekly data from API or empty state */}
          {statsLoading ? (
            <div className="h-44 flex items-end justify-between gap-3 animate-pulse">
              {[1,2,3,4,5,6,7].map(i => (
                <div key={i} className="flex-1 bg-slate-100 rounded-t-xl" style={{ height: `${30 + i * 10}%` }} />
              ))}
            </div>
          ) : stats?.weekly_data && stats.weekly_data.length > 0 ? (
            <>
              <div className="h-44 flex items-end justify-between gap-3 pt-6 px-2 border-b border-slate-100">
                {stats.weekly_data.map((d: any, i: number) => {
                  const maxRev = Math.max(...stats.weekly_data.map((x: any) => x.revenue || 0), 1);
                  const heightPct = Math.round(((d.revenue || 0) / maxRev) * 100);
                  return (
                    <div key={i} className="flex-1 flex flex-col items-center gap-2 group relative">
                      <div className="absolute -top-10 opacity-0 group-hover:opacity-100 transition-opacity bg-slate-900 text-white text-[10px] font-bold px-2 py-1 rounded shadow-md pointer-events-none whitespace-nowrap z-20">
                        ₹{(d.revenue || 0).toLocaleString('en-IN')} • {d.jobs || 0} Jobs
                      </div>
                      <div className="w-full max-w-[36px] bg-slate-100 rounded-t-xl overflow-hidden flex flex-col justify-end h-32 relative">
                        <div className="w-full bg-sky-200 group-hover:bg-sky-300 transition-colors rounded-t-lg" style={{ height: `${Math.min(100, heightPct * 0.4)}%` }} />
                        <div className="w-full bg-[#2563EB] group-hover:bg-[#1D4ED8] transition-colors rounded-t-lg" style={{ height: `${heightPct}%` }} />
                      </div>
                      <span className="text-[11px] font-bold text-slate-600 group-hover:text-[#2563EB] transition-colors">{d.day}</span>
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between mt-4 text-xs font-bold text-slate-500">
                <span>Peak Day: <strong className="text-slate-900">{stats.weekly_data.reduce((best: any, d: any) => d.revenue > (best.revenue || 0) ? d : best, stats.weekly_data[0])?.day || '—'}</strong></span>
                <span>Week Total: <strong className="text-[#2563EB]">{formatINR(stats.weekly_data.reduce((s: number, d: any) => s + (d.revenue || 0), 0))}</strong></span>
              </div>
            </>
          ) : (
            <div className="h-44 flex flex-col items-center justify-center text-center">
              <BarChart3 size={36} className="text-slate-200 mb-3" />
              <p className="text-sm font-bold text-slate-400">No revenue data yet</p>
              <p className="text-xs text-slate-300 mt-1">Data will appear once job cards are completed</p>
            </div>
          )}
        </div>

        {/* Service Demand Share — Real from API */}
        <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm flex flex-col justify-between">
          <div>
            <div className="flex items-center gap-2 mb-4">
              <span className="p-1.5 bg-emerald-50 text-emerald-600 rounded-lg">
                <Zap size={16} />
              </span>
              <h3 className="font-extrabold text-slate-900 text-base">Service Demand Share</h3>
            </div>

            {stats?.service_demand && stats.service_demand.length > 0 ? (
              <div className="space-y-4">
                {stats.service_demand.slice(0, 5).map((cat: any, i: number) => (
                  <div key={i}>
                    <div className="flex justify-between text-xs font-bold text-slate-700 mb-1">
                      <span className="truncate max-w-[130px]">{cat.name}</span>
                      <span className="text-slate-900">{cat.pct}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                      <div
                        className={`h-2 rounded-full transition-all duration-500 ${
                          i === 0 ? 'bg-[#2563EB]' : i === 1 ? 'bg-sky-400' : i === 2 ? 'bg-indigo-500' : i === 3 ? 'bg-emerald-500' : 'bg-amber-500'
                        }`}
                        style={{ width: `${cat.pct}%` }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center text-center py-8">
                <Zap size={32} className="text-slate-200 mb-3" />
                <p className="text-sm font-bold text-slate-400">No data yet</p>
                <p className="text-xs text-slate-300 mt-1">Service demand will appear as jobs are created</p>
              </div>
            )}
          </div>

          {stats?.service_demand && stats.service_demand.length > 0 && (
            <div className="mt-6 pt-4 border-t border-slate-100 flex items-center justify-between text-xs">
              <span className="text-slate-500 font-medium">Top Performer</span>
              <span className="font-extrabold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                {stats.service_demand[0]?.name} 🔥
              </span>
            </div>
          )}
        </div>
      </div>



      {/* ── Main Content: Upcoming Bookings + Recent Jobs ──────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">

        {/* Upcoming Bookings */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Upcoming Bookings</h2>
            <Link to="/admin/customer-bookings" className="text-[#2563EB] text-xs font-bold hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </Link>
          </div>
          {bookingsLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />)}
            </div>
          ) : todayBookings.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {todayBookings.slice(0, 5).map((b: any) => (
                <div key={b.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <div className="text-center shrink-0 w-14">
                        {b.start_time && (
                          <>
                            <p className="text-sm font-extrabold text-[#2563EB]">{formatTime(b.start_time)}</p>
                            <p className="text-[9px] font-bold text-slate-400 uppercase">
                              {parseInt(b.start_time) < 12 ? 'AM' : 'PM'}
                            </p>
                          </>
                        )}
                      </div>
                      <div>
                        <h4 className="text-sm font-bold text-slate-900">{b.customer_name}</h4>
                        <p className="text-xs text-slate-500 mt-0.5">
                          {b.vehicle_brand} {b.vehicle_model} • {b.vehicle_reg_no || ''}
                        </p>
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-[#2563EB] bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                      {b.service_name || b.package_name || 'Detailing'}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">No upcoming bookings</p>
            </div>
          )}
        </div>

        {/* Recent Job Cards */}
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex items-center justify-between">
            <h2 className="font-bold text-slate-900 text-sm">Recent Job Cards</h2>
            <Link to="/admin/job-carts" className="text-[#2563EB] text-xs font-bold hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </Link>
          </div>
          {jobsLoading ? (
            <div className="p-5 space-y-3">
              {[1,2,3].map(i => <div key={i} className="h-14 bg-slate-100 animate-pulse rounded-xl" />)}
            </div>
          ) : jobs.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {jobs.slice(0, 5).map((job: any) => (
                <Link
                  key={job.id}
                  to={`/admin/job-carts/${job.id}`}
                  className="px-5 py-3.5 hover:bg-slate-50 flex items-center justify-between transition-colors block"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB]">
                      <Car size={18} />
                    </div>
                    <div>
                      <h4 className="text-sm font-bold text-slate-900">{job.registration_no}</h4>
                      <p className="text-xs text-slate-500 mt-0.5">
                        {job.customer_name} • {job.brand} {job.model}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={job.status} />
                    <ChevronRight size={14} className="text-slate-300" />
                  </div>
                </Link>
              ))}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Briefcase size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">No active job cards</p>
              <Link to="/admin/job-carts/new" className="text-[#2563EB] text-xs font-bold mt-2 inline-block hover:underline">
                Create your first job card →
              </Link>
            </div>
          )}
        </div>
      </div>

      {/* ── Bottom Row: Stats Cards + Alerts ──────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <Link to="/admin/package-alerts" className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-amber-300 hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-xl bg-amber-50 flex items-center justify-center mb-3">
            <Bell size={18} className="text-amber-600" />
          </div>
          <p className="text-xs font-medium text-slate-500">Package Expiry</p>
          <p className="text-xl font-extrabold text-amber-600">{stats?.expiring_packages || 0}</p>
          <p className="text-[10px] text-slate-400 mt-1">Expiring within 30 days</p>
        </Link>
        <Link to="/admin/pending-payments" className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-red-300 hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-xl bg-red-50 flex items-center justify-center mb-3">
            <CreditCard size={18} className="text-red-600" />
          </div>
          <p className="text-xs font-medium text-slate-500">Collect Payments</p>
          <p className="text-xl font-extrabold text-red-600">Reminders</p>
          <p className="text-[10px] text-slate-400 mt-1">Pending customer dues</p>
        </Link>
        <Link to="/admin/leads" className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center mb-3">
            <Users size={18} className="text-[#2563EB]" />
          </div>
          <p className="text-xs font-medium text-slate-500">Lead Management</p>
          <p className="text-xl font-extrabold text-slate-900">{stats?.newLeads || 0}</p>
          <p className="text-[10px] text-slate-400 mt-1">Meta Ads & Walk-ins</p>
        </Link>
        <Link to="/admin/accounts" className="bg-white border border-slate-200 rounded-2xl p-4 hover:border-blue-300 hover:shadow-sm transition-all">
          <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center mb-3">
            <IndianRupee size={18} className="text-emerald-600" />
          </div>
          <p className="text-xs font-medium text-slate-500">This Month</p>
          <p className="text-xl font-extrabold text-slate-900">{formatINR(stats?.month_revenue || 0)}</p>
          <p className="text-[10px] text-slate-400 mt-1">Total revenue</p>
        </Link>
      </div>

      {/* ── Package Maintenance Expiry Pop-Up Modal (Admin) ──────────── */}
      {showExpiryModal && expiryAlerts.length > 0 && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl max-w-3xl w-full p-6 shadow-2xl border border-amber-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-gray-100 pb-4 mb-4">
              <div className="flex items-center gap-3">
                <div className="w-11 h-11 bg-amber-100 text-amber-600 rounded-2xl flex items-center justify-center font-bold shadow-xs">
                  <Bell size={22} />
                </div>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Package Maintenance Expiry Reminders</h3>
                  <p className="text-xs text-slate-500 font-medium">{expiryAlerts.length} customer package(s) close to expiry (11 months mark / 30-day window)</p>
                </div>
              </div>
              <button
                onClick={() => {
                  setShowExpiryModal(false);
                  sessionStorage.setItem('pkg_expiry_popup_dismissed', 'true');
                }}
                className="text-gray-400 hover:text-gray-600 text-xl font-bold px-2 py-1 rounded-lg"
              >
                ✕
              </button>
            </div>

            <div className="max-h-96 overflow-y-auto divide-y divide-gray-100 text-xs">
              {expiryAlerts.map((item: any) => {
                const stageColor = item.reminder_stage === '1_day' 
                  ? 'bg-red-500 text-white' 
                  : item.reminder_stage === '1_week' 
                  ? 'bg-orange-500 text-white' 
                  : 'bg-amber-500 text-white';
                
                const stageText = item.reminder_stage === '1_day'
                  ? '1 DAY REMINDER'
                  : item.reminder_stage === '1_week'
                  ? '1 WEEK REMINDER'
                  : '1 MONTH REMINDER (11 MONTHS MARK)';

                const vehicleInfo = item.registration_no 
                  ? `${item.registration_no} (${item.brand || ''} ${item.model || ''})`
                  : item.brand ? `${item.brand} ${item.model || ''}` : 'N/A';

                const defaultMsg = `Hi ${item.customer_name},\n\nYour *${item.package_name}* package for *${vehicleInfo}* is about to expire next month (*${new Date(item.end_date).toLocaleDateString('en-IN')}*).\n\nDays Remaining: ${item.days_remaining} day(s)\n\nKindly visit O3 Car Spa to redeem your remaining service sessions!\n📍 O3 Car Spa, GIDC, Anand\n📞 7225030303`;

                const waUrl = item.whatsapp_url || `https://wa.me/91${item.customer_mobile}?text=${encodeURIComponent(defaultMsg)}`;

                return (
                  <div key={item.user_package_id} className="py-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-slate-50 p-3 rounded-2xl transition-colors">
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-black text-slate-900 text-sm">{item.customer_name}</span>
                        <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full border border-slate-200">
                          📞 {item.customer_mobile}
                        </span>
                        <span className={`text-[9px] font-black px-2 py-0.5 rounded-full ${stageColor}`}>
                          {stageText}
                        </span>
                      </div>

                      <div className="text-slate-600 text-xs flex items-center gap-2 flex-wrap">
                        <span>Package: <strong className="text-slate-900">{item.package_name}</strong></span>
                        <span>•</span>
                        <span>Vehicle: <strong className="text-slate-900">{vehicleInfo}</strong></span>
                        {item.price_paid && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 font-bold">₹{parseFloat(item.price_paid).toLocaleString('en-IN')}</span>
                          </>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-[10px] text-slate-500 font-medium pt-0.5">
                        <span className="text-amber-700 font-bold">
                          Expires: {new Date(item.end_date).toLocaleDateString('en-IN')} ({item.days_remaining}d left)
                        </span>
                        {item.autodate_1month && (
                          <span className="bg-slate-100 px-1.5 py-0.5 rounded text-slate-600">
                            Autodates: 1M ({item.autodate_1month}) • 1W ({item.autodate_1week}) • 1D ({item.autodate_1day})
                          </span>
                        )}
                      </div>
                    </div>

                    <a
                      href={waUrl}
                      target="_blank"
                      rel="noreferrer"
                      className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-extrabold rounded-xl flex items-center justify-center gap-1.5 shrink-0 shadow-sm text-xs transition-colors"
                    >
                      <MessageCircle size={14} /> WhatsApp Remind
                    </a>
                  </div>
                );
              })}
            </div>

            <div className="mt-5 pt-3 border-t border-gray-100 flex justify-between items-center">
              <span className="text-[11px] text-slate-400 font-medium">3-Tier Reminder Rule Active: 1 Month Before, 1 Week Before, 1 Day Before</span>
              <button
                onClick={() => {
                  setShowExpiryModal(false);
                  sessionStorage.setItem('pkg_expiry_popup_dismissed', 'true');
                }}
                className="px-4 py-2 bg-gray-100 hover:bg-gray-200 text-slate-700 font-bold rounded-xl text-xs"
              >
                Dismiss Pop-Up
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

