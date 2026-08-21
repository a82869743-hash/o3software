import { useState } from 'react';
import { Plus, Wrench, Edit2, Trash2, ToggleLeft, ToggleRight, Sparkles } from 'lucide-react';
import { useServices, useCreateService, useUpdateService, useToggleService, useDeleteService } from '../../api/hooks/useServices';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import EmptyState from '../../components/shared/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useUIStore } from '../../store/uiStore';
import { formatINR } from '../../utils/formatters';

const CATEGORY_LABELS = [
  { key: 'price_hatchback', short: 'Hatch', label: 'Hatchback ₹' },
  { key: 'price_medium_hatchback', short: 'Med Hatch', label: 'Med Hatchback ₹' },
  { key: 'price_sedan', short: 'Sedan', label: 'Sedan ₹' },
  { key: 'price_premium_sedan', short: 'Prem Sedan', label: 'Prem Sedan ₹' },
  { key: 'price_suv', short: 'SUV', label: 'SUV ₹' },
];

export default function ServicesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data, isLoading } = useServices();
  const createMut = useCreateService();
  const updateMut = useUpdateService();
  const toggleMut = useToggleService();
  const deleteMut = useDeleteService();

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [features, setFeatures] = useState('');
  const [whatsIncluded, setWhatsIncluded] = useState('');
  const [processSteps, setProcessSteps] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [prices, setPrices] = useState<Record<string, number>>({
    price_hatchback: 0, price_medium_hatchback: 0, price_sedan: 0, price_premium_sedan: 0, price_suv: 0,
  });
  const [active, setActive] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState(60);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [premium, setPremium] = useState(false);

  const services = data?.data || [];

  const updatePrice = (key: string, val: number) => setPrices(prev => ({ ...prev, [key]: val }));

  const formatListToStr = (val: any) => {
    if (!val) return '';
    if (Array.isArray(val)) return val.join('\n');
    if (typeof val === 'string') {
      try {
        const parsed = JSON.parse(val);
        return Array.isArray(parsed) ? parsed.join('\n') : val;
      } catch {
        return val;
      }
    }
    return '';
  };

  const openAdd = () => {
    setEditItem(null); setName(''); setDesc(''); setFeatures(''); setWhatsIncluded(''); setProcessSteps(''); setImageUrl('');
    setPrices({ price_hatchback: 0, price_medium_hatchback: 0, price_sedan: 0, price_premium_sedan: 0, price_suv: 0 });
    setActive(true); setPremium(false); setDurationMinutes(60); setModalOpen(true);
  };

  const openEdit = (svc: any) => {
    setEditItem(svc); setName(svc.name); setDesc(svc.description || '');
    setFeatures(formatListToStr(svc.features_json));
    setWhatsIncluded(formatListToStr(svc.whats_included_json));
    setProcessSteps(formatListToStr(svc.process_json));
    setImageUrl(svc.image_url || '');
    setPrices({
      price_hatchback: parseFloat(svc.price_hatchback) || 0,
      price_medium_hatchback: parseFloat(svc.price_medium_hatchback) || 0,
      price_sedan: parseFloat(svc.price_sedan) || 0,
      price_premium_sedan: parseFloat(svc.price_premium_sedan) || 0,
      price_suv: parseFloat(svc.price_suv) || 0,
    });
    setActive(!!svc.is_active); setPremium(!!svc.is_premium); setDurationMinutes(svc.duration_minutes || 60); setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('error', 'Name is required'); return; }
    try {
      const payload = {
        name,
        description: desc,
        features_json: features.split('\n').map(s => s.trim()).filter(Boolean),
        whats_included_json: whatsIncluded.split('\n').map(s => s.trim()).filter(Boolean),
        process_json: processSteps.split('\n').map(s => s.trim()).filter(Boolean),
        image_url: imageUrl,
        ...prices,
        is_active: active,
        is_premium: premium,
        duration_minutes: durationMinutes
      };
      if (editItem) {
        await updateMut.mutateAsync({ id: editItem.id, ...payload });
        toast('success', 'Service updated');
      } else {
        await createMut.mutateAsync(payload);
        toast('success', 'Service created');
      }
      setModalOpen(false);
    } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed'); }
  };

  const handleToggle = async (id: number) => {
    try { await toggleMut.mutateAsync(id); } catch { toast('error', 'Failed to toggle'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteMut.mutateAsync(deleteId); toast('success', 'Service deleted'); }
    catch { toast('error', 'Failed to delete'); }
    setDeleteOpen(false); setDeleteId(null);
  };

  return (
    <>
      <AdminTopBar
        title="Services"
        subtitle={`${services.length} services`}
        actions={<Button onClick={openAdd} icon={<Plus size={16} />}>Add Service</Button>}
      />

      {isLoading ? (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : services.length === 0 ? (
        <EmptyState icon={Wrench} title="No Services" description="Create your first service" actionLabel="+ Add Service" onAction={openAdd} />
      ) : (
        <div className="p-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc: any) => (
            <div key={svc.id} className={`bg-white rounded-lg p-5 shadow-sm border-l-4 transition-all ${svc.is_active ? 'border-[#2563EB]' : 'border-gray-300 opacity-60'}`}>
              <div className="flex items-start justify-between mb-3">
                <div>
                  <h3 className="font-bold text-[#0F172A] text-sm">{svc.name}</h3>
                  <div className="flex items-center gap-2 mt-1">
                    {svc.is_premium ? <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded inline-block">Premium</span> : null}
                    {svc.duration_minutes ? <span className="text-[10px] font-semibold text-gray-500">⏱️ {svc.duration_minutes} mins</span> : null}
                  </div>
                  {svc.description && <p className="text-xs text-[#5f5e5e] mt-1 line-clamp-2">{svc.description}</p>}
                </div>
                <div className="flex items-center gap-1 shrink-0">
                  <button onClick={() => handleToggle(svc.id)} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title={svc.is_active ? 'Deactivate' : 'Activate'}>
                    {svc.is_active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} className="text-gray-400" />}
                  </button>
                  <button onClick={() => openEdit(svc)} className="p-1.5 rounded hover:bg-gray-100 transition-colors"><Edit2 size={14} className="text-gray-400" /></button>
                  <button onClick={() => { setDeleteId(svc.id); setDeleteOpen(true); }} className="p-1.5 rounded hover:bg-blue-50 transition-colors"><Trash2 size={14} className="text-gray-400" /></button>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-50">
                {CATEGORY_LABELS.map(cat => (
                  <div key={cat.key} className="text-center">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-[#5f5e5e] leading-tight">{cat.short}</p>
                    <p className="text-xs font-extrabold text-[#0F172A] mt-0.5">{formatINR(svc[cat.key])}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Service Details & Catalog' : 'Add New Service'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editItem ? 'Save Service' : 'Create Service'}</Button></>}
      >
        <div className="space-y-4 max-h-[75vh] overflow-y-auto pr-1">
          <Input label="Service Name *" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Executive Foam Wash" />
          
          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">English Overview / Description</label>
            <textarea
              value={desc}
              onChange={e => setDesc(e.target.value)}
              placeholder="Comprehensive English description of the service displayed to customers..."
              rows={3}
              className="w-full text-xs font-medium p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-[#2563EB]"
            />
          </div>

          <Input label="Banner / Icon Image URL" value={imageUrl} onChange={e => setImageUrl(e.target.value)} placeholder="https://example.com/wash-banner.jpg" />

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">Key Features & Highlights (1 item per line)</label>
            <textarea
              value={features}
              onChange={e => setFeatures(e.target.value)}
              placeholder="High pressure snow foam wash&#10;pH neutral shampoo wash&#10;Microfiber hand dry"
              rows={3}
              className="w-full text-xs font-medium p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-amber-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">What's Included (1 item per line)</label>
            <textarea
              value={whatsIncluded}
              onChange={e => setWhatsIncluded(e.target.value)}
              placeholder="Underbody pressure wash&#10;Dashboard cleaning & polish&#10;Tyre dressing"
              rows={3}
              className="w-full text-xs font-medium p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-blue-500"
            />
          </div>

          <div>
            <label className="text-xs font-bold text-[#0F172A] block mb-1">Process Steps (1 step per line)</label>
            <textarea
              value={processSteps}
              onChange={e => setProcessSteps(e.target.value)}
              placeholder="1. High pressure body rinse&#10;2. Snow foam application & soak&#10;3. Dual bucket microfiber wash&#10;4. Air dry & final inspection"
              rows={3}
              className="w-full text-xs font-medium p-3 bg-gray-50 border border-gray-200 rounded-xl focus:ring-2 focus:ring-purple-500"
            />
          </div>

          <Input label="Duration (Minutes) *" type="number" value={durationMinutes || ''} onChange={e => setDurationMinutes(parseInt(e.target.value) || 0)} placeholder="60" />
          
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">Pricing by Vehicle Category</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORY_LABELS.map(cat => (
                <Input key={cat.key} label={cat.label} type="number" value={prices[cat.key] || ''} onChange={e => updatePrice(cat.key, parseFloat(e.target.value) || 0)} />
              ))}
            </div>
          </div>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setActive(!active)} className={`w-10 h-5 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">{active ? 'Active' : 'Inactive'}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setPremium(!premium)} className={`w-10 h-5 rounded-full transition-colors ${premium ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${premium ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e] flex items-center gap-1"><Sparkles size={12} /> {premium ? 'Premium' : 'Standard'}</span>
            </label>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteId(null); }} onConfirm={handleDelete}
        title="Delete Service" message="This will permanently delete the service. Continue?" confirmLabel="Delete" loading={deleteMut.isPending} />
    </>
  );
}
