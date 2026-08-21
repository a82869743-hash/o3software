import { CheckCircle, Clock, XCircle, AlertCircle, PlayCircle, Truck, Package, RotateCcw } from 'lucide-react';

export type StatusType = 
  | 'completed' | 'in_progress' | 'open' | 'pending' | 'new' | 'followed_up' | 'converted' 
  | 'in_transit' | 'delivered' | 'cancelled' | 'active' | 'inactive';

interface StatusBadgeProps {
  status: StatusType | string;
  className?: string;
  showDot?: boolean;
}

export default function StatusBadge({ status, className = '', showDot = false }: StatusBadgeProps) {
  const getStatusConfig = (s: string) => {
    const norm = (s || '').toLowerCase();
    switch (norm) {
      case 'completed':
      case 'converted':
      case 'delivered':
      case 'active':
        return { 
          color: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          icon: CheckCircle, 
          label: s.replace('_', ' ') 
        };
      case 'in_progress':
      case 'in_transit':
        return { 
          color: 'bg-blue-50 text-[#2563EB] border-blue-200',
          icon: Truck, 
          label: s.replace('_', ' ') 
        };
      case 'pending':
      case 'open':
      case 'pending_approval':
      case 'pending_payment':
        return { 
          color: 'bg-amber-50 text-amber-700 border-amber-200',
          icon: Clock, 
          label: s.replace('_', ' ') 
        };
      case 'new':
        return { 
          color: 'bg-blue-50 text-[#2563EB] border-blue-200',
          icon: AlertCircle, 
          label: s.replace('_', ' ') 
        };
      case 'cancelled':
      case 'inactive':
      case 'rejected':
        return { 
          color: 'bg-slate-100 text-slate-600 border-slate-200',
          icon: XCircle, 
          label: s.replace('_', ' ') 
        };
      case 'followed_up':
        return { 
          color: 'bg-teal-50 text-teal-700 border-teal-200',
          icon: RotateCcw, 
          label: s.replace('_', ' ') 
        };
      default:
        return { 
          color: 'bg-slate-50 text-slate-600 border-slate-200',
          icon: Package, 
          label: s.replace('_', ' ') 
        };
    }
  };

  const config = getStatusConfig(status);
  const Icon = config.icon;

  return (
    <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider border ${config.color} ${className}`}>
      <Icon size={12} className="shrink-0" />
      <span className="truncate">{config.label}</span>
    </span>
  );
}
