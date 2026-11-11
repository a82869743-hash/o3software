import { useState } from 'react';
import { QrCode } from 'lucide-react';
import { API_BASE } from '../../utils/endpoints';

interface Props {
  amount?: number | string;
  note?: string;
  className?: string;
  /** Which QR to show — the admin can pick a different uploaded QR for each place */
  place?: 'invoice' | 'jobcard' | 'payment';
}

/**
 * The studio's payment QR from Settings → Payment QR. With an amount it renders a UPI QR for that
 * exact amount; without one it shows the uploaded QR image.
 */
export default function StudioQr({ amount, note, className = 'w-40 h-40', place = 'payment' }: Props) {
  const [failed, setFailed] = useState(false);
  const params = new URLSearchParams();
  if (amount && Number(amount) > 0) params.set('amount', String(Number(amount).toFixed(2)));
  if (note) params.set('note', note);
  params.set('for', place);
  const src = `${API_BASE}/settings/qr.png${params.toString() ? `?${params}` : ''}`;
  if (failed) {
    return (
      <div className={`${className} flex flex-col items-center justify-center text-center text-[10px] text-slate-500 bg-slate-50 rounded-lg border border-dashed border-slate-300 p-2`}>
        <QrCode size={22} className="text-slate-400 mb-1" />
        Add a payment QR / UPI ID in Settings
      </div>
    );
  }
  return <img src={src} alt="Scan to pay (UPI)" className={`${className} object-contain rounded-lg bg-white`} onError={() => setFailed(true)} />;
}
