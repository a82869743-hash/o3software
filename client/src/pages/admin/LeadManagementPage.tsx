import { useState, useEffect } from 'react';
import { Users, Phone, Mail, Car, MessageCircle, ArrowRight, Search, Plus, Filter } from 'lucide-react';
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip, Legend } from 'recharts';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';

interface Inquiry {
  id: number;
  source: 'facebook' | 'instagram' | 'walk_in' | 'website' | 'staff' | string;
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
  other: '#64748B',
};

const SOURCE_LABELS: Record<string, string> = {
  facebook: 'Facebook Ads',
  instagram: 'Instagram Ads',
  walk_in: 'Walk-In',
  website: 'Website Intake',
  staff: 'Staff Lead',
  other: 'Other Sources',
};

// Social Icons SVGs
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
    default: return <Users className="w-4 h-4" />;
  }
};

export default function LeadManagementPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);

  const [leads, setLeads] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');
  const [addModalOpen, setAddModalOpen] = useState(false);

  // New Lead Form
  const [newName, setNewName] = useState('');
  const [newMobile, setNewMobile] = useState('');
  const [newEmail, setNewEmail] = useState('');
  const [newBrand, setNewBrand] = useState('');
  const [newModel, setNewModel] = useState('');
  const [newService, setNewService] = useState('');
  const [newSource, setNewSource] = useState('facebook');
  const [submitting, setSubmitting] = useState(false);

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
      toast('error', 'Failed to load lead management data');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchLeads(); }, []);

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
      const res = await api.post(`/inquiries/${leadId}/convert`, { lead_source: undefined });
      toast('success', 'Inquiry converted to Lead');
      navigate('/admin/job-carts/new', { state: { prefill: res.data.data } });
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to convert lead');
    }
  };

  const filteredLeads = leads.filter((l) => {
    const q = search.toLowerCase();
    const matchSearch = !q || l.name?.toLowerCase().includes(q) || l.mobile?.includes(q) || l.vehicle_brand?.toLowerCase().includes(q) || l.vehicle_model?.toLowerCase().includes(q);
    const matchSource = selectedSource === 'all' || l.source === selectedSource;
    return matchSearch && matchSource;
  });

  // Prepare chart data
  const pieData = stats?.by_source?.map((item: any) => ({
    name: SOURCE_LABELS[item.source] || item.source,
    value: parseInt(item.total, 10),
    sourceKey: item.source,
  })) || [];

  return (
    <>
      <AdminTopBar
        title="Lead Management"
        subtitle="Track & convert incoming leads from Meta Ads, Walk-ins & Web"
        actions={
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] text-white rounded-xl font-bold text-xs hover:bg-blue-700 transition-colors shadow-sm"
          >
            <Plus size={16} /> Add New Lead
          </button>
        }
      />

      {/* Top Source Stats & Pie Chart */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 mb-6">
        {/* Source Cards */}
        <div className="lg:col-span-2 grid grid-cols-2 sm:grid-cols-3 gap-4">
          {[
            { key: 'facebook', label: 'Facebook Ads', icon: FacebookIcon, bg: 'bg-blue-50 border-blue-200 text-blue-700' },
            { key: 'instagram', label: 'Instagram Ads', icon: InstagramIcon, bg: 'bg-pink-50 border-pink-200 text-pink-700' },
            { key: 'walk_in', label: 'Walk-In Customer', icon: Users, bg: 'bg-emerald-50 border-emerald-200 text-emerald-700' },
            { key: 'website', label: 'Website Intake', icon: Mail, bg: 'bg-indigo-50 border-indigo-200 text-indigo-700' },
            { key: 'staff', label: 'Staff Created', icon: Users, bg: 'bg-purple-50 border-purple-200 text-purple-700' },
          ].map((s) => {
            const count = stats?.by_source?.find((b: any) => b.source === s.key)?.total || 0;
            const Icon = s.icon;
            return (
              <div
                key={s.key}
                onClick={() => setSelectedSource(selectedSource === s.key ? 'all' : s.key)}
                className={`p-4 rounded-2xl border transition-all cursor-pointer ${s.bg} ${
                  selectedSource === s.key ? 'ring-2 ring-offset-2 ring-blue-500 scale-[1.02]' : 'hover:shadow-sm'
                }`}
              >
                <div className="flex items-center justify-between mb-2">
                  <div className="p-2 rounded-xl bg-white shadow-xs">
                    <Icon />
                  </div>
                  <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/80">
                    Source
                  </span>
                </div>
                <p className="text-2xl font-black">{count}</p>
                <p className="text-xs font-bold mt-1 opacity-90">{s.label}</p>
              </div>
            );
          })}
        </div>

        {/* Recharts Pie Chart */}
        <div className="bg-white border border-slate-200 rounded-3xl p-5 shadow-sm flex flex-col justify-between">
          <h3 className="font-extrabold text-slate-900 text-sm mb-2">Lead Source Distribution</h3>
          {pieData.length > 0 ? (
            <div className="h-44 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={45}
                    outerRadius={70}
                    paddingAngle={3}
                    dataKey="value"
                  >
                    {pieData.map((entry: any, index: number) => (
                      <Cell key={`cell-${index}`} fill={SOURCE_COLORS[entry.sourceKey] || '#64748B'} />
                    ))}
                  </Pie>
                  <Tooltip formatter={(val) => [`${val} Leads`, 'Count']} />
                  <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="h-44 flex items-center justify-center text-slate-400 text-xs font-medium">
              No lead distribution data yet
            </div>
          )}
        </div>
      </div>

      {/* Filter Tabs & Search */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          <button
            onClick={() => setSelectedSource('all')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all ${
              selectedSource === 'all' ? 'bg-[#2563EB] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Leads ({leads.length})
          </button>
          {['facebook', 'instagram', 'walk_in', 'website'].map((src) => (
            <button
              key={src}
              onClick={() => setSelectedSource(src)}
              className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all ${
                selectedSource === src ? 'bg-[#2563EB] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {getSourceIcon(src)}
              {SOURCE_LABELS[src]}
            </button>
          ))}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search leads..."
            className="w-full pl-9 pr-4 py-2 bg-[#f6f3f2] border border-transparent rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      {/* Lead Cards List */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : filteredLeads.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <Users size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-bold text-slate-600">No leads found</p>
          <p className="text-xs text-slate-400 mt-1">Try selecting another filter or create a new lead</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {filteredLeads.map((lead) => (
            <div
              key={lead.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 hover:border-blue-300 hover:shadow-md transition-all flex flex-col justify-between"
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <span
                    className="inline-flex items-center gap-1.5 text-[10px] font-extrabold px-2.5 py-1 rounded-full uppercase tracking-wider text-white"
                    style={{ backgroundColor: SOURCE_COLORS[lead.source] || '#64748B' }}
                  >
                    {getSourceIcon(lead.source)}
                    {SOURCE_LABELS[lead.source] || lead.source}
                  </span>
                  <span className={`text-[10px] font-extrabold px-2 py-0.5 rounded-md uppercase ${
                    lead.status === 'converted' ? 'bg-emerald-100 text-emerald-700' : 'bg-amber-100 text-amber-700'
                  }`}>
                    {lead.status}
                  </span>
                </div>

                <h3 className="font-black text-slate-900 text-base">{lead.name}</h3>
                <div className="space-y-1.5 mt-2">
                  <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                    <Phone size={13} className="text-slate-400" /> {lead.mobile}
                  </p>
                  {(lead.vehicle_brand || lead.vehicle_model) && (
                    <p className="flex items-center gap-2 text-xs font-semibold text-slate-600">
                      <Car size={13} className="text-slate-400" /> {lead.vehicle_brand} {lead.vehicle_model}
                    </p>
                  )}
                  {lead.services_interested && (
                    <p className="text-xs text-slate-500 bg-slate-50 p-2 rounded-xl border border-slate-100 mt-2">
                      Interested in: <strong className="text-slate-800">{lead.services_interested}</strong>
                    </p>
                  )}
                </div>
              </div>

              <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
                <a
                  href={`https://wa.me/91${lead.mobile}?text=${encodeURIComponent(`Hi ${lead.name}, thank you for reaching out to O3 Car Spa! How can we assist you today?`)}`}
                  target="_blank"
                  rel="noreferrer"
                  className="flex items-center gap-1 text-xs font-bold text-emerald-600 hover:text-emerald-700"
                >
                  <MessageCircle size={14} /> WhatsApp
                </a>
                {lead.status !== 'converted' ? (
                  <button
                    onClick={() => handleConvertLead(lead.id)}
                    className="flex items-center gap-1.5 px-3 py-1.5 bg-[#2563EB] text-white rounded-xl text-xs font-bold hover:bg-blue-700 transition-colors shadow-xs"
                  >
                    Convert to Job Card <ArrowRight size={12} />
                  </button>
                ) : (
                  <span className="text-xs font-bold text-emerald-600 flex items-center gap-1">
                    ✓ Converted
                  </span>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add Lead Modal */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Lead">
        <form onSubmit={handleCreateLead} className="space-y-4 pt-2">
          <Input label="Customer Name *" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="e.g. Rahul Sharma" required />
          <Input label="Mobile Number *" value={newMobile} onChange={(e) => setNewMobile(e.target.value)} placeholder="10-digit phone number" required />
          <Input label="Email (Optional)" value={newEmail} onChange={(e) => setNewEmail(e.target.value)} placeholder="name@example.com" />
          
          <div className="grid grid-cols-2 gap-3">
            <Input label="Car Brand" value={newBrand} onChange={(e) => setNewBrand(e.target.value)} placeholder="e.g. Hyundai" />
            <Input label="Car Model" value={newModel} onChange={(e) => setNewModel(e.target.value)} placeholder="e.g. Creta" />
          </div>

          <Input label="Services Interested" value={newService} onChange={(e) => setNewService(e.target.value)} placeholder="e.g. Ceramic Coating, Full Detailing" />

          <div>
            <label className="block text-[10px] font-extrabold uppercase tracking-widest text-slate-500 mb-2">
              Lead Source *
            </label>
            <select
              value={newSource}
              onChange={(e) => setNewSource(e.target.value)}
              className="w-full px-4 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-slate-900 font-medium text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white"
            >
              <option value="facebook">Meta Ads - Facebook</option>
              <option value="instagram">Meta Ads - Instagram</option>
              <option value="walk_in">Walk-In Customer</option>
              <option value="website">Website Inquiry</option>
              <option value="staff">Staff Reference</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-600 rounded-xl font-bold text-xs hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-[#2563EB] text-white rounded-xl font-bold text-xs hover:bg-blue-700 disabled:opacity-50"
            >
              {submitting ? 'Creating...' : 'Create Lead'}
            </button>
          </div>
        </form>
      </Modal>
    </>
  );
}
