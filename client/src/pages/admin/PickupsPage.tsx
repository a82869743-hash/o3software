import { useState, useEffect } from 'react';
import { MapPin, CheckCircle2, Clock, RefreshCw, User, Phone, Clipboard, ArrowRight, UserCheck } from 'lucide-react';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useUIStore } from '../../store/uiStore';
import { formatDate } from '../../utils/formatters';
import { usePickups, useAssignPickupStaff, useMarkPickedUp } from '../../api/hooks/usePickups';
import Modal from '../../components/ui/Modal';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import { useStudio } from '../../api/hooks/useStudio';
import { directionsUrl } from '../../utils/location';

interface PickupRequest {
  id: number;
  booking_id: number;
  customer_id: number;
  address: string;
  scheduled_time: string | null;
  assigned_staff_id: number | null;
  status: 'pending' | 'assigned' | 'picked_up' | 'cancelled';
  notes: string | null;
  pickup_charges: string;
  created_at: string;
  // Joined fields
  customer_name?: string;
  customer_mobile?: string;
  staff_name?: string;
  staff_mobile?: string;
}

const STATUS_CONFIG: Record<string, { label: string; color: string; bg: string; icon: React.ElementType }> = {
  pending:   { label: 'Pending',   color: 'text-amber-600',   bg: 'bg-amber-50 border-amber-200',   icon: Clock },
  assigned:  { label: 'Assigned',  color: 'text-blue-600',    bg: 'bg-blue-50 border-blue-200',     icon: UserCheck },
  picked_up: { label: 'Picked Up', color: 'text-emerald-600', bg: 'bg-emerald-50 border-emerald-200', icon: CheckCircle2 },
  cancelled: { label: 'Cancelled', color: 'text-blue-600',     bg: 'bg-blue-50 border-blue-200',       icon: Clipboard },
};

export default function PickupsPage() {
  const toast = useUIStore((s) => s.toast);
  const { data: pickupsRes, isLoading, refetch } = usePickups();
  const { data: studio } = useStudio();
  const assignMut = useAssignPickupStaff();
  const markPickedUpMut = useMarkPickedUp();

  const [filter, setFilter] = useState('all');
  const [staffList, setStaffList] = useState<any[]>([]);
  const [selectedPickup, setSelectedPickup] = useState<PickupRequest | null>(null);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [selectedStaffId, setSelectedStaffId] = useState('');

  // Fetch staff list for assignment
  useEffect(() => {
    (async () => {
      try {
        const res = await api.get('/staff/technicians');
        setStaffList(res.data.data || []);
      } catch {
        setStaffList([]);
      }
    })();
  }, []);

  const pickups: PickupRequest[] = pickupsRes?.data || [];

  const filteredPickups = pickups.filter(p => {
    if (filter === 'all') return true;
    return p.status === filter;
  });

  const stats = {
    total: pickups.length,
    pending: pickups.filter(p => p.status === 'pending').length,
    assigned: pickups.filter(p => p.status === 'assigned').length,
    picked_up: pickups.filter(p => p.status === 'picked_up').length,
  };

  const handleAssign = async () => {
    if (!selectedPickup || !selectedStaffId) {
      toast('error', 'Please select a driver');
      return;
    }

    try {
      await assignMut.mutateAsync({
        id: selectedPickup.id,
        assigned_staff_id: parseInt(selectedStaffId),
      });
      toast('success', 'Driver assigned successfully!');
      setAssignModalOpen(false);
      setSelectedStaffId('');
      setSelectedPickup(null);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to assign driver');
    }
  };

  const handleMarkPickedUp = async (id: number) => {
    if (!confirm('Mark this vehicle as picked up and on the way?')) return;

    try {
      await markPickedUpMut.mutateAsync(id);
      toast('success', 'Pickup request marked as picked up');
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update status');
    }
  };

  return (
    <div className="space-y-6">
      <AdminTopBar
        title="Vehicle Pickups"
        subtitle="Manage and assign drivers for customer pickup requests"
        actions={
          <button
            onClick={() => refetch()}
            className="px-3.5 py-2 bg-white text-gray-600 rounded-lg border border-gray-200 hover:bg-gray-50 transition-all flex items-center gap-2 text-sm font-medium shadow-sm"
          >
            <RefreshCw size={15} />
            Refresh
          </button>
        }
      />

      {/* Stats */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: 'Total Requests', value: stats.total, color: 'text-gray-700', border: 'border-gray-200' },
          { label: 'Pending', value: stats.pending, color: 'text-amber-600', border: 'border-amber-200' },
          { label: 'Assigned', value: stats.assigned, color: 'text-blue-600', border: 'border-blue-200' },
          { label: 'Picked Up', value: stats.picked_up, color: 'text-emerald-600', border: 'border-emerald-200' },
        ].map(s => (
          <div key={s.label} className={`p-4 rounded-xl bg-white border ${s.border} shadow-sm`}>
            <p className="text-[11px] text-gray-400 uppercase tracking-wider font-medium">{s.label}</p>
            <p className={`text-2xl font-bold mt-1 ${s.color}`}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {['all', 'pending', 'assigned', 'picked_up', 'cancelled'].map(status => (
          <button
            key={status}
            onClick={() => setFilter(status)}
            className={`px-4 py-2 rounded-lg text-sm font-medium whitespace-nowrap transition-all ${
              filter === status
                ? 'bg-[#2563EB] text-white shadow-sm font-bold'
                : 'bg-white text-gray-500 hover:bg-gray-50 border border-gray-200 hover:text-gray-700'
            }`}
          >
            {status === 'all' ? 'All Requests' : STATUS_CONFIG[status]?.label || status}
          </button>
        ))}
      </div>

      {/* Grid List */}
      {isLoading ? (
        <div className="flex justify-center py-20">
          <div className="w-8 h-8 border-3 border-gray-200 border-t-[#2563EB] rounded-full animate-spin" />
        </div>
      ) : filteredPickups.length === 0 ? (
        <div className="text-center py-20 bg-white rounded-xl border border-gray-200">
          <MapPin size={48} className="mx-auto text-gray-300 mb-4" />
          <p className="text-gray-600 text-lg font-medium">No pickup requests found</p>
          <p className="text-gray-400 text-sm mt-1">Customers can request pickups during booking from their app</p>
        </div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {filteredPickups.map(p => {
            const config = STATUS_CONFIG[p.status] || STATUS_CONFIG.pending;
            const StatusIcon = config.icon;

            return (
              <div key={p.id} className="bg-white border border-gray-200 rounded-xl p-4 hover:shadow-md transition-all flex flex-col justify-between">
                <div>
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 flex items-center justify-center">
                        <MapPin size={14} className="text-[#2563EB]" />
                      </div>
                      <div>
                        <span className="text-gray-900 font-semibold text-sm">Pickup #{p.id}</span>
                        <p className="text-[11px] text-gray-400">Booking #{p.booking_id}</p>
                      </div>
                    </div>
                    <span className={`text-[11px] font-medium px-2.5 py-1 rounded-full border ${config.bg} ${config.color}`}>
                      <StatusIcon size={12} className="inline mr-1 -mt-0.5" />
                      {config.label}
                    </span>
                  </div>

                  <div className="space-y-2 text-xs text-gray-600 mb-4">
                    {/* Customer */}
                    <div className="flex items-center gap-1.5">
                      <User size={12} className="text-gray-400" />
                      <span className="font-bold text-gray-900">{p.customer_name}</span>
                      {p.customer_mobile && (
                        <a href={`tel:${p.customer_mobile}`} className="text-blue-600 hover:underline flex items-center gap-0.5 ml-1">
                          <Phone size={10} /> {p.customer_mobile}
                        </a>
                      )}
                    </div>

                    {/* Address */}
                    <div className="bg-gray-50 rounded-lg p-2.5 space-y-1">
                      <p className="text-[10px] font-bold uppercase tracking-wider text-gray-400">Pickup Address</p>
                      <p className="text-gray-700 leading-relaxed font-medium">{p.address}</p>
                      <a target="_blank" rel="noreferrer" className="text-[11px] font-bold text-blue-600"
                        href={directionsUrl({ lat: (p as any).latitude, lng: (p as any).longitude, address: p.address }, studio ? { lat: studio.latitude, lng: studio.longitude } : null)}>
                        Route from studio{(p as any).latitude ? ' (exact pin)' : ''} →</a>
                    </div>

                    {/* Scheduled Time */}
                    {p.scheduled_time && (
                      <div className="flex items-center gap-1.5 bg-blue-50/20 text-[#2563EB] font-bold rounded-lg p-2 border border-blue-50">
                        <Clock size={12} />
                        <span>Scheduled: {formatDate(p.scheduled_time)}</span>
                      </div>
                    )}

                    {/* Notes */}
                    {p.notes && (
                      <p className="text-xs text-gray-400 italic bg-gray-50/50 p-1.5 rounded border border-dashed border-gray-100">
                        "{p.notes}"
                      </p>
                    )}

                    {/* Driver details */}
                    {p.staff_name && (
                      <div className="pt-2 border-t border-gray-100 flex items-center justify-between">
                        <span className="text-gray-400">Driver:</span>
                        <div className="text-right">
                          <p className="font-bold text-gray-800">{p.staff_name}</p>
                          {p.staff_mobile && <p className="text-[10px] text-gray-400">{p.staff_mobile}</p>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                <div className="mt-4 pt-3 border-t border-gray-50 flex items-center justify-between">
                  <span className="text-xs font-bold text-gray-900">
                    Charge: {parseFloat(p.pickup_charges) > 0 ? `₹${p.pickup_charges}` : 'Free'}
                  </span>

                  <div className="flex gap-2">
                    {(p.status === 'pending' || p.status === 'assigned') && (
                      <button
                        onClick={async () => {
                          if (!confirm(`Cancel pickup #${p.id}?`)) return;
                          try { await api.patch(`/pickup-requests/${p.id}/cancel`); toast('success', 'Pickup cancelled'); refetch(); }
                          catch (e: any) { toast('error', e?.response?.data?.error || 'Could not cancel'); }
                        }}
                        className="px-2.5 py-1.5 text-rose-600 hover:bg-rose-50 text-xs font-bold rounded-lg transition-all"
                      >
                        Cancel
                      </button>
                    )}
                    {p.status === 'pending' && (
                      <button
                        onClick={() => {
                          setSelectedPickup(p);
                          setAssignModalOpen(true);
                        }}
                        className="px-3 py-1.5 bg-[#2563EB] hover:bg-[#2563EB]/90 text-white text-xs font-bold rounded-lg transition-all flex items-center gap-1"
                      >
                        Assign Driver <ArrowRight size={12} />
                      </button>
                    )}
                    {p.status === 'assigned' && (
                      <>
                        <button
                          onClick={() => {
                            setSelectedPickup(p);
                            setSelectedStaffId(String(p.assigned_staff_id || ''));
                            setAssignModalOpen(true);
                          }}
                          className="px-2.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-700 text-xs font-bold rounded-lg transition-all"
                        >
                          Reassign
                        </button>
                        <button
                          onClick={() => handleMarkPickedUp(p.id)}
                          className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 text-emerald-700 hover:bg-emerald-100 text-xs font-bold rounded-lg transition-all"
                        >
                          Picked Up
                        </button>
                      </>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Driver Assignment Modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => {
          setAssignModalOpen(false);
          setSelectedPickup(null);
          setSelectedStaffId('');
        }}
        title="Assign Driver"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button onClick={handleAssign} loading={assignMut.isPending} disabled={!selectedStaffId}>
              Confirm Assignment
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-[#64748B]">
            Select a staff driver to pick up vehicle for booking #{selectedPickup?.booking_id}.
          </p>
          <Select
            label="Select Driver (Staff)"
            options={staffList.map(s => ({ value: s.id, label: s.name }))}
            value={selectedStaffId}
            onChange={e => setSelectedStaffId(e.target.value)}
            placeholder="Choose staff member..."
          />
        </div>
      </Modal>
    </div>
  );
}
