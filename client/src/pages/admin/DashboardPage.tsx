import { useState, useEffect } from 'react';
import { 
  Briefcase, IndianRupee, Package, Users, TrendingUp,
  Calendar, Clock, ChevronRight, Car, CalendarCheck, AlertTriangle,
  UserCheck, Zap, BarChart3, Bell, FileText, Wrench, Plus,
  ClipboardList, ArrowRight, CreditCard, MessageCircle, ShoppingCart,
  Building2, Award, CheckCircle2, Loader2
} from 'lucide-react';

import { useDashboardStats } from '../../api/hooks/useDashboard';
import { useJobCarts } from '../../api/hooks/useJobCarts';
import { useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { Link } from 'react-router-dom';
import StatusBadge from '../../components/ui/StatusBadge';
import api from '../../api/axiosInstance';
import { formatTime, formatINR, timeAgo } from '../../utils/formatters';
import io from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { carImage } from '../../utils/carImage';
import { socketUrl } from '../../utils/endpoints';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';
import { can, canAny } from '../../utils/access';

export default function DashboardPage() {
  const { token, user } = useAuthStore();
  const [period, setPeriod] = useState<'today' | 'weekly' | 'monthly' | 'yearly' | 'all_time'>('today');
  const [franchiseFilter, setFranchiseFilter] = useState<string>('all');
  const { data: stats, isLoading: statsLoading } = useDashboardStats({ timeframe: period, franchise_id: franchiseFilter });
  const { data: recentJobs, isLoading: jobsLoading } = useJobCarts({ limit: 5 });
  const [todayBookings, setTodayBookings] = useState<any[]>([]);

  const [bookingsLoading, setBookingsLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [pendingPkgCount, setPendingPkgCount] = useState(0);
  const [expiryAlerts, setExpiryAlerts] = useState<any[]>([]);
  const [showExpiryModal, setShowExpiryModal] = useState(false);
  const [sendingPkgId, setSendingPkgId] = useState<number | string | null>(null);
  const sendWhatsApp = useSendWhatsApp();
  const canPkgs = canAny(user, 'packages');
  const canBookings = can(user, 'bookings');

  const handleSendExpiryWhatsApp = (item: any, msg: string) => {
    if (!item.customer_mobile) return;
    setSendingPkgId(item.user_package_id);
    sendWhatsApp.mutate(
      {
        phone: item.customer_mobile,
        message: msg,
        customer_id: item.customer_id
      },
      {
        // remember the reminder so "Reminded once / twice …" stays correct everywhere
        onSuccess: () => { api.post(`/user-packages/${item.user_package_id}/reminder-sent`).catch(() => {}); },
        onSettled: () => setSendingPkgId(null)
      }
    );
  };

  useEffect(() => {
    const t = setInterval(() => setCurrentTime(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  const fetchBookings = async () => {
    if (!canBookings) { setBookingsLoading(false); return; }
    try {
      const res = await api.get('/bookings/pending', { params: { limit: 10 } });
      setTodayBookings(res.data.data || []);
    } catch {
      setTodayBookings([]);
    } finally {
      setBookingsLoading(false);
    }
  };

  useLiveReload(() => {
    fetchBookings();
    if (!canPkgs) return;
    api.get('/packages/requests').then(res => setPendingPkgCount((res.data.data || []).filter((r: any) => r.status === 'pending').length)).catch(() => {});
    api.get('/user-packages/expiry-alerts').then(res => setExpiryAlerts(res.data?.data || [])).catch(() => {});
  });

  useEffect(() => {
    fetchBookings();
    if (canPkgs) api.get('/packages/requests').then(res => {
      const pending = (res.data.data || []).filter((r: any) => r.status === 'pending');
      setPendingPkgCount(pending.length);
    }).catch(() => {});

    if (canPkgs) api.get('/user-packages/expiry-alerts').then(res => {
      const data = res.data?.data || [];
      setExpiryAlerts(data);
      const isDismissed = sessionStorage.getItem('pkg_expiry_popup_dismissed') === 'true';
      if (data.length > 0 && !isDismissed) {
        setShowExpiryModal(true);
      }
    }).catch(() => {});
    
    if (!token) return;
    const socket = io(socketUrl(), {
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
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <p className="text-[13px] text-slate-500 font-semibold">
            {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'} · {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'short' })}
          </p>
          <h1 className="text-[26px] sm:text-[30px] font-black text-slate-900 tracking-tight leading-tight">
            {(user?.name || 'O3 Studio').split(' ')[0]} 👋
          </h1>
        </div>
        <div className="flex items-center gap-2">
          {can(user, 'quick_wash') && <Link to="/admin/quick-wash"
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 hover:border-slate-300 hover:bg-slate-50 text-slate-700 font-bold rounded-xl shadow-sm transition-all text-sm">
            <img src="/illustrations/tab-services.webp" alt="" className="w-5 h-5 object-contain mix-blend-multiply" /> Quick Wash
          </Link>}
          {can(user, 'job_cards', 'create') && <Link to="/admin/job-carts/new"
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white font-bold rounded-xl shadow-md shadow-blue-600/25 hover:shadow-lg hover:-translate-y-0.5 transition-all text-sm">
            <Plus size={16} /> New Job Card
          </Link>}
        </div>
      </div>

      {/* ── Studio overview ──────────────── */}
      <div className="relative overflow-hidden rounded-3xl p-5 sm:p-6 bg-gradient-to-br from-[#0B1F4D] via-[#14327A] to-[#2563EB] shadow-xl shadow-blue-900/15">
        <div className="absolute -right-16 -top-20 w-72 h-72 rounded-full bg-white/[0.06] pointer-events-none" />
        <div className="absolute right-24 -bottom-24 w-56 h-56 rounded-full bg-sky-300/10 pointer-events-none" />
        {/* Studio photo fading into the blue panel */}
        <img src="/photos/studio-hero.webp" alt="" className="absolute inset-0 w-full h-full object-cover opacity-40 pointer-events-none" />

        <div className="relative z-10 flex flex-wrap items-center justify-between gap-3 mb-5">
          <div>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <h2 className="text-white font-extrabold text-[15px]">Studio overview</h2>
            </div>
            <p className="text-blue-100/70 text-xs mt-0.5">Tap a number to open the details</p>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center bg-white/10 backdrop-blur-md p-1 rounded-xl border border-white/15 overflow-x-auto no-scrollbar">
              {[
                { key: 'today', label: 'Today' },
                { key: 'weekly', label: 'Week' },
                { key: 'monthly', label: 'Month' },
                { key: 'yearly', label: 'Year' },
                { key: 'all_time', label: 'All time' },
              ].map((tab) => (
                <button
                  key={tab.key}
                  type="button"
                  onClick={() => setPeriod(tab.key as any)}
                  className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-all whitespace-nowrap ${
                    period === tab.key ? 'bg-white text-[#0B1F4D] shadow-sm' : 'text-blue-100 hover:text-white hover:bg-white/10'
                  }`}
                >
                  {tab.label}
                </button>
              ))}
            </div>

            {/* Consolidated Super Admin Franchise Toggle (super admin only — others always see their own studio) */}
            {user?.role === 'super_admin' && <div className="flex items-center bg-white/10 backdrop-blur-md px-2.5 py-1.5 rounded-xl border border-white/15 text-xs font-bold text-white">
              <Building2 size={13} className="mr-1.5 text-blue-200" />
              <Dropdown
                value={franchiseFilter}
                onChange={(e) => setFranchiseFilter(e.target.value)}
                className="bg-transparent text-white font-bold text-xs focus:outline-none cursor-pointer pr-1 [&>option]:text-slate-900"
              >
                <option value="all">All studios</option>
                {(stats?.franchise_breakdown || []).map((f: any) => (
                  <option key={f.id} value={String(f.id)}>
                    {f.name} ({f.code})
                  </option>
                ))}
              </Dropdown>
            </div>}
          </div>
        </div>

        {statsLoading ? (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
            {[1, 2, 3, 4].map(i => <div key={i} className="h-[104px] bg-white/10 rounded-2xl animate-pulse" />)}
          </div>
        ) : (
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 relative z-10">
            {[
              { to: '/admin/accounts', m: 'accounts', icon: IndianRupee, img: '/illustrations/ic-wallet.webp', tint: 'bg-emerald-50 text-emerald-600', value: formatINR(stats?.revenue ?? stats?.today_revenue ?? 0), label: `${stats?.timeframe_label || 'Today'} revenue` },
              { to: '/admin/job-carts', m: 'job_cards', icon: Car, img: '/cars/suv.webp', tint: 'bg-blue-50 text-[#2563EB]', value: String(stats?.cars_serviced ?? 0), label: `Cars serviced (${stats?.timeframe_label || 'Today'})` },
              { to: '/admin/pending-payments', m: 'payments', icon: CreditCard, img: '/illustrations/adm-invoice.webp', tint: 'bg-rose-50 text-rose-600', value: formatINR(stats?.pending_payments || 0), label: 'Payments to collect' },
              { to: '/admin/job-carts', m: 'job_cards', icon: Briefcase, img: '/illustrations/wash.webp', tint: 'bg-amber-50 text-amber-600', value: String(stats?.open_job_carts || 0), label: 'Cars in the studio now' },
            ].map(t => (
              <Link key={t.label} to={can(user, t.m) ? t.to : '#'} onClick={e => { if (!can(user, t.m)) e.preventDefault(); }} className="group bg-white rounded-2xl p-4 shadow-lg shadow-blue-950/10 hover:-translate-y-0.5 hover:shadow-xl transition-all">
                <div className="flex items-center justify-between">
                  <span className={`w-11 h-11 rounded-xl flex items-center justify-center overflow-hidden ${t.tint}`}><img src={t.img} alt="" className="w-10 h-10 object-contain mix-blend-multiply" /></span>
                  <span className="text-slate-300 group-hover:text-[#2563EB] transition-colors text-lg leading-none">›</span>
                </div>
                <p className="mt-3 text-[22px] sm:text-[26px] font-black text-slate-900 tracking-tight leading-none">{t.value}</p>
                <p className="text-[11.5px] text-slate-500 font-semibold mt-1.5 leading-tight">{t.label}</p>
              </Link>
            ))}
          </div>
        )}
      </div>

      {/* ── Quick actions (3D pictures, same family as the customer app) ──────────────── */}
      <div>
        <h2 className="text-[15px] font-extrabold text-slate-900 mb-3">Quick actions</h2>
        <div className="grid grid-cols-4 sm:grid-cols-8 gap-2.5">
          {[
            { to: '/admin/job-carts/new', img: '/illustrations/history.webp', label: 'New job card', m: 'job_cards', a: 'create' },
            { to: '/admin/quick-wash', img: '/illustrations/tab-services.webp', label: 'Quick wash', m: 'quick_wash' },
            { to: '/admin/customer-bookings', img: '/illustrations/tab-bookings.webp', label: 'Bookings', m: 'bookings' },
            { to: '/admin/customers', img: '/illustrations/tab-profile.webp', label: 'Customers', m: 'customers' },
            { to: '/admin/leads', img: '/illustrations/adm-whatsapp.webp', label: 'Leads & chats', m: 'leads' },
            { to: '/admin/services', img: '/illustrations/ceramic.webp', label: 'Services', m: 'services' },
            { to: '/admin/referrals', img: '/illustrations/tab-refer.webp', label: 'Referrals', m: 'referrals' },
            { to: '/admin/invoices', img: '/illustrations/adm-invoice.webp', label: 'Invoices', m: 'invoices' },
          ].filter(q => can(user, q.m, (q as any).a || 'view')).map(({ to, img, label }, i) => (
            <Link key={to} to={to} style={{ animationDelay: `${i * 35}ms` }}
              className="rise group bg-white border border-slate-200/80 rounded-2xl px-1.5 pt-2.5 pb-2 text-center hover:border-blue-200 hover:shadow-md hover:-translate-y-0.5 transition-all">
              <img src={img} alt="" className="w-11 h-11 sm:w-12 sm:h-12 mx-auto object-contain mix-blend-multiply group-hover:scale-110 transition-transform" />
              <p className="text-[11px] font-bold text-slate-700 leading-tight mt-1.5">{label}</p>
            </Link>
          ))}
        </div>
      </div>

      {/* ── Needs attention: one compact list instead of separate alert boxes ──────────────── */}
      {stats && (() => {
        const hq = parseInt(localStorage.getItem('active_franchise_id') || '1', 10) === 1;
        const rows = [
          { n: Number(stats.pending_service_bookings || 0), label: 'Bookings waiting for approval', to: '/admin/customer-bookings', m: 'bookings', icon: Calendar, tint: 'bg-blue-50 text-[#2563EB]' },
          { n: Number(stats.pending_package_requests || pendingPkgCount || 0), label: 'Package requests to approve', to: '/admin/package-approvals', m: 'packages', icon: Bell, tint: 'bg-violet-50 text-violet-600' },
          { n: Number(stats.pending_product_orders || 0), label: 'Product orders to confirm', to: '/admin/product-orders', m: 'inventory', icon: ShoppingCart, tint: 'bg-orange-50 text-orange-600' },
          { n: Number(stats.low_stock_items || 0), label: 'Products running low', to: hq ? '/admin/inventory' : '/admin/franchise-orders', m: hq ? 'inventory' : 'franchise_stock', icon: AlertTriangle, tint: 'bg-amber-50 text-amber-600' },
          { n: expiryAlerts.length, label: 'Packages expiring in 30 days', to: '/admin/package-alerts', m: 'packages', icon: MessageCircle, tint: 'bg-emerald-50 text-emerald-600' },
          { n: Number(stats.newLeads || 0), label: 'New leads to follow up', to: '/admin/leads', m: 'leads', icon: Users, tint: 'bg-sky-50 text-sky-600' },
        ].filter(r => r.n > 0 && can(user, r.m));
        return (
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
            <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
              <h2 className="text-[15px] font-extrabold text-slate-900">Needs attention</h2>
              {rows.length > 0 && <span className="text-[11px] font-bold text-slate-500">{rows.reduce((a, r) => a + r.n, 0)} items</span>}
            </div>
            {rows.length === 0 ? (
              <p className="px-4 sm:px-5 pb-4 text-sm text-slate-500 flex items-center gap-2"><CheckCircle2 size={16} className="text-emerald-500" /> All caught up — nothing waiting for you.</p>
            ) : (
              <div className="divide-y divide-slate-100 pb-1">
                {rows.map(r => (
                  <Link key={r.label} to={r.to} className="flex items-center gap-3 px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors">
                    <span className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${r.tint}`}><r.icon size={17} /></span>
                    <span className="flex-1 min-w-0 text-sm font-semibold text-slate-700 truncate">{r.label}</span>
                    <span className="text-sm font-black text-slate-900">{r.n}</span>
                    <ChevronRight size={16} className="text-slate-300" />
                  </Link>
                ))}
              </div>
            )}
          </div>
        );
      })()}

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

      {/* ── Studios at a glance (super admin, only when there is more than one studio) ── */}
      {(stats?.is_consolidated || franchiseFilter === 'all') && (stats?.franchise_breakdown?.length || 0) > 1 && (
        <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
          <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
            <h2 className="text-[15px] font-extrabold text-slate-900">Studios · {stats?.timeframe_label || 'Today'}</h2>
            <span className="text-[11px] font-bold text-slate-500">{stats.franchise_breakdown.length} studios</span>
          </div>
          <div className="divide-y divide-slate-100 pb-1">
            {stats.franchise_breakdown.map((f: any) => (
              <button key={f.id} type="button" onClick={() => setFranchiseFilter(String(f.id))}
                className="w-full text-left flex flex-wrap items-center gap-x-4 gap-y-1 px-4 sm:px-5 py-3 hover:bg-slate-50 transition-colors">
                <span className="flex-1 min-w-[140px]">
                  <span className="block text-sm font-extrabold text-slate-900">{f.name}</span>
                  <span className="block text-[11px] text-slate-500">{[f.code, f.city].filter(Boolean).join(' · ')}</span>
                </span>
                <span className="text-right"><span className="block text-sm font-black text-emerald-700">{formatINR(f.revenue || 0)}</span><span className="block text-[10px] text-slate-400 font-semibold">revenue</span></span>
                <span className="text-right"><span className="block text-sm font-black text-slate-900">{f.cars_serviced || 0}</span><span className="block text-[10px] text-slate-400 font-semibold">cars</span></span>
                <span className="text-right"><span className="block text-sm font-black text-rose-600">{formatINR(f.pending_payments || 0)}</span><span className="block text-[10px] text-slate-400 font-semibold">to collect</span></span>
                <ChevronRight size={16} className="text-slate-300" />
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Top staff (compact) ──────────── */}
      <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm">
        <div className="flex items-center justify-between px-4 sm:px-5 pt-4 pb-2">
          <h2 className="text-[15px] font-extrabold text-slate-900">Top staff · {stats?.timeframe_label || 'Today'}</h2>
          <Link to="/admin/staff-hr" className="text-xs font-bold text-[#2563EB] flex items-center gap-0.5">Staff & HR <ChevronRight size={13} /></Link>
        </div>
        {stats?.staff_performance && stats.staff_performance.length > 0 ? (
          <div className="divide-y divide-slate-100 pb-1">
            {stats.staff_performance.slice(0, 5).map((staff: any, idx: number) => (
              <div key={staff.staff_id} className="flex items-center gap-3 px-4 sm:px-5 py-3">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${idx === 0 ? 'bg-amber-100 text-amber-800' : 'bg-slate-100 text-slate-600'}`}>{idx + 1}</span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-bold text-slate-900 truncate">{staff.staff_name}</span>
                  <span className="block text-[11px] text-slate-500 capitalize">{staff.role} · {staff.completed_jobs} jobs</span>
                </span>
                <span className="text-right">
                  <span className="block text-sm font-black text-emerald-700">{formatINR(staff.total_revenue || 0)}</span>
                  {Number(staff.incentives_earned) > 0 && <span className="block text-[10px] font-bold text-amber-700">+{formatINR(staff.incentives_earned)} incentive</span>}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="px-4 sm:px-5 pb-4 text-sm text-slate-500">No completed jobs in this period yet.</p>
        )}
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
                    <img src={carImage({ brand: job.brand, model: job.model, category: job.car_category || job.vehicle_category })} alt="" className="w-14 h-10 object-contain shrink-0" loading="lazy" />
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

      {/* ── Package expiry reminders pop-up ── */}
      {showExpiryModal && expiryAlerts.length > 0 && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-sm z-50 flex items-end sm:items-center justify-center sm:p-4">
          <div className="bg-white w-full sm:max-w-xl rounded-t-3xl sm:rounded-3xl shadow-2xl overflow-hidden max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200">
            <div className="relative h-28 shrink-0">
              <img src="/photos/packages.webp" alt="" className="absolute inset-0 w-full h-full object-cover" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/95 via-[#0B1F4D]/75 to-transparent" />
              <div className="relative h-full flex flex-col justify-center px-5 text-white">
                <span className="inline-flex w-fit items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-amber-400 text-slate-900 px-2 py-0.5 rounded"><Bell size={11} /> {expiryAlerts.length} expiring soon</span>
                <h3 className="text-lg font-black mt-1.5 leading-tight">Packages about to expire</h3>
                <p className="text-[11.5px] text-white/75">Remind them to use their remaining services</p>
              </div>
              <button onClick={() => { setShowExpiryModal(false); sessionStorage.setItem('pkg_expiry_popup_dismissed', 'true'); }}
                className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/90 text-slate-700 flex items-center justify-center font-bold">✕</button>
            </div>

            <div className="overflow-y-auto p-3 space-y-2.5">
              {expiryAlerts.map((item: any) => {
                const vehicleInfo = item.registration_no ? `${item.registration_no} (${item.brand || ''} ${item.model || ''})` : `${item.brand || ''} ${item.model || ''}`.trim() || 'their car';
                const defaultMsg = `Hi ${item.customer_name},\n\nYour *${item.package_name}* package for *${vehicleInfo}* expires on *${new Date(item.end_date).toLocaleDateString('en-IN')}* (${item.days_remaining} day(s) left).\n\nPlease visit O3 Car Spaa to use your remaining services!\n📍 O3 Car Spaa, GIDC, Anand\n📞 7225030303`;
                const urgent = Number(item.days_remaining) <= 7;
                const times = Number(item.reminder_count) || (item.last_reminder_at ? 1 : 0);
                return (
                  <div key={item.user_package_id} className="rounded-2xl border border-slate-100 bg-white shadow-sm p-3">
                    <div className="flex gap-3">
                      <img src={carImage({ brand: item.brand, model: item.model, category: item.vehicle_category || item.category })} alt="" className="w-20 h-14 object-contain shrink-0" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-extrabold text-[14px] text-slate-900 truncate">{item.customer_name}</p>
                          <span className={`shrink-0 text-[10.5px] font-black px-2 py-0.5 rounded-full ${urgent ? 'bg-rose-50 text-rose-600' : 'bg-amber-50 text-amber-700'}`}>{item.days_remaining}d left</span>
                        </div>
                        <p className="text-[12px] text-slate-600 truncate">{item.package_name}</p>
                        <p className="text-[11px] text-slate-400 truncate">{item.registration_no || ''} · expires {new Date(item.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</p>
                      </div>
                    </div>
                    <div className="flex items-center justify-between gap-2 mt-2.5">
                      <span className={`text-[11px] font-semibold ${times ? 'text-emerald-700' : 'text-slate-400'}`}>{times ? `Reminded ${times === 1 ? 'once' : times === 2 ? 'twice' : `${times} times`}` : 'Not reminded yet'}</span>
                      <button type="button" disabled={sendingPkgId === item.user_package_id} onClick={() => handleSendExpiryWhatsApp(item, defaultMsg)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white font-bold rounded-xl flex items-center gap-1.5 text-xs">
                        {sendingPkgId === item.user_package_id ? <Loader2 size={14} className="animate-spin" /> : <MessageCircle size={14} />}
                        {sendingPkgId === item.user_package_id ? 'Sending…' : times ? 'Remind again' : 'WhatsApp remind'}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="shrink-0 px-4 py-3 border-t border-slate-100 flex items-center justify-between gap-2">
              <Link to="/admin/package-alerts" onClick={() => setShowExpiryModal(false)} className="text-xs font-bold text-[#2563EB]">Open all reminders →</Link>
              <button onClick={() => { setShowExpiryModal(false); sessionStorage.setItem('pkg_expiry_popup_dismissed', 'true'); }}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-xs">Later</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

