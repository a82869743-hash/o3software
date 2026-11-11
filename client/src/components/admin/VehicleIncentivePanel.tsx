import { useState } from 'react';
import { AlertTriangle, Award } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { formatINR } from '../../utils/formatters';

const TYPE_LABEL: Record<string, string> = { washing: 'Washing', coating: 'Coating', ppf: 'PPF', bliss: 'O3 Bliss' };

/**
 * Who earned incentive on this vehicle (slab position + amount) and a "Log complaint" action.
 * A complaint withholds the incentive; from a person's 4th complaint in the month it is also deducted from salary.
 */
export default function VehicleIncentivePanel({ jobCartId, bookingId, splits = [], onDone }: { jobCartId?: number; bookingId?: number; splits?: any[]; onDone?: () => void }) {
  const toast = useUIStore(s => s.toast);
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);
  const rows = splits.filter(s => s.incentive_type);
  const complained = rows.some(s => s.complaint_id);

  const submit = async () => {
    setSaving(true);
    try {
      const r = await api.post('/incentives/complaints', { job_cart_id: jobCartId, booking_id: bookingId, reason });
      toast('success', r.data.message || 'Complaint logged');
      setOpen(false); setReason(''); onDone?.();
    } catch (e: any) {
      toast('error', e.response?.data?.error || e.message);
    } finally { setSaving(false); }
  };

  return (
    <div className="bg-white rounded-2xl border border-gray-100 shadow-sm p-4">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <h3 className="font-extrabold text-[#0F172A] flex items-center gap-2"><Award size={17} className="text-amber-500" /> Staff incentive for this vehicle</h3>
        {!complained && (
          <button type="button" onClick={() => setOpen(o => !o)} className="text-xs font-bold text-rose-600 flex items-center gap-1">
            <AlertTriangle size={14} /> Log complaint
          </button>
        )}
      </div>
      {rows.length === 0
        ? <p className="text-xs text-gray-500 mt-2">No incentive yet. It is worked out when the job is completed, for the technician and team on this card.</p>
        : (
          <div className="mt-2 divide-y divide-gray-100">
            {rows.map(s => (
              <div key={s.id} className="py-2 flex items-center justify-between text-sm">
                <div>
                  <p className="font-bold text-slate-800">{s.user_name}</p>
                  <p className="text-[11px] text-slate-500">{TYPE_LABEL[s.incentive_type] || s.incentive_type} · {s.vehicle_class === 'bike' ? 'bike' : 'car'} #{s.slab_position} this month</p>
                </div>
                <div className="text-right">
                  {s.status === 'withheld'
                    ? <><p className="text-xs font-bold text-rose-600 line-through">{formatINR(s.base_amount)}</p><p className="text-[10px] font-bold text-rose-600">{Number(s.penalty_amount) > 0 ? `Withheld + ${formatINR(s.penalty_amount)} salary cut` : 'Withheld (complaint)'}</p></>
                    : <><p className="font-black text-slate-900">{formatINR(s.amount)}</p><p className="text-[10px] text-slate-500">{s.status === 'paid' ? 'Paid in salary' : 'Due'}</p></>}
                </div>
              </div>
            ))}
          </div>
        )}
      {open && (
        <div className="mt-3 border-t border-gray-100 pt-3 space-y-2">
          <textarea value={reason} onChange={e => setReason(e.target.value)} rows={2} placeholder="What is the complaint about?"
            className="w-full px-3 py-2 border border-slate-200 rounded-xl text-sm focus:outline-none focus:border-rose-400" />
          <p className="text-[11px] text-slate-500">Incentive for this vehicle will be withheld. From a person's 4th complaint this month, the same amount is also deducted from their salary.</p>
          <button type="button" disabled={saving || reason.trim().length < 3} onClick={submit}
            className="w-full py-2 rounded-xl bg-rose-600 text-white text-sm font-bold disabled:opacity-50">{saving ? 'Saving…' : 'Log complaint'}</button>
        </div>
      )}
    </div>
  );
}
