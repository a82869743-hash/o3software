import { useEffect, useState } from 'react';
import { Mail, Send, Activity, Users } from 'lucide-react';
import { useMessagesLog, useSendBulkMessage, useMessagePreview, useMessageAudiences } from '../../api/hooks/useMessages';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import EmptyState from '../../components/shared/EmptyState';
import { useUIStore } from '../../store/uiStore';
import Dropdown from '../../components/ui/Dropdown';

export default function MessagesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data, isLoading } = useMessagesLog();
  const sendBulkMut = useSendBulkMessage();

  const [modalOpen, setModalOpen] = useState(false);
  const [audience, setAudience] = useState('all');
  const [days, setDays] = useState<number>(30);
  const [carTypes, setCarTypes] = useState<string[]>([]);
  const [picked, setPicked] = useState<{ id: number; name: string; mobile: string }[]>([]);
  const [search, setSearch] = useState('');
  const [found, setFound] = useState<any[]>([]);
  const [content, setContent] = useState('');

  const { data: audRes } = useMessageAudiences();
  const audiences: { key: string; label: string; days?: number }[] = audRes?.data || [];
  const current = audiences.find(x => x.key === audience);
  const choice = { audience, days: current?.days ? days : undefined, car_types: audience === 'car_type' ? carTypes : undefined,
    customer_ids: audience === 'selected' ? picked.map(p => p.id) : undefined };
  const { data: previewData, isLoading: previewLoading } = useMessagePreview(choice);
  const preview = previewData?.data;
  const logs = data?.data || [];

  // default N days for the chosen audience
  useEffect(() => { if (current?.days) setDays(current.days); }, [audience, current?.days]);
  // customer search for "Pick customers by hand"
  useEffect(() => {
    if (audience !== 'selected' || search.trim().length < 2) { setFound([]); return; }
    const t = setTimeout(async () => {
      try { const { data: r } = await api.get('/customers', { params: { search: search.trim(), limit: 10 } }); setFound(r.data || []); } catch { setFound([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [search, audience]);

  const CAR_TYPES = [['hatchback', 'Hatchback'], ['semi_sedan', 'Mini SUV'], ['sedan', 'Sedan'], ['premium_sedan', 'Luxury'], ['suv', 'SUV'], ['premium_suv', 'Luxury + SUV']];

  const handleSend = async () => {
    if (!content.trim()) {
      toast('error', 'Message content is required');
      return;
    }
    if (!preview?.target_count) { toast('error', preview?.note || 'No customers match this audience'); return; }
    if (!window.confirm(`Send this WhatsApp message to ${preview.target_count} customer(s)?`)) return;
    try {
      const res = await sendBulkMut.mutateAsync({ ...choice, message_content: content });
      toast('success', `Queued for ${res.data.sent} customer(s). Failed: ${res.data.failed}`);
      setModalOpen(false);
      setContent('');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to send bulk message');
    }
  };

  return (
    <>
      <AdminTopBar
        title="Messaging Campaigns"
        subtitle={`${logs.length} messages sent previously`}
        actions={<Button onClick={() => setModalOpen(true)} icon={<Send size={16} />}>New Campaign</Button>}
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-6">
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#64748B]"><Mail size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Messages Sent</h3></div>
          <p className="text-3xl font-black text-[#0F172A]">{logs.length}</p>
        </div>
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#64748B]"><Activity size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Delivery Rate</h3></div>
          <p className="text-3xl font-black text-green-600">
            {logs.length ? Math.round((logs.filter((l: any) => l.status === 'sent').length / logs.length) * 100) : 0}%
          </p>
        </div>
        <div className="bg-white p-5 rounded-lg border-b-2 border-transparent shadow-sm">
          <div className="flex items-center gap-3 mb-2 text-[#64748B]"><Users size={18}/> <h3 className="font-bold text-sm tracking-wider uppercase">Selected Audience</h3></div>
          <p className="text-3xl font-black text-[#0F172A]">{previewLoading ? '...' : preview?.target_count || 0}</p>
          <p className="text-xs text-slate-500 mt-1">{current?.label || 'All customers'}</p>
        </div>
      </div>

      <div className="bg-white rounded-xl shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200 bg-gray-50 flex items-center justify-between">
          <h2 className="font-bold text-[#0F172A]">Recent Messages Log</h2>
        </div>
        {isLoading ? (
          <div className="p-6 grid gap-4 grid-cols-1 md:grid-cols-2"><SkeletonCard/><SkeletonCard/></div>
        ) : !logs.length ? (
          <EmptyState icon={Mail} title="No Messages Sent" description="Start a new campaign to reach out to customers" />
        ) : (
          <div className="divide-y divide-gray-100">
            {logs.map((log: any) => {
              const waLink = log.response_data?.wa_link;
              return (
                <div key={log.id} className="p-4 hover:bg-gray-50/50 transition-colors flex items-start justify-between">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <span className="font-semibold text-sm text-[#0F172A]">{log.customer_name || 'Unknown'}</span>
                      <span className="text-xs text-gray-500">({log.mobile})</span>
                      <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${
                        log.status === 'sent' ? 'bg-green-100 text-green-700' : 
                        log.status === 'failed' ? 'bg-blue-100 text-blue-700' : 
                        log.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-gray-100 text-gray-600'
                      }`}>
                        {log.status}
                      </span>
                      {log.template_name && (
                        <span className="px-2 py-0.5 bg-blue-50 text-blue-700 rounded-full text-[10px] font-medium border border-blue-100">
                          {log.template_name}
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-[#64748B]">{log.message_preview}</p>
                    {log.channel === 'whatsapp' && waLink && (
                      <a 
                        href={waLink}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 mt-2 text-xs font-bold text-emerald-600 hover:text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg border border-emerald-200 transition-all shadow-sm hover:shadow"
                      >
                        💬 Send WhatsApp Manual
                      </a>
                    )}
                  </div>
                  <div className="text-right">
                    <span className="text-xs uppercase font-bold text-gray-400 block tracking-widest">{log.channel}</span>
                    <span className="text-[10px] text-gray-400 block mt-1">{new Date(log.sent_at).toLocaleDateString()}</span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title="New Messaging Campaign" size="md"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSend} loading={sendBulkMut.isPending}>{`Send to ${preview?.target_count || 0}`}</Button></>}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Send to</label>
              <Dropdown className="w-full bg-[#F1F5F9] border-0 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB] outline-none" value={audience} onChange={e => setAudience(e.target.value)}>
                {(audiences.length ? audiences : [{ key: 'all', label: 'All customers' }]).map(x => <option key={x.key} value={x.key}>{x.label}</option>)}
              </Dropdown>
            </div>
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">Channel</label>
              <div className="w-full bg-[#F1F5F9] rounded-lg px-4 py-3 text-sm font-semibold text-emerald-700">WhatsApp</div>
            </div>
          </div>
          {current?.days && (
            <label className="block text-sm">
              <span className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">N days</span>
              <input type="number" min={1} max={3650} className="w-full bg-[#F1F5F9] border-0 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB] outline-none" value={days} onChange={e => setDays(Math.max(1, Number(e.target.value) || 1))} />
            </label>
          )}
          {audience === 'car_type' && (
            <div className="flex flex-wrap gap-2">
              {CAR_TYPES.map(([k, l]) => (
                <label key={k} className={`px-3 py-1.5 rounded-full border text-xs font-bold cursor-pointer ${carTypes.includes(k) ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-700 border-slate-200'}`}>
                  <input type="checkbox" className="hidden" checked={carTypes.includes(k)} onChange={() => setCarTypes(p => p.includes(k) ? p.filter(x => x !== k) : [...p, k])} />{l}
                </label>
              ))}
            </div>
          )}
          {audience === 'selected' && (
            <div className="space-y-2">
              <input className="w-full bg-[#F1F5F9] border-0 rounded-lg px-4 py-3 text-sm focus:ring-2 focus:ring-[#2563EB] outline-none" placeholder="Search name or mobile (2+ letters)" value={search} onChange={e => setSearch(e.target.value)} />
              {found.length > 0 && (
                <div className="border border-slate-200 rounded-lg divide-y max-h-40 overflow-y-auto">
                  {found.map((c: any) => {
                    const on = picked.some(p => p.id === c.id);
                    return (
                      <button type="button" key={c.id} onClick={() => setPicked(p => on ? p.filter(x => x.id !== c.id) : [...p, { id: c.id, name: c.name, mobile: c.mobile }])}
                        className={`w-full text-left px-3 py-2 text-sm flex justify-between ${on ? 'bg-blue-50' : 'hover:bg-slate-50'}`}>
                        <span>{c.name} <span className="text-slate-400">{c.mobile}</span></span><span className="text-xs font-bold text-blue-600">{on ? 'Added' : 'Add'}</span>
                      </button>
                    );
                  })}
                </div>
              )}
              {picked.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {picked.map(p => (
                    <span key={p.id} className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-blue-50 text-blue-800 text-xs font-semibold">
                      {p.name}<button type="button" className="text-blue-500" onClick={() => setPicked(x => x.filter(y => y.id !== p.id))}>×</button>
                    </span>
                  ))}
                </div>
              )}
            </div>
          )}
          <div className="rounded-lg bg-emerald-50 border border-emerald-100 px-3 py-2 text-sm text-emerald-900">
            {previewLoading ? 'Counting…' : preview?.note ? preview.note
              : <><b>{preview?.target_count || 0}</b> customer(s) will get this{preview?.sample?.length ? `: ${preview.sample.join(', ')}${preview.target_count > preview.sample.length ? '…' : ''}` : ''}</>}
            <div className="text-[11px] text-emerald-700 mt-0.5">Only this studio's customers who have not turned off offers.</div>
          </div>
          <Textarea 
            label="Message Content" 
            value={content} 
            onChange={e => setContent(e.target.value)} 
            placeholder="Hi {name}, ... ({name} becomes each customer's first name)"
            className="h-32" 
          />
          <p className="text-xs text-gray-500 italic">Messages will be sent in batches to comply with anti-spam limits.</p>
        </div>
      </Modal>
    </>
  );
}
