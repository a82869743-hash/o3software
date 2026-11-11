import { ShieldAlert, ArrowLeft, Home, HelpCircle } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../../store/authStore';
import Button from '../../components/ui/Button';
import { landingPath } from '../../utils/access';

export default function NoAccessPage() {
  const navigate = useNavigate();
  const { user } = useAuthStore();

  const handleReturn = () => {
    if (!user) {
      navigate('/login');
      return;
    }
    navigate(landingPath(user));
  };

  return (
    <div className="min-h-[70vh] flex items-center justify-center p-4">
      <div className="max-w-md w-full bg-white rounded-3xl p-8 sm:p-10 shadow-xl border border-slate-100 text-center animate-in fade-in zoom-in-95 duration-200">
        <div className="w-18 h-18 rounded-3xl bg-rose-50 text-rose-500 border border-rose-100 flex items-center justify-center mx-auto mb-6 shadow-sm">
          <ShieldAlert size={36} />
        </div>

        <span className="inline-block px-3 py-1 bg-rose-100/70 text-rose-700 text-[11px] font-extrabold uppercase tracking-widest rounded-full mb-3">
          Error 403 • Forbidden
        </span>

        <h1 className="text-2xl font-extrabold text-slate-900 tracking-tight">
          Access Restricted
        </h1>

        <p className="text-sm text-slate-500 mt-2 leading-relaxed">
          You don't have access to this section. Ask your studio admin (or the Super Admin) to give your role this permission.
        </p>

        <div className="bg-slate-50 rounded-2xl p-4 my-6 text-xs text-slate-600 text-left border border-slate-100 space-y-1.5">
          <div className="flex justify-between">
            <span className="text-slate-400">Current Role:</span>
            <span className="font-bold text-slate-800 capitalize">{user?.role || 'Guest'}</span>
          </div>
          <div className="flex justify-between">
            <span className="text-slate-400">Franchise Scope:</span>
            <span className="font-bold text-slate-800">{user?.franchise_name || `Branch #${user?.franchise_id || 1}`}</span>
          </div>
        </div>

        <div className="space-y-3">
          <Button
            onClick={handleReturn}
            variant="primary"
            className="w-full py-3 text-xs font-bold rounded-xl flex items-center justify-center gap-2 cursor-pointer shadow-md"
          >
            <Home size={15} />
            <span>Go to my home page</span>
          </Button>

          <button
            onClick={() => window.history.back()}
            className="w-full py-2.5 text-xs font-semibold text-slate-500 hover:text-slate-800 flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
          >
            <ArrowLeft size={14} />
            <span>Go Back to Previous Page</span>
          </button>
        </div>
      </div>
    </div>
  );
}
