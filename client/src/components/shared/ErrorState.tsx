import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from '../ui/Button';

interface ErrorStateProps {
  message?: string;
  onRetry?: () => void;
}

export default function ErrorState({
  message = 'Something went wrong. Please try again.',
  onRetry,
}: ErrorStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-16 px-6 text-center">
      <div className="w-16 h-16 rounded-full bg-blue-50 flex items-center justify-center mb-5">
        <AlertTriangle size={28} className="text-blue-500" />
      </div>
      <h3 className="text-lg font-bold text-[#0F172A] mb-1">Error</h3>
      <p className="text-sm text-[#64748B] max-w-sm">{message}</p>
      {onRetry && (
        <div className="mt-5">
          <Button onClick={onRetry} variant="secondary" size="sm" icon={<RefreshCw size={14} />}>
            Retry
          </Button>
        </div>
      )}
    </div>
  );
}
