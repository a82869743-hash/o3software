import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { 
  Calendar, Clock, Car, Sparkles, Gift, ArrowRight, ChevronRight,
  Shield, CalendarCheck, Wrench, Plus, Package
} from 'lucide-react';
import { useCustomerDashboard } from '../../api/hooks/useDashboard';
import { useAuthStore } from '../../store/authStore';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import ErrorState from '../../components/shared/ErrorState';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import { formatINR, formatDate, formatTime } from '../../utils/formatters';
import AddCarModal from '../../components/shared/AddCarModal';

export default function CustomerDashboardPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();
  const { data, isLoading, isError, refetch } = useCustomerDashboard();
  const [showAddCar, setShowAddCar] = useState(false);

  const firstName = user?.name?.split(' ')[0] || 'there';
  const hour = new Date().getHours();
  const greeting = hour < 12 ? 'Good Morning' : hour < 17 ? 'Good Afternoon' : 'Good Evening';

  if (isError) {
    return (
      <div className="pt-4">
        <ErrorState
          message="Failed to load dashboard. Please check your connection and try again."
          onRetry={() => refetch()}
        />
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="pt-4 space-y-6">
        <div className="h-48 bg-slate-100 animate-pulse rounded-2xl" />
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">{[1,2,3].map(i => <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-2xl" />)}</div>
        <div className="h-64 bg-slate-100 animate-pulse rounded-2xl" />
      </div>
    );
  }

  const loyalty = data?.loyalty || { credits: 0, free_washes: 0, wax_count: 0 };
  const vehicles = data?.vehicles || [];
  const upcomingBookings = data?.upcoming_bookings || [];
  const recentJobs = data?.recent_jobs || [];
  const totalVisits = data?.total_visits || 0;
  const primaryCar = data?.primary_car || (vehicles.length > 0 ? vehicles[0] : null);
  const activePackage = data?.active_package || null;
  const activePackages = data?.active_packages || (activePackage ? [activePackage] : []);

  return (
    <div className="pt-2 space-y-6">
      {/* ── 50% OFF First Wash Banner ─────────── */}
      {data?.first_wash_eligible && (
        <div className="bg-[#2563EB] rounded-2xl p-5 text-white shadow-md relative overflow-hidden">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 relative z-10">
            <div className="flex items-center gap-3">
              <div className="p-3 bg-white/20 rounded-xl shrink-0">
                <Sparkles size={22} className="text-white" />
              </div>
              <div>
                <span className="px-2 py-0.5 bg-white text-[#2563EB] text-[10px] font-extrabold uppercase tracking-widest rounded-full">
                  Welcome Offer
                </span>
                <h3 className="text-lg font-extrabold text-white mt-1">
                  Get 50% OFF Your First Wash! 🎉
                </h3>
                <p className="text-xs text-blue-100 font-medium mt-0.5">
                  Discount auto-applied on your first detailing booking.
                </p>
              </div>
            </div>
            <Link
              to="/customer/bookings/new"
              className="px-5 py-2.5 bg-white text-[#2563EB] hover:bg-blue-50 font-extrabold text-xs rounded-xl shadow-sm transition-all shrink-0 flex items-center gap-1.5"
            >
              Book @ 50% OFF <ArrowRight size={14} />
            </Link>
          </div>
        </div>
      )}

      {/* ── Continuous Notification Banner (Service due / Package close to expiry) ─────────── */}
      {activePackage?.days_remaining !== null && activePackage?.days_remaining <= 30 && (
        <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-red-500 rounded-2xl p-4 text-white shadow-md flex items-center justify-between gap-3 border border-amber-400">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-white/20 flex items-center justify-center text-white shrink-0 font-bold">
              <Package size={20} />
            </div>
            <div>
              <span className="text-[10px] font-black tracking-widest uppercase bg-white/20 px-2 py-0.5 rounded-full text-amber-100">
                Notice: Service Due
              </span>
              <p className="text-sm font-extrabold text-white mt-0.5">
                Service is due package close to expiry ({activePackage.days_remaining > 0 ? `${activePackage.days_remaining} days left` : 'Expiring / Due'})
              </p>
              <p className="text-xs text-amber-100 font-medium">
                Package: <strong>{activePackage.package_name}</strong> • Redeem your remaining detailing services at O3 Car Spa
              </p>
            </div>
          </div>
          <Link
            to="/customer/bookings/new"
            className="px-4 py-2 bg-white text-slate-900 hover:bg-amber-50 font-extrabold text-xs rounded-xl shadow-xs transition-all shrink-0 whitespace-nowrap"
          >
            Book Appointment
          </Link>
        </div>
      )}

      {/* ── Package Expiry Maintenance Reminder Pop-Up Modal (3-Tier Rule: 1 Month, 1 Week, 1 Day) ─────────── */}
      {activePackage?.is_popup_eligible && activePackage?.end_date && (() => {
        const daysLeft = activePackage.days_remaining ?? Math.ceil((new Date(activePackage.end_date).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        const stageLabel = daysLeft <= 1 ? '1 Day Before Reminder' : daysLeft <= 7 ? '1 Week Before Reminder' : '1 Month Before Reminder (11 Months Mark)';
        const [dismissed, setDismissed] = useState(false);

        if (dismissed) return null;

        return (
          <div className="fixed inset-0 bg-black/65 backdrop-blur-md z-50 flex items-center justify-center p-4">
            <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl border border-amber-200 text-center animate-in fade-in zoom-in-95 duration-200 relative">
              <button
                onClick={() => setDismissed(true)}
                className="absolute right-4 top-4 text-gray-400 hover:text-gray-600 text-lg font-bold"
              >
                ✕
              </button>

              <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4 text-amber-600 shadow-sm">
                <Package size={32} />
              </div>

              <span className="text-[10px] font-black uppercase tracking-widest text-amber-700 bg-amber-50 border border-amber-200 px-3 py-1 rounded-full mb-3 inline-block">
                {stageLabel}
              </span>

              <h3 className="text-xl font-black text-slate-900 mb-2">Package Maintenance Reminder</h3>
              
              <div className="text-sm font-semibold text-slate-700 bg-amber-50/90 border border-amber-200 p-4 rounded-2xl mb-5 leading-relaxed text-left space-y-2">
                <p>
                  Your package <strong className="text-amber-950 font-extrabold">{activePackage.package_name}</strong> {activePackage.vehicle_reg_no ? `for vehicle ${activePackage.vehicle_reg_no}` : ''} is about to expire next month ({activePackage.end_date ? new Date(activePackage.end_date).toLocaleDateString('en-IN') : 'soon'}).
                </p>
                <p className="text-xs text-amber-800 font-bold">
                  Kindly visit O3 Car Spa to redeem your remaining service sessions!
                </p>
              </div>

              {activePackage.usage && activePackage.usage.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-4 text-left text-xs">
                  <p className="text-slate-500 font-bold uppercase text-[10px] mb-1.5">Remaining Service Balance:</p>
                  <div className="space-y-1">
                    {activePackage.usage.map((svc: any, idx: number) => (
                      <div key={idx} className="flex justify-between text-slate-700 font-semibold text-[11px]">
                        <span>{svc.service_name}</span>
                        <span className="font-bold text-blue-600">{svc.remaining} / {svc.total_count} left</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activePackage.service_schedules && activePackage.service_schedules.length > 0 && (
                <div className="bg-blue-50/70 border border-blue-200 rounded-xl p-3 mb-4 text-left text-xs">
                  <p className="text-blue-800 font-extrabold uppercase text-[10px] mb-1.5 flex items-center gap-1">
                    📅 Service-Wise Scheduled Dates Breakdown:
                  </p>
                  <div className="space-y-1.5 max-h-36 overflow-y-auto pr-1">
                    {activePackage.service_schedules.map((s: any, idx: number) => (
                      <div key={idx} className="flex justify-between items-center bg-white p-2 rounded-lg border border-blue-100 text-[11px]">
                        <span className="font-bold text-slate-800 truncate max-w-[170px]">{s.service_name} #{s.instance_number}</span>
                        <span className="font-extrabold text-blue-700">{s.scheduled_date_formatted || new Date(s.scheduled_date).toLocaleDateString('en-IN')}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 mb-5 text-left text-xs space-y-1">
                <p className="text-slate-500 font-bold uppercase text-[10px]">Autodate Milestones:</p>
                <div className="grid grid-cols-3 gap-1 text-[11px] font-semibold text-slate-700">
                  <div>1 Month: <span className="text-slate-900">{activePackage.autodate_1month || 'N/A'}</span></div>
                  <div>1 Week: <span className="text-slate-900">{activePackage.autodate_1week || 'N/A'}</span></div>
                  <div>1 Day: <span className="text-slate-900">{activePackage.autodate_1day || 'N/A'}</span></div>
                </div>
              </div>

              <div className="flex gap-3">
                <button
                  onClick={() => setDismissed(true)}
                  className="px-4 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-extrabold text-xs rounded-xl transition-all"
                >
                  Remind Me Later
                </button>
                <button
                  onClick={() => navigate('/customer/bookings/new')}
                  className="flex-1 py-3 bg-[#2563EB] hover:bg-blue-700 text-white font-extrabold text-xs uppercase tracking-wider rounded-xl transition-all shadow-md"
                >
                  Book Appointment Now
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* ── Welcome Hero ─────────────────── */}
      <div className="relative overflow-hidden bg-[#0284C7] rounded-3xl p-6 sm:p-8 shadow-md border border-[#0284C7]">
        {/* Background subtle highlights */}
        <div className="absolute -right-10 -top-10 w-48 h-48 bg-white/10 rounded-full blur-2xl pointer-events-none" />
        <div className="absolute left-1/3 -bottom-10 w-40 h-40 bg-white/5 rounded-full blur-xl pointer-events-none" />


        <div className="relative z-10">
          <p className="text-sky-100 text-xs font-semibold uppercase tracking-wider">{greeting},</p>
          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight mt-1 drop-shadow-xs">
            {firstName} 👋
          </h1>
          <p className="text-sky-100 text-xs font-medium mt-1 mb-6">
            Welcome to O3 Car Spa Detailing Studio
          </p>

          {/* Loyalty Stats */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all rounded-2xl p-3.5 text-center group">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{loyalty.credits || 0}</p>
              <p className="text-[10px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Reward Points</p>
            </div>
            <div className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all rounded-2xl p-3.5 text-center group">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{loyalty.free_washes || 0}</p>
              <p className="text-[10px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Free Washes</p>
            </div>
            <div className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all rounded-2xl p-3.5 text-center group">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{loyalty.wax_count || 0}</p>
              <p className="text-[10px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Wax Treatments</p>
            </div>
            <div className="bg-white hover:bg-slate-50 shadow-md border border-white/90 transition-all rounded-2xl p-3.5 text-center group">
              <p className="text-2xl font-black text-slate-900 tracking-tight">{totalVisits}</p>
              <p className="text-[10px] text-slate-700 font-extrabold uppercase tracking-wider mt-1">Total Visits</p>
            </div>
          </div>
        </div>
      </div>

      {/* ── Quick Actions ────────────────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { to: '/customer/bookings/new', icon: CalendarCheck, label: 'Book Service' },
          { to: '/customer/services', icon: Wrench, label: 'Services' },
          { to: '/customer/loyalty', icon: Gift, label: 'Rewards' },
          { to: '/customer/vehicles', icon: Car, label: 'My Cars' },
        ].map(({ to, icon: Icon, label }) => (
          <Link
            key={to}
            to={to}
            className="bg-white border border-slate-200 rounded-2xl p-4 text-center hover:border-blue-300 hover:shadow-md transition-all group"
          >
            <div className="w-11 h-11 rounded-xl bg-blue-50 flex items-center justify-center mx-auto mb-2 group-hover:bg-blue-100 transition-colors">
              <Icon size={20} className="text-[#2563EB]" />
            </div>
            <p className="text-xs font-bold text-slate-700">{label}</p>
          </Link>
        ))}
      </div>

      {/* ── Primary Car + Active Package ──────────── */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB]">
                <Car size={20} />
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Primary Car</p>
                {primaryCar ? (
                  <p className="font-bold text-slate-900 text-sm">{primaryCar.brand} {primaryCar.model}</p>
                ) : (
                  <p className="text-slate-400 text-sm">No car added</p>
                )}
              </div>
            </div>
            <button
              onClick={() => setShowAddCar(true)}
              className="flex items-center gap-1 px-3 py-1.5 bg-[#2563EB] text-white text-[10px] font-bold uppercase rounded-lg hover:bg-[#1D4ED8] transition-colors"
            >
              <Plus size={12} /> Add Car
            </button>
          </div>
          {primaryCar?.registration_no && (
            <p className="text-xs text-slate-500 ml-[52px]">{primaryCar.registration_no}</p>
          )}
        </div>

        <div className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB]">
              <Package size={20} />
            </div>
            <div>
              <p className="text-[10px] font-bold uppercase tracking-widest text-slate-400">Active Package</p>
              {activePackage ? (
                <p className="font-bold text-slate-900 text-sm">{activePackage.package_name}</p>
              ) : (
                <p className="text-slate-400 text-sm">No active package</p>
              )}
            </div>
          </div>
          {activePackage?.service_schedules && activePackage.service_schedules.length > 0 && (
            <div className="mt-3 pt-3 border-t border-slate-100 space-y-1">
              <p className="text-[9px] font-bold uppercase tracking-wider text-blue-600">📅 Service Schedule Breakdown:</p>
              <div className="max-h-24 overflow-y-auto space-y-1 pr-1">
                {activePackage.service_schedules.map((s: any, idx: number) => (
                  <div key={idx} className="flex justify-between text-[10px] font-semibold text-slate-700 bg-slate-50 px-2 py-1 rounded">
                    <span className="truncate max-w-[130px]">{s.service_name} #{s.instance_number}</span>
                    <span className="font-extrabold text-blue-700">{s.scheduled_date_formatted || new Date(s.scheduled_date).toLocaleDateString('en-IN')}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* ── Upcoming Appointments + My Cars Grid ────────────────────── */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-sm">Upcoming Appointments</h2>
            <Link to="/customer/bookings" className="text-[#2563EB] text-xs font-bold hover:underline flex items-center gap-1">
              All <ChevronRight size={12} />
            </Link>
          </div>
          {upcomingBookings.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {upcomingBookings.map((b: any) => {
                const dateObj = b.slot_date ? new Date(b.slot_date) : null;
                return (
                  <div key={b.id} className="px-5 py-4 hover:bg-slate-50 transition-colors">
                    <div className="flex items-start justify-between">
                      <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-600">
                          <CalendarCheck size={18} />
                        </div>
                        <div>
                          <h4 className="text-sm font-bold text-slate-900">{b.service_name || b.package_name || 'Service Booking'}</h4>
                          <div className="flex items-center gap-3 text-xs text-slate-500 mt-1">
                            {dateObj && (
                              <span className="flex items-center gap-1">
                                <Calendar size={11} />
                                {dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                              </span>
                            )}
                            {b.start_time && (
                              <span className="flex items-center gap-1">
                                <Clock size={11} />
                                {formatTime(b.start_time)}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>
                      <StatusBadge status={b.status} />
                    </div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="p-10 text-center">
              <Calendar size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium mb-3">No upcoming appointments</p>
              <Button onClick={() => navigate('/customer/bookings/new')} icon={<CalendarCheck size={14} />} size="sm">
                Book a Service
              </Button>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-sm">My Vehicles</h2>
            <Link to="/customer/vehicles" className="text-[#2563EB] text-xs font-bold hover:underline flex items-center gap-1">
              All <ChevronRight size={12} />
            </Link>
          </div>
          {vehicles.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {vehicles.slice(0, 4).map((v: any) => (
                <div key={v.id} className="px-5 py-3.5 hover:bg-slate-50 transition-colors flex items-center gap-3">
                  <div className="w-9 h-9 rounded-lg bg-blue-50 flex items-center justify-center text-[#2563EB]">
                    <Car size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold text-sm text-slate-900 truncate">{v.registration_no}</p>
                    <p className="text-xs text-slate-500">{v.brand} {v.model}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="p-8 text-center">
              <Car size={32} className="text-slate-300 mx-auto mb-2" />
              <p className="text-slate-500 text-sm font-medium">No vehicles registered</p>
            </div>
          )}
        </div>
      </div>

      {/* ── Recent Service History ────────────────── */}
      {recentJobs.length > 0 && (
        <div className="bg-white border border-slate-200 rounded-2xl overflow-hidden shadow-sm">
          <div className="px-5 py-4 border-b border-slate-100 flex justify-between items-center">
            <h2 className="font-bold text-slate-900 text-sm">Recent Service History</h2>
            <Link to="/customer/job-carts" className="text-[#2563EB] text-xs font-bold hover:underline flex items-center gap-1">
              View All <ChevronRight size={12} />
            </Link>
          </div>
          <div className="divide-y divide-slate-100">
            {recentJobs.map((job: any) => (
              <div key={job.id} className="px-5 py-4 hover:bg-slate-50 transition-colors flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB] text-xs font-extrabold">
                    V{job.visit_number}
                  </div>
                  <div>
                    <div className="flex items-center gap-2">
                      <h4 className="font-bold text-sm text-slate-900">{job.registration_no}</h4>
                      <StatusBadge status={job.status === 'complete' ? 'completed' : job.status} />
                    </div>
                    <p className="text-xs text-slate-500 mt-0.5">
                      {job.brand} {job.model}
                      {job.visit_date && <span className="text-slate-400 ml-2">• {formatDate(job.visit_date)}</span>}
                    </p>
                  </div>
                </div>
                {job.invoice_number && (
                  <span className="text-[10px] font-bold text-slate-400 bg-slate-50 px-2 py-1 rounded-md border border-slate-100 hidden sm:block">
                    {job.invoice_number}
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <AddCarModal isOpen={showAddCar} onClose={() => setShowAddCar(false)} />
    </div>
  );
}
