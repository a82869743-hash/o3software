import { Link } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { Activity, Star, Gift, Copy, Droplets, Bell } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { formatINR, formatDate } from '../../utils/formatters';
import { APP_URL } from '../../utils/endpoints';
import { copyText } from '../../utils/copyText';

/** Customer home: live job status, services awaiting a rating, referral code & earnings, loyalty points. */
export default function CustomerActionCenter({ data }: { data: any }) {
  const toast = useUIStore(s => s.toast);
  const [refCode, setRefCode] = useState<string | null>(null);

  useEffect(() => {
    api.get('/referrals/my').then(r => setRefCode(r.data.data?.code || null)).catch(() => {});
  }, []);

  const jobs: any[] = data?.active_jobs || [];
  const washes: any[] = data?.active_washes || [];
  const pending: any[] = data?.pending_feedback || [];
  const updates: any[] = data?.updates || [];
  // WhatsApp text → plain text for the app (drop *bold* marks and hidden characters)
  const clean = (t: string) => String(t || '').replace(/[​-‍⁠﻿]/g, '').replace(/\*/g, '').trim(); // hidden chars: ​-‍, ⁠,
  const ref = data?.referrals || { paid: 0, unpaid: 0, referrals: 0 };

  const share = () => {
    if (!refCode) return;
    const text = `Get your car detailed at O3 Car Spaa! Use my referral code ${refCode} when you sign up: ${APP_URL}/register`;
    copyText(text);
    toast('success', 'Referral message copied — paste it on WhatsApp');
  };

  return (
    <div className="space-y-4 mb-6">
      {(jobs.length > 0 || washes.length > 0) && (
        <div className="bg-white rounded-2xl border border-blue-200 p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3"><Activity size={16} className="text-blue-600" /> Your car right now</h3>
          <div className="space-y-2">
            {jobs.map(j => (
              <div key={j.id} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-blue-50/60">
                <div>
                  <p className="text-sm font-bold">{j.brand} {j.model} · {j.registration_no}</p>
                  <p className="text-xs text-blue-700 font-semibold">{j.current_stage || 'Received'}{Number(j.balance_due) > 0 ? ` · Due ${formatINR(j.balance_due)}` : ''}</p>
                </div>
                {j.public_token && <Link to={`/job/${j.public_token}`} className="px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg">Track live</Link>}
              </div>
            ))}
            {washes.map(w => (
              <div key={`w${w.id}`} className="flex items-center justify-between gap-3 p-3 rounded-xl bg-sky-50">
                <div>
                  <p className="text-sm font-bold flex items-center gap-1"><Droplets size={14} className="text-sky-600" /> {w.vehicle_brand} {w.vehicle_model} · {w.vehicle_reg_no}</p>
                  <p className="text-xs text-sky-700 font-semibold capitalize">{w.wash_status === 'pending' ? `In queue (#${w.queue_position})` : `Washing${w.current_phase ? ` — ${String(w.current_phase).replace(/_/g, ' ')}` : ''}`}</p>
                </div>
                <Link to={`/job/${w.id}`} className="px-3 py-1.5 bg-sky-600 text-white text-xs font-bold rounded-lg">Track</Link>
              </div>
            ))}
          </div>
        </div>
      )}

      {updates.length > 0 && (
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3"><Bell size={16} className="text-blue-600" /> Updates</h3>
          <div className="space-y-2 max-h-72 overflow-y-auto">
            {updates.map(u => (
              <div key={u.id} className="p-3 rounded-xl bg-slate-50">
                <div className="flex justify-between gap-2 mb-1">
                  <p className="text-xs font-bold text-slate-800">{u.template_name && u.template_name !== 'MANUAL' && u.template_name !== 'CUSTOM_NOTIFICATION' ? u.template_name : 'Message from O3 Car Spaa'}</p>
                  <p className="text-[10px] text-slate-400 shrink-0">{formatDate(u.created_at)}</p>
                </div>
                <p className="text-xs text-slate-600 whitespace-pre-line line-clamp-3">{clean(u.message_body)}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {pending.length > 0 && (
        <div className="bg-amber-50 rounded-2xl border border-amber-200 p-4">
          <h3 className="text-sm font-extrabold text-amber-900 flex items-center gap-2 mb-2"><Star size={16} className="text-amber-500" fill="currentColor" /> How was your service?</h3>
          <div className="flex flex-wrap gap-2">
            {pending.map(p => (
              <Link key={p.token} to={`/feedback/${p.token}`} className="px-3 py-2 bg-white border border-amber-300 rounded-xl text-xs font-bold text-amber-900 hover:bg-amber-100">
                Rate {p.job_cart_id ? `job #${p.job_cart_id}` : 'quick wash'} · {formatDate(p.sent_at)}
              </Link>
            ))}
          </div>
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-2"><Gift size={16} className="text-emerald-600" /> Refer & earn</h3>
          {refCode ? (
            <div className="flex items-center gap-2">
              <span className="px-3 py-1.5 bg-emerald-50 border border-emerald-200 rounded-lg font-mono font-bold text-emerald-800">{refCode}</span>
              <button onClick={share} className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1"><Copy size={12} /> Copy invite</button>
            </div>
          ) : <p className="text-xs text-slate-500">Loading your code…</p>}
          <p className="text-xs text-slate-600 mt-2">{ref.referrals} referral(s) · earned {formatINR(Number(ref.paid) + Number(ref.unpaid))} · paid {formatINR(ref.paid)}{Number(ref.unpaid) > 0 ? ` · due ${formatINR(ref.unpaid)}` : ''}</p>
        </div>
        <div className="bg-white rounded-2xl border border-slate-200 p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-2"><Star size={16} className="text-amber-500" /> Loyalty points</h3>
          <p className="text-2xl font-black text-slate-900">{Number(data?.loyalty_points || 0).toLocaleString('en-IN')}</p>
          <Link to="/customer/loyalty" className="text-xs font-bold text-blue-600">View rewards →</Link>
        </div>
      </div>
    </div>
  );
}
