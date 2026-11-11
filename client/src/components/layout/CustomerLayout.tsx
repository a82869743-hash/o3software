import { Suspense, useEffect, useState } from 'react';
import PageLoader from '../shared/PageLoader';
import { Outlet, NavLink, useLocation, useNavigate } from 'react-router-dom';
import { Home, Sparkles, CalendarCheck, Gift, UserRound, ArrowLeft, Car, ChevronDown } from 'lucide-react';
import VehicleSheet from '../customer/VehicleSheet';
import AddCarModal from '../shared/AddCarModal';
import { useQueryClient } from '@tanstack/react-query';
import { useVehicleStore } from '../../store/vehicleStore';
import { carImage } from '../../utils/carImage';
import { useMyVehicles } from '../../api/hooks/useMyVehicles';

// 3D tab icons live in public/illustrations/tab-*.webp — used only when all five exist, else the line icons
const TABS = [
  { to: '/customer', icon: Home, img: '/illustrations/tab-home.webp', label: 'Home', end: true },
  { to: '/customer/services', icon: Sparkles, img: '/illustrations/tab-services.webp', label: 'Services' },
  { to: '/customer/bookings', icon: CalendarCheck, img: '/illustrations/tab-bookings.webp', label: 'Bookings' },
  { to: '/customer/refer', icon: Gift, img: '/illustrations/tab-refer.webp', label: 'Refer & Earn' },
  { to: '/customer/profile', icon: UserRound, img: '/illustrations/tab-profile.webp', label: 'Profile' },
];

/** true once every 3D tab icon has loaded */
function useTabArt() {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    Promise.all(TABS.map(t => new Promise<boolean>(res => { const im = new Image(); im.onload = () => res(true); im.onerror = () => res(false); im.src = t.img; })))
      .then(r => { if (alive) setReady(r.every(Boolean)); });
    return () => { alive = false; };
  }, []);
  return ready;
}

const TITLES: Array<[RegExp, string]> = [
  [/^\/customer\/services/, 'Services'],
  [/^\/customer\/bookings\/new/, 'Book a slot'],
  [/^\/customer\/bookings/, 'My Bookings'],
  [/^\/customer\/job-carts/, 'Service History'],
  [/^\/customer\/loyalty/, 'Rewards & Points'],
  [/^\/customer\/buy-packages/, 'Packages'],
  [/^\/customer\/products/, 'Shop'],
  [/^\/customer\/vehicles/, 'My Vehicles'],
  [/^\/customer\/profile/, 'Profile'],
  [/^\/customer\/refer/, 'Refer & Earn'],
  [/^\/customer\/support/, 'Help & Support'],
  [/^\/customer\/delivery/, 'Live Delivery'],
];

/** Customer app shell — mobile-first (bottom tabs), centered app width on larger screens. */
export default function CustomerLayout() {
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const isHome = pathname === '/customer' || pathname === '/customer/';
  const isTabRoot = TABS.some(t => t.to === pathname);
  const title = TITLES.find(([rx]) => rx.test(pathname))?.[1] || 'O3 Car Spaa';
  const openSheet = useVehicleStore(s => s.openSheet);
  const { selected, vehicles, isSuccess: carsLoaded } = useMyVehicles();
  const qc = useQueryClient();
  const tabArt = useTabArt();

  return (
    <div className="min-h-screen bg-[#EEF2F7]">
      <div className="mx-auto max-w-xl min-h-screen bg-[#F5F7FB] relative shadow-[0_0_40px_rgba(15,23,42,0.06)]">
        {!isHome && (
          <header className="sticky top-0 z-40 bg-white/95 backdrop-blur border-b border-slate-100">
            <div className="h-14 px-3 flex items-center gap-2">
              {!isTabRoot ? (
                <button onClick={() => navigate(-1)} className="tap w-10 h-10 flex items-center justify-center rounded-full hover:bg-slate-100" aria-label="Back">
                  <ArrowLeft size={22} className="text-slate-800" />
                </button>
              ) : <span className="w-2" />}
              <h1 className="flex-1 text-[17px] font-extrabold text-slate-900 truncate">{title}</h1>
              <button onClick={openSheet} className="tap flex items-center gap-2 pl-2 pr-1 py-1 rounded-xl hover:bg-slate-50 text-right">
                <span className="leading-tight">
                  <span className="block text-[13px] font-extrabold text-slate-900 max-w-[120px] truncate">{selected ? selected.model : 'Add car'}</span>
                  <span className="block text-[11px] font-semibold text-blue-600 max-w-[120px] truncate">{selected ? selected.brand : 'for exact prices'}</span>
                </span>
                <img src={carImage(selected)} alt="" className="w-14 h-9 object-contain shrink-0" />
                <ChevronDown size={14} className="text-slate-400" />
              </button>
            </div>
          </header>
        )}

        <main className={`${isHome ? '' : 'px-4 pt-4'} pb-28 app-fade`} key={pathname}>
          <Suspense fallback={<PageLoader />}><Outlet /></Suspense>
        </main>

        <nav className="fixed bottom-0 left-0 right-0 z-50">
          <div className="mx-auto max-w-xl bg-white border-t border-slate-200 shadow-[0_-6px_24px_rgba(15,23,42,0.06)] safe-bottom">
            <div className="grid grid-cols-5">
              {TABS.map(({ to, icon: Icon, img, label, end }) => (
                <NavLink key={to} to={to} end={end} className="tap flex flex-col items-center justify-center pt-1.5 pb-1 gap-0.5">
                  {({ isActive }) => (
                    <>
                      {tabArt ? (
                        <span className={`relative w-10 h-8 flex items-center justify-center transition-transform duration-200 ${isActive ? 'scale-110 -translate-y-0.5' : 'opacity-60 grayscale-[35%]'}`}>
                          {isActive && <span className="absolute inset-x-0 bottom-0 h-3 rounded-full bg-blue-200/60 blur-[6px]" />}
                          <img src={img} alt="" className="relative h-8 w-8 object-contain mix-blend-multiply" />
                        </span>
                      ) : (
                        <span className={`w-11 h-7 rounded-full flex items-center justify-center transition-colors ${isActive ? 'bg-blue-600 text-white' : 'text-slate-400'}`}>
                          <Icon size={19} strokeWidth={isActive ? 2.4 : 2} />
                        </span>
                      )}
                      <span className={`text-[10.5px] ${isActive ? 'font-extrabold text-[#1D4ED8]' : 'font-semibold text-slate-400'}`}>{label}</span>
                    </>
                  )}
                </NavLink>
              ))}
            </div>
          </div>
        </nav>
        <VehicleSheet />
        {/* every customer needs a car on file (prices and bookings depend on it) */}
        <AddCarModal required isOpen={carsLoaded && vehicles.length === 0} onClose={() => { qc.invalidateQueries({ queryKey: ['my-vehicles'] }); qc.invalidateQueries({ queryKey: ['customer-vehicles'] }); }} />
      </div>
    </div>
  );
}
