import { useState, useEffect } from 'react';
import {
  Users,
  Phone,
  Mail,
  Car,
  MessageCircle,
  ArrowRight,
  Search,
  Plus,
  Filter,
  Loader2,
  Bot,
  ShieldCheck,
  BookOpen,
  Send,
  RefreshCw,
  Sliders,
  CheckCircle2,
  XCircle,
  Clock,
  AlertTriangle,
  Trash2,
  Edit2,
  Zap
} from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer } from 'recharts';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useSendWhatsApp } from '../../api/hooks/useWhatsApp';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import LeadsPipeline from '../../components/admin/LeadsPipeline';
import Input from '../../components/ui/Input';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

interface Inquiry {
  id: number;
  source: 'facebook' | 'instagram' | 'walk_in' | 'website' | 'staff' | 'whatsapp_inbound' | string;
  name: string;
  mobile: string;
  email?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  services_interested?: string;
  status: 'new' | 'followed_up' | 'converted' | 'cancelled' | string;
  created_at: string;
}

const SOURCE_COLORS: Record<string, string> = {
  facebook: '#1877F2',
  instagram: '#E4405F',
  walk_in: '#10B981',
  website: '#2563EB',
  staff: '#8B5CF6',
  whatsapp_inbound: '#25D366',
  other: '#64748B',
};

const SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook Ads',
  instagram: 'Instagram Ads',
  walk_in: 'Walk-In',
  website: 'Website Intake',
  staff: 'Staff Lead',
  whatsapp_inbound: 'WhatsApp Inbound',
  other: 'Other Sources',
};

const FacebookIcon = () => (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z" />
  </svg>
);

const InstagramIcon = () => (
  <svg className="w-4 h-4 fill-current" viewBox="0 0 24 24">
    <path d="M12 2.163c3.204 0 3.584.012 4.85.07 3.252.148 4.771 1.691 4.919 4.919.058 1.265.069 1.645.069 4.849 0 3.205-.012 3.584-.069 4.849-.149 3.225-1.664 4.771-4.919 4.919-1.266.058-1.644.07-4.85.07-3.204 0-3.584-.012-4.849-.07-3.26-.149-4.771-1.699-4.919-4.92-.058-1.265-.07-1.644-.07-4.849 0-3.204.013-3.583.07-4.849.149-3.227 1.664-4.771 4.919-4.919 1.266-.057 1.645-.069 4.849-.069zm0-2.163c-3.259 0-3.667.014-4.947.072-4.358.2-6.78 2.618-6.98 6.98-.059 1.281-.073 1.689-.073 4.948 0 3.259.014 3.668.072 4.948.2 4.358 2.618 6.78 6.98 6.98 1.281.058 1.689.072 4.948.072 3.259 0 3.668-.014 4.948-.072 4.354-.2 6.782-2.618 6.979-6.98.059-1.28.073-1.689.073-4.948 0-3.259-.014-3.667-.072-4.947-.196-4.354-2.617-6.78-6.979-6.98-1.281-.059-1.69-.073-4.949-.073zm0 5.838c-3.403 0-6.162 2.759-6.162 6.162s2.759 6.163 6.162 6.163 6.162-2.759 6.162-6.163c0-3.403-2.759-6.162-6.162-6.162zm0 10.162c-2.209 0-4-1.79-4-4 0-2.209 1.791-4 4-4s4 1.791 4 4c0 2.21-1.791 4-4 4zm6.406-11.845c-.796 0-1.441.645-1.441 1.44s.645 1.44 1.441 1.44c.795 0 1.439-.645 1.439-1.44s-.644-1.44-1.439-1.44z" />
  </svg>
);

const getSourceIcon = (source: string) => {
  switch (source) {
    case 'facebook': return <FacebookIcon />;
    case 'instagram': return <InstagramIcon />;
    case 'walk_in': return <Users className="w-4 h-4" />;
    case 'website': return <Mail className="w-4 h-4" />;
    case 'whatsapp_inbound': return <MessageCircle className="w-4 h-4 text-emerald-600" />;
    default: return <Users className="w-4 h-4" />;
  }
};

export default function LeadManagementPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);

  const [activeTab, setActiveTab] = useState<'pipeline' | 'inbox' | 'kb' | 'settings'>('pipeline');

  // Leads state
  const [leads, setLeads] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // New Lead Form state
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newService, setNewService] = useState('');
  const [newSource, setNewSource] = useState('facebook');
  const [submitting, setSubmitting] = useState(false);
  const [convertingLeadId, setConvertingLeadId] = useState<number | null>(null);
  const [sendingLeadId, setSendingLeadId] = useState<number | null>(null);
  const sendWhatsApp = useSendWhatsApp();

  // Unified Inbox State
  const [conversations, setConversations] = useState<any[]>([]);
  const [selectedConv, setSelectedConv] = useState<any | null>(null);
  const [messages, setMessages] = useState<any[]>([]);
  const [replyText, setReplyText] = useState('');
  const [sendingReply, setSendingReply] = useState(false);

  // Knowledge Base State
  const [kbArticles, setKbArticles] = useState<any[]>([]);
  const [kbModalOpen, setKbModalOpen] = useState(false);
  const [kbForm, setKbForm] = useState({ id: null, category: 'services', title: '', content: '', keywords: '' });

  // AI Settings State
  const [aiSettings, setAiSettings] = useState<any>({
    is_enabled: 1,
    sandbox_mode: 0,
    model_name: 'gpt-4o-mini',
    monthly_budget_cap_inr: 2000.00,
    cost_spent_this_month_inr: 0.00
  });

  const fetchLeads = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/inquiries'),
        api.get('/inquiries/stats')
      ]);
      setLeads(listRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch (err) {
      setLeads([]);
      setStats(null);
    } finally {
      setLoading(false);
    }
  };

  const fetchInbox = async () => {
    try {
      const { data } = await api.get('/leads/conversations');
      setConversations(data.data || []);
      if (!selectedConv && data.data?.length > 0) {
        setSelectedConv(data.data[0]);
      }
    } catch (err) {
      console.warn('Failed to fetch conversations:', err);
    }
  };

  const fetchMessages = async (convId: number) => {
    try {
      const { data } = await api.get(`/leads/conversations/${convId}/messages`);
      setMessages(data.data || []);
    } catch (err) {
      console.warn('Failed to fetch messages:', err);
    }
  };

  const fetchKB = async () => {
    try {
      const { data } = await api.get('/leads/knowledge-base');
      setKbArticles(data.data || []);
    } catch (err) {
      console.warn('Failed to fetch KB:', err);
    }
  };

  const fetchAISettings = async () => {
    try {
      const { data } = await api.get('/leads/ai-settings');
      if (data.data) setAiSettings(data.data);
    } catch (err) {
      console.warn('Failed to fetch AI settings:', err);
    }
  };

  useLiveReload(() => { fetchAISettings(); fetchInbox(); fetchKB(); fetchLeads(); }); // reload when anything changes elsewhere
  useEffect(() => {
    fetchLeads();
    fetchInbox();
    fetchKB();
    fetchAISettings();
  }, []);

  useEffect(() => {
    if (selectedConv?.id) {
      fetchMessages(selectedConv.id);
    }
  }, [selectedConv]);

  const handleSendLeadWhatsApp = (lead: Inquiry) => {
    if (!lead.mobile) return;
    const msg = `Hi ${lead.name}, thank you for reaching out to O3 Car Spaa! How can we assist you with your vehicle detailing today? 🚗✨`;
    setSendingLeadId(lead.id);
    sendWhatsApp.mutate(
      { phone: lead.mobile, message: msg },
      { onSettled: () => setSendingLeadId(null) }
    );
  };

  const handleCreateLead = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName || !newMobile) {
      toast('error', 'Name and mobile number are required');
      return;
    }
    setSubmitting(true);
    try {
      await api.post('/inquiries', {
        name: newName,
        mobile: newMobile,
        email: newEmail,
        vehicle_brand: newBrand,
        vehicle_model: newModel,
        services_interested: newService,
        source: newSource
      });
      toast('success', 'Lead created successfully');
      setAddModalOpen(false);
      setNewName(''); setNewMobile(''); setNewEmail(''); setNewBrand(''); setNewModel(''); setNewService('');
      fetchLeads();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to create lead');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConvertLead = async (leadId: number) => {
    try {
      setConvertingLeadId(leadId);
      const res = await api.post(`/inquiries/${leadId}/convert`, { lead_source: undefined });
      toast('success', 'Inquiry converted to Lead');
      navigate('/admin/job-carts/new', { state: { prefill: res.data.data } });
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to convert lead');
    } finally {
      setConvertingLeadId(null);
    }
  };

  const handleToggleAgentMode = async (convId: number, currentMode: string) => {
    const newMode = currentMode === 'ai' ? 'human' : 'ai';
    try {
      await api.post(`/leads/conversations/${convId}/agent-mode`, { mode: newMode });
      toast('success', `Takeover toggled to ${newMode === 'human' ? 'Staff Takeover' : 'AI Agent'}`);
      fetchInbox();
      if (selectedConv?.id === convId) {
        setSelectedConv({ ...selectedConv, agent_mode: newMode });
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to toggle mode');
    }
  };

  const handleSendStaffReply = async () => {
    if (!selectedConv?.id || !replyText.trim()) return;
    setSendingReply(true);
    try {
      await api.post(`/leads/conversations/${selectedConv.id}/reply`, { text: replyText.trim() });
      setReplyText('');
      fetchMessages(selectedConv.id);
      toast('success', 'Staff reply sent via WhatsApp');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to dispatch reply');
    } finally {
      setSendingReply(false);
    }
  };

  const handleSaveKB = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await api.post('/leads/knowledge-base', kbForm);
      toast('success', 'Knowledge article saved');
      setKbModalOpen(false);
      setKbForm({ id: null, category: 'services', title: '', content: '', keywords: '' });
      fetchKB();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to save article');
    }
  };

  const handleDeleteKB = async (id: number) => {
    if (!confirm('Are you sure you want to delete this article?')) return;
    try {
      await api.delete(`/leads/knowledge-base/${id}`);
      toast('success', 'Article deleted');
      fetchKB();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to delete');
    }
  };

  const handleSaveAISettings = async () => {
    try {
      await api.post('/leads/ai-settings', aiSettings);
      toast('success', 'AI settings updated successfully');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to update settings');
    }
  };

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.name?.toLowerCase().includes(q) || l.mobile?.includes(q) || l.vehicle_brand?.toLowerCase().includes(q) || l.vehicle_model?.toLowerCase().includes(q);
    const matchSource = selectedSource === 'all' || l.source === selectedSource;
    return matchSearch && matchSource;
  });

  const pieData = stats?.by_source?.map((item: any) => ({
    name: SOURCE_LABELS[item.source] || item.source,
    value: parseInt(item.total, 10),
    sourceKey: item.source,
  })) || [];

  return (
    <>
      <AdminTopBar
        title="Leads & AI Inbound Agent"
        subtitle="New business from every source — WhatsApp AI agent, website, Instagram/Facebook/Google, walk-ins, calls, imports"
        actions={
          <div className="flex items-center gap-2">

            {activeTab === 'kb' && (
              <button
                onClick={() => {
                  setKbForm({ id: null, category: 'services', title: '', content: '', keywords: '' });
                  setKbModalOpen(true);
                }}
                className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700 transition shadow-sm"
              >
                <Plus size={16} /> Add Article
              </button>
            )}
          </div>
        }
      />

      {/* Primary Tab Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200 pb-2 mb-6">
        <button
          onClick={() => setActiveTab('pipeline')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === 'pipeline' ? 'bg-slate-900 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Users size={15} />
          <span>Pipeline & Funnel</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'pipeline' ? 'bg-slate-800 text-slate-200' : 'bg-slate-200 text-slate-700'}`}>
            {leads.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('inbox')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === 'inbox' ? 'bg-emerald-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <MessageCircle size={15} />
          <span>Unified WhatsApp Inbox</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'inbox' ? 'bg-emerald-700 text-white' : 'bg-emerald-100 text-emerald-800'}`}>
            {conversations.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('kb')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === 'kb' ? 'bg-indigo-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <BookOpen size={15} />
          <span>Franchise Knowledge Base</span>
          <span className={`text-[11px] px-2 py-0.5 rounded-full ${activeTab === 'kb' ? 'bg-indigo-700 text-white' : 'bg-indigo-100 text-indigo-800'}`}>
            {kbArticles.length}
          </span>
        </button>

        <button
          onClick={() => setActiveTab('settings')}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs transition ${
            activeTab === 'settings' ? 'bg-amber-600 text-white shadow-sm' : 'text-slate-600 hover:bg-slate-100'
          }`}
        >
          <Sliders size={15} />
          <span>AI Agent Controls</span>
          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-100 text-amber-800 uppercase">
            {aiSettings.is_enabled ? 'Active' : 'Paused'}
          </span>
        </button>
      </div>

      {/* TAB 1: PIPELINE & FUNNEL */}
      {activeTab === 'pipeline' && <LeadsPipeline />}

      {activeTab === 'inbox' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 bg-white border border-slate-200 rounded-3xl overflow-hidden shadow-sm min-h-[600px]">
          {/* Conversation List (Left 4 cols) */}
          <div className="lg:col-span-4 border-r border-slate-100 flex flex-col">
            <div className="p-4 border-b border-slate-100 flex items-center justify-between">
              <h3 className="font-extrabold text-sm text-slate-900">Conversations</h3>
              <button onClick={() => fetchInbox()} className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg transition">
                <RefreshCw size={14} />
              </button>
            </div>
            <div className="overflow-y-auto flex-1 divide-y divide-slate-50">
              {conversations.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-400">No active WhatsApp conversations yet.</div>
              ) : (
                conversations.map((conv) => (
                  <div
                    key={conv.id}
                    onClick={() => setSelectedConv(conv)}
                    className={`p-4 transition cursor-pointer flex flex-col gap-1.5 ${
                      selectedConv?.id === conv.id ? 'bg-slate-100/80 border-l-4 border-emerald-500' : 'hover:bg-slate-50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-bold text-xs text-slate-900 truncate">
                        {conv.customer_name || `+${conv.phone}`}
                      </span>
                      <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-md uppercase tracking-wider ${
                        conv.agent_mode === 'human' ? 'bg-rose-100 text-rose-800' : 'bg-emerald-100 text-emerald-800'
                      }`}>
                        {conv.agent_mode === 'human' ? 'Human Takeover' : 'AI Active'}
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-500 line-clamp-1">
                      {conv.last_message_text || 'No message text'}
                    </p>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 pt-1">
                      <span>+{conv.phone}</span>
                      <span>{new Date(conv.last_customer_message_at || conv.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Active Chat Stream (Right 8 cols) */}
          <div className="lg:col-span-8 flex flex-col justify-between h-[600px]">
            {selectedConv ? (
              <>
                {/* Chat Header */}
                <div className="p-4 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-slate-900 text-white flex items-center justify-center font-bold text-sm">
                      {(selectedConv.customer_name || 'C')[0]}
                    </div>
                    <div>
                      <h4 className="font-black text-sm text-slate-900">{selectedConv.customer_name || 'Valued Customer'}</h4>
                      <p className="text-[11px] text-slate-500 font-mono">+{selectedConv.phone} · Care window: 24h active</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => handleToggleAgentMode(selectedConv.id, selectedConv.agent_mode)}
                      className={`px-3 py-1.5 rounded-xl text-xs font-bold transition flex items-center gap-1.5 ${
                        selectedConv.agent_mode === 'human'
                          ? 'bg-rose-600 hover:bg-rose-700 text-white'
                          : 'bg-slate-200 hover:bg-slate-300 text-slate-800'
                      }`}
                    >
                      {selectedConv.agent_mode === 'human' ? (
                        <>
                          <Users size={13} />
                          <span>Staff Mode (Switch to AI)</span>
                        </>
                      ) : (
                        <>
                          <Bot size={13} />
                          <span>AI Active (Take Over)</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>

                {/* Message Trail */}
                <div className="p-5 overflow-y-auto flex-1 space-y-3 bg-slate-50/30">
                  {messages.map((m) => (
                    <div
                      key={m.id}
                      className={`flex flex-col ${
                        m.sender_type === 'customer' ? 'items-start' : 'items-end'
                      }`}
                    >
                      <div className={`max-w-[75%] rounded-2xl p-3 text-xs leading-relaxed shadow-xs ${
                        m.sender_type === 'customer'
                          ? 'bg-white border border-slate-200 text-slate-900 rounded-tl-xs'
                          : m.sender_type === 'ai_agent'
                          ? 'bg-slate-900 text-white rounded-tr-xs'
                          : 'bg-emerald-600 text-white rounded-tr-xs'
                      }`}>
                        <div className="text-[9px] font-bold opacity-60 mb-1">
                          {m.sender_type === 'customer' ? 'Customer' : m.sender_type === 'ai_agent' ? '🤖 AI Leads Agent' : '👤 Studio Staff'}
                        </div>
                        <div className="whitespace-pre-wrap">{m.message_text}</div>
                      </div>
                      <span className="text-[9px] text-slate-400 mt-1 px-1">
                        {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  ))}
                </div>

                {/* Staff Reply Bar */}
                <div className="p-3 border-t border-slate-100 bg-white flex items-center gap-2">
                  <input
                    type="text"
                    value={replyText}
                    onChange={(e) => setReplyText(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendStaffReply()}
                    placeholder="Type reply to customer via WhatsApp..."
                    className="flex-1 px-4 py-2.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium focus:ring-2 focus:ring-emerald-500/20"
                  />
                  <button
                    onClick={handleSendStaffReply}
                    disabled={sendingReply || !replyText.trim()}
                    className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold flex items-center gap-1.5 transition disabled:opacity-50"
                  >
                    <Send size={13} />
                    <span>Send</span>
                  </button>
                </div>
              </>
            ) : (
              <div className="flex items-center justify-center h-full text-slate-400 text-xs">
                Select a conversation on the left to view the messages
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 3: FRANCHISE KNOWLEDGE BASE */}
      {activeTab === 'kb' && (
        <div className="space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {['services', 'pricing', 'operating_hours', 'policies', 'faqs'].map((cat) => {
              const count = kbArticles.filter((a) => a.category === cat).length;
              return (
                <div key={cat} className="bg-white border border-slate-200 rounded-2xl p-4 shadow-xs">
                  <div className="flex items-center justify-between mb-2">
                    <span className="font-black text-xs uppercase tracking-wider text-slate-400">{cat.replace('_', ' ')}</span>
                    <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-700">{count} Articles</span>
                  </div>
                  <p className="text-xs text-slate-500">Official ground-truth documentation for AI Leads Agent responses.</p>
                </div>
              );
            })}
          </div>

          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm overflow-hidden">
            <h3 className="font-extrabold text-sm text-slate-900 mb-4">Knowledge Base Articles</h3>
            <div className="divide-y divide-slate-100">
              {kbArticles.map((art) => (
                <div key={art.id} className="py-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="font-black text-sm text-slate-900">{art.title}</span>
                      <span className="text-[10px] font-bold px-2 py-0.5 rounded-full uppercase bg-indigo-50 text-indigo-700 border border-indigo-100">
                        {art.category}
                      </span>
                    </div>
                    <p className="text-xs text-slate-600 max-w-3xl leading-relaxed">{art.content}</p>
                    {art.keywords && (
                      <p className="text-[10px] font-mono text-slate-400">Keywords: {art.keywords}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      onClick={() => {
                        setKbForm({ id: art.id, category: art.category, title: art.title, content: art.content, keywords: art.keywords || '' });
                        setKbModalOpen(true);
                      }}
                      className="p-1.5 text-slate-400 hover:text-slate-900 rounded-lg transition"
                    >
                      <Edit2 size={14} />
                    </button>
                    <button
                      onClick={() => handleDeleteKB(art.id)}
                      className="p-1.5 text-rose-400 hover:text-rose-600 rounded-lg transition"
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: AI AGENT CONTROLS & COST CAP */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <div className="bg-white border border-slate-200 rounded-3xl p-6 shadow-sm max-w-2xl space-y-6">
            <div className="border-b border-slate-100 pb-4">
              <h3 className="font-extrabold text-base text-slate-900">AI Leads Agent Governance</h3>
              <p className="text-xs text-slate-500 mt-1">Configure automated response safety limits, monthly budget caps, and model parameters.</p>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 bg-slate-50 rounded-2xl border border-slate-200/60">
                <div>
                  <h4 className="font-bold text-xs text-slate-900">AI Agent Inbound Auto-Reply</h4>
                  <p className="text-[11px] text-slate-500">Automatically reply to new inquiries using verified Knowledge Base.</p>
                </div>
                <input
                  type="checkbox"
                  checked={Boolean(aiSettings.is_enabled)}
                  onChange={(e) => setAiSettings({ ...aiSettings, is_enabled: e.target.checked ? 1 : 0 })}
                  className="w-5 h-5 rounded text-emerald-600 focus:ring-emerald-500"
                />
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">Monthly AI Budget Cap (₹ INR)</label>
                <input
                  type="number"
                  value={aiSettings.monthly_budget_cap_inr}
                  onChange={(e) => setAiSettings({ ...aiSettings, monthly_budget_cap_inr: parseFloat(e.target.value) })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono focus:ring-2 focus:ring-amber-500/20"
                />
                <p className="text-[10px] text-slate-400 mt-1">If monthly spent reaches this limit, agent automatically switches all conversations to human takeover.</p>
              </div>

              <div>
                <label className="text-xs font-bold text-slate-700 block mb-1.5">LLM Provider & Model</label>
                <input
                  type="text"
                  value={aiSettings.model_name || 'gpt-4o-mini'}
                  onChange={(e) => setAiSettings({ ...aiSettings, model_name: e.target.value })}
                  className="w-full border border-slate-200 rounded-xl px-4 py-2.5 text-xs font-mono focus:ring-2 focus:ring-amber-500/20"
                />
              </div>

              <div className="pt-3 border-t border-slate-100 flex justify-end">
                <button
                  onClick={handleSaveAISettings}
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition shadow-xs"
                >
                  Save AI Settings
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Add Lead Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add Inbound Lead">
        <form onSubmit={handleCreateLead} className="space-y-4">
          <Input label="Customer Name *" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rahul Sharma" required />
          <Input label="Mobile Number *" value={newMobile} onChange={(e) => setNewMobile(e.target.value)} placeholder="e.g. 9876543210" required />
          <Input label="Email (Optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" />
          <div className="grid grid-cols-2 gap-3">
            <Input label="Car Brand" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g. Hyundai" />
            <Input label="Car Model" value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="e.g. Creta" />
          </div>
          <Input label="Services Interested" value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="e.g. Ceramic Coating, PPF" />
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setAddModalOpen(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs">
              Cancel
            </button>
            <button type="submit" disabled={submitting} className="px-5 py-2.5 bg-blue-600 text-white rounded-xl font-bold text-xs hover:bg-blue-700">
              {submitting ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </Modal>

      {/* Add/Edit Knowledge Base Article Modal */}
      <Modal open={kbModalOpen} onClose={() => setKbModalOpen(false)} title={kbForm.id ? "Edit Knowledge Article" : "Add Knowledge Article"}>
        <form onSubmit={handleSaveKB} className="space-y-4">
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Category</label>
            <Dropdown
              value={kbForm.category}
              onChange={(e) => setKbForm({ ...kbForm, category: e.target.value })}
              className="w-full border border-slate-200 rounded-xl px-3 py-2 text-xs"
            >
              <option value="services">Services</option>
              <option value="pricing">Pricing</option>
              <option value="operating_hours">Operating Hours & Location</option>
              <option value="policies">Policies & Discounts</option>
              <option value="faqs">FAQs</option>
            </Dropdown>
          </div>
          <Input label="Article Title *" value={kbForm.title} onChange={(e) => setKbForm({ ...kbForm, title: e.target.value })} placeholder="e.g. Ceramic 9H Warranty Terms" required />
          <div>
            <label className="text-xs font-bold text-slate-700 block mb-1">Content / Facts *</label>
            <textarea
              value={kbForm.content}
              onChange={(e) => setKbForm({ ...kbForm, content: e.target.value })}
              rows={4}
              className="w-full border border-slate-200 rounded-xl p-3 text-xs"
              placeholder="Verified pricing, duration, and details the AI should rely on..."
              required
            />
          </div>
          <Input label="Search Keywords" value={kbForm.keywords} onChange={(e) => setKbForm({ ...kbForm, keywords: e.target.value })} placeholder="e.g. ceramic, 9h, glass, shine" />
          <div className="flex justify-end gap-2 pt-4">
            <button type="button" onClick={() => setKbModalOpen(false)} className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs">
              Cancel
            </button>
            <button type="submit" className="px-5 py-2.5 bg-emerald-600 text-white rounded-xl font-bold text-xs hover:bg-emerald-700">
              Save Article
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
