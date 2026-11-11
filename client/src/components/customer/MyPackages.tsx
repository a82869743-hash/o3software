import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router-dom';
import { Clock, ChevronRight } from 'lucide-react';
import api from '../../api/axiosInstance';
import { formatDate } from '../../utils/formatters';

/** The customer's active packages (one per car) with services left, plus requests waiting for the studio. */
export default function MyPackages() {
  const { data: active = [] } = useQuery({
    queryKey: ['my-active-packages'],
    queryFn: async () => (await api.get('/user-packages/active', { params: { all: 1 } })).data.data || [],
  });
  const { data: requests = [] } = useQuery({
    queryKey: ['my-package-requests'],
    queryFn: async () => (await api.get('/packages/requests/my')).data.data || [],
  });
  const waiting = (requests as any[]).filter(r => r.status === 'pending');
  if (!active.length && !waiting.length) return null;

  return (
    <section className="mb-5">
      <div className="flex items-center justify-between mb-2">
        <h3 className="text-[15px] font-extrabold text-slate-900">My packages</h3>
        <Link to="/customer/buy-packages" className="text-xs font-bold text-blue-600 flex items-center">All packages <ChevronRight size={14} /></Link>
      </div>
      <div className="space-y-3">
        {(active as any[]).map(p => (
          <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-emerald-100 p-4">
            <div className="flex items-start gap-3">
              <img src="/illustrations/packages.webp" alt="" className="w-12 h-12 object-contain mix-blend-multiply shrink-0" />
              <div className="flex-1 min-w-0">
                <p className="font-extrabold text-slate-900 truncate">{p.package_name}</p>
                <p className="text-xs text-slate-500">
                  {p.vehicle ? `${p.vehicle.brand} ${p.vehicle.model}${p.vehicle.registration_no ? ` · ${p.vehicle.registration_no}` : ''}` : 'Any of your cars'}
                </p>
                <p className="text-[11px] font-semibold text-emerald-700 mt-0.5">
                  Active{p.end_date ? ` · valid till ${formatDate(p.end_date)}${p.days_remaining != null ? ` (${p.days_remaining} days left)` : ''}` : ''}
                </p>
              </div>
            </div>
            {p.usage?.length > 0 && (
              <div className="mt-3 space-y-1.5">
                {p.usage.map((u: any) => (
                  <div key={u.service_name}>
                    <div className="flex justify-between text-xs">
                      <span className="font-semibold text-slate-700">{u.service_name}</span>
                      <span className="font-bold text-slate-900">{Math.max(0, u.remaining)} of {u.total_count} left</span>
                    </div>
                    <div className="h-1.5 bg-slate-100 rounded-full mt-1 overflow-hidden">
                      <div className="h-full bg-emerald-500 rounded-full" style={{ width: `${u.total_count ? (Math.max(0, u.remaining) / u.total_count) * 100 : 0}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            <Link to="/customer/bookings/new?from_package=1" className="mt-3 inline-flex text-xs font-bold text-blue-600">Book a service from this package →</Link>
          </div>
        ))}
        {waiting.map((r: any) => (
          <div key={r.id} className="bg-white rounded-2xl shadow-sm border border-amber-100 p-4 flex items-center gap-3">
            <span className="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center shrink-0"><Clock size={18} /></span>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 truncate">{r.package_name}</p>
              <p className="text-xs text-amber-700 font-semibold">Waiting for studio approval{r.price ? ` · ₹${Number(r.price).toLocaleString('en-IN')} to pay at studio` : ''}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
