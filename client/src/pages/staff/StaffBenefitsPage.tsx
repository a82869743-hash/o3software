import { useEffect, useState } from 'react';
import { Wallet, Gift, Download } from 'lucide-react';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useUIStore } from '../../store/uiStore';
import { formatINR, formatDate } from '../../utils/formatters';
import { useLiveReload } from '../../utils/liveUpdates';
import ReferFriend from '../../components/shared/ReferFriend';

/** Employee self-service: salary method, monthly slips, referral earnings (paid / unpaid). */
export default function StaffBenefitsPage() {
  const toast = useUIStore(s => s.toast);
  const [data, setData] = useState<any>(null);

  const [live, setLive] = useState(0);
  useLiveReload(() => setLive(n => n + 1)); // reload when anything changes elsewhere
  useEffect(() => {
    api.get('/salary/my').then(r => setData(r.data.data)).catch((e: any) => toast('error', e.message));
  }, [toast, live]);

  const download = async (id: number, month: string) => {
    try {
      const res = await api.get(`/salary/my/${id}/slip`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `Salary_${month}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast('error', 'Could not download the salary slip'); }
  };

  const m = data?.salary_method;
  const refs: any[] = data?.referrals || [];
  const unpaid = refs.filter(r => r.status === 'unpaid').reduce((s, r) => s + Number(r.amount), 0);
  const paid = refs.filter(r => r.status === 'paid').reduce((s, r) => s + Number(r.amount), 0);

  return (
    <>
      <AdminTopBar title="My Salary & Referrals" subtitle="Your salary slips and referral earnings" />
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 mb-6">
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase text-slate-500">Salary method</p>
          <p className="text-lg font-extrabold capitalize mt-1">{m ? `${m.salary_type} · ${formatINR(m.salary_rate)}${m.salary_type === 'daily' ? '/day' : m.salary_type === 'hourly' ? '/hour' : '/month'}` : '—'}</p>
          {m && <p className="text-xs text-slate-500">{m.paid_leaves_per_month} paid leave(s) per month</p>}
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase text-slate-500">Referral earnings due</p>
          <p className="text-lg font-extrabold text-amber-700 mt-1">{formatINR(unpaid)}</p>
        </div>
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <p className="text-[11px] font-bold uppercase text-slate-500">Referral earnings paid</p>
          <p className="text-lg font-extrabold text-emerald-700 mt-1">{formatINR(paid)}</p>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-extrabold flex items-center gap-2 mb-3"><Wallet size={18} className="text-blue-600" /> Salary slips</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Month</th><th className="text-right">Net</th><th className="text-left pl-3">Status</th><th></th></tr></thead>
            <tbody>
              {(data?.slips || []).map((s: any) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2">{s.month_year}<div className="text-[11px] text-slate-400">{s.notes}</div></td>
                  <td className="text-right font-bold">{formatINR(s.final_salary)}</td>
                  <td className="pl-3 capitalize">{s.status}{s.include_referral ? ' (incl. referrals)' : ''}</td>
                  <td className="text-right"><button className="text-blue-600" title="Download slip" onClick={() => download(s.id, s.month_year)}><Download size={15} /></button></td>
                </tr>
              ))}
              {!(data?.slips || []).length && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No salary generated yet</td></tr>}
            </tbody>
          </table>
        </section>
        <div className="border border-slate-200 rounded-2xl"><ReferFriend /></div>
        <section className="bg-white rounded-xl border border-slate-200 p-5">
          <h3 className="font-extrabold flex items-center gap-2 mb-3"><Gift size={18} className="text-blue-600" /> My referrals</h3>
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Date</th><th className="text-left">Customer</th><th className="text-right">Earned</th><th className="text-left pl-3">Status</th></tr></thead>
            <tbody>
              {refs.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  <td className="py-2">{formatDate(r.created_at)}</td>
                  <td>{r.referred_customer_name || r.source_label}</td>
                  <td className="text-right font-bold">{formatINR(r.amount)}</td>
                  <td className="pl-3 capitalize">{r.status}{r.paid_via ? ` · ${r.paid_via}` : ''}</td>
                </tr>
              ))}
              {!refs.length && <tr><td colSpan={4} className="py-6 text-center text-slate-400">No referrals yet</td></tr>}
            </tbody>
          </table>
        </section>
      </div>
    </>
  );
}
