import { useEffect, useState } from 'react';
import { UserPlus, CheckCircle2, Clock } from 'lucide-react';
import api from '../../api/axiosInstance';
import Input from '../ui/Input';
import { useUIStore } from '../../store/uiStore';
import { formatINR, formatDate } from '../../utils/formatters';
import { carBrands, getModelsForBrand } from '../../utils/carData';
import { useLiveReload } from '../../utils/liveUpdates';

const STAGE: Record<string, string> = {
  invited: 'Team will contact them',
  joined: 'Signed up',
  in_service: 'Service in progress',
  service_done: 'Service done',
};

/**
 * "Refer a friend" — the friend's name, number and car (name, colour, model) go to the studio as a lead.
 * The referrer earns only after the friend's first service is done. Used by customers and employees.
 */
export default function ReferFriend() {
  const toast = useUIStore(s => s.toast);
  const empty = { friend_name: '', friend_mobile: '', car_brand: '', car_model: '', car_colour: '' };
  const [form, setForm] = useState(empty);
  const [saving, setSaving] = useState(false);
  const [invites, setInvites] = useState<any[]>([]);
  const [live, setLive] = useState(0);
  useLiveReload(() => setLive(n => n + 1));
  useEffect(() => { api.get('/referrals/my').then(r => setInvites(r.data.data?.invites || [])).catch(() => {}); }, [live]);

  const set = (k: keyof typeof empty) => (e: any) => setForm(f => ({ ...f, [k]: e.target.value, ...(k === 'car_brand' ? { car_model: '' } : {}) }));
  const models = form.car_brand ? getModelsForBrand(form.car_brand) : [];

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const r = await api.post('/referrals/invite', form);
      toast('success', r.data.message || 'Referral sent');
      setForm(empty);
      setLive(n => n + 1);
    } catch (err: any) {
      toast('error', err.message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-white rounded-2xl p-4 shadow-sm">
      <h3 className="font-extrabold text-slate-900 flex items-center gap-2"><UserPlus size={18} className="text-blue-600" /> Refer a friend</h3>
      <p className="text-xs text-slate-500 mt-0.5 mb-3">Share their details and our team will contact them. You earn once their first service is done.</p>
      <form onSubmit={submit} className="space-y-2.5">
        <Input label="Friend's name" value={form.friend_name} onChange={set('friend_name')} required />
        <Input label="Mobile number" inputMode="numeric" value={form.friend_mobile} onChange={set('friend_mobile')} required />
        <div className="grid grid-cols-2 gap-2.5">
          <Input label="Car name" value={form.car_brand} onChange={set('car_brand')} listOptions={carBrands} placeholder="e.g. Hyundai" required />
          <Input label="Car model" value={form.car_model} onChange={set('car_model')} listOptions={models} placeholder="e.g. Creta" required />
        </div>
        <Input label="Car colour" value={form.car_colour} onChange={set('car_colour')} listOptions={['White', 'Black', 'Silver', 'Grey', 'Red', 'Blue', 'Brown', 'Beige', 'Green', 'Orange', 'Yellow']} placeholder="e.g. White" required />
        <button disabled={saving} className="tap w-full bg-blue-600 text-white font-extrabold rounded-2xl py-3 disabled:opacity-60">{saving ? 'Sending…' : 'Send referral'}</button>
      </form>

      {invites.length > 0 && (
        <div className="mt-4">
          <p className="text-xs font-bold text-slate-500 uppercase mb-1">Friends you referred</p>
          {invites.map(i => (
            <div key={i.id} className="flex items-center justify-between py-2.5 border-t border-slate-100">
              <div className="min-w-0">
                <p className="text-sm font-bold text-slate-900 truncate">{i.friend_name}</p>
                <p className="text-xs text-slate-500 truncate">{i.car} · {formatDate(i.created_at)}</p>
              </div>
              <div className="text-right shrink-0 pl-2">
                {i.stage === 'service_done' && <p className="text-sm font-black">{formatINR(i.amount)}</p>}
                <p className={`text-[11px] font-bold flex items-center gap-1 justify-end ${i.stage === 'service_done' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {i.stage === 'service_done' ? <CheckCircle2 size={12} /> : <Clock size={12} />}
                  {i.stage === 'service_done' ? (i.paid ? 'Paid' : 'Reward due') : STAGE[i.stage]}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
