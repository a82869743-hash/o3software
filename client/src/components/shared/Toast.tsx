import { CheckCircle, AlertTriangle, XCircle, Info, X } from 'lucide-react';
import { useUIStore } from '../../store/uiStore';
import type { ToastType } from '../../types';

const ICONS: Record<ToastType, React.ReactNode> = {
  success: <CheckCircle size={18} className="text-green-500 shrink-0" />,
  error: <XCircle size={18} className="text-blue-500 shrink-0" />,
  warning: <AlertTriangle size={18} className="text-amber-500 shrink-0" />,
  info: <Info size={18} className="text-blue-500 shrink-0" />,
};

const BG_CLASSES: Record<ToastType, string> = {
  success: 'border-l-green-500',
  error: 'border-l-blue-500',
  warning: 'border-l-amber-500',
  info: 'border-l-blue-500',
};

export default function ToastContainer() {
  const { toasts, dismissToast } = useUIStore();

  if (!toasts.length) return null;

  return (
    <div className="fixed top-4 right-4 z-[200] flex flex-col gap-2 max-w-sm w-full pointer-events-none">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`pointer-events-auto bg-white rounded-lg shadow-lg shadow-black/5 border border-gray-100 border-l-4 ${BG_CLASSES[toast.type]} px-4 py-3 flex items-start gap-3 animate-slide-in`}
        >
          {ICONS[toast.type]}
          <p className="text-sm font-medium text-[#0F172A] flex-1">{toast.message}</p>
          <button
            onClick={() => dismissToast(toast.id)}
            className="p-0.5 rounded hover:bg-gray-100 text-gray-400 hover:text-gray-600 transition-colors shrink-0"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  );
}
