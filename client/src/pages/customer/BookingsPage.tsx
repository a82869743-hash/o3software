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
  const { data: servicesRes } = useServices({ active_only: true });

  const [changeTargetBooking, setChangeTargetBooking] = useState<any>(null);
  const [selectedServiceIds, setSelectedServiceIds] = useState<number[]>([]);

  const [choiceBookingData, setChoiceBookingData] = useState<any>(null);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [activeBookingId, setActiveBookingId] = useState<number | null>(null);
  const [submittingOnline, setSubmittingOnline] = useState(false);

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayOnline = async (bookingId: number, advanceAmt: number) => {
    setSubmittingOnline(true);
    try {
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) {
        toast('error', 'Razorpay SDK failed to load. Are you online?');
        setSubmittingOnline(false);
        return;
      }

      const resOrder = await api.post('/payments/razorpay/order', {
        amount: advanceAmt,
        booking_id: bookingId
      });

      if (!resOrder.data.success) {
        throw new Error(resOrder.data.error || 'Failed to create payment order');
      }

      const orderData = resOrder.data.data;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_123',
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'O3 Car Spa',
        description: `Booking Advance Payment (Booking #${bookingId})`,
        order_id: orderData.id,
        prefill: {
          name: useAuthStore.getState().user?.name || '',
          email: useAuthStore.getState().user?.email || '',
          contact: useAuthStore.getState().user?.mobile || ''
        },
        handler: async function (response: any) {
          try {
            await api.post('/payments/razorpay/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });
            toast('success', 'Payment successful! Your booking is now pending approval.');
            setChoiceBookingData(null);
            refetch();
          } catch (err: any) {
            console.error(err);
            toast('error', err.response?.data?.error || 'Payment verification failed');
          }
        },
        modal: {
          ondismiss: function () {
            toast('warning', 'Razorpay checkout dismissed.');
          }
        },
        theme: { color: '#2563EB' }
      };

      if (orderData.id.startsWith('order_mock_')) {
        const confirmSimulate = window.confirm(
          "RAZORPAY SANDBOX MODE (Keys Missing)\n\nWould you like to simulate a successful online payment?"
        );
        if (confirmSimulate) {
          await options.handler({
            razorpay_order_id: orderData.id,
            razorpay_payment_id: 'pay_mock_' + Date.now(),
            razorpay_signature: 'sig_mock_' + Date.now()
          });
        } else {
          options.modal.ondismiss();
        }
        return;
      }

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('RAZORPAY ERROR:', err);
      toast('error', err.message || 'An error occurred during Razorpay checkout.');
    } finally {
      setSubmittingOnline(false);
    }
  };

  const bookings = data?.data || [];
  const pagination = data?.pagination;
  const services = servicesRes?.data || [];

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

  return (
    <>
      <AdminTopBar
        title="My Bookings"
        subtitle="Your upcoming appointments"
        actions={
          <Button icon={<CalendarPlus size={16} />} onClick={() => navigate('/customer/bookings/new')}>
            Book Service
          </Button>
        }
      />

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
            title="No Bookings Yet"
            description="You don't have any service appointments. Book one now!"
            actionLabel="Book Now"
            onAction={() => navigate('/customer/bookings/new')}
          />
        ) : (
          <>
            <div className="grid gap-4">
              {bookings.map((b: any, idx: number) => {
                const dateObj = b.slot_date ? new Date(b.slot_date) : null;
                const isPast = dateObj ? dateObj < new Date(new Date().toISOString().split('T')[0]) : false;

                // Calculate if can change service (must be >= 24h away)
                let canChange = false;
                let hoursRemaining = 0;
                if (dateObj && b.start_time && !isPast) {
                  const slotDateStr = dateObj.toISOString().split('T')[0];
                  const slotDateTime = new Date(`${slotDateStr}T${b.start_time}`);
                  const now = new Date();
                  const diffMs = slotDateTime.getTime() - now.getTime();
                  hoursRemaining = diffMs / (1000 * 60 * 60);
                  canChange = hoursRemaining >= 24;
                }

                return (
                  <div
                    key={b.id}
                    onClick={() => {
                      if (b.status === 'pending_payment') {
                        setChoiceBookingData(b);
                      }
                    }}
                    className={`bg-white p-6 rounded-xl border shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4 group card-premium opacity-0 animate-fade-in-up transition-all ${
                      b.status === 'cancelled' ? 'border-blue-100 bg-blue-50/20' : 
                      b.status === 'pending_payment' ? 'border-amber-200 bg-amber-50/5 hover:border-amber-400 cursor-pointer hover:shadow-md' :
                      'border-gray-100'
                    }`}
                    style={{ animationDelay: `${idx * 0.05}s`, animationFillMode: 'forwards' }}
                  >
                    <div className="flex items-center gap-4">
                      <div className={`w-12 h-12 rounded-xl flex items-center justify-center transition-shadow ${
                        b.status === 'cancelled'
                          ? 'bg-gradient-to-br from-gray-50 to-gray-100 text-gray-400'
                          : 'bg-gradient-to-br from-blue-50 to-blue-100 text-[#2563EB] group-hover:shadow-blue-glow'
                      }`}>
                        <Calendar size={24} />
                      </div>
                      <div>
                        <h3 className={`font-bold text-lg transition-colors ${
                          b.status === 'cancelled' ? 'text-gray-400 line-through' : 'text-[#0F172A] group-hover:text-[#2563EB]'
                        }`}>
                          {b.service_name || b.package_name || 'Service Booking'}
                        </h3>
                        <div className="flex items-center gap-3 text-sm text-[#5f5e5e] mt-1 font-medium flex-wrap">
                          {dateObj && (
                            <span className="flex items-center gap-1">
                              <Calendar size={14} />
                              {dateObj.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                            </span>
                          )}
                          {b.start_time && (
                            <span className="flex items-center gap-1">
                              <Clock size={14} />
                              {formatTime(b.start_time)} – {formatTime(b.end_time)}
                            </span>
                          )}
                        </div>
                        {(b.vehicle_brand || b.vehicle_model) && (
                          <div className="flex items-center gap-1.5 text-xs text-[#5f5e5e] mt-1.5">
                            <Car size={12} className="text-[#2563EB]" />
                            <span>{b.vehicle_brand} {b.vehicle_model} {b.vehicle_reg_no ? `(${b.vehicle_reg_no})` : ''}</span>
                          </div>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center justify-between md:justify-end gap-3 w-full md:w-auto mt-4 md:mt-0 pt-4 md:pt-0 border-t md:border-0 border-gray-100">
                      {b.pickup_status && (
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                          b.pickup_status === 'pending' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          b.pickup_status === 'assigned' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          b.pickup_status === 'picked_up' ? 'bg-emerald-50 text-emerald-700 border-emerald-200' :
                          'bg-gray-50 text-gray-700 border-gray-200'
                        }`}>
                          📍 Pickup: {b.pickup_status === 'picked_up' ? 'Picked Up' : b.pickup_status}
                        </span>
                      )}
                      {b.status === 'pending_payment' ? (
                        <div className="flex items-center gap-2 flex-wrap" onClick={(e) => e.stopPropagation()}>
                          {b.expires_at && (
                            <BookingCountdown expiresAt={b.expires_at} onExpire={refetch} />
                          )}
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              setChoiceBookingData(b);
                            }}
                            className="px-3.5 py-1.5 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-600 hover:to-orange-700 text-white font-extrabold rounded-lg text-xs shadow-md shadow-amber-500/10 transition-all flex items-center gap-1 shrink-0"
                          >
                            Pay Now
                          </button>
                        </div>
                      ) : (
                        <span className={`px-3 py-1 rounded-lg text-xs font-bold uppercase tracking-wider border ${
                          b.status === 'confirmed' ? 'bg-green-50 text-green-700 border-green-200' :
                          b.status === 'completed' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                          b.status === 'pending_approval' ? 'bg-amber-50 text-amber-700 border-amber-200' :
                          'bg-blue-50 text-blue-700 border-blue-200'
                        }`}>
                          {b.status === 'pending_approval' ? 'Pending Approval' : b.status}
                        </span>
                      )}
                      {['confirmed', 'pending_approval'].includes(b.status) && canChange && (
                        <button
                          onClick={() => setChangeTargetBooking(b)}
                          className="px-3 py-1.5 bg-blue-50 border border-blue-200 text-blue-700 font-bold rounded-lg text-xs hover:bg-blue-100 transition-all"
                        >
                          Change Service
                        </button>
                      )}
                      {b.status === 'confirmed' && !isPast && (
                        <button
                          onClick={() => handleCancel(b.id)}
                          className="text-blue-500 hover:text-blue-700 transition p-2 rounded-full hover:bg-blue-50 text-xs font-bold"
                          title="Cancel Booking"
                        >
                          <X size={18} />
                        </button>
                      )}
                    </div>
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
                <span className="text-xs text-[#5f5e5e] font-medium">
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
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={() => setChangeTargetBooking(null)} />
          <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
            {/* Header */}
            <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center text-white">
                  <Sparkles size={16} />
                </div>
                <h3 className="font-bold text-[#0F172A]">Change Booking Services</h3>
              </div>
              <button onClick={() => setChangeTargetBooking(null)} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
                <X size={16} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6 max-h-[60vh] overflow-y-auto space-y-3">
              <p className="text-xs text-[#5f5e5e] font-medium mb-4">
                Choose the services you would like to swap for Booking #{changeTargetBooking.id}.
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
                        <div className="text-xs text-[#5f5e5e] mt-0.5">{s.duration_minutes} min</div>
                      </div>
                    </div>
                    <div className="font-black text-sm text-[#0F172A]">
                      ₹{s.price_sedan || s.price_hatchback || s.price_suv}
                    </div>
                  </label>
                );
              })}
            </div>

            {/* Footer */}
            <div className="px-6 py-4 bg-gray-50 border-t border-gray-100 flex items-center justify-end gap-3">
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
