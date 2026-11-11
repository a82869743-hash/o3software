import { carBrands, getModelsForBrand, getCategoryForModel } from '../../utils/carData';
import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  Search, Calendar, Clock, Car, Phone, User, FileText,
  ChevronLeft, ChevronRight, Loader2, X, Eye, History, Plus, Download
} from 'lucide-react';
import { useBookings, useVehicleHistory, useCreateManualBooking } from '../../api/hooks/useBookings';
import { useServices } from '../../api/hooks/useServices';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import StatusBadge from '../../components/ui/StatusBadge';
import Modal from '../../components/ui/Modal';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { formatTime, ymd } from '../../utils/formatters';
import api from '../../api/axiosInstance';
import ConfirmModal from '../../components/ui/ConfirmModal';
import toast from 'react-hot-toast';
import io from 'socket.io-client';
import { useAuthStore } from '../../store/authStore';
import { socketUrl } from '../../utils/endpoints';
import Dropdown from '../../components/ui/Dropdown';
import { API_BASE } from '../../utils/endpoints';

const TABS = [
  // a booking stays visible as it moves on: awaiting payment counts as pending, work started counts as confirmed
  { key: 'pending_approval,pending_payment', label: 'Pending Approvals', color: 'bg-yellow-500' },
  { key: 'confirmed,in_progress', label: 'Confirmed / In progress', color: 'bg-green-500' },
  { key: 'all', label: 'All', color: 'bg-gray-500' },
  { key: 'completed', label: 'Completed', color: 'bg-blue-500' },
  { key: 'cancelled', label: 'Cancelled', color: 'bg-blue-500' },
];

export default function CustomerBookingsPage() {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState('pending_approval,pending_payment');
  const [search, setSearch] = useState('');
  const [searchDebounced, setSearchDebounced] = useState('');
  const [page, setPage] = useState(1);
  const limit = 15;

  const [historyRegNo, setHistoryRegNo] = useState('');
  const [historyOpen, setHistoryOpen] = useState(false);
  const { data: historyData, isLoading: historyLoading } = useVehicleHistory(historyRegNo);

  // Confirmation Modals
  const [confirmType, setConfirmType] = useState<'approve' | 'reject' | null>(null);
  const [confirmTargetId, setConfirmTargetId] = useState<number | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);

  // Manual booking states
  const [manualBookingOpen, setManualBookingOpen] = useState(false);
  const [searchCustomerQuery, setSearchCustomerQuery] = useState('');
  const [customersList, setCustomersList] = useState<any[]>([]);
  const [customerVehicles, setCustomerVehicles] = useState<any[]>([]);
  const [selectedDate, setSelectedDate] = useState(ymd());
  const [availableSlots, setAvailableSlots] = useState<any[]>([]);

  const [manualForm, setManualForm] = useState({
    customer_id: '',
    vehicle_id: '',
    slot_id: '',
    service_id: '',
    notes: '',
    booking_notes: ''
  });

  const { data: servicesRes } = useServices();
  const createManualBooking = useCreateManualBooking();
  // walk-in / phone customer who is not registered yet
  const [newCustOpen, setNewCustOpen] = useState(false);
  const [newCust, setNewCust] = useState({ name: '', mobile: '', brand: '', model: '', reg: '' });

  // Debounce search
  useEffect(() => {
    const timer = setTimeout(() => {
      setSearchDebounced(search);
      setPage(1);
    }, 400);
    return () => clearTimeout(timer);
  }, [search]);

  const { data, isLoading, refetch } = useBookings({
    page,
    limit,
    status: activeTab !== 'all' ? activeTab : undefined,
    search: searchDebounced || undefined,
  });

  // tab counts, so an empty "Pending" tab never hides bookings that were confirmed straight away
  const { data: pendingCount } = useBookings({ page: 1, limit: 1, status: 'pending_approval,pending_payment' });
  const { data: confirmedCount } = useBookings({ page: 1, limit: 1, status: 'confirmed,in_progress' });
  const tabCount: Record<string, number | undefined> = {
    'pending_approval,pending_payment': (pendingCount as any)?.pagination?.total,
    'confirmed,in_progress': (confirmedCount as any)?.pagination?.total,
  };
  const autoTabDone = useRef(false);
  useEffect(() => {
    const pend = tabCount['pending_approval,pending_payment'], conf = tabCount['confirmed,in_progress'];
    if (autoTabDone.current || pend === undefined || conf === undefined) return;
    autoTabDone.current = true;
    if (pend === 0 && conf > 0 && activeTab === 'pending_approval,pending_payment') setActiveTab('confirmed,in_progress');
  }, [tabCount['pending_approval,pending_payment'], tabCount['confirmed,in_progress'], activeTab]); // eslint-disable-line react-hooks/exhaustive-deps

  const { token } = useAuthStore();

  useEffect(() => {
    if (!token) return;
    const socket = io(socketUrl(), {
      auth: { token }
    });

    socket.on('new_booking', () => {
      refetch();
    });

    return () => {
      socket.disconnect();
    };
  }, [token, refetch]);

  const bookings = data?.data || [];
  const pagination = data?.pagination || { page: 1, total: 0, limit };
  const totalPages = Math.ceil(pagination.total / pagination.limit);

  const openVehicleHistory = (regNo: string) => {
    setHistoryRegNo(regNo);
    setHistoryOpen(true);
  };

  const handleAction = async () => {
    if (!confirmTargetId || !confirmType) return;
    setIsConfirming(true);
    try {
      const r = await api.patch(`/bookings/${confirmTargetId}/${confirmType}`);
      toast.success(r.data?.message || `Booking ${confirmType}d successfully`);
      setConfirmType(null);
      setConfirmTargetId(null);
      refetch();
    } catch (err) {
      toast.error((err as any)?.response?.data?.error || `Failed to ${confirmType} booking`);
    } finally {
      setIsConfirming(false);
    }
  };

  // Fetch customers for manual booking modal
  useEffect(() => {
    if (manualBookingOpen) {
      api.get('/customers?limit=250').then((res) => {
        setCustomersList(res.data.data || []);
      }).catch(() => {});
    }
  }, [manualBookingOpen]);

  // Fetch customer vehicles when customer selection changes
  useEffect(() => {
    if (manualForm.customer_id) {
      api.get(`/vehicles/by-customer/${manualForm.customer_id}`).then((res) => {
        setCustomerVehicles(res.data.data || []);
        // Auto-select first vehicle if available
        const vehicles = res.data.data || [];
        if (vehicles.length > 0) {
          setManualForm(prev => ({ ...prev, vehicle_id: String(vehicles[0].id) }));
        } else {
          setManualForm(prev => ({ ...prev, vehicle_id: '' }));
        }
      }).catch(() => {
        setCustomerVehicles([]);
      });
    } else {
      setCustomerVehicles([]);
    }
  }, [manualForm.customer_id]);

  // Fetch slots for selected date
  useEffect(() => {
    if (manualBookingOpen) {
      api.get(`/slots?date=${selectedDate}`).then((res) => {
        setAvailableSlots(res.data.data || []);
      }).catch(() => {
        setAvailableSlots([]);
      });
    }
  }, [selectedDate, manualBookingOpen]);

  const handleCreateManualBookingSubmit = async () => {
    if (!newCustOpen && !manualForm.customer_id) { toast.error('Select a customer'); return; }
    if (!manualForm.slot_id) { toast.error('Select a slot'); return; }
    if (!manualForm.service_id) { toast.error('Select a service'); return; }

    let customerId = manualForm.customer_id ? parseInt(manualForm.customer_id) : 0;
    let selectedVeh: any = customerVehicles.find(v => String(v.id) === manualForm.vehicle_id);
    if (newCustOpen) {
      const n = newCust;
      if (!n.name.trim() || !/^[6-9]\d{9}$/.test(n.mobile) || !n.brand.trim() || !n.model.trim() || !n.reg.trim()) {
        toast.error('Enter name, 10-digit mobile, car brand, model and number plate'); return;
      }
      try {
        const category = getCategoryForModel(n.brand, n.model);
        const r = await api.post('/customers/manual-registration', { name: n.name.trim(), mobile: n.mobile, brand: n.brand.trim(), model: n.model.trim(), registration_no: n.reg, category });
        customerId = r.data.data.customer_id;
        selectedVeh = { id: r.data.data.vehicle_id, brand: n.brand.trim(), model: n.model.trim(), registration_no: n.reg.toUpperCase(), category };
      } catch (err: any) { toast.error(err?.response?.data?.error || 'Could not add the customer'); return; }
    }

    createManualBooking.mutate({
      customer_id: customerId,
      slot_id: parseInt(manualForm.slot_id),
      service_id: parseInt(manualForm.service_id),
      vehicle_id: selectedVeh?.id ? parseInt(String(selectedVeh.id)) : undefined,
      vehicle_brand: selectedVeh?.brand || undefined,
      vehicle_model: selectedVeh?.model || undefined,
      vehicle_reg_no: selectedVeh?.registration_no || undefined,
      vehicle_category: selectedVeh?.category || undefined,
      notes: manualForm.notes || undefined,
      booking_notes: manualForm.booking_notes || undefined,
    }, {
      onSuccess: (res: any) => {
        toast.success('Manual booking created and confirmed successfully!');
        setManualBookingOpen(false);
        setManualForm({
          customer_id: '',
          vehicle_id: '',
          slot_id: '',
          service_id: '',
          notes: '',
          booking_notes: ''
        });
        setSearchCustomerQuery('');
        setNewCustOpen(false); setNewCust({ name: '', mobile: '', brand: '', model: '', reg: '' });
        refetch();
      },
      onError: (err: any) => {
        toast.error(err.response?.data?.error || 'Failed to create manual booking');
      }
    });
  };

  const handleCreateJobCart = (booking: any) => {
    navigate('/admin/job-carts/new', {
      state: {
        prefill: {
          id: booking.id,
          customer_name: booking.customer_name,
          customer_mobile: booking.customer_mobile,
          customer_email: booking.customer_email,
          car_brand: booking.vehicle_brand,
          car_model: booking.vehicle_model,
          vehicle_reg_no: booking.vehicle_reg_no,
          service_name: booking.service_name || booking.package_name,
          notes: booking.notes || '',
        },
      },
    });
  };

  return (
    <>
      <AdminTopBar
        title="Customer Bookings"
        subtitle="Manage incoming customer slot bookings"
        actions={
          <Button onClick={() => setManualBookingOpen(true)} icon={<Plus size={16} />}>
            New Manual Booking
          </Button>
        }
      />

      {/* Tabs + Search Row */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 mb-6">
        {/* Tabs */}
        <div className="flex gap-1 bg-[#F1F5F9] rounded-xl p-1 overflow-x-auto max-w-full w-full sm:w-auto scrollbar-none">
          {TABS.map((tab) => (
            <button
              key={tab.key}
              onClick={() => { setActiveTab(tab.key); setPage(1); }}
              className={`px-3.5 py-2 rounded-lg text-xs font-bold uppercase tracking-wider transition-all duration-200 shrink-0 whitespace-nowrap ${
                activeTab === tab.key
                  ? 'bg-white text-[#0F172A] shadow-sm'
                  : 'text-[#64748B] hover:text-[#0F172A]'
              }`}
            >
              {tab.label}
              {tabCount[tab.key] ? <span className="ml-1.5 inline-flex min-w-[18px] justify-center rounded-full bg-[#2563EB] px-1.5 text-[10px] text-white">{tabCount[tab.key]}</span> : null}
            </button>
          ))}
        </div>

        {/* Search */}
        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search name, mobile, vehicle..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
          />
          {search && (
            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600">
              <X size={14} />
            </button>
          )}
        </div>
      </div>

      {/* Results Count */}
      <div className="mb-4">
        <p className="text-xs font-bold text-[#64748B] uppercase tracking-widest">
          {pagination.total} Booking{pagination.total !== 1 ? 's' : ''} found
        </p>
      </div>

      {/* Bookings List */}
      {isLoading ? (
        <div className="space-y-4">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : bookings.length === 0 ? (
        <div className="bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col items-center justify-center py-16">
          <Calendar size={48} className="text-gray-300 mb-4" />
          <h3 className="text-lg font-bold text-[#0F172A]">No Bookings Found</h3>
          <p className="text-sm text-[#64748B] mt-1">
            {activeTab === 'confirmed,in_progress' ? 'No confirmed bookings waiting to be processed' : 'No bookings match your filters'}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {bookings.map((b: any) => (
            <div
              key={b.id}
              className="bg-white rounded-xl shadow-sm border border-gray-100 p-5 hover:shadow-md hover:border-gray-200 transition-all duration-200 group"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
                {/* Left: Customer + Vehicle Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-3 mb-3">
                    {/* Avatar */}
                    <div className="w-11 h-11 rounded-xl bg-gradient-to-br from-[#2563EB]/10 to-[#2563EB]/20 flex items-center justify-center text-[#2563EB] font-black text-sm shrink-0">
                      {b.customer_name?.charAt(0)?.toUpperCase() || '?'}
                    </div>
                    <div className="min-w-0">
                      <h4 className="font-bold text-[#0F172A] text-sm truncate">{b.customer_name}</h4>
                      <div className="flex items-center gap-3 text-xs text-[#64748B]">
                        <span className="flex items-center gap-1">
                          <Phone size={10} />
                          {b.customer_mobile}
                        </span>
                        {b.customer_email && (
                          <span className="hidden sm:inline truncate">{b.customer_email}</span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Details Grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                    {/* Vehicle */}
                    <div className="flex items-start gap-2">
                      <Car size={14} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Vehicle</p>
                        <p className="text-xs font-bold text-[#0F172A]">
                          {b.vehicle_brand || '—'} {b.vehicle_model || ''}
                        </p>
                        {b.vehicle_reg_no && (
                          <button
                            onClick={() => openVehicleHistory(b.vehicle_reg_no)}
                            className="text-[10px] font-bold text-[#2563EB] hover:underline flex items-center gap-0.5 mt-0.5"
                          >
                            <History size={9} />
                            {b.vehicle_reg_no}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Service / Services Cart Details */}
                    <div className="flex items-start gap-2">
                      <FileText size={14} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Services Cart</p>
                        {b.cart_items_json ? (
                          <div className="space-y-1 mt-0.5">
                            {(() => {
                              try {
                                const items = JSON.parse(b.cart_items_json);
                                return items.map((it: any, i: number) => (
                                  <div key={i} className="text-[11px] font-extrabold text-[#0F172A] flex items-center gap-1">
                                    <span>• {it.name}</span>
                                    {it.is_wash && <span className="text-[9px] bg-blue-100 text-blue-700 px-1 rounded">Wash</span>}
                                  </div>
                                ));
                              } catch {
                                return <p className="text-xs font-bold text-[#0F172A]">{b.service_name || b.package_name || '—'}</p>;
                              }
                            })()}
                          </div>
                        ) : (
                          <p className="text-xs font-bold text-[#0F172A] truncate">
                            {b.service_name || b.package_name || '—'}
                          </p>
                        )}
                      </div>
                    </div>

                    {/* Date */}
                    <div className="flex items-start gap-2">
                      <Calendar size={14} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Date</p>
                        <p className="text-xs font-bold text-[#0F172A]">
                          {b.slot_date
                            ? new Date(b.slot_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })
                            : '—'}
                        </p>
                      </div>
                    </div>

                    {/* Time */}
                    <div className="flex items-start gap-2">
                      <Clock size={14} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Time</p>
                        <p className="text-xs font-bold text-[#0F172A]">
                          {b.start_time ? `${formatTime(b.start_time)} – ${formatTime(b.end_time)}` : '—'}
                        </p>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Right: Status + Actions */}
                <div className="flex flex-row lg:flex-col items-center lg:items-end gap-3 shrink-0">
                  <span className={`text-[9px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-lg ${
                    b.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                    b.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                    b.status === 'pending_approval' ? 'bg-yellow-100 text-yellow-800' :
                    'bg-blue-100 text-blue-700'
                  }`}>
                    {b.status.replace('_', ' ')}
                  </span>

                  {b.status === 'pending_approval' && (
                    <div className="flex gap-2">
                      <Button
                        size="sm"
                        variant="ghost"
                        className="!text-blue-600 hover:bg-blue-50"
                        onClick={() => {
                          setConfirmType('reject');
                          setConfirmTargetId(b.id);
                        }}
                      >
                        Reject
                      </Button>
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={() => {
                          setConfirmType('approve');
                          setConfirmTargetId(b.id);
                        }}
                      >
                        Approve
                      </Button>
                    </div>
                  )}

                  {b.status === 'confirmed' && !b.job_cart_id && (
                    <Button
                      size="sm"
                      onClick={() => handleCreateJobCart(b)}
                      icon={<FileText size={14} />}
                      className="whitespace-nowrap"
                    >
                      Create Job Card
                    </Button>
                  )}

                  {b.job_cart_id && (
                    <button
                      onClick={() => navigate(`/admin/job-carts/${b.job_cart_id}`)}
                      className="flex items-center gap-1.5 text-xs font-bold text-[#2563EB] hover:underline"
                    >
                      <Eye size={12} />
                      View Job Card #{b.job_cart_id}
                    </button>
                  )}
                </div>
              </div>

              {/* Payment Details */}
              <div className="mt-3 pt-3 border-t border-gray-100 flex flex-wrap gap-2 items-center w-full">
                <span className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Payment:</span>
                {b.booking_type === 'package' ? (
                  <span className="text-xs font-bold text-purple-700 bg-purple-50 border border-purple-200 px-2 py-0.5 rounded-lg">
                    📦 Package Credit ({b.package_name || 'Active Package'})
                  </span>
                ) : b.is_free_wash ? (
                  <span className="text-xs font-bold text-blue-700 bg-blue-50 border border-blue-200 px-2 py-0.5 rounded-lg">
                    🎁 Free Wash (Loyalty)
                  </span>
                ) : b.advance_payment_id ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg flex items-center gap-1">
                      💰 Advance Paid: ₹{b.advance_amount || 0}
                    </span>
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-0.5 rounded-lg">
                      💵 Studio Due: ₹{(b.total_amount || 0) - (b.advance_amount || 0)} (Total: ₹{b.total_amount || 0})
                    </span>
                    <button
                      onClick={() => {
                        const token = useAuthStore.getState().token;
                        window.open(`${API_BASE}/payments/${b.advance_payment_id}/invoice?token=${token}`, '_blank');
                      }}
                      className="text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2 py-1 rounded-lg hover:bg-blue-100 transition-colors"
                      title="Download Payment Receipt"
                    >
                      <Download className="w-3.5 h-3.5" />
                      Receipt
                    </button>
                  </div>
                ) : b.advance_amount > 0 ? (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-xs font-bold text-yellow-700 bg-yellow-50 border border-yellow-200 px-2.5 py-0.5 rounded-lg">
                      ⏳ Advance Pending: ₹{b.advance_amount || 0}
                    </span>
                    <span className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-lg">
                      💵 Total Bill: ₹{b.total_amount || 0}
                    </span>
                  </div>
                ) : (
                  <span className="text-xs font-bold text-gray-700 bg-gray-50 border border-gray-200 px-2.5 py-0.5 rounded-lg">
                    💵 Pay at Studio: ₹{b.total_amount || 0}
                  </span>
                )}
                {Number(b.discount_amount) > 0 && (
                  <span className="text-xs font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-0.5 rounded-lg">
                    🏷️ {b.offer_code ? `Offer ${b.offer_code}` : Number(b.discount_percent) === 50 ? 'First wash 50%' : 'Discount'}: −₹{Number(b.discount_amount).toLocaleString('en-IN')}
                  </span>
                )}
                
                {['confirmed', 'in_progress', 'completed', 'delivered'].includes(b.status) && <button
                  onClick={() => {
                    const token = useAuthStore.getState().token;
                    window.open(`${API_BASE}/bookings/${b.id}/invoice?token=${token}`, '_blank');
                  }}
                  className="ml-auto text-blue-600 hover:text-blue-800 font-bold text-xs inline-flex items-center gap-1.5 bg-blue-50 border border-blue-200 px-2.5 py-1.5 rounded-lg hover:bg-blue-100 transition-colors"
                  title="Download Booking Invoice"
                >
                  <Download className="w-3.5 h-3.5" />
                  Booking Invoice
                </button>}
              </div>

              {/* Notes */}
              {b.notes && (
                <div className="mt-3 pt-3 border-t border-gray-50">
                  <p className="text-xs text-[#64748B]">
                    <span className="font-bold">Notes:</span> {b.notes}
                  </p>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-center gap-3 mt-6 pb-6">
          <button
            onClick={() => setPage(Math.max(1, page - 1))}
            disabled={page <= 1}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronLeft size={18} />
          </button>
          <span className="text-sm font-bold text-[#0F172A]">
            Page {page} of {totalPages}
          </span>
          <button
            onClick={() => setPage(Math.min(totalPages, page + 1))}
            disabled={page >= totalPages}
            className="p-2 rounded-lg hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
          >
            <ChevronRight size={18} />
          </button>
        </div>
      )}

      {/* Vehicle History Modal */}
      <Modal
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistoryRegNo(''); }}
        title={`Vehicle History — ${historyRegNo}`}
        size="lg"
      >
        {historyLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 size={24} className="animate-spin text-[#2563EB]" />
          </div>
        ) : !historyData?.found ? (
          <div className="text-center py-12">
            <Car size={40} className="text-gray-300 mx-auto mb-3" />
            <p className="text-sm text-[#64748B]">No records found for this vehicle</p>
          </div>
        ) : (
          <div>
            {/* Vehicle + Customer Summary */}
            <div className="bg-[#F1F5F9] rounded-xl p-4 mb-5">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Vehicle</p>
                  <p className="font-bold text-[#0F172A]">{historyData.vehicle?.brand} {historyData.vehicle?.model}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Reg. No</p>
                  <p className="font-bold text-[#0F172A]">{historyData.vehicle?.registration_no}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Customer</p>
                  <p className="font-bold text-[#0F172A]">{historyData.customer?.name}</p>
                </div>
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B]">Mobile</p>
                  <p className="font-bold text-[#0F172A]">{historyData.customer?.mobile}</p>
                </div>
              </div>
            </div>

            {/* Job Card History */}
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-3">
              Service History ({historyData.history?.length || 0} visits)
            </p>

            {historyData.history?.length > 0 ? (
              <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
                {historyData.history.map((jc: any) => (
                  <div
                    key={jc.id}
                    className="border border-gray-100 rounded-xl p-4 hover:border-gray-200 transition-colors cursor-pointer"
                    onClick={() => { setHistoryOpen(false); navigate(`/admin/job-carts/${jc.id}`); }}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-black text-[#2563EB]">Visit #{jc.visit_number}</span>
                        <span className={`text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                          jc.status === 'complete' ? 'bg-green-100 text-green-700' :
                          jc.status === 'open' ? 'bg-blue-100 text-blue-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>{jc.status}</span>
                      </div>
                      <span className="text-xs text-[#64748B]">
                        {new Date(jc.visit_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                      </span>
                    </div>
                    {jc.services_done && (
                      <p className="text-xs text-[#0F172A] font-medium">{jc.services_done}</p>
                    )}
                    <div className="flex items-center justify-between mt-2 text-xs text-[#64748B]">
                      {jc.invoice_number && <span>Invoice: {jc.invoice_number}</span>}
                      {jc.total_amount > 0 && (
                        <span className="font-bold text-[#0F172A]">₹{Number(jc.total_amount).toLocaleString('en-IN')}</span>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl">
                <p className="text-sm text-[#64748B]">No previous service records</p>
              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Create Manual Booking Modal */}
      <Modal
        open={manualBookingOpen}
        onClose={() => {
          setManualBookingOpen(false);
          setManualForm({
            customer_id: '',
            vehicle_id: '',
            slot_id: '',
            service_id: '',
            notes: '',
            booking_notes: ''
          });
          setSearchCustomerQuery('');
        }}
        title="Create Manual Booking"
        size="md"
      >
        <div className="space-y-4 max-h-[70vh] overflow-y-auto pr-1">
          {/* Step 1: Customer Selection */}
          <div>
            <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
              Select Customer
            </label>
            {!manualForm.customer_id && (
              <button type="button" onClick={() => setNewCustOpen(o => !o)} className="mb-2 text-xs font-bold text-blue-600">
                {newCustOpen ? '← Pick an existing customer' : '+ New customer (not registered yet)'}
              </button>
            )}
            {newCustOpen && !manualForm.customer_id ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <input value={newCust.name} onChange={e => setNewCust({ ...newCust, name: e.target.value })} placeholder="Customer name *" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                <input value={newCust.mobile} onChange={e => setNewCust({ ...newCust, mobile: e.target.value.replace(/\D/g, '').slice(0, 10) })} inputMode="numeric" placeholder="Mobile (10 digits) *" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                <input list="nc-brands" value={newCust.brand} onChange={e => setNewCust({ ...newCust, brand: e.target.value, model: '' })} placeholder="Car brand *" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                <datalist id="nc-brands">{carBrands.map(b => <option key={b} value={b} />)}</datalist>
                <input list="nc-models" value={newCust.model} onChange={e => setNewCust({ ...newCust, model: e.target.value })} placeholder="Car model *" className="px-3 py-2.5 rounded-xl border border-slate-200 text-sm" />
                <datalist id="nc-models">{getModelsForBrand(newCust.brand).map(m => <option key={m} value={m} />)}</datalist>
                <input value={newCust.reg} onChange={e => setNewCust({ ...newCust, reg: e.target.value.toUpperCase().replace(/\s/g, '') })} placeholder="Number plate * e.g. MH01AB1234" className="sm:col-span-2 px-3 py-2.5 rounded-xl border border-slate-200 text-sm uppercase" />
              </div>
            ) : !manualForm.customer_id ? (
              <div className="space-y-2">
                <div className="relative">
                  <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    type="text"
                    placeholder="Search by name, mobile, or vehicle reg no..."
                    value={searchCustomerQuery}
                    onChange={(e) => setSearchCustomerQuery(e.target.value)}
                    className="w-full pl-9 pr-8 py-2.5 rounded-xl border border-gray-200 text-sm font-medium bg-white focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
                  />
                  {searchCustomerQuery && (
                    <button onClick={() => setSearchCustomerQuery('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400">
                      <X size={14} />
                    </button>
                  )}
                </div>
                {searchCustomerQuery.trim().length > 0 && (
                  <div className="border border-gray-100 rounded-xl max-h-48 overflow-y-auto divide-y divide-gray-50 bg-white">
                    {customersList
                      .filter(c => {
                        const q = searchCustomerQuery.toLowerCase().trim();
                        const nameMatch = c.name?.toLowerCase().includes(q);
                        const mobileMatch = c.mobile?.includes(q);
                        const regMatch = c.vehicles?.some((v: any) => v.registration_no?.toLowerCase().includes(q));
                        return nameMatch || mobileMatch || regMatch;
                      })
                      .slice(0, 7)
                      .map(c => {
                        const q = searchCustomerQuery.toLowerCase().trim();
                        const matchedVeh = c.vehicles?.find((v: any) => v.registration_no?.toLowerCase().includes(q));

                        return (
                          <button
                            key={c.id}
                            type="button"
                            onClick={() => {
                              setManualForm(prev => ({ ...prev, customer_id: String(c.id) }));
                              setSearchCustomerQuery('');
                            }}
                            className="w-full text-left px-4 py-2.5 hover:bg-gray-50 text-sm font-medium text-[#0F172A] flex items-center justify-between transition-colors"
                          >
                            <div>
                              <p className="font-bold">{c.name}</p>
                              <p className="text-xs text-[#64748B]">{c.mobile}</p>
                              {matchedVeh && (
                                <p className="text-[10px] text-blue-600 font-bold mt-0.5">
                                  🚗 Matched Reg: {matchedVeh.registration_no} ({matchedVeh.brand} {matchedVeh.model})
                                </p>
                              )}
                            </div>
                            <span className="text-[10px] bg-gray-100 px-2 py-0.5 rounded font-black text-[#64748B] uppercase">Select</span>
                          </button>
                        );
                      })}
                    {customersList.filter(c => {
                      const q = searchCustomerQuery.toLowerCase().trim();
                      return (
                        c.name?.toLowerCase().includes(q) ||
                        c.mobile?.includes(q) ||
                        c.vehicles?.some((v: any) => v.registration_no?.toLowerCase().includes(q))
                      );
                    }).length === 0 && (
                      <p className="text-xs text-[#64748B] p-3 text-center">No customers or vehicles found matching search.</p>
                    )}
                  </div>
                )}
              </div>
            ) : (
              <div className="flex items-center justify-between p-3 bg-green-50 rounded-xl border border-green-100">
                <div>
                  <p className="text-sm font-bold text-green-900">
                    {customersList.find(c => String(c.id) === manualForm.customer_id)?.name}
                  </p>
                  <p className="text-xs text-green-700">
                    {customersList.find(c => String(c.id) === manualForm.customer_id)?.mobile}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setManualForm(prev => ({ ...prev, customer_id: '', vehicle_id: '' }))}
                  className="text-xs font-black text-[#2563EB] hover:underline"
                >
                  Change
                </button>
              </div>
            )}
          </div>

          {/* Step 2: Vehicle Selection */}
          {manualForm.customer_id && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                Select Vehicle
              </label>
              {customerVehicles.length > 0 ? (
                <Dropdown
                  value={manualForm.vehicle_id}
                  onChange={(e) => setManualForm(prev => ({ ...prev, vehicle_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all animate-fadeIn"
                >
                  {customerVehicles.map(v => (
                    <option key={v.id} value={v.id}>
                      {v.brand} {v.model} ({v.registration_no})
                    </option>
                  ))}
                </Dropdown>
              ) : (
                <p className="text-xs text-amber-600 bg-amber-50 p-3 rounded-xl border border-amber-100 font-medium">
                  No vehicles registered for this customer. Go to Customers page to add a vehicle, or proceed with manual details.
                </p>
              )}
            </div>
          )}

          {/* Step 3: Date & Slot */}
          {manualForm.customer_id && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                  Select Date
                </label>
                <input
                  type="date"
                  value={selectedDate}
                  min={ymd()}
                  onChange={(e) => {
                    setSelectedDate(e.target.value);
                    setManualForm(prev => ({ ...prev, slot_id: '' }));
                  }}
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                  Select Slot
                </label>
                <Dropdown
                  value={manualForm.slot_id}
                  onChange={(e) => setManualForm(prev => ({ ...prev, slot_id: e.target.value }))}
                  className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
                >
                  <option value="">-- Choose Slot --</option>
                  {availableSlots
                    .filter(s => !s.is_blocked)
                    .map(s => (
                      <option key={s.id} value={s.id} disabled={s.booked_count >= s.max_capacity}>
                        {formatTime(s.start_time)} - {formatTime(s.end_time)} ({s.booked_count}/{s.max_capacity} booked)
                      </option>
                    ))}
                </Dropdown>
                {availableSlots.filter(s => !s.is_blocked).length === 0 && (
                  <p className="text-[10px] text-blue-500 mt-1 font-bold">No slots generated or available on this day</p>
                )}
              </div>
            </div>
          )}

          {/* Step 4: Service selection */}
          {manualForm.customer_id && (
            <div>
              <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                Select Service
              </label>
              <Dropdown
                value={manualForm.service_id}
                onChange={(e) => setManualForm(prev => ({ ...prev, service_id: e.target.value }))}
                className="w-full px-3 py-2.5 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
              >
                <option value="">-- Choose Service --</option>
                {(servicesRes?.data || [])
                  .filter((s: any) => s.is_active !== 0)
                  .map((s: any) => (
                    <option key={s.id} value={s.id}>
                      {s.name} (Duration: {s.duration_minutes}m)
                    </option>
                  ))}
              </Dropdown>
            </div>
          )}

          {/* Step 5: Notes & Booking Notes */}
          {manualForm.customer_id && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                  Customer Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={manualForm.notes}
                  onChange={(e) => setManualForm(prev => ({ ...prev, notes: e.target.value }))}
                  placeholder="e.g. Customer requests extra interior cleaning..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase tracking-widest text-[#64748B] mb-1.5">
                  Admin Internal Notes (Optional)
                </label>
                <textarea
                  rows={2}
                  value={manualForm.booking_notes}
                  onChange={(e) => setManualForm(prev => ({ ...prev, booking_notes: e.target.value }))}
                  placeholder="e.g. Confirmed on phone with customer..."
                  className="w-full px-3 py-2 rounded-xl border border-gray-200 text-sm font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB] outline-none transition-all"
                />
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
          <Button
            variant="secondary"
            onClick={() => {
              setManualBookingOpen(false);
              setManualForm({
                customer_id: '',
                vehicle_id: '',
                slot_id: '',
                service_id: '',
                notes: '',
                booking_notes: ''
              });
              setSearchCustomerQuery('');
            }}
          >
            Cancel
          </Button>
          <Button
            onClick={handleCreateManualBookingSubmit}
            loading={createManualBooking.isPending}
            disabled={!manualForm.customer_id || !manualForm.slot_id || !manualForm.service_id || createManualBooking.isPending}
          >
            Create & Confirm
          </Button>
        </div>
      </Modal>

      <ConfirmModal
        open={confirmType !== null}
        onClose={() => { setConfirmType(null); setConfirmTargetId(null); }}
        onConfirm={handleAction}
        title={confirmType === 'approve' ? 'Approve Booking' : 'Reject Booking'}
        description={confirmType === 'approve' ? 'Are you sure you want to approve this booking?' : 'Are you sure you want to reject this booking?'}
        confirmText={confirmType === 'approve' ? 'Approve' : 'Reject'}
        isDestructive={confirmType === 'reject'}
        loading={isConfirming}
      />
    </>
  );
}
