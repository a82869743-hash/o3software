import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import { 
  Clock, Droplets, CheckCircle2, Car, Sparkles, Activity, Shield, 
  ChevronRight, Calendar, ArrowLeft, RefreshCw, FileText, Check, AlertCircle 
} from 'lucide-react';
import api from '../../api/axiosInstance';
import { formatDate, formatTime } from '../../utils/formatters';

// Default stage descriptions for standard 7-stage detailing pipeline
const DEFAULT_STAGE_DESCRIPTIONS: Record<string, string> = {
  'Received': 'Vehicle received at studio, registered and pre-check begun.',
  'Inspection': '360° paint depth inspection, panel condition check & inventory recorded.',
  'Stage 1 done': 'Deep exterior decontamination, snow foam wash & clay bar treatment complete.',
  'Stage 2 done': 'Multi-stage paint correction, compounding & high-gloss polish finished.',
  'Quality check': 'Rigorous multi-point quality inspection & defect verification.',
  'Ready': 'Vehicle final wiped, dressed and staged ready for customer pickup!',
  'Delivered': 'Vehicle successfully inspected and handed over to customer.'
};

const WASH_PHASE_LABELS = {
  pre_wash: 'Pre-Wash',
  foam_apply: 'Soap Foam Apply',
  pressure_rinse: 'Pressure Rinse',
  interior_clean: 'Interior Vacuum',
  dry_polish: 'Dry & Polish',
  complete: 'Wash Completed',
};

const PHASE_DETAILS = {
  pre_wash: 'Initial high-pressure water spray to loosen dirt and road grime.',
  foam_apply: 'Applying premium pH-neutral cleaning foam to dissolve remaining dirt.',
  pressure_rinse: 'Thorough rinsing using high-pressure demineralized water.',
  interior_clean: 'Deep interior vacuuming, dashboard cleaning, and sanitizing.',
  dry_polish: 'Microfiber drying and application of tire polish & paint wax.',
  complete: 'Your vehicle has been washed, dried, polished, and is ready for pickup!',
};

const PHASE_ORDER = ['pre_wash', 'foam_apply', 'pressure_rinse', 'interior_clean', 'dry_polish', 'complete'];

interface StageItem {
  index: number;
  stage_name: string;
  status: 'pending' | 'in_progress' | 'completed' | 'skipped';
  notes: string | null;
  updated_at: string | null;
  completed_at: string | null;
}

interface StageHistory {
  id: number;
  stage_name: string;
  status: string;
  notes: string | null;
  created_at: string;
  updated_by_name: string | null;
}

export default function JobTrackingPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  // Mode: 'job_cart' (Detailing 7-stage pipeline) or 'quick_wash'
  const [trackingType, setTrackingType] = useState<'job_cart' | 'quick_wash'>('job_cart');

  // Detailing Job Cart State
  const [pipelineData, setPipelineData] = useState<{
    job_card: any;
    stages: StageItem[];
    current_stage: string;
    history: StageHistory[];
    is_delivered: boolean;
  } | null>(null);

  // Quick Wash State
  const [washData, setWashData] = useState<{
    id: number;
    current_phase: string;
    phase_updated_at: string;
    wash_status: string;
  } | null>(null);

  const [jobPhotos, setJobPhotos] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);

  // Fetch job card pipeline stages first; fallback to quick-wash
  const fetchTracking = async (isManual = false) => {
    if (isManual) setRefreshing(true);
    try {
      // 1. Try Detailing Job Card endpoint
      const jcRes = await api.get(`/job-carts/${id}/stages`);
      if (jcRes.data?.success && jcRes.data.data?.stages) {
        setTrackingType('job_cart');
        setPipelineData(jcRes.data.data);
        setError(null);
        return;
      }
    } catch (jcErr: any) {
      // 2. Fallback to quick-wash phase tracking
      try {
        const qwRes = await api.get(`/quick-wash/${id}/phase`);
        if (qwRes.data?.success) {
          setTrackingType('quick_wash');
          setWashData(qwRes.data.data);
          setError(null);
          return;
        }
      } catch (qwErr: any) {
        setError('Tracking session not found or vehicle record has been archived.');
      }
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (id) {
      fetchTracking();
      // Fetch photos if any
      api.get(`/job-carts/${id}/photos`).then(res => {
        if (res.data?.success) setJobPhotos(res.data.data || []);
      }).catch(() => {});
    }
  }, [id]);

  // Connect to Socket.io for Real-Time Pipeline Stage updates
  useEffect(() => {
    if (!id) return;

    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || 'http://localhost:5000';
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] });

    socket.on('connect', () => {
      // join room if available
      socket.emit('join_job', { jobId: id });
    });

    // Real-time stage update event
    socket.on('pipeline:stage_updated', (data) => {
      if (data && Number(data.jobCartId) === Number(id)) {
        fetchTracking();
      }
    });

    // Real-time quick wash events
    socket.on('wash:phase_updated', (data) => {
      if (data && Number(data.bookingId) === Number(id)) {
        fetchTracking();
      }
    });

    socket.on('quick_wash_updated', (data) => {
      if (data && Number(data.bookingId) === Number(id)) {
        fetchTracking();
      }
    });

    // Polling fallback every 10 seconds for robustness
    const pollInterval = setInterval(() => {
      fetchTracking();
    }, 10000);

    return () => {
      clearInterval(pollInterval);
      socket.disconnect();
    };
  }, [id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="text-center space-y-4 max-w-sm w-full p-8 bg-white rounded-3xl border border-slate-200 shadow-sm animate-pulse">
          <div className="w-12 h-12 bg-blue-100 rounded-2xl mx-auto" />
          <div className="h-6 bg-slate-200 rounded-md w-3/4 mx-auto" />
          <div className="h-4 bg-slate-100 rounded-md w-1/2 mx-auto" />
          <p className="text-xs font-semibold text-slate-400 mt-2">Connecting to O3 Studio live pipeline...</p>
        </div>
      </div>
    );
  }

  if (error || (!pipelineData && !washData)) {
    return (
      <div className="min-h-screen bg-[#F8FAFC] flex items-center justify-center p-4">
        <div className="bg-white p-8 rounded-3xl shadow-xl max-w-md w-full text-center border border-slate-100">
          <div className="w-16 h-16 bg-blue-50 rounded-2xl flex items-center justify-center mx-auto mb-4 text-[#2563EB]">
            <Shield size={32} />
          </div>
          <h2 className="text-xl font-extrabold text-slate-900 mb-2">Tracking Session Not Found</h2>
          <p className="text-slate-500 text-sm mb-6 leading-relaxed">
            {error || 'Unable to locate an active vehicle detailing pipeline for this ID.'}
          </p>
          <button
            onClick={() => navigate('/')}
            className="w-full py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white rounded-xl text-xs font-black uppercase tracking-wider shadow-md transition-all"
          >
            Go to O3 Car Spaa Home
          </button>
        </div>
      </div>
    );
  }

  // ─── RENDER DETAILING JOB CARD PIPELINE ───
  if (trackingType === 'job_cart' && pipelineData) {
    const { job_card, stages, current_stage, history, is_delivered } = pipelineData;
    const completedStagesCount = stages.filter(s => s.status === 'completed').length;
    const progressPct = Math.round((completedStagesCount / Math.max(stages.length, 1)) * 100);

    return (
      <div className="min-h-screen bg-[#F8FAFC] py-8 px-4 sm:px-6 lg:px-8 flex justify-center">
        <div className="max-w-2xl w-full space-y-6">
          
          {/* Header */}
          <div className="flex items-center justify-between">
            <div>
              <span className="text-[10px] font-black uppercase tracking-widest text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-full border border-blue-200">
                O3 Car Spaa Detailing
              </span>
              <h1 className="text-2xl font-black text-slate-900 tracking-tight mt-1">Live Vehicle Pipeline</h1>
            </div>
            <button
              onClick={() => fetchTracking(true)}
              className="p-2.5 bg-white border border-slate-200 hover:border-blue-300 rounded-xl text-slate-600 hover:text-[#2563EB] shadow-xs transition-all flex items-center gap-1.5 text-xs font-bold"
              title="Refresh tracking data"
            >
              <RefreshCw size={14} className={refreshing ? 'animate-spin text-[#2563EB]' : ''} />
              <span className="hidden sm:inline">Refresh</span>
            </button>
          </div>

          {/* Vehicle Information Hero Card */}
          <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-indigo-950 rounded-3xl p-6 text-white shadow-xl relative overflow-hidden">
            {/* Background glowing orb */}
            <div className="absolute -right-8 -top-8 w-44 h-44 bg-blue-500/20 rounded-full blur-2xl pointer-events-none" />

            <div className="relative z-10">
              <div className="flex items-center justify-between gap-3 mb-4">
                <div className="flex items-center gap-2 bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 px-3 py-1 rounded-full text-xs font-extrabold uppercase tracking-wider">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
                  <span>{is_delivered ? 'Delivered' : 'Live Detailing Tracking'}</span>
                </div>
                <span className="text-xs font-bold text-slate-400">Job Card #{job_card.id}</span>
              </div>

              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
                    {job_card.registration_no || 'Vehicle In Studio'}
                  </h2>
                  <p className="text-xs sm:text-sm text-slate-300 font-semibold mt-0.5">
                    {job_card.brand} {job_card.model} {job_card.customer_name ? `• ${job_card.customer_name}` : ''}
                  </p>
                </div>
                <div className="sm:text-right">
                  <p className="text-[10px] uppercase font-bold text-slate-400 tracking-wider">Current Pipeline Stage</p>
                  <p className="text-base sm:text-lg font-black text-sky-300 mt-0.5">
                    {current_stage}
                  </p>
                </div>
              </div>

              {/* Progress bar */}
              <div className="mt-6 pt-4 border-t border-slate-700/60">
                <div className="flex justify-between items-center text-xs font-bold text-slate-300 mb-1.5">
                  <span>Pipeline Progress</span>
                  <span>{progressPct}% Completed ({completedStagesCount}/{stages.length})</span>
                </div>
                <div className="w-full bg-slate-700/70 rounded-full h-2.5 overflow-hidden">
                  <div
                    className="h-2.5 bg-gradient-to-r from-blue-500 to-sky-400 rounded-full transition-all duration-700 shadow-sm"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            </div>
          </div>

          {/* Live Pipeline Stepper Timeline */}
          <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-2">
                <span className="p-1.5 bg-blue-50 text-[#2563EB] rounded-lg">
                  <Activity size={18} />
                </span>
                <h3 className="font-extrabold text-slate-900 text-base">Detailing Stages</h3>
              </div>
              <span className="text-xs font-bold text-slate-500">Auto-updating live</span>
            </div>

            <div className="relative pl-7 sm:pl-8 space-y-7 before:absolute before:top-3 before:left-3.5 sm:before:left-4 before:bottom-3 before:w-[2px] before:bg-slate-200">
              {stages.map((stage, idx) => {
                const isCompleted = stage.status === 'completed';
                const isInProgress = stage.status === 'in_progress';
                const isPending = stage.status === 'pending';
                const desc = stage.notes || DEFAULT_STAGE_DESCRIPTIONS[stage.stage_name] || 'Studio detailing process milestone.';

                return (
                  <div key={stage.stage_name} className="relative group">
                    {/* Circle Node Indicator */}
                    <div className={`absolute top-0.5 -left-7 sm:-left-8 w-7 h-7 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10 ${
                      isCompleted 
                        ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-sm'
                        : isInProgress 
                        ? 'bg-white border-[#2563EB] text-[#2563EB] ring-4 ring-blue-100 scale-110 shadow-md'
                        : 'bg-white border-slate-300 text-slate-400'
                    }`}>
                      {isCompleted ? (
                        <Check size={14} className="stroke-[3]" />
                      ) : isInProgress ? (
                        <span className="w-2.5 h-2.5 rounded-full bg-[#2563EB] animate-pulse" />
                      ) : (
                        <span className="text-[10px] font-bold">{idx + 1}</span>
                      )}
                    </div>

                    {/* Stage Details */}
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <h4 className={`text-sm sm:text-base font-extrabold transition-colors ${
                            isInProgress ? 'text-[#2563EB]' : isCompleted ? 'text-slate-900' : 'text-slate-400'
                          }`}>
                            {stage.stage_name}
                          </h4>
                          {isInProgress && (
                            <span className="px-2 py-0.5 rounded-full bg-blue-100 text-[#2563EB] text-[9px] font-black uppercase tracking-wider animate-pulse">
                              In Progress
                            </span>
                          )}
                          {isCompleted && (
                            <span className="px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase tracking-wider">
                              Done
                            </span>
                          )}
                        </div>

                        {stage.updated_at && (
                          <span className="text-[10px] font-bold text-slate-400 flex items-center gap-1">
                            <Clock size={11} />
                            {new Date(stage.updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        )}
                      </div>

                      <p className={`text-xs mt-1 leading-relaxed ${
                        isInProgress ? 'text-slate-700 font-medium' : isCompleted ? 'text-slate-500' : 'text-slate-400'
                      }`}>
                        {desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* History logs accordion toggle */}
            {history && history.length > 0 && (
              <div className="mt-8 pt-4 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowHistory(!showHistory)}
                  className="w-full flex items-center justify-between text-xs font-bold text-slate-600 hover:text-[#2563EB] transition-colors py-1"
                >
                  <span className="flex items-center gap-1.5">
                    <FileText size={14} />
                    <span>View Timestamped Transition Audit Log ({history.length} events)</span>
                  </span>
                  <ChevronRight size={14} className={`transform transition-transform ${showHistory ? 'rotate-90' : ''}`} />
                </button>

                {showHistory && (
                  <div className="mt-3 space-y-2 bg-slate-50 rounded-2xl p-4 border border-slate-100 text-xs">
                    {history.map((log) => (
                      <div key={log.id} className="flex flex-col sm:flex-row sm:items-center justify-between gap-1 py-1.5 border-b border-slate-200/60 last:border-0">
                        <div>
                          <span className="font-extrabold text-slate-800">{log.stage_name}</span>
                          <span className="text-slate-400 mx-1.5">•</span>
                          <span className="font-semibold text-[#2563EB] uppercase text-[10px]">{log.status}</span>
                          {log.notes && <p className="text-slate-500 text-[11px] mt-0.5">{log.notes}</p>}
                        </div>
                        <span className="text-[10px] font-medium text-slate-400 whitespace-nowrap">
                          {new Date(log.created_at).toLocaleString('en-IN', { dateStyle: 'short', timeStyle: 'short' })}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Before & After Photo Gallery */}
          {jobPhotos.length > 0 && (
            <div className="bg-white rounded-3xl shadow-sm border border-slate-200 p-6 space-y-4">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Sparkles size={16} className="text-[#2563EB]" />
                <span>Vehicle Inspection & Detailing Photos</span>
              </h3>
              
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">Before Service</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {jobPhotos.filter(p => p.type === 'before').map(p => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 hover:opacity-90 transition shadow-2xs">
                        <img src={p.url} alt="Before Service" className="w-full h-28 object-cover" />
                      </a>
                    ))}
                    {jobPhotos.filter(p => p.type === 'before').length === 0 && (
                      <p className="text-xs text-slate-400 italic col-span-2">No before photos recorded</p>
                    )}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-2">After Service</h4>
                  <div className="grid grid-cols-2 gap-2">
                    {jobPhotos.filter(p => p.type === 'after').map(p => (
                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer" className="block overflow-hidden rounded-xl border border-slate-200 hover:opacity-90 transition shadow-2xs">
                        <img src={p.url} alt="After Service" className="w-full h-28 object-cover" />
                      </a>
                    ))}
                    {jobPhotos.filter(p => p.type === 'after').length === 0 && (
                      <p className="text-xs text-slate-400 italic col-span-2">After photos will appear when detailing finishes</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Footer branding */}
          <div className="text-center text-xs text-slate-400 pb-6">
            <p>© {new Date().getFullYear()} O3 Car Spaa Studio • Real-Time Detailing Pipeline</p>
          </div>

        </div>
      </div>
    );
  }

  // ─── RENDER QUICK WASH TRACKING (FALLBACK) ───
  const currentIdx = PHASE_ORDER.indexOf(washData?.current_phase || 'pre_wash');
  const isDone = washData?.current_phase === 'complete' || washData?.wash_status === 'completed';

  return (
    <div className="min-h-screen bg-[#F8FAFC] py-10 px-4 sm:px-6 lg:px-8 flex items-center justify-center">
      <div className="max-w-xl w-full space-y-6">
        
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-black tracking-tight text-[#0F172A]">O3 CAR SPAA</h1>
          <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mt-1">Car Studio Management</p>
        </div>

        {/* Live Card */}
        <div className="bg-white rounded-3xl shadow-xl overflow-hidden border border-slate-100 card-premium">
          <div className="bg-gradient-to-br from-[#0F172A] to-[#2c2b2b] p-6 text-center text-white relative">
            <div className="absolute top-3 right-3 flex items-center gap-1.5 bg-blue-600/10 text-blue-400 border border-blue-500/20 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider animate-pulse">
              <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-ping" />
              Live Tracking
            </div>
            <div className="w-12 h-12 rounded-2xl bg-white/10 flex items-center justify-center mx-auto mb-3">
              <Car size={24} className="text-[#2563EB]" />
            </div>
            <h2 className="text-xl font-bold tracking-tight">Wash Booking #{washData?.id}</h2>
            {washData?.phase_updated_at && (
              <p className="text-xs text-slate-400 mt-1">
                Updated: {new Date(washData.phase_updated_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
              </p>
            )}
          </div>

          <div className="p-6 sm:p-8 space-y-8">
            <div className="bg-[#F8FAFC] rounded-2xl p-5 border border-slate-100 flex items-start gap-4">
              <div className="w-10 h-10 rounded-xl bg-blue-50 flex items-center justify-center text-[#2563EB] shrink-0 mt-0.5 animate-bounce">
                {isDone ? <CheckCircle2 size={20} /> : <Activity size={20} />}
              </div>
              <div>
                <p className="text-[10px] font-bold uppercase tracking-wider text-slate-400 mb-1">Current Status</p>
                <h4 className="font-extrabold text-lg text-[#0F172A]">
                  {isDone ? 'Your vehicle is ready! 🎉' : WASH_PHASE_LABELS[washData?.current_phase as keyof typeof WASH_PHASE_LABELS] || 'In Queue'}
                </h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  {PHASE_DETAILS[washData?.current_phase as keyof typeof PHASE_DETAILS] || 'Your vehicle is queued and will begin washing shortly.'}
                </p>
              </div>
            </div>

            {/* Stepper Timeline */}
            <div className="relative pl-8 space-y-8 before:absolute before:top-2 before:left-3 before:bottom-2 before:w-[2px] before:bg-slate-100">
              {PHASE_ORDER.map((phaseId, pIdx) => {
                const phaseDone = pIdx < currentIdx;
                const phaseCurrent = pIdx === currentIdx;
                const phaseLabel = WASH_PHASE_LABELS[phaseId as keyof typeof WASH_PHASE_LABELS];

                return (
                  <div key={phaseId} className="relative group/step">
                    <div className={`absolute top-0.5 -left-8 w-6.5 h-6.5 rounded-full flex items-center justify-center border-2 transition-all duration-300 z-10 ${
                      phaseDone ? 'bg-[#2563EB] border-[#2563EB] text-white shadow-sm' :
                      phaseCurrent ? 'bg-white border-[#2563EB] text-[#2563EB] ring-4 ring-blue-50 scale-110' :
                      'bg-white border-slate-200 text-slate-300'
                    }`}>
                      {phaseDone ? (
                        <CheckCircle2 size={12} className="stroke-[3]" />
                      ) : phaseCurrent ? (
                        <Droplets size={12} className="animate-pulse" />
                      ) : (
                        <span className="text-[9px] font-bold">{pIdx + 1}</span>
                      )}
                    </div>

                    <div>
                      <h4 className={`text-sm font-extrabold transition-colors duration-200 ${
                        phaseCurrent ? 'text-[#2563EB]' : phaseDone ? 'text-slate-700' : 'text-slate-300'
                      }`}>
                        {phaseLabel}
                      </h4>
                      {phaseCurrent && (
                        <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                          {PHASE_DETAILS[phaseId as keyof typeof PHASE_DETAILS]}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        <div className="text-center text-xs text-slate-400">
          <p>© {new Date().getFullYear()} O3 Car Spaa. All rights reserved.</p>
        </div>

      </div>
    </div>
  );
}
