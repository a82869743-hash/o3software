import { useState, useEffect } from 'react';
import { Bell, Calendar, MessageCircle, Clock, Search, Phone, RefreshCw } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import api from '../../api/axiosInstance';
import { formatDate } from '../../utils/formatters';

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
  if (days <= 7) return { bg: 'bg-red-50 border-red-200', text: 'text-red-700', badge: 'bg-red-500', label: 'URGENT' };
  if (days <= 14) return { bg: 'bg-orange-50 border-orange-200', text: 'text-orange-700', badge: 'bg-orange-500', label: 'SOON' };
  return { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', badge: 'bg-amber-400', label: '30 DAYS' };
};

export default function PackageAlertsPage() {
  const [alerts, setAlerts] = useState<AlertItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  const fetchAlerts = () => {
    setLoading(true);
    api.get('/user-packages/expiry-alerts')
      .then(r => setAlerts(r.data.data || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { fetchAlerts(); }, []);

  const filtered = alerts.filter(a => {
    const q = search.toLowerCase();
    return !q || a.customer_name?.toLowerCase().includes(q) || a.customer_mobile?.includes(q) || a.registration_no?.toLowerCase().includes(q) || a.package_name?.toLowerCase().includes(q);
  });

  const buildWhatsAppMsg = (a: any) => {
    const expiryDate = formatDate(a.end_date);
    const vehicleStr = a.registration_no ? `${a.registration_no} (${a.brand || ''} ${a.model || ''})` : 'your vehicle';
    const msg = `Hi ${a.customer_name},\n\nYour *${a.package_name}* package for *${vehicleStr}* is about to expire next month (*${expiryDate}*).\n\nDays Remaining: ${a.days_remaining} day(s)\n\nKindly visit O3 Car Spa to redeem your remaining service sessions!\n📍 O3 Car Spa, GIDC, Anand\n📞 7225030303`;
    return a.whatsapp_url || `https://wa.me/91${a.customer_mobile}?text=${encodeURIComponent(msg)}`;
  };

  return (
    <>
      <AdminTopBar
        title="Package Expiry Alerts"
        subtitle={`${filtered.length} packages expiring within 30 days`}
        actions={
          <button onClick={fetchAlerts} className="flex items-center gap-1.5 px-3 py-2 bg-slate-100 text-slate-700 rounded-xl text-xs font-bold hover:bg-slate-200 transition-colors">
            <RefreshCw size={13} /> Refresh
          </button>
        }
      />

      {/* Summary Cards */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Expiring within 7 days', count: alerts.filter(a => a.days_remaining <= 7).length, color: 'bg-red-50 border-red-200 text-red-700' },
          { label: 'Expiring in 8-14 days', count: alerts.filter(a => a.days_remaining > 7 && a.days_remaining <= 14).length, color: 'bg-orange-50 border-orange-200 text-orange-700' },
          { label: 'Expiring in 15-30 days', count: alerts.filter(a => a.days_remaining > 14).length, color: 'bg-amber-50 border-amber-200 text-amber-700' },
        ].map((c) => (
          <div key={c.label} className={`border rounded-2xl p-4 ${c.color}`}>
            <p className="text-3xl font-black">{c.count}</p>
            <p className="text-xs font-bold mt-1 opacity-80">{c.label}</p>
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
          className="w-full pl-9 pr-4 py-2.5 bg-[#f6f3f2] border border-transparent rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-slate-400 transition-all"
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
          <p className="font-bold text-slate-600">{search ? 'No matches found' : 'No packages expiring soon! 🎉'}</p>
          <p className="text-sm text-slate-400 mt-1">All packages are valid beyond 30 days</p>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map((a) => {
            const style = urgencyColor(a.days_remaining);
            return (
              <div key={a.user_package_id} className={`border rounded-2xl p-4 transition-all hover:shadow-sm ${style.bg}`}>
                <div className="flex items-center gap-4">
                  {/* Avatar */}
                  <div className={`w-11 h-11 rounded-xl flex items-center justify-center shrink-0 ${style.badge}`}>
                    <span className="text-white font-extrabold text-sm">{a.customer_name?.charAt(0) || '?'}</span>
                  </div>

                  {/* Info */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className={`font-extrabold text-sm ${style.text}`}>{a.customer_name}</h3>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full text-white ${style.badge}`}>
                        {style.label}
                      </span>
                      <span className="text-[10px] font-bold text-slate-600 bg-white rounded-full px-2 py-0.5 border border-slate-200">
                        {a.package_name}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 mt-1 flex-wrap">
                      {a.registration_no && (
                        <span className="text-xs text-slate-500">{a.registration_no} · {a.brand} {a.model}</span>
                      )}
                      <span className="flex items-center gap-1 text-xs text-slate-500">
                        <Phone size={11} /> {a.customer_mobile}
                      </span>
                    </div>
                  </div>

                  {/* Days + Date */}
                  <div className="text-right shrink-0">
                    <div className="flex items-center gap-1.5 justify-end mb-1">
                      <Clock size={13} className={style.text} />
                      <p className={`text-lg font-black ${style.text}`}>{a.days_remaining}d</p>
                    </div>
                    <div className="flex items-center gap-1 text-[10px] text-slate-500">
                      <Calendar size={10} />
                      {formatDate(a.end_date)}
                    </div>
                  </div>

                  {/* WhatsApp */}
                  <a
                    href={buildWhatsAppMsg(a)}
                    target="_blank"
                    rel="noreferrer"
                    className="flex items-center gap-1.5 px-3 py-2 bg-green-500 text-white rounded-xl text-xs font-bold hover:bg-green-600 transition-colors shrink-0"
                  >
                    <MessageCircle size={13} />
                    Remind
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </>
  );
}
