import { useEffect, useState } from 'react';
import { Settings, Download, Wallet, SlidersHorizontal, Save } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { can } from '../../utils/access';
import { formatINR } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

const thisMonth = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; };

export default function StaffSalaryPage({ embedded = false }: { embedded?: boolean }) {
  const toast = useUIStore(s => s.toast);
  const user = useAuthStore(s => s.user);
  const canEdit = can(user, 'salary', 'edit');
  const canPay = can(user, 'salary', 'pay');

  const [monthYear, setMonthYear] = useState(thisMonth);
  const [rows, setRows] = useState<any[]>([]);
  const [loading, setLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [payRow, setPayRow] = useState<any>(null);
  const [payMode, setPayMode] = useState('cash');
  const [payInclude, setPayInclude] = useState(false);
  const [busy, setBusy] = useState(false);
  const [showMethods, setShowMethods] = useState(false);
  const [staff, setStaff] = useState<any[]>([]);

  const load = async () => {
    setLoading(true);
    try { const { data } = await api.get('/salary', { params: { month_year: monthYear } }); setRows(data.data || []); }
    catch (e: any) { toast('error', e.message); setRows([]); } finally { setLoading(false); }
  };
  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => { load(); }, [monthYear]);

  const generate = async () => {
    setGenerating(true);
    try { const { data } = await api.post('/salary/calculate', { month_year: monthYear }); toast('success', data.message); load(); }
    catch (e: any) { toast('error', e.message); } finally { setGenerating(false); }
  };

  const saveEdit = async () => {
    setBusy(true);
    try {
      await api.put(`/salary/${edit.id}`, { base_salary: edit.base_salary, bonus: edit.bonus, deductions: edit.deductions, include_referral: edit.include_referral, notes: edit.notes });
      toast('success', 'Salary updated'); setEdit(null); load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  // incentive left out stays owed and comes up again on the next salary
  const toggleIncentive = async (r: any) => {
    try { await api.put(`/salary/${r.id}`, { include_incentive: !Number(r.include_incentive ?? 1) }); load(); }
    catch (e: any) { toast('error', e.message); }
  };

  const toggleReferral = async (r: any) => {
    try { await api.put(`/salary/${r.id}`, { include_referral: !Number(r.include_referral) }); load(); }
    catch (e: any) { toast('error', e.message); }
  };

  const pay = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/salary/${payRow.id}/pay`, { payment_mode: payMode, include_referral: payInclude });
      toast('success', data.message); setPayRow(null); load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const slip = async (r: any) => {
    try {
      const res = await api.get(`/salary/${r.id}/slip`, { responseType: 'blob' });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement('a'); a.href = url; a.download = `Salary_${r.staff_name}_${r.month_year}.pdf`; a.click();
      URL.revokeObjectURL(url);
    } catch { toast('error', 'Could not generate the salary slip'); }
  };

  const openMethods = async () => {
    try { const { data } = await api.get('/staff'); setStaff((data.data || []).map((s: any) => ({ ...s }))); setShowMethods(true); }
    catch (e: any) { toast('error', e.message); }
  };
  const saveMethod = async (s: any) => {
    try {
      await api.put(`/staff/${s.id}`, { salary_type: s.salary_type, salary_rate: s.salary_rate, working_days_per_month: s.working_days_per_month, paid_leaves_per_month: s.paid_leaves_per_month });
      toast('success', `Saved salary method for ${s.name}`);
    } catch (e: any) { toast('error', e.message); }
  };

  const doExport = () => exportToExcel('Salary', `Salary ${monthYear}`, [
    { header: 'Employee', value: 'staff_name', width: 22 },
    { header: 'Mobile', value: 'staff_mobile' },
    { header: 'Method', value: (r: any) => `${r.salary_type || 'monthly'} @ ${r.salary_rate}` },
    { header: 'Present', value: 'days_present', type: 'number' },
    { header: 'Half Days', value: 'half_days', type: 'number' },
    { header: 'Paid Leave', value: 'paid_leave_days', type: 'number' },
    { header: 'Unpaid Leave', value: 'unpaid_leave_days', type: 'number' },
    { header: 'Hours', value: 'hours_worked', type: 'number' },
    { header: 'Earned Base', value: 'base_salary', type: 'money' },
    { header: 'Incentives', value: 'incentive_amount', type: 'money' },
    { header: 'Referral (included)', value: (r: any) => (Number(r.include_referral) ? r.referral_amount : 0), type: 'money' },
    { header: 'Bonus', value: 'bonus', type: 'money' },
    { header: 'Deductions', value: 'deductions', type: 'money' },
    { header: 'Net Salary', value: 'final_salary', type: 'money' },
    { header: 'Status', value: 'status' },
    { header: 'Paid Via', value: 'payment_mode' },
  ], rows, `O3 Car Spaa — Salary ${monthYear}`);

  const cls = 'px-2 py-1.5 border border-gray-300 rounded-lg text-sm w-full';
  return (
    <>
      {!embedded && <AdminTopBar title="Salary" subtitle="Auto-generated from each employee's salary method, attendance, approved leave, incentives and referrals" />}

      <div className="flex flex-wrap items-center gap-2 mb-5">
        <input type="month" className="px-3 py-2 border border-gray-300 rounded-lg text-sm" value={monthYear} onChange={e => setMonthYear(e.target.value)} />
        {canEdit && <Button onClick={generate} loading={generating} icon={<Settings size={16} />}>Generate / refresh salary</Button>}
        {canEdit && <Button variant="secondary" onClick={openMethods} icon={<SlidersHorizontal size={16} />}>Set staff salary (monthly / daily / hourly)</Button>}
        <Button variant="secondary" onClick={doExport} disabled={!rows.length} icon={<Download size={16} />}>Export Excel</Button>
      </div>

      {rows.some((r: any) => !Number(r.salary_rate)) && (
        <div className="mb-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
          {rows.filter((r: any) => !Number(r.salary_rate)).length} staff have no salary set (₹0). Tap <b>Set staff salary</b>, enter monthly / per day / per hour pay for each person, then tap <b>Generate / refresh salary</b>.
          Pay is worked out from attendance and approved leave, and incentives and unpaid referral earnings are added.
        </div>
      )}

      {/* Phone: one salary card per employee */}
      <div className="md:hidden space-y-2.5">
        {loading && <p className="p-6 text-center text-slate-400 text-sm">Loading…</p>}
        {!loading && !rows.length && <p className="p-8 text-center text-slate-400 text-sm bg-white rounded-2xl">No salary for {monthYear} yet. Set each employee's salary method, then tap "Generate".</p>}
        {rows.map(r => (
          <div key={r.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 truncate">{r.staff_name}</p>
                <p className="text-[11px] text-slate-500 capitalize">{r.salary_type || 'monthly'} · {formatINR(r.salary_rate)}</p>
              </div>
              <div className="text-right shrink-0">
                <p className="text-lg font-black text-blue-700 leading-none">{formatINR(r.final_salary)}</p>
                <span className={`inline-block mt-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase ${r.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status}</span>
              </div>
            </div>
            <div className="grid grid-cols-4 gap-1.5 mt-3 text-center">
              {[['Present', r.days_present], ['Half day', r.half_days], ['Paid leave', r.paid_leave_days], ['Unpaid', r.unpaid_leave_days]].map(([l, v]) => (
                <div key={l as string} className="rounded-lg bg-slate-50 py-1.5"><p className="text-[13px] font-black text-slate-800">{Number(v)}</p><p className="text-[9.5px] font-semibold text-slate-500">{l}</p></div>
              ))}
            </div>
            <div className="flex justify-between text-[11.5px] text-slate-600 mt-2.5">
              <span>Base {formatINR(r.base_salary)}</span><span>Incentive {formatINR(r.incentive_amount)}</span><span>Referral {formatINR(r.referral_amount)}</span>
            </div>
            <div className="flex gap-2 mt-3">
              {r.status !== 'paid' && canEdit && <button className="flex-1 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-700" onClick={() => setEdit({ ...r })}>Adjust</button>}
              {r.status !== 'paid' && canPay && <button className="flex-1 py-2 rounded-xl bg-emerald-600 text-white text-xs font-bold" onClick={() => { setPayRow(r); setPayInclude(!!Number(r.include_referral)); }}>Pay</button>}
              <button className="flex-1 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold inline-flex items-center justify-center gap-1" onClick={() => slip(r)}><Download size={12} /> Slip</button>
            </div>
          </div>
        ))}
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr>
              <th className="p-3 text-left">Employee</th><th className="p-3 text-left">Attendance</th><th className="p-3 text-right">Base</th>
              <th className="p-3 text-right">Incentive</th><th className="p-3 text-center">Referral earnings</th><th className="p-3 text-right">Bonus / Ded.</th>
              <th className="p-3 text-right">Net</th><th className="p-3">Status</th><th className="p-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && <tr><td colSpan={9} className="p-8 text-center text-slate-400">Loading…</td></tr>}
            {!loading && !rows.length && (
              <tr><td colSpan={9} className="p-10 text-center text-slate-400">No salary for {monthYear} yet. Set each employee's salary method, then click "Generate".</td></tr>
            )}
            {rows.map(r => (
              <tr key={r.id} className="border-t border-slate-100 align-top">
                <td className="p-3"><p className="font-bold">{r.staff_name}</p><p className="text-xs text-slate-500 capitalize">{r.salary_type || 'monthly'} · {formatINR(r.salary_rate)}</p></td>
                <td className="p-3 text-xs text-slate-600">
                  {Number(r.days_present)} present · {Number(r.half_days)} half · {Number(r.paid_leave_days)} paid leave · {Number(r.unpaid_leave_days)} unpaid
                  {r.salary_type === 'hourly' && <div>{Number(r.hours_worked)} h</div>}
                </td>
                <td className="p-3 text-right">{formatINR(r.base_salary)}</td>
                <td className="p-3 text-right">
                  <div className={Number(r.include_incentive ?? 1) ? 'font-semibold' : 'text-slate-400 line-through'}>{formatINR(r.incentive_amount)}</div>
                  {r.status !== 'paid' && canEdit && Number(r.incentive_amount) > 0 && (
                    <label className="inline-flex items-center gap-1 text-xs mt-1 cursor-pointer">
                      <input type="checkbox" checked={!!Number(r.include_incentive ?? 1)} onChange={() => toggleIncentive(r)} /> Add to salary
                    </label>
                  )}
                  {Number(r.complaint_deduction) > 0 && <div className="text-[11px] font-bold text-rose-600 mt-0.5">− {formatINR(r.complaint_deduction)} complaints</div>}
                </td>
                <td className="p-3 text-center">
                  <div className="font-semibold">{formatINR(r.referral_amount)}</div>
                  {r.status !== 'paid' && canEdit && Number(r.referral_amount) > 0 && (
                    <label className="inline-flex items-center gap-1 text-xs mt-1 cursor-pointer">
                      <input type="checkbox" checked={!!Number(r.include_referral)} onChange={() => toggleReferral(r)} /> Add to salary
                    </label>
                  )}
                  {r.status === 'paid' && <div className="text-[11px] text-slate-500">{Number(r.include_referral) ? 'Paid with salary' : 'Not included'}</div>}
                </td>
                <td className="p-3 text-right text-xs"><span className="text-emerald-700">+{formatINR(r.bonus)}</span><br /><span className="text-rose-600">-{formatINR(r.deductions)}</span></td>
                <td className="p-3 text-right font-extrabold text-blue-700">{formatINR(r.final_salary)}</td>
                <td className="p-3"><span className={`px-2 py-0.5 rounded-full text-[11px] font-bold uppercase ${r.status === 'paid' ? 'bg-emerald-100 text-emerald-800' : 'bg-amber-100 text-amber-800'}`}>{r.status}</span></td>
                <td className="p-3 text-right whitespace-nowrap space-x-2">
                  {r.status !== 'paid' && canEdit && <button className="text-xs font-bold text-blue-600" onClick={() => setEdit({ ...r })}>Adjust</button>}
                  {r.status !== 'paid' && canPay && <button className="text-xs font-bold text-emerald-700" onClick={() => { setPayRow(r); setPayInclude(!!Number(r.include_referral)); }}>Pay</button>}
                  <button className="text-xs font-bold text-slate-600 inline-flex items-center gap-1" onClick={() => slip(r)}><Download size={12} /> Slip</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <Modal open={!!edit} onClose={() => setEdit(null)} title={`Adjust salary — ${edit?.staff_name || ''}`}
        footer={<><Button variant="ghost" onClick={() => setEdit(null)}>Cancel</Button><Button loading={busy} onClick={saveEdit} icon={<Save size={14} />}>Save</Button></>}>
        {edit && (
          <div className="grid grid-cols-2 gap-3 text-sm">
            <label>Earned base (₹)<input className={cls} type="number" min={0} value={edit.base_salary} onChange={e => setEdit({ ...edit, base_salary: e.target.value })} /></label>
            <label>Bonus (₹)<input className={cls} type="number" min={0} value={edit.bonus} onChange={e => setEdit({ ...edit, bonus: e.target.value })} /></label>
            <label>Deductions (₹)<input className={cls} type="number" min={0} value={edit.deductions} onChange={e => setEdit({ ...edit, deductions: e.target.value })} /></label>
            <label className="flex items-center gap-2 mt-5"><input type="checkbox" checked={!!Number(edit.include_referral)} onChange={e => setEdit({ ...edit, include_referral: e.target.checked })} /> Include referral earnings ({formatINR(edit.referral_amount)})</label>
            <label className="col-span-2">Notes<input className={cls} value={edit.notes || ''} onChange={e => setEdit({ ...edit, notes: e.target.value })} /></label>
          </div>
        )}
      </Modal>

      <Modal open={!!payRow} onClose={() => setPayRow(null)} title={`Pay salary — ${payRow?.staff_name || ''}`}
        footer={<><Button variant="ghost" onClick={() => setPayRow(null)}>Cancel</Button><Button loading={busy} onClick={pay} icon={<Wallet size={14} />}>Confirm payment</Button></>}>
        {payRow && (
          <div className="space-y-3 text-sm">
            <p>Salary for <b>{payRow.month_year}</b> without referrals: <b>{formatINR(Number(payRow.final_salary) - (Number(payRow.include_referral) ? Number(payRow.referral_amount) : 0))}</b></p>
            <label className="flex items-center gap-2"><input type="checkbox" checked={payInclude} onChange={e => setPayInclude(e.target.checked)} disabled={!Number(payRow.referral_amount)} />
              Also pay unpaid referral earnings ({formatINR(payRow.referral_amount)}) — they will show as paid in Referrals</label>
            <p className="font-bold">Total to pay: {formatINR(Number(payRow.final_salary) - (Number(payRow.include_referral) ? Number(payRow.referral_amount) : 0) + (payInclude ? Number(payRow.referral_amount) : 0))}</p>
            <Dropdown className={cls} value={payMode} onChange={e => setPayMode(e.target.value)}>
              <option value="cash">Cash</option><option value="upi">UPI</option><option value="bank">Bank transfer</option>
            </Dropdown>
          </div>
        )}
      </Modal>

      <Modal open={showMethods} onClose={() => { setShowMethods(false); }} title="Set each staff member's salary" size="xl">
        <p className="text-xs text-slate-500 mb-3">Monthly = fixed amount pro-rated by payable days. Daily = rate × payable days. Hourly = rate × hours between check-in and check-out.</p>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs text-slate-500"><tr><th className="text-left py-1">Employee</th><th>Method</th><th>Rate (₹)</th><th>Working days / month</th><th>Paid leaves / month</th><th></th></tr></thead>
            <tbody>
              {staff.map((s, i) => (
                <tr key={s.id} className="border-t border-slate-100">
                  <td className="py-2 font-semibold">{s.name}<div className="text-[11px] text-slate-400 capitalize">{s.role}</div></td>
                  <td><Dropdown className={cls} value={s.salary_type || 'monthly'} onChange={e => setStaff(p => p.map((x, j) => j === i ? { ...x, salary_type: e.target.value } : x))}>
                    <option value="monthly">Monthly</option><option value="daily">Per day</option><option value="hourly">Per hour</option></Dropdown></td>
                  <td><input className={cls} type="number" min={0} value={s.salary_rate ?? 0} onChange={e => setStaff(p => p.map((x, j) => j === i ? { ...x, salary_rate: e.target.value } : x))} /></td>
                  <td><input className={cls} type="number" min={1} max={31} value={s.working_days_per_month ?? 26} onChange={e => setStaff(p => p.map((x, j) => j === i ? { ...x, working_days_per_month: e.target.value } : x))} /></td>
                  <td><input className={cls} type="number" min={0} max={10} value={s.paid_leaves_per_month ?? 1} onChange={e => setStaff(p => p.map((x, j) => j === i ? { ...x, paid_leaves_per_month: e.target.value } : x))} /></td>
                  <td className="pl-2"><Button size="sm" onClick={() => saveMethod(s)}>Save</Button></td>
                </tr>
              ))}
              {!staff.length && <tr><td colSpan={6} className="py-6 text-center text-slate-400">No staff yet — add staff from the Staff page.</td></tr>}
            </tbody>
          </table>
        </div>
      </Modal>
    </>
  );
}
