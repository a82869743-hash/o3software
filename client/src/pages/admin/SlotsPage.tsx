import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Calendar, Plus, Loader2, X,
  Lock, Unlock, Trash2, Car, FileText, Phone, Clock,
  ArrowRight, User, ExternalLink
} from 'lucide-react';
import { useSlots, useBulkCreateSlots, useUpdateSlot, useDeleteSlot } from '../../api/hooks/useSlots';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import { useUIStore } from '../../store/uiStore';
import { formatTime } from '../../utils/formatters';
import api from '../../api/axiosInstance';

function getWeekDates(offset: number): Date[] {
  const now = new Date();
  const monday = new Date(now);
  monday.setDate(now.getDate() - now.getDay() + 1 + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d;
  });
}

function fmtDate(d: Date) { 
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function fmtDay(d: Date) { return d.toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' }); }

export default function SlotsPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from_date = fmtDate(weekDates[0]);
  const to_date = fmtDate(weekDates[6]);

  const { data, isLoading, refetch } = useSlots({ from_date, to_date });
  const updateMut = useUpdateSlot();
  const deleteMut = useDeleteSlot();

  // ─── Generate modal ─────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');
  const [genStart, setGenStart] = useState('09:00');
  const [genEnd, setGenEnd] = useState('18:00');
  const [genDuration, setGenDuration] = useState('60');
  const [genCapacity, setGenCapacity] = useState(3);
  const bulkMut = useBulkCreateSlots();

  // ─── Slide-out panel ────────────────────
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [slotBookings, setSlotBookings] = useState<any[]>([]);
  const [panelLoading, setPanelLoading] = useState(false);
  const [editingCap, setEditingCap] = useState(false);
  const [capVal, setCapVal] = useState('');

  // ─── All bookings for week (for inline display) ────
  const [weekBookings, setWeekBookings] = useState<any[]>([]);

  const slots = data?.data || [];

  // Fetch ALL bookings for the visible week (for inline cell previews)
  useEffect(() => {
    const fetchWeekBookings = async () => {
      try {
        // Get all slot IDs for this week
        if (slots.length === 0) { setWeekBookings([]); return; }
        const slotIds = slots.map((s: any) => s.id);
        // Fetch in batches — get bookings for each slot
        const allBookings: any[] = [];
        for (const sid of slotIds) {
          try {
            const res = await api.get(`/bookings?slot_id=${sid}&limit=50`);
            const bks = (res.data.data || []).map((b: any) => ({ ...b, _slot_id: sid }));
            allBookings.push(...bks);
          } catch { /* skip */ }
        }
        setWeekBookings(allBookings);
      } catch { setWeekBookings([]); }
    };
    if (slots.length > 0) fetchWeekBookings();
  }, [slots.length, from_date]);

  // Group bookings by slot_id for quick lookup
  const bookingsBySlot = useMemo(() => {
    const map = new Map<number, any[]>();
    weekBookings.forEach(b => {
      const sid = b.slot_id || b._slot_id;
      if (!map.has(sid)) map.set(sid, []);
      map.get(sid)!.push(b);
    });
    return map;
  }, [weekBookings]);

  // Group slots by time
  const timeSlots = useMemo(() => {
    const times = new Set<string>();
    slots.forEach((s: any) => times.add(s.start_time));
    return Array.from(times).sort();
  }, [slots]);

  const slotMap = useMemo(() => {
    const map = new Map<string, any>();
    slots.forEach((s: any) => map.set(`${s.slot_date}_${s.start_time}`, s));
    return map;
  }, [slots]);

  const handleGenerate = async () => {
    if (!genFrom || !genTo) { toast('error', 'Select date range'); return; }
    try {
      const res = await bulkMut.mutateAsync({
        from_date: genFrom, to_date: genTo,
        start_time: genStart, end_time: genEnd,
        slot_duration_minutes: parseInt(genDuration), max_capacity: genCapacity,
      });
      toast('success', res.message || 'Slots generated');
      setGenOpen(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed');
    }
  };

  const openSlotPanel = async (slot: any) => {
    setSelectedSlot(slot);
    setEditingCap(false);
    setCapVal(String(slot.max_capacity));
    setPanelLoading(true);
    try {
      const res = await api.get(`/bookings?slot_id=${slot.id}`);
      setSlotBookings(res.data.data || []);
    } catch { setSlotBookings([]); }
    setPanelLoading(false);
  };

  const handleToggleBlock = async (slot: any) => {
    try {
      let reason = undefined;
      if (!slot.is_blocked) {
        const inputReason = window.prompt('Enter reason for blocking this slot:', 'Walk-in Reserved');
        if (inputReason === null) return; // User cancelled
        reason = inputReason || 'Walk-in Reserved';
      }
      await updateMut.mutateAsync({ id: slot.id, is_blocked: !slot.is_blocked, reason });
      toast('success', slot.is_blocked ? 'Slot unblocked' : 'Slot blocked');
      refetch();
      if (selectedSlot?.id === slot.id) setSelectedSlot({ ...slot, is_blocked: !slot.is_blocked, blocked_reason: reason });
    } catch { toast('error', 'Failed to update slot'); }
  };

  const handleSaveCap = async () => {
    if (!selectedSlot) return;
    const val = parseInt(capVal);
    if (isNaN(val) || val < 1) { toast('error', 'Invalid capacity'); return; }
    try {
      await updateMut.mutateAsync({ id: selectedSlot.id, max_capacity: val });
      toast('success', 'Capacity updated');
      setEditingCap(false);
      setSelectedSlot({ ...selectedSlot, max_capacity: val });
      refetch();
    } catch { toast('error', 'Failed to update'); }
  };

  const getCellStyle = (slot: any) => {
    if (slot.is_blocked) return 'bg-gray-100 border-gray-200';
    if (slot.booked_count >= slot.max_capacity) return 'bg-blue-50 border-blue-200';
    if (slot.booked_count > 0) return 'bg-amber-50 border-amber-200';
    return 'bg-green-50 border-green-200';
  };

  return (
    <>
      <AdminTopBar
        title="Slots & Bookings"
        subtitle={`Week of ${weekDates[0].toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })} – ${weekDates[6].toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}`}
        actions={
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => navigate('/admin/customer-bookings')}
              icon={<ExternalLink size={14} />}
            >
              All Bookings
            </Button>
            <Button onClick={() => { setGenFrom(from_date); setGenTo(to_date); setGenOpen(true); }} icon={<Plus size={16} />}>
              Generate Slots
            </Button>
          </div>
        }
      />

      {/* Week Navigation */}
      <div className="flex items-center gap-4 mb-6">
        <button onClick={() => setWeekOffset(weekOffset - 1)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronLeft size={20} />
        </button>
        <button
          onClick={() => setWeekOffset(0)}
          className="px-3 py-1.5 text-xs font-bold uppercase tracking-wider bg-[#f6f3f2] rounded-lg hover:bg-[#e5e2e1] transition-colors"
        >
          This Week
        </button>
        <button onClick={() => setWeekOffset(weekOffset + 1)} className="p-2 rounded-lg hover:bg-gray-100 transition-colors">
          <ChevronRight size={20} />
        </button>
      </div>

      <div className="flex gap-6">
        {/* Calendar Grid */}
        <div className={`flex-1 bg-white rounded-xl shadow-sm border border-gray-100 overflow-hidden transition-all ${selectedSlot ? 'max-w-[calc(100%-360px)]' : ''}`}>
          {isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 size={24} className="animate-spin text-[#2563EB]" />
            </div>
          ) : timeSlots.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-center">
              <Calendar size={40} className="text-gray-300 mb-4" />
              <p className="font-bold text-[#0F172A]">No Slots This Week</p>
              <p className="text-sm text-[#5f5e5e] mt-1">Generate slots using the button above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full border-collapse">
                <thead>
                  <tr className="border-b border-gray-100">
                    <th className="p-3 text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] text-left w-24 sticky left-0 bg-white z-10">Time</th>
                    {weekDates.map((d) => {
                      const isToday = fmtDate(d) === fmtDate(new Date());
                      return (
                        <th key={fmtDate(d)} className={`p-3 text-[10px] font-extrabold uppercase tracking-widest text-center min-w-[140px] ${isToday ? 'text-[#2563EB] bg-blue-50/30' : 'text-[#5f5e5e]'}`}>
                          {fmtDay(d)}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody>
                  {timeSlots.map((time) => (
                    <tr key={time} className="border-b border-gray-50">
                      <td className="p-3 text-xs font-bold text-[#5f5e5e] sticky left-0 bg-white whitespace-nowrap z-10">
                        {formatTime(time)}
                      </td>
                      {weekDates.map((d) => {
                        const key = `${fmtDate(d)}_${time}`;
                        const slot = slotMap.get(key);
                        if (!slot) return <td key={fmtDate(d)} className="p-1.5" />;

                        const cellBookings = bookingsBySlot.get(slot.id) || [];
                        const confirmedBookings = cellBookings.filter((b: any) => b.status === 'confirmed');

                        return (
                          <td key={fmtDate(d)} className="p-1.5 align-top">
                            <button
                              onClick={() => openSlotPanel(slot)}
                              className={`w-full rounded-xl border text-left transition-all hover:shadow-md hover:scale-[1.02] ${getCellStyle(slot)} ${selectedSlot?.id === slot.id ? 'ring-2 ring-[#2563EB] shadow-md' : ''}`}
                              style={{ minHeight: '64px' }}
                            >
                              {slot.is_blocked ? (
                                <div className="p-2 flex flex-col items-center justify-center text-gray-400 text-center" title={slot.blocked_reason || 'Blocked'}>
                                  <Lock size={14} className="shrink-0" />
                                  <span className="text-[10px] font-bold mt-1">Blocked</span>
                                  {slot.blocked_reason && (
                                    <span className="text-[9px] text-gray-400 truncate max-w-full font-medium px-1 mt-0.5">{slot.blocked_reason}</span>
                                  )}
                                </div>
                              ) : (
                                <div className="p-2">
                                  {/* Header: count badge */}
                                  <div className="flex items-center justify-between mb-1.5">
                                    <span className={`text-[9px] font-black uppercase tracking-wider px-1.5 py-0.5 rounded-md ${
                                      slot.booked_count >= slot.max_capacity
                                        ? 'bg-blue-200 text-blue-800'
                                        : slot.booked_count > 0
                                        ? 'bg-amber-200 text-amber-800'
                                        : 'bg-green-200 text-green-800'
                                    }`}>
                                      {slot.booked_count}/{slot.max_capacity}
                                    </span>
                                    {slot.booked_count >= slot.max_capacity && (
                                      <span className="text-[8px] font-bold text-blue-500 uppercase">Full</span>
                                    )}
                                  </div>

                                  {/* Inline booking previews */}
                                  {confirmedBookings.length > 0 && (
                                    <div className="space-y-1">
                                      {confirmedBookings.slice(0, 3).map((b: any, i: number) => (
                                        <div
                                          key={b.id || i}
                                          className="flex items-center gap-1.5 rounded-md bg-white/70 px-1.5 py-1 border border-white/50"
                                        >
                                          {/* Mini avatar */}
                                          <div className="w-4 h-4 rounded-full bg-[#2563EB]/15 flex items-center justify-center shrink-0">
                                            <span className="text-[7px] font-black text-[#2563EB]">
                                              {b.customer_name?.charAt(0)?.toUpperCase() || '?'}
                                            </span>
                                          </div>
                                          <div className="min-w-0 flex-1">
                                            <p className="text-[9px] font-bold text-[#0F172A] truncate leading-tight">
                                              {b.customer_name?.split(' ')[0] || 'Customer'}
                                            </p>
                                            {b.vehicle_brand && (
                                              <p className="text-[8px] text-[#5f5e5e] truncate leading-tight">
                                                {b.vehicle_brand} {b.vehicle_model ? b.vehicle_model.substring(0, 8) : ''}
                                              </p>
                                            )}
                                          </div>
                                        </div>
                                      ))}
                                      {confirmedBookings.length > 3 && (
                                        <p className="text-[8px] font-bold text-[#5f5e5e] text-center">
                                          +{confirmedBookings.length - 3} more
                                        </p>
                                      )}
                                    </div>
                                  )}
                                </div>
                              )}
                            </button>
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Slide-out Panel */}
        {selectedSlot && (
          <div className="w-[340px] bg-white rounded-xl shadow-sm border border-gray-100 p-5 shrink-0 self-start sticky top-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-extrabold uppercase tracking-wider text-[#0F172A]">Slot Details</h3>
              <button onClick={() => setSelectedSlot(null)} className="p-1 hover:bg-gray-100 rounded"><X size={16} /></button>
            </div>

            <div className="space-y-3 text-sm">
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Date & Time</p>
                <p className="font-bold text-[#0F172A]">
                  {new Date(selectedSlot.slot_date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
                  {' · '}
                  {formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}
                </p>
              </div>

              <div>
                <div className="flex items-center justify-between">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Capacity</p>
                  {!editingCap && (
                    <button onClick={() => setEditingCap(true)} className="text-[10px] font-bold text-[#2563EB] hover:underline">Edit</button>
                  )}
                </div>
                {editingCap ? (
                  <div className="flex items-center gap-2 mt-1">
                    <input
                      type="number"
                      className="w-16 px-2 py-1 border border-[#2563EB] rounded text-sm font-bold text-center"
                      value={capVal}
                      onChange={(e) => setCapVal(e.target.value)}
                      onKeyDown={(e) => { if (e.key === 'Enter') handleSaveCap(); if (e.key === 'Escape') setEditingCap(false); }}
                      autoFocus
                    />
                    <Button size="sm" onClick={handleSaveCap}>Save</Button>
                  </div>
                ) : (
                  <p className="font-bold text-[#0F172A]">{selectedSlot.booked_count} / {selectedSlot.max_capacity}</p>
                )}
              </div>

              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e]">Status</p>
                <p className="font-bold">
                  {selectedSlot.is_blocked ? (
                    <span className="text-gray-400">Blocked {selectedSlot.blocked_reason ? `(${selectedSlot.blocked_reason})` : ''}</span>
                  ) : selectedSlot.booked_count >= selectedSlot.max_capacity ? (
                    <span className="text-blue-600">Full</span>
                  ) : (
                    <span className="text-green-600">Available</span>
                  )}
                </p>
              </div>
            </div>

            {/* Bookings List */}
            <div className="mt-5 pt-4 border-t border-gray-100">
              <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-3 flex justify-between items-center">
                <span>Bookings</span>
                <span className="bg-[#f6f3f2] px-1.5 py-0.5 rounded text-[10px]">{slotBookings.length} Total</span>
              </p>
              {panelLoading ? (
                <div className="flex justify-center py-4"><Loader2 className="animate-spin text-[#2563EB] w-4 h-4" /></div>
              ) : slotBookings.length > 0 ? (
                <div className="space-y-3 max-h-[320px] overflow-y-auto pr-1">
                  {slotBookings.map((b) => (
                    <div
                      key={b.id}
                      className="bg-[#f6f3f2] p-3 rounded-xl text-sm border border-transparent hover:border-[#e5e2e1] transition-all group/card cursor-pointer"
                      onClick={() => navigate('/admin/customer-bookings')}
                    >
                      {/* Customer header */}
                      <div className="flex justify-between items-start mb-2">
                        <div className="flex items-center gap-2.5 min-w-0">
                          <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB]/10 to-[#2563EB]/25 flex items-center justify-center text-[#2563EB] font-black text-xs shrink-0">
                            {b.customer_name?.charAt(0)?.toUpperCase() || '?'}
                          </div>
                          <div className="min-w-0">
                            <p className="font-bold text-[#0F172A] text-xs truncate">{b.customer_name}</p>
                            <p className="text-[10px] text-[#5f5e5e] flex items-center gap-1">
                              <Phone size={8} /> {b.customer_mobile}
                            </p>
                          </div>
                        </div>
                        <span className={`text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded shrink-0 ${
                          b.status === 'confirmed' ? 'bg-green-100 text-green-700' :
                          b.status === 'completed' ? 'bg-blue-100 text-blue-700' :
                          'bg-blue-100 text-blue-700'
                        }`}>{b.status}</span>
                      </div>

                      {/* Vehicle info */}
                      {(b.vehicle_brand || b.vehicle_model) && (
                        <div className="flex items-center gap-1.5 text-xs text-[#0F172A] mb-2 bg-white rounded-lg px-2 py-1.5">
                          <Car size={11} className="text-[#2563EB] shrink-0" />
                          <span className="font-medium truncate">
                            {b.vehicle_brand} {b.vehicle_model}
                            {b.vehicle_reg_no ? ` · ${b.vehicle_reg_no}` : ''}
                          </span>
                        </div>
                      )}

                      {/* Service */}
                      {(b.service_name || b.package_name) && (
                        <p className="text-[10px] text-[#5f5e5e] mb-2">
                          <span className="font-bold">Service:</span> {b.service_name || b.package_name}
                        </p>
                      )}

                      {/* Action: Navigate to Customer Bookings → Create Job Cart */}
                      {b.status === 'confirmed' && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate('/admin/customer-bookings');
                          }}
                          className="w-full bg-[#2563EB] text-white hover:bg-[#1E40AF] transition-colors py-1.5 px-3 text-[10px] font-bold uppercase tracking-widest rounded-lg flex items-center justify-center gap-1.5 mt-1"
                        >
                          <FileText size={11} />
                          Manage Booking
                          <ArrowRight size={11} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-xs text-center text-[#5f5e5e] py-4 bg-gray-50 rounded-lg">No bookings yet</p>
              )}

              {/* Link to all customer bookings */}
              {slotBookings.length > 0 && (
                <button
                  onClick={() => navigate('/admin/customer-bookings')}
                  className="w-full mt-3 text-center text-[10px] font-bold uppercase tracking-widest text-[#2563EB] hover:underline flex items-center justify-center gap-1 py-2 rounded-lg hover:bg-blue-50/50 transition-colors"
                >
                  View All in Customer Bookings <ArrowRight size={10} />
                </button>
              )}
            </div>

            {/* Slot Actions */}
            <div className="mt-5 pt-4 border-t border-gray-100 space-y-2">
              <Button
                variant={selectedSlot.is_blocked ? 'primary' : 'secondary'}
                size="sm"
                className="w-full"
                onClick={() => handleToggleBlock(selectedSlot)}
                icon={selectedSlot.is_blocked ? <Unlock size={14} /> : <Lock size={14} />}
              >
                {selectedSlot.is_blocked ? 'Unblock Slot' : 'Block Slot'}
              </Button>
              {selectedSlot.booked_count === 0 && (
                <Button
                  variant="danger"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await deleteMut.mutateAsync(selectedSlot.id);
                      toast('success', 'Slot deleted');
                      setSelectedSlot(null);
                      refetch();
                    } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed'); }
                  }}
                  icon={<Trash2 size={14} />}
                >
                  Delete Slot
                </Button>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Generate Slots Modal */}
      <Modal
        open={genOpen}
        onClose={() => setGenOpen(false)}
        title="Generate Slots"
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setGenOpen(false)}>Cancel</Button>
            <Button onClick={handleGenerate} loading={bulkMut.isPending}>Generate</Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="From Date" type="date" value={genFrom} onChange={(e) => setGenFrom(e.target.value)} />
            <Input label="To Date" type="date" value={genTo} onChange={(e) => setGenTo(e.target.value)} />
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Start Time" type="time" value={genStart} onChange={(e) => setGenStart(e.target.value)} />
            <Input label="End Time" type="time" value={genEnd} onChange={(e) => setGenEnd(e.target.value)} />
          </div>
          <Select
            label="Slot Duration"
            options={[
              { value: '30', label: '30 minutes' },
              { value: '60', label: '1 hour' },
              { value: '120', label: '2 hours' },
            ]}
            value={genDuration}
            onChange={(e) => setGenDuration(e.target.value)}
          />
          <Input
            label="Max Capacity per Slot"
            type="number"
            value={genCapacity || ''}
            onChange={(e) => setGenCapacity(parseInt(e.target.value) || 1)}
          />
        </div>
      </Modal>
    </>
  );
}
