import { useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { CheckCircle2, Activity, Share2, ExternalLink, Loader2, MessageCircle } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { socketUrl, APP_URL } from '../../utils/endpoints';
import { useLiveReload } from '../../utils/liveUpdates';
import { copyText } from '../../utils/copyText';

interface Stage { index: number; stage_name: string; status: 'completed' | 'in_progress' | 'pending'; notes?: string | null; updated_at?: string | null }

interface Props {
  jobCartId: number;
  publicToken?: string;
  canUpdate: boolean;
  /** called after a stage change (e.g. to refetch the job card) */
  onChanged?: () => void;
}

/**
 * The ONE customer pipeline: click a stage once to move the car there. Earlier stages are completed
 * automatically, the customer's tracking page updates live and they get a WhatsApp message.
 */
export default function JobPipeline({ jobCartId, publicToken, canUpdate, onChanged }: Props) {
  const toast = useUIStore(s => s.toast);
  const token = useAuthStore(s => s.token);
  const [stages, setStages] = useState<Stage[]>([]);
  const [current, setCurrent] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState('');

  const load = async () => {
    try {
      const { data } = await api.get(`/job-carts/${jobCartId}/stages`);
      setStages(data.data.stages || []);
      setCurrent(data.data.current_stage);
    } catch { /* shown elsewhere */ }
  };

  useLiveReload(() => { load(); }); // reload when anything changes elsewhere
  useEffect(() => {
    load();
    const socket = io(socketUrl(), { auth: { token }, transports: ['websocket', 'polling'] });
    socket.emit('join_job', { jobId: jobCartId });
    socket.on('pipeline:stage_updated', (p: any) => { if (Number(p.jobCartId) === Number(jobCartId)) load(); });
    return () => { socket.disconnect(); };
  }, [jobCartId]);

  const move = async (stageName: string) => {
    if (!canUpdate || busy) return;
    if (stageName === current && !note.trim()) return;
    setBusy(stageName);
    // optimistic UI
    const idx = stages.findIndex(s => s.stage_name === stageName);
    const prev = stages;
    setStages(stages.map((s, i) => ({ ...s, status: i < idx || stageName === 'Delivered' ? 'completed' : i === idx ? 'in_progress' : 'pending' })));
    setCurrent(stageName);
    try {
      const { data } = await api.put(`/job-carts/${jobCartId}/stages`, { stage_name: stageName, notes: note.trim() || undefined });
      toast('success', data.message);
      setNote('');
      onChanged?.();
    } catch (e: any) {
      setStages(prev);
      load();
      toast('error', e.message || 'Could not update stage');
    } finally {
      setBusy(null);
    }
  };

  const trackUrl = publicToken ? `${APP_URL}/job/${publicToken}` : '';
  const currentIdx = stages.findIndex(s => s.stage_name === current);

  return (
    <div className="bg-white rounded-2xl p-5 shadow-sm border border-slate-200 space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center"><Activity size={20} /></div>
          <div>
            <h3 className="text-sm font-extrabold text-slate-900 uppercase tracking-wider">Car Progress</h3>
            <p className="text-xs text-slate-500">
              {canUpdate ? 'Tap a step to update the car. The customer sees it and gets a WhatsApp message.' : 'Live progress of this car.'}
            </p>
          </div>
        </div>
        {trackUrl && (
          <div className="flex items-center gap-2">
            <button type="button" onClick={() => { copyText(trackUrl); toast('success', 'Tracking link copied'); }}
              className="px-3 py-1.5 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold rounded-xl border border-slate-200 flex items-center gap-1.5">
              <Share2 size={13} /> Copy link
            </button>
            <a href={trackUrl} target="_blank" rel="noreferrer"
              className="px-3 py-1.5 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-bold rounded-xl border border-blue-200 flex items-center gap-1.5">
              <ExternalLink size={13} /> See as customer
            </a>
          </div>
        )}
      </div>

      <div className="relative">
        <div className="absolute left-0 right-0 top-[18px] h-1 bg-slate-100 rounded-full hidden sm:block" />
        <div className="absolute left-0 top-[18px] h-1 bg-emerald-400 rounded-full hidden sm:block transition-all"
          style={{ width: stages.length > 1 && currentIdx >= 0 ? `${(currentIdx / (stages.length - 1)) * 100}%` : '0%' }} />
        <div className="relative grid grid-cols-2 sm:flex sm:justify-between gap-2">
          {stages.map((st, i) => {
            const done = st.status === 'completed';
            const active = st.status === 'in_progress';
            return (
              <button key={st.stage_name} type="button" disabled={!canUpdate || !!busy} onClick={() => move(st.stage_name)}
                title={canUpdate ? `Move to ${st.stage_name}` : st.stage_name}
                className={`flex sm:flex-col items-center gap-2 sm:gap-1.5 text-left sm:text-center p-1 rounded-lg transition-all ${canUpdate ? 'hover:bg-blue-50 cursor-pointer' : 'cursor-default'} disabled:opacity-100`}>
                <span className={`w-9 h-9 shrink-0 rounded-full flex items-center justify-center text-xs font-black border-2 ${
                  done ? 'bg-emerald-500 border-emerald-500 text-white' : active ? 'bg-blue-600 border-blue-600 text-white ring-4 ring-blue-100' : 'bg-white border-slate-300 text-slate-400'}`}>
                  {busy === st.stage_name ? <Loader2 size={14} className="animate-spin" /> : done ? <CheckCircle2 size={16} /> : i + 1}
                </span>
                <span className={`text-[11px] font-bold leading-tight sm:max-w-[90px] ${active ? 'text-blue-700' : done ? 'text-slate-700' : 'text-slate-400'}`}>{st.stage_name}</span>
              </button>
            );
          })}
        </div>
      </div>

      {canUpdate && (
        <div className="flex items-center gap-2">
          <MessageCircle size={14} className="text-emerald-600 shrink-0" />
          <input value={note} onChange={e => setNote(e.target.value)} maxLength={300}
            placeholder="Note for the customer (optional), e.g. 'Ready by 6 PM'"
            className="flex-1 text-xs bg-slate-50 border border-slate-200 rounded-xl px-3 py-2 focus:outline-none focus:border-blue-400" />
          {note.trim() && current && (
            <button type="button" onClick={() => move(current)} className="text-xs font-bold text-blue-600 whitespace-nowrap">Send note now</button>
          )}
        </div>
      )}
    </div>
  );
}
