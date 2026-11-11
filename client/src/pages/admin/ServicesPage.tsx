import { formatDuration } from '../../utils/formatters';
import { CAR_TYPES, emptyPrices } from '../../utils/carTypes';
import { useState } from 'react';
import { Plus, Wrench, Edit2, Trash2, ToggleLeft, ToggleRight, Sparkles, ArrowUp, ArrowDown, Star, EyeOff, LayoutGrid } from 'lucide-react';
import { useServices, useCreateService, useUpdateService, useToggleService, useDeleteService, useServiceCategories, useReorder } from '../../api/hooks/useServices';
import CategoriesManager from '../../components/admin/CategoriesManager';
import { useAuthStore } from '../../store/authStore';
import { can } from '../../utils/access';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import EmptyState from '../../components/shared/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useUIStore } from '../../store/uiStore';
import { formatINR } from '../../utils/formatters';
import PicturePicker from '../../components/admin/PicturePicker';
import { ServiceArt, pictureSource, PictureSummary } from '../../components/customer/serviceVisuals';
import Dropdown from '../../components/ui/Dropdown';

const CATEGORY_LABELS = CAR_TYPES.map(t => ({ key: `price_${t.value}`, short: t.short, label: `${t.label} ₹` }));

export default function ServicesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data, isLoading } = useServices();
  const createMut = useCreateService();
  const updateMut = useUpdateService();
  const toggleMut = useToggleService();
  const deleteMut = useDeleteService();
  const reorderMut = useReorder('services');
  const user = useAuthStore(s => s.user);
  const canCreate = can(user, 'services', 'create');
  const canEdit = can(user, 'services', 'edit');
  const canDelete = can(user, 'services', 'delete');
  const { data: categories = [] } = useServiceCategories();
  const [catsOpen, setCatsOpen] = useState(false);
  const [categoryId, setCategoryId] = useState<string>('');
  const [showInApp, setShowInApp] = useState(true);
  const [featured, setFeatured] = useState(false);
  const [revisitMonths, setRevisitMonths] = useState('');
  const [revisitTimes, setRevisitTimes] = useState('1');

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [features, setFeatures] = useState('');
  const [whatsIncluded, setWhatsIncluded] = useState('');
  const [processSteps, setProcessSteps] = useState('');
  const [imageUrl, setImageUrl] = useState('');

  const [prices, setPrices] = useState<Record<string, number>>({
    ...emptyPrices(),
  });
  const [active, setActive] = useState(true);
  const [durationMinutes, setDurationMinutes] = useState(60);
  const [showDuration, setShowDuration] = useState(true);

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
    setPrices(emptyPrices());
    setActive(true); setPremium(false); setDurationMinutes(60); setShowDuration(true); setCategoryId(''); setShowInApp(true); setFeatured(false); setRevisitMonths(''); setRevisitTimes('1'); setModalOpen(true);
  };

  const openEdit = (svc: any) => {
    setEditItem(svc); setName(svc.name); setDesc(svc.description || '');
    setFeatures(formatListToStr(svc.features_json));
    setWhatsIncluded(formatListToStr(svc.whats_included_json));
    setProcessSteps(formatListToStr(svc.process_json));
    setImageUrl(svc.image_url || '');
    setPrices(Object.fromEntries(CAR_TYPES.map(t => [`price_${t.value}`, parseFloat(svc[`price_${t.value}`]) || 0])));
    setActive(!!svc.is_active); setPremium(!!svc.is_premium); setDurationMinutes(svc.duration_minutes || 60); setShowDuration(svc.show_duration !== 0);
    setCategoryId(svc.category_id ? String(svc.category_id) : ''); setShowInApp(svc.show_in_app === undefined ? true : !!svc.show_in_app); setFeatured(!!svc.is_featured); setRevisitMonths(svc.revisit_every_months ? String(svc.revisit_every_months) : ''); setRevisitTimes(String(svc.revisit_times || 1)); setModalOpen(true);
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
        category_id: categoryId ? Number(categoryId) : null,
        show_in_app: showInApp,
        is_featured: featured,
        revisit_every_months: revisitMonths === '' ? 0 : Number(revisitMonths),
        revisit_times: Number(revisitTimes) || 1,
        duration_minutes: durationMinutes,
        show_duration: showDuration
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

  const move = async (i: number, dir: -1 | 1) => {
    const ids = services.map((x: any) => x.id);
    const j = i + dir;
    if (j < 0 || j >= ids.length) return;
    [ids[i], ids[j]] = [ids[j], ids[i]];
    try { await reorderMut.mutateAsync(ids); } catch { toast('error', 'Could not save the order'); }
  };
  const quickSet = async (svc: any, patch: Record<string, any>, msg: string) => {
    try { await updateMut.mutateAsync({ id: svc.id, ...patch }); toast('success', msg); } catch (e: any) { toast('error', e?.response?.data?.error || 'Failed'); }
  };

  const handleToggle = async (id: number) => {
    try { await toggleMut.mutateAsync(id); } catch { toast('error', 'Failed to toggle'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteMut.mutateAsync(deleteId); toast('success', 'Service deleted'); }
    catch (e: any) { toast('error', e?.response?.data?.error || e?.message || 'Failed to delete'); }
    setDeleteOpen(false); setDeleteId(null);
  };

  return (
    <>
      <AdminTopBar
        title="Services"
        subtitle={`${services.length} services`}
        actions={<>{canEdit && <Button variant="secondary" onClick={() => setCatsOpen(true)} icon={<LayoutGrid size={16} />}>Categories & home</Button>}{canCreate && <Button onClick={openAdd} icon={<Plus size={16} />}>Add Service</Button>}</>}
      />

      {isLoading ? (
        <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          <SkeletonCard /><SkeletonCard /><SkeletonCard />
        </div>
      ) : services.length === 0 ? (
        <EmptyState icon={Wrench} title="No Services" description={canCreate ? 'Create your first service' : 'Services are added by head office'} actionLabel={canCreate ? '+ Add Service' : undefined} onAction={canCreate ? openAdd : undefined} />
      ) : (
        <>
        <div className="px-6 pt-4 space-y-2">
          <PictureSummary items={services} kind="services" />
          {!canEdit && <p className="text-xs rounded-xl px-3 py-2 bg-amber-50 border border-amber-200 text-amber-800">View only — your login can’t change services. The super admin can allow it under Roles & permissions → Services Catalog → Edit.</p>}
          {canEdit && <p className="text-xs text-slate-500">Customers see services in this order. Use the arrows to move one, <Star size={11} className="inline -mt-0.5" /> to feature it under “Popular services” on the home screen, and the eye to hide it from the app while staff can still bill it.</p>}
        </div>
        <div className="p-3 sm:p-6 grid gap-3 sm:gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((svc: any, idx: number) => (
            <div key={svc.id} className={`bg-white rounded-xl p-4 sm:p-5 shadow-sm border-l-4 transition-all ${svc.is_active ? 'border-[#2563EB]' : 'border-gray-300 opacity-60'}`}>
              <div className="flex flex-wrap items-start justify-between gap-y-2 mb-3">
                <div className="flex gap-3 min-w-0 flex-1 basis-full">
                  <div className="w-14 h-14 rounded-lg overflow-hidden border border-gray-100 shrink-0"><ServiceArt name={svc.name} imageUrl={svc.image_url} className="h-14" /></div>
                  <div className="min-w-0 flex-1">
                  <h3 className="font-bold text-[#0F172A] text-sm break-words">{svc.name}</h3>
                  {(() => { const p = pictureSource(svc.name, svc.image_url); return <span className={`inline-block mt-1 text-[10px] font-bold px-1.5 py-0.5 rounded ${p.cls}`}>{p.label}</span>; })()}
                  <div className="flex flex-wrap items-center gap-1.5 mt-1">
                    {svc.category_name ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-blue-50 text-blue-700 rounded">{svc.category_name}</span> : null}
                    {svc.is_featured ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-amber-50 text-amber-700 rounded">★ Featured</span> : null}
                    {svc.show_in_app === 0 ? <span className="text-[10px] font-bold px-1.5 py-0.5 bg-slate-100 text-slate-600 rounded">Staff only</span> : null}
                    {svc.is_premium ? <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded inline-block">Premium</span> : null}
                    {svc.duration_minutes ? <span className="text-[10px] font-semibold text-gray-500">⏱️ {formatDuration(svc.duration_minutes)}</span> : null}
                  </div>
                  {svc.description && <p className="text-xs text-[#64748B] mt-1 line-clamp-2">{svc.description}</p>}
                  </div>
                </div>
                {canEdit && <div className="flex items-center justify-end gap-0.5 w-full border-t border-gray-50 pt-1.5">
                  <button onClick={() => move(idx, -1)} disabled={idx === 0} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" title="Move up"><ArrowUp size={14} className="text-gray-500" /></button>
                  <button onClick={() => move(idx, 1)} disabled={idx === services.length - 1} className="p-1.5 rounded hover:bg-gray-100 disabled:opacity-30" title="Move down"><ArrowDown size={14} className="text-gray-500" /></button>
                  <button onClick={() => quickSet(svc, { is_featured: !svc.is_featured }, svc.is_featured ? 'Removed from Popular' : 'Featured on home screen')} className="p-1.5 rounded hover:bg-gray-100" title="Feature on home screen"><Star size={14} className={svc.is_featured ? 'text-amber-500 fill-amber-400' : 'text-gray-400'} /></button>
                  <button onClick={() => quickSet(svc, { show_in_app: svc.show_in_app === 0 }, svc.show_in_app === 0 ? 'Now shown in the customer app' : 'Hidden from the customer app')} className="p-1.5 rounded hover:bg-gray-100" title={svc.show_in_app === 0 ? 'Show in customer app' : 'Hide from customer app'}><EyeOff size={14} className={svc.show_in_app === 0 ? 'text-rose-500' : 'text-gray-400'} /></button>
                  <button onClick={() => handleToggle(svc.id)} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title={svc.is_active ? 'Deactivate' : 'Activate'}>
                    {svc.is_active ? <ToggleRight size={18} className="text-green-600" /> : <ToggleLeft size={18} className="text-gray-400" />}
                  </button>
                  <button onClick={() => openEdit(svc)} className="p-1.5 rounded hover:bg-gray-100 transition-colors"><Edit2 size={14} className="text-gray-400" /></button>
                  {canDelete && <button onClick={() => { setDeleteId(svc.id); setDeleteOpen(true); }} className="p-1.5 rounded hover:bg-blue-50 transition-colors"><Trash2 size={14} className="text-gray-400" /></button>}
                </div>}
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-50">
                {CATEGORY_LABELS.map(cat => (
                  <div key={cat.key} className="text-center">
                    <p className="text-[8px] font-bold uppercase tracking-widest text-[#64748B] leading-tight">{cat.short}</p>
                    <p className="text-xs font-extrabold text-[#0F172A] mt-0.5">{formatINR(svc[cat.key])}</p>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
        </>
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

          <PicturePicker name={name} description={desc} kind="service" value={imageUrl} onChange={setImageUrl} />

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

          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-[12px] font-semibold text-slate-600">Category</label>
              <button type="button" onClick={() => setCatsOpen(true)} className="text-xs font-bold text-blue-600">Manage categories</button>
            </div>
            <Dropdown value={categoryId} onChange={e => setCategoryId(e.target.value)} className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white text-sm">
              <option value="">No category</option>
              {categories.map((c: any) => <option key={c.id} value={c.id}>{c.name}{c.is_active ? '' : ' (hidden)'}</option>)}
            </Dropdown>
          </div>

          <Input label="Approx. time (minutes)" type="number" value={durationMinutes || ''} onChange={e => setDurationMinutes(parseInt(e.target.value) || 0)} placeholder="60" />
          <label className="flex items-center gap-2 text-sm text-slate-600 -mt-2">
            <input type="checkbox" checked={showDuration} onChange={e => setShowDuration(e.target.checked)} />
            Show this approx. time to customers (it never limits slot booking)
          </label>
          
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-2">Pricing by Vehicle Category</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {CATEGORY_LABELS.map(cat => (
                <Input key={cat.key} label={cat.label} type="number" value={prices[cat.key] || ''} onChange={e => updatePrice(cat.key, parseFloat(e.target.value) || 0)} />
              ))}
            </div>
          </div>
          <div className="grid sm:grid-cols-2 gap-2 pt-1">
            {[
              { on: showInApp, set: setShowInApp, title: 'Show in customer app', sub: 'Off = staff can still add it to job cards and bills' },
              { on: featured, set: setFeatured, title: 'Feature on home screen', sub: 'Listed under “Popular services”' },
            ].map(t => (
              <button key={t.title} type="button" onClick={() => t.set(!t.on)} className={`text-left rounded-xl border p-3 flex items-start gap-3 ${t.on ? 'border-blue-300 bg-blue-50/50' : 'border-slate-200 bg-white'}`}>
                <span className={`mt-0.5 w-9 h-5 rounded-full shrink-0 relative transition-colors ${t.on ? 'bg-blue-600' : 'bg-slate-300'}`}><span className={`absolute top-0.5 w-4 h-4 rounded-full bg-white shadow transition-all ${t.on ? 'left-[18px]' : 'left-0.5'}`} /></span>
                <span><span className="block text-sm font-bold text-slate-800">{t.title}</span><span className="block text-[11px] text-slate-500">{t.sub}</span></span>
              </button>
            ))}
          </div>
          {/* Repeat visits: e.g. ceramic coating → yearly check-up. Customer gets reminders 1 month / 1 week / 1 day before,
              and a draft job card is ready on the day. */}
          <div className="rounded-xl border border-slate-200 p-3">
            <p className="text-sm font-bold text-slate-800">Repeat visit</p>
            <p className="text-[11px] text-slate-500 mb-2">After this service is completed, bring the car back automatically (reminders + job card on the day). Leave empty for no repeat.</p>
            <div className="flex flex-wrap items-center gap-2 text-sm">
              <span>Every</span>
              <Dropdown value={revisitMonths} onChange={e => setRevisitMonths(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
                <option value="">No repeat</option>
                {[1, 2, 3, 4, 6, 9, 12, 18, 24].map(m => <option key={m} value={m}>{m} month{m > 1 ? 's' : ''}</option>)}
              </Dropdown>
              {revisitMonths !== '' && (<>
                <span>for</span>
                <Dropdown value={revisitTimes} onChange={e => setRevisitTimes(e.target.value)} className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white">
                  {[1, 2, 3, 4, 5, 6, 12].map(n => <option key={n} value={n}>{n} visit{n > 1 ? 's' : ''}</option>)}
                </Dropdown>
              </>)}
            </div>
          </div>
          <div className="flex items-center gap-6 pt-2">
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setActive(!active)} className={`w-10 h-5 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B]">{active ? 'Active' : 'Inactive'}</span>
            </label>
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setPremium(!premium)} className={`w-10 h-5 rounded-full transition-colors ${premium ? 'bg-amber-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${premium ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#64748B] flex items-center gap-1"><Sparkles size={12} /> {premium ? 'Premium' : 'Standard'}</span>
            </label>
          </div>
        </div>
      </Modal>

      <CategoriesManager open={catsOpen} onClose={() => setCatsOpen(false)} />

      <ConfirmDialog open={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteId(null); }} onConfirm={handleDelete}
        title="Delete Service" message="This will permanently delete the service. Continue?" confirmLabel="Delete" loading={deleteMut.isPending} />
    </>
  );
}
