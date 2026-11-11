import { formatDuration } from '../../utils/formatters';
import { useMemo, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ChevronDown, Clock, Search, CheckCircle2 } from 'lucide-react';
import { useServices, useServiceCategories } from '../../api/hooks/useServices';
import { useMyVehicles } from '../../api/hooks/useMyVehicles';
import { useVehicleStore, priceForCategory, minPrice, CATEGORY_LABEL } from '../../store/vehicleStore';
import { ServiceArt, pictureSrc } from '../../components/customer/serviceVisuals';
import { mediaFor, assignServiceMedia } from '../../components/customer/serviceMedia';
import MediaShowcase from '../../components/customer/MediaShowcase';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import { formatINR } from '../../utils/formatters';

const parseList = (v: any): string[] => {
  if (!v) return [];
  try {
    const p = typeof v === 'string' ? JSON.parse(v) : v;
    return Array.isArray(p) ? p.map((x: any) => (typeof x === 'string' ? x : x?.title || x?.name || x?.text)).filter(Boolean) : [];
  } catch { return String(v).split(/\n|,/).map(s => s.trim()).filter(Boolean); }
};

export default function CustomerServicesPage() {
  const navigate = useNavigate();
  const [params, setParams] = useSearchParams();
  const { data, isLoading } = useServices({ active_only: true, for_app: true });
  const { selected } = useMyVehicles();
  const { data: allCats = [] } = useServiceCategories();
  const openSheet = useVehicleStore(s => s.openSheet);
  const [open, setOpen] = useState<number | null>(null);
  const [q, setQ] = useState(() => params.get('q') || '');
  const services: any[] = data?.data || [];
  // one picture per service, none repeated (same picks on every screen)
  useMemo(() => assignServiceMedia(services.map(s => s.name)), [services]);
  const activeCat = params.get('category') || 'all';

  // category chips in the studio's order, only for categories that have services to show
  const cats = useMemo(() => {
    const used = new Set(services.map(s => String(s.category_id || '')));
    return allCats.filter((c: any) => c.is_active && used.has(String(c.id))).map((c: any) => [String(c.id), c.name] as [string, string]);
  }, [services, allCats]);

  const shown = services.filter(s =>
    (activeCat === 'all' || String(s.category_id) === activeCat) &&
    (!q || `${s.name} ${s.category_name || ''} ${s.description || ''}`.toLowerCase().includes(q.toLowerCase())));

  return (
    <div className="space-y-4">
      <PhotoBanner img={BANNER_PHOTOS.studio} kicker="O3 Car Spaa" line="Detailing done in a real studio" />
      {!selected && (
        <button onClick={openSheet} className="tap w-full text-left rounded-2xl bg-blue-50 border border-blue-200 p-3 text-sm text-blue-800 font-semibold">
          Add your car to see the exact price for it →
        </button>
      )}

      <div className="relative">
        <Search size={17} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Search ceramic, PPF, foam wash…"
          className="w-full pl-10 pr-4 py-3 rounded-2xl bg-white border border-slate-200 text-sm font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
      </div>

      <div className="flex gap-2 overflow-x-auto no-scrollbar -mx-4 px-4">
        {[['all', 'All'], ...cats].map(([id, name]) => (
          <button key={id} onClick={() => setParams(id === 'all' ? {} : { category: id })}
            className={`tap shrink-0 px-4 py-2 rounded-full text-[13px] font-bold border ${activeCat === id ? 'bg-slate-900 text-white border-slate-900' : 'bg-white text-slate-600 border-slate-200'}`}>
            {name}
          </button>
        ))}
      </div>

      {isLoading && [1, 2, 3].map(i => <div key={i} className="h-40 rounded-2xl bg-white animate-pulse" />)}
      {!isLoading && shown.length === 0 && <div className="bg-white rounded-2xl p-8 text-center text-sm text-slate-500">No services found.</div>}

      {shown.map(s => {
        const price = selected ? priceForCategory(s, selected.category) : minPrice(s);
        const included = parseList(s.whats_included_json);
        const features = parseList(s.features_json);
        const isOpen = open === s.id;
        const media = mediaFor(s.name);
        // a photo the studio uploaded itself (not a bundled library picture) is shown first
        const uploaded = !!s.image_url && !String(s.image_url).startsWith('/illustrations/') && !String(s.image_url).startsWith('/photos/');
        return (
          <article key={s.id} className="bg-white rounded-2xl shadow-sm p-3">
            {/* picture on top: real before/after + process video when the studio has them */}
            <div className="rounded-xl overflow-hidden">
              {media
                ? <MediaShowcase media={media} name={s.name} still={uploaded ? pictureSrc(s.image_url) : null} className="aspect-video" />
                : <ServiceArt name={s.name} imageUrl={s.image_url} className="aspect-video" />}
            </div>
            <div className="mt-3 flex items-end justify-between gap-3">
              <div className="min-w-0">
                <h3 className="text-[15px] font-extrabold text-slate-900 leading-snug">{s.name}</h3>
                <p className="mt-1 text-[12px] text-slate-500">{selected ? `For your ${selected.model} (${CATEGORY_LABEL[selected.category || 'sedan'] || 'Car'})` : 'Starts at'}</p>
                <p className="text-[18px] font-black text-slate-900 leading-tight">{price ? formatINR(price) : 'On request'}</p>
              </div>
              {s.show_duration !== 0 && s.duration_minutes > 0 && (
                <p className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 bg-slate-100 rounded-md px-1.5 py-0.5" title="Approximate. Actual time is decided by the studio."><Clock size={11} /> approx. {formatDuration(s.duration_minutes)}</p>
              )}
            </div>
            {(included.length > 0 || features.length > 0) && !isOpen && (
              <ul className="mt-3 space-y-1 text-[12.5px] text-slate-600">
                {[...included, ...features].slice(0, 3).map((t, i) => (
                  <li key={i} className="flex gap-1.5"><span className="text-slate-400">•</span> <span className="truncate">{t}</span></li>
                ))}
              </ul>
            )}
            {isOpen && (
              <div className="mt-3 space-y-2 text-sm text-slate-600 border-t border-slate-100 pt-3">
                {s.description && <p>{s.description}</p>}
                {[...included, ...features].slice(0, 12).map((t, i) => (
                  <p key={i} className="flex gap-2"><CheckCircle2 size={16} className="text-emerald-500 shrink-0 mt-0.5" /> {t}</p>
                ))}
                {!s.description && !included.length && !features.length && <p className="text-slate-400">Details will be shared by the studio.</p>}
              </div>
            )}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button onClick={() => setOpen(isOpen ? null : s.id)} className="tap py-2.5 rounded-xl border border-slate-200 font-bold text-sm text-slate-800 flex items-center justify-center gap-1">
                {isOpen ? 'Hide details' : 'View details'} <ChevronDown size={15} className={`transition-transform ${isOpen ? 'rotate-180' : ''}`} />
              </button>
              <button onClick={() => navigate(`/customer/bookings/new?service_id=${s.id}`)} className="tap py-2.5 rounded-xl bg-gradient-to-r from-[#2563EB] to-[#1D4ED8] text-white font-extrabold text-sm shadow-md shadow-blue-500/20">
                Book
              </button>
            </div>
          </article>
        );
      })}
    </div>
  );
}
