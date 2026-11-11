import { formatDuration, ymd, dateOnly } from '../../utils/formatters';
import { useState, useEffect } from 'react';
import { Calendar, Clock, ArrowRight, CalendarPlus, Car, Sparkles, X, Loader2, CreditCard, QrCode } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import EmptyState from '../../components/shared/EmptyState';
import ErrorState from '../../components/shared/ErrorState';
import Button from '../../components/ui/Button';
import { useBookings, useCancelBooking, useChangeBookingServices } from '../../api/hooks/useBookings';
import { useServices } from '../../api/hooks/useServices';
import { useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { formatTime } from '../../utils/formatters';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import QrPaymentModal from '../../components/shared/QrPaymentModal';
import Modal from '../../components/ui/Modal';
import { carImage } from '../../utils/carImage';
import { photoFor, PHOTOS } from '../../components/customer/serviceVisuals';
import { normalizeCarType } from '../../utils/carTypes';
import MyPackages from '../../components/customer/MyPackages';
import CustomerJobCartsPage from './JobCartsPage';
import { API_BASE } from '../../utils/endpoints';

const STATUS: Record<string, { label: string; cls: string }> = {
  pending_approval: { label: 'Waiting for studio', cls: 'bg-amber-50 text-amber-700' },
  pending_payment: { label: 'Payment due', cls: 'bg-orange-50 text-orange-700' },
  confirmed: { label: 'Confirmed', cls: 'bg-emerald-50 text-emerald-700' },
  in_progress: { label: 'In the studio', cls: 'bg-blue-50 text-blue-700' },
  completed: { label: 'Completed', cls: 'bg-slate-100 text-slate-700' },
  delivered: { label: 'Delivered', cls: 'bg-slate-100 text-slate-700' },
  cancelled: { label: 'Cancelled', cls: 'bg-rose-50 text-rose-600' },
  rejected: { label: 'Declined', cls: 'bg-rose-50 text-rose-600' },
};

const priceFor = (s: any, cat?: string) => Number(s[`price_${normalizeCarType(cat) || 'sedan'}`] || s.price_sedan || 0);

function BookingCountdown({ expiresAt, onExpire }: { expiresAt: string; onExpire: () => void }) {
  const [timeLeft, setTimeLeft] = useState<string>('');

  useEffect(() => {
    const calculateTime = () => {
      const difference = new Date(expiresAt).getTime() - new Date().getTime();
      if (difference <= 0) {
        setTimeLeft('Expired');
        onExpire();
        return false;
      }
      const minutes = Math.floor((difference % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((difference % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
      return true;
    };

    calculateTime();
    const interval = setInterval(() => {
      const active = calculateTime();
      if (!active) clearInterval(interval);
    }, 1000);

    return () => clearInterval(interval);
  }, [expiresAt, onExpire]);

  return (
    <span className="text-[10px] sm:text-xs font-bold text-blue-600 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg animate-pulse whitespace-nowrap">
      ⏳ Pay in {timeLeft}
    </span>
  );
}

export default function BookingsPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);
  const [page, setPage] = useState(1);
  const { data, isLoading, isError, refetch } = useBookings({ page, limit: 20 });
  const cancelMut = useCancelBooking();
  const changeServicesMut = useChangeBookingServices();
  const { data: servicesRes } = useServices({ active_only: true, for_app: true });

  const [changeTargetBooking, setChangeTargetBooking] = useState<any>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

  const [choiceBookingData, setChoiceBookingData] = useState<any>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [tab, setTab] = useState<'upcoming' | 'past'>('upcoming');
  // My bookings = visits booked (upcoming / past). My services = packages left + work done on my cars (job cards, invoices).
  const [section, setSection] = useState<'bookings' | 'services'>(() => (new URLSearchParams(window.location.search).get('section') === 'services' ? 'services' : 'bookings'));
  const allBookings: any[] = data?.data || [];
  const todayStr = ymd();
  const isUpcoming = (b: any) => ['pending_payment', 'pending_approval', 'confirmed', 'in_progress'].includes(b.status)
    && (!b.slot_date || dateOnly(b.slot_date) >= todayStr || b.status === 'in_progress');
  const upcoming = allBookings.filter(isUpcoming).sort((a, b) => String(a.slot_date).localeCompare(String(b.slot_date)));
  const past = allBookings.filter(b => !isUpcoming(b));
  const bookings = tab === 'upcoming' ? upcoming : past;
  const pagination = data?.pagination;
  const services = servicesRes?.data || [];

  // Quick wash bill (own finished wash only)
  const downloadQwInvoice = async (id: number) => {
    try {
      const r = await api.get(`/quick-wash/${id}/invoice`, { responseType: 'blob' });
      const url = URL.createObjectURL(r.data);
      const link = document.createElement('a');
      link.href = url; link.download = `Quick-wash-${id}.pdf`; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch {
      toast('error', 'Invoice not available yet');
    }
  };

  const handleCancel = async (id: number) => {
    if (!confirm('Are you sure you want to cancel this booking?')) return;
    try {
      await cancelMut.mutateAsync(id);
      toast('success', 'Booking cancelled');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to cancel');
    }
  };

  const handleUpdateServices = async () => {
    if (selectedServiceIds.length === 0) {
      toast('error', 'Select at least one service');
      return;
    }
    try {
      await changeServicesMut.mutateAsync({
        id: changeTargetBooking.id,
        service_ids: selectedServiceIds,
      });
      toast('success', 'Booking services updated');
      setChangeTargetBooking(null);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update services');
    }
  };

  const sectionSwitch = (
    <div className="flex bg-slate-100 rounded-xl p-1 mb-3">
      {([['bookings', 'My bookings'], ['services', 'My services']] as const).map(([k, label]) => (
        <button key={k} onClick={() => setSection(k)}
          className={`flex-1 py-2 rounded-lg text-[13px] font-extrabold transition ${section === k ? 'bg-white text-slate-900 shadow' : 'text-slate-500'}`}>{label}</button>
      ))}
    </div>
  );

  if (section === 'services') {
    return (
      <>
        {sectionSwitch}
        <p className="text-xs text-slate-500 mb-3">Your packages (what is left) and every service done on your cars, with invoices.</p>
        <div className="mb-4"><MyPackages /></div>
        <CustomerJobCartsPage hidePackages />
      </>
    );
  }

  return (
    <>
      {sectionSwitch}
      {/* Upcoming / Past + book button (the page title is already in the top bar) */}
      <div className="flex items-center gap-2 mb-3">
        <div className="flex bg-white rounded-xl p-1 shadow-sm flex-1">
          {([['upcoming', `Upcoming (${upcoming.length})`], ['past', 'Past']] as const).map(([k, label]) => (
            <button key={k} onClick={() => setTab(k)}
              className={`flex-1 py-2 rounded-lg text-[13px] font-bold transition ${tab === k ? 'bg-[#2563EB] text-white shadow' : 'text-slate-500'}`}>{label}</button>
          ))}
        </div>
        <button onClick={() => navigate('/customer/bookings/new')} className="shrink-0 flex items-center gap-1.5 px-3.5 py-2.5 rounded-xl bg-[#0F172A] text-white text-[13px] font-bold">
          <CalendarPlus size={15} /> Book
        </button>
      </div>

      <div className="max-w-4xl">
        {isError ? (
          <ErrorState
            message="Failed to load bookings. Please check your connection and try again."
            onRetry={() => refetch()}
          />
        ) : isLoading ? (
          <div className="flex items-center justify-center py-20">
            <Loader2 size={24} className="animate-spin text-[#2563EB]" />
          </div>
        ) : !bookings.length ? (
          <EmptyState
            icon={Calendar}
            title={tab === 'upcoming' ? 'Nothing booked yet' : 'No past bookings'}
            description={tab === 'upcoming' ? 'Book your next wash or detailing in a few taps.' : 'Your completed and cancelled bookings will show here.'}
            actionLabel={tab === 'upcoming' ? 'Book now' : undefined}
            onAction={tab === 'upcoming' ? () => navigate('/customer/bookings/new') : undefined}
          />
        ) : (
          <>
            <div className="grid gap-3">
              {bookings.map((b: any, idx: number) => {
                const dateObj = b.slot_date ? new Date(`${dateOnly(b.slot_date)}T00:00:00`) : null;
                const isPast = dateObj ? ymd(dateObj) < ymd() : false;
                let hoursRemaining = 0;
                if (dateObj && b.start_time && !isPast) {
                  const slotDateTime = new Date(`${ymd(dateObj)}T${b.start_time}`);
                  hoursRemaining = (slotDateTime.getTime() - Date.now()) / 36e5;
                }
                // services can be added/removed only until the studio confirms (not for package bookings)
                const canEdit = b.status === 'pending_approval' && !b.user_package_id && hoursRemaining >= 24;
                const title = b.service_names || b.service_name || b.package_service_name || b.package_name || 'Service booking';
                const art = photoFor(title) || PHOTOS.wash;
                const st = STATUS[b.status] || { label: String(b.status || '').replace(/_/g, ' '), cls: 'bg-slate-100 text-slate-700' };
                const brand = b.vehicle_brand || b.linked_vehicle_brand;
                const model = b.vehicle_model || b.linked_vehicle_model;
                const qwDone = b.job_type === 'quick_wash' && ['completed', 'delivered'].includes(b.status);
                const jobDue = Number(b.job_balance_due) > 0 && b.job_payment_status !== 'paid' ? Number(b.job_balance_due) : 0;
                const jobDone = b.job_cart_status === 'complete';
                const step = b.delivery_status === 'delivered' ? 'Delivered to you'
                  : b.delivery_status === 'in_transit' ? 'Out for delivery'
                  : b.delivery_status === 'assigned' ? 'Ready — delivery being arranged'
                  : jobDone ? 'Work done — ready'
                  : b.job_cart_id ? (b.job_stage || 'Work started') : '';
                const showBar = qwDone || !!b.job_cart_id || b.pickup_status || Number(b.total_amount) > 0 || canEdit || b.status === 'pending_payment' || (['confirmed', 'pending_approval'].includes(b.status) && !isPast);
                return (
                  <div key={b.id}
                    onClick={() => { if (b.status === 'pending_payment') setChoiceBookingData(b); }}
                    className={`rise bg-white rounded-2xl shadow-[0_4px_18px_rgba(15,23,42,0.06)] border overflow-hidden ${b.status === 'pending_payment' ? 'border-amber-200 cursor-pointer' : 'border-slate-100'} ${b.status === 'cancelled' ? 'opacity-60' : ''}`}
                    style={{ animationDelay: `${idx * 40}ms` }}>
                    <div className="flex gap-3 p-3">
                      <img src={art} alt="" loading="lazy"
                        className="w-[72px] h-[72px] rounded-xl shrink-0 object-cover" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <h3 className={`font-extrabold text-[15px] leading-snug text-slate-900 line-clamp-2 ${b.status === 'cancelled' ? 'line-through' : ''}`}>{title}</h3>
                          <span className={`shrink-0 px-2 py-0.5 rounded-full text-[10.5px] font-bold ${st.cls}`}>{st.label}</span>
                        </div>
                        <p className="flex items-center gap-1.5 text-[12px] text-slate-500 font-semibold mt-1">
                          <Calendar size={12} />{dateObj ? dateObj.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }) : '—'}
                          {b.start_time && <><Clock size={12} className="ml-1" />{formatTime(b.start_time)}</>}
                        </p>
                        {(brand || model) && (
                          <p className="flex items-center gap-1.5 text-[12px] text-slate-500 mt-1 truncate">
                            <img src={carImage({ brand, model, category: b.vehicle_category })} alt="" className="w-8 h-5 object-contain shrink-0" />
                            {brand} {model}{b.vehicle_reg_no ? ` · ${b.vehicle_reg_no}` : ''}
                          </p>
                        )}
                      </div>
                    </div>
                    {step && (
                      <div className="mx-3 mb-2 px-3 py-2 rounded-xl bg-blue-50 text-[12px] font-bold text-blue-800 flex items-center justify-between gap-2" onClick={e => e.stopPropagation()}>
                        <span>Status: {step}{jobDue ? ` · Due ₹${jobDue.toLocaleString('en-IN')}` : jobDone && b.job_payment_status === 'paid' ? ' · Paid' : ''}</span>
                        {b.job_public_token && b.delivery_status !== 'delivered' && (
                          <button onClick={() => navigate(`/job/${b.job_public_token}`)} className="px-2.5 py-1 bg-blue-600 text-white rounded-lg text-[11px]">Track live</button>
                        )}
                      </div>
                    )}
                    {showBar && (
                      <div className="flex items-center gap-2 px-3 py-2.5 border-t border-slate-100 bg-slate-50/60" onClick={e => e.stopPropagation()}>
                        {Number(b.total_amount) > 0 && <span className="text-[13px] font-black text-slate-900">₹{Number(b.total_amount).toLocaleString('en-IN')}</span>}
                        {b.offer_code && Number(b.discount_amount) > 0 && <span className="text-[11px] font-bold text-emerald-700 bg-emerald-50 px-1.5 py-0.5 rounded">{b.offer_code} −₹{Number(b.discount_amount).toLocaleString('en-IN')}</span>}
                        {b.pickup_status && <span className="text-[11px] font-semibold text-slate-500 truncate">· Pickup {b.pickup_status === 'picked_up' ? 'done' : b.pickup_status}</span>}
                        <span className="ml-auto flex items-center gap-1.5">
                          {b.status === 'pending_payment' && (
                            <>
                              {b.expires_at && <BookingCountdown expiresAt={b.expires_at} onExpire={refetch} />}
                              <button onClick={() => setChoiceBookingData(b)} className="px-3 py-1.5 bg-amber-500 text-white font-bold rounded-lg text-xs">Pay now</button>
                            </>
                          )}
                          {canEdit && (
                            <button onClick={() => { setChangeTargetBooking(b); setSelectedServiceIds(String(b.service_ids_csv || b.service_id || '').split(',').map(Number).filter(Boolean)); }}
                              className="px-3 py-1.5 bg-white border border-blue-200 text-[#2563EB] font-bold rounded-lg text-xs">Edit services</button>
                          )}
                          {jobDone && b.job_cart_id && (
                            <button onClick={() => window.open(`${API_BASE}/job-carts/${b.job_cart_id}/invoice?token=${useAuthStore.getState().token}`, '_blank')}
                              className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-xs">Invoice</button>
                          )}
                          {jobDue > 0 && (
                            <button onClick={() => window.open(`${API_BASE}/job-carts/${b.job_cart_id}/invoice?token=${useAuthStore.getState().token}`, '_blank')}
                              title="The invoice has a UPI QR for the amount due"
                              className="px-3 py-1.5 bg-amber-500 text-white font-bold rounded-lg text-xs">Pay ₹{jobDue.toLocaleString('en-IN')}</button>
                          )}
                          {qwDone && (
                            <button onClick={() => downloadQwInvoice(b.id)} className="px-3 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg text-xs">Invoice</button>
                          )}
                          {['confirmed', 'pending_approval'].includes(b.status) && !isPast && (
                            <button onClick={() => handleCancel(b.id)} className="px-2.5 py-1.5 text-rose-600 font-bold rounded-lg text-xs hover:bg-rose-50">Cancel</button>
                          )}
                        </span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Pagination */}
            {pagination && pagination.total > pagination.limit && (
              <div className="flex items-center justify-center gap-2 mt-6">
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page <= 1}
                  onClick={() => setPage(page - 1)}
                >
                  Previous
                </Button>
                <span className="text-xs text-[#64748B] font-medium">
                  Page {page} of {Math.ceil(pagination.total / pagination.limit)}
                </span>
                <Button
                  variant="ghost"
                  size="sm"
                  disabled={page >= Math.ceil(pagination.total / pagination.limit)}
                  onClick={() => setPage(page + 1)}
                >
                  Next
                </Button>
              </div>
            )}
          </>
        )}
      </div>

      {/* Service Update Modal */}
      {changeTargetBooking && (
        <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center sm:p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setChangeTargetBooking(null)} />
          <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center text-white">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-bold text-[#0F172A]">Edit services</h3>
              </div>
              <button onClick={() => setChangeTargetBooking(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              <p className="text-xs text-[#64748B] font-medium mb-4">
                Add or remove services. Prices are for your {changeTargetBooking.vehicle_model || 'car'} — you can change this until the studio confirms.
              </p>
              {services.map((s: any) => {
                const isChecked = selectedServiceIds.includes(s.id);
                return (
                  <label
                    key={s.id}
                    className={`flex items-center justify-between p-3.5 rounded-xl border-2 cursor-pointer transition-all duration-200 ${
                      isChecked
                        ? 'border-[#2563EB] bg-blue-50/5'
                        : 'border-gray-100 hover:border-gray-200 bg-white'
                    }`}
                  >
                    <div className="flex items-start gap-3">
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={() => {
                          if (isChecked) {
                            setSelectedServiceIds(selectedServiceIds.filter(id => id !== s.id));
                          } else {
                            setSelectedServiceIds([...selectedServiceIds, s.id]);
                          }
                        }}
                        className="mt-1 accent-[#2563EB] h-4 w-4 rounded text-[#2563EB] border-gray-300 focus:ring-[#2563EB]"
                      />
                      <div>
                        <div className="font-bold text-[#0F172A] text-sm">{s.name}</div>
                        {s.show_duration !== 0 && s.duration_minutes > 0 && <div className="text-xs text-[#64748B] mt-0.5">approx. {formatDuration(s.duration_minutes)}</div>}
                      </div>
                    </div>
                    <div className="font-black text-sm text-[#0F172A]">
                      ₹{priceFor(s, changeTargetBooking.vehicle_category).toLocaleString('en-IN')}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
              <span className="mr-auto text-sm font-black text-slate-900">Total ₹{services.filter((s: any) => selectedServiceIds.includes(s.id)).reduce((t: number, s: any) => t + priceFor(s, changeTargetBooking.vehicle_category), 0).toLocaleString('en-IN')}</span>
              <Button variant="ghost" onClick={() => setChangeTargetBooking(null)}>
                Cancel
              </Button>
              <Button
                loading={changeServicesMut.isPending}
                onClick={handleUpdateServices}
                disabled={selectedServiceIds.length === 0}
              >
                Update Services
              </Button>
            </div>
          </div>
        </div>
      )}

      {showQrModal && (
        <QrPaymentModal
          open={showQrModal}
          onClose={() => {
            setShowQrModal(false);
            toast('warning', 'Payment cancelled. Your booking slot is reserved for 10 minutes.');
          }}
          amount={qrAmount}
          bookingId={activeBookingId || undefined}
          onSuccess={() => {
            setShowQrModal(false);
            toast('success', 'Your QR Payment confirmation request has been submitted for admin verification.');
            refetch();
          }}
        />
      )}

      {choiceBookingData && (
        <Modal 
          open={!!choiceBookingData} 
          onClose={() => setChoiceBookingData(null)} 
          title="Advance Payment via UPI QR"
          size="sm"
        >
          <div className="flex flex-col gap-3 py-2 text-center">
            <p className="text-sm text-slate-600 mb-2">
              An advance payment of <span className="font-extrabold text-[#0284C7]">₹{choiceBookingData.advance_amount}</span> is required to reserve your slot.
            </p>
            <button
              onClick={() => {
                setQrAmount(choiceBookingData.advance_amount);
                setActiveBookingId(choiceBookingData.id);
                setShowQrModal(true);
                setChoiceBookingData(null);
              }}
              className="w-full py-3.5 px-4 bg-[#0284C7] hover:bg-[#0369A1] text-white rounded-xl font-extrabold text-sm shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <QrCode size={18} />
              Scan & Pay via UPI QR
            </button>
            <button
              onClick={() => setChoiceBookingData(null)}
              className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </>
  );
}
