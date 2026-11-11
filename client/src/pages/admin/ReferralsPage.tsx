import { useEffect, useMemo, useState } from 'react';
import { Gift, Download, Settings, Plus, Trophy, CheckCircle2, Undo2 } from 'lucide-react';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import ReferrerPicker, { ReferrerValue, referrerPayload } from '../../components/shared/ReferrerPicker';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { can } from '../../utils/access';
import { formatINR, formatDate } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

type Row = {
  id: number; referrer_type: string; referrer_name: string; referrer_mobile?: string; referred_customer_name?: string;
  source_type: string; source_label?: string; bill_amount: number; amount: number; status: string; paid_via?: string;
  paid_at?: string; created_at: string; salary_month?: string; reward_type: string; reward_rate: number;
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-slate-100 text-slate-600',
  unpaid: 'bg-amber-100 text-amber-800',
  paid: 'bg-emerald-100 text-emerald-800',
  cancelled: 'bg-rose-100 text-rose-700',
};

export default function ReferralsPage() {
  const toast = useUIStore(s => s.toast);
  const user = useAuthStore(s => s.user);
  const canPay = can(user, 'referrals', 'pay');
  const canEdit = can(user, 'referrals', 'edit');

  const [rows, setRows] = useState<Row[]>([]);
  const [summary, setSummary] = useState<any>(null);
  const [status, setStatus] = useState('all');
  const [type, setType] = useState('all');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<number[]>([]);
  const [payVia, setPayVia] = useState('cash');
  const [busy, setBusy] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [settings, setSettings] = useState<any>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [addRef, setAddRef] = useState<ReferrerValue>({ referrer_type: 'staff' });
  const [addAmount, setAddAmount] = useState('');
  const [addNote, setAddNote] = useState('');

  const load = async () => {
    try {
      const [l, s] = await Promise.all([
        api.get('/referrals', { params: { status, referrer_type: type, search: search || undefined } }),
        api.get('/referrals/summary'),
      ]);
      setRows(l.data.data || []);
      setSummary(s.data.data);
      setSelected([]);
    } catch (e: any) {
      toast('error', e.message || 'Failed to load referrals');
    }
  };
  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => { load(); }, [status, type]);

  const unpaidSelected = useMemo(() => rows.filter(r => selected.includes(r.id) && r.status === 'unpaid'), [rows, selected]);

  const pay = async () => {
    if (!unpaidSelected.length) return;
    setBusy(true);
    try {
      const { data } = await api.post('/referrals/pay', { ids: unpaidSelected.map(r => r.id), paid_via: payVia });
      toast('success', data.message);
      load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const unpay = async (id: number) => {
    try { await api.post(`/referrals/${id}/unpay`); toast('success', 'Marked unpaid'); load(); }
    catch (e: any) { toast('error', e.message); }
  };

  const openSettings = async () => {
    try { const { data } = await api.get('/referrals/settings'); setSettings(data.data); setShowSettings(true); }
    catch (e: any) { toast('error', e.message); }
  };
  const saveSettings = async () => {
    setBusy(true);
    try { await api.put('/referrals/settings', settings); toast('success', 'Referral rewards saved'); setShowSettings(false); }
    catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const addManual = async () => {
    setBusy(true);
    try {
      await api.post('/referrals', { ...referrerPayload(addRef), amount: Number(addAmount), notes: addNote });
      toast('success', 'Referral added'); setShowAdd(false); setAddAmount(''); setAddNote(''); load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const doExport = () => exportToExcel<Row>('Referrals', 'Referrals', [
    { header: 'Date', value: 'created_at', type: 'date' },
    { header: 'Referred By', value: 'referrer_name', width: 22 },
    { header: 'Referred By (Type)', value: 'referrer_type' },
    { header: 'Referred By (Mobile)', value: 'referrer_mobile' },
    { header: 'New Customer', value: 'referred_customer_name', width: 22 },
    { header: 'Source', value: r => r.source_label || r.source_type, width: 26 },
    { header: 'Bill Amount', value: 'bill_amount', type: 'money' },
    { header: 'Reward', value: r => (r.reward_type === 'percent' ? `${r.reward_rate}%` : `₹${r.reward_rate}`) },
    { header: 'Earned', value: 'amount', type: 'money' },
    { header: 'Status', value: 'status' },
    { header: 'Paid Via', value: r => r.paid_via ? `${r.paid_via}${r.salary_month ? ` (${r.salary_month})` : ''}` : '' },
    { header: 'Paid On', value: 'paid_at', type: 'date' },
  ], rows, 'O3 Car Spaa — Referral Ledger');

  const t = summary?.totals || {};
  const fieldCls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white';

  return (
    <>
      <AdminTopBar title="Referrals" subtitle="Who brought customers in, what they earned, and what has been paid" />

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
        {[
          ['Referrals', t.total_referrals || 0, false],
          ['Business generated', t.business_generated || 0, true],
          ['Unpaid (owed)', t.unpaid_amount || 0, true],
          ['Paid out', t.paid_amount || 0, true],
          ['Pending (bill not final)', t.pending_amount || 0, true],
        ].map(([label, v, money]) => (
          <div key={label as string} className="bg-white rounded-xl border border-slate-200 p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">{label}</p>
            <p className="text-xl font-extrabold text-slate-900 mt-1">{money ? formatINR(v as number) : String(v)}</p>
          </div>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-4 mb-5">
        {/* Top referrers — ranked list */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3"><Trophy size={16} className="text-amber-500" /> Top referrers</h3>
          <div className="space-y-2">
            {(summary?.top_referrers || []).slice(0, 8).map((r: any, i: number) => (
              <div key={i} className="flex items-center gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <span className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black shrink-0 ${i === 0 ? 'bg-amber-400 text-slate-900' : i === 1 ? 'bg-slate-300 text-slate-800' : i === 2 ? 'bg-orange-300 text-orange-900' : 'bg-white text-slate-500 border border-slate-200'}`}>{i + 1}</span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-bold text-slate-900 truncate">{r.referrer_name}</p>
                  <p className="text-[11px] text-slate-500 capitalize">{r.referrer_type} · {r.referrals} referral{Number(r.referrals) === 1 ? '' : 's'} · {formatINR(r.business)} business</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-sm font-black text-slate-900">{formatINR(r.earned)}</p>
                  {Number(r.unpaid) > 0 && <p className="text-[10.5px] font-bold text-amber-700">{formatINR(r.unpaid)} unpaid</p>}
                </div>
              </div>
            ))}
            {!(summary?.top_referrers || []).length && <p className="py-4 text-center text-sm text-slate-400">No referrals yet</p>}
          </div>
        </div>
        {/* Referred customers who spent the most */}
        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-4">
          <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2 mb-3"><Gift size={16} className="text-blue-600" /> Best referred customers</h3>
          <div className="space-y-2">
            {(summary?.top_referred_customers || []).slice(0, 8).map((c: any) => (
              <div key={c.referred_customer_id} className="flex items-center justify-between gap-3 rounded-xl bg-slate-50 px-3 py-2.5">
                <div className="min-w-0"><p className="text-sm font-bold text-slate-900 truncate">{c.customer_name}</p><p className="text-[11px] text-slate-500">{c.visits} visit{Number(c.visits) === 1 ? '' : 's'}</p></div>
                <p className="text-sm font-black text-slate-900 shrink-0">{formatINR(c.spent)}</p>
              </div>
            ))}
            {!(summary?.top_referred_customers || []).length && <p className="py-4 text-center text-sm text-slate-400">No data yet</p>}
          </div>
        </div>
      </div>

      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm">
        <div className="p-3 sm:p-4 space-y-2.5 border-b border-slate-100">
          <div className="flex gap-2">
            <input className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search name, mobile or job" value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
            <Button size="sm" variant="secondary" onClick={load}>Search</Button>
          </div>
          <div className="flex gap-1.5 overflow-x-auto no-scrollbar">
            {[['all', 'All'], ['unpaid', 'Unpaid'], ['paid', 'Paid'], ['pending', 'Pending'], ['cancelled', 'Cancelled']].map(([k, v]) => (
              <button key={k} onClick={() => setStatus(k)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${status === k ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-slate-600 border-slate-200'}`}>{v}</button>
            ))}
            <span className="w-px bg-slate-200 mx-1 shrink-0" />
            {[['all', 'Everyone'], ['staff', 'Staff'], ['customer', 'Customers'], ['external', 'Others']].map(([k, v]) => (
              <button key={k} onClick={() => setType(k)} className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border ${type === k ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>{v}</button>
            ))}
          </div>
          <div className="flex flex-wrap gap-2">
            <Button size="sm" variant="secondary" icon={<Download size={14} />} onClick={doExport} disabled={!rows.length}>Export</Button>
            {canEdit && <Button size="sm" variant="secondary" icon={<Settings size={14} />} onClick={openSettings}>Reward rules</Button>}
            {can(user, 'referrals', 'create') && <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>Add referral</Button>}
          </div>
        </div>
        {canPay && unpaidSelected.length > 0 && (
          <div className="px-4 py-3 bg-amber-50 border-b border-amber-200 flex flex-wrap items-center gap-3 text-sm">
            <span className="font-bold text-amber-900">{unpaidSelected.length} selected · {formatINR(unpaidSelected.reduce((s, r) => s + Number(r.amount), 0))}</span>
            <Dropdown className={fieldCls} value={payVia} onChange={e => setPayVia(e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option><option value="wallet">Customer wallet credit</option>
            </Dropdown>
            <Button size="sm" loading={busy} icon={<CheckCircle2 size={14} />} onClick={pay}>Mark paid</Button>
            <span className="text-xs text-amber-800">Staff can also get this money in their salary (Salary page → add referral money).</span>
          </div>
        )}

        <div className="md:hidden divide-y divide-slate-100">
          {rows.map(r => (
            <div key={r.id} className="p-3 flex gap-3">
              {canPay && <input type="checkbox" className="mt-1" disabled={r.status !== 'unpaid'} checked={selected.includes(r.id)} onChange={e => setSelected(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />}
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="font-bold text-sm text-slate-900 truncate">{r.referrer_name} → {r.referred_customer_name || '—'}</p>
                  <p className="font-black text-sm shrink-0">{formatINR(r.amount)}</p>
                </div>
                <p className="text-[11px] text-slate-500 capitalize">{r.referrer_type} · {formatDate(r.created_at)} · bill {formatINR(r.bill_amount)}</p>
                <div className="flex items-center gap-2 mt-1">
                  <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                  {canPay && r.status === 'paid' && r.paid_via !== 'salary' && <button className="text-[11px] font-bold text-slate-500 inline-flex items-center gap-1" onClick={() => unpay(r.id)}><Undo2 size={11} /> Undo</button>}
                </div>
              </div>
            </div>
          ))}
          {!rows.length && <p className="py-10 text-center text-sm text-slate-400">No referrals found.</p>}
        </div>
        <div className="hidden md:block overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-slate-50 text-xs text-slate-500 uppercase">
              <tr>
                {canPay && <th className="px-3 py-2 w-8"></th>}
                <th className="px-3 py-2 text-left">Date</th><th className="px-3 py-2 text-left">Referred by</th><th className="px-3 py-2 text-left">Customer</th>
                <th className="px-3 py-2 text-left">Source</th><th className="px-3 py-2 text-right">Bill</th><th className="px-3 py-2 text-right">Earned</th>
                <th className="px-3 py-2 text-left">Status</th><th className="px-3 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.id} className="border-t border-slate-100">
                  {canPay && (
                    <td className="px-3 py-2">
                      <input type="checkbox" disabled={r.status !== 'unpaid'} checked={selected.includes(r.id)}
                        onChange={e => setSelected(p => e.target.checked ? [...p, r.id] : p.filter(x => x !== r.id))} />
                    </td>
                  )}
                  <td className="px-3 py-2 whitespace-nowrap">{formatDate(r.created_at)}</td>
                  <td className="px-3 py-2"><div className="font-semibold">{r.referrer_name}</div><div className="text-xs text-slate-500 capitalize">{r.referrer_type}{r.referrer_mobile ? ` · ${r.referrer_mobile}` : ''}</div></td>
                  <td className="px-3 py-2">{r.referred_customer_name || '—'}</td>
                  <td className="px-3 py-2 text-xs">{r.source_label || r.source_type}</td>
                  <td className="px-3 py-2 text-right">{formatINR(r.bill_amount)}</td>
                  <td className="px-3 py-2 text-right font-bold">{formatINR(r.amount)}</td>
                  <td className="px-3 py-2">
                    <span className={`px-2 py-0.5 rounded-full text-[11px] font-bold capitalize ${STATUS_STYLE[r.status]}`}>{r.status}</span>
                    {r.status === 'paid' && <div className="text-[11px] text-slate-500 mt-0.5">via {r.paid_via}{r.salary_month ? ` (${r.salary_month} salary)` : ''}</div>}
                  </td>
                  <td className="px-3 py-2 text-right">
                    {canPay && r.status === 'paid' && r.paid_via !== 'salary' && (
                      <button className="text-xs font-bold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1" onClick={() => unpay(r.id)}><Undo2 size={12} /> Undo</button>
                    )}
                  </td>
                </tr>
              ))}
              {!rows.length && <tr><td colSpan={9} className="py-10 text-center text-slate-400">No referrals found. Add a "Referred by" on a job card or quick wash to start tracking.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>

      <Modal open={showSettings} onClose={() => setShowSettings(false)} title="Referral reward rules"
        footer={<><Button variant="ghost" onClick={() => setShowSettings(false)}>Cancel</Button><Button loading={busy} onClick={saveSettings}>Save</Button></>}>
        {settings && (
          <div className="space-y-4">
            {(['staff', 'customer', 'external'] as const).map(k => (
              <div key={k} className="grid grid-cols-3 gap-2 items-center">
                <span className="text-sm font-bold capitalize">{k === 'external' ? 'Other people' : k}</span>
                <Dropdown className={fieldCls} value={settings[k].type} onChange={e => setSettings({ ...settings, [k]: { ...settings[k], type: e.target.value } })}>
                  <option value="fixed">Fixed ₹ per job</option><option value="percent">% of bill</option>
                </Dropdown>
                <input className={fieldCls} type="number" min={0} value={settings[k].value} onChange={e => setSettings({ ...settings, [k]: { ...settings[k], value: e.target.value } })} />
              </div>
            ))}
            <p className="text-xs text-slate-500">Earnings are calculated when the job card / quick wash bill is completed. Already-paid referrals never change.</p>
          </div>
        )}
      </Modal>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add referral manually"
        footer={<><Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button><Button loading={busy} onClick={addManual}>Add</Button></>}>
        <div className="space-y-3">
          <ReferrerPicker value={addRef} onChange={setAddRef} />
          <input className={`${fieldCls} w-full`} type="number" min={1} placeholder="Amount earned (₹)" value={addAmount} onChange={e => setAddAmount(e.target.value)} />
          <input className={`${fieldCls} w-full`} placeholder="Note (e.g. corporate tie-up, 3 cars)" value={addNote} onChange={e => setAddNote(e.target.value)} />
        </div>
      </Modal>
    </>
  );
}
