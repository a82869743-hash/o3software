import { LucideIcon, Inbox } from 'lucide-react';
import Button from '../ui/Button';
import { pageArt } from '../../utils/pageArt';

interface EmptyStateProps {
  icon?: LucideIcon;
  title: string;
  description?: string;
  actionLabel?: string;
  onAction?: () => void;
}

export default function EmptyState({
  icon: Icon = Inbox,
  title,
  description,
  actionLabel,
  onAction,
}: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center animate-fade-in-up">
      {pageArt(`${title} ${description || ''}`) ? (
        <div className="w-28 h-28 rounded-3xl bg-gradient-to-br from-[#EEF5FF] to-[#DCE9FF] flex items-center justify-center mb-5 animate-float">
          <img src={pageArt(`${title} ${description || ''}`)!} alt="" className="w-24 h-24 object-contain mix-blend-multiply" />
        </div>
      ) : (
        <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#F1F5F9] to-[#E2E8F0] flex items-center justify-center mb-5 animate-float">
          <Icon size={28} className="text-[#94A3B8]" />
        </div>
      )}
      <h3 className="text-lg font-bold text-[#0F172A] mb-1">{title}</h3>
      {description && <p className="text-sm text-[#64748B] max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button onClick={onAction} size="sm">{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
