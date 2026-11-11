import FitImg from '../../components/shared/FitImg';
import { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { MapPin, ChevronDown, Car, Layers, ShoppingBag, Activity, Gift, Headphones, Star, Calendar, ChevronRight, X, Copy, Sparkles, Armchair } from 'lucide-react';
import { useCustomerDashboard } from '../../api/hooks/useDashboard';
import { useServices, useServiceCategories } from '../../api/hooks/useServices';
import { categoryArt } from '../../components/admin/CategoriesManager';
import { useStudio } from '../../api/hooks/useStudio';
import { useMyVehicles } from '../../api/hooks/useMyVehicles';
import { useVehicleStore, priceForCategory } from '../../store/vehicleStore';
import { useAuthStore } from '../../store/authStore';
import CustomerActionCenter from '../../components/shared/CustomerActionCenter';
import { ServiceArt, ILLUSTRATIONS, PHOTOS, photoFor } from '../../components/customer/serviceVisuals';
import { mediaFor, assignServiceMedia, HOME_MEDIA } from '../../components/customer/serviceMedia';
import MediaShowcase from '../../components/customer/MediaShowcase';
import HeroCarousel from '../../components/customer/HeroCarousel';
import { formatINR, formatDate, ymd } from '../../utils/formatters';
import { fileUrl } from '../../utils/endpoints';
import { carImage } from '../../utils/carImage';
import { copyText } from '../../utils/copyText';

/** Customer home — modelled on modern car-care apps: hero offer, category tiles, popular services, rewards. */
export default function CustomerDashboardPage() {
  const navigate = useNavigate();
  const user = useAuthStore(s => s.user);
  const { data } = useCustomerDashboard();
  const { data: servicesRes } = useServices({ active_only: true, for_app: true });
  const { data: studio } = useStudio();
  const { data: categories = [] } = useServiceCategories();
  const { selected } = useMyVehicles();
  const openSheet = useVehicleStore(s => s.openSheet);
  const [popup, setPopup] = useState(false);

  const services: any[] = servicesRes?.data || [];
  const s: any = studio || {};

  // Offer popup once per day when the studio enables it
  useEffect(() => {
    if (!s.app_offer_popup || !s.app_offer_title) return;
    const key = `o3-offer-seen-${ymd()}`;
    try { if (!localStorage.getItem(key)) { setPopup(true); localStorage.setItem(key, '1'); } } catch { /* private mode */ }
  }, [s.app_offer_popup, s.app_offer_title]);


  // Popular = services the studio featured (in its order); if none are featured, the first ones in its order
  // same picture picks as the Services screen (full list, same order)
  useMemo(() => assignServiceMedia((servicesRes?.data || []).map((s: any) => s.name)), [servicesRes]);
  const popular = useMemo(() => {
    const feat = services.filter(sv => sv.is_featured);
    return (feat.length ? feat : services).slice(0, 8);
  }, [services]);
  const firstName = (user?.name || '').split(' ')[0];
  const shortAddress = (s.address || '').split(',').slice(-3).join(',').trim();

  // Hoora-style tiles: 3 big "what we do" tiles + 8 small shortcuts (always shown, even before services are added)
  // Tiles = categories the studio marked "Show on home" (Admin → Services → Categories & home); defaults until it picks some
  // (only categories that have something to book, so a tile never opens an empty list)
  const homeCats = categories.filter((c: any) => c.show_on_home && c.is_active && services.some(sv => sv.category_id === c.id));
  const bigTiles = homeCats.length
    ? homeCats.map((c: any) => ({ label: c.name, to: `/customer/services?category=${c.id}`, img: c.image_url ? categoryArt(c) : (photoFor(c.name) || categoryArt(c)) }))
    : [
      { label: 'Washing & Detailing', to: '/customer/services?q=wash', img: PHOTOS.wash },
      { label: 'Ceramic Coating', to: '/customer/services?q=ceramic', img: PHOTOS.coating },
      { label: 'PPF & Protection', to: '/customer/services?q=ppf', img: PHOTOS.ppf },
      { label: 'Interior Spa', to: '/customer/services?q=interior', img: PHOTOS.interior },
    ];
  const quickTiles: { label: string; icon: typeof Armchair; img: string; to: string; tint: string }[] = [
    ...(homeCats.length ? [] : [
      { label: 'Polish & Rubbing', icon: Sparkles, img: PHOTOS.polish, to: '/customer/services?q=polish', tint: 'bg-violet-50 text-violet-600' },
    ]),
    { label: 'Packages & AMC', icon: Layers, img: ILLUSTRATIONS.packages, to: '/customer/buy-packages', tint: 'bg-emerald-50 text-emerald-600' },
    { label: 'Shop products', icon: ShoppingBag, img: ILLUSTRATIONS.shop, to: '/customer/products', tint: 'bg-orange-50 text-orange-600' },
    { label: 'My services', icon: Activity, img: ILLUSTRATIONS.history, to: '/customer/job-carts', tint: 'bg-sky-50 text-sky-600' },
    { label: 'Rewards', icon: Star, img: ILLUSTRATIONS.rewards, to: '/customer/loyalty', tint: 'bg-rose-50 text-rose-600' },
    { label: 'Refer & Earn', icon: Gift, img: ILLUSTRATIONS.refer, to: '/customer/refer', tint: 'bg-pink-50 text-pink-600' },
    { label: 'Help', icon: Headphones, img: ILLUSTRATIONS.help, to: '/customer/support', tint: 'bg-slate-100 text-slate-700' },
  ];

  return (
    <div>
      {/* ── Top bar: studio + greeting + car chip ── */}
      <section className="px-4 pt-4 pb-3 bg-white rounded-b-[24px] shadow-[0_4px_20px_rgba(15,23,42,0.04)]">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[12px] font-semibold text-slate-500">Hi {firstName || 'there'} 👋</p>
            <div className="flex items-center gap-1 text-[16px] font-black text-slate-900 mt-0.5"><MapPin size={16} className="text-[#2563EB]" /> {s.studio_name || 'O3 Car Spaa'}</div>
            <p className="text-[11.5px] text-slate-500 truncate max-w-[210px]">{shortAddress || 'Premium car detailing studio'}</p>
          </div>
          <button onClick={openSheet} className="tap shrink-0 flex items-center gap-2 bg-[#F1F6FF] border border-blue-100 rounded-2xl pl-3 pr-2 py-1.5 text-right">
            <span className="leading-tight">
              <span className="block text-[12.5px] font-extrabold text-slate-900 max-w-[100px] truncate">{selected ? selected.model : 'Add your car'}</span>
              <span className="flex items-center justify-end gap-0.5 text-[10.5px] font-semibold text-[#2563EB]">{selected ? selected.brand : 'Tap here'} <ChevronDown size={11} /></span>
            </span>
            <img src={carImage(selected)} alt="" className="w-14 h-9 object-contain mix-blend-multiply" />
          </button>
        </div>
      </section>

      {/* ── Banner carousel ── */}
      <section className="pt-4">
        <HeroCarousel settings={s} />
      </section>

      {/* ── Category tiles ── */}
      <section className="px-4 mt-5">
        <h3 className="text-[15px] font-black text-slate-900 mb-2.5">What does your car need?</h3>
        {/* 4 tiles: 2x2, 3: one row, 5+: rows of 3 (never a lone tile on its own row) */}
        <div className={`grid gap-2.5 ${bigTiles.length === 4 || bigTiles.length === 2 ? 'grid-cols-2' : bigTiles.length === 1 ? 'grid-cols-1' : 'grid-cols-3'}`}>
          {bigTiles.map((c, i) => {
            const photo = /photo-|^http|\/uploads\//.test(c.img);
            return (
              <Link key={c.label} to={c.to} style={{ animationDelay: `${i * 60}ms` }}
                className={`rise tap relative rounded-2xl overflow-hidden shadow-[0_6px_20px_rgba(15,23,42,0.10)] hover:-translate-y-0.5 transition-transform ${bigTiles.length % 3 === 0 ? 'aspect-[3/4]' : 'aspect-[4/3]'} ${photo ? 'bg-slate-900' : 'bg-white'}`}>
                <img src={c.img} alt="" loading="lazy" className={photo ? 'absolute inset-0 w-full h-full object-cover' : 'absolute left-2 right-2 bottom-2 top-9 w-[calc(100%-1rem)] h-[calc(100%-2.75rem)] object-contain mix-blend-multiply'} />
                {photo && <span className="absolute inset-0 bg-gradient-to-t from-slate-950/85 via-slate-900/20 to-transparent" />}
                <span className={`absolute left-2.5 right-2.5 text-[12.5px] font-extrabold leading-snug ${photo ? 'bottom-2.5 text-white drop-shadow' : 'top-2.5 text-slate-800'}`}>{c.label}</span>
                {photo && <ChevronRight size={18} className="absolute top-2 right-2 text-white bg-white/20 backdrop-blur rounded-full p-0.5" />}
              </Link>
            );
          })}
        </div>
        <div className={`grid gap-2 mt-2.5 ${quickTiles.length % 4 === 0 ? 'grid-cols-4' : 'grid-cols-3'}`}>
          {quickTiles.map((t, i) => (
            <Link key={t.label} to={t.to} style={{ animationDelay: `${180 + i * 40}ms` }}
              className="rise tap bg-white rounded-2xl px-1.5 py-2.5 shadow-sm flex flex-col items-center text-center gap-1.5 hover:-translate-y-0.5 transition-transform">
              {t.img
                ? <img src={t.img} alt="" className={t.img.startsWith("/photos/") ? "w-12 h-12 rounded-xl object-cover" : "w-12 h-12 object-contain mix-blend-multiply"} loading="lazy" />
                : <span className={`w-12 h-12 rounded-xl flex items-center justify-center ${t.tint}`}><t.icon size={22} /></span>}
              <span className="text-[11px] font-bold text-slate-700 leading-tight">{t.label}</span>
            </Link>
          ))}
        </div>
      </section>

      <div className="px-4 mt-5 space-y-5">
        {/* Live car status, ratings due, referral code & points */}
        <CustomerActionCenter data={data} />

        {/* First-wash offer */}
        {data?.first_wash_eligible && (
          <Link to="/customer/services" className="tap block rounded-2xl p-4 bg-gradient-to-r from-amber-400 to-orange-400 text-slate-900">
            <p className="text-[11px] font-black uppercase tracking-wider">Welcome offer</p>
            <p className="text-lg font-black leading-tight">50% OFF your first wash</p>
            <p className="text-xs font-semibold mt-0.5">Applied automatically at booking →</p>
          </Link>
        )}

        {/* Popular services */}
        <section>
          <div className="flex items-center justify-between mb-2.5">
            <h3 className="text-[17px] font-extrabold text-slate-900">Popular services</h3>
            <Link to="/customer/services" className="text-xs font-bold text-blue-600 flex items-center">See all <ChevronRight size={14} /></Link>
          </div>
          {popular.length === 0 ? (
            <div className="bg-white rounded-2xl p-6 text-center text-sm text-slate-500">Services will appear here soon.</div>
          ) : (
            <div className="flex gap-3 overflow-x-auto no-scrollbar -mx-4 px-4 pb-1 snap-x">
              {popular.map(sv => {
                const price = priceForCategory(sv, selected?.category);
                return (
                  <button key={sv.id} onClick={() => navigate(`/customer/bookings/new?service_id=${sv.id}`)} className="tap snap-start shrink-0 w-[200px] bg-white rounded-2xl overflow-hidden shadow-sm text-left">
                    {(() => {
                      // real studio photo (the "after" shot) when there is one
                      const md = mediaFor(sv.name);
                      const real = md?.after || md?.photo || md?.poster;
                      return real ? <FitImg src={real} alt={sv.name} className="aspect-video" /> : <ServiceArt name={sv.name} imageUrl={sv.image_url} className="aspect-video" />;
                    })()}
                    <div className="p-3">
                      <p className="text-[13.5px] font-extrabold text-slate-900 line-clamp-2 min-h-[36px]">{sv.name}</p>
                      <p className="text-xs text-slate-500 mt-1">{selected ? `For your ${selected.model}` : 'Starts at'}</p>
                      <div className="flex items-center justify-between mt-1">
                        <span className="text-base font-black text-slate-900">{price ? formatINR(price) : '—'}</span>
                        <span className="text-[11px] font-extrabold text-white bg-blue-600 px-2.5 py-1 rounded-lg">Book</span>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          )}
        </section>

        {/* Real results from the studio */}
        <section>
          <h3 className="text-[17px] font-extrabold text-slate-900 mb-2.5">Real results from our studio</h3>
          <div className="bg-white rounded-2xl overflow-hidden shadow-sm">
            <MediaShowcase media={HOME_MEDIA} name="Muddy SUV made spotless" className="h-52" />
            <div className="p-3 flex items-center justify-between gap-3">
              <p className="text-[13px] text-slate-600">Drag the line to see the difference. Tap <b>Video</b> to watch us work.</p>
              <Link to="/customer/services" className="shrink-0 text-xs font-bold text-blue-600 flex items-center">Services <ChevronRight size={14} /></Link>
            </div>
          </div>
        </section>

        {/* Active package — photo card */}
        {data?.active_package && (() => {
          const ap = data.active_package;
          const end = ap.end_date ? new Date(ap.end_date) : null;
          const daysLeft = end ? Math.max(0, Math.ceil((end.getTime() - Date.now()) / 864e5)) : null;
          return (
            <Link to="/customer/buy-packages" className="tap relative block rounded-2xl overflow-hidden shadow-sm min-h-[118px]">
              <img src={PHOTOS.coating} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-gradient-to-r from-[#064E3B]/95 via-[#065F46]/80 to-[#065F46]/20" />
              <div className="relative p-4 text-white">
                <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase tracking-wider bg-emerald-400 text-emerald-950 px-2 py-0.5 rounded">Active package</span>
                <p className="text-lg font-black leading-tight mt-1.5 max-w-[75%]">{ap.package_name || ap.name}</p>
                {end && <p className="text-xs text-white/80 mt-0.5">Valid till {formatDate(ap.end_date)}{daysLeft !== null ? ` · ${daysLeft} days left` : ''}</p>}
                <span className="inline-flex items-center gap-0.5 mt-2 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-white text-emerald-800">Use a service <ChevronRight size={13} /></span>
              </div>
            </Link>
          );
        })()}

        {/* Upcoming bookings */}
        {(data?.upcoming_bookings || []).length > 0 && (
          <section className="bg-white rounded-2xl p-4 shadow-sm">
            <h3 className="font-extrabold text-slate-900 mb-2 flex items-center gap-2"><Calendar size={17} className="text-blue-600" /> Upcoming</h3>
            {data.upcoming_bookings.map((b: any) => (
              <div key={b.id} className="flex items-center justify-between py-2 border-t border-slate-100 first:border-0">
                <div>
                  <p className="text-sm font-bold text-slate-900">{b.service_name || b.package_name || 'Service'}</p>
                  <p className="text-xs text-slate-500">{formatDate(b.slot_date)} · {String(b.start_time || '').slice(0, 5)}</p>
                </div>
                <span className="text-[11px] font-bold px-2 py-1 rounded-lg bg-blue-50 text-blue-700 capitalize">{b.status}</span>
              </div>
            ))}
          </section>
        )}

        {/* Refer & earn — photo banner */}
        <Link to="/customer/refer" className="tap relative block rounded-2xl overflow-hidden min-h-[132px] shadow-sm">
          <img src={PHOTOS.wash} alt="" className="absolute inset-0 w-full h-full object-cover" loading="lazy" />
          <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D] via-[#0B1F4D]/85 to-transparent" />
          <div className="relative p-5 text-white max-w-[72%]">
            <span className="inline-flex items-center gap-1 bg-amber-400 text-slate-900 text-[10px] font-black uppercase px-2 py-0.5 rounded"><Gift size={11} /> Refer & earn</span>
            <p className="text-[19px] font-black leading-tight mt-2">Invite friends, earn on every car they bring</p>
            <p className="text-xs text-white/80 mt-1">Share your code on WhatsApp →</p>
          </div>
        </Link>

        {/* Help */}
        <Link to="/customer/support" className="tap flex items-center gap-3 bg-white rounded-2xl p-4 shadow-sm">
          <span className="w-11 h-11 rounded-xl bg-slate-100 text-slate-700 flex items-center justify-center"><Headphones size={21} /></span>
          <div className="flex-1">
            <p className="font-extrabold text-slate-900">Help & support</p>
            <p className="text-xs text-slate-500">Ask a question — we reply on WhatsApp</p>
          </div>
          <ChevronRight className="text-slate-300" />
        </Link>

        {data?.cars_serviced_this_year > 0 && (
          <p className="text-center text-xs text-slate-400 flex items-center justify-center gap-1"><Sparkles size={12} /> {data.cars_serviced_this_year} cars pampered this year</p>
        )}
      </div>

      {/* Offer popup */}
      {popup && (
        <div className="fixed inset-0 z-[95] flex items-center justify-center p-6">
          <div className="absolute inset-0 bg-slate-900/60" onClick={() => setPopup(false)} />
          <div className="relative w-full max-w-sm rounded-3xl overflow-hidden bg-gradient-to-br from-[#0F172A] to-[#2563EB] text-white p-6 shadow-2xl animate-slide-up">
            <button onClick={() => setPopup(false)} className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white text-slate-900 flex items-center justify-center"><X size={16} /></button>
            <div className="-mx-6 -mt-6 mb-3 h-40 bg-white overflow-hidden">
              <img src={s.app_banner_url ? fileUrl(s.app_banner_url) : PHOTOS.showroom} alt=""
                className="w-full h-full object-cover" />
            </div>
            <p className="text-2xl font-black mt-3 leading-tight">{s.app_offer_title}</p>
            {s.app_offer_subtitle && <p className="text-sm text-white/80 mt-2">{s.app_offer_subtitle}</p>}
            {s.app_offer_code && (
              <button onClick={() => { copyText(s.app_offer_code); }} className="mt-4 flex items-center gap-2 bg-white/10 border border-white/30 rounded-xl px-3 py-2 text-sm">
                Code: <b className="text-amber-300">{s.app_offer_code}</b> <Copy size={14} />
              </button>
            )}
            <button onClick={() => { try { if (s.app_offer_code) sessionStorage.setItem('o3-offer', s.app_offer_code); } catch { /* private mode */ } setPopup(false); navigate('/customer/services'); }} className="mt-5 w-full bg-white text-[#1D4ED8] font-extrabold py-3 rounded-xl">{Number(s.app_offer_value) > 0 ? `Claim ${s.app_offer_type === 'flat' ? '₹' + s.app_offer_value : s.app_offer_value + '%'} off →` : 'Book now →'}</button>
          </div>
        </div>
      )}
    </div>
  );
}
