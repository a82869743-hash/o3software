import { useState } from 'react';
import { MessageCircle, Phone, Send } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import { useStudio } from '../../api/hooks/useStudio';

const TOPICS = ['Booking / reschedule', 'My car service', 'Payment / invoice', 'Package / membership', 'Complaint', 'Other'];

/** Help & Support — customer questions become Inquiries (support), answered on WhatsApp. */
export default function SupportPage() {
  const toast = useUIStore(s => s.toast);
  const { data: studio } = useStudio();
  const [topic, setTopic] = useState(TOPICS[0]);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);

  const submit = async () => {
    if (message.trim().length < 5) { toast('error', 'Please describe your question'); return; }
    setBusy(true);
    try {
      await api.post('/inquiries', { type: 'support', subject: topic, message: message.trim() });
      setSent(true); setMessage('');
    } catch (e: any) { toast('error', e.message); } finally { setBusy(false); }
  };

  const wa = (studio as any)?.support_whatsapp || studio?.mobile || '';
  return (
    <div className="space-y-4">
      <PhotoBanner img={BANNER_PHOTOS.inspection} kicker="We are here to help" line="Questions? We reply on WhatsApp" />
      <div className="grid grid-cols-2 gap-2.5">
        {wa && (
          <a href={`https://wa.me/91${String(wa).replace(/\D/g, '').slice(-10)}`} target="_blank" rel="noreferrer" className="tap bg-[#25D366] text-white rounded-2xl p-4 flex flex-col gap-2">
            <MessageCircle size={24} /><span className="font-extrabold">Chat on WhatsApp</span>
          </a>
        )}
        {studio?.mobile && (
          <a href={`tel:${studio.mobile}`} className="tap bg-white rounded-2xl p-4 flex flex-col gap-2 shadow-sm">
            <Phone size={24} className="text-blue-600" /><span className="font-extrabold text-slate-900">Call the studio</span>
          </a>
        )}
      </div>

      <div className="bg-white rounded-2xl p-4 shadow-sm space-y-3">
        <h3 className="font-extrabold text-slate-900">Ask us anything</h3>
        {sent ? (
          <div className="text-center py-6">
            <p className="text-3xl">✅</p>
            <p className="font-bold text-slate-900 mt-2">Got it! We'll reply on WhatsApp shortly.</p>
            <button onClick={() => setSent(false)} className="mt-3 text-sm font-bold text-blue-600">Ask another question</button>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap gap-2">
              {TOPICS.map(t => (
                <button key={t} onClick={() => setTopic(t)} className={`tap px-3 py-1.5 rounded-full text-xs font-bold border ${topic === t ? 'bg-blue-600 text-white border-blue-600' : 'bg-white text-slate-600 border-slate-200'}`}>{t}</button>
              ))}
            </div>
            <textarea value={message} onChange={e => setMessage(e.target.value)} rows={4} maxLength={1000}
              placeholder="Type your question…" className="w-full rounded-xl border border-slate-200 p-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20" />
            <button onClick={submit} disabled={busy} className="tap w-full flex items-center justify-center gap-2 bg-blue-600 text-white font-extrabold rounded-xl py-3 disabled:opacity-60">
              <Send size={16} /> {busy ? 'Sending…' : 'Send'}
            </button>
          </>
        )}
      </div>
      {(studio as any)?.support_hours && <p className="text-center text-xs text-slate-400">Studio hours: {(studio as any).support_hours}</p>}
    </div>
  );
}
