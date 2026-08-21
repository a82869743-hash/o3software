import { Menu } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';

export default function MobileNavbar() {
  const { toggleSidebar } = useUIStore();

  return (
    <div className="lg:hidden fixed top-0 left-0 right-0 h-16 bg-gradient-to-r from-[#0F172A] to-[#1a1a1a] flex items-center justify-between px-4 z-[60] shadow-lg border-b border-white/5">
      <div className="flex items-center gap-2.5">
        <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] flex items-center justify-center shadow-blue-glow">
          <span className="text-white font-black text-xs">GK</span>
        </div>
        <div>
          <h1 className="text-sm font-bold text-white tracking-tight leading-none">AutoHerb</h1>
          <p className="text-[9px] text-gray-400 uppercase tracking-widest mt-0.5">Terminal</p>
        </div>
      </div>
      
      <button 
        onClick={toggleSidebar} 
        className="text-white p-2 hover:bg-white/10 rounded-lg transition-colors active:scale-95 touch-manipulation"
        aria-label="Open Menu"
      >
        <Menu size={24} />
      </button>
    </div>
  );
}
