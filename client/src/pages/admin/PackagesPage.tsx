import { useState } from 'react';
import { Plus, Package as PackageIcon, Edit2, Trash2, ToggleLeft, ToggleRight, Loader2, Eye, EyeOff, Minus, Check, X as XIcon } from 'lucide-react';
import { usePackages, useCreatePackage, useUpdatePackage, useTogglePackage, useTogglePackageVisibility, useDeletePackage } from '../../api/hooks/usePackages';
import { useServices } from '../../api/hooks/useServices';
import { useInventory } from '../../api/hooks/useInventory';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Modal from '../../components/ui/Modal';
import Textarea from '../../components/ui/Textarea';
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

const emptyPrices = () => ({
  price_hatchback: 0, price_medium_hatchback: 0, price_sedan: 0, price_premium_sedan: 0, price_suv: 0,
});

// Type for a service row in the custom builder
interface ServiceRow {
  service_id: number | '';
  total_count: number;
  complimentary?: boolean;
  display_order?: number;
}

// Tier colors for visual distinction
const TIER_COLORS: Record<string, { border: string; headerBg: string; badge: string }> = {
  bronze:   { border: 'border-l-amber-600',   headerBg: 'bg-amber-50',   badge: 'bg-amber-100 text-amber-800' },
  silver:   { border: 'border-l-slate-500',   headerBg: 'bg-slate-50',   badge: 'bg-slate-100 text-slate-700' },
  gold:     { border: 'border-l-yellow-500',  headerBg: 'bg-yellow-50',  badge: 'bg-yellow-100 text-yellow-800' },
  diamond:  { border: 'border-l-sky-500',     headerBg: 'bg-sky-50',     badge: 'bg-sky-100 text-sky-700' },
  platinum: { border: 'border-l-purple-600',  headerBg: 'bg-purple-50',  badge: 'bg-purple-100 text-purple-700' },
};

// All service names from the flyer
const ALL_SERVICES = [
  'Full Foam Wash',
  'Body Wax Coat',
  'Two Wheeler Wash',
  'Two Wheeler Wax Coat',
  'Body Hybrid Ceramic Wax Coat',
  'Deep Cleaning',
];

const INCLUDED_SERVICES: Record<string, { service_name: string, count: number }[]> = {
  'bronze': [
    { service_name: 'Full Foam Wash', count: 4 },
    { service_name: 'Body Wax Coat', count: 1 },
  ],
  'silver': [
    { service_name: 'Full Foam Wash', count: 7 },
    { service_name: 'Body Wax Coat', count: 2 },
    { service_name: 'Two Wheeler Wash', count: 1 },
  ],
  'gold': [
    { service_name: 'Full Foam Wash', count: 12 },
    { service_name: 'Body Wax Coat', count: 3 },
    { service_name: 'Two Wheeler Wash', count: 1 },
    { service_name: 'Two Wheeler Wax Coat', count: 1 },
  ],
  'diamond': [
    { service_name: 'Full Foam Wash', count: 16 },
    { service_name: 'Body Wax Coat', count: 2 },
    { service_name: 'Two Wheeler Wash', count: 2 },
    { service_name: 'Two Wheeler Wax Coat', count: 1 },
    { service_name: 'Body Hybrid Ceramic Wax Coat', count: 1 },
  ],
  'platinum': [
    { service_name: 'Full Foam Wash', count: 20 },
    { service_name: 'Body Wax Coat', count: 3 },
    { service_name: 'Two Wheeler Wash', count: 2 },
    { service_name: 'Two Wheeler Wax Coat', count: 1 },
    { service_name: 'Body Hybrid Ceramic Wax Coat', count: 1 },
    { service_name: 'Deep Cleaning', count: 1 },
  ],
};

const PACKAGE_SERVICES_UNIFIED: Record<string, { service_name: string; total_count: number }[]> = {
  'bronze': [
    { service_name: 'Full Foam Wash', total_count: 4 },
    { service_name: 'Body Wax Coat', total_count: 1 },
  ],
  'silver': [
    { service_name: 'Full Foam Wash', total_count: 7 },
    { service_name: 'Body Wax Coat', total_count: 2 },
    { service_name: 'Two Wheeler Wash', total_count: 1 },
  ],
  'gold': [
    { service_name: 'Full Foam Wash', total_count: 12 },
    { service_name: 'Body Wax Coat', total_count: 3 },
    { service_name: 'Two Wheeler Wash', total_count: 1 },
    { service_name: 'Two Wheeler Wax Coat', total_count: 1 },
  ],
  'diamond': [
    { service_name: 'Full Foam Wash', total_count: 16 },
    { service_name: 'Body Wax Coat', total_count: 2 },
    { service_name: 'Two Wheeler Wash', total_count: 2 },
    { service_name: 'Two Wheeler Wax Coat', total_count: 1 },
    { service_name: 'Body Hybrid Ceramic Wax Coat', total_count: 1 },
  ],
  'platinum': [
    { service_name: 'Full Foam Wash', total_count: 20 },
    { service_name: 'Body Wax Coat', total_count: 3 },
    { service_name: 'Two Wheeler Wash', total_count: 2 },
    { service_name: 'Two Wheeler Wax Coat', total_count: 1 },
    { service_name: 'Body Hybrid Ceramic Wax Coat', total_count: 1 },
    { service_name: 'Deep Cleaning', total_count: 1 },
  ],
};

function getTierKey(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(TIER_COLORS)) {
    if (lower.includes(key)) return key;
  }
  return '';
}

export default function PackagesPage() {
  const toast = useUIStore((s) => s.toast);
  const { data: pkgs, isLoading } = usePackages();
  const { data: servicesData } = useServices();
  const { data: inventoryData } = useInventory({});
  
  const createMut = useCreatePackage();
  const updateMut = useUpdatePackage();
  const toggleMut = useTogglePackage();
  const visibilityMut = useTogglePackageVisibility();
  const deleteMut = useDeletePackage();

  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  
  const [name, setName] = useState('');
  const [desc, setDesc] = useState('');
  const [prices, setPrices] = useState<Record<string, number>>(emptyPrices());
  const [premiumPrices, setPremiumPrices] = useState<Record<string, number>>(emptyPrices());
  const [washCount, setWashCount] = useState(0);
  const [waxCount, setWaxCount] = useState(0);
  const [active, setActive] = useState(true);
  const [visibleToCustomer, setVisibleToCustomer] = useState(true);
  
  // Dynamic services list for custom package builder
  const [serviceRows, setServiceRows] = useState<ServiceRow[]>([]);
  
  // Custom package settings
  const [packageValidity, setPackageValidity] = useState(12);
  const [pickupEnabled, setPickupEnabled] = useState(false);
  
  // Legacy: selected products (checkboxes, no count)
  const [selectedProducts, setSelectedProducts] = useState<any[]>([]);

  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const packages = pkgs?.data || [];
  const services = servicesData?.data || [];
  const inventory = inventoryData?.data || [];

  const updatePrice = (key: string, val: number) => setPrices(prev => ({ ...prev, [key]: val }));
  const updatePremiumPrice = (key: string, val: number) => setPremiumPrices(prev => ({ ...prev, [key]: val }));

  const addServiceRow = () => {
    setServiceRows([...serviceRows, { service_id: '', total_count: 1, complimentary: false, display_order: 0 }]);
  };

  const removeServiceRow = (idx: number) => {
    setServiceRows(serviceRows.filter((_, i) => i !== idx));
  };

  const updateServiceRow = (idx: number, field: keyof ServiceRow, value: any) => {
    const next = [...serviceRows];
    (next[idx] as any)[field] = value;
    setServiceRows(next);
  };

  const openAdd = () => {
    setEditItem(null); 
    setName(''); setDesc(''); setPrices(emptyPrices()); setPremiumPrices(emptyPrices());
    setWashCount(0); setWaxCount(0); setActive(true);
    setVisibleToCustomer(true);
    setServiceRows([{ service_id: '', total_count: 1, complimentary: false, display_order: 0 }]);
    setSelectedProducts([]);
    setPackageValidity(12);
    setPickupEnabled(false);
    setModalOpen(true);
  };

  const openEdit = (pkg: any) => {
    setEditItem(pkg); 
    setName(pkg.name); setDesc(pkg.description || '');

    const getPriceForCarType = (carType: string, pricingType: 'basic' | 'premium', defaultVal: any) => {
      if (pkg.pricing && pkg.pricing.length > 0) {
        const row = pkg.pricing.find((r: any) => r.car_type === carType && r.pricing_type === pricingType);
        if (row && parseFloat(row.price) > 0) return parseFloat(row.price);
      }
      return parseFloat(defaultVal) || 0;
    };

    setPrices({
      price_hatchback: getPriceForCarType('SMALL_HATCHBACK', 'basic', pkg.price_hatchback),
      price_medium_hatchback: getPriceForCarType('MEDIUM_HATCHBACK', 'basic', pkg.price_medium_hatchback),
      price_sedan: getPriceForCarType('SEDAN_SUV', 'basic', pkg.price_sedan),
      price_premium_sedan: getPriceForCarType('PREMIUM_SEDAN', 'basic', pkg.price_premium_sedan),
      price_suv: getPriceForCarType('LARGE_CAR', 'basic', pkg.price_suv),
    });

    setPremiumPrices({
      price_hatchback: getPriceForCarType('SMALL_HATCHBACK', 'premium', 0),
      price_medium_hatchback: getPriceForCarType('MEDIUM_HATCHBACK', 'premium', 0),
      price_sedan: getPriceForCarType('SEDAN_SUV', 'premium', 0),
      price_premium_sedan: getPriceForCarType('PREMIUM_SEDAN', 'premium', 0),
      price_suv: getPriceForCarType('LARGE_CAR', 'premium', 0),
    });

    setWashCount(pkg.wash_count); setWaxCount(pkg.wax_count);
    setActive(!!pkg.is_published);
    setVisibleToCustomer(pkg.visible_to_customer !== undefined ? !!pkg.visible_to_customer : true);
    
    // Init service rows from enriched package data
    const svcRows: ServiceRow[] = (pkg.services || []).map((s: any) => ({
      service_id: s.id,
      total_count: s.total_count || 1,
      complimentary: !!s.complimentary,
      display_order: s.display_order || 0,
    }));
    setServiceRows(svcRows.length > 0 ? svcRows : []);
    
    // Init associated products
    const pArr = (pkg.products || []).map((p: any) => ({ product_id: p.product_id, quantity: p.quantity }));
    setSelectedProducts(pArr);
    
    setPackageValidity(pkg.package_validity || 12);
    setPickupEnabled(!!pkg.pickup_enabled);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!name.trim()) { toast('error', 'Package name is required'); return; }
    
    // Validate service rows
    const validServiceRows = serviceRows.filter(r => r.service_id !== '');
    for (const row of validServiceRows) {
      if (!row.total_count || row.total_count <= 0) {
        toast('error', 'Each service must have a count greater than 0');
        return;
      }
    }

    try {
      const payload: any = {
        name, description: desc, 
        ...prices,
        wash_count: washCount, wax_count: waxCount,
        is_published: active,
        visible_to_customer: visibleToCustomer,
        products: selectedProducts,
        package_validity: packageValidity,
        pickup_enabled: pickupEnabled,
        pricing: [
          // Basic Pricing
          { car_type: 'SMALL_HATCHBACK', pricing_type: 'basic', price: prices.price_hatchback || 0 },
          { car_type: 'MEDIUM_HATCHBACK', pricing_type: 'basic', price: prices.price_medium_hatchback || 0 },
          { car_type: 'SEDAN_SUV', pricing_type: 'basic', price: prices.price_sedan || 0 },
          { car_type: 'PREMIUM_SEDAN', pricing_type: 'basic', price: prices.price_premium_sedan || 0 },
          { car_type: 'LARGE_CAR', pricing_type: 'basic', price: prices.price_suv || 0 },
          // Premium Pricing
          { car_type: 'SMALL_HATCHBACK', pricing_type: 'premium', price: premiumPrices.price_hatchback || 0 },
          { car_type: 'MEDIUM_HATCHBACK', pricing_type: 'premium', price: premiumPrices.price_medium_hatchback || 0 },
          { car_type: 'SEDAN_SUV', pricing_type: 'premium', price: premiumPrices.price_sedan || 0 },
          { car_type: 'PREMIUM_SEDAN', pricing_type: 'premium', price: premiumPrices.price_premium_sedan || 0 },
          { car_type: 'LARGE_CAR', pricing_type: 'premium', price: premiumPrices.price_suv || 0 },
        ]
      };

      // Use new format: services with total_count
      if (validServiceRows.length > 0) {
        payload.services = validServiceRows.map(r => ({
          service_id: r.service_id,
          total_count: r.total_count,
          complimentary: r.complimentary ? 1 : 0,
          display_order: r.display_order || 0,
        }));
      } else {
        payload.services = [];
      }

      if (editItem) {
        await updateMut.mutateAsync({ id: editItem.id, ...payload });
        toast('success', 'Package updated');
      } else {
        await createMut.mutateAsync(payload);
        toast('success', 'Package created');
      }
      setModalOpen(false);
    } catch (err: any) { toast('error', err?.response?.data?.error || 'Failed'); }
  };

  const handleToggle = async (id: number) => {
    try { await toggleMut.mutateAsync(id); } catch { toast('error', 'Failed to toggle'); }
  };

  const handleVisibilityToggle = async (id: number) => {
    try { await visibilityMut.mutateAsync(id); } catch { toast('error', 'Failed to toggle visibility'); }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try { await deleteMut.mutateAsync(deleteId); toast('success', 'Package deleted'); }
    catch { toast('error', 'Failed to delete'); }
    setDeleteOpen(false); setDeleteId(null);
  };

  // Helper to get service count by name from pkg.services
  const getServiceCount = (pkg: any, serviceName: string): number => {
    let count = 0;
    if (pkg.services && pkg.services.length > 0) {
      const svc = pkg.services.find((s: any) => {
        const dbName = s.name?.toLowerCase() || '';
        const uiName = serviceName.toLowerCase();
        
        if ((uiName === 'car foam wash' || uiName === 'full foam wash') && dbName.includes('foam wash')) return true;
        if (uiName === 'body wax coat' && dbName.includes('wax coat') && !dbName.includes('two wheeler') && !dbName.includes('ceramic')) return true;
        if (uiName === 'two wheeler wash' && dbName.includes('two wheeler wash')) return true;
        if (uiName === 'two wheeler wax coat' && dbName.includes('two wheeler wax')) return true;
        if (uiName === 'body hybrid ceramic wax coat' && dbName.includes('ceramic')) return true;
        if (uiName === 'deep cleaning' && dbName.includes('deep clean')) return true;

        return dbName === uiName;
      });
      if (svc) count = svc.total_count || 0;
    }

    return count;
  };

  return (
    <>
      <AdminTopBar
        title="Packages"
        subtitle={`${packages.length} packages`}
        actions={<Button onClick={openAdd} icon={<Plus size={16} />}>Create Package</Button>}
      />

      {isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">{[1,2,3].map(i => <SkeletonCard key={i} />)}</div>
      ) : !packages.length ? (
        <EmptyState icon={PackageIcon} title="No Packages" description="Create your first package bundle" actionLabel="+ Create Package" onAction={openAdd} />
      ) : (
        <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5">
          {packages.map((pkg: any) => {
            const tierKey = getTierKey(pkg.name);
            const colors = TIER_COLORS[tierKey] || { border: 'border-l-blue-500', headerBg: 'bg-gray-50', badge: 'bg-gray-100 text-gray-700' };

            // Extract "Pay For X" from description
            const paidMatch = pkg.description?.match(/Pay\s+(?:For\s+)?(\d+)\s+(?:Car|Full)\s+Foam\s+Wash/i);
            const paidWashCount = paidMatch ? parseInt(paidMatch[1]) : (pkg.wash_count || 0);

            return (
              <div key={pkg.id} className={`bg-white rounded-xl shadow-sm border-l-4 ${colors.border} overflow-hidden transition-all hover:shadow-md ${!pkg.is_published ? 'opacity-60' : ''}`}>
                {/* ─── Card Header ─── */}
                <div className={`${colors.headerBg} px-4 py-3 flex items-start justify-between`}>
                  <div>
                    <h3 className="font-extrabold text-gray-900 text-sm uppercase tracking-wide">
                      {pkg.name.replace(/ Package$/i, '')}
                    </h3>
                    {paidWashCount > 0 && (
                      <p className="text-[10px] font-semibold text-gray-500 mt-0.5">
                        Pay For {paidWashCount} Full Foam Wash
                      </p>
                    )}
                  </div>
                  <div className="flex items-center gap-0.5 shrink-0">
                    <button onClick={() => handleVisibilityToggle(pkg.id)} className="p-1 rounded transition-colors hover:bg-white/60" title={pkg.visible_to_customer ? 'Visible' : 'Hidden'}>
                      {pkg.visible_to_customer ? <Eye size={14} className="text-blue-500" /> : <EyeOff size={14} className="text-gray-400" />}
                    </button>
                    <button onClick={() => handleToggle(pkg.id)} className="p-1 rounded hover:bg-white/60" title={pkg.is_published ? 'Active' : 'Draft'}>
                      {pkg.is_published ? <ToggleRight size={16} className="text-green-600" /> : <ToggleLeft size={16} className="text-gray-400" />}
                    </button>
                    <button onClick={() => openEdit(pkg)} className="p-1 rounded hover:bg-white/60"><Edit2 size={13} className="text-gray-400" /></button>
                    <button onClick={() => { setDeleteId(pkg.id); setDeleteOpen(true); }} className="p-1 rounded hover:bg-blue-50"><Trash2 size={13} className="text-gray-400" /></button>
                  </div>
                </div>

                {/* ─── Visibility Badge ─── */}
                {!pkg.visible_to_customer && (
                  <div className="px-4 pt-2">
                    <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-orange-50 text-orange-600 border border-orange-200 text-[8px] font-bold uppercase tracking-wider rounded-md">
                      <EyeOff size={9} /> Hidden
                    </span>
                  </div>
                )}

                {/* ─── Included Services ─── */}
                <div className="px-4 py-3">
                  <p className="text-[8px] font-extrabold uppercase tracking-[0.15em] text-gray-400 mb-2">Included Services</p>
                  <div className="space-y-1.5">
                    {(() => {
                      const mapServices = (pkg.services && pkg.services.length > 0)
                        ? pkg.services.map((s: any) => ({ service_name: s.name, total_count: s.total_count || 1 }))
                        : [];
                      if (mapServices && mapServices.length > 0) {
                        return mapServices.map((s: any, idx: number) => (
                          <div key={(s.service_name || s.name) + idx} className="flex items-center gap-1.5">
                            <div className="w-4 h-4 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                              <Check className="w-2.5 h-2.5 text-green-600" strokeWidth={3} />
                            </div>
                            <span className="text-[11px] leading-tight text-gray-800 font-bold">
                              {s.total_count} {s.service_name || s.name}
                            </span>
                          </div>
                        ));
                      }
                      return <p className="text-xs text-gray-400 italic">No services specified</p>;
                    })()}
                  </div>
                </div>

                {/* ─── V2 Pricing Grid (Basic / Premium) ─── */}
                <div className="px-4 pb-3 pt-2 border-t border-gray-100 overflow-x-auto">
                  {pkg.pricing && pkg.pricing.length > 0 ? (
                    <div className="min-w-[280px]">
                      <div className="grid grid-cols-6 gap-1 mb-1">
                        <div className="text-[7px] font-bold uppercase tracking-widest text-gray-400"></div>
                        {['S.Hatch','M.Hatch','Sedan','Prem','Large'].map(l => (
                          <div key={l} className="text-center text-[7px] font-bold uppercase tracking-widest text-gray-400 leading-tight">{l}</div>
                        ))}
                      </div>
                      {['basic','premium'].map(pt => (
                        <div key={pt} className="grid grid-cols-6 gap-1 py-0.5">
                          <div className={`text-[8px] font-bold uppercase tracking-wider ${pt === 'premium' ? 'text-purple-600' : 'text-gray-500'}`}>{pt}</div>
                          {['SMALL_HATCHBACK','MEDIUM_HATCHBACK','SEDAN_SUV','PREMIUM_SEDAN','LARGE_CAR'].map(ct => {
                            const p = pkg.pricing.find((r: any) => r.car_type === ct && r.pricing_type === pt);
                            return <div key={ct} className="text-center text-[10px] font-extrabold text-gray-900">{p ? formatINR(p.price) : '—'}</div>;
                          })}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="grid grid-cols-5 gap-1 min-w-[280px]">
                      {CATEGORY_LABELS.map(cat => (
                        <div key={cat.key} className="text-center">
                          <p className="text-[7px] font-bold uppercase tracking-widest text-gray-400 leading-tight">{cat.short}</p>
                          <p className="text-[11px] font-extrabold text-gray-900 mt-0.5">{formatINR(pkg[cat.key])}</p>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Add/Edit Modal — Custom Package Builder */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Package' : 'Create Custom Package'} size="lg"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editItem ? 'Save' : 'Create'}</Button></>}
      >
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Left Column — Basic Info */}
          <div className="space-y-4">
            <h4 className="font-semibold text-gray-700">Basic Info</h4>
            <Input label="Package Name" value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Silver Package" />
            <Textarea label="Description" value={desc} onChange={e => setDesc(e.target.value)} placeholder="e.g. Pay For 5 Car Foam Wash" />
            
            <div className="space-y-4">
              <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-blue-600"></span>
                  Basic Pricing by Vehicle Category (₹)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORY_LABELS.map(cat => (
                    <Input
                      key={`basic_${cat.key}`}
                      label={cat.label}
                      type="number"
                      value={prices[cat.key] || ''}
                      onChange={e => updatePrice(cat.key, parseFloat(e.target.value) || 0)}
                    />
                  ))}
                </div>
              </div>

              <div className="bg-purple-50/60 p-3 rounded-xl border border-purple-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-purple-700 mb-2 flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-purple-600"></span>
                  Premium Pricing by Vehicle Category (₹)
                </p>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                  {CATEGORY_LABELS.map(cat => (
                    <Input
                      key={`premium_${cat.key}`}
                      label={cat.label}
                      type="number"
                      value={premiumPrices[cat.key] || ''}
                      onChange={e => updatePremiumPrice(cat.key, parseFloat(e.target.value) || 0)}
                    />
                  ))}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Included Free Washes" type="number" value={washCount || ''} onChange={e => setWashCount(parseInt(e.target.value) || 0)} />
              <Input label="Included Free Waxes" type="number" value={waxCount || ''} onChange={e => setWaxCount(parseInt(e.target.value) || 0)} />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Input label="Package Validity (Months)" type="number" value={packageValidity || ''} onChange={e => setPackageValidity(parseInt(e.target.value) || 12)} />
              <div className="flex flex-col justify-end">
                {/* Free Pickup toggle */}
                <label className="flex items-center gap-3 cursor-pointer pb-2">
                  <button type="button" onClick={() => setPickupEnabled(!pickupEnabled)} className={`w-10 h-5 rounded-full transition-colors ${pickupEnabled ? 'bg-indigo-500' : 'bg-gray-300'}`}>
                    <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${pickupEnabled ? 'translate-x-5' : 'translate-x-0.5'}`} />
                  </button>
                  <span className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">{pickupEnabled ? 'Free Pickup Eligible' : 'No Free Pickup'}</span>
                </label>
              </div>
            </div>

            {/* Published toggle */}
            <label className="flex items-center gap-3 cursor-pointer pt-2">
              <button type="button" onClick={() => setActive(!active)} className={`w-10 h-5 rounded-full transition-colors ${active ? 'bg-green-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${active ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">{active ? 'Published' : 'Draft'}</span>
            </label>

            {/* Customer Visibility toggle */}
            <label className="flex items-center gap-3 cursor-pointer">
              <button type="button" onClick={() => setVisibleToCustomer(!visibleToCustomer)} className={`w-10 h-5 rounded-full transition-colors ${visibleToCustomer ? 'bg-blue-500' : 'bg-gray-300'}`}>
                <div className={`w-4 h-4 rounded-full bg-white shadow transform transition-transform ${visibleToCustomer ? 'translate-x-5' : 'translate-x-0.5'}`} />
              </button>
              <span className="text-xs font-bold uppercase tracking-wider text-[#5f5e5e]">
                {visibleToCustomer ? 'Visible to Customers' : 'Hidden from Customers'}
              </span>
            </label>
          </div>

          {/* Right Column — Services & Products */}
          <div className="space-y-6">
            {/* ── Custom Service Builder ─────────────────────── */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <h4 className="font-semibold text-gray-700">Package Services</h4>
                <button type="button" onClick={addServiceRow} className="text-xs text-[#2563EB] font-semibold flex items-center gap-0.5 hover:underline">
                  <Plus size={12} /> Add Service
                </button>
              </div>
              <p className="text-[10px] text-gray-400 mb-3">Select a service and how many times it's included in this package.</p>
              
              <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                {serviceRows.map((row, idx) => (
                  <div key={idx} className="flex gap-2 items-center animate-fade-in-up" style={{ animationDelay: `${idx * 0.03}s`, animationFillMode: 'forwards' }}>
                    {/* Service dropdown */}
                    <select
                      className="flex-1 px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 transition-all"
                      value={row.service_id}
                      onChange={e => updateServiceRow(idx, 'service_id', parseInt(e.target.value) || '')}
                    >
                      <option value="">Select Service…</option>
                      {services.map((s: any) => (
                        <option key={s.id} value={s.id}>{s.name}</option>
                      ))}
                    </select>
                    {/* Count input */}
                    <div className="relative w-20 shrink-0">
                      <input
                        type="number"
                        min="1"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 transition-all"
                        placeholder="Count"
                        value={row.total_count}
                        onChange={e => updateServiceRow(idx, 'total_count', parseInt(e.target.value) || 1)}
                      />
                      <span className="absolute right-1 top-1/2 -translate-y-1/2 text-[9px] text-gray-400 font-bold">×</span>
                    </div>
                    {/* Complimentary checkbox */}
                    <label className="flex items-center gap-1 shrink-0 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={!!row.complimentary}
                        onChange={e => updateServiceRow(idx, 'complimentary', e.target.checked)}
                        className="accent-[#2563EB] h-4 w-4 rounded border-gray-300"
                      />
                      <span className="text-[10px] text-gray-500 font-bold uppercase">Free</span>
                    </label>
                    {/* Display Order input */}
                    <div className="relative w-16 shrink-0">
                      <input
                        type="number"
                        className="w-full px-2 py-2 border border-gray-300 rounded-lg text-sm text-center focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30"
                        placeholder="Seq"
                        value={row.display_order || 0}
                        onChange={e => updateServiceRow(idx, 'display_order', parseInt(e.target.value) || 0)}
                      />
                    </div>
                    {/* Remove button */}
                    <button
                      type="button"
                      onClick={() => removeServiceRow(idx)}
                      className="p-1.5 rounded-lg text-blue-400 hover:bg-blue-50 hover:text-blue-600 transition-colors"
                    >
                      <Minus size={16} />
                    </button>
                  </div>
                ))}
                {serviceRows.length === 0 && (
                  <div className="text-center py-6 border-2 border-dashed border-gray-200 rounded-lg">
                    <p className="text-xs text-gray-400 italic mb-2">No services added yet</p>
                    <button type="button" onClick={addServiceRow} className="text-xs text-[#2563EB] font-bold hover:underline">
                      + Add your first service
                    </button>
                  </div>
                )}
              </div>
            </div>

            {/* ── Inventory Products ──────────────────────────── */}
            <div>
              <div className="flex justify-between items-end mb-2">
                <h4 className="font-semibold text-gray-700">Included Inventory Products</h4>
                <button type="button" onClick={() => setSelectedProducts([...selectedProducts, { product_id: '', quantity: 1 }])} className="text-xs text-[#2563EB] font-semibold flex items-center"><Plus size={12}/> Add Product</button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-1">
                {selectedProducts.map((p, idx) => (
                  <div key={idx} className="flex gap-2">
                    <select className="flex-1 px-3 py-1.5 border border-gray-300 rounded text-sm bg-white" value={p.product_id} onChange={e => {
                      const next = [...selectedProducts];
                      next[idx].product_id = parseInt(e.target.value) || '';
                      setSelectedProducts(next);
                    }}>
                      <option value="">Select Product...</option>
                      {inventory.map((inv: any) => (
                         <option key={inv.id} value={inv.id}>{inv.product_name} ({inv.unit})</option>
                      ))}
                    </select>
                    <input type="number" min="1" className="w-20 shrink-0 px-3 py-1.5 border border-gray-300 rounded text-sm" placeholder="Qty" value={p.quantity} onChange={e => {
                      const next = [...selectedProducts];
                      next[idx].quantity = parseFloat(e.target.value) || 1;
                      setSelectedProducts(next);
                    }}/>
                    <button type="button" onClick={() => setSelectedProducts(selectedProducts.filter((_, i) => i !== idx))} className="text-blue-500 hover:bg-blue-50 p-1.5 rounded"><Trash2 size={16}/></button>
                  </div>
                ))}
                {selectedProducts.length === 0 && <p className="text-xs text-gray-500 italic">No products tied to package.</p>}
              </div>
            </div>
          </div>
        </div>
      </Modal>

      <ConfirmDialog open={deleteOpen} onClose={() => { setDeleteOpen(false); setDeleteId(null); }} onConfirm={handleDelete}
        title="Delete Package" message="This will permanently delete the package bundle. continue?" confirmLabel="Delete" loading={deleteMut.isPending} />
    </>
  );
}
