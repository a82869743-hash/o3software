import { AlertTriangle, Loader2, CheckCircle, Trash2 } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';

interface ConfirmModalProps {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  description: string;
  confirmText?: string;
  cancelText?: string;
  isDestructive?: boolean;
  loading?: boolean;
}

export default function ConfirmModal({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmText = 'Confirm',
  cancelText = 'Cancel',
  isDestructive = false,
  loading = false,
}: ConfirmModalProps) {
  return (
    <Modal
      open={open}
      onClose={() => {
        if (!loading) onClose();
      }}
      size="sm"
    >
      <div className="flex flex-col items-center text-center pt-4 pb-2">
        <div className={`w-12 h-12 rounded-full flex items-center justify-center mb-4 ${isDestructive ? 'bg-blue-50 text-blue-600' : 'bg-green-50 text-green-600'}`}>
          {isDestructive ? <Trash2 size={24} /> : <CheckCircle size={24} />}
        </div>
        <h3 className="text-xl font-bold text-[#0F172A] mb-2">{title}</h3>
        <p className="text-sm text-[#64748B]">{description}</p>
      </div>
      
      <div className="flex gap-3 mt-6">
        <Button
          variant="secondary"
          className="flex-1"
          onClick={onClose}
          disabled={loading}
        >
          {cancelText}
        </Button>
        <Button
          className={`flex-1 ${isDestructive ? 'bg-blue-600 hover:bg-blue-700 text-white border-transparent' : 'bg-green-600 hover:bg-green-700 text-white border-transparent'}`}
          onClick={onConfirm}
          disabled={loading}
          icon={loading ? <Loader2 size={16} className="animate-spin" /> : undefined}
        >
          {loading ? 'Processing...' : confirmText}
        </Button>
      </div>
    </Modal>
  );
}
