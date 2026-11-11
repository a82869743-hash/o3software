import { useEffect, useState } from 'react';
import { Plug, CheckCircle2, XCircle, AlertTriangle, RefreshCw, Send } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { SERVER_ORIGIN } from '../../utils/endpoints';

type Status = {
  sandbox: boolean;
  whatsapp: { configured: boolean; provider: string; source: string; template: string; template_lang: string; webhook_path: string; warnings: string[] };
  email: { configured: boolean; paused?: boolean; host: string; port: number; from: string };
  otp: { configured: boolean; provider: string };
  ai: { configured: boolean; provider: string; model: string };
  ai_images?: { configured: boolean; model: string };
  leads_capture: { configured: boolean; webhook_path: string };
};

const TESTS: { type: 'whatsapp' | 'email' | 'otp' | 'ai'; label: string; placeholder: string }[] = [
  { type: 'whatsapp', label: 'WhatsApp', placeholder: '10-digit mobile' },
  { type: 'email', label: 'Email', placeholder: 'you@example.com' },
  { type: 'otp', label: 'OTP SMS', placeholder: '10-digit mobile' },
  { type: 'ai', label: 'AI auto-reply', placeholder: 'Ask a question (optional)' },
];

/** Super Admin — shows which API keys are connected and lets you send a test for each. */
export default function IntegrationsPanel() {
  const toast = useUIStore(s => s.toast);
  const [status, setStatus] = useState<Status | null>(null);
  const [loading, setLoading] = useState(false);
  const [inputs, setInputs] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [result, setResult] = useState<Record<string, string>>({});

  const load = async () => {
    setLoading(true);
    try { const r = await api.get('/integrations/status'); setStatus(r.data.data); }
    catch (e: any) { toast('error', e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const runTest = async (type: string) => {
    setBusy(type);
    try {
      const r = await api.post('/integrations/test', { type, to: inputs[type] || '' });
      const d = r.data;
      const msg = d.success
        ? (type === 'ai' ? `✅ ${d.data?.provider}: ${d.data?.reply}` : d.data?.mocked ? '⚠️ Test mode is on — nothing was really sent' : '✅ Sent')
        : `❌ ${d.error || 'Failed'}`;
      setResult(p => ({ ...p, [type]: msg }));
    } catch (e: any) {
      setResult(p => ({ ...p, [type]: `❌ ${e.message}` }));
    } finally { setBusy(null); }
  };

  const row = (label: string, ok: boolean | undefined, detail: string) => (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      {ok ? <CheckCircle2 size={18} className="text-emerald-600 mt-0.5 shrink-0" /> : <XCircle size={18} className="text-rose-500 mt-0.5 shrink-0" />}
      <div className="min-w-0">
        <p className="font-semibold text-sm text-gray-900">{label} <span className={`ml-1 text-[11px] font-bold ${ok ? 'text-emerald-600' : 'text-rose-500'}`}>{ok ? 'Working' : 'Not set up'}</span></p>
        <p className="text-xs text-gray-500 break-words">{detail}</p>
      </div>
    </div>
  );

  const origin = SERVER_ORIGIN || window.location.origin;
  return (
    <div className="bg-white p-6 rounded-xl border border-gray-200 shadow-sm mb-6">
      <div className="flex items-center justify-between gap-2 mb-4 border-b border-gray-100 pb-2">
        <div className="flex items-center gap-2">
          <Plug size={20} className="text-[#2563EB]" />
          <h2 className="font-bold text-lg text-gray-900">Connections (WhatsApp, Email, SMS, AI)</h2>
        </div>
        <button onClick={load} className="text-xs font-bold text-blue-600 flex items-center gap-1"><RefreshCw size={14} className={loading ? 'animate-spin' : ''} /> Refresh</button>
      </div>
      <p className="text-xs text-gray-500 mb-3">The secret keys are added on the server by your developer (in the server/.env file), never here. After they are added and the server is restarted, press Refresh. Green tick = working.</p>

      {status && (
        <>
          {status.sandbox && (
            <div className="mb-3 flex gap-2 p-3 rounded-lg bg-amber-50 text-amber-800 text-xs"><AlertTriangle size={16} className="shrink-0" /> Test mode is on — WhatsApp messages are NOT really being sent.</div>
          )}
          {row('WhatsApp messages', status.whatsapp.configured, `Sends job updates, invoices and replies. Template name: "${status.whatsapp.template}" · Link to give Meta: ${origin}${status.whatsapp.webhook_path}`)}
          {status.whatsapp.warnings.map(w => (
            <div key={w} className="flex gap-2 p-2 my-1 rounded-lg bg-amber-50 text-amber-800 text-xs"><AlertTriangle size={14} className="shrink-0 mt-0.5" /> {w}</div>
          ))}
          {row('Email', status.email.configured, status.email.paused ? 'Paused for now — no emails are sent' : `Sends from ${status.email.from}`)}
          {row('OTP SMS (login codes)', status.otp.configured, `SMS company: ${status.otp.provider === 'msg91' ? 'MSG91' : '2Factor'}`)}
          {row('AI auto-reply on WhatsApp', status.ai.configured, status.ai.configured ? `Using ${({ groq: 'Groq', claude: 'Claude', openai: 'OpenAI' } as Record<string, string>)[status.ai.provider] || status.ai.provider} (${status.ai.model}); the studio's own agent covers when it is down` : 'Using the studio’s own agent (answers from your services, prices, slots and FAQs). Add a Groq key for smarter replies.')}
          {status.ai_images && row('AI pictures for new services', status.ai_images.configured, status.ai_images.configured ? `Google Gemini (${status.ai_images.model}) — new services/packages get a picture automatically` : 'Not set up — pictures are picked from the built-in library by name')}
          {row('Leads from website & ads', status.leads_capture.configured, 'Details are on the Leads page → "Website & ads" button')}
        </>
      )}

      <div className="mt-5 grid gap-3">
        <p className="text-sm font-bold text-gray-900">Send a test message</p>
        {TESTS.map(t => (
          <div key={t.type} className="flex flex-col sm:flex-row sm:items-center gap-2">
            <span className="text-sm font-semibold text-gray-700 sm:w-36 shrink-0">{t.label}</span>
            <input value={inputs[t.type] || ''} onChange={e => setInputs(p => ({ ...p, [t.type]: e.target.value }))} placeholder={t.placeholder}
              className="flex-1 min-w-0 rounded-lg border border-gray-200 px-3 py-2 text-sm" />
            <button onClick={() => runTest(t.type)} disabled={busy === t.type}
              className="flex items-center justify-center gap-1.5 bg-[#2563EB] text-white text-sm font-bold rounded-lg px-4 py-2 disabled:opacity-60">
              <Send size={14} /> {busy === t.type ? 'Testing…' : 'Test'}
            </button>
            {result[t.type] && <span className="text-xs text-gray-600 sm:max-w-xs break-words">{result[t.type]}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
