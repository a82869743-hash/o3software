import { Menu } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

/** Admin header on phones — light, matches the rest of the app. */
export default function MobileNavbar() {
  const { toggleSidebar } = useUIStore();

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-white/95 backdrop-blur border-b border-slate-200 flex items-center justify-between px-4 z-[60] shadow-[0_4px_20px_rgba(15,23,42,0.05)]">
      <div className="flex items-center gap-2.5">
        <img src="/assets/o3_logo.jpeg" alt="O3" className="w-9 h-9 rounded-xl object-contain bg-white border border-slate-100" />
        <div>
          <h1 className="text-[15px] font-black text-slate-900 tracking-tight leading-none">O3 Car Spaa</h1>
          <p className="text-[10.5px] text-[#2563EB] font-semibold mt-1">Studio admin</p>
        </div>
      </div>

      <button
        onClick={toggleSidebar}
        className="w-10 h-10 flex items-center justify-center rounded-xl bg-slate-50 border border-slate-200 text-slate-700 hover:bg-slate-100 transition-colors active:scale-95 touch-manipulation"
        aria-label="Open Menu"
      >
        <Menu size={20} />
      </button>
    </div>
  );
}
