import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import * as XLSX from 'xlsx';
import { Plus, Upload, Link2, Send, UserCheck, Download, Search, RefreshCw } from 'lucide-react';
import api from '../../api/axiosInstance';
import Modal from '../ui/Modal';
import Button from '../ui/Button';
import { useUIStore } from '../../store/uiStore';
import { formatDateTime } from '../../utils/formatters';
import { exportToExcel } from '../../utils/exportExcel';
import { isValidMobile } from '../../utils/validators';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../ui/Dropdown';
import { copyText } from '../../utils/copyText';

const STAGES = ['new', 'contacted', 'qualified', 'booked', 'converted', 'lost'] as const;
const STAGE_STYLE: Record<string, string> = {
  new: 'bg-blue-100 text-blue-800', contacted: 'bg-sky-100 text-sky-800', qualified: 'bg-violet-100 text-violet-800',
  booked: 'bg-amber-100 text-amber-800', converted: 'bg-emerald-100 text-emerald-800', lost: 'bg-slate-200 text-slate-600',
};
const SOURCE_LABEL: Record<string, string> = {
  whatsapp_inbound: 'WhatsApp', website: 'Website', instagram: 'Instagram', facebook: 'Facebook', google: 'Google',
  justdial: 'JustDial', walk_in: 'Walk-in', phone_call: 'Phone call', referral: 'Referral', excel_import: 'Excel import',
  outbound_call: 'Outbound call', campaign: 'Campaign', other: 'Other',
};

/** Leads = NEW business from every source (inbound + outbound). Support questions from customers live in Inquiries. */
export default function LeadsPipeline() {
  const toast = useUIStore(s => s.toast);
  const navigate = useNavigate();
  const fileRef = useRef<HTMLInputElement>(null);
  const [leads, setLeads] = useState<any[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [stage, setStage] = useState('');
  const [source, setSource] = useState('');
  const [direction, setDirection] = useState('');
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [form, setForm] = useState<any>({ name: '', mobile: '', email: '', vehicle_model: '', service_interest: '', source: 'walk_in', direction: 'inbound', notes: '' });
  const [follow, setFollow] = useState<any>(null);
  const [followMsg, setFollowMsg] = useState('');
  const [followAt, setFollowAt] = useState('');
  const [capture, setCapture] = useState<any>(null);
  const [busy, setBusy] = useState(false);

  const load = async () => {
    try {
      const [l, s] = await Promise.all([
        api.get('/leads', { params: { stage: stage || undefined, source: source || undefined, direction: direction || undefined, search: search || undefined, limit: 200 } }),
        api.get('/leads/dashboard'),
      ]);
      setLeads(l.data.data || []);
      setStats(s.data.data);
    } catch (e: any) { toast('error', e.message); }
  };
  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => { load(); }, [stage, source, direction]);

  const add = async () => {
    if (!isValidMobile(form.mobile)) { toast('error', 'Enter a valid 10-digit mobile'); return; }
    setBusy(true);
    try { const { data } = await api.post('/leads', form); toast('success', data.message); setShowAdd(false); load(); }
    catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const setLeadStage = async (id: number, st: string) => {
    try { await api.put(`/leads/${id}`, { stage: st }); load(); } catch (e: any) { toast('error', e.message); }
  };

  const sendFollow = async () => {
    setBusy(true);
    try {
      const { data } = await api.post(`/leads/${follow.id}/follow-up`, { message: followMsg, next_follow_up_at: followAt || null });
      toast('success', data.message); setFollow(null); setFollowMsg(''); setFollowAt(''); load();
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const convert = async (lead: any) => {
    try {
      const { data } = await api.post(`/leads/${lead.id}/convert`);
      toast('success', data.message);
      navigate('/admin/job-carts/new', { state: { prefill: { customer_name: data.data.customer_name, customer_mobile: data.data.customer_mobile, notes: data.data.notes } } });
    } catch (e: any) { toast('error', e.message); }
  };

  const onImport = async (file: File) => {
    try {
      const wb = XLSX.read(await file.arrayBuffer());
      const rows: any[] = XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { defval: '' });
      const norm = (r: any, ...keys: string[]) => { for (const k of Object.keys(r)) if (keys.includes(k.toLowerCase().replace(/[^a-z]/g, ''))) return String(r[k]).trim(); return ''; };
      const mapped = rows.map(r => ({
        name: norm(r, 'name', 'fullname', 'customername'),
        mobile: norm(r, 'mobile', 'phone', 'mobilenumber', 'phonenumber', 'contact'),
        email: norm(r, 'email', 'emailid'),
        vehicle_model: norm(r, 'car', 'vehicle', 'carmodel', 'vehiclemodel'),
        service_interest: norm(r, 'service', 'serviceinterest', 'interestedin'),
        source: norm(r, 'source') || 'excel_import',
        campaign: norm(r, 'campaign'),
        notes: norm(r, 'notes', 'remarks', 'comment'),
      })).filter(r => r.mobile);
      if (!mapped.length) { toast('error', 'No rows with a Mobile column found'); return; }
      const { data } = await api.post('/leads/import', { rows: mapped, direction: 'outbound' });
      toast('success', data.message);
      load();
    } catch (e: any) { toast('error', e.message || 'Import failed'); }
  };

  const template = () => {
    const ws = XLSX.utils.aoa_to_sheet([['Name', 'Mobile', 'Email', 'Car', 'Service', 'Source', 'Campaign', 'Notes'], ['Rahul Patel', '9876543210', '', 'Hyundai Creta', 'Ceramic Coating', 'instagram', 'Diwali offer', '']]);
    ws['!cols'] = [18, 14, 22, 18, 18, 12, 14, 24].map(w => ({ wch: w }));
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, 'Leads'); XLSX.writeFile(wb, 'Leads_Import_Template.xlsx');
  };

  const exportLeads = () => exportToExcel('Leads', 'Leads', [
    { header: 'Created', value: 'created_at', type: 'date' }, { header: 'Name', value: 'name', width: 20 }, { header: 'Mobile', value: 'phone' },
    { header: 'Email', value: 'email', width: 22 }, { header: 'Source', value: (r: any) => SOURCE_LABEL[r.source] || r.source },
    { header: 'Direction', value: 'direction' }, { header: 'Car', value: 'vehicle_model' }, { header: 'Interest', value: 'service_interest', width: 20 },
    { header: 'Stage', value: 'stage' }, { header: 'Score', value: 'score', type: 'number' }, { header: 'Last contacted', value: 'last_contacted_at', type: 'date' },
    { header: 'Next follow-up', value: 'next_follow_up_at', type: 'date' }, { header: 'Campaign', value: 'campaign' },
  ], leads, 'O3 Car Spaa — Leads');

  const openCapture = async (rotate = false) => {
    try { const { data } = await api.get('/leads/capture-key', { params: rotate ? { rotate: 1 } : {} }); setCapture(data.data); }
    catch (e: any) { toast('error', e.message); }
  };

  const cls = 'px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white';
  const stageCounts: Record<string, number> = Object.fromEntries((stats?.stages || []).map((s: any) => [s.stage, s.count]));

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
        {STAGES.map(st => (
          <button key={st} onClick={() => setStage(stage === st ? '' : st)}
            className={`p-3 rounded-xl border text-left ${stage === st ? 'border-blue-500 ring-2 ring-blue-100' : 'border-slate-200'} bg-white`}>
            <p className="text-[10px] font-bold uppercase text-slate-500">{st}</p>
            <p className="text-xl font-black">{stageCounts[st] || 0}</p>
          </button>
        ))}
      </div>

      {/* Search + filters (chips instead of plain dropdowns) */}
      <div className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3 space-y-2.5">
        <div className="flex gap-2">
          <div className="relative flex-1 min-w-0">
            <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input className="w-full pl-9 pr-3 py-2.5 rounded-xl bg-slate-50 border border-slate-100 text-sm outline-none focus:ring-2 focus:ring-blue-500/20" placeholder="Search name, mobile or car"
              value={search} onChange={e => setSearch(e.target.value)} onKeyDown={e => e.key === 'Enter' && load()} />
          </div>
          <button onClick={load} className="w-10 shrink-0 rounded-xl border border-slate-200 flex items-center justify-center text-slate-500 hover:text-slate-800" title="Refresh"><RefreshCw size={16} /></button>
          <Button size="sm" icon={<Plus size={14} />} onClick={() => setShowAdd(true)}>Add</Button>
        </div>
        <div className="flex gap-1.5 overflow-x-auto no-scrollbar -mx-1 px-1">
          {[['', 'All sources'], ...Object.entries(SOURCE_LABEL)].map(([k, v]) => (
            <button key={k || 'all'} onClick={() => setSource(k)}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-bold border transition ${source === k ? 'bg-[#2563EB] text-white border-[#2563EB]' : 'bg-white text-slate-600 border-slate-200'}`}>{v}</button>
          ))}
        </div>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex bg-slate-100 rounded-xl p-0.5">
            {[['', 'All'], ['inbound', 'Inbound'], ['outbound', 'Outbound']].map(([k, v]) => (
              <button key={k || 'all'} onClick={() => setDirection(k)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold ${direction === k ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500'}`}>{v}</button>
            ))}
          </div>
          <div className="flex gap-1.5">
            <button onClick={() => openCapture()} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><Link2 size={13} /> Website & ads</button>
            <button onClick={() => fileRef.current?.click()} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1"><Upload size={13} /> Import</button>
            <button onClick={exportLeads} disabled={!leads.length} className="px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-bold text-slate-600 inline-flex items-center gap-1 disabled:opacity-40"><Download size={13} /> Export</button>
          </div>
          <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="hidden" onChange={e => { const f = e.target.files?.[0]; if (f) onImport(f); e.target.value = ''; }} />
        </div>
      </div>

      {/* Phone: one card per lead */}
      <div className="md:hidden space-y-2.5">
        {leads.map(l => (
          <div key={l.id} className="bg-white rounded-2xl border border-slate-100 shadow-sm p-3">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-extrabold text-slate-900 truncate">{l.name || 'Unknown'}</p>
                <p className="text-xs text-slate-500">{String(l.phone).slice(-10)} · {SOURCE_LABEL[l.source] || l.source}{l.vehicle_model ? ` · ${l.vehicle_model}` : ''}</p>
              </div>
              <Dropdown value={l.stage} onChange={e => setLeadStage(l.id, e.target.value)} className={`shrink-0 appearance-none text-[11px] font-bold rounded-full pl-2.5 pr-2.5 py-1 border-0 capitalize ${STAGE_STYLE[l.stage]}`}>
                {STAGES.map(st => <option key={st} value={st}>{st}</option>)}
              </Dropdown>
            </div>
            <p className="text-[11px] text-slate-500 mt-1.5">{l.last_contacted_at ? `Last ${formatDateTime(l.last_contacted_at)}` : 'Not contacted yet'}{l.next_follow_up_at ? <span className="text-amber-700 font-semibold"> · Next {formatDateTime(l.next_follow_up_at)}</span> : null}</p>
            <div className="flex gap-2 mt-2.5">
              <button className="flex-1 py-2 rounded-xl bg-emerald-50 text-emerald-700 text-xs font-bold inline-flex items-center justify-center gap-1" onClick={() => { setFollow(l); setFollowMsg(`Hi ${l.name?.split(' ')[0] || ''}, `); }}><Send size={13} /> Follow up</button>
              {l.stage !== 'converted' && <button className="flex-1 py-2 rounded-xl bg-blue-50 text-blue-700 text-xs font-bold inline-flex items-center justify-center gap-1" onClick={() => convert(l)}><UserCheck size={13} /> Convert</button>}
            </div>
          </div>
        ))}
        {!leads.length && <p className="p-8 text-center text-sm text-slate-400 bg-white rounded-2xl">No leads yet. Connect your website / Instagram / Facebook forms, import a list, or add one.</p>}
      </div>

      <div className="hidden md:block bg-white rounded-xl border border-slate-200 overflow-x-auto">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-[11px] uppercase text-slate-500">
            <tr><th className="p-3 text-left">Lead</th><th className="p-3 text-left">Source</th><th className="p-3 text-left">Interest</th>
              <th className="p-3 text-left">Stage</th><th className="p-3 text-left">Follow-up</th><th className="p-3 text-right">Actions</th></tr>
          </thead>
          <tbody>
            {leads.map(l => (
              <tr key={l.id} className="border-t border-slate-100 align-top">
                <td className="p-3"><p className="font-bold">{l.name || 'Unknown'}</p><p className="text-xs text-slate-500">{String(l.phone).slice(-10)}{l.email ? ` · ${l.email}` : ''}</p>
                  <p className="text-[11px] text-slate-400">Score {l.score || 0}</p></td>
                <td className="p-3 text-xs"><p className="font-semibold">{SOURCE_LABEL[l.source] || l.source}</p><p className="capitalize text-slate-500">{l.direction}{l.campaign ? ` · ${l.campaign}` : ''}</p></td>
                <td className="p-3 text-xs">{l.vehicle_model || '—'}<br /><span className="text-slate-500">{l.service_interest || ''}</span></td>
                <td className="p-3">
                  <Dropdown value={l.stage} onChange={e => setLeadStage(l.id, e.target.value)} className={`appearance-none text-xs font-bold rounded-full px-3 py-1 border-0 capitalize ${STAGE_STYLE[l.stage]}`}>
                    {STAGES.map(st => <option key={st} value={st}>{st}</option>)}
                  </Dropdown>
                </td>
                <td className="p-3 text-xs text-slate-600">
                  {l.last_contacted_at ? `Last: ${formatDateTime(l.last_contacted_at)}` : 'Not contacted'}
                  {l.next_follow_up_at && <div className="text-amber-700 font-semibold">Next: {formatDateTime(l.next_follow_up_at)}</div>}
                </td>
                <td className="p-3 text-right whitespace-nowrap space-x-2">
                  <button className="text-xs font-bold text-emerald-700 inline-flex items-center gap-1" onClick={() => { setFollow(l); setFollowMsg(`Hi ${l.name?.split(' ')[0] || ''}, `); }}><Send size={12} /> Follow up</button>
                  {l.stage !== 'converted' && <button className="text-xs font-bold text-blue-700 inline-flex items-center gap-1" onClick={() => convert(l)}><UserCheck size={12} /> Convert</button>}
                </td>
              </tr>
            ))}
            {!leads.length && <tr><td colSpan={6} className="p-10 text-center text-slate-400">No leads yet. Connect your website / Instagram / Facebook forms, import a list, or add one.</td></tr>}
          </tbody>
        </table>
      </div>

      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add lead"
        footer={<><Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button><Button loading={busy} onClick={add}>Save lead</Button></>}>
        <div className="grid grid-cols-2 gap-3 text-sm">
          <input className={cls} placeholder="Name" value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} />
          <input className={cls} placeholder="Mobile *" maxLength={10} value={form.mobile} onChange={e => setForm({ ...form, mobile: e.target.value.replace(/\D/g, '') })} />
          <input className={cls} placeholder="Email" value={form.email} onChange={e => setForm({ ...form, email: e.target.value })} />
          <input className={cls} placeholder="Car (e.g. Creta)" value={form.vehicle_model} onChange={e => setForm({ ...form, vehicle_model: e.target.value })} />
          <input className={cls} placeholder="Service interested in" value={form.service_interest} onChange={e => setForm({ ...form, service_interest: e.target.value })} />
          <Dropdown className={cls} value={form.source} onChange={e => setForm({ ...form, source: e.target.value })}>
            {Object.entries(SOURCE_LABEL).filter(([k]) => k !== 'excel_import').map(([k, v]) => <option key={k} value={k}>{v}</option>)}
          </Dropdown>
          <Dropdown className={cls} value={form.direction} onChange={e => setForm({ ...form, direction: e.target.value })}>
            <option value="inbound">Inbound (they contacted us)</option><option value="outbound">Outbound (we contact them)</option>
          </Dropdown>
          <input className={cls} placeholder="Notes" value={form.notes} onChange={e => setForm({ ...form, notes: e.target.value })} />
        </div>
      </Modal>

      <Modal open={!!follow} onClose={() => setFollow(null)} title={`Follow up — ${follow?.name || ''}`}
        footer={<><Button variant="ghost" onClick={() => setFollow(null)}>Cancel</Button><Button loading={busy} onClick={sendFollow}>{followMsg.trim() ? 'Send on WhatsApp' : 'Save'}</Button></>}>
        <div className="space-y-3 text-sm">
          <textarea className={`${cls} w-full`} rows={4} value={followMsg} onChange={e => setFollowMsg(e.target.value)} placeholder="WhatsApp message (leave empty to only set a reminder)" />
          <label className="block text-xs font-semibold">Next follow-up (the agent sends a reminder automatically)
            <input type="datetime-local" className={`${cls} w-full mt-1`} value={followAt} onChange={e => setFollowAt(e.target.value)} />
          </label>
        </div>
      </Modal>

      <Modal open={!!capture} onClose={() => setCapture(null)} title="Get leads from website & ads" size="lg">
        {capture && (
          <div className="space-y-3 text-sm">
            <p>Leads from your <b>website, Instagram / Facebook ads, Google ads or JustDial</b> can come here by themselves. Share the details below with the person who manages your website or ads (they can use Zapier or Pabbly).</p>
            <p className="text-xs font-bold text-slate-700">For your website / ads person:</p>
            <div className="bg-slate-50 rounded-lg p-3 font-mono text-xs break-all">Link (POST): {capture.url}<br />Secret code (header x-lead-key): {capture.key}</div>
            <p className="text-xs text-slate-600">Details to send: name, mobile, email, vehicle_model, service_interest, source ({(capture.sources || []).join(', ')}), campaign, message.</p>
            <p className="text-xs text-slate-600">New people who message you on WhatsApp are added here by themselves, and the AI replies to them. Leads from other places get a WhatsApp hello within about 10 minutes, and up to 3 reminders until they reply.</p>
            <div className="flex gap-2"><Button size="sm" variant="secondary" onClick={() => { copyText(capture.key); toast('success', 'Secret code copied'); }}>Copy secret code</Button>
              <Button size="sm" variant="secondary" onClick={() => openCapture(true)}>Make new code</Button><Button size="sm" variant="secondary" onClick={template}>Download Excel format</Button></div>
          </div>
        )}
      </Modal>
    </div>
  );
}
