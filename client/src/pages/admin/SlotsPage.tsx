import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  ChevronLeft, ChevronRight, Calendar, Plus, Loader2, X,
  Lock, Unlock, Trash2, Car, FileText, Phone, Clock,
  ArrowRight, User, ExternalLink, RotateCcw, Ban, AlertTriangle
} from 'lucide-react';
import {
  useSlots, useBulkCreateSlots, useUpdateSlot, useDeleteSlot, useRestoreSlot,
  useSlotClosures, useCreateClosure, useDeleteClosure
} from '../../api/hooks/useSlots';
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
  const [showDeleted, setShowDeleted] = useState(false);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const from_date = fmtDate(weekDates[0]);
  const to_date = fmtDate(weekDates[6]);

  const { data, isLoading, refetch } = useSlots({ from_date, to_date, include_deleted: showDeleted } as any);
  const updateMut = useUpdateSlot();
  const deleteMut = useDeleteSlot();
  const restoreMut = useRestoreSlot();

  const { data: closuresData, refetch: refetchClosures } = useSlotClosures();
  const createClosureMut = useCreateClosure();
  const deleteClosureMut = useDeleteClosure();
  const closuresList = closuresData?.data || [];

  // ─── Closure / Holiday state ───────────
  const [closureModalOpen, setClosureModalOpen] = useState(false);
  const [closureTab, setClosureTab] = useState<'create' | 'list'>('create');
  const [closureType, setClosureType] = useState<string>('full_day');
  const [closureStartDate, setClosureStartDate] = useState('');
  const [closureEndDate, setClosureEndDate] = useState('');
  const [closureSlotTime, setClosureSlotTime] = useState('09:00');
  const [closureRecurrenceDay, setClosureRecurrenceDay] = useState<number>(0);
  const [closureTitle, setClosureTitle] = useState('');
  const [closureReason, setClosureReason] = useState('');
  const [closureLoading, setClosureLoading] = useState(false);

  // ─── Conflict & Reschedule state ──────
  const [conflictModalOpen, setConflictModalOpen] = useState(false);
  const [affectedBookings, setAffectedBookings] = useState<any[]>([]);
  const [pendingClosurePayload, setPendingClosurePayload] = useState<any>(null);

  // ─── Generate modal ─────────────────────
  const [genOpen, setGenOpen] = useState(false);
  const [genFrom, setGenFrom] = useState('');
  const [genTo, setGenTo] = useState('');
  const [genStart, setGenStart] = useState('09:00');
  const [genEnd, setGenEnd] = useState('18:00');
  const [genDuration, setGenDuration] = useState('60');
  const [genCapacity, setGenCapacity] = useState(3);
  const [isGenerating, setIsGenerating] = useState(false);
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
    if (bulkMut.isPending || isGenerating) return;
    if (!genFrom || !genTo) { toast('error', 'Select date range'); return; }
    
    // Normalize date format if browser or user used DD-MM-YYYY
    const normalizeDate = (val: string) => {
      if (!val) return '';
      const parts = val.trim().split(/[-/]/);
      if (parts.length === 3 && parts[2].length === 4) {
        return `${parts[2]}-${parts[1].padStart(2, '0')}-${parts[0].padStart(2, '0')}`;
      }
      return val;
    };

    setIsGenerating(true);
    try {
      const res = await bulkMut.mutateAsync({
        from_date: normalizeDate(genFrom),
        to_date: normalizeDate(genTo),
        start_time: genStart,
        end_time: genEnd,
        slot_duration_minutes: parseInt(genDuration),
        max_capacity: genCapacity,
      });
      toast('success', res.message || 'Slots generated successfully');
      setGenOpen(false);
      refetch();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to generate slots. Please check database connection.');
    } finally {
      setIsGenerating(false);
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

  const handleSaveClosure = async (forceConfirm = false) => {
    if (!closureStartDate && closureType !== 'recurring_weekly') {
      toast('error', 'Please select a date');
      return;
    }

    let finalStart = closureStartDate;
    let finalEnd = closureEndDate;
    let isRecurring = false;
    let recType = 'none';
    let recDay = null;

    if (closureType === 'single_slot') {
      finalEnd = finalStart;
    } else if (closureType === 'full_day') {
      finalEnd = finalStart;
    } else if (closureType === 'week') {
      const d = new Date(finalStart + 'T00:00:00');
      d.setDate(d.getDate() + 6);
      finalEnd = fmtDate(d);
    } else if (closureType === 'range') {
      if (!finalEnd) finalEnd = finalStart;
    } else if (closureType === 'recurring_weekly') {
      isRecurring = true;
      recType = 'weekly';
      recDay = closureRecurrenceDay;
      if (!finalStart) finalStart = fmtDate(new Date());
      finalEnd = finalStart;
    } else if (closureType === 'recurring_yearly') {
      isRecurring = true;
      recType = 'yearly';
      finalEnd = finalStart;
    }

    const payload: any = {
      closure_type: closureType,
      start_date: finalStart,
      end_date: finalEnd,
      slot_time: closureType === 'single_slot' ? closureSlotTime : undefined,
      title: closureTitle.trim() || undefined,
      reason: closureReason.trim() || undefined,
      is_recurring: isRecurring,
      recurrence_type: recType,
      recurrence_day: recDay,
      confirm: forceConfirm,
      action: 'reschedule_notify',
    };

    setClosureLoading(true);
    try {
      const res = await createClosureMut.mutateAsync(payload);
      if (res.requires_confirmation) {
        setAffectedBookings(res.affected_bookings || []);
        setPendingClosurePayload(payload);
        setConflictModalOpen(true);
        return;
      }

      toast('success', res.message || 'Closure created successfully');
      setClosureModalOpen(false);
      setConflictModalOpen(false);
      setAffectedBookings([]);
      setPendingClosurePayload(null);
      refetch();
      refetchClosures();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to create closure');
    } finally {
      setClosureLoading(false);
    }
  };

  const handleConfirmConflictReschedule = async () => {
    if (!pendingClosurePayload) return;
    setClosureLoading(true);
    try {
      const res = await createClosureMut.mutateAsync({
        ...pendingClosurePayload,
        confirm: true,
        action: 'reschedule_notify',
      });
      toast('success', res.message || 'Closure applied and bookings marked for reschedule');
      setConflictModalOpen(false);
      setClosureModalOpen(false);
      setAffectedBookings([]);
      setPendingClosurePayload(null);
      refetch();
      refetchClosures();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to confirm closure');
    } finally {
      setClosureLoading(false);
    }
  };

  const handleReopenClosure = async (closureId: number, title?: string) => {
    const confirm = window.confirm(`Are you sure you want to reopen this closure "${title || 'Closure'}"? All matching slots will be reopened immediately.`);
    if (!confirm) return;

    try {
      await deleteClosureMut.mutateAsync(closureId);
      toast('success', 'Closure reopened and slots restored!');
      refetch();
      refetchClosures();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to reopen closure');
    }
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
    if (slot.is_deleted) return 'bg-red-50/70 border-red-200 opacity-70 hover:opacity-100';
    if (slot.is_blocked) return 'bg-rose-50 border-rose-200';
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
              onClick={() => { setClosureTab('create'); setClosureModalOpen(true); }}
              icon={<Ban size={14} className="text-rose-500" />}
            >
              Close Slots / Holidays {closuresList.length > 0 ? `(${closuresList.length})` : ''}
            </Button>
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
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
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

        <label className="flex items-center gap-2 cursor-pointer text-xs font-bold text-[#5f5e5e] hover:text-[#0F172A] transition-colors bg-white px-3 py-1.5 rounded-lg border border-gray-200">
          <input
            type="checkbox"
            checked={showDeleted}
            onChange={(e) => setShowDeleted(e.target.checked)}
            className="rounded border-gray-300 text-[#2563EB] focus:ring-[#2563EB]"
          />
          <span>Show Archived / Deleted Slots</span>
        </label>
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
                      const dayClosure = closuresList.find((c: any) => {
                        if (c.is_recurring) {
                          if (c.recurrence_type === 'weekly') return d.getDay() === parseInt(c.recurrence_day, 10);
                          if (c.recurrence_type === 'yearly' && c.start_date) {
                            const [cy, cm, cd] = c.start_date.split('-').map(Number);
                            return (d.getMonth() + 1) === cm && d.getDate() === cd;
                          }
                        } else {
                          if (!c.slot_time) {
                            const ds = fmtDate(d);
                            return ds >= c.start_date && ds <= c.end_date;
                          }
                        }
                        return false;
                      });

                      return (
                        <th key={fmtDate(d)} className={`p-3 text-[10px] font-extrabold uppercase tracking-widest text-center min-w-[140px] ${isToday ? 'text-[#2563EB] bg-blue-50/30' : 'text-[#5f5e5e]'}`}>
                          <div>{fmtDay(d)}</div>
                          {dayClosure && (
                            <div className="text-[9px] font-black text-rose-700 bg-rose-100 rounded px-1.5 py-0.5 mt-0.5 max-w-[130px] truncate mx-auto border border-rose-200" title={dayClosure.title || dayClosure.reason || 'Closed'}>
                              {dayClosure.title || 'Studio Closed'}
                            </div>
                          )}
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
                              {slot.is_deleted ? (
                                <div className="p-2 flex flex-col items-center justify-center text-red-500 text-center" title="Deleted Slot — Click to Restore">
                                  <RotateCcw size={14} className="shrink-0 text-red-500" />
                                  <span className="text-[10px] font-extrabold mt-1 line-through text-red-600">Deleted</span>
                                  <span className="text-[8px] font-bold text-red-500 uppercase tracking-wider mt-0.5">Click to Undo</span>
                                </div>
                              ) : slot.is_blocked ? (
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
              {selectedSlot.is_deleted ? (
                <Button
                  variant="primary"
                  size="sm"
                  className="w-full"
                  onClick={async () => {
                    try {
                      await restoreMut.mutateAsync(selectedSlot.id);
                      toast('success', 'Slot restored and synced live with customers');
                      setSelectedSlot(null);
                      refetch();
                    } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed to restore'); }
                  }}
                  icon={<RotateCcw size={14} />}
                >
                  Restore / Undo Delete Slot
                </Button>
              ) : (
                <>
                  {selectedSlot.is_blocked && (
                    <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-rose-800 text-xs font-medium space-y-1">
                      <div className="font-extrabold flex items-center gap-1.5 text-rose-900">
                        <Ban size={14} /> Closed / Blocked
                      </div>
                      <div>Reason: <strong>{selectedSlot.blocked_reason || 'Manual block'}</strong></div>
                      {selectedSlot.closure_type && (
                        <div className="text-[10px] text-rose-600 uppercase font-bold">Scope: {selectedSlot.closure_type}</div>
                      )}
                    </div>
                  )}
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
                          toast('success', 'Slot deleted. Check "Show Archived / Deleted Slots" to undo anytime.');
                          setSelectedSlot(null);
                          refetch();
                        } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed'); }
                      }}
                      icon={<Trash2 size={14} />}
                    >
                      Delete Slot
                    </Button>
                  )}
                </>
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
            <Button variant="ghost" onClick={() => setGenOpen(false)} disabled={bulkMut.isPending || isGenerating}>Cancel</Button>
            <Button onClick={handleGenerate} loading={bulkMut.isPending || isGenerating} disabled={bulkMut.isPending || isGenerating}>Generate</Button>
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

      {/* ═══ Slot Closures & Holidays Management Modal ═══ */}
      <Modal
        open={closureModalOpen}
        onClose={() => setClosureModalOpen(false)}
        title="Slot Closures & Holiday Management"
        size="lg"
      >
        <div className="space-y-4">
          {/* Tabs */}
          <div className="flex border-b border-gray-100">
            <button
              onClick={() => setClosureTab('create')}
              className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 ${
                closureTab === 'create'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#5f5e5e] hover:text-[#0F172A]'
              }`}
            >
              + Add Closure or Holiday
            </button>
            <button
              onClick={() => setClosureTab('list')}
              className={`pb-2.5 px-4 text-xs font-bold uppercase tracking-wider transition-colors border-b-2 flex items-center gap-1.5 ${
                closureTab === 'list'
                  ? 'border-[#2563EB] text-[#2563EB]'
                  : 'border-transparent text-[#5f5e5e] hover:text-[#0F172A]'
              }`}
            >
              Active Closures & Holidays
              <span className="px-1.5 py-0.5 rounded-full text-[10px] bg-gray-100 text-[#0F172A]">
                {closuresList.length}
              </span>
            </button>
          </div>

          {closureTab === 'create' ? (
            <div className="space-y-4 pt-1">
              <div>
                <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">
                  Closure Scope *
                </label>
                <select
                  value={closureType}
                  onChange={(e) => setClosureType(e.target.value)}
                  className="w-full px-3 py-2.5 bg-[#f6f3f2] border border-transparent rounded-lg text-sm font-semibold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all cursor-pointer"
                >
                  <option value="single_slot">Single Slot (Specific Date & Time)</option>
                  <option value="full_day">Whole Day (Entire Date Closed)</option>
                  <option value="week">Whole Week (7 Consecutive Days)</option>
                  <option value="range">Custom Date Range (From - To Dates)</option>
                  <option value="recurring_weekly">Recurring Weekly Holiday (e.g. Every Monday / Sunday)</option>
                  <option value="recurring_yearly">Recurring Yearly Holiday (e.g. Diwali / National Holiday)</option>
                </select>
              </div>

              {/* Dynamic Inputs depending on type */}
              {closureType === 'single_slot' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="Date *"
                    type="date"
                    value={closureStartDate}
                    onChange={(e) => setClosureStartDate(e.target.value)}
                  />
                  <Input
                    label="Slot Time *"
                    type="time"
                    value={closureSlotTime}
                    onChange={(e) => setClosureSlotTime(e.target.value)}
                  />
                </div>
              )}

              {closureType === 'full_day' && (
                <div>
                  <Input
                    label="Closure Date *"
                    type="date"
                    value={closureStartDate}
                    onChange={(e) => setClosureStartDate(e.target.value)}
                  />
                </div>
              )}

              {closureType === 'week' && (
                <div>
                  <Input
                    label="Week Start Date (Closes 7 Consecutive Days) *"
                    type="date"
                    value={closureStartDate}
                    onChange={(e) => setClosureStartDate(e.target.value)}
                  />
                  <p className="text-[11px] text-[#5f5e5e] mt-1">
                    Will automatically close from this date for the following 7 days.
                  </p>
                </div>
              )}

              {closureType === 'range' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input
                    label="From Date *"
                    type="date"
                    value={closureStartDate}
                    onChange={(e) => setClosureStartDate(e.target.value)}
                  />
                  <Input
                    label="To Date *"
                    type="date"
                    value={closureEndDate}
                    onChange={(e) => setClosureEndDate(e.target.value)}
                  />
                </div>
              )}

              {closureType === 'recurring_weekly' && (
                <div>
                  <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">
                    Repeats Every Week On *
                  </label>
                  <select
                    value={closureRecurrenceDay}
                    onChange={(e) => setClosureRecurrenceDay(parseInt(e.target.value, 10))}
                    className="w-full px-3 py-2.5 bg-[#f6f3f2] border border-transparent rounded-lg text-sm font-semibold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all cursor-pointer"
                  >
                    <option value={0}>Sunday</option>
                    <option value={1}>Monday</option>
                    <option value={2}>Tuesday</option>
                    <option value={3}>Wednesday</option>
                    <option value={4}>Thursday</option>
                    <option value={5}>Friday</option>
                    <option value={6}>Saturday</option>
                  </select>
                </div>
              )}

              {closureType === 'recurring_yearly' && (
                <div>
                  <Input
                    label="Holiday Date (Month & Day repeats annually) *"
                    type="date"
                    value={closureStartDate}
                    onChange={(e) => setClosureStartDate(e.target.value)}
                  />
                  <p className="text-[11px] text-[#5f5e5e] mt-1">
                    This day will automatically be marked closed every year on the same month & day.
                  </p>
                </div>
              )}

              <Input
                label="Holiday / Closure Title *"
                placeholder="e.g. Diwali Holiday, Studio Deep Cleaning, Sunday Off"
                value={closureTitle}
                onChange={(e) => setClosureTitle(e.target.value)}
              />

              <div>
                <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">
                  Reason Shown to Customers *
                </label>
                <textarea
                  rows={2}
                  value={closureReason}
                  onChange={(e) => setClosureReason(e.target.value)}
                  placeholder="e.g. Studio is closed for Diwali celebrations. Appointments will resume tomorrow."
                  className="w-full px-3 py-2 bg-[#f6f3f2] border border-transparent rounded-lg text-sm text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all"
                />
                <p className="text-[11px] text-[#5f5e5e] mt-1">
                  Customers will see this notice clearly on the booking calendar and time slot screen.
                </p>
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-end gap-2">
                <Button variant="ghost" onClick={() => setClosureModalOpen(false)}>
                  Cancel
                </Button>
                <Button
                  onClick={() => handleSaveClosure(false)}
                  loading={closureLoading || createClosureMut.isPending}
                  disabled={closureLoading || createClosureMut.isPending}
                  icon={<Ban size={14} />}
                >
                  Create Closure / Holiday
                </Button>
              </div>
            </div>
          ) : (
            /* Active Closures Table */
            <div className="pt-1">
              {closuresList.length === 0 ? (
                <div className="py-12 text-center bg-gray-50 rounded-xl border border-gray-100">
                  <Calendar size={32} className="text-gray-300 mx-auto mb-2" />
                  <p className="text-sm font-bold text-[#0F172A]">No Active Closures or Holidays</p>
                  <p className="text-xs text-[#5f5e5e] mt-0.5">Add a closure using the tab above.</p>
                </div>
              ) : (
                <div className="overflow-x-auto max-h-[420px] rounded-lg border border-gray-200">
                  <table className="w-full border-collapse text-left text-xs">
                    <thead className="bg-[#f6f3f2] sticky top-0 z-10 border-b border-gray-200">
                      <tr>
                        <th className="p-3 font-extrabold uppercase text-[#5f5e5e]">Title & Reason</th>
                        <th className="p-3 font-extrabold uppercase text-[#5f5e5e]">Scope</th>
                        <th className="p-3 font-extrabold uppercase text-[#5f5e5e]">Schedule</th>
                        <th className="p-3 font-extrabold uppercase text-[#5f5e5e] text-right">Action</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-100 bg-white">
                      {closuresList.map((c: any) => {
                        const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
                        let scheduleText = '';
                        if (c.is_recurring) {
                          if (c.recurrence_type === 'weekly') {
                            scheduleText = `Weekly: Every ${dayNames[c.recurrence_day] || 'Week'}`;
                          } else if (c.recurrence_type === 'yearly') {
                            scheduleText = `Annual: Every year on ${c.start_date ? c.start_date.substring(5) : ''}`;
                          }
                        } else {
                          if (c.slot_time) {
                            scheduleText = `${c.start_date} at ${formatTime(c.slot_time)}`;
                          } else if (c.start_date === c.end_date) {
                            scheduleText = `${c.start_date} (Full Day)`;
                          } else {
                            scheduleText = `${c.start_date} to ${c.end_date}`;
                          }
                        }

                        return (
                          <tr key={c.id} className="hover:bg-gray-50/70 transition-colors">
                            <td className="p-3">
                              <p className="font-extrabold text-[#0F172A]">{c.title || 'Studio Closure'}</p>
                              {c.reason && <p className="text-gray-500 text-[11px] mt-0.5">{c.reason}</p>}
                            </td>
                            <td className="p-3">
                              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-rose-50 text-rose-700 border border-rose-200">
                                {c.closure_type || (c.is_recurring ? c.recurrence_type : 'closure')}
                              </span>
                            </td>
                            <td className="p-3 text-gray-700 font-medium">
                              {scheduleText}
                            </td>
                            <td className="p-3 text-right">
                              <button
                                onClick={() => handleReopenClosure(c.id, c.title)}
                                className="px-2.5 py-1 text-xs font-bold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 rounded-lg border border-emerald-200 transition-colors uppercase tracking-wider"
                              >
                                Reopen
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </div>
      </Modal>

      {/* ═══ Affected Bookings Conflict Modal ═══ */}
      <Modal
        open={conflictModalOpen}
        onClose={() => setConflictModalOpen(false)}
        title="⚠️ Existing Bookings Found in Closure Range"
        size="lg"
        footer={
          <>
            <Button
              variant="ghost"
              onClick={() => setConflictModalOpen(false)}
              disabled={closureLoading}
            >
              Cancel
            </Button>
            <Button
              variant="danger"
              onClick={handleConfirmConflictReschedule}
              loading={closureLoading}
              disabled={closureLoading}
              icon={<RotateCcw size={14} />}
            >
              Confirm Closure & Mark for Reschedule ({affectedBookings.length})
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <div className="p-4 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
            <AlertTriangle size={20} className="text-amber-600 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-extrabold text-sm text-amber-950">
                Action Required: {affectedBookings.length} Active Booking(s) Affected
              </p>
              <p className="mt-1 leading-relaxed">
                As per system policy, bookings are <strong>NEVER silently deleted</strong>. Confirming this closure will automatically:
              </p>
              <ul className="list-disc list-inside mt-1 font-semibold space-y-0.5">
                <li>Change their status to <strong>Reschedule Required</strong></li>
                <li>Send automated notification to the customer with reschedule link</li>
                <li>Safely preserve payment and package credit history</li>
              </ul>
            </div>
          </div>

          <div className="overflow-x-auto max-h-[300px] rounded-lg border border-gray-200">
            <table className="w-full border-collapse text-left text-xs">
              <thead className="bg-[#f6f3f2] sticky top-0 border-b border-gray-200">
                <tr>
                  <th className="p-2.5 font-extrabold uppercase text-[#5f5e5e]">Booking #</th>
                  <th className="p-2.5 font-extrabold uppercase text-[#5f5e5e]">Customer</th>
                  <th className="p-2.5 font-extrabold uppercase text-[#5f5e5e]">Vehicle</th>
                  <th className="p-2.5 font-extrabold uppercase text-[#5f5e5e]">Slot Time</th>
                  <th className="p-2.5 font-extrabold uppercase text-[#5f5e5e]">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {affectedBookings.map((b: any) => (
                  <tr key={b.id} className="hover:bg-gray-50">
                    <td className="p-2.5 font-extrabold text-[#2563EB]">
                      #{b.id}
                    </td>
                    <td className="p-2.5">
                      <p className="font-bold text-[#0F172A]">{b.customer_name || 'Customer'}</p>
                      <p className="text-[11px] text-[#5f5e5e]">{b.customer_mobile || '-'}</p>
                    </td>
                    <td className="p-2.5">
                      <p className="font-semibold text-[#0F172A]">{b.vehicle_brand} {b.vehicle_model}</p>
                      <p className="text-[10px] text-gray-500 uppercase">{b.vehicle_reg_no || ''}</p>
                    </td>
                    <td className="p-2.5 font-medium text-gray-700">
                      {b.slot_date} at {formatTime(b.start_time)}
                    </td>
                    <td className="p-2.5">
                      <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase bg-amber-50 text-amber-700 border border-amber-200">
                        {b.status}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      </Modal>
    </>
  );
}
