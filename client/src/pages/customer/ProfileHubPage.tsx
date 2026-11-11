import { Link, useNavigate } from 'react-router-dom';
import { ChevronRight, Navigation, Phone, CalendarCheck, LifeBuoy, Layers, History, Award, ShoppingBag, Settings, Star, LogOut, MapPin, Gift } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useCustomerDashboard } from '../../api/hooks/useDashboard';
import { useStudio } from '../../api/hooks/useStudio';
import { useMyVehicles } from '../../api/hooks/useMyVehicles';
import { fileUrl } from '../../utils/endpoints';
import { carImage } from '../../utils/carImage';
import { PHOTOS } from '../../components/customer/serviceVisuals';

/** Profile hub — photo header, clean icons, studio card. */
export default function ProfileHubPage() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const { data } = useCustomerDashboard();
  const { data: studio } = useStudio();
  const { selected } = useMyVehicles();
  const initial = (user?.name || 'U').charAt(0).toUpperCase();
  const points = Number(data?.loyalty_points || 0);

  const menu = [
    { to: '/customer/buy-packages', Icon: Layers, label: 'Packages & memberships', sub: 'Prepaid washes & AMC plans' },
    { to: '/customer/job-carts', Icon: History, label: 'Service history', sub: 'Invoices, photos & warranty' },
    { to: '/customer/loyalty', Icon: Award, label: 'Rewards & points', sub: `${points.toLocaleString('en-IN')} points` },
    { to: '/customer/products', Icon: ShoppingBag, label: 'Shop car-care products', sub: 'Order for pickup at the studio' },
    { to: '/customer/profile/edit', Icon: Settings, label: 'Account settings', sub: 'Name, email, password, notifications' },
  ];
  // Exact studio pin (set in Studios), so Google Maps opens the real gate, not a guess from the address text
  const mapsUrl = studio?.latitude && studio?.longitude
    ? `https://www.google.com/maps/dir/?api=1&destination=${studio.latitude},${studio.longitude}`
    : studio?.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(`${studio.studio_name || ''} ${studio.address}`)}` : '';

  return (
    <div className="space-y-4">
      {/* Profile header on a studio photo */}
      <div className="rise relative rounded-3xl overflow-hidden shadow-[0_10px_30px_rgba(11,31,77,0.18)]">
        <img src={PHOTOS.coating} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-br from-[#0B1F4D]/95 via-[#0B1F4D]/85 to-[#1D4ED8]/70" />
        <div className="relative p-5 flex items-center gap-4">
          {user?.profile_picture
            ? <img src={fileUrl(user.profile_picture)} className="w-16 h-16 rounded-2xl object-cover border-2 border-white/80 shadow" alt="" />
            : <span className="w-16 h-16 rounded-2xl bg-white text-[#1D4ED8] text-2xl font-black flex items-center justify-center shadow-lg">{initial}</span>}
          <div className="min-w-0 flex-1 text-white">
            <p className="text-xl font-black truncate">{user?.name}</p>
            <p className="text-sm text-white/70">+91 {user?.mobile}</p>
            <Link to="/customer/profile/edit" className="inline-flex items-center gap-0.5 mt-1 text-[13px] font-bold text-sky-200">Edit profile <ChevronRight size={14} /></Link>
          </div>
          <Link to="/customer/loyalty" className="text-center shrink-0 bg-white/10 border border-white/20 rounded-2xl px-3 py-2 backdrop-blur">
            <Star size={18} className="mx-auto text-amber-300 fill-amber-300" />
            <p className="text-[15px] font-black text-white leading-none mt-1">{points.toLocaleString('en-IN')}</p>
            <p className="text-[10px] font-semibold text-white/70">points</p>
          </Link>
        </div>
        <Link to="/customer/buy-packages" className="relative flex items-center gap-3 bg-black/25 border-t border-white/10 text-white px-4 py-3">
          <Layers size={20} className="text-amber-300 shrink-0" />
          <span className="flex-1 min-w-0">
            <span className="block font-extrabold text-[14px] truncate">{studio?.studio_name || 'O3'} membership</span>
            <span className="block text-xs text-white/70">Save more with prepaid packages</span>
          </span>
          <span className="flex items-center gap-0.5 bg-amber-400 text-slate-900 text-xs font-black px-3 py-1.5 rounded-full">View <ChevronRight size={14} /></span>
        </Link>
      </div>

      {/* Quick tiles */}
      <div className="grid grid-cols-3 gap-2.5">
        <Link to="/customer/bookings" className="rise tap bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm">
          <span className="w-11 h-11 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center"><CalendarCheck size={22} /></span>
          <span className="text-[12.5px] font-bold text-slate-800 text-center leading-tight">My bookings</span>
        </Link>
        <Link to="/customer/vehicles" className="rise tap bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm">
          <img src={carImage(selected)} alt="" className="w-16 h-11 object-contain" />
          <span className="text-[12.5px] font-bold text-slate-800 text-center leading-tight">My vehicles</span>
        </Link>
        <Link to="/customer/support" className="rise tap bg-white rounded-2xl p-3 flex flex-col items-center gap-2 shadow-sm">
          <span className="w-11 h-11 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center"><LifeBuoy size={22} /></span>
          <span className="text-[12.5px] font-bold text-slate-800 text-center leading-tight">Help & support</span>
        </Link>
      </div>

      {/* Refer & earn */}
      <Link to="/customer/refer" className="rise tap relative overflow-hidden flex items-center rounded-2xl min-h-[112px] shadow-sm">
        <img src={PHOTOS.wash} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D] via-[#0B1F4D]/85 to-transparent" />
        <div className="relative p-4 max-w-[70%]">
          <p className="flex items-center gap-1.5 font-black text-white"><Gift size={16} className="text-amber-300" /> Refer & Earn</p>
          <p className="text-xs text-white/75 mt-0.5">Get rewards for every friend you bring</p>
          <span className="inline-flex items-center gap-0.5 mt-2.5 text-[12px] font-extrabold px-3 py-1.5 rounded-xl bg-white text-[#0B1F4D]">Invite now <ChevronRight size={13} /></span>
        </div>
      </Link>

      {/* Rate us */}
      {studio?.google_review_url && (
        <a href={studio.google_review_url} target="_blank" rel="noreferrer" className="rise tap flex items-center gap-3 bg-white rounded-2xl p-3.5 shadow-sm">
          <span className="w-11 h-11 rounded-xl bg-amber-50 text-amber-500 flex items-center justify-center shrink-0"><Star size={22} className="fill-amber-400" /></span>
          <div className="flex-1"><p className="font-extrabold text-slate-900">Loved our work?</p><p className="text-xs text-slate-500">Rate us on Google — it really helps</p></div>
          <span className="bg-amber-400 text-slate-900 text-xs font-black px-3 py-1.5 rounded-lg">Rate now</span>
        </a>
      )}

      {/* Menu */}
      <div className="rise bg-white rounded-2xl shadow-sm divide-y divide-slate-100 overflow-hidden">
        {menu.map(m => (
          <Link key={m.to} to={m.to} className="tap flex items-center gap-3 px-3.5 py-3 hover:bg-slate-50 transition-colors">
            <span className="w-10 h-10 rounded-xl bg-[#F1F6FF] text-[#2563EB] flex items-center justify-center shrink-0"><m.Icon size={19} /></span>
            <div className="flex-1 min-w-0"><p className="font-bold text-slate-900 text-[15px]">{m.label}</p><p className="text-xs text-slate-500 truncate">{m.sub}</p></div>
            <ChevronRight size={18} className="text-slate-300" />
          </Link>
        ))}
      </div>

      {/* Studio location */}
      {studio?.address && (
        <div className="rise bg-white rounded-2xl p-4 shadow-sm">
          <div className="flex gap-3">
            <span className="w-10 h-10 rounded-xl bg-rose-50 text-rose-500 flex items-center justify-center shrink-0"><MapPin size={20} /></span>
            <div className="text-sm text-slate-600 min-w-0">
              <p className="font-extrabold text-slate-900">{studio.studio_name}</p>
              <p className="leading-snug">{studio.address}</p>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2 mt-3">
            {mapsUrl && (
              <a href={mapsUrl} target="_blank" rel="noreferrer" className="tap flex items-center justify-center gap-1.5 py-2.5 rounded-xl bg-[#2563EB] text-white text-[13px] font-bold">
                <Navigation size={15} /> Get directions
              </a>
            )}
            {studio.mobile && (
              <a href={`tel:${studio.mobile}`} className="tap flex items-center justify-center gap-1.5 py-2.5 rounded-xl border border-slate-200 text-slate-700 text-[13px] font-bold">
                <Phone size={15} /> Call studio
              </a>
            )}
          </div>
        </div>
      )}

      {/* Log out */}
      <button onClick={() => { logout(); navigate('/login'); }} className="tap w-full flex items-center justify-center gap-2 bg-white rounded-2xl py-3 font-bold text-rose-600 shadow-sm">
        <LogOut size={18} /> Log out
      </button>

      {/* Licence credits for photos & logos — kept small and out of the way */}
      <p className="text-center pb-2">
        <Link to="/image-credits" className="text-[10.5px] text-slate-400 underline-offset-2 hover:underline">Image credits</Link>
      </p>
    </div>
  );
}
