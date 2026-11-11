import { useEffect, useState } from 'react';
import { CalendarPlus, CheckSquare } from 'lucide-react';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import { useUIStore } from '../../store/uiStore';
import { formatDate, ymd } from '../../utils/formatters';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

const STATUS: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-800', approved: 'bg-emerald-100 text-emerald-800', rejected: 'bg-rose-100 text-rose-700',
  in_progress: 'bg-blue-100 text-blue-800', completed: 'bg-emerald-100 text-emerald-800', cancelled: 'bg-slate-100 text-slate-500',
};

/** Employee self-service: request leave, see approval status, work through assigned tasks. */
export default function MyHRPage() {
  const toast = useUIStore(s => s.toast);
  const [leaves, setLeaves] = useState<any[]>([]);
  const [balance, setBalance] = useState<any>(null);
  const [tasks, setTasks] = useState<any[]>([]);
  const today = ymd();
  const [form, setForm] = useState({ leave_type: 'casual', from_date: today, to_date: today, reason: '' });
  const [saving, setSaving] = useState(false);

  const load = async () => {
    try {
      const [l, t] = await Promise.all([api.get('/staff-hr/leaves', { params: { mine: 1 } }), api.get('/staff-hr/tasks', { params: { mine: 1 } })]);
      setLeaves(l.data.data || []);
      setBalance(l.data.my_balance);
      setTasks(t.data.data || []);
    } catch (e: any) { toast('error', e.message); }
  };
  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => { load(); }, []);

  const submit = async () => {
    if (!form.reason.trim()) { toast('error', 'Please give a reason'); return; }
    if (form.to_date < form.from_date) { toast('error', 'To-date must be on or after from-date'); return; }
    setSaving(true);
    try {
      const { data } = await api.post('/staff-hr/leaves', form);
      toast('success', data.message);
      setForm({ ...form, reason: '' });
      load();
    } catch (e: any) { toast('error', e.message); } finally { setSaving(false); }
  };

  const setTask = async (id: number, status: string) => {
    try { await api.put(`/staff-hr/tasks/${id}/status`, { status }); load(); }
    catch (e: any) { toast('error', e.message); }
  };

  const cls = 'w-full px-3 py-2.5 border border-gray-300 rounded-lg text-sm bg-white';
  return (
    <>
      <AdminTopBar title="My Leaves & Tasks" subtitle="Request leave and update the tasks assigned to you" />
      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-4">
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><CalendarPlus size={18} className="text-blue-600" /> Request leave</h3>
          {balance && (
            <p className="text-xs text-slate-600">Your admin decides if the leave is paid or unpaid when approving it.</p>
          )}
          <div className="grid grid-cols-3 gap-3">
            <Dropdown className={cls} value={form.leave_type} onChange={e => setForm({ ...form, leave_type: e.target.value })}>
              <option value="casual">Casual / personal</option><option value="sick">Sick</option>
            </Dropdown>
            <input className={cls} type="date" value={form.from_date} min={today} onChange={e => setForm({ ...form, from_date: e.target.value, to_date: e.target.value > form.to_date ? e.target.value : form.to_date })} />
            <input className={cls} type="date" value={form.to_date} min={form.from_date} onChange={e => setForm({ ...form, to_date: e.target.value })} />
          </div>
          <textarea className={cls} rows={2} placeholder="Reason" value={form.reason} onChange={e => setForm({ ...form, reason: e.target.value })} />
          <Button loading={saving} onClick={submit}>Send for approval</Button>

          <div className="divide-y divide-slate-100">
            {leaves.map(l => (
              <div key={l.id} className="py-2.5 flex items-center justify-between text-sm">
                <div>
                  <p className="font-semibold capitalize">{l.leave_type} · {formatDate(l.from_date)} → {formatDate(l.to_date)} ({l.days_count}d){l.pay_type ? ` · ${l.pay_type}` : ''}</p>
                  <p className="text-xs text-slate-500">{l.reason}{l.approved_by_name ? ` · by ${l.approved_by_name}` : ''}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${STATUS[l.status]}`}>{l.status}</span>
              </div>
            ))}
            {!leaves.length && <p className="py-4 text-sm text-slate-400 text-center">No leave requests yet</p>}
          </div>
        </section>

        <section className="bg-white rounded-xl border border-slate-200 p-5 space-y-3">
          <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><CheckSquare size={18} className="text-blue-600" /> My tasks</h3>
          {tasks.map(t => (
            <div key={t.id} className="p-3 rounded-lg border border-slate-200">
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-sm">{t.title}</p>
                  {t.description && <p className="text-xs text-slate-500 mt-0.5">{t.description}</p>}
                  <p className="text-[11px] text-slate-400 mt-1 capitalize">{t.priority} priority{t.due_date ? ` · due ${formatDate(t.due_date)}` : ''}{t.assigned_by_name ? ` · from ${t.assigned_by_name}` : ''}</p>
                </div>
                <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${STATUS[t.status]}`}>{t.status.replace('_', ' ')}</span>
              </div>
              {(t.status === 'pending' || t.status === 'in_progress') && (
                <div className="flex gap-2 mt-2">
                  {t.status === 'pending' && <Button size="sm" variant="secondary" onClick={() => setTask(t.id, 'in_progress')}>Start</Button>}
                  <Button size="sm" onClick={() => setTask(t.id, 'completed')}>Mark done</Button>
                </div>
              )}
            </div>
          ))}
          {!tasks.length && <p className="py-4 text-sm text-slate-400 text-center">No tasks assigned</p>}
        </section>
      </div>
    </>
  );
}
