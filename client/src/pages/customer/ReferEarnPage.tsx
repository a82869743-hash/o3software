import { useEffect, useState } from 'react';
import { Copy, Share2, Users, CheckCircle2, Clock } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useStudio } from '../../api/hooks/useStudio';
import { formatINR, formatDate } from '../../utils/formatters';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import { APP_URL } from '../../utils/endpoints';
import { useLiveReload } from '../../utils/liveUpdates';
import ReferFriend from '../../components/shared/ReferFriend';
import { copyText } from '../../utils/copyText';

/** Refer & Earn — share code on WhatsApp, see earnings (paid / due) and each referral. */
export default function ReferEarnPage() {
  const toast = useUIStore(s => s.toast);
  const { data: studio } = useStudio();
  const [data, setData] = useState<any>(null);

  const [live, setLive] = useState(0);
  useLiveReload(() => setLive(n => n + 1)); // reload when anything changes elsewhere
  useEffect(() => { api.get('/referrals/my').then(r => setData(r.data.data)).catch((e: any) => toast('error', e.message)); }, [toast, live]);

  const code = data?.code || '';
  const link = `${APP_URL}/register?ref=${code}`;
  const msg = `I get my car detailed at ${studio?.studio_name || 'O3 Car Spaa'} — they're brilliant! Sign up with my code *${code}* and we both get rewards: ${link}`;

  const copy = () => { copyText(code); toast('success', 'Code copied'); };
  const shareOther = async () => {
    if ((navigator as any).share) { try { await (navigator as any).share({ title: 'O3 Car Spaa', text: msg, url: link }); } catch { /* cancelled */ } }
    else { copyText(msg); toast('success', 'Invite message copied'); }
  };

  return (
    <div className="-mx-4 -mt-4">
      <section className="relative overflow-hidden bg-gradient-to-br from-[#0F172A] via-[#1E3A8A] to-[#2563EB] text-white px-5 pt-8 pb-28 text-center">
        <div className="absolute -left-10 -top-10 w-48 h-48 rounded-full bg-white/5" />
        <div className="absolute -right-12 top-16 w-56 h-56 rounded-full bg-sky-400/10" />
        <p className="text-sm text-white/80">Give your friends a</p>
        <p className="text-2xl font-black text-amber-300 mt-1">PREMIUM CAR SPA EXPERIENCE</p>
        <p className="text-sm text-white/80">& earn rewards on every visit they make</p>
        {/* Podium with the reward illustration (Hoora-style) */}
        <div className="relative mt-5 mx-auto w-52">
          <div className="absolute inset-x-6 -bottom-3 h-8 rounded-[50%] bg-gradient-to-b from-amber-200/70 to-amber-500/30 blur-[1px]" />
          <div className="absolute inset-x-10 -bottom-1 h-5 rounded-[50%] bg-white/30" />
          <div className="relative mx-auto w-44 h-44 rounded-[36px] bg-white shadow-[0_20px_60px_rgba(251,191,36,0.35)] overflow-hidden">
            <img src="/illustrations/refer.webp" alt="" className="w-full h-full object-contain mix-blend-multiply" />
          </div>
        </div>
      </section>

      <div className="px-4 -mt-20 relative space-y-4">
        <div className="bg-white rounded-3xl p-4 shadow-xl">
          <p className="text-sm font-bold text-blue-700 flex items-center gap-2"><Users size={16} /> Invite friends & earn on their first service</p>
          <div className="mt-3 flex items-center justify-between bg-slate-50 border border-slate-200 rounded-2xl pl-4 pr-1.5 py-1.5">
            <span className="font-mono font-black text-lg tracking-wider text-slate-900">{code || '••••••'}</span>
            <button onClick={copy} className="tap flex items-center gap-1.5 bg-white border border-slate-200 rounded-xl px-3 py-2 text-sm font-bold"><Copy size={15} /> Copy</button>
          </div>
          <div className="grid grid-cols-5 gap-2 mt-3">
            <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer"
              className="tap col-span-3 flex items-center justify-center gap-2 bg-[#25D366] text-white font-extrabold rounded-2xl py-3.5">
              <svg viewBox="0 0 24 24" className="w-5 h-5 fill-current"><path d="M17.5 14.4c-.3-.1-1.7-.8-2-.9-.3-.1-.5-.1-.7.1-.2.3-.8.9-.9 1.1-.2.2-.3.2-.6.1-.3-.1-1.2-.5-2.3-1.4-.9-.8-1.4-1.7-1.6-2-.2-.3 0-.5.1-.6l.4-.5c.1-.2.2-.3.3-.5.1-.2 0-.4 0-.5l-.9-2.2c-.2-.6-.5-.5-.7-.5h-.6c-.2 0-.5.1-.7.3-.3.3-1 1-1 2.4s1 2.8 1.2 3c.1.2 2 3.1 4.9 4.3.7.3 1.2.5 1.6.6.7.2 1.3.2 1.8.1.5-.1 1.7-.7 1.9-1.4.2-.7.2-1.2.2-1.4-.1-.1-.3-.2-.6-.3zM12 21.8c-1.8 0-3.5-.5-5-1.4l-.4-.2-3.7 1 1-3.6-.2-.4c-1-1.6-1.5-3.4-1.5-5.2 0-5.4 4.4-9.8 9.8-9.8 2.6 0 5.1 1 6.9 2.9 1.8 1.8 2.9 4.3 2.9 6.9 0 5.4-4.4 9.8-9.8 9.8z"/></svg>
              WhatsApp
            </a>
            <button onClick={shareOther} className="tap col-span-2 flex items-center justify-center gap-2 bg-white border border-slate-200 font-extrabold rounded-2xl py-3.5"><Share2 size={17} /> Other</button>
          </div>
        </div>

        <ReferFriend />

        <div className="grid grid-cols-3 gap-2">
          {[['Referrals', data?.referrals?.length || 0, false], ['Earned', data?.earned || 0, true], ['Due to you', data?.unpaid || 0, true]].map(([l, v, m]) => (
            <div key={l as string} className="bg-white rounded-2xl p-3 text-center shadow-sm">
              <p className="text-lg font-black text-slate-900">{m ? formatINR(v as number) : String(v)}</p>
              <p className="text-[11px] font-semibold text-slate-500">{l}</p>
            </div>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-extrabold text-slate-900 mb-1">How it works</h3>
          {['Share your code, or send us your friend’s details above', 'Our team contacts them and they get their first service', 'You earn a reward only after their service is done — paid by the studio'].map((t, i) => (
            <p key={i} className="flex gap-3 text-sm text-slate-600 py-1.5"><span className="w-6 h-6 rounded-full bg-blue-600 text-white text-xs font-bold flex items-center justify-center shrink-0">{i + 1}</span>{t}</p>
          ))}
        </div>

        <div className="bg-white rounded-2xl p-4 shadow-sm">
          <h3 className="font-extrabold text-slate-900 mb-2">Your referrals</h3>
          {(data?.referrals || []).length === 0 && <p className="text-sm text-slate-400 py-3 text-center">No referrals yet — share your code!</p>}
          {(data?.referrals || []).map((r: any) => (
            <div key={r.id} className="flex items-center justify-between py-2.5 border-t border-slate-100 first:border-0">
              <div>
                <p className="text-sm font-bold text-slate-900">{r.referred_customer_name || 'Friend'}</p>
                <p className="text-xs text-slate-500">{formatDate(r.created_at)}</p>
              </div>
              <div className="text-right">
                <p className="text-sm font-black">{formatINR(r.amount)}</p>
                <p className={`text-[11px] font-bold flex items-center gap-1 justify-end ${r.status === 'paid' ? 'text-emerald-600' : 'text-amber-600'}`}>
                  {r.status === 'paid' ? <><CheckCircle2 size={12} /> Paid</> : <><Clock size={12} /> {r.status === 'pending' ? 'Service in progress' : 'Due'}</>}
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
