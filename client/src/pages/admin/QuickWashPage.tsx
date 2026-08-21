import { useState, useEffect, useCallback } from 'react';
import { Droplets, Clock, CheckCircle2, Truck, Plus, RefreshCw, Hash, Search, Car, X, ChevronDown, Download, Check } from 'lucide-react';
import { useQuickWashes, useQuickWashStats, useCreateQuickWash, useUpdateWashStatus } from '../../api/hooks/useQuickWash';
import { useCustomerSearch } from '../../api/hooks/useSearch';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import { useServices } from '../../api/hooks/useServices';
import type { QuickWashBooking, WashStatus } from '../../types';
import { useToastStore } from '../../store/toastStore';
import AdminTopBar from '../../components/layout/AdminTopBar';

const STATUS_CONFIG: Record<WashStatus, { label: string; color: string; bg: string; icon: React.ElementType; next?: WashStatus }> = {
  pending:   { label: 'In Queue',  color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',     icon: Clock,        next: 'washing' },
  washing:   { label: 'Washing',   color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',       icon: Droplets,     next: 'completed' },
  completed: { label: 'Completed', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2, next: 'delivered' },
  delivered: { label: 'Delivered', color: 'text-gray-500',    bg: 'bg-gray-50 border-gray-200',       icon: Truck },
};

const VEHICLE_CATEGORIES = [
  { value: 'hatchback', label: 'Hatchback' },
  { value: 'medium_hatchback', label: 'Medium Hatchback' },
  { value: 'sedan', label: 'Sedan' },
  { value: 'premium_sedan', label: 'Premium Sedan' },
  { value: 'suv', label: 'SUV' },
];

const WASH_PHASE_LABELS = {
  pre_wash: 'Pre-Wash',
  foam_apply: 'Foam Apply',
  pressure_rinse: 'Rinse',
  interior_clean: 'Vacuum',
  dry_polish: 'Dry/Polish',
};

const PHASE_ORDER = ['pre_wash', 'foam_apply', 'pressure_rinse', 'interior_clean', 'dry_polish'];

export default function QuickWashPage() {
  const [filter, setFilter] = useState<string>('all');
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data: washes = [], isLoading, refetch } = useQuickWashes({ status: filter !== 'all' ? filter : undefined });
  const { data: stats } = useQuickWashStats();
  const updateStatus = useUpdateWashStatus();
  const { addToast } = useToastStore();

  const handleStatusAdvance = async (id: number, nextStatus: WashStatus) => {
    try {
      await updateStatus.mutateAsync({ id, wash_status: nextStatus });
      addToast('success', `Status updated to ${STATUS_CONFIG[nextStatus].label}`);
    } catch {
      addToast('error', 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <AdminTopBar
        title="Quick Wash"
        subtitle="Fast-track walk-in wash bookings"
        actions={
          <div className="flex gap-2">
            <button
              onClick={() => refetch()}
              className="px-3.5 py-2 bg-white text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-medium shadow-sm"
            >
              <RefreshCw size={15} />
              Refresh
            </button>
            <button
              onClick={() => setShowCreateModal(true)}
              className="px-4 py-2 bg-[#2563EB] text-white rounded-lg shadow-sm hover:bg-[#1E40AF] transition-all flex items-center gap-2 text-sm font-semibold"
            >
              <Plus size={15} />
              New Wash
            </button>
          </div>
        }
      />

      {/* Stats Cards */}
      {stats && (
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {([
            { label: 'In Queue', value: stats.pending_count, color: 'text-amber-600', border: 'border-amber-200', bg: 'bg-amber-50' },
            { label: 'Washing', value: stats.washing_count, color: 'text-blue-600', border: 'border-blue-200', bg: 'bg-blue-50' },
            { label: 'Completed', value: stats.completed_count, color: 'text-emerald-600', border: 'border-emerald-200', bg: 'bg-emerald-50' },
            { label: 'Delivered', value: stats.delivered_count, color: 'text-gray-500', border: 'border-gray-200', bg: 'bg-gray-50' },
            { label: 'Total Today', value: stats.total_today, color: 'text-purple-600', border: 'border-purple-200', bg: 'bg-purple-50' },
          ]).map((stat) => (
            <div key={stat.label} className={`p-4 rounded-xl bg-white border ${stat.border} shadow-sm`}>
              <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{stat.label}</p>
              <p className={`text-2xl font-bold mt-1 ${stat.color}`}>{stat.value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'pending', 'washing', 'completed', 'delivered'].map((status) => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              filter === status
                ? 'bg-[#2563EB] text-white shadow-sm'
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 hover:text-gray-700'
            }`}
          >
            {status === 'all' ? 'All' : STATUS_CONFIG[status as WashStatus]?.label || status}
          </button>
        ))}
      </div>

      {/* Wash Cards */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-gray-200 border-t-[#2563EB] rounded-full animate-spin" />
        </div>
      ) : washes.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <Droplets size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 text-lg font-medium">No wash bookings</p>
          <p className="text-gray-400 text-sm mt-1">Click "New Wash" to add a walk-in</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {washes.map((wash: QuickWashBooking) => {
            const config = STATUS_CONFIG[wash.wash_status];
            const StatusIcon = config.icon;

            return (
              <div
                key={wash.id}
                className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all group"
              >
                <div className="flex items-start justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                      <Hash size={14} className="text-[#2563EB]" />
                    </div>
                    <div>
                      <span className="text-gray-900 font-semibold text-sm">Queue #{wash.queue_position}</span>
                      <p className="text-[11px] text-gray-400">#{wash.id}</p>
                    </div>
                  </div>
                  <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.color}`}>
                    <StatusIcon size={12} className="inline mr-1 -mt-0.5" />
                    {config.label}
                  </span>
                </div>

                {/* Vehicle */}
                <div className="space-y-1.5 mb-3">
                  <p className="text-sm text-gray-900 font-medium">
                    {wash.vehicle_brand} {wash.vehicle_model}
                  </p>
                  <p className="text-xs text-gray-500">{wash.vehicle_reg_no || 'No reg'}</p>
                  {wash.customer_name && (
                    <p className="text-xs text-gray-400">{wash.customer_name} · {wash.customer_mobile}</p>
                  )}
                  {wash.service_name && (
                    <p className="text-xs text-blue-600 font-medium">{wash.service_name}</p>
                  )}
                </div>

                {wash.notes && (
                  <p className="text-xs text-gray-400 italic mb-3 line-clamp-2">{wash.notes}</p>
                )}

                {wash.wash_status === 'washing' && (
                  <div className="mt-4 pt-3 border-t border-gray-100 mb-4">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-gray-500 mb-2">Wash Progress</p>
                    <div className="flex items-center justify-between relative mb-4 px-2">
                      {/* Background Line */}
                      <div className="absolute top-1/2 left-4 right-4 h-0.5 bg-gray-200 -translate-y-1/2 z-0" />
                      {/* Active Progress Line */}
                      <div
                        className="absolute top-1/2 left-4 h-0.5 bg-[#2563EB] -translate-y-1/2 z-0 transition-all duration-300"
                        style={{
                          width: `${(PHASE_ORDER.indexOf(wash.current_phase || 'pre_wash') / (PHASE_ORDER.length - 1)) * 90}%`,
                        }}
                      />

                      {PHASE_ORDER.map((phaseId, pIdx) => {
                        const currentIdx = PHASE_ORDER.indexOf(wash.current_phase || 'pre_wash');
                        const isDone = pIdx < currentIdx;
                        const isCurrent = pIdx === currentIdx;

                        return (
                          <div key={phaseId} className="flex flex-col items-center z-10 relative">
                            <div
                              className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-bold transition-all duration-300 ${
                                isDone ? 'bg-[#2563EB] text-white' :
                                isCurrent ? 'bg-white text-[#2563EB] border-2 border-[#2563EB] ring-4 ring-blue-100' :
                                'bg-white text-gray-400 border-2 border-gray-200'
                              }`}
                              title={WASH_PHASE_LABELS[phaseId as keyof typeof WASH_PHASE_LABELS]}
                            >
                              {isDone ? '✓' : pIdx + 1}
                            </div>
                            <span className={`text-[8px] font-bold mt-1 uppercase tracking-wider ${
                              isCurrent ? 'text-[#2563EB]' : isDone ? 'text-gray-700' : 'text-gray-400'
                            }`}>
                              {WASH_PHASE_LABELS[phaseId as keyof typeof WASH_PHASE_LABELS]}
                            </span>
                          </div>
                        );
                      })}
                    </div>

                    <button
                      onClick={async () => {
                        const currentIdx = PHASE_ORDER.indexOf(wash.current_phase || 'pre_wash');
                        const nextPhase = currentIdx < PHASE_ORDER.length - 1 ? PHASE_ORDER[currentIdx + 1] : 'complete';
                        try {
                          const { default: api } = await import('../../api/axiosInstance');
                          await api.patch(`/quick-wash/${wash.id}/phase`, { phase: nextPhase });
                          addToast('success', `Wash phase advanced to ${nextPhase === 'complete' ? 'Completed' : WASH_PHASE_LABELS[nextPhase as keyof typeof WASH_PHASE_LABELS]}`);
                          refetch();
                        } catch {
                          addToast('error', 'Failed to advance wash phase');
                        }
                      }}
                      className="w-full py-1.5 bg-[#2563EB]/5 hover:bg-[#2563EB]/10 text-[#2563EB] border border-[#2563EB]/10 rounded-lg text-xs font-bold transition-all uppercase tracking-wider flex items-center justify-center gap-1.5"
                    >
                      <Clock size={12} />
                      Advance Phase
                    </button>
                  </div>
                )}

                {/* Action */}
                <div className="flex gap-2 mt-3">
                  <button
                    onClick={async () => {
                      try {
                        const { default: api } = await import('../../api/axiosInstance');
                        const res = await api.get(`/quick-wash/${wash.id}/invoice`, { responseType: 'blob' });
                        const url = window.URL.createObjectURL(new Blob([res.data], { type: 'application/pdf' }));
                        const link = document.createElement('a');
                        link.href = url;
                        link.setAttribute('download', `QuickWash-Invoice-${wash.id}.pdf`);
                        document.body.appendChild(link);
                        link.click();
                        link.remove();
                      } catch {
                        addToast('error', 'Failed to download invoice');
                      }
                    }}
                    className="flex-1 py-2 bg-gray-50 hover:bg-gray-100 border border-gray-200 text-sm text-gray-700 rounded-lg transition-all flex items-center justify-center gap-2 font-medium"
                  >
                    <Download size={14} />
                    Invoice
                  </button>
                  {config.next && (
                    <button
                      onClick={() => handleStatusAdvance(wash.id, config.next!)}
                      disabled={updateStatus.isPending}
                      className="flex-1 py-2 bg-[#2563EB]/10 hover:bg-[#2563EB]/20 text-[#2563EB] border border-[#2563EB]/20 text-sm rounded-lg transition-all flex items-center justify-center gap-2 disabled:opacity-50 font-medium"
                    >
                      <StatusIcon size={14} />
                      {STATUS_CONFIG[config.next].label}
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <CreateQuickWashModal onClose={() => setShowCreateModal(false)} />
      )}
    </div>
  );
}

// ─── Create Quick Wash Modal ────────────────
function CreateQuickWashModal({ onClose }: { onClose: () => void }) {
  const [form, setForm] = useState({
    customer_id: undefined as number | undefined,
    vehicle_id: undefined as number | undefined,
    service_id: undefined as number | undefined,
    vehicle_reg_no: '',
    vehicle_brand: '',
    vehicle_model: '',
    vehicle_category: 'hatchback',
    notes: '',
  });
  const [customerQuery, setCustomerQuery] = useState('');
  const [showCustomerDropdown, setShowCustomerDropdown] = useState(false);
  const [selectedCustomerName, setSelectedCustomerName] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [isAutoFilled, setIsAutoFilled] = useState(false);

  // Data hooks
  const { data: searchResults = [] } = useCustomerSearch(customerQuery);
  const { data: brandsData } = useBrands();
  const { data: modelsData } = useModels(form.vehicle_brand);
  const { data: servicesData } = useServices({ active_only: true });
  const createMutation = useCreateQuickWash();
  const { addToast } = useToastStore();

  // Parse brands and models from API responses
  const brands: string[] = brandsData?.data || [];
  const models: string[] = modelsData?.data || [];
  const services: { id: number; name: string }[] = servicesData?.data || [];

  // Auto-fill customer/vehicle details when typing registration number
  useEffect(() => {
    const reg = form.vehicle_reg_no.trim();
    if (reg.length < 4) {
      setIsAutoFilled(false);
      return;
    }
    const timer = setTimeout(async () => {
      try {
        const { default: api } = await import('../../api/axiosInstance');
        const res = await api.get(`/vehicles/all?search=${encodeURIComponent(reg)}`);
        const matches = res.data.data || [];
        const match = matches.find((v: any) => v.registration_no?.toUpperCase() === reg.toUpperCase()) || matches[0];
        if (match && match.registration_no?.toUpperCase() === reg.toUpperCase()) {
          setForm((f) => ({
            ...f,
            customer_id: match.customer_id,
            vehicle_id: match.id,
            vehicle_brand: match.brand || f.vehicle_brand,
            vehicle_model: match.model || f.vehicle_model,
            vehicle_category: match.category || f.vehicle_category,
          }));
          if (match.customer_name) {
            setSelectedCustomerName(`${match.customer_name} (${match.customer_mobile || 'No mobile'})`);
            setCustomerQuery(match.customer_name);
          }
          setIsAutoFilled(true);
        }
      } catch {}
    }, 400);
    return () => clearTimeout(timer);
  }, [form.vehicle_reg_no]);

  // Auto-fill customer's vehicles when a customer is selected
  const handleSelectCustomer = useCallback(async (c: { id: number; name: string; mobile: string }) => {
    setForm((f) => ({ ...f, customer_id: c.id }));
    setSelectedCustomerName(`${c.name} (${c.mobile})`);
    setCustomerQuery(c.name);
    setShowCustomerDropdown(false);

    // Try to fetch the customer's primary vehicle
    try {
      const { default: api } = await import('../../api/axiosInstance');
      const res = await api.get(`/vehicles/by-customer/${c.id}`);
      if (res.data?.success && res.data.data?.length > 0) {
        const primary = res.data.data.find((v: any) => v.is_primary) || res.data.data[0];
        setForm((f) => ({
          ...f,
          vehicle_id: primary.id,
          vehicle_reg_no: primary.registration_no || '',
          vehicle_brand: primary.brand || '',
          vehicle_model: primary.model || '',
          vehicle_category: primary.category || 'hatchback',
        }));
      }
    } catch {
      // silently fail — no vehicles found
    }
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.vehicle_reg_no && !form.customer_id) {
      addToast('error', 'Please provide a vehicle registration or select a customer');
      return;
    }

    const finalBrand = form.vehicle_brand === 'Others' ? customBrand : form.vehicle_brand;
    const finalModel = (form.vehicle_brand === 'Others' || form.vehicle_model === 'Other') ? customModel : form.vehicle_model;

    try {
      const payload = {
        ...form,
        vehicle_brand: finalBrand,
        vehicle_model: finalModel,
        service_id: form.service_id || undefined,
        vehicle_id: form.vehicle_id || undefined,
        customer_id: form.customer_id || undefined,
      };
      const result = await createMutation.mutateAsync(payload);
      addToast('success', result.message || 'Quick wash booked!');
      onClose();
    } catch (err: any) {
      const msg = err?.response?.data?.error || 'Failed to create quick wash';
      addToast('error', msg);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/40 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between sticky top-0 bg-white rounded-t-2xl z-10">
          <h2 className="text-lg font-bold text-gray-900 flex items-center gap-2">
            <Droplets size={20} className="text-blue-600" />
            New Quick Wash
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600 transition-colors">
            <X size={20} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Customer search */}
          <div className="relative">
            <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Customer (optional)</label>
            <div className="relative">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                value={selectedCustomerName || customerQuery}
                onChange={(e) => {
                  setCustomerQuery(e.target.value);
                  setSelectedCustomerName('');
                  setShowCustomerDropdown(true);
                  if (!e.target.value) {
                    setForm((f) => ({ ...f, customer_id: undefined, vehicle_id: undefined }));
                  }
                }}
                onFocus={() => customerQuery && setShowCustomerDropdown(true)}
                placeholder="Search by name or mobile..."
                className="w-full pl-10 pr-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
              />
            </div>
            {showCustomerDropdown && searchResults.length > 0 && (
              <div className="absolute top-full left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl max-h-40 overflow-y-auto z-20 shadow-lg">
                {searchResults.map((c: { id: number; name: string; mobile: string }) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => handleSelectCustomer(c)}
                    className="w-full px-4 py-2.5 text-left text-sm text-gray-900 hover:bg-blue-50 transition-colors flex justify-between items-center"
                  >
                    <span className="font-medium">{c.name}</span>
                    <span className="text-gray-400 text-xs">{c.mobile}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Vehicle Reg No */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Vehicle Reg No *</label>
            <input
              type="text"
              value={form.vehicle_reg_no}
              onChange={(e) => setForm((f) => ({ ...f, vehicle_reg_no: e.target.value.toUpperCase() }))}
              placeholder="MH12AB1234"
              className="w-full px-4 py-2.5 bg-[#f6f3f2] focus:bg-white border border-transparent focus:border-blue-300 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 outline-none uppercase font-mono tracking-wider transition-all"
            />
            {isAutoFilled && (
              <p className="text-[10px] text-emerald-700 font-bold mt-1.5 flex items-center gap-1">
                <Check size={11} className="text-emerald-600" /> Auto-filled customer and vehicle details from record
              </p>
            )}
          </div>

          {/* Brand & Model dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Brand</label>
              <div className="relative">
                <select
                  value={form.vehicle_brand}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, vehicle_brand: e.target.value, vehicle_model: '' }));
                    setCustomBrand('');
                    setCustomModel('');
                  }}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none appearance-none cursor-pointer"
                >
                  <option value="">Select Brand</option>
                  {brands.map((b: string) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                  <option value="Others">Others (Enter Manually)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
            <div>
              <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Model</label>
              <div className="relative">
                <select
                  value={form.vehicle_model}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, vehicle_model: e.target.value }));
                    setCustomModel('');
                  }}
                  disabled={!form.vehicle_brand || form.vehicle_brand === 'Others'}
                  className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none appearance-none cursor-pointer disabled:bg-gray-50 disabled:text-gray-400"
                >
                  <option value="">Select Model</option>
                  {models.map((m: string) => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                  <option value="Other">Other (Enter Manually)</option>
                </select>
                <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          </div>

          {(form.vehicle_brand === 'Others' || form.vehicle_model === 'Other') && (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-2 text-left">
              {form.vehicle_brand === 'Others' && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Enter Brand Name</label>
                  <input
                    type="text"
                    value={customBrand}
                    onChange={(e) => setCustomBrand(e.target.value)}
                    placeholder="e.g. Porsche"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
                    required
                  />
                </div>
              )}
              {(form.vehicle_brand === 'Others' || form.vehicle_model === 'Other') && (
                <div>
                  <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Enter Model Name</label>
                  <input
                    type="text"
                    value={customModel}
                    onChange={(e) => setCustomModel(e.target.value)}
                    placeholder="e.g. Cayenne"
                    className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none"
                    required
                  />
                </div>
              )}
            </div>
          )}

          {/* Vehicle Category */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Vehicle Category</label>
            <div className="relative">
              <select
                value={form.vehicle_category}
                onChange={(e) => setForm((f) => ({ ...f, vehicle_category: e.target.value }))}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none appearance-none cursor-pointer"
              >
                {VEHICLE_CATEGORIES.map((cat) => (
                  <option key={cat.value} value={cat.value}>{cat.label}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Service Selection */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Wash Service (optional)</label>
            <div className="relative">
              <select
                value={form.service_id || ''}
                onChange={(e) => setForm((f) => ({ ...f, service_id: e.target.value ? Number(e.target.value) : undefined }))}
                className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none appearance-none cursor-pointer"
              >
                <option value="">Select Service</option>
                {services.map((svc) => (
                  <option key={svc.id} value={svc.id}>{svc.name}</option>
                ))}
              </select>
              <ChevronDown size={14} className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-gray-500 mb-1.5 font-semibold uppercase tracking-wider">Notes</label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Any special instructions..."
              className="w-full px-4 py-2.5 bg-white border border-gray-200 rounded-xl text-sm text-gray-900 placeholder-gray-400 focus:ring-2 focus:ring-blue-100 focus:border-blue-300 outline-none resize-none"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 bg-gray-50 text-gray-600 rounded-xl border border-gray-200 hover:bg-gray-100 text-sm font-semibold transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="flex-1 py-2.5 bg-[#2563EB] text-white rounded-xl shadow-sm text-sm font-semibold transition-all hover:bg-[#1E40AF] disabled:opacity-50 flex items-center justify-center gap-2"
            >
              {createMutation.isPending ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
              ) : (
                <>
                  <Plus size={16} />
                  Book Wash
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
