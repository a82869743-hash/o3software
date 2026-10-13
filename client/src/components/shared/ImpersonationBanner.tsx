import { AlertTriangle, LogOut } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';

export default function ImpersonationBanner() {
  const { user, login } = useAuthStore();

  if (!user || !user.is_impersonating) {
    return null;
  }

  const handleExit = () => {
    const backupToken = sessionStorage.getItem('super_admin_backup_token');
    const backupUser = sessionStorage.getItem('super_admin_backup_user');

    if (backupToken && backupUser) {
      try {
        const parsedUser = JSON.parse(backupUser);
        sessionStorage.removeItem('super_admin_backup_token');
        sessionStorage.removeItem('super_admin_backup_user');
        login(backupToken, parsedUser);
        window.location.href = '/admin/franchises';
        return;
      } catch {}
    }

    // Fallback: clear and redirect to login
    useAuthStore.getState().logout();
  };

  return (
    <div className="bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-slate-900 font-semibold px-4 py-2.5 text-xs sm:text-sm flex items-center justify-between shadow-md sticky top-0 z-[9999] border-b border-amber-400">
      <div className="flex items-center gap-2.5 flex-1 min-w-0 pr-2">
        <span className="p-1 rounded bg-black/10 flex-shrink-0">
          <AlertTriangle size={16} className="text-slate-950 animate-pulse" />
        </span>
        <span className="truncate">
          <strong className="font-extrabold uppercase tracking-wide text-slate-950">Impersonation Mode:</strong>{' '}
          Viewing as <span className="underline decoration-slate-900 font-bold">{user.franchise_name || `Franchise #${user.franchise_id}`}</span>.{' '}
          <span className="hidden md:inline text-slate-900/90 text-xs">
            (Audited session under Super Admin {user.impersonator_name || 'Owner'})
          </span>
        </span>
      </div>

      <button
        onClick={handleExit}
        className="flex-shrink-0 flex items-center gap-1.5 bg-slate-950 hover:bg-slate-900 text-white font-bold px-3 py-1.5 rounded-lg text-xs shadow transition-all transform active:scale-95 cursor-pointer"
      >
        <LogOut size={13} />
        <span>Exit Impersonation</span>
      </button>
    </div>
  );
}
