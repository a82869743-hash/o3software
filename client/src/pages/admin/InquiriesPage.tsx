import { useState, useEffect } from 'react';
import { HelpCircle, Phone, Mail, Car, MessageCircle, ArrowRight, Plus, Search, Filter, Share2, Users, Globe, Smartphone } from 'lucide-react';
import AdminTopBar from '../../components/layout/AdminTopBar';
import { useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';

interface Inquiry {
  id: number;
  source: string;
  name: string;
  mobile: string;
  email?: string;
  vehicle_brand?: string;
  vehicle_model?: string;
  services_interested?: string;
  status: 'new' | 'followed_up' | 'converted' | 'cancelled' | string;
  created_at: string;
}

const SOURCE_CONFIG: Record<string, { label: string; bg: string; text: string; border: string; badgeBg: string; icon: string }> = {
  instagram: {
    label: 'Instagram Ads',
    bg: 'bg-gradient-to-r from-pink-50 via-purple-50 to-pink-50',
    text: 'text-pink-700',
    border: 'border-pink-200',
    badgeBg: 'bg-gradient-to-r from-pink-500 to-purple-600 text-white',
    icon: '📸'
  },
  facebook: {
    label: 'Facebook Ads',
    bg: 'bg-blue-50/80',
    text: 'text-blue-700',
    border: 'border-blue-200',
    badgeBg: 'bg-blue-600 text-white',
    icon: '📘'
  },
  website: {
    label: 'Website Intake',
    bg: 'bg-indigo-50/80',
    text: 'text-indigo-700',
    border: 'border-indigo-200',
    badgeBg: 'bg-indigo-600 text-white',
    icon: '🌐'
  },
  walk_in: {
    label: 'Walk-In Customer',
    bg: 'bg-emerald-50/80',
    text: 'text-emerald-700',
    border: 'border-emerald-200',
    badgeBg: 'bg-emerald-600 text-white',
    icon: '🚶'
  },
  staff: {
    label: 'Staff Reference',
    bg: 'bg-purple-50/80',
    text: 'text-purple-700',
    border: 'border-purple-200',
    badgeBg: 'bg-purple-600 text-white',
    icon: '👤'
  },
  manual_intake: {
    label: 'Phone / Manual Inquiry',
    bg: 'bg-amber-50/80',
    text: 'text-amber-700',
    border: 'border-amber-200',
    badgeBg: 'bg-amber-600 text-white',
    icon: '📞'
  }
};

export default function InquiriesPage() {
  const navigate = useNavigate();
  const toast = useUIStore((s) => s.toast);

  const [inquiries, setInquiries] = useState<Inquiry[]>([]);
  const [stats, setStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [selectedSource, setSelectedSource] = useState<string>('all');

  // Convert Modal State
  const [convertModalOpen, setConvertModalOpen] = useState(false);
  const [selectedInquiry, setSelectedInquiry] = useState<Inquiry | null>(null);
  const [convertSource, setConvertSource] = useState('instagram');
  const [converting, setConverting] = useState(false);

  // Add Manual Inquiry Modal State
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [addForm, setAddForm] = useState({
    name: '',
    mobile: '',
    email: '',
    vehicle_brand: '',
    vehicle_model: '',
    services_interested: 'Full Body Ceramic Coating 9H',
    source: 'instagram'
  });
  const [adding, setAdding] = useState(false);

  const fetchInquiries = async () => {
    setLoading(true);
    try {
      const [listRes, statsRes] = await Promise.all([
        api.get('/inquiries'),
        api.get('/inquiries/stats')
      ]);
      setInquiries(listRes.data.data || []);
      setStats(statsRes.data.data || null);
    } catch {
      toast('error', 'Failed to load inquiries');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchInquiries(); }, []);

  const handleCreateInquiry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!addForm.name || !addForm.mobile) {
      toast('error', 'Name and mobile number are required');
      return;
    }
    setAdding(true);
    try {
      await api.post('/inquiries', addForm);
      toast('success', 'New inquiry created successfully!');
      setAddModalOpen(false);
      setAddForm({
        name: '',
        mobile: '',
        email: '',
        vehicle_brand: '',
        vehicle_model: '',
        services_interested: 'Full Body Ceramic Coating 9H',
        source: 'instagram'
      });
      fetchInquiries();
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to add inquiry');
    } finally {
      setAdding(false);
    }
  };

  const openConvertModal = (inquiry: Inquiry) => {
    setSelectedInquiry(inquiry);
    setConvertSource(inquiry.source || 'instagram');
    setConvertModalOpen(true);
  };

  const handleConfirmConvert = async () => {
    if (!selectedInquiry) return;
    setConverting(true);
    try {
      const res = await api.post(`/inquiries/${selectedInquiry.id}/convert`, { lead_source: convertSource });
      toast('success', 'Inquiry converted to Lead!');
      setConvertModalOpen(false);
      navigate('/admin/job-carts/new', { state: { prefill: res.data.data } });
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to convert inquiry');
    } finally {
      setConverting(false);
    }
  };

  const handleStatusChange = async (id: number, status: string) => {
    try {
      await api.patch(`/inquiries/${id}/status`, { status });
      toast('success', 'Inquiry status updated');
      fetchInquiries();
    } catch {
      toast('error', 'Failed to update status');
    }
  };

  const filteredInquiries = inquiries.filter((i) => {
    const q = search.toLowerCase();
    const matchSearch = !q || i.name?.toLowerCase().includes(q) || i.mobile?.includes(q) || i.vehicle_brand?.toLowerCase().includes(q) || i.vehicle_model?.toLowerCase().includes(q);
    const matchSource = selectedSource === 'all' || i.source === selectedSource;
    return matchSearch && matchSource;
  });

  // Group inquiries by source for subsection display
  const sourcesPresent = Array.from(new Set(inquiries.map(i => i.source || 'website')));

  return (
    <>
      <AdminTopBar
        title="Customer Inquiries & Intake Subsections"
        subtitle="Track incoming leads categorized by origin (Instagram, Facebook, Website, Walk-Ins)"
        actions={
          <button
            onClick={() => setAddModalOpen(true)}
            className="flex items-center gap-2 px-4 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white rounded-xl font-extrabold text-xs transition-all shadow-sm"
          >
            <Plus size={16} /> Add New Inquiry
          </button>
        }
      />

      {/* ── Subsections Summary KPI Cards ──────────────── */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3 mb-6">
        {[
          { key: 'instagram', label: 'Instagram Ads', icon: '📸', color: 'border-pink-200 bg-pink-50/70 text-pink-900' },
          { key: 'facebook', label: 'Facebook Ads', icon: '📘', color: 'border-blue-200 bg-blue-50/70 text-blue-900' },
          { key: 'website', label: 'Website Intake', icon: '🌐', color: 'border-indigo-200 bg-indigo-50/70 text-indigo-900' },
          { key: 'walk_in', label: 'Walk-In Customer', icon: '🚶', color: 'border-emerald-200 bg-emerald-50/70 text-emerald-900' },
          { key: 'staff', label: 'Staff Reference', icon: '👤', color: 'border-purple-200 bg-purple-50/70 text-purple-900' },
          { key: 'manual_intake', label: 'Phone / Manual', icon: '📞', color: 'border-amber-200 bg-amber-50/70 text-amber-900' },
        ].map((s) => {
          const count = inquiries.filter(i => (i.source || 'website') === s.key).length;
          const isSelected = selectedSource === s.key;
          return (
            <div
              key={s.key}
              onClick={() => setSelectedSource(isSelected ? 'all' : s.key)}
              className={`p-3.5 rounded-2xl border transition-all cursor-pointer ${s.color} ${
                isSelected ? 'ring-2 ring-offset-2 ring-blue-500 scale-[1.02] shadow-sm' : 'hover:border-slate-300'
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <span className="text-base">{s.icon}</span>
                <span className="text-[10px] font-black uppercase px-2 py-0.5 rounded-full bg-white/90">
                  {count}
                </span>
              </div>
              <p className="text-lg font-black">{count}</p>
              <p className="text-[11px] font-extrabold truncate">{s.label}</p>
            </div>
          );
        })}
      </div>

      {/* ── Subsections Tab Bar & Search ──────────────── */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 mb-6">
        <div className="flex items-center gap-2 overflow-x-auto w-full sm:w-auto pb-2 sm:pb-0">
          <button
            onClick={() => setSelectedSource('all')}
            className={`px-4 py-2 rounded-xl text-xs font-extrabold transition-all whitespace-nowrap ${
              selectedSource === 'all' ? 'bg-[#2563EB] text-white shadow-md' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            All Subsections ({inquiries.length})
          </button>
          {['instagram', 'facebook', 'website', 'walk_in', 'staff', 'manual_intake'].map((srcKey) => {
            const count = inquiries.filter(i => (i.source || 'website') === srcKey).length;
            const cfg = SOURCE_CONFIG[srcKey] || SOURCE_CONFIG.website;
            return (
              <button
                key={srcKey}
                onClick={() => setSelectedSource(srcKey)}
                className={`px-3.5 py-2 rounded-xl text-xs font-extrabold flex items-center gap-1.5 transition-all whitespace-nowrap ${
                  selectedSource === srcKey
                    ? 'bg-[#2563EB] text-white shadow-md'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                <span>{cfg.icon}</span>
                <span>{cfg.label}</span>
                <span className="px-1.5 py-0.2 bg-white/30 rounded-full text-[10px] font-bold">
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        <div className="relative w-full sm:w-72">
          <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by customer name or phone..."
            className="w-full pl-9 pr-4 py-2 bg-[#f6f3f2] border border-transparent rounded-xl text-sm font-medium text-slate-900 focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white placeholder:text-slate-400 transition-all"
          />
        </div>
      </div>

      {/* ── Subsections Inquiries Display Grid ──────────────── */}
      {loading ? (
        <div className="space-y-3">
          {[1, 2, 3].map(i => <div key={i} className="h-28 bg-slate-100 animate-pulse rounded-2xl" />)}
        </div>
      ) : filteredInquiries.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-12 text-center">
          <HelpCircle size={40} className="text-slate-300 mx-auto mb-3" />
          <p className="font-bold text-slate-600">No inquiries found in this subsection</p>
          <p className="text-xs text-slate-400 mt-1">Select another subsection tab or add a new inquiry above</p>
        </div>
      ) : selectedSource !== 'all' ? (
        /* Single Selected Subsection View */
        <div className="space-y-3">
          <div className="flex items-center gap-2 mb-3">
            <span className="text-xl">{(SOURCE_CONFIG[selectedSource] || SOURCE_CONFIG.website).icon}</span>
            <h3 className="font-black text-slate-900 text-base uppercase tracking-tight">
              {(SOURCE_CONFIG[selectedSource] || SOURCE_CONFIG.website).label} Subsection
            </h3>
            <span className="px-2.5 py-0.5 bg-blue-100 text-[#2563EB] text-xs font-black rounded-full">
              {filteredInquiries.length} Inquiries
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {filteredInquiries.map((inquiry) => (
              <InquiryCard key={inquiry.id} inquiry={inquiry} onStatusChange={handleStatusChange} onConvert={openConvertModal} />
            ))}
          </div>
        </div>
      ) : (
        /* Grouped Subsections View (Shows all inquiries categorized by source headers) */
        <div className="space-y-8">
          {sourcesPresent.map((srcKey) => {
            const subInquiries = filteredInquiries.filter(i => (i.source || 'website') === srcKey);
            if (subInquiries.length === 0) return null;
            const cfg = SOURCE_CONFIG[srcKey] || SOURCE_CONFIG.website;
            return (
              <section key={srcKey} className="space-y-4">
                <div className={`p-3 rounded-2xl border flex items-center justify-between ${cfg.bg} ${cfg.border}`}>
                  <div className="flex items-center gap-2.5">
                    <span className="text-xl">{cfg.icon}</span>
                    <div>
                      <h3 className={`font-black text-sm uppercase tracking-wider ${cfg.text}`}>
                        {cfg.label} Subsection
                      </h3>
                      <p className="text-xs text-slate-500 font-medium">
                        Incoming leads originating from {cfg.label}
                      </p>
                    </div>
                  </div>
                  <span className={`px-3 py-1 rounded-full text-xs font-black ${cfg.badgeBg}`}>
                    {subInquiries.length} Total Inquiries
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {subInquiries.map((inquiry) => (
                    <InquiryCard key={inquiry.id} inquiry={inquiry} onStatusChange={handleStatusChange} onConvert={openConvertModal} />
                  ))}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {/* ── Modal: Add Manual Inquiry with Source Selector ────────── */}
      <Modal open={addModalOpen} onClose={() => setAddModalOpen(false)} title="Add New Inquiry">
        <form onSubmit={handleCreateInquiry} className="space-y-4 pt-2">
          <Input
            label="Customer Name *"
            value={addForm.name}
            onChange={(e) => setAddForm(p => ({ ...p, name: e.target.value }))}
            placeholder="e.g. Vikram Patel"
            required
          />
          <Input
            label="Mobile Number *"
            value={addForm.mobile}
            onChange={(e) => setAddForm(p => ({ ...p, mobile: e.target.value }))}
            placeholder="10-digit phone number"
            required
          />
          <Input
            label="Email Address (Optional)"
            value={addForm.email}
            onChange={(e) => setAddForm(p => ({ ...p, email: e.target.value }))}
            placeholder="name@example.com"
          />

          <div className="grid grid-cols-2 gap-3">
            <Input
              label="Car Brand"
              value={addForm.vehicle_brand}
              onChange={(e) => setAddForm(p => ({ ...p, vehicle_brand: e.target.value }))}
              placeholder="e.g. Mercedes-Benz"
            />
            <Input
              label="Car Model"
              value={addForm.vehicle_model}
              onChange={(e) => setAddForm(p => ({ ...p, vehicle_model: e.target.value }))}
              placeholder="e.g. C-Class"
            />
          </div>

          <Input
            label="Services Interested In"
            value={addForm.services_interested}
            onChange={(e) => setAddForm(p => ({ ...p, services_interested: e.target.value }))}
            placeholder="e.g. Ceramic Coating 9H, PPF"
          />

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Inquiry Origin / Source Subsection *
            </label>
            <select
              value={addForm.source}
              onChange={(e) => setAddForm(p => ({ ...p, source: e.target.value }))}
              className="w-full px-4 py-3 bg-[#f6f3f2] border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white"
            >
              <option value="instagram">📸 Instagram Ads / DM</option>
              <option value="facebook">📘 Facebook Ads / Message</option>
              <option value="website">🌐 Website Intake Form</option>
              <option value="walk_in">🚶 Walk-In Customer</option>
              <option value="staff">👤 Staff Reference</option>
              <option value="manual_intake">📞 Phone Call / Manual</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={() => setAddModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={adding}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs disabled:opacity-50"
            >
              {adding ? 'Submitting...' : 'Save & Categorize Inquiry'}
            </button>
          </div>
        </form>
      </Modal>

      {/* ── Modal: Convert Inquiry to Lead ──────────────── */}
      <Modal open={convertModalOpen} onClose={() => setConvertModalOpen(false)} title="Convert Inquiry to Official Lead">
        <div className="space-y-4 pt-2">
          <p className="text-xs text-slate-600">
            Converting <strong>{selectedInquiry?.name}</strong> to an official lead for job cart creation. Confirm the source subsection:
          </p>

          <div>
            <label className="block text-[11px] font-black uppercase tracking-wider text-slate-700 mb-1.5">
              Confirm Source Subsection
            </label>
            <select
              value={convertSource}
              onChange={(e) => setConvertSource(e.target.value)}
              className="w-full px-4 py-3 bg-[#f6f3f2] border border-slate-300 rounded-xl text-slate-900 font-bold text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white"
            >
              <option value="instagram">📸 Instagram Ads / DM</option>
              <option value="facebook">📘 Facebook Ads / Message</option>
              <option value="website">🌐 Website Intake Form</option>
              <option value="walk_in">🚶 Walk-In Customer</option>
              <option value="staff">👤 Staff Reference</option>
              <option value="manual_intake">📞 Phone Call / Manual</option>
            </select>
          </div>

          <div className="flex justify-end gap-2 pt-4 border-t border-slate-100">
            <button
              onClick={() => setConvertModalOpen(false)}
              className="px-4 py-2.5 bg-slate-100 text-slate-700 font-extrabold text-xs rounded-xl hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmConvert}
              disabled={converting}
              className="px-5 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white font-extrabold text-xs rounded-xl shadow-xs disabled:opacity-50"
            >
              {converting ? 'Converting...' : 'Proceed to Job Card'}
            </button>
          </div>
        </div>
      </Modal>
    </>
  );
}

// ── Component: Inquiry Card with Subsection Badges ──────────
function InquiryCard({ inquiry, onStatusChange, onConvert }: { inquiry: Inquiry; onStatusChange: (id: number, s: string) => void; onConvert: (i: Inquiry) => void }) {
  const cfg = SOURCE_CONFIG[inquiry.source || 'website'] || SOURCE_CONFIG.website;
  return (
    <div className="bg-white border border-slate-200 rounded-2xl p-5 hover:shadow-md transition-all flex flex-col justify-between group hover:border-blue-300">
      <div>
        <div className="flex items-center justify-between mb-3">
          <span className={`inline-flex items-center gap-1 text-[10px] font-black uppercase px-2.5 py-1 rounded-full ${cfg.badgeBg}`}>
            <span>{cfg.icon}</span>
            <span>{cfg.label}</span>
          </span>
          <select
            value={inquiry.status}
            onChange={(e) => onStatusChange(inquiry.id, e.target.value)}
            className="text-[10px] font-extrabold px-2 py-0.5 rounded-lg border border-slate-300 bg-white text-slate-800 shadow-xs focus:ring-2 focus:ring-blue-500/20"
          >
            <option value="new">New</option>
            <option value="followed_up">Followed Up</option>
            <option value="converted">Converted</option>
            <option value="cancelled">Cancelled</option>
          </select>
        </div>

        <h3 className="font-black text-slate-900 text-base group-hover:text-[#2563EB] transition-colors">{inquiry.name}</h3>
        <div className="space-y-1.5 mt-2 text-xs text-slate-600">
          <p className="flex items-center gap-1.5 font-bold"><Phone size={13} className="text-slate-400" /> {inquiry.mobile}</p>
          {(inquiry.vehicle_brand || inquiry.vehicle_model) && (
            <p className="flex items-center gap-1.5 font-medium"><Car size={13} className="text-slate-400" /> {inquiry.vehicle_brand} {inquiry.vehicle_model}</p>
          )}
          {inquiry.services_interested && (
            <p className="text-xs text-slate-700 bg-slate-50 p-2.5 rounded-xl border border-slate-100 mt-2 font-medium">
              Interested in: <strong className="text-slate-900">{inquiry.services_interested}</strong>
            </p>
          )}
        </div>
      </div>

      <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
        <a
          href={`https://wa.me/91${inquiry.mobile}?text=${encodeURIComponent(`Hi ${inquiry.name}, thank you for inquiring with O3 Car Spa regarding ${inquiry.services_interested || 'detailing services'}!`)}`}
          target="_blank"
          rel="noreferrer"
          className="flex items-center gap-1 text-xs font-extrabold text-emerald-600 hover:text-emerald-700"
        >
          <MessageCircle size={15} /> WhatsApp
        </a>
        {inquiry.status !== 'converted' ? (
          <button
            onClick={() => onConvert(inquiry)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 bg-[#2563EB] text-white rounded-xl text-xs font-extrabold hover:bg-blue-700 transition-colors shadow-2xs"
          >
            Convert Lead <ArrowRight size={13} />
          </button>
        ) : (
          <span className="text-xs font-extrabold text-emerald-600 bg-emerald-50 px-2.5 py-1 rounded-lg">
            ✓ Converted
          </span>
        )}
      </div>
    </div>
  );
}
