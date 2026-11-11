import { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
  MessageSquare,
  Send,
  Users,
  CheckCircle2,
  XCircle,
  Search,
  Clock,
  RotateCw,
  FileText,
  Mail,
  ShieldCheck,
  AlertTriangle,
  ExternalLink,
  Smartphone,
  Layers,
  Sparkles,
  RefreshCw,
  Calendar,
  QrCode,
  Power,
  Wifi,
  WifiOff,
  KeyRound,
  Copy,
  Check,
  Shield,
  Fingerprint,
  Zap
} from 'lucide-react';
import io from 'socket.io-client';
import {
  useNotificationLogs,
  useNotificationStats,
  useResendNotification,
  useWarranties,
  useTestSendNotification,
  NotificationLog,
  WarrantyCertificate
} from '../../api/hooks/useNotifications';
import {
  useSendWhatsApp,
  useBaileysStatus,
  useBaileysConnect,
  useBaileysDisconnect,
  useBaileysSendTest,
  useBaileysRequestPairingCode,
  usePreviewHumanized,
  useWhatsAppProviderConfig,
  useUpdateWhatsAppProviderConfig,
  useBaileysWipeSession,
  useWhatsAppUsage,
  useWhatsAppOptOuts,
  useRemoveOptOut,
  useWhatsAppTemplates
} from '../../api/hooks/useWhatsApp';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import { PageTransition, AnimatedCard, RippleButton, AnimatedModal } from '../../components/ui/Animations';
import { toast } from 'react-hot-toast';
import { socketUrl } from '../../utils/endpoints';
import Dropdown from '../../components/ui/Dropdown';
import { copyText } from '../../utils/copyText';

export default function WhatsAppPage() {
  const [activeTab, setActiveTab] = useState<'queue' | 'warranties' | 'antispam' | 'providers' | 'optouts'>('queue');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [channelFilter, setChannelFilter] = useState('');
  const [showSendModal, setShowSendModal] = useState(false);
  const [showTestModal, setShowTestModal] = useState(false);
  const [showPairingModal, setShowPairingModal] = useState(false);
  const [showDirectTestModal, setShowDirectTestModal] = useState(false);
  const [directTestMobile, setDirectTestMobile] = useState('');
  const [directTestMessage, setDirectTestMessage] = useState('');
  const [liveAlert, setLiveAlert] = useState<any>(null);

  // Baileys Pairing Tab & Code State
  const [pairingTab, setPairingTab] = useState<'qr' | 'code'>('qr');
  const [pairingPhoneInput, setPairingPhoneInput] = useState('9316668760');
  const [generatedPairingCode, setGeneratedPairingCode] = useState<string | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);

  // Baileys Socket state
  const [liveQr, setLiveQr] = useState<string | null>(null);
  const [liveState, setLiveState] = useState<string | null>(null);
  const [livePhone, setLivePhone] = useState<string | null>(null);

  // Manual WhatsApp Form
  const [manualForm, setManualForm] = useState({ phone: '', message: '' });

  // Test Send Form
  const [testForm, setTestForm] = useState({
    channel: 'whatsapp',
    mobile: '',
    email: '',
    template_name: 'WARRANTY_CERTIFICATE',
    message_body: 'Test notification from O3 Car Spaa automation sandbox.'
  });

  // Queries & Mutations
  const { data: logsData, isLoading: logsLoading, refetch: refetchLogs } = useNotificationLogs({
    status: statusFilter || undefined,
    channel: channelFilter || undefined,
    search: search || undefined,
  });

  const { data: statsData, refetch: refetchStats } = useNotificationStats();
  const { data: warrantiesData, isLoading: warrantiesLoading } = useWarranties({
    search: search || undefined
  });

  const { data: baileysData, refetch: refetchBaileys } = useBaileysStatus();
  const connectBaileys = useBaileysConnect();
  const disconnectBaileys = useBaileysDisconnect();
  const directTestMutation = useBaileysSendTest();
  const pairingCodeMutation = useBaileysRequestPairingCode();

  const resendMutation = useResendNotification();
  const sendWhatsApp = useSendWhatsApp();
  const testSendMutation = useTestSendNotification();
  const previewHumanized = usePreviewHumanized();

  // Provider Governance Queries & Mutations
  const [showWipeModal, setShowWipeModal] = useState(false);
  const [providerForm, setProviderForm] = useState({
    provider: 'meta_cloud',
    phoneNumber: '',
    phoneNumberId: '',
    businessAccountId: '',
    accessToken: '',
    aisensyApiKey: '',
    demoWhitelist: ''
  });

  const { data: providerConfigData, refetch: refetchProviderConfig } = useWhatsAppProviderConfig();
  const updateProviderConfig = useUpdateWhatsAppProviderConfig();
  const wipeSessionMutation = useBaileysWipeSession();
  const { data: optOutsData, refetch: refetchOptOuts } = useWhatsAppOptOuts();
  const removeOptOutMutation = useRemoveOptOut();
  const { data: usageData } = useWhatsAppUsage();
  const { data: templatesData } = useWhatsAppTemplates();

  useEffect(() => {
    if (providerConfigData?.data) {
      const cfg = providerConfigData.data;
      setProviderForm(prev => ({
        ...prev,
        provider: cfg.provider || 'meta_cloud',
        phoneNumber: cfg.phone_number || '',
        phoneNumberId: cfg.phone_number_id || '',
        businessAccountId: cfg.business_account_id || '',
        demoWhitelist: cfg.demo_whitelist || ''
      }));
    }
  }, [providerConfigData]);

  // Anti-Spam & Dynamic Humanizer Generator state
  const [antiSpamTrigger, setAntiSpamTrigger] = useState('PIPELINE_STATUS_UPDATE');
  const [antiSpamCustName, setAntiSpamCustName] = useState('Harshil');
  const [antiSpamVehicle, setAntiSpamVehicle] = useState('GJ01AB1234');
  const [antiSpamCustomText, setAntiSpamCustomText] = useState('{Hi|Hello|Hey} {{customer_name}}, {your car is ready|detailing is finished} at O3 Car Spaa! {Cheers|Best regards}');
  const [antiSpamVariations, setAntiSpamVariations] = useState<any[]>([]);
  const [antiSpamSendMobile, setAntiSpamSendMobile] = useState('8238538098');
  const [sendingVariationIndex, setSendingVariationIndex] = useState<number | null>(null);

  const handleGenerateVariations = async () => {
    try {
      const res = await previewHumanized.mutateAsync({
        eventTrigger: antiSpamTrigger,
        variables: {
          customer_name: antiSpamCustName,
          vehicle_number: antiSpamVehicle,
          entity_type: 'Job Card',
          entity_id: 21,
          stage_name: 'Final Detail & Inspection',
          status_label: 'completed',
          amount: '14,800',
          invoice_number: 'INV-2026-0042',
          due_date: 'Tomorrow'
        },
        customText: antiSpamTrigger === 'CUSTOM_SPINTAX' ? antiSpamCustomText : undefined
      });
      if (res?.variations) {
        setAntiSpamVariations(res.variations);
        toast.success('Generated 3 unique anti-ban variations with distinct cryptographic hashes!');
      }
    } catch (err: any) {
      toast.error('Failed to generate variations');
    }
  };

  const handleSendVariationLive = async (text: string, idx: number) => {
    setSendingVariationIndex(idx);
    try {
      await sendWhatsApp.mutateAsync({
        phone: antiSpamSendMobile,
        message: text,
        customer_name: antiSpamCustName
      });
      toast.success(`Dispatched variation #${idx + 1} live to +91${antiSpamSendMobile}!`);
      refetchLogs();
      refetchStats();
    } catch (err: any) {
      toast.error('Failed to dispatch variation');
    } finally {
      setSendingVariationIndex(null);
    }
  };

  // Socket.io for Real-time Failure Alerts & WhatsApp Engine events
  useEffect(() => {
    const wsUrl = socketUrl();
    const socket = io(wsUrl, { transports: ['websocket', 'polling'] });

    socket.on('notification_failed', (data: any) => {
      console.warn('[Socket.io] Real-time notification failure alert:', data);
      setLiveAlert(data);
      toast.error(`Notification failed: ${data.channel?.toUpperCase()} to ${data.recipient} (${data.error})`, {
        duration: 8000,
        icon: '⚠️'
      });
      refetchLogs();
      refetchStats();
    });

    socket.on('whatsapp:qr', (data: any) => {
      console.log('[Socket.io] WhatsApp QR received:', data);
      if (data?.qr) setLiveQr(data.qr);
      setLiveState('qr');
      refetchBaileys();
    });

    socket.on('whatsapp:pairing_code', (data: any) => {
      console.log('[Socket.io] WhatsApp pairing code received:', data);
      if (data?.code) setGeneratedPairingCode(data.code);
    });

    socket.on('whatsapp:status', (data: any) => {
      console.log('[Socket.io] WhatsApp status update:', data);
      setLiveState(data.status);
      if (data.phone) setLivePhone(data.phone);
      if (data.status === 'open') {
        setLiveQr(null);
        setShowPairingModal(false);
        toast.success(`WhatsApp connected (+${data.phone || ''})!`);
      }
      refetchBaileys();
    });

    return () => {
      socket.disconnect();
    };
  }, [refetchLogs, refetchStats, refetchBaileys]);

  const currentStatus = liveState || baileysData?.data?.state || 'disconnected';
  const isConnected = currentStatus === 'open';
  const currentPhone = livePhone || baileysData?.data?.phone;
  const currentQr = liveQr || baileysData?.data?.qr;

  const stats = statsData?.data || {
    total: 0,
    sent_count: 0,
    queued_count: 0,
    failed_count: 0,
    processing_count: 0,
    whatsapp_count: 0,
    email_count: 0
  };

  const handleManualSend = () => {
    if (!manualForm.phone || !manualForm.message) {
      toast.error('Please enter mobile number and message');
      return;
    }
    sendWhatsApp.mutate(
      { phone: manualForm.phone, message: manualForm.message },
      {
        onSuccess: () => {
          setShowSendModal(false);
          setManualForm({ phone: '', message: '' });
          refetchLogs();
        }
      }
    );
  };

  const handleTestSend = () => {
    testSendMutation.mutate(testForm, {
      onSuccess: () => {
        setShowTestModal(false);
        refetchLogs();
        refetchStats();
      }
    });
  };

  const handleDirectTest = () => {
    if (!directTestMobile) {
      toast.error('Please enter recipient mobile number');
      return;
    }
    directTestMutation.mutate(
      { mobile: directTestMobile, message: directTestMessage || undefined },
      {
        onSuccess: () => {
          setShowDirectTestModal(false);
          setDirectTestMobile('');
          setDirectTestMessage('');
          refetchLogs();
          refetchStats();
        }
      }
    );
  };

  const handleResend = (id: number) => {
    resendMutation.mutate(id, {
      onSuccess: () => {
        if (liveAlert?.notificationId === id) {
          setLiveAlert(null);
        }
      }
    });
  };

  const logs: NotificationLog[] = logsData?.data || [];
  const warranties: WarrantyCertificate[] = warrantiesData?.data || [];

  return (
    <PageTransition className="p-4 sm:p-6 max-w-7xl mx-auto space-y-6">
      {/* Page Header */}
      <PremiumPageHeader
        title="Automation & Notifications"
        subtitle="Non-blocking background queue, multi-channel dispatches (WhatsApp & Gmail), automated retries & warranty certificates"
        icon={MessageSquare}
        iconColor="#25D366"
        accentGradient="from-emerald-600 via-teal-600 to-green-500"
        badge="PHASE 5 AUTOMATION"
        actions={
          <div className="flex items-center gap-2">
            <RippleButton
              onClick={() => setShowTestModal(true)}
              variant="ghost"
              className="border border-gray-200 text-gray-700 hover:bg-gray-50 flex items-center gap-1.5"
            >
              <Sparkles size={14} className="text-amber-500" />
              <span>Sandbox Test</span>
            </RippleButton>
            <RippleButton
              onClick={() => setShowSendModal(true)}
              variant="primary"
              className="bg-[#25D366] hover:bg-[#1ebd5a] text-white flex items-center gap-1.5 shadow-sm shadow-green-500/20"
            >
              <Send size={14} />
              <span>Manual Message</span>
            </RippleButton>
          </div>
        }
      />

      {/* Real-time Failure Alert Banner */}
      <AnimatePresence>
        {liveAlert && (
          <motion.div
            initial={{ opacity: 0, y: -12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -12 }}
            className="bg-rose-50 border border-rose-200 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-sm"
          >
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-500/10 text-rose-600 flex items-center justify-center shrink-0 mt-0.5">
                <AlertTriangle size={20} />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider px-2 py-0.5 bg-rose-200/60 text-rose-800 rounded-md">
                    Notification Failed
                  </span>
                  <span className="text-xs text-rose-600 font-mono">#{liveAlert.notificationId}</span>
                </div>
                <p className="text-sm font-medium text-rose-900 mt-1">
                  {liveAlert.channel?.toUpperCase()} dispatch to <span className="font-mono">{liveAlert.recipient}</span> failed: {liveAlert.error}
                </p>
                <p className="text-xs text-rose-600 mt-0.5">
                  Attempt {liveAlert.attempts}/{liveAlert.maxRetries || 3} — Backoff retry scheduled automatically.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-end sm:self-center shrink-0">
              <button
                onClick={() => handleResend(liveAlert.notificationId)}
                disabled={resendMutation.isPending}
                className="px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-semibold rounded-xl flex items-center gap-1.5 shadow-sm transition"
              >
                <RotateCw size={13} className={resendMutation.isPending ? 'animate-spin' : ''} />
                <span>Resend Now</span>
              </button>
              <button
                onClick={() => setLiveAlert(null)}
                className="px-3 py-1.5 text-xs text-rose-700 hover:bg-rose-100 rounded-xl transition font-medium"
              >
                Dismiss
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* DEMO MODE SAFEGUARD WARNING BANNER */}
      {providerConfigData?.data?.isDemoActive && (
        <AnimatedCard className="bg-amber-950/40 border-2 border-amber-500/60 rounded-3xl p-5 mb-5 shadow-lg relative overflow-hidden text-amber-200">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center shrink-0">
                <AlertTriangle size={24} className="text-amber-400 animate-pulse" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-black text-amber-300 tracking-tight uppercase">
                    ⚠️ DEMO MODE ACTIVE (Unofficial Baileys Engine)
                  </span>
                  <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                    Restricted Demo
                  </span>
                </div>
                <p className="text-xs text-amber-200/80 mt-1 max-w-2xl leading-relaxed">
                  Baileys is active strictly for a one-time client demonstration. Sending is gated to whitelisted numbers only. Bulk campaigns are blocked. Transition to Meta Cloud API prior to production launch.
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2 self-stretch md:self-center justify-end shrink-0">
              <button
                onClick={() => setActiveTab('providers')}
                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 text-xs font-bold rounded-xl transition cursor-pointer"
              >
                Switch Provider
              </button>
              <button
                onClick={() => setShowWipeModal(true)}
                className="px-3.5 py-2 bg-rose-600/30 hover:bg-rose-600/50 text-rose-300 border border-rose-500/40 text-xs font-bold rounded-xl transition cursor-pointer flex items-center gap-1.5"
              >
                <Power size={13} />
                <span>Disconnect & Wipe</span>
              </button>
            </div>
          </div>
        </AnimatedCard>
      )}

      {/* WhatsApp Multi-Device Engine Connection Banner */}
      <AnimatedCard className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white rounded-3xl p-5 border border-slate-700/60 shadow-lg relative overflow-hidden">
        <div className="absolute right-0 top-0 w-80 h-full bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-emerald-500/15 via-transparent to-transparent pointer-events-none" />
        
        <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4 relative z-10">
          <div className="flex items-center gap-4">
            <div className={`w-14 h-14 rounded-2xl flex items-center justify-center shrink-0 shadow-md ${
              isConnected
                ? 'bg-emerald-500/20 text-emerald-400 border border-emerald-500/30'
                : currentStatus === 'qr'
                ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30 animate-pulse'
                : 'bg-slate-700/50 text-slate-400 border border-slate-600/50'
            }`}>
              {isConnected ? <Smartphone size={28} className="text-emerald-400" /> : currentStatus === 'qr' ? <QrCode size={28} className="text-amber-400" /> : <WifiOff size={28} />}
            </div>

            <div>
              <div className="flex items-center gap-2.5 flex-wrap">
                <span className="text-base font-black tracking-tight text-white">WhatsApp Multi-Device Engine</span>
                <span className={`text-xs font-bold px-2.5 py-0.5 rounded-full flex items-center gap-1.5 ${
                  isConnected
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/30'
                    : currentStatus === 'qr'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-500/30 animate-pulse'
                    : currentStatus === 'connecting'
                    ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                    : 'bg-slate-700 text-slate-300'
                }`}>
                  <span className={`w-2 h-2 rounded-full ${
                    isConnected ? 'bg-emerald-400' : currentStatus === 'qr' ? 'bg-amber-400' : 'bg-slate-400'
                  }`} />
                  {isConnected ? `ACTIVE (+${currentPhone || 'Connected'})` : currentStatus === 'qr' ? 'AWAITING QR SCAN' : currentStatus === 'connecting' ? 'CONNECTING...' : 'DISCONNECTED'}
                </span>
                <span className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider bg-slate-800/80 px-2 py-0.5 rounded-md border border-slate-700">
                  100% Free · Anti-Ban Enabled
                </span>
              </div>

              <p className="text-xs text-slate-300 mt-1 max-w-2xl leading-relaxed">
                {isConnected ? (
                  <>Delivering transactional alerts, PDF warranty certificates, soft-copy tax invoices, and booking reminders directly from <strong className="text-white">+{currentPhone}</strong> with zero manual intervention.</>
                ) : currentStatus === 'qr' ? (
                  <>Point your studio phone's WhatsApp camera at the QR code to pair in seconds. Session persists permanently across restarts.</>
                ) : (
                  <>Engine currently disconnected. Click <strong className="text-white">"Connect & Generate QR"</strong> to pair your studio WhatsApp number.</>
                )}
              </p>
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex items-center gap-2 self-stretch md:self-center justify-end shrink-0 flex-wrap">
            {isConnected ? (
              <>
                <button
                  onClick={() => setShowDirectTestModal(true)}
                  className="px-3.5 py-2 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 border border-emerald-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer"
                >
                  <Sparkles size={14} /> Send Direct Test
                </button>
                <button
                  onClick={() => {
                    if (confirm('Unlink the studio WhatsApp?\n\nCustomers will get no replies, booking messages or login codes until you scan a new QR.')) disconnectBaileys.mutate();
                  }}
                  disabled={disconnectBaileys.isPending}
                  className="px-3.5 py-2 bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-bold rounded-xl flex items-center gap-1.5 transition cursor-pointer disabled:opacity-50"
                >
                  <Power size={14} /> Disconnect
                </button>
              </>
            ) : (
              <>
                <button
                  onClick={() => {
                    connectBaileys.mutate();
                    setShowPairingModal(true);
                  }}
                  disabled={connectBaileys.isPending}
                  className="px-4 py-2 bg-emerald-500 hover:bg-emerald-600 text-slate-950 text-xs font-extrabold rounded-xl flex items-center gap-1.5 transition cursor-pointer shadow-md shadow-emerald-500/20"
                >
                  <QrCode size={15} />
                  <span>{currentStatus === 'qr' ? 'View QR Code' : 'Connect & Generate QR'}</span>
                </button>
              </>
            )}
          </div>
        </div>
      </AnimatedCard>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Total Dispatched"
          value={stats.total || 0}
          icon={Layers}
          color="#0F172A"
          gradient="from-slate-800/10 to-slate-700/5"
        />
        <PremiumStatCard
          title="Delivered / Sent"
          value={stats.sent_count || 0}
          icon={CheckCircle2}
          color="#10B981"
          gradient="from-emerald-500/10 to-emerald-400/5"
          delay={0.1}
        />
        <PremiumStatCard
          title="In Queue / Retrying"
          value={(Number(stats.queued_count) || 0) + (Number(stats.processing_count) || 0)}
          icon={Clock}
          color="#F59E0B"
          gradient="from-amber-500/10 to-amber-400/5"
          delay={0.2}
        />
        <PremiumStatCard
          title="Failed / Critical"
          value={stats.failed_count || 0}
          icon={XCircle}
          color="#EF4444"
          gradient="from-rose-500/10 to-rose-400/5"
          delay={0.3}
        />
      </div>

      {/* Tab Navigation */}
      <div className="flex items-center gap-2 border-b border-gray-200 pb-2 overflow-x-auto no-scrollbar [&>button]:shrink-0 [&>button]:whitespace-nowrap">
        <button
          onClick={() => setActiveTab('queue')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'queue'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Layers size={16} />
          <span>Queue & Send Logs</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'queue' ? 'bg-slate-700 text-gray-200' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {logs.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('warranties')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'warranties'
              ? 'bg-slate-900 text-white shadow-sm'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <ShieldCheck size={16} className="text-amber-400" />
          <span>Warranty Certificates</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'warranties' ? 'bg-slate-700 text-gray-200' : 'bg-gray-200 text-gray-700'
            }`}
          >
            {warranties.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('antispam')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'antispam'
              ? 'bg-emerald-600 text-white shadow-sm shadow-emerald-500/20'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Shield size={16} className={activeTab === 'antispam' ? 'text-white' : 'text-emerald-500'} />
          <span>Anti-Spam & Humanizer</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              activeTab === 'antispam' ? 'bg-emerald-500 text-white' : 'bg-emerald-100 text-emerald-700'
            }`}
          >
            0% Bot Risk
          </span>
        </button>

        <button
          onClick={() => setActiveTab('providers')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'providers'
              ? 'bg-indigo-600 text-white shadow-sm shadow-indigo-500/20'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <Zap size={16} className={activeTab === 'providers' ? 'text-white' : 'text-indigo-500'} />
          <span>Provider & Cutover</span>
          <span
            className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider ${
              activeTab === 'providers' ? 'bg-indigo-500 text-white' : 'bg-indigo-100 text-indigo-700'
            }`}
          >
            {providerConfigData?.data?.provider || 'meta_cloud'}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('optouts')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-semibold text-sm transition-all ${
            activeTab === 'optouts'
              ? 'bg-rose-600 text-white shadow-sm shadow-rose-500/20'
              : 'text-gray-600 hover:bg-gray-100 hover:text-gray-900'
          }`}
        >
          <XCircle size={16} className={activeTab === 'optouts' ? 'text-white' : 'text-rose-500'} />
          <span>Opt-Outs (STOP)</span>
          <span
            className={`text-xs px-2 py-0.5 rounded-full ${
              activeTab === 'optouts' ? 'bg-rose-500 text-white' : 'bg-rose-100 text-rose-700'
            }`}
          >
            {optOutsData?.data?.length || 0}
          </span>
        </button>
      </div>

      {/* TAB 1: Queue & Send Logs */}
      {activeTab === 'queue' && (
        <div className="space-y-4">
          {/* Filters Bar */}
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 p-4 flex flex-wrap items-center gap-3">
            <div className="relative flex-1 min-w-[220px]">
              <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by phone, email, template, or idempotency key..."
                className="w-full pl-9 pr-4 py-2 text-sm border border-gray-200 rounded-xl focus:ring-2 focus:ring-slate-900/20 focus:border-slate-900"
              />
            </div>

            <Dropdown
              value={channelFilter}
              onChange={(e) => setChannelFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-slate-900/20"
            >
              <option value="">All Channels</option>
              <option value="whatsapp">WhatsApp</option>
              <option value="email">Gmail / Email</option>
            </Dropdown>

            <Dropdown
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-sm border border-gray-200 rounded-xl px-3 py-2 focus:ring-2 focus:ring-slate-900/20"
            >
              <option value="">All Statuses</option>
              <option value="sent">Sent</option>
              <option value="queued">Queued</option>
              <option value="processing">Processing</option>
              <option value="failed">Failed</option>
            </Dropdown>

            <button
              onClick={() => {
                refetchLogs();
                refetchStats();
              }}
              className="p-2 border border-gray-200 rounded-xl hover:bg-gray-50 text-gray-600 transition"
              title="Refresh queue"
            >
              <RefreshCw size={16} className={logsLoading ? 'animate-spin' : ''} />
            </button>
          </AnimatedCard>

          {/* Send Logs Table */}
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50/80 border-b border-gray-100">
                    <th className="text-left py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Channel & Recipient
                    </th>
                    <th className="text-left py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Template & Content
                    </th>
                    <th className="text-left py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Attachment
                    </th>
                    <th className="text-center py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Status
                    </th>
                    <th className="text-center py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Attempts / Retry
                    </th>
                    <th className="text-right py-3.5 px-4 text-xs font-bold text-gray-500 uppercase tracking-wider">
                      Actions
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {logsLoading ? (
                    [...Array(6)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="py-4 px-4">
                          <div className="h-5 bg-gray-100 rounded-lg animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : logs.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-16">
                        <MessageSquare size={36} className="mx-auto text-gray-300 mb-3" />
                        <p className="text-gray-600 font-medium">No notifications in queue</p>
                        <p className="text-gray-400 text-xs mt-1">
                          Automated events (Warranties, Bills, Bookings) will appear here.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    logs.map((log: NotificationLog, idx: number) => {
                      const isWa = log.channel === 'whatsapp';
                      const isEmail = log.channel === 'email';

                      return (
                        <motion.tr
                          key={log.id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          transition={{ delay: idx * 0.02 }}
                          className="hover:bg-slate-50/60 transition-colors"
                        >
                          {/* Channel & Recipient */}
                          <td className="py-3.5 px-4">
                            <div className="flex items-center gap-2.5">
                              <div
                                className={`w-8 h-8 rounded-xl flex items-center justify-center shrink-0 ${
                                  isWa
                                    ? 'bg-emerald-100 text-emerald-600'
                                    : isEmail
                                    ? 'bg-blue-100 text-blue-600'
                                    : 'bg-purple-100 text-purple-600'
                                }`}
                              >
                                {isWa ? <MessageSquare size={16} /> : isEmail ? <Mail size={16} /> : <Smartphone size={16} />}
                              </div>
                              <div>
                                <div className="font-semibold text-slate-800 text-xs flex items-center gap-1.5">
                                  <span>{log.customer_name || 'Direct Recipient'}</span>
                                  {log.idempotency_key && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.2 bg-gray-100 text-gray-500 rounded font-mono truncate max-w-[110px]"
                                      title={log.idempotency_key}
                                    >
                                      {log.idempotency_key}
                                    </span>
                                  )}
                                </div>
                                <div className="text-[11px] text-gray-500 font-mono mt-0.5">
                                  {log.mobile || log.email || 'N/A'}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* Template & Content Preview */}
                          <td className="py-3.5 px-4 max-w-[280px]">
                            <div className="text-xs font-semibold text-slate-700 truncate" title={log.template_name}>
                              {log.template_name}
                            </div>
                            <div
                              className="text-[11px] text-gray-500 truncate mt-0.5"
                              title={log.message_body}
                            >
                              {log.message_body}
                            </div>
                          </td>

                          {/* Attachment Link */}
                          <td className="py-3.5 px-4">
                            {log.attachment_url ? (
                              <a
                                href={log.attachment_url}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-600 hover:text-blue-800 bg-blue-50 px-2 py-1 rounded-lg border border-blue-200/60 transition"
                              >
                                <FileText size={12} />
                                <span>PDF Doc</span>
                                <ExternalLink size={10} />
                              </a>
                            ) : (
                              <span className="text-xs text-gray-300">—</span>
                            )}
                          </td>

                          {/* Status Pill */}
                          <td className="py-3.5 px-4 text-center">
                            {log.status === 'sent' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-full">
                                <CheckCircle2 size={12} />
                                <span>Sent</span>
                              </span>
                            )}
                            {log.status === 'queued' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-amber-700 bg-amber-50 border border-amber-200 px-2.5 py-1 rounded-full animate-pulse">
                                <Clock size={12} />
                                <span>Queued</span>
                              </span>
                            )}
                            {log.status === 'processing' && (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700 bg-blue-50 border border-blue-200 px-2.5 py-1 rounded-full">
                                <RotateCw size={12} className="animate-spin" />
                                <span>Processing</span>
                              </span>
                            )}
                            {log.status === 'failed' && (
                              <span
                                className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 border border-rose-200 px-2.5 py-1 rounded-full"
                                title={log.error_message || 'Dispatch failed'}
                              >
                                <XCircle size={12} />
                                <span>Failed</span>
                              </span>
                            )}
                          </td>

                          {/* Attempts & Retry Info */}
                          <td className="py-3.5 px-4 text-center">
                            <div className="text-xs font-mono font-medium text-slate-700">
                              {log.attempts} / {log.max_retries || 3}
                            </div>
                            {log.status === 'failed' && log.next_retry_at && (
                              <div className="text-[10px] text-amber-600 mt-0.5">
                                Retry: {new Date(log.next_retry_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                              </div>
                            )}
                            {log.error_message && (
                              <div
                                className="text-[10px] text-rose-500 truncate max-w-[130px] mx-auto mt-0.5"
                                title={log.error_message}
                              >
                                {log.error_message}
                              </div>
                            )}
                          </td>

                          {/* Actions: Manual Resend Button */}
                          <td className="py-3.5 px-4 text-right">
                            <button
                              onClick={() => handleResend(log.id)}
                              disabled={resendMutation.isPending}
                              className="px-2.5 py-1.5 text-xs font-semibold rounded-lg bg-gray-100 hover:bg-slate-900 hover:text-white text-gray-700 transition flex items-center gap-1 ml-auto"
                              title="Requeue for immediate dispatch"
                            >
                              <RotateCw size={12} className={resendMutation.isPending ? 'animate-spin' : ''} />
                              <span>Resend</span>
                            </button>
                          </td>
                        </motion.tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* TAB 2: Warranty Certificates */}
      {activeTab === 'warranties' && (
        <div className="space-y-4">
          <AnimatedCard className="bg-white rounded-2xl border border-gray-100 overflow-hidden shadow-xs">
            <div className="p-4 border-b border-gray-100 bg-gray-50/50 flex items-center justify-between">
              <div>
                <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                  <ShieldCheck size={18} className="text-amber-500" />
                  <span>Issued Warranty Certificates</span>
                </h3>
                <p className="text-xs text-gray-500 mt-0.5">
                  Automated warranty generation for completed Paint Protection Film (PPF) & Ceramic Coating job cards
                </p>
              </div>
              <div className="text-xs font-mono text-gray-600 bg-white px-3 py-1.5 rounded-xl border border-gray-200">
                Total Issued: <span className="font-bold text-slate-900">{warranties.length}</span>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-gray-50 border-b border-gray-100">
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Certificate No</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Customer</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Vehicle</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Service & Coverage</th>
                    <th className="text-left py-3 px-4 text-xs font-bold text-gray-500 uppercase">Validity Dates</th>
                    <th className="text-right py-3 px-4 text-xs font-bold text-gray-500 uppercase">Document</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {warrantiesLoading ? (
                    [...Array(4)].map((_, i) => (
                      <tr key={i}>
                        <td colSpan={6} className="py-4 px-4">
                          <div className="h-5 bg-gray-100 rounded-lg animate-pulse" />
                        </td>
                      </tr>
                    ))
                  ) : warranties.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="text-center py-14">
                        <ShieldCheck size={36} className="mx-auto text-gray-300 mb-2" />
                        <p className="text-gray-600 font-medium">No warranty certificates issued yet</p>
                        <p className="text-gray-400 text-xs mt-1">
                          When a job card containing PPF or Ceramic Coating is marked completed, a warranty certificate is automatically generated and sent.
                        </p>
                      </td>
                    </tr>
                  ) : (
                    warranties.map((w: WarrantyCertificate) => (
                      <tr key={w.id} className="hover:bg-amber-50/20 transition-colors">
                        <td className="py-3.5 px-4 font-mono font-bold text-slate-800 text-xs">
                          <div className="flex items-center gap-1.5">
                            <span className="w-2 h-2 rounded-full bg-amber-500" />
                            <span>{w.certificate_no}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-sans block mt-0.5">
                            Job Card #{w.job_card_id}
                          </span>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800 text-xs">{w.customer_name || 'Customer'}</div>
                          <div className="text-[11px] text-gray-500 font-mono mt-0.5">{w.customer_mobile || w.customer_email || '—'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-semibold text-slate-800 text-xs font-mono">{w.vehicle_reg_no || 'N/A'}</div>
                          <div className="text-[11px] text-gray-500 mt-0.5">{w.vehicle_model || '—'}</div>
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="font-medium text-slate-800 text-xs">{w.service_type}</div>
                          <span className="inline-block mt-0.5 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-semibold text-[10px]">
                            {w.warranty_years} Years Warranty
                          </span>
                        </td>
                        <td className="py-3.5 px-4 text-xs text-gray-600">
                          <div className="flex items-center gap-1 text-[11px]">
                            <Calendar size={12} className="text-gray-400" />
                            <span>Issue: {new Date(w.issue_date).toLocaleDateString('en-IN')}</span>
                          </div>
                          <div className="text-[11px] text-gray-500 mt-0.5">
                            Expires: {new Date(w.expiry_date).toLocaleDateString('en-IN')}
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          {w.pdf_url ? (
                            <a
                              href={w.pdf_url}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center gap-1.5 text-xs font-semibold px-3 py-1.5 rounded-xl bg-slate-900 text-white hover:bg-slate-800 transition"
                            >
                              <FileText size={13} className="text-amber-400" />
                              <span>View PDF</span>
                            </a>
                          ) : (
                            <span className="text-xs text-gray-400">PDF Pending</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* TAB 3: Anti-Spam & Dynamic Humanizer Engine */}
      {activeTab === 'antispam' && (
        <div className="space-y-6">
          {/* Top Banner: Engine Status */}
          <AnimatedCard className="bg-gradient-to-r from-emerald-950 via-slate-900 to-teal-950 text-white rounded-3xl p-6 sm:p-8 shadow-xl border border-emerald-500/20 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none" />
            <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
              <div>
                <div className="flex items-center gap-2 mb-3">
                  <span className="flex h-3 w-3 relative">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-emerald-500" />
                  </span>
                  <span className="text-xs font-bold uppercase tracking-widest text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-3 py-1 rounded-full">
                    Active Anti-Spam Shielding • 0% Bot Risk
                  </span>
                </div>
                <h2 className="text-2xl sm:text-3xl font-extrabold tracking-tight">
                  Dynamic WhatsApp Humanization & Anti-Ban Engine
                </h2>
                <p className="text-sm text-gray-300 mt-2 max-w-2xl leading-relaxed">
                  WhatsApp strictly monitors identical repeated message templates and unhuman burst speeds.
                  Our anti-ban engine automatically randomizes natural sentence phrasing, time-aware greetings,
                  simulates real keyboard typing presence, and cryptographically salts every payload so no two messages share the same hash.
                </p>
              </div>

              <div className="bg-slate-800/80 backdrop-blur-md rounded-2xl p-4 border border-emerald-500/20 min-w-[240px]">
                <div className="text-xs text-gray-400 uppercase font-semibold">Active Engine Phone</div>
                <div className="text-lg font-mono font-bold text-emerald-400 mt-1 flex items-center gap-2">
                  <Smartphone size={18} />
                  <span>+{livePhone || '919316668760'}</span>
                </div>
                <div className="text-xs text-gray-300 mt-2 flex items-center gap-1.5">
                  <Shield size={14} className="text-emerald-400" />
                  <span>Companion Session Protected</span>
                </div>
              </div>
            </div>

            {/* 4 Pillars of Protection Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-8 pt-6 border-t border-slate-700/60">
              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-emerald-400 text-xs font-bold mb-1">
                  <Sparkles size={14} />
                  <span>Dynamic Spintax</span>
                </div>
                <p className="text-xs text-gray-300">
                  Rotates greetings like {'{Hi|Hello|Hey}'} and sentence variations so each chat looks unique.
                </p>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-teal-400 text-xs font-bold mb-1">
                  <Clock size={14} />
                  <span>Time-Aware Greetings</span>
                </div>
                <p className="text-xs text-gray-300">
                  Automatically delivers Good morning, afternoon, or evening based on real IST clock time.
                </p>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-cyan-400 text-xs font-bold mb-1">
                  <Fingerprint size={14} />
                  <span>Zero-Width Salting</span>
                </div>
                <p className="text-xs text-gray-300">
                  Injects invisible characters ensuring 100% unique SHA-256 binary hash on every send.
                </p>
              </div>

              <div className="bg-slate-900/60 rounded-xl p-4 border border-slate-700/50">
                <div className="flex items-center gap-2 text-amber-400 text-xs font-bold mb-1">
                  <Zap size={14} />
                  <span>Typing Simulation</span>
                </div>
                <p className="text-xs text-gray-300">
                  Simulates realistic 2.5s–5.5s composing presence and paced intervals between dispatches.
                </p>
              </div>
            </div>
          </AnimatedCard>

          {/* Interactive Playground & Variation Generator */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            {/* Control Panel */}
            <AnimatedCard className="bg-white rounded-3xl border border-gray-100 p-6 shadow-sm">
              <h3 className="text-lg font-bold text-slate-900 mb-1 flex items-center gap-2">
                <Sparkles size={18} className="text-emerald-500" />
                <span>Variation Generator</span>
              </h3>
              <p className="text-xs text-gray-500 mb-6">
                Preview how the engine rewrites templates into distinct natural phrasing before dispatch.
              </p>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                    Event Trigger / Notification Type
                  </label>
                  <Dropdown
                    value={antiSpamTrigger}
                    onChange={(e) => setAntiSpamTrigger(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                  >
                    <option value="PIPELINE_STATUS_UPDATE">Job Card Stage Transition</option>
                    <option value="SERVICE_STARTED">Service Started on Bay</option>
                    <option value="SERVICE_COMPLETED">Service Completed & Polished</option>
                    <option value="DELIVERY_READY">Vehicle Ready for Pickup</option>
                    <option value="PAYMENT_REMINDER">Pending Payment Reminder</option>
                    <option value="INVOICE_GENERATED">Tax Invoice Soft Copy</option>
                    <option value="WARRANTY_CERTIFICATE">Warranty Certificate Issued</option>
                    <option value="CUSTOM_SPINTAX">Custom Spintax Formula</option>
                  </Dropdown>
                </div>

                {antiSpamTrigger === 'CUSTOM_SPINTAX' ? (
                  <div>
                    <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                      Custom Spintax Template
                    </label>
                    <textarea
                      value={antiSpamCustomText}
                      onChange={(e) => setAntiSpamCustomText(e.target.value)}
                      rows={3}
                      className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-mono focus:ring-2 focus:ring-emerald-500/20"
                      placeholder="{Hi|Hello|Hey} {{customer_name}}, {option1|option2}"
                    />
                    <div className="flex flex-wrap gap-1 mt-1.5">
                      <button
                        type="button"
                        onClick={() => setAntiSpamCustomText((t) => t + ' {Hi|Hello|Hey}')}
                        className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono"
                      >
                        +{'{Hi|Hello|Hey}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAntiSpamCustomText((t) => t + ' {ready|finished|done}')}
                        className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono"
                      >
                        +{'{ready|finished|done}'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setAntiSpamCustomText((t) => t + ' {Best regards|Warm regards}')}
                        className="text-[10px] bg-gray-100 hover:bg-gray-200 text-gray-700 px-2 py-0.5 rounded font-mono"
                      >
                        +{'{Best regards|Warm regards}'}
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                        Customer Name
                      </label>
                      <input
                        value={antiSpamCustName}
                        onChange={(e) => setAntiSpamCustName(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="e.g. Harshil"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                        Vehicle Number
                      </label>
                      <input
                        value={antiSpamVehicle}
                        onChange={(e) => setAntiSpamVehicle(e.target.value)}
                        className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                        placeholder="e.g. GJ01AB1234"
                      />
                    </div>
                  </>
                )}

                <div>
                  <label className="text-xs font-semibold text-gray-600 uppercase mb-1 block">
                    Target Customer Mobile (for Live Send)
                  </label>
                  <input
                    value={antiSpamSendMobile}
                    onChange={(e) => setAntiSpamSendMobile(e.target.value)}
                    className="w-full border border-gray-200 rounded-xl px-3.5 py-2.5 text-xs font-medium font-mono focus:ring-2 focus:ring-emerald-500/20"
                    placeholder="e.g. 8238538098"
                  />
                </div>

                <RippleButton
                  onClick={handleGenerateVariations}
                  disabled={previewHumanized.isPending}
                  className="w-full py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs flex items-center justify-center gap-2 shadow-sm shadow-emerald-600/30"
                >
                  <Sparkles size={14} />
                  <span>{previewHumanized.isPending ? 'Generating Variations...' : 'Generate 3 Dynamic Variations'}</span>
                </RippleButton>
              </div>
            </AnimatedCard>

            {/* Generated Variations View */}
            <div className="lg:col-span-2 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
                    <Fingerprint size={16} className="text-emerald-500" />
                    <span>Dynamic Variations & Cryptographic Fingerprints</span>
                  </h3>
                  <p className="text-xs text-gray-500 mt-0.5">
                    Notice how each message uses completely distinct greetings, word structures, and SHA-256 hashes.
                  </p>
                </div>
                {antiSpamVariations.length > 0 && (
                  <button
                    onClick={handleGenerateVariations}
                    className="text-xs text-emerald-600 hover:text-emerald-700 font-semibold flex items-center gap-1"
                  >
                    <RefreshCw size={12} />
                    <span>Re-Roll</span>
                  </button>
                )}
              </div>

              {antiSpamVariations.length === 0 ? (
                <div className="bg-white rounded-3xl border border-dashed border-gray-200 p-12 text-center">
                  <div className="w-14 h-14 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center mx-auto mb-3 shadow-inner">
                    <Sparkles size={24} />
                  </div>
                  <h4 className="text-base font-bold text-slate-800">No Variations Generated Yet</h4>
                  <p className="text-xs text-gray-500 mt-1 max-w-md mx-auto">
                    Click <strong>Generate 3 Dynamic Variations</strong> above to test our natural language spintax and see real-time SHA-256 cryptographic hash differences.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  {antiSpamVariations.map((v, idx) => (
                    <AnimatedCard
                      key={v.id || idx}
                      className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-shadow relative overflow-hidden"
                    >
                      <div className="flex items-center justify-between mb-3 border-b border-gray-100 pb-2.5">
                        <div className="flex items-center gap-2">
                          <span className="w-6 h-6 rounded-full bg-emerald-100 text-emerald-800 font-bold text-xs flex items-center justify-center">
                            #{v.id}
                          </span>
                          <span className="text-xs font-semibold text-slate-700">
                            Variation {v.id}
                          </span>
                        </div>

                        <div className="flex items-center gap-2">
                          <div className="flex items-center gap-1 bg-slate-900 text-emerald-400 px-2.5 py-1 rounded-lg text-[10px] font-mono font-bold shadow-xs">
                            <Fingerprint size={12} />
                            <span>SHA256: {v.sha256}</span>
                          </div>
                          <span className="text-[10px] text-gray-400 font-mono">
                            {v.byteLength} bytes
                          </span>
                        </div>
                      </div>

                      <div className="bg-slate-50 border border-slate-100 rounded-xl p-3.5 text-xs text-slate-800 whitespace-pre-wrap font-sans leading-relaxed">
                        {v.text}
                      </div>

                      <div className="flex items-center justify-between mt-3 pt-2">
                        <span className="text-[11px] text-emerald-600 flex items-center gap-1 font-medium">
                          <CheckCircle2 size={13} />
                          <span>Salted with invisible zero-width characters</span>
                        </span>

                        <RippleButton
                          onClick={() => handleSendVariationLive(v.text, idx)}
                          disabled={sendingVariationIndex !== null}
                          className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold px-4 py-1.5 rounded-xl flex items-center gap-1.5 shadow-sm shadow-emerald-600/20"
                        >
                          <Send size={12} />
                          <span>
                            {sendingVariationIndex === idx
                              ? 'Sending...'
                              : `Send Live to +91${antiSpamSendMobile}`}
                          </span>
                        </RippleButton>
                      </div>
                    </AnimatedCard>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: Provider & Cutover Settings */}
      {activeTab === 'providers' && (
        <div className="space-y-6">
          {/* Active Provider Card */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <AnimatedCard className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Active Gateway</span>
                <h4 className="text-xl font-black text-slate-900 capitalize flex items-center gap-2">
                  <Zap size={20} className="text-indigo-600" />
                  {providerConfigData?.data?.provider === 'meta_cloud'
                    ? 'Meta Cloud API'
                    : providerConfigData?.data?.provider === 'baileys_demo'
                    ? 'Baileys Demo Mode'
                    : providerConfigData?.data?.provider === 'aisensy'
                    ? 'AiSensy BSP'
                    : 'Mock Adapter'}
                </h4>
                <p className="text-xs text-slate-500 mt-2">
                  {providerConfigData?.data?.provider === 'meta_cloud'
                    ? 'Official Meta Graph API v20.0 (0% BSP markup, 1,000 free monthly chats).'
                    : providerConfigData?.data?.provider === 'baileys_demo'
                    ? 'Unofficial client demonstration only. Whitelist enforced.'
                    : providerConfigData?.data?.provider === 'aisensy'
                    ? 'Official WhatsApp Business Solution Provider (BSP).'
                    : 'In-memory simulator for unit tests and local sandbox.'}
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between text-xs">
                <span className="text-slate-400">Connection Health:</span>
                <span className={`font-bold px-2 py-0.5 rounded-full ${
                  providerConfigData?.data?.health?.status === 'connected' || providerConfigData?.data?.health?.status === 'ready'
                    ? 'bg-emerald-100 text-emerald-800'
                    : providerConfigData?.data?.health?.status === 'demo_active'
                    ? 'bg-amber-100 text-amber-800'
                    : 'bg-slate-100 text-slate-700'
                }`}>
                  {providerConfigData?.data?.health?.status || 'Active'}
                </span>
              </div>
            </AnimatedCard>

            <AnimatedCard className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Monthly Usage & Cost</span>
                <h4 className="text-xl font-black text-slate-900 flex items-center gap-2">
                  ₹{Number((usageData?.data?.summary || []).reduce((acc: number, item: any) => acc + Number(item.total_cost_inr || 0), 0)).toFixed(2)}
                </h4>
                <div className="mt-3 space-y-1 text-xs text-slate-600">
                  <div className="flex justify-between">
                    <span>Utility Messages (₹0.1150):</span>
                    <span className="font-bold">
                      {(usageData?.data?.summary || []).find((s: any) => s.category === 'utility')?.total_messages || 0}
                    </span>
                  </div>
                  <div className="flex justify-between">
                    <span>Marketing Messages (₹0.8631):</span>
                    <span className="font-bold">
                      {(usageData?.data?.summary || []).find((s: any) => s.category === 'marketing')?.total_messages || 0}
                    </span>
                  </div>
                </div>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100 text-[11px] text-slate-400">
                Official Meta rate card automatically applied per message
              </div>
            </AnimatedCard>

            <AnimatedCard className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block mb-1">Safety & Demo Wipe</span>
                <h4 className="text-lg font-black text-slate-900 flex items-center gap-2">
                  <ShieldCheck size={18} className="text-emerald-600" />
                  Session Purge Gate
                </h4>
                <p className="text-xs text-slate-500 mt-2">
                  Sever active Baileys socket connection and permanently remove session tokens from server storage.
                </p>
              </div>
              <div className="mt-4 pt-3 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowWipeModal(true)}
                  className="w-full py-2 px-3 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-xl flex items-center justify-center gap-1.5 transition cursor-pointer"
                >
                  <Power size={13} />
                  <span>Purge Baileys Session</span>
                </button>
              </div>
            </AnimatedCard>
          </div>

          {/* Provider Switching Form */}
          <AnimatedCard className="bg-white rounded-2xl p-6 border border-slate-200 shadow-xs">
            <div className="border-b border-slate-100 pb-4 mb-5">
              <h3 className="text-base font-black text-slate-900 flex items-center gap-2">
                <Zap size={18} className="text-indigo-600" />
                Zero-Code Provider Switch & Credentials
              </h3>
              <p className="text-xs text-slate-500 mt-1">
                Configure your active messaging backend. Credentials are encrypted in the database with AES-256-GCM.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                    Select Active Provider
                  </label>
                  <Dropdown
                    value={providerForm.provider}
                    onChange={(e) => setProviderForm(p => ({ ...p, provider: e.target.value as any }))}
                    className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-medium focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                  >
                    <option value="meta_cloud">Meta WhatsApp Cloud API (Production Default)</option>
                    <option value="aisensy">AiSensy BSP (Official Partner)</option>
                    <option value="baileys_demo">Baileys Demo Mode (Gated Client Demo Only)</option>
                    <option value="mock">Mock Provider (Local Automated QA)</option>
                  </Dropdown>
                </div>

                {providerForm.provider === 'meta_cloud' && (
                  <>
                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                        Meta Phone Number ID
                      </label>
                      <input
                        type="text"
                        value={providerForm.phoneNumberId}
                        onChange={(e) => setProviderForm(p => ({ ...p, phoneNumberId: e.target.value }))}
                        placeholder="e.g. 104829102948192"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                        Meta Business Account ID (WABA)
                      </label>
                      <input
                        type="text"
                        value={providerForm.businessAccountId}
                        onChange={(e) => setProviderForm(p => ({ ...p, businessAccountId: e.target.value }))}
                        placeholder="e.g. 204810293847192"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>

                    <div>
                      <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                        Permanent System User Access Token
                      </label>
                      <input
                        type="password"
                        value={providerForm.accessToken}
                        onChange={(e) => setProviderForm(p => ({ ...p, accessToken: e.target.value }))}
                        placeholder="EAAG... (Stored encrypted with AES-256-GCM)"
                        className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                      />
                    </div>
                  </>
                )}

                {providerForm.provider === 'aisensy' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                      AiSensy API Key
                    </label>
                    <input
                      type="password"
                      value={providerForm.aisensyApiKey}
                      onChange={(e) => setProviderForm(p => ({ ...p, aisensyApiKey: e.target.value }))}
                      placeholder="Paste your AiSensy Campaign API key"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                  </div>
                )}

                {providerForm.provider === 'baileys_demo' && (
                  <div>
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider block mb-1.5">
                      Demo Whitelist Phone Numbers (Comma-separated)
                    </label>
                    <input
                      type="text"
                      value={providerForm.demoWhitelist}
                      onChange={(e) => setProviderForm(p => ({ ...p, demoWhitelist: e.target.value }))}
                      placeholder="919876543210, 919123456789"
                      className="w-full border border-slate-200 rounded-xl px-3.5 py-2.5 text-sm font-mono focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
                    />
                    <p className="text-[11px] text-amber-600 mt-1">
                      ⚠️ Safeguard: Messages to any number not listed here will be hard-blocked.
                    </p>
                  </div>
                )}
              </div>

              <div className="bg-slate-50 border border-slate-200/80 rounded-2xl p-5 flex flex-col justify-between">
                <div>
                  <h4 className="text-xs font-black text-slate-800 uppercase tracking-wider mb-2">
                    Official Webhook Endpoint (For Meta / BSP)
                  </h4>
                  <div className="bg-white border border-slate-200 rounded-xl p-3 font-mono text-xs text-slate-700 break-all select-all mb-3">
                    {window.location.origin}/api/whatsapp/webhook
                  </div>
                  <p className="text-xs text-slate-500 leading-relaxed mb-3">
                    Subscribe this endpoint to the <code className="bg-slate-200 px-1 py-0.5 rounded text-[11px]">messages</code> field in your Meta Developer Console.
                  </p>
                  <div className="bg-indigo-50 border border-indigo-100 rounded-xl p-3 text-xs text-indigo-800 space-y-1">
                    <div className="font-bold">Automated Opt-Out Engine:</div>
                    <div>Inbound messages with keyword <strong className="font-mono">"STOP"</strong> or <strong className="font-mono">"UNSUBSCRIBE"</strong> automatically suppress future sends to comply with DPDP Act 2023.</div>
                  </div>
                </div>

                <div className="mt-5 pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      updateProviderConfig.mutate({
                        provider: 'mock'
                      }, {
                        onSuccess: () => refetchProviderConfig()
                      });
                    }}
                    className="px-3.5 py-2 bg-slate-200 hover:bg-slate-300 text-slate-800 text-xs font-bold rounded-xl transition"
                  >
                    Rollback to Mock
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      updateProviderConfig.mutate(providerForm, {
                        onSuccess: () => refetchProviderConfig()
                      });
                    }}
                    disabled={updateProviderConfig.isPending}
                    className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl transition shadow-xs disabled:opacity-50"
                  >
                    {updateProviderConfig.isPending ? 'Saving...' : 'Save & Switch Provider'}
                  </button>
                </div>
              </div>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* TAB 5: Opt-Outs & Anti-Spam Governance */}
      {activeTab === 'optouts' && (
        <div className="space-y-4">
          <AnimatedCard className="bg-white rounded-2xl p-5 border border-slate-200 shadow-xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-black text-slate-900 tracking-tight uppercase">
                  WhatsApp Opt-Out & Anti-Spam Ledger
                </span>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800">
                  DPDP Act 2023 Enforced
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1 max-w-2xl leading-relaxed">
                Recipients who reply with <strong className="text-slate-800">STOP</strong> or <strong className="text-slate-800">UNSUBSCRIBE</strong> are registered here. The notification dispatcher automatically drops all automated messages to these numbers with zero latency.
              </p>
            </div>
            <button
              onClick={() => refetchOptOuts()}
              className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl flex items-center gap-1.5 transition"
            >
              <RefreshCw size={13} />
              <span>Refresh Ledger</span>
            </button>
          </AnimatedCard>

          <AnimatedCard className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase tracking-wider font-bold">
                    <th className="py-3 px-4">Phone Number</th>
                    <th className="py-3 px-4">Opt-Out Date</th>
                    <th className="py-3 px-4">Trigger Reason</th>
                    <th className="py-3 px-4">Suppression Status</th>
                    <th className="py-3 px-4 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {(optOutsData?.data || []).length === 0 ? (
                    <tr>
                      <td colSpan={5} className="py-8 text-center text-slate-400">
                        No phone numbers have opted out. All customer communication channels are clear.
                      </td>
                    </tr>
                  ) : (
                    (optOutsData?.data || []).map((row: any) => (
                      <tr key={row.id} className="hover:bg-slate-50/60 transition">
                        <td className="py-3 px-4 font-mono font-bold text-slate-900">
                          +{row.phone}
                        </td>
                        <td className="py-3 px-4 text-slate-500">
                          {new Date(row.opt_out_date || row.created_at).toLocaleString('en-IN')}
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded-md border border-rose-100">
                            {row.reason || 'Customer sent STOP'}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <span className="font-bold text-emerald-700 flex items-center gap-1">
                            <CheckCircle2 size={13} /> Suppressed on All Gateways
                          </span>
                        </td>
                        <td className="py-3 px-4 text-right">
                          <button
                            onClick={() => {
                              if (confirm(`Unblock +${row.phone} and allow automated notifications again?`)) {
                                removeOptOutMutation.mutate(row.phone);
                              }
                            }}
                            className="px-2.5 py-1 text-xs font-bold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition"
                          >
                            Unblock
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </AnimatedCard>
        </div>
      )}

      {/* MODAL 1: Sandbox Test Send Modal */}
      <AnimatedModal isOpen={showTestModal} onClose={() => setShowTestModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-2 flex items-center gap-2">
            <Sparkles size={20} className="text-amber-500" /> Test Automation Sandbox
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            Enqueue a non-blocking test notification to verify background queue processing, templates, and delivery simulation.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Channel</label>
              <Dropdown
                value={testForm.channel}
                onChange={(e) => setTestForm((p) => ({ ...p, channel: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900/20"
              >
                <option value="whatsapp">Meta WhatsApp Cloud API (Sandbox/Live)</option>
                <option value="email">Gmail / SMTP Email (Sandbox/Live)</option>
              </Dropdown>
            </div>

            {testForm.channel === 'whatsapp' ? (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Recipient Mobile</label>
                <input
                  value={testForm.mobile}
                  onChange={(e) => setTestForm((p) => ({ ...p, mobile: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-slate-900/20"
                  placeholder="e.g. 9876543210"
                />
              </div>
            ) : (
              <div>
                <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Recipient Email</label>
                <input
                  value={testForm.email}
                  onChange={(e) => setTestForm((p) => ({ ...p, email: e.target.value }))}
                  className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-slate-900/20"
                  placeholder="e.g. customer@domain.com"
                />
              </div>
            )}

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Template Name / Trigger</label>
              <input
                value={testForm.template_name}
                onChange={(e) => setTestForm((p) => ({ ...p, template_name: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900/20"
                placeholder="WARRANTY_CERTIFICATE or BUY_SELL_BILL"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Message Content</label>
              <textarea
                value={testForm.message_body}
                onChange={(e) => setTestForm((p) => ({ ...p, message_body: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-slate-900/20"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <RippleButton variant="ghost" onClick={() => setShowTestModal(false)}>
                Cancel
              </RippleButton>
              <RippleButton
                variant="primary"
                onClick={handleTestSend}
                disabled={testSendMutation.isPending}
                className="bg-slate-900 hover:bg-slate-800 text-white"
              >
                {testSendMutation.isPending ? 'Queuing...' : 'Enqueue Test'}
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>

      {/* MODAL 2: Manual WhatsApp Message Modal */}
      <AnimatedModal isOpen={showSendModal} onClose={() => setShowSendModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-6 flex items-center gap-2">
            <MessageSquare size={20} className="text-[#25D366]" /> Send Direct WhatsApp
          </h3>
          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                Phone Number (with or without 91)
              </label>
              <input
                value={manualForm.phone}
                onChange={(e) => setManualForm((p) => ({ ...p, phone: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366]"
                placeholder="e.g. 9876543210"
              />
            </div>
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs font-semibold text-gray-500 uppercase">Message Body</label>
                <div className="flex items-center gap-1 text-[10px] text-emerald-600 font-semibold bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-100">
                  <Shield size={11} />
                  <span>Auto-Humanized & Salted</span>
                </div>
              </div>
              <textarea
                value={manualForm.message}
                onChange={(e) => setManualForm((p) => ({ ...p, message: e.target.value }))}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-[#25D366]/20 focus:border-[#25D366]"
                placeholder="Type your WhatsApp notification... Supports {Hi|Hello|Hey} spintax!"
                rows={4}
              />
              <div className="flex flex-wrap items-center gap-1.5 mt-2">
                <span className="text-[10px] text-gray-400 font-medium">Quick Spintax:</span>
                <button
                  type="button"
                  onClick={() => setManualForm((p) => ({ ...p, message: p.message + ' {Hi|Hello|Hey}' }))}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-lg font-mono transition"
                >
                  +{'{Hi|Hello|Hey}'}
                </button>
                <button
                  type="button"
                  onClick={() => setManualForm((p) => ({ ...p, message: p.message + ' {your car is ready|detailing is finished}' }))}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-lg font-mono transition"
                >
                  +{'{your car is ready|detailing is finished}'}
                </button>
                <button
                  type="button"
                  onClick={() => setManualForm((p) => ({ ...p, message: p.message + ' {Best regards|Warm regards}, Team O3 Car Spaa' }))}
                  className="text-[10px] bg-slate-100 hover:bg-slate-200 text-slate-700 px-2 py-0.5 rounded-lg font-mono transition"
                >
                  +{'{Best regards|Warm regards}'}
                </button>
              </div>
            </div>
            <div className="flex justify-end gap-3 pt-2">
              <RippleButton variant="ghost" onClick={() => setShowSendModal(false)}>
                Cancel
              </RippleButton>
              <RippleButton
                variant="primary"
                onClick={handleManualSend}
                disabled={sendWhatsApp.isPending}
                className="bg-[#25D366] hover:bg-[#1ebd5a] text-white"
              >
                {sendWhatsApp.isPending ? 'Sending...' : 'Send WhatsApp'}
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>

      {/* MODAL 3: WhatsApp Multi-Device Pairing Modal */}
      <AnimatedModal isOpen={showPairingModal} onClose={() => setShowPairingModal(false)}>
        <div className="p-6 max-w-md mx-auto">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2.5">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-600 flex items-center justify-center">
                <QrCode size={22} />
              </div>
              <div>
                <h3 className="text-lg font-black text-slate-900">Pair Studio WhatsApp</h3>
                <p className="text-xs text-slate-500">Official Multi-Device Web Engine</p>
              </div>
            </div>
          </div>

          {isConnected ? (
            <div className="text-center py-6 space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 size={36} />
              </div>
              <div>
                <h4 className="text-base font-black text-slate-900">Successfully Connected!</h4>
                <p className="text-xs text-slate-500 mt-1">
                  Studio number <strong className="text-slate-900 font-mono">+{currentPhone}</strong> is paired.
                  Automated dispatches are active.
                </p>
              </div>
              <RippleButton
                variant="primary"
                onClick={() => setShowPairingModal(false)}
                className="bg-slate-900 text-white w-full py-2.5"
              >
                Done
              </RippleButton>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Tab Selector */}
              <div className="flex bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPairingTab('code')}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    pairingTab === 'code' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <KeyRound size={13} />
                  <span>8-Digit Code</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPairingTab('qr');
                    if (!currentQr) connectBaileys.mutate();
                  }}
                  className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all flex items-center justify-center gap-1.5 ${
                    pairingTab === 'qr' ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  <QrCode size={13} />
                  <span>Scan QR Code</span>
                </button>
              </div>

              {/* TAB 1: 8-Digit Code Pairing */}
              {pairingTab === 'code' ? (
                <div className="space-y-3.5">
                  <div>
                    <label className="text-xs font-bold text-slate-700 block mb-1">
                      Phone Number to Link
                    </label>
                    <div className="flex gap-2">
                      <input
                        type="text"
                        value={pairingPhoneInput}
                        onChange={(e) => setPairingPhoneInput(e.target.value)}
                        placeholder="9316668760"
                        className="flex-1 border border-slate-200 rounded-xl px-3 py-2 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                      />
                      <button
                        type="button"
                        onClick={() => {
                          pairingCodeMutation.mutate(pairingPhoneInput, {
                            onSuccess: (data: any) => {
                              if (data?.pairingCode) setGeneratedPairingCode(data.pairingCode);
                            }
                          });
                        }}
                        disabled={pairingCodeMutation.isPending}
                        className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl flex items-center gap-1.5 shrink-0 transition shadow-xs cursor-pointer disabled:opacity-50"
                      >
                        {pairingCodeMutation.isPending ? <RefreshCw size={13} className="animate-spin" /> : <Sparkles size={13} />}
                        <span>{pairingCodeMutation.isPending ? 'Generating...' : 'Get Code'}</span>
                      </button>
                    </div>
                  </div>

                  {generatedPairingCode || baileysData?.data?.pairingCode ? (
                    <div className="p-4 bg-emerald-50 border-2 border-emerald-300 rounded-2xl text-center space-y-2">
                      <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-800 block">
                        Enter Code in WhatsApp Linked Devices
                      </span>
                      <div className="text-3xl font-black font-mono tracking-widest text-emerald-950 py-1">
                        {(generatedPairingCode || baileysData?.data?.pairingCode || '').split('').map((char: string, i: number) => i === 4 ? `-${char}` : char).join('')}
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          copyText(generatedPairingCode || baileysData?.data?.pairingCode || '');
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                          toast.success('Pairing code copied!');
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1 bg-white hover:bg-emerald-100 text-emerald-900 border border-emerald-300 rounded-lg text-xs font-bold transition shadow-2xs cursor-pointer"
                      >
                        {copiedCode ? <Check size={12} className="text-emerald-600" /> : <Copy size={12} />}
                        <span>{copiedCode ? 'Copied!' : 'Copy Code'}</span>
                      </button>
                    </div>
                  ) : (
                    <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl text-center">
                      <p className="text-xs text-slate-500">
                        Click <strong>"Get Code"</strong> to generate an 8-character pairing code for your phone.
                      </p>
                    </div>
                  )}

                  {/* Step Instructions */}
                  <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-100">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span className="text-slate-700">Open WhatsApp on your phone (<strong>{pairingPhoneInput}</strong>)</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <span className="text-slate-700">Tap <strong>Menu (⋮)</strong> or <strong>Settings</strong> → <strong>Linked Devices</strong></span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span className="text-slate-700">Tap <strong>Link a Device</strong> → tap <strong>"Link with phone number instead"</strong> at the bottom</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">4</span>
                      <span className="text-slate-700">Enter the 8-character code shown above!</span>
                    </div>
                  </div>
                </div>
              ) : (
                /* TAB 2: QR Code Scanning */
                <div className="space-y-4">
                  {currentQr ? (
                    <div className="text-center">
                      <div className="inline-block p-2 bg-white rounded-2xl border-2 border-slate-200 shadow-md">
                        <img
                          src={currentQr}
                          alt="WhatsApp QR Code"
                          className="w-52 h-52 mx-auto rounded-xl object-contain"
                        />
                      </div>
                      <p className="text-[11px] text-amber-700 font-bold mt-2 flex items-center justify-center gap-1.5">
                        <RefreshCw size={12} className="animate-spin text-amber-600" />
                        <span>QR active · Scan with WhatsApp camera</span>
                      </p>
                    </div>
                  ) : (
                    <div className="h-52 flex flex-col items-center justify-center border-2 border-dashed border-slate-200 rounded-2xl p-6 text-center">
                      <RefreshCw size={32} className="text-emerald-500 animate-spin mb-3" />
                      <p className="text-sm font-bold text-slate-700">Generating pairing QR code...</p>
                      <p className="text-xs text-slate-400 mt-1">Point phone camera once code appears</p>
                    </div>
                  )}

                  {/* Instructions */}
                  <div className="bg-slate-50 rounded-2xl p-3.5 space-y-2 text-xs border border-slate-100">
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">1</span>
                      <span className="text-slate-700">Open WhatsApp on your phone</span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">2</span>
                      <span className="text-slate-700">Tap <strong>Menu (⋮)</strong> or <strong>Settings</strong> → <strong>Linked Devices</strong></span>
                    </div>
                    <div className="flex items-start gap-2.5">
                      <span className="w-5 h-5 rounded-full bg-slate-900 text-white text-[11px] font-bold flex items-center justify-center shrink-0 mt-0.5">3</span>
                      <span className="text-slate-700">Tap <strong>Link a Device</strong> and point camera at the QR code</span>
                    </div>
                  </div>
                </div>
              )}

              <div className="flex justify-between items-center pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => connectBaileys.mutate()}
                  disabled={connectBaileys.isPending}
                  className="text-xs text-slate-600 hover:text-slate-900 font-bold flex items-center gap-1 cursor-pointer"
                >
                  <RefreshCw size={12} className={connectBaileys.isPending ? 'animate-spin' : ''} />
                  <span>Refresh Session</span>
                </button>
                <RippleButton variant="ghost" onClick={() => setShowPairingModal(false)}>
                  Close
                </RippleButton>
              </div>
            </div>
          )}
        </div>
      </AnimatedModal>

      {/* MODAL 4: Direct Test Send Modal */}
      <AnimatedModal isOpen={showDirectTestModal} onClose={() => setShowDirectTestModal(false)}>
        <div className="p-6">
          <h3 className="text-xl font-bold text-[#0F172A] mb-2 flex items-center gap-2">
            <Sparkles size={20} className="text-emerald-500" /> Direct WhatsApp Live Test
          </h3>
          <p className="text-xs text-gray-500 mb-6">
            Dispatch a direct message through your connected studio WhatsApp account (+{currentPhone || 'Connected'}) to confirm live delivery.
          </p>

          <div className="space-y-4">
            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">
                Recipient Mobile (10 digits or with 91)
              </label>
              <input
                value={directTestMobile}
                onChange={(e) => setDirectTestMobile(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm font-mono focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                placeholder="e.g. 9876543210"
              />
            </div>

            <div>
              <label className="text-xs font-semibold text-gray-500 uppercase mb-1 block">Message Content</label>
              <textarea
                value={directTestMessage}
                onChange={(e) => setDirectTestMessage(e.target.value)}
                className="w-full border border-gray-200 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500"
                placeholder="🧪 Test message from O3 Car Spaa multi-device engine. If you see this, WhatsApp is live and working! ✅"
                rows={3}
              />
            </div>

            <div className="flex justify-end gap-3 pt-3 border-t border-gray-100">
              <RippleButton variant="ghost" onClick={() => setShowDirectTestModal(false)}>
                Cancel
              </RippleButton>
              <RippleButton
                variant="primary"
                onClick={handleDirectTest}
                disabled={directTestMutation.isPending}
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
              >
                {directTestMutation.isPending ? 'Sending...' : 'Send Live Test'}
              </RippleButton>
            </div>
          </div>
        </div>
      </AnimatedModal>

      {/* MODAL 5: Permanent Baileys Session Wipe Modal */}
      <AnimatedModal isOpen={showWipeModal} onClose={() => setShowWipeModal(false)}>
        <div className="p-6">
          <div className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center mb-4">
            <AlertTriangle size={24} />
          </div>
          <h3 className="text-xl font-bold text-slate-900 mb-2">
            Purge Baileys Session from Disk?
          </h3>
          <p className="text-xs text-slate-500 mb-6 leading-relaxed">
            This will immediately close the active WhatsApp Web socket connection and permanently delete the authentication tokens stored in <code className="bg-slate-100 px-1 py-0.5 rounded text-slate-800">server/sessions/whatsapp/</code>.
            Use this immediately after client demonstrations to guarantee zero unauthorized access.
          </p>
          <div className="flex justify-end gap-3 pt-3 border-t border-slate-100">
            <RippleButton variant="ghost" onClick={() => setShowWipeModal(false)}>
              Cancel
            </RippleButton>
            <RippleButton
              variant="primary"
              onClick={() => {
                wipeSessionMutation.mutate(undefined, {
                  onSuccess: () => {
                    setShowWipeModal(false);
                    refetchProviderConfig();
                  }
                });
              }}
              disabled={wipeSessionMutation.isPending}
              className="bg-rose-600 hover:bg-rose-700 text-white"
            >
              {wipeSessionMutation.isPending ? 'Purging...' : 'Purge Session Now'}
            </RippleButton>
          </div>
        </div>
      </AnimatedModal>
    </PageTransition>
  );
}
