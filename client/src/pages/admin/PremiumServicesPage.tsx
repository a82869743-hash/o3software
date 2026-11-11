import { CAR_TYPES } from '../../utils/carTypes';
import { useState } from 'react';
import { Sparkles, Plus, Edit2, Trash2, Clock, DollarSign, ChevronDown, ChevronUp, ToggleLeft, ToggleRight } from 'lucide-react';
import { usePremiumServices, useServiceAddons, useCreateAddon, useUpdateAddon, useDeleteAddon } from '../../api/hooks/usePremiumServices';
import { useUpdateService, useDeleteService } from '../../api/hooks/useServices';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import EmptyState from '../../components/shared/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useUIStore } from '../../store/uiStore';
import { formatINR } from '../../utils/formatters';

const CATEGORY_LABELS = CAR_TYPES.map(t => ({ key: `price_${t.value}`, short: t.short, label: `${t.label} ₹` }));

export default function PremiumServicesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data: services, isLoading } = usePremiumServices();
  const updateSvc = useUpdateService();
  const deleteSvcMut = useDeleteService();
  const createAddonMut = useCreateAddon();
  const updateAddonMut = useUpdateAddon();
  const deleteAddonMut = useDeleteAddon();

  // Expanded service (to show addons)
  const [expandedId, setExpandedId] = useState<number | null>(null);

  // Addon modal state
  const [addonModalOpen, setAddonModalOpen] = useState(false);
  const [addonServiceId, setAddonServiceId] = useState<number | null>(null);
  const [editAddon, setEditAddon] = useState<any>(null);
  const [addonName, setAddonName] = useState('');
  const [addonPrice, setAddonPrice] = useState(0);
  const [addonDuration, setAddonDuration] = useState(30);

  // Service edit modal
  const [svcModalOpen, setSvcModalOpen] = useState(false);
  const [editSvc, setEditSvc] = useState<any>(null);
  const [svcPrices, setSvcPrices] = useState<Record<string, number>>({});
  const [svcDuration, setSvcDuration] = useState(60);
  const [svcDesc, setSvcDesc] = useState('');

  // Delete service confirm
  const [deleteSvcData, setDeleteSvcData] = useState<{ id: number; name: string } | null>(null);

  // Delete addon confirm
  const [deleteAddonData, setDeleteAddonData] = useState<{ serviceId: number; addonId: number } | null>(null);

  // Addon handlers
  const openAddAddon = (serviceId: number) => {
    setAddonServiceId(serviceId);
    setEditAddon(null);
    setAddonName('');
    setAddonPrice(0);
    setAddonDuration(30);
    setAddonModalOpen(true);
  };

  const openEditAddon = (serviceId: number, addon: any) => {
    setAddonServiceId(serviceId);
    setEditAddon(addon);
    setAddonName(addon.addon_name);
    setAddonPrice(parseFloat(addon.addon_price) || 0);
    setAddonDuration(addon.duration_minutes || 30);
    setAddonModalOpen(true);
  };

  const handleSaveAddon = async () => {
    if (!addonName.trim() || !addonServiceId) { toast('error', 'Add-on name is required'); return; }
    try {
      if (editAddon) {
        await updateAddonMut.mutateAsync({ serviceId: addonServiceId, addonId: editAddon.id, addon_name: addonName, addon_price: addonPrice, duration_minutes: addonDuration });
        toast('success', 'Add-on updated');
      } else {
        await createAddonMut.mutateAsync({ serviceId: addonServiceId, addon_name: addonName, addon_price: addonPrice, duration_minutes: addonDuration });
        toast('success', 'Add-on created');
      }
      setAddonModalOpen(false);
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed');
    }
  };

  const handleDeleteAddon = async () => {
    if (!deleteAddonData) return;
    try {
      await deleteAddonMut.mutateAsync(deleteAddonData);
      toast('success', 'Add-on deleted');
    } catch { toast('error', 'Failed to delete add-on'); }
    setDeleteAddonData(null);
  };

  const handleDeleteService = async () => {
    if (!deleteSvcData) return;
    try {
      await deleteSvcMut.mutateAsync(deleteSvcData.id);
      toast('success', 'Premium service deleted successfully');
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed to delete service');
    }
    setDeleteSvcData(null);
  };

  // Service edit handlers
  const openEditSvc = (svc: any) => {
    setEditSvc(svc);
    setSvcDesc(svc.description || '');
    setSvcDuration(svc.duration_minutes || 60);
    setSvcPrices(Object.fromEntries(CAR_TYPES.map(t => [`price_${t.value}`, parseFloat(svc[`price_${t.value}`]) || 0])));
    setSvcModalOpen(true);
  };

  const handleSaveSvc = async () => {
    if (!editSvc) return;
    try {
      await updateSvc.mutateAsync({ id: editSvc.id, description: svcDesc, duration_minutes: svcDuration, ...svcPrices });
      toast('success', 'Service updated');
      setSvcModalOpen(false);
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Failed');
    }
  };

  return (
    <>
      <AdminTopBar
        title="Premium Services"
        subtitle={`${(services || []).length} premium services`}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2">{[1, 2, 3].map(i => <SkeletonCard key={i} />)}</div>
      ) : !services?.length ? (
        <EmptyState
          icon={Sparkles}
          title="No Premium Services"
          description="Premium services are managed from the Services page. Mark a service as Premium to see it here."
        />
      ) : (
        <div className="space-y-4">
          {services.map((svc: any) => (
            <PremiumServiceCard
              key={svc.id}
              svc={svc}
              isExpanded={expandedId === svc.id}
              onToggleExpand={() => setExpandedId(expandedId === svc.id ? null : svc.id)}
              onEdit={() => openEditSvc(svc)}
              onDelete={() => setDeleteSvcData({ id: svc.id, name: svc.name })}
              onAddAddon={() => openAddAddon(svc.id)}
              onEditAddon={(addon: any) => openEditAddon(svc.id, addon)}
              onDeleteAddon={(addonId: number) => setDeleteAddonData({ serviceId: svc.id, addonId })}
            />
          ))}
        </div>
      )}

      {/* ── Add-on Modal ──────────────────────────────── */}
      <Modal
        open={addonModalOpen}
        onClose={() => setAddonModalOpen(false)}
        title={editAddon ? 'Edit Add-on' : 'New Add-on'}
        size="sm"
        footer={
          <>
            <Button variant="ghost" onClick={() => setAddonModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveAddon} loading={createAddonMut.isPending || updateAddonMut.isPending}>
              {editAddon ? 'Save' : 'Create'}
            </Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Add-on Name" value={addonName} onChange={e => setAddonName(e.target.value)} placeholder="e.g. Engine Bay Cleaning" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Input label="Price (₹)" type="number" value={addonPrice || ''} onChange={e => setAddonPrice(parseFloat(e.target.value) || 0)} />
            <Input label="Duration (min)" type="number" value={addonDuration || ''} onChange={e => setAddonDuration(parseInt(e.target.value) || 30)} />
          </div>
        </div>
      </Modal>

      {/* ── Service Edit Modal ────────────────────────── */}
      <Modal
        open={svcModalOpen}
        onClose={() => setSvcModalOpen(false)}
        title={`Edit: ${editSvc?.name || ''}`}
        size="md"
        footer={
          <>
            <Button variant="ghost" onClick={() => setSvcModalOpen(false)}>Cancel</Button>
            <Button onClick={handleSaveSvc} loading={updateSvc.isPending}>Save</Button>
          </>
        }
      >
        <div className="space-y-4">
          <Input label="Description" value={svcDesc} onChange={e => setSvcDesc(e.target.value)} placeholder="Service description" />
          <Input label="Duration (minutes)" type="number" value={svcDuration || ''} onChange={e => setSvcDuration(parseInt(e.target.value) || 60)} />
          <div>
            <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-2">Pricing by Vehicle Category</p>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
              {CATEGORY_LABELS.map(cat => (
                <Input
                  key={cat.key}
                  label={`${cat.short} ₹`}
                  type="number"
                  value={svcPrices[cat.key] || ''}
                  onChange={e => setSvcPrices(prev => ({ ...prev, [cat.key]: parseFloat(e.target.value) || 0 }))}
                />
              ))}
            </div>
          </div>
        </div>
      </Modal>

      {/* ── Delete Service Confirm ──────────────────────── */}
      <ConfirmDialog
        open={!!deleteSvcData}
        onClose={() => setDeleteSvcData(null)}
        onConfirm={handleDeleteService}
        title="Delete Premium Service"
        message={`Are you sure you want to delete "${deleteSvcData?.name || 'this service'}"? This will permanently remove the service.`}
        confirmLabel="Delete Service"
        loading={deleteSvcMut.isPending}
      />

      {/* ── Delete Addon Confirm ──────────────────────── */}
      <ConfirmDialog
        open={!!deleteAddonData}
        onClose={() => setDeleteAddonData(null)}
        onConfirm={handleDeleteAddon}
        title="Delete Add-on"
        message="This will permanently remove this add-on. Continue?"
        confirmLabel="Delete"
        loading={deleteAddonMut.isPending}
      />
    </>
  );
}


// ═══════════════════════════════════════════════════════════
// Premium Service Card Component (with addons accordion)
// ═══════════════════════════════════════════════════════════
function PremiumServiceCard({
  svc,
  isExpanded,
  onToggleExpand,
  onEdit,
  onDelete,
  onAddAddon,
  onEditAddon,
  onDeleteAddon,
}: {
  svc: any;
  isExpanded: boolean;
  onToggleExpand: () => void;
  onEdit: () => void;
  onDelete: () => void;
  onAddAddon: () => void;
  onEditAddon: (addon: any) => void;
  onDeleteAddon: (addonId: number) => void;
}) {
  const { data: addons } = useServiceAddons(isExpanded ? svc.id : undefined);

  return (
    <div className={`bg-white rounded-xl shadow-sm border transition-all ${svc.is_active ? 'border-l-4 border-l-[#2563EB] border-gray-100' : 'border-gray-200 opacity-60'}`}>
      {/* Header */}
      <div className="p-5">
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-blue-500 to-orange-500 flex items-center justify-center shrink-0">
              <Sparkles size={18} className="text-white" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="font-extrabold text-[#0F172A] text-sm truncate">{svc.name}</h3>
                <span className="text-[8px] font-extrabold uppercase tracking-widest px-1.5 py-0.5 bg-amber-100 text-amber-700 rounded">Premium</span>
              </div>
              {svc.description && <p className="text-xs text-[#64748B] mt-0.5 line-clamp-1">{svc.description}</p>}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {svc.duration_minutes && (
              <span className="text-[10px] text-[#64748B] flex items-center gap-1 mr-2">
                <Clock size={12} /> {svc.duration_minutes}m
              </span>
            )}
            <button onClick={onEdit} className="p-1.5 rounded hover:bg-gray-100 transition-colors" title="Edit Service"><Edit2 size={14} className="text-gray-400" /></button>
            <button onClick={onDelete} className="p-1.5 rounded hover:bg-blue-50 transition-colors" title="Delete Service"><Trash2 size={14} className="text-gray-400 hover:text-blue-600" /></button>
            <button onClick={onToggleExpand} className="p-1.5 rounded hover:bg-gray-100 transition-colors">
              {isExpanded ? <ChevronUp size={14} className="text-gray-400" /> : <ChevronDown size={14} className="text-gray-400" />}
            </button>
          </div>
        </div>

        {/* Pricing row */}
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2 mt-3 pt-3 border-t border-gray-50">
          {CATEGORY_LABELS.map(cat => (
            <div key={cat.key} className="text-center">
              <p className="text-[8px] font-bold uppercase tracking-widest text-[#64748B] leading-tight">{cat.short}</p>
              <p className="text-xs font-extrabold text-[#0F172A] mt-0.5">{formatINR(svc[cat.key])}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Addons Accordion */}
      {isExpanded && (
        <div className="border-t border-gray-100 bg-[#faf9f8] p-5">
          <div className="flex items-center justify-between mb-3">
            <p className="text-[10px] font-extrabold uppercase tracking-widest text-[#64748B]">Add-ons</p>
            <Button size="sm" variant="ghost" onClick={onAddAddon} icon={<Plus size={12} />}>Add</Button>
          </div>

          {!addons?.length ? (
            <p className="text-xs text-[#64748B] text-center py-3">No add-ons yet</p>
          ) : (
            <div className="space-y-2">
              {addons.map((addon: any) => (
                <div key={addon.id} className="flex items-center justify-between p-3 bg-white rounded-lg border border-gray-100">
                  <div className="flex items-center gap-3">
                    <div className={`w-2 h-2 rounded-full ${addon.is_active ? 'bg-green-500' : 'bg-gray-300'}`} />
                    <div>
                      <p className="text-sm font-bold text-[#0F172A]">{addon.addon_name}</p>
                      <div className="flex items-center gap-3 mt-0.5 text-[10px] text-[#64748B]">
                        <span className="flex items-center gap-1"><DollarSign size={10} /> {formatINR(addon.addon_price)}</span>
                        <span className="flex items-center gap-1"><Clock size={10} /> {addon.duration_minutes}m</span>
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <button onClick={() => onEditAddon(addon)} className="p-1.5 rounded hover:bg-gray-100 transition-colors"><Edit2 size={12} className="text-gray-400" /></button>
                    <button onClick={() => onDeleteAddon(addon.id)} className="p-1.5 rounded hover:bg-blue-50 transition-colors"><Trash2 size={12} className="text-gray-400" /></button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
