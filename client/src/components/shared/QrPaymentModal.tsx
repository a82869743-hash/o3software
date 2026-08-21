import { useState, useEffect } from 'react';
import Modal from '../ui/Modal';
import api from '../../api/axiosInstance';
import { useToastStore } from '../../store/toastStore';
import { Loader2, QrCode, CheckCircle, Info } from 'lucide-react';

interface QrPaymentModalProps {
  open: boolean;
  onClose: () => void;
  amount: number;
  bookingId?: number;
  packageRequestId?: number;
  onSuccess: () => void;
}

export default function QrPaymentModal({
  open,
  onClose,
  amount,
  bookingId,
  packageRequestId,
  onSuccess,
}: QrPaymentModalProps) {
  const { addToast } = useToastStore();
  const [transactionId, setTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [allQrs, setAllQrs] = useState<any[]>([]);
  const [selectedQrId, setSelectedQrId] = useState<number | null>(null);
  const [settings, setSettings] = useState<{
    studio_name: string;
    upi_id: string;
    upi_number: string;
    upi_name: string;
    upi_qr_url: string | null;
  }>({
    studio_name: 'O3 Car Spa',
    upi_id: '7225030303@paytm',
    upi_number: '7225030303',
    upi_name: 'O3 Car Spa',
    upi_qr_url: null,
  });

  useEffect(() => {
    if (open) {
      api.get('/settings/public')
        .then(res => {
          if (res.data?.success && res.data?.data) {
            setSettings(res.data.data);
            const qrs = res.data.data.all_qrs || [];
            setAllQrs(qrs);
            const active = qrs.find((q: any) => q.is_active === 1) || qrs[0] || null;
            if (active) setSelectedQrId(active.id);
          }
        })
        .catch(() => {});
    }
  }, [open]);

  const currentQr = allQrs.find(q => q.id === selectedQrId) || {
    upi_id: settings.upi_id,
    upi_name: settings.upi_name,
    upi_number: settings.upi_number,
    qr_image_url: settings.upi_qr_url,
    title: 'Default Payment QR'
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!transactionId.trim()) {
      addToast('error', 'Please enter your UTR / Transaction reference number.');
      return;
    }

    if (transactionId.length < 10) {
      addToast('error', 'Transaction UTR must be at least 10 digits.');
      return;
    }

    setSubmitting(true);
    try {
      const res = await api.post('/payments/qr-confirm', {
        booking_id: bookingId,
        package_request_id: packageRequestId,
        amount,
        transaction_id: transactionId.trim(),
        payment_qr_id: currentQr.id
      });

      if (res.data.success) {
        addToast('success', res.data.message || 'Payment reference submitted successfully!');
        onSuccess();
        onClose();
      } else {
        throw new Error(res.data.error || 'Failed to submit payment reference.');
      }
    } catch (err: any) {
      console.error(err);
      addToast('error', err.response?.data?.error || err.message || 'Failed to submit payment.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal open={open} onClose={onClose} title="Pay via UPI QR Code" size="md">
      <div className="flex flex-col items-center text-center space-y-4">
        {/* Payment QR Selector Dropdown (if multiple QRs exist) */}
        {allQrs.length > 1 && (
          <div className="w-full text-left bg-blue-50/80 border border-blue-200 rounded-xl p-3">
            <label className="block text-[11px] font-black text-slate-700 uppercase tracking-wider mb-1">
              Select Preferred Payment QR Code
            </label>
            <select
              value={selectedQrId || ''}
              onChange={(e) => setSelectedQrId(parseInt(e.target.value, 10))}
              className="w-full px-3 py-2 bg-white border border-blue-300 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500/20"
            >
              {allQrs.map((q: any) => (
                <option key={q.id} value={q.id}>
                  {q.title} — {q.upi_id}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* UPI Details */}
        <div className="bg-sky-50 border border-sky-100 rounded-xl p-3.5 w-full flex items-center justify-between">
          <div className="text-left">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Payee Name</p>
            <p className="text-sm font-extrabold text-slate-900">{currentQr.upi_name || settings.upi_name || settings.studio_name || 'O3 Car Spa'}</p>
          </div>
          <div className="text-right">
            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">UPI ID / Number</p>
            <p className="text-sm font-bold text-[#0284C7]">{currentQr.upi_id || settings.upi_id || '7225030303@paytm'}</p>
            <p className="text-xs text-slate-500 font-semibold">{currentQr.upi_number || settings.upi_number || '7225030303'}</p>
          </div>
        </div>

        {/* Amount to Pay */}
        <div>
          <p className="text-xs text-slate-500 font-bold tracking-wide">TOTAL PAYABLE AMOUNT</p>
          <p className="text-3xl font-extrabold text-[#0284C7]">₹{amount.toLocaleString('en-IN')}</p>
        </div>

        {/* QR Code Image Container */}
        <div className="relative border-4 border-slate-100 rounded-2xl overflow-hidden bg-white shadow-md p-2 w-64 h-64 flex flex-col items-center justify-center">
          {currentQr.qr_image_url || settings.upi_qr_url ? (
            <img
              src={currentQr.qr_image_url || settings.upi_qr_url || ''}
              alt="UPI QR Code"
              className="w-56 h-56 object-contain"
            />
          ) : (
            <div className="flex flex-col items-center justify-center w-full h-full p-4 bg-sky-50/50 rounded-xl border border-sky-100">
              <QrCode size={64} className="text-[#0284C7] mb-2" />
              <p className="text-xs font-bold text-slate-800">{currentQr.upi_name || settings.upi_name || 'O3 Car Spa'}</p>
              <p className="text-[11px] font-semibold text-[#0284C7] mt-0.5">{currentQr.upi_id || settings.upi_id || '7225030303@paytm'}</p>
              <span className="mt-2 px-2.5 py-1 bg-white text-[10px] text-slate-500 font-medium rounded-md shadow-xs border border-slate-200">
                Scan with GPay, PhonePe, Paytm or UPI App
              </span>
            </div>
          )}
        </div>

        {/* Scanning Instructions */}
        <div className="flex items-start gap-2.5 text-left bg-slate-50 rounded-xl p-3 border border-slate-200/80 w-full">
          <Info size={16} className="text-[#0284C7] shrink-0 mt-0.5" />
          <div>
            <p className="text-xs font-bold text-slate-800">Scan & Pay Instructions</p>
            <p className="text-[11px] text-slate-600 mt-0.5 leading-snug">
              1. Open GPay, PhonePe, Paytm, or any UPI App & scan the QR above.<br />
              2. Pay exact amount <strong>₹{amount.toLocaleString('en-IN')}</strong>.<br />
              3. Paste your 12-digit <strong>UTR / Reference No.</strong> below to confirm.
            </p>
          </div>
        </div>

        {/* Transaction ID Input Form */}
        <form onSubmit={handleSubmit} className="w-full space-y-3 pt-1">
          <div className="text-left">
            <label className="block text-xs font-bold text-slate-700 mb-1">
              Enter 12-Digit UTR / UPI Transaction Reference No. <span className="text-blue-500">*</span>
            </label>
            <input
              type="text"
              value={transactionId}
              onChange={(e) => setTransactionId(e.target.value)}
              placeholder="e.g. 420918374920"
              className="w-full px-3.5 py-2.5 border border-slate-300 rounded-xl text-sm focus:ring-2 focus:ring-[#0284C7]/20 focus:border-[#0284C7] bg-white font-mono"
              required
            />
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 px-4 border border-slate-300 text-slate-700 text-sm font-semibold rounded-xl hover:bg-slate-100 transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex-1 py-2.5 px-4 bg-[#0284C7] hover:bg-[#0369A1] text-white text-sm font-bold rounded-xl shadow-sm transition-all flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 size={16} className="animate-spin" />
                  <span>Submitting...</span>
                </>
              ) : (
                <>
                  <CheckCircle size={16} />
                  <span>Confirm Payment</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </Modal>
  );
}
