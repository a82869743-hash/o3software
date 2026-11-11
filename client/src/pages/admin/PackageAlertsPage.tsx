import { useState, useEffect } from 'react';
import { Bell, Calendar, MessageCircle, Clock, Search, Phone, RefreshCw, Loader2 } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import api from '../../api/axiosInstance';
import { useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import { carImage } from '../../utils/carImage';
import { formatDate } from '../../utils/formatters';
import { useLiveReload } from '../../utils/liveUpdates';

interface AlertItem {
  user_package_id: number;
  user_id: number;
  customer_name: string;
  customer_mobile: string;
  customer_email: string;
  package_name: string;
  end_date: string;
  days_remaining: number;
  registration_no: string;
  brand: string;
  model: string;
  vehicle_segment: string;
}

const urgencyColor = (days: number) => {
  if (days <= 0) return { bg: 'bg-slate-50 border-slate-200', text: 'text-slate-700', badge: 'bg-slate-700', label: 'EXPIRED' };
  if (days <= 7) return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-500', label: 'URGENT' };
  if (days <= 14) return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-500', label: 'SOON' };
  return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-400', label: '30 DAYS' };
};

export default function PackageAlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [sendingId, setSendingId] = useState<number | null>(null);
  const sendWhatsApp = useSendWhatsApp();
  const [runningAll, setRunningAll] = useState(false);
  const [runMsg, setRunMsg] = useState('');
  const sendDueNow = () => {
    setRunningAll(true); setRunMsg('');
    api.post('/user-packages/expiry-alerts/send-now')
      .then(r => { const n = r.data?.data?.sent || 0; setRunMsg(n ? `${n} reminder(s) sent` : 'All due reminders were already sent'); fetchAlerts(); })
      .catch(() => setRunMsg('Could not send. Try again.'))
      .finally(() => setRunningAll(false));
  };

  const fetchAlerts = () => {
    setLoading(true);
    api.get('/user-packages/expiry-alerts')
      .then(r => setAlerts(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useLiveReload(() => { fetchAlerts(); }); // reload when anything changes elsewhere
  useEffect(() => { fetchAlerts(); }, []);

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    return !q || a.customer_name?.toLowerCase().includes(q) || a.customer_mobile?.includes(q) || a.registration_no?.toLowerCase().includes(q) || a.package_name?.toLowerCase().includes(q);
  });

  const handleSendAlert = (a: AlertItem) => {
    if (!a.customer_mobile) return;
    const expiryDate = formatDate(a.end_date);
    const vehicleStr = a.registration_no ? `${a.registration_no} (${a.brand || ''} ${a.model || ''})` : 'your vehicle';
    const msg = `Hi ${a.customer_name},\n\nYour *${a.package_name}* package for *${vehicleStr}* ${a.days_remaining > 0 ? `ends on *${expiryDate}* (${a.days_remaining} day(s) left).\n\nPlease use your remaining services or renew.` : `ended on *${expiryDate}*.\n\nPlease renew to keep getting your services.`}\n📍 O3 Car Spaa, GIDC, Anand\n📞 7225030303`;

    setSendingId(a.user_package_id);
    sendWhatsApp.mutate(
      {
        phone: a.customer_mobile,
        message: msg,
        customer_id: a.user_id
      },
      {
        // remember it so the row shows "Reminder sent · next in X days"
        onSuccess: () => { api.post(`/user-packages/${a.user_package_id}/reminder-sent`).then(fetchAlerts).catch(() => {}); },
        onSettled: () => setSendingId(null)
      }
    );
  };

  return (
    <>
      <AdminTopBar
        title="Package Expiry Alerts"
        subtitle={`${filtered.length} packages ending in the next 30 days or ended in the last 30 days`}
        actions={
          <div className="flex items-center gap-2">
          <button type="button" onClick={sendDueNow} disabled={runningAll} className="flex items-center gap-1.5 px-3 py-2 bg-emerald-600 text-white rounded-xl text-xs font-bold hover:bg-emerald-700 disabled:opacity-50">
            {runningAll ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />} Send due reminders now
          </button>
          <button onClick={fetchAlerts} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
          </div>
        }
      />

      {/* Summary Cards */}
      {runMsg && <p className="mb-3 text-xs font-bold text-emerald-700">{runMsg}</p>}
      <p className="mb-3 text-[11.5px] text-slate-500">WhatsApp reminders go out by themselves 30, 15, 7 and 1 day before the end date, and once on the day it ends.</p>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 sm:gap-4 mb-5">
        {[
          { label: 'Already ended', count: alerts.filter(a => a.days_remaining <= 0).length, color: 'bg-slate-50 border-slate-200 text-slate-700' },
          { label: 'Ending within 7 days', count: alerts.filter(a => a.days_remaining > 0 && a.days_remaining <= 7).length, color: 'bg-red-50 border-red-200 text-red-700' },
          { label: 'Ending in 8-15 days', count: alerts.filter(a => a.days_remaining > 7 && a.days_remaining <= 15).length, color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'Ending in 16-30 days', count: alerts.filter(a => a.days_remaining > 15).length, color: 'bg-amber-50 border-amber-200 text-amber-700' },
        ].map((c) => (
          <div key={c.label} className={`border rounded-2xl p-3 sm:p-4 ${c.color}`}>
            <p className="text-2xl sm:text-3xl font-black">{c.count}</p>
            <p className="text-[11px] sm:text-xs font-bold mt-1 opacity-80 leading-tight">{c.label}</p>
          </div>
        ))}
      </div>

      {/* Search */}
      <div className="relative mb-6 max-w-sm">
        <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name, mobile, package..."
          className="w-full pl-9 pr-4 py-2.5 bg-[#F1F5F9] border border-transparent rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-slate-400 transition-all"
        />
      </div>

      {/* Alerts List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Bell size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-bold text-slate-600">{search ? 'No matches found' : 'No packages ending soon'}</p>
          <p className="text-sm text-slate-400 mt-1">All packages are valid beyond 30 days</p>
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {filtered.map((a) => {
            const style = urgencyColor(a.days_remaining);
            const left = Number(a.days_remaining);
            const next = [30, 15, 7, 1, 0].find(t => t < left);
            const sentAt = (a as any).last_reminder_at ? new Date((a as any).last_reminder_at) : null;
            const times = Number((a as any).reminder_count) || (sentAt ? 1 : 0);
            const ago = sentAt ? Math.max(0, Math.round((Date.now() - sentAt.getTime()) / 864e5)) : 0;
            return (
              <div key={a.user_package_id} className="bg-white rounded-2xl border border-slate-100 shadow-[0_4px_18px_rgba(15,23,42,0.06)] overflow-hidden">
                <div className={`h-1 ${style.badge}`} />
                <div className="p-3.5">
                  <div className="flex gap-3">
                    <img src={carImage({ brand: a.brand, model: a.model, category: (a as any).vehicle_category })} alt="" className="w-20 h-14 object-contain shrink-0" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="font-extrabold text-[15px] text-slate-900 truncate">{a.customer_name}</p>
                        <span className={`shrink-0 text-[11px] font-black px-2 py-0.5 rounded-full text-white ${style.badge}`}>{left > 0 ? `${left}d left` : 'Ended'}</span>
                      </div>
                      <p className="text-[12.5px] font-semibold text-slate-700 truncate">{a.package_name}</p>
                      <p className="text-[11.5px] text-slate-500 truncate">{a.registration_no ? `${a.registration_no} · ${a.brand || ''} ${a.model || ''}` : a.customer_mobile}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-2 mt-3 text-center">
                    <div className="rounded-xl bg-slate-50 py-2"><p className="text-[10px] font-bold uppercase text-slate-400">Expires</p><p className="text-[12px] font-extrabold text-slate-800">{formatDate(a.end_date)}</p></div>
                    <div className="rounded-xl bg-slate-50 py-2"><p className="text-[10px] font-bold uppercase text-slate-400">Reminded</p><p className={`text-[12px] font-extrabold ${times ? 'text-emerald-700' : 'text-slate-500'}`}>{times ? (times === 1 ? 'Once' : times === 2 ? 'Twice' : `${times} times`) : 'Not yet'}</p></div>
                    <div className="rounded-xl bg-slate-50 py-2"><p className="text-[10px] font-bold uppercase text-slate-400">Next</p><p className="text-[12px] font-extrabold text-slate-800">{left <= 0 ? 'Done' : next !== undefined ? `in ${left - next}d` : 'Final'}</p></div>
                  </div>
                  <div className="flex items-center justify-between gap-2 mt-3">
                    <p className="text-[11px] text-slate-500 truncate">{sentAt ? `Last sent ${ago === 0 ? 'today' : ago === 1 ? 'yesterday' : `${ago} days ago`}` : <span className="inline-flex items-center gap-1"><Phone size={11} /> {a.customer_mobile}</span>}</p>
                    <button type="button" disabled={sendingId === a.user_package_id} onClick={() => handleSendAlert(a)}
                      className="flex items-center gap-1.5 px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:opacity-50 text-white rounded-xl text-xs font-bold shrink-0">
                      {sendingId === a.user_package_id ? <Loader2 size={13} className="animate-spin" /> : <MessageCircle size={13} />}
                      {sendingId === a.user_package_id ? 'Sending…' : times ? 'Remind again' : 'WhatsApp remind'}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
