import { LucideIcon, Inbox } from 'lucide-react';
import Button from '../ui/Button';

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
      <div className="w-16 h-16 rounded-full bg-gradient-to-br from-[#f6f3f2] to-[#ebe7e7] flex items-center justify-center mb-5 animate-float">
        <Icon size={28} className="text-[#8f6f6c]" />
      </div>
      <h3 className="text-lg font-bold text-[#0F172A] mb-1">{title}</h3>
      {description && <p className="text-sm text-[#5f5e5e] max-w-sm">{description}</p>}
      {actionLabel && onAction && (
        <div className="mt-5">
          <Button onClick={onAction} size="sm">{actionLabel}</Button>
        </div>
      )}
    </div>
  );
}
