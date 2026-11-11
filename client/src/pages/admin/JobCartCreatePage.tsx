import { ymd, dateOnly } from '../../utils/formatters';
import { getCategoryForModel } from '../../utils/carData';
import { CAR_TYPES } from '../../utils/carTypes';
import { useState, useCallback, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Plus, Trash2, Search, CheckCircle, Loader2, X, Camera, PackageOpen, UserCheck, Users, Tag } from 'lucide-react';
import { useCreateJobCart, useVehicleLookup, useUploadPhoto } from '../../api/hooks/useJobCarts';
import { useBrands, useModels, useVariants } from '../../api/hooks/useVehicles';
import api from '../../api/axiosInstance';
import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Textarea from '../../components/ui/Textarea';
import FileUpload from '../../components/ui/FileUpload';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import { carBrands, getModelsForBrand, getVariantsForModel } from '../../utils/carData';
import type { InventoryItem } from '../../types';
import ReferrerPicker, { ReferrerValue, referrerPayload } from '../../components/shared/ReferrerPicker';
import { regNoError, isValidMobile, isValidEmail, normalizeRegNo } from '../../utils/validators';

export const CAR_CATEGORIES = CAR_TYPES.map(t => ({ value: t.value, label: t.label }));
export const priceFor = (svc: any, category: string) => Number(svc?.[`price_${category || 'sedan'}`]) || Number(svc?.price_sedan) || Number(svc?.price_hatchback) || 0;

interface ProductRow {
  product_id: number;
  product_name: string;
  quantity: number;
  unit_cost: number;
  unit: string;
}

interface ServiceBlock {
  key: string;
  service_name: string;
  is_custom: boolean;
  service_price: number;
  labor_charges: number;
  custom_notes?: string;
  products: ProductRow[];
  use_package?: boolean;
}

const emptyProduct = (): ProductRow => ({
  product_id: 0, product_name: '', quantity: 1, unit_cost: 0, unit: 'pcs',
});

const emptyService = (): ServiceBlock => ({
  key: crypto.randomUUID(),
  service_name: '',
  is_custom: false,
  service_price: 0,
  labor_charges: 0,
  custom_notes: '',
  products: [],
});

export default function JobCartCreatePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const prefill = location.state?.prefill;

  const toast = useUIStore((s) => s.toast);
  const createCart = useCreateJobCart();
  const uploadPhotoMut = useUploadPhoto();
  const user = useAuthStore((s) => s.user);
  const isStaff = user?.role === 'staff';
  const cancelPath = '/admin/job-carts';

  // ─── Form state ─────────────────────────
  const [regNo, setRegNo] = useState(prefill?.vehicle_reg_no || '');
  const [lookupQuery, setLookupQuery] = useState('');
  const [customerName, setCustomerName] = useState(prefill?.customer_name || '');
  const [customerMobile, setCustomerMobile] = useState(prefill?.customer_mobile || '');
  const [customerEmail, setCustomerEmail] = useState(prefill?.customer_email || '');
  const [carBrand, setCarBrand] = useState(prefill?.car_brand || '');
  const [carModel, setCarModel] = useState(prefill?.car_model || '');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [carVariant, setCarVariant] = useState(prefill?.car_variant || '');
  const [carRegYear, setCarRegYear] = useState(prefill?.car_registration_year?.toString() || '');
  const [carColor, setCarColor] = useState('');
  const [kmReading, setKmReading] = useState('');
  // Fix timezone: use local date instead of toISOString() which shifts dates in IST
  const now = new Date();
  const [visitDate, setVisitDate] = useState(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`);
  const [notes, setNotes] = useState(prefill?.notes || '');
  const [preInspectorName, setPreInspectorName] = useState(user?.name || '');
  const [personalItemsNotes, setPersonalItemsNotes] = useState('');
  const [belongingPhotos, setBelongingPhotos] = useState<File[]>([]);
  const [belongingPreviews, setBelongingPreviews] = useState<string[]>([]);
  const belongingsFileRef = useRef<HTMLInputElement>(null);

  // Staff arrival capture & Incentive Engine state
  const [referrer, setReferrer] = useState<ReferrerValue>({ referrer_type: 'none' });
  const [carCategory, setCarCategory] = useState<string>(prefill?.car_category || 'sedan');
  const [approvers, setApprovers] = useState<{ id: number; label: string }[]>([]);
  const [discountApprovedBy, setDiscountApprovedBy] = useState<string>('');
  const [handlerId, setHandlerId] = useState<number | ''>('');
  const [technicianId, setTechnicianId] = useState<number | ''>('');
  const [teamIncentiveUsers, setTeamIncentiveUsers] = useState<number[]>([]);
  const [staffList, setStaffList] = useState<any[]>([]);

  // Discount state
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [discountReason, setDiscountReason] = useState('');

  useEffect(() => {
    api.get('/staff/technicians').then(r => setStaffList(r.data.data || [])).catch(() => {});
    api.get('/job-carts/discount-approvers').then(r => setApprovers(r.data.data || [])).catch(() => {});
  }, []);

  const handleBelongingsPhotoAdd = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files || []);
    if (!files.length) return;
    setBelongingPhotos(prev => [...prev, ...files]);
    files.forEach(f => {
      const reader = new FileReader();
      reader.onload = (ev) => {
        if (ev.target?.result) {
          setBelongingPreviews(prev => [...prev, ev.target!.result as string]);
        }
      };
      reader.readAsDataURL(f);
    });
  };

  const removeBelongingPhoto = (idx: number) => {
    setBelongingPhotos(prev => prev.filter((_, i) => i !== idx));
    setBelongingPreviews(prev => prev.filter((_, i) => i !== idx));
  };

  const [customerId, setCustomerId] = useState<number | null>(null);
  const [isReturning, setIsReturning] = useState(false);
  const [nextVisit, setNextVisit] = useState(1);
  const [bookingId] = useState<number | null>(prefill?.id || null);

  // Live registration search suggestions
  const [regSuggestions, setRegSuggestions] = useState<any[]>([]);
  const [showRegSuggestions, setShowRegSuggestions] = useState(false);

  useEffect(() => {
    const clean = regNo.toUpperCase().replace(/\s/g, '');
    if (clean.length < 2) {
      setRegSuggestions([]);
      setShowRegSuggestions(false);
      return;
    }
    const timer = setTimeout(() => {
      api.get(`/search/vehicles?q=${encodeURIComponent(clean)}`)
        .then(r => {
          if (r.data?.success && r.data.data?.length > 0) {
            setRegSuggestions(r.data.data);
            setShowRegSuggestions(true);
          } else {
            setRegSuggestions([]);
            setShowRegSuggestions(false);
          }
        })
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [regNo]);

  // Autocomplete data
  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(carBrand);
  const { data: variantsRes } = useVariants(carBrand, carModel);

  // Build merged dropdown options from API data + comprehensive dataset + selected value
  const rawBrands = Array.from(new Set([...(brandsRes?.data || []), ...carBrands, carBrand].filter(Boolean)));
  const brandOptions = [
    ...rawBrands.map((b: string) => ({ value: b, label: b })),
    { value: 'Others', label: 'Others (Enter Manually)' }
  ];

  const datasetModels = carBrand ? getModelsForBrand(carBrand) : [];
  const rawModels = Array.from(new Set([...(modelsRes?.data || []), ...datasetModels, carModel].filter(Boolean)));
  const modelOptions = [
    ...rawModels.map((m: string) => ({ value: m, label: m })),
    { value: 'Other', label: 'Other (Enter Manually)' }
  ];

  const datasetVariants = (carBrand && carModel) ? getVariantsForModel(carBrand, carModel) : [];
  const rawVariants = Array.from(new Set([...(variantsRes?.data || []), ...datasetVariants, carVariant].filter(Boolean)));
  const variantOptions = rawVariants.map((v: string) => ({ value: v, label: v }));

  const currentYear = new Date().getFullYear();
  const yearOptions = Array.from({ length: currentYear - 1990 + 1 }, (_, i) => {
    const y = 1990 + i;
    return { value: y.toString(), label: y.toString() };
  }).reverse();

  // Services
  const [serviceBlocks, setServiceBlocks] = useState<ServiceBlock[]>(() => {
    if (Array.isArray(prefill?.services) && prefill.services.length) {
      return prefill.services.map((sv: any) => ({ ...emptyService(), service_name: sv.service_name, service_price: Number(sv.service_price) || 0 }));
    }
    if (prefill?.service_name) {
      return [{ ...emptyService(), service_name: prefill.service_name }];
    }
    return [emptyService()];
  });

  // Photos
  const [beforePhotos, setBeforePhotos] = useState<File[]>([]);
  const [afterPhotos, setAfterPhotos] = useState<File[]>([]);

  // Catalog data
  const [servicesCatalog, setServicesCatalog] = useState<any[]>([]);

  const [inventory, setInventory] = useState<InventoryItem[]>([]);

  // ─── Fetch catalogs ─────────────────────
  useEffect(() => {
    api.get('/services').then(r => {
      const catalogs = r.data.data || [];
      setServicesCatalog(catalogs);
      // Auto-populate price if prefilled service matches a catalog service
      if (prefill?.service_name) {
        const found = catalogs.find((s: any) => s.name === prefill.service_name);
        if (found) {
          setServiceBlocks(prev => prev.map(block => block.service_name === prefill.service_name ? {
            ...block,
            service_price: priceFor(found, carCategory)
          } : block));
        }
      }
    }).catch(() => {});
    api.get('/inventory?limit=500').then(r => setInventory(r.data.data || [])).catch(() => {});
  }, [prefill]);

  // Auto-trigger vehicle lookup if arriving with a prefilled reg number
  useEffect(() => {
    if (prefill?.vehicle_reg_no) {
      const clean = prefill.vehicle_reg_no.toUpperCase().replace(/\s/g, '');
      if (clean.length >= 4) setLookupQuery(clean);
    }
  }, [prefill]);

  // ─── Vehicle lookup ─────────────────────
  const { data: lookupData, isLoading: lookupLoading, isError: lookupNotFound } = useVehicleLookup(lookupQuery);
  // Existing customer's active package for this car (walk-in can use its credits)
  const [custPackages, setCustPackages] = useState<any[]>([]);
  useEffect(() => {
    const vid = (lookupData as any)?.vehicle?.id;
    if (!lookupData?.found || !customerId) { setCustPackages([]); return; }
    api.get('/user-packages').then(r => {
      const list = (r.data?.data || []).filter((p: any) => Number(p.user_id) === Number(customerId) && p.package_status === 'active'
        && (!p.vehicle_id || !vid || Number(p.vehicle_id) === Number(vid)) && (!p.end_date || dateOnly(p.end_date) >= ymd()));
      setCustPackages(list);
    }).catch(() => setCustPackages([]));
  }, [lookupData, customerId]); // eslint-disable-line react-hooks/exhaustive-deps
  const usePackageService = (name: string) => {
    setServiceBlocks(prev => {
      const blank = prev.find(b => !b.service_name.trim());
      const block = { ...(blank || emptyService()), service_name: name, service_price: 0, labor_charges: 0, use_package: true, custom_notes: 'From package' };
      return blank ? prev.map(b => (b.key === blank.key ? block : b)) : [...prev, block];
    });
  };
  useEffect(() => {
    if (lookupData?.found) {
      setCustomerId(lookupData.customer?.id || null);
      setCustomerName(lookupData.customer?.name || '');
      setCustomerMobile(lookupData.customer?.mobile || '');
      setCustomerEmail(lookupData.customer?.email || '');
      setCarBrand(lookupData.vehicle?.brand || '');
      setCarModel(lookupData.vehicle?.model || '');
      
      const vVariant = lookupData.vehicle?.variant || (lookupData.vehicle as any)?.car_variant || '';
      if (vVariant) setCarVariant(vVariant);

      const yr = lookupData.vehicle?.registration_year || lookupData.vehicle?.car_year || (lookupData.vehicle as any)?.manufacture_year || (lookupData.vehicle as any)?.year_of_manufacture;
      if (yr) setCarRegYear(yr.toString());

      setIsReturning(true);
      setNextVisit(lookupData.next_visit_number || 1);
      const cat = (lookupData.vehicle as any)?.category;
      if (cat && CAR_CATEGORIES.some(c => c.value === cat)) setCarCategory(cat);

      // Auto-populate customer discount if set in CRM profile
      const cust = lookupData.customer as any;
      if (cust?.custom_discount_value && cust?.custom_discount_type && cust?.custom_discount_type !== 'none') {
        setDiscountType(cust.custom_discount_type);
        setDiscountValue(Number(cust.custom_discount_value));
        setDiscountReason('Customer CRM Profile Discount');
        toast('info', `Applied ${cust.custom_discount_type === 'percentage' ? cust.custom_discount_value + '%' : '₹' + cust.custom_discount_value} CRM discount for ${cust.name}`);
      }
    }
  }, [lookupData]);

  // Once both the car and the price list are known, price the services on the card for that car type
  // (so a booked SUV is not billed at the sedan price). Runs only when either arrives, not on manual edits.
  useEffect(() => {
    const cat = (lookupData?.vehicle as any)?.category;
    if (!cat || !servicesCatalog.length || !CAR_CATEGORIES.some(c => c.value === cat)) return;
    setServiceBlocks(prev => prev.map(block => {
      const svc = servicesCatalog.find((x: any) => x.name === block.service_name);
      return svc ? { ...block, service_price: priceFor(svc, cat) } : block;
    }));
  }, [lookupData, servicesCatalog]);

  const handleRegBlur = () => {
    const clean = regNo.toUpperCase().replace(/\s/g, '');
    if (clean.length >= 4) {
      setLookupQuery(clean);
      setIsReturning(false);
      setCustomerId(null);
    }
  };

  // ─── Service helpers ────────────────────
  const updateService = (key: string, field: string, value: any) => {
    setServiceBlocks(prev => prev.map(s => s.key === key ? { ...s, [field]: value } : s));
  };

  const handleServiceSelect = (key: string, val: string) => {
    if (val === '__custom__') {
      updateService(key, 'service_name', '');
      updateService(key, 'is_custom', true);
      updateService(key, 'service_price', 0);
    } else {
      const svc = servicesCatalog.find(s => s.name === val);
      updateService(key, 'service_name', val);
      updateService(key, 'is_custom', false);
      updateService(key, 'service_price', priceFor(svc, carCategory));
    }
  };

  const addProduct = (key: string) => {
    setServiceBlocks(prev => prev.map(s =>
      s.key === key ? { ...s, products: [...s.products, emptyProduct()] } : s
    ));
  };

  const updateProduct = (sKey: string, pIdx: number, field: string, value: any) => {
    setServiceBlocks(prev => prev.map(s =>
      s.key === sKey ? {
        ...s,
        products: s.products.map((p, i) => i === pIdx ? { ...p, [field]: value } : p),
      } : s
    ));
  };

  const removeProduct = (sKey: string, pIdx: number) => {
    setServiceBlocks(prev => prev.map(s =>
      s.key === sKey ? { ...s, products: s.products.filter((_, i) => i !== pIdx) } : s
    ));
  };

  const handleProductSelect = (sKey: string, pIdx: number, productId: number) => {
    const item = inventory.find(i => i.id === productId);
    if (item) {
      updateProduct(sKey, pIdx, 'product_id', productId);
      updateProduct(sKey, pIdx, 'product_name', item.product_name);
      updateProduct(sKey, pIdx, 'unit', item.unit);
    }
  };

  const removeServiceBlock = (key: string) => {
    if (serviceBlocks.length <= 1) return;
    setServiceBlocks(prev => prev.filter(s => s.key !== key));
  };

  const calcBlockSubtotal = (block: ServiceBlock) => {
    const prodCost = block.products.reduce((sum, p) => sum + (Number(p.quantity) || 0) * (Number(p.unit_cost) || 0), 0);
    return (Number(block.service_price) || 0) + (Number(block.labor_charges) || 0) + prodCost;
  };

  const grandTotal = serviceBlocks.reduce((sum, b) => sum + calcBlockSubtotal(b), 0);
  const discountAmount = discountValue > 0
    ? (discountType === 'percentage'
        ? (grandTotal * discountValue) / 100
        : Math.min(grandTotal, discountValue))
    : 0;
  const netTotal = Math.max(0, grandTotal - discountAmount);

  // ─── Submit ─────────────────────────────
  const [submitting, setSubmitting] = useState(false);

  const regError = regNo ? regNoError(regNo) : '';

  const handleSave = async (submitAfter: boolean) => {
    if (submitting) return;
    const cleanReg = normalizeRegNo(regNo);
    const finalBrand = carBrand === 'Others' ? customBrand : carBrand;
    const finalModel = (carBrand === 'Others' || carModel === 'Other') ? customModel : carModel;

    const err = regNoError(cleanReg);
    if (err) { toast('error', err); return; }
    if (!finalBrand || !finalModel) { toast('error', 'Brand and model are required'); return; }
    if (!customerId) {
      if (!customerName.trim()) { toast('error', 'Customer name is required'); return; }
      if (!isValidMobile(customerMobile)) { toast('error', 'Enter a valid 10-digit customer mobile number'); return; }
      if (customerEmail && !isValidEmail(customerEmail)) { toast('error', 'Customer email is invalid'); return; }
    }
    if (discountValue > 0) {
      if (!discountReason?.trim()) { toast('error', 'Enter the reason for the discount'); return; }
      if (!discountApprovedBy) { toast('error', 'Select who approved the discount'); return; }
      if (discountType === 'percentage' && discountValue > 100) { toast('error', 'Discount cannot exceed 100%'); return; }
    }
    if (referrer.referrer_type === 'staff' && !referrer.referrer_user_id) { toast('error', 'Select the staff member who referred'); return; }
    if (referrer.referrer_type === 'customer' && !referrer.referrer_user_id) { toast('error', 'Select the customer who referred'); return; }
    if (referrer.referrer_type === 'external' && !referrer.referrer_name?.trim()) { toast('error', 'Enter the referrer name'); return; }
    for (const block of serviceBlocks) {
      if (block.service_name && /ppf|film/i.test(block.service_name) && !block.custom_notes?.trim()) {
        toast('error', `Note is mandatory for "${block.service_name}" (e.g. "Bonnet PPF")`);
        return;
      }
    }

    setSubmitting(true);
    let cartId: number | null = null;
    try {
      // 1. Card + customer + vehicle + services + referral — one transaction on the server
      const cart = await createCart.mutateAsync({
        registration_no: cleanReg,
        customer_id: customerId,
        customer_name: customerName.trim(),
        customer_mobile: customerMobile,
        customer_email: customerEmail.trim(),
        car_brand: finalBrand,
        car_model: finalModel,
        car_variant: carVariant,
        car_category: carCategory,
        car_registration_year: carRegYear ? parseInt(carRegYear) : null,
        car_color: carColor.trim() || null,
        km_reading: kmReading || null,
        visit_date: visitDate,
        notes,
        pre_inspector_name: preInspectorName,
        personal_items_notes: personalItemsNotes,
        booking_id: bookingId,
        ...referrerPayload(referrer),
        handler_id: handlerId ? Number(handlerId) : null,
        technician_id: technicianId ? Number(technicianId) : null,
        team_incentive_users: teamIncentiveUsers,
        discount_type: discountType,
        discount_value: discountValue,
        discount_reason: discountReason,
        discount_approved_by: discountApprovedBy ? Number(discountApprovedBy) : null,
        services: serviceBlocks.filter(b => b.service_name.trim()).map(b => ({
          service_name: b.service_name.trim(),
          service_price: b.service_price,
          labor_charges: b.labor_charges,
          custom_notes: b.use_package ? undefined : b.custom_notes?.trim(),
          use_package: b.use_package || undefined,
          products: b.products.filter(p => p.product_id > 0 && p.quantity > 0).map(p => ({ product_id: p.product_id, quantity: p.quantity, unit_cost: p.unit_cost })),
        })),
      } as any);
      cartId = cart.id;
    } catch (err: any) {
      const data = err?.response?.data;
      if (data?.code === 'OPEN_JOB_EXISTS' && data.existing_id) {
        toast('info', data.error);
        navigate(`/admin/job-carts/${data.existing_id}`);
      } else {
        toast('error', data?.error || err.message || 'Failed to create job card');
      }
      setSubmitting(false);
      return;
    }

    // 2. Photos & belongings (card already saved — failures here don't duplicate the card)
    const failed: string[] = [];
    try { if (beforePhotos.length) await uploadPhotoMut.mutateAsync({ cartId: cartId!, files: beforePhotos, type: 'before' }); } catch { failed.push('before photos'); }
    try { if (afterPhotos.length) await uploadPhotoMut.mutateAsync({ cartId: cartId!, files: afterPhotos, type: 'after' }); } catch { failed.push('after photos'); }
    for (let i = 0; i < belongingPhotos.length; i++) {
      try {
        const formData = new FormData();
        formData.append('description', personalItemsNotes ? `Item #${i + 1}: ${personalItemsNotes}` : `Personal item photo #${i + 1}`);
        formData.append('image', belongingPhotos[i]);
        await api.post(`/job-carts/${cartId}/belongings`, formData, { headers: { 'Content-Type': 'multipart/form-data' } });
      } catch { failed.push(`belonging photo ${i + 1}`); }
    }

    // 3. Submit if requested
    try {
      if (submitAfter) {
        await api.patch(`/job-carts/${cartId}/submit`);
        toast('success', 'Job card created and submitted — customer notified on WhatsApp');
      } else {
        toast('success', 'Job card saved as draft');
      }
    } catch (e: any) {
      toast('error', `Job card saved as draft, but submit failed: ${e.message}`);
    }
    if (failed.length) toast('error', `Saved, but could not upload: ${failed.join(', ')}. You can add them from the job card.`);
    setSubmitting(false);
    navigate(`/admin/job-carts/${cartId}`);
  };

  const serviceOptions = [
    ...servicesCatalog.map(s => ({ value: s.name, label: s.name })),
    { value: '__custom__', label: '✏️ Custom / Other' },
  ];

  const inventoryOptions = inventory
    .filter(i => !i.is_deleted)
    .map(i => ({ value: i.id, label: Number(i.quantity) <= 0 ? `${i.product_name} — 0 stock left, kindly reorder from main admin` : `${i.product_name} (${Number(i.quantity)} ${i.unit})`, disabled: Number(i.quantity) <= 0 }));

  const handleSelectSuggestion = (item: any) => {
    const clean = (item.registration_no || '').toUpperCase().replace(/\s/g, '');
    setRegNo(clean);
    setLookupQuery(clean);
    setCustomerId(item.customer_id || null);
    setCustomerName(item.customer_name || '');
    setCustomerMobile(item.customer_mobile || '');
    setCarBrand(item.brand || '');
    setCarModel(item.model || '');
    
    const vr = item.variant || item.car_variant || '';
    if (vr) setCarVariant(vr);

    const yr = item.registration_year || item.car_year || item.manufacture_year || item.year_of_manufacture || '';
    if (yr) setCarRegYear(yr.toString());

    setShowRegSuggestions(false);
  };

  return (
    <>
      <AdminTopBar
        title="Create Job Card"
        subtitle="New service entry"
      />

      <div className="max-w-4xl space-y-8">

        {/* ─── SECTION A: Vehicle Registration ─────── */}
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#64748B] mb-5">Vehicle Registration</h3>
          <div className="flex gap-3 items-end">
            <div className="flex-1 relative">
              <Input
                label="Registration Number"
                placeholder="e.g. MH01AB1234"
                value={regNo}
                maxLength={13}
                error={regNo.length >= 6 ? regError : undefined}
                onChange={(e) => {
                  setRegNo(normalizeRegNo(e.target.value));
                  setShowRegSuggestions(true);
                }}
                onBlur={() => {
                  setTimeout(() => setShowRegSuggestions(false), 200);
                  handleRegBlur();
                }}
              />

              {/* Floating Live Suggestion Dropdown */}
              {showRegSuggestions && regSuggestions.length > 0 && (
                <div className="absolute left-0 right-0 top-full mt-1 bg-white border border-gray-200 rounded-xl shadow-xl z-50 overflow-hidden max-h-60 overflow-y-auto divide-y divide-gray-100">
                  {regSuggestions.map((item, idx) => (
                    <button
                      key={item.id || idx}
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        handleSelectSuggestion(item);
                      }}
                      className="w-full text-left p-3 hover:bg-sky-50 transition-colors flex items-center justify-between"
                    >
                      <div>
                        <div className="font-extrabold text-[#0F172A] text-sm flex items-center gap-1.5">
                          <span>🚗 {item.registration_no}</span>
                          <span className="text-xs text-sky-600 font-semibold">({item.brand} {item.model})</span>
                        </div>
                        <div className="text-xs text-gray-500 font-medium mt-0.5">
                          Customer: <span className="font-bold text-gray-700">{item.customer_name}</span> {item.customer_mobile ? `(${item.customer_mobile})` : ''}
                        </div>
                      </div>
                      <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 bg-sky-100 text-sky-700 rounded-md shrink-0">
                        Select
                      </span>
                    </button>
                  ))}
                </div>
              )}
            </div>
            {lookupLoading && (
              <div className="pb-3"><Loader2 size={20} className="animate-spin text-[#2563EB]" /></div>
            )}
          </div>

          {isReturning && (
            <div className="mt-3 flex items-center gap-2 bg-green-50 border border-green-200 rounded-lg px-4 py-2.5">
              <CheckCircle size={16} className="text-green-600" />
              <span className="text-sm font-semibold text-green-800">
                Returning Customer — Visit #{nextVisit}
              </span>
            </div>
          )}
          {lookupNotFound && lookupQuery && (
            <p className="mt-2 text-xs text-[#64748B] font-medium">🆕 New vehicle — fill customer details below</p>
          )}
        </section>

        {/* ─── SECTION B: Customer & Vehicle ────────── */}
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#64748B] mb-5">Customer & Vehicle</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Input label="Customer Name" value={customerName} onChange={e => setCustomerName(e.target.value)} disabled={!!customerId} />
            <Input label="Mobile Number" value={customerMobile} inputMode="numeric" maxLength={10} onChange={e => setCustomerMobile(e.target.value.replace(/\D/g, '').slice(0, 10))} disabled={!!customerId} error={!customerId && customerMobile.length === 10 && !isValidMobile(customerMobile) ? 'Invalid mobile number' : undefined} />
            <Input label="Email (Optional)" value={customerEmail} onChange={e => setCustomerEmail(e.target.value)} disabled={!!customerId} />
            <Select
              label="Car Brand"
              options={brandOptions}
              value={carBrand}
              onChange={e => {
                setCarBrand(e.target.value);
                setCarModel('');
                setCarVariant('');
                setCustomBrand('');
                setCustomModel('');
              }}
              placeholder="Select brand..."
            />
            <Select
              label="Car Model"
              options={modelOptions}
              value={carModel}
              onChange={e => {
                setCarModel(e.target.value);
                setCarVariant('');
                setCustomModel('');
                // pick the car type from the model (staff can still change it)
                if (e.target.value && e.target.value !== 'Other') {
                  const cat = getCategoryForModel(carBrand, e.target.value);
                  setCarCategory(cat);
                  setServiceBlocks(prev => prev.map(block => {
                    const svc = servicesCatalog.find((x: any) => x.name === block.service_name);
                    return svc ? { ...block, service_price: priceFor(svc, cat) } : block;
                  }));
                }
              }}
              placeholder={carBrand ? 'Select model...' : 'Select brand first'}
              disabled={!carBrand || carBrand === 'Others'}
            />
            {(carBrand === 'Others' || carModel === 'Other') && (
              <>
                {carBrand === 'Others' && (
                  <Input
                    label="Enter Brand Name"
                    value={customBrand}
                    onChange={e => setCustomBrand(e.target.value)}
                    placeholder="e.g. Porsche"
                    required
                  />
                )}
                <Input
                  label="Enter Model Name"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                  placeholder="e.g. Cayenne"
                  required
                />
              </>
            )}
            <Input label="Car Colour" value={carColor} onChange={e => setCarColor(e.target.value)} placeholder="e.g. White" />
            <Input label="KM Reading" inputMode="numeric" value={kmReading} onChange={e => setKmReading(e.target.value.replace(/[^0-9]/g, '').slice(0, 7))} placeholder="e.g. 45230" />
            <Select
              label="Registration Year"
              options={yearOptions}
              value={carRegYear}
              onChange={e => setCarRegYear(e.target.value)}
              placeholder="Select year..."
            />
            <Select
              label="Car Type (decides service price)"
              options={CAR_CATEGORIES}
              value={carCategory}
              onChange={e => {
                const cat = e.target.value;
                setCarCategory(cat);
                setServiceBlocks(prev => prev.map(b => {
                  const svc = servicesCatalog.find(x => x.name === b.service_name);
                  return svc && !b.is_custom ? { ...b, service_price: priceFor(svc, cat) } : b;
                }));
              }}
            />
            <Select
              label="Variant"
              options={variantOptions}
              value={carVariant}
              onChange={e => setCarVariant(e.target.value)}
              placeholder={carModel ? 'Select variant...' : 'Select model first'}
              disabled={!carModel}
            />
            <Input label="Visit Date" type="date" value={visitDate} onChange={e => setVisitDate(e.target.value)} />
            <Input
              label="🔍 Delivery Pre-Inspected By (Inspector Name)"
              value={preInspectorName}
              onChange={e => setPreInspectorName(e.target.value)}
              placeholder="Name of the person who checked the car"
              required
            />
          </div>
          <div className="mt-5 space-y-4">
            <Textarea label="Notes (Optional)" value={notes} onChange={e => setNotes(e.target.value)} placeholder="Any special instructions..." />
            
            {/* Customer Personal Belongings & Photo Attachment */}
            <div className="p-4 bg-amber-50/70 border border-amber-200/80 rounded-xl space-y-3">
              <div className="flex items-center justify-between">
                <label className="text-xs font-bold text-amber-900 uppercase tracking-wider flex items-center gap-1.5">
                  <PackageOpen size={16} className="text-amber-600" />
                  <span>Customer Personal Items Declaration & Photos</span>
                </label>
                <button
                  type="button"
                  onClick={() => belongingsFileRef.current?.click()}
                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-1.5 shadow-xs cursor-pointer"
                >
                  <Camera size={14} />
                  <span>Add Photo ({belongingPhotos.length})</span>
                </button>
                <input
                  ref={belongingsFileRef}
                  type="file"
                  accept="image/*"
                  multiple
                  className="hidden"
                  onChange={handleBelongingsPhotoAdd}
                />
              </div>

              <Textarea
                value={personalItemsNotes}
                onChange={e => setPersonalItemsNotes(e.target.value)}
                placeholder="List any valuable personal items left inside the car (e.g. Sunglasses, Charger, Cash, EZ Tag)..."
              />

              {/* Live Photo Previews */}
              {belongingPreviews.length > 0 && (
                <div className="pt-2 border-t border-amber-200/60">
                  <p className="text-[10px] font-extrabold uppercase text-amber-800 mb-2">
                    Attached Personal Item Photos ({belongingPreviews.length}):
                  </p>
                  <div className="flex flex-wrap gap-2.5">
                    {belongingPreviews.map((src, idx) => (
                      <div key={idx} className="relative group">
                        <img src={src} alt={`Belonging ${idx}`} className="w-20 h-20 rounded-lg object-cover border border-amber-300 shadow-2xs" />
                        <button
                          type="button"
                          onClick={() => removeBelongingPhoto(idx)}
                          className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 hover:bg-red-600 rounded-full flex items-center justify-center text-white shadow-sm transition-colors"
                          title="Remove photo"
                        >
                          <X size={10} />
                        </button>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </section>

        {/* ─── SECTION B.2: Vehicle Arrival & Staff Assignment ────────── */}
        <section className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-l-indigo-500">
          <div className="flex items-center gap-2 mb-2">
            <UserCheck size={18} className="text-indigo-600" />
            <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#0F172A]">Car Arrival & Staff Incentive Assignment</h3>
          </div>
          <p className="text-xs text-gray-500 mb-4">
            Capture staff and referral sources for automated commission and incentive distribution upon job completion.
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-5">
            <ReferrerPicker value={referrer} onChange={setReferrer} />
            <Select
              label="Handling Manager (10% Split)"
              options={[
                { value: '', label: 'Select Manager...' },
                ...staffList.filter(s => s.role === 'manager').map(s => ({ value: s.id.toString(), label: s.name }))
              ]}
              value={handlerId ? handlerId.toString() : ''}
              onChange={e => setHandlerId(e.target.value ? Number(e.target.value) : '')}
            />
            <Select
              label="Lead Technician (50% Split)"
              options={[
                { value: '', label: 'Select Lead Technician...' },
                ...staffList.map(s => ({ value: s.id.toString(), label: `${s.name} (${s.role || 'Tech'})` }))
              ]}
              value={technicianId ? technicianId.toString() : ''}
              onChange={e => setTechnicianId(e.target.value ? Number(e.target.value) : '')}
            />
          </div>

          <div className="mt-4 pt-4 border-t border-gray-100">
            <div className="flex items-center gap-2 mb-2">
              <Users size={16} className="text-indigo-600" />
              <label className="text-xs font-bold text-gray-700 uppercase tracking-wider">
                Team Incentive Members (40% Pool Shared Equally)
              </label>
            </div>
            {staffList.length === 0 ? (
              <p className="text-xs text-gray-400 italic">No staff members found.</p>
            ) : (
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 mt-2">
                {staffList.map(st => {
                  const isChecked = teamIncentiveUsers.includes(st.id);
                  return (
                    <label
                      key={st.id}
                      className={`flex items-center gap-2 p-2 rounded-lg border text-xs cursor-pointer transition-all ${
                        isChecked
                          ? 'bg-indigo-50 border-indigo-400 font-bold text-indigo-950 shadow-2xs'
                          : 'bg-gray-50 border-gray-200 text-gray-700 hover:bg-gray-100'
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={isChecked}
                        onChange={e => {
                          if (e.target.checked) {
                            setTeamIncentiveUsers(prev => [...prev, st.id]);
                          } else {
                            setTeamIncentiveUsers(prev => prev.filter(id => id !== st.id));
                          }
                        }}
                        className="rounded text-indigo-600 focus:ring-indigo-500"
                      />
                      <span className="truncate">{st.name} <span className="text-[10px] text-gray-400 font-normal">({st.role})</span></span>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </section>

        {/* ─── SECTION C: Services ─────────────────── */}
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#64748B] mb-5">Services</h3>

          {custPackages.map((pkg: any) => (
            <div key={pkg.id} className="mb-5 rounded-lg border border-purple-200 bg-purple-50 p-4">
              <p className="text-sm font-bold text-purple-800">Customer has a package: {pkg.package_name}</p>
              <p className="text-[11px] text-purple-600 mb-2">Valid till {new Date(pkg.end_date).toLocaleDateString('en-IN')}. Tap a service to use 1 credit (₹0 on the bill).</p>
              <div className="flex flex-wrap gap-2">
                {(pkg.usage || []).map((u: any) => {
                  const added = serviceBlocks.filter(b => b.use_package && b.service_name === u.service_name).length;
                  const left = Number(u.remaining) - added;
                  return (
                    <button key={u.service_name} type="button" disabled={left <= 0} onClick={() => usePackageService(u.service_name)}
                      className="px-3 py-1.5 rounded-lg bg-white border border-purple-300 text-xs font-bold text-purple-700 disabled:opacity-40">
                      {u.service_name} · {left} left
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          {serviceBlocks.map((block, blockIdx) => (
            <div key={block.key} className="mb-6 last:mb-0 border border-gray-100 rounded-lg p-5 relative group">
              {serviceBlocks.length > 1 && (
                <button
                  onClick={() => removeServiceBlock(block.key)}
                  className="absolute top-3 right-3 p-1.5 rounded-lg text-gray-300 hover:text-blue-500 hover:bg-blue-50 transition-colors opacity-0 group-hover:opacity-100"
                  title="Remove service"
                >
                  <Trash2 size={16} />
                </button>
              )}

              <div className={`grid grid-cols-1 ${isStaff ? '' : 'sm:grid-cols-3'} gap-4`}>
                {block.is_custom ? (
                  <div className={`${isStaff ? 'col-span-full' : 'sm:col-span-3'} flex gap-2 items-end`}>
                    <div className="flex-1">
                      <Input
                        label="Custom Service Name"
                        value={block.service_name}
                        onChange={e => updateService(block.key, 'service_name', e.target.value)}
                        placeholder="Enter service name"
                      />
                    </div>
                    <button onClick={() => updateService(block.key, 'is_custom', false)} className="pb-3 text-gray-400 hover:text-gray-600"><X size={16} /></button>
                  </div>
                ) : (
                  <Select
                    label="Service"
                    options={serviceOptions}
                    value={block.service_name}
                    onChange={e => handleServiceSelect(block.key, e.target.value)}
                    placeholder="Select service..."
                  />
                )}
                {!isStaff && (
                  <>
                    <Input
                      label="Service Price (₹)"
                      type="number"
                      value={block.service_price || ''}
                      onChange={e => updateService(block.key, 'service_price', parseFloat(e.target.value) || 0)}
                    />
                    <Input
                      label="Labor Charges (₹)"
                      type="number"
                      value={block.labor_charges || ''}
                      onChange={e => updateService(block.key, 'labor_charges', parseFloat(e.target.value) || 0)}
                    />
                  </>
                )}
              </div>

              {/* Partial PPF / Service Custom Note */}
              <div className="mt-3">
                <div className="flex items-center justify-between mb-1">
                  <label className="text-[11px] font-bold text-gray-700 flex items-center gap-1.5">
                    <span>Service Specific Note / Area:</span>
                    {/ppf|film/i.test(block.service_name) && (
                      <span className="text-[10px] font-extrabold uppercase px-1.5 py-0.5 bg-amber-100 text-amber-800 rounded border border-amber-300">
                        ⚠️ Mandatory for Partial PPF
                      </span>
                    )}
                  </label>
                  <span className="text-[10px] text-gray-400">e.g. "Bonnet PPF", "Front Bumper", "Left Door", "Bumper PPF"</span>
                </div>
                <input
                  type="text"
                  className={`w-full px-3 py-2 text-xs border rounded-lg focus:outline-none focus:ring-2 focus:ring-indigo-500 ${
                    /ppf|film/i.test(block.service_name) && !block.custom_notes?.trim()
                      ? 'border-amber-400 bg-amber-50/30'
                      : 'border-gray-200 bg-white'
                  }`}
                  placeholder={/ppf|film/i.test(block.service_name) ? 'Enter specific PPF coverage area (REQUIRED, e.g. Bonnet PPF)...' : 'Optional notes for this service...'}
                  value={block.custom_notes || ''}
                  onChange={e => updateService(block.key, 'custom_notes', e.target.value)}
                />
              </div>

              {/* Products */}
              <div className="mt-4">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-[#64748B]">Products Used</span>
                  <button
                    onClick={() => addProduct(block.key)}
                    className="text-xs font-bold text-[#2563EB] hover:underline flex items-center gap-1"
                  >
                    <Plus size={12} /> Add Product
                  </button>
                </div>

                {block.products.map((prod, pIdx) => (
                  <div key={pIdx} className="flex gap-2 items-end mb-2">
                    <div className="flex-1">
                      <Select
                        options={inventoryOptions}
                        value={prod.product_id || ''}
                        onChange={e => handleProductSelect(block.key, pIdx, parseInt(e.target.value))}
                        placeholder="Select product..."
                      />
                    </div>
                    <div className="w-20">
                      <Input
                        type="number"
                        value={prod.quantity || ''}
                        onChange={e => updateProduct(block.key, pIdx, 'quantity', parseFloat(e.target.value) || 0)}
                        placeholder="Qty"
                      />
                    </div>
                    {!isStaff && (
                      <div className="w-24">
                        <Input
                          type="number"
                          value={prod.unit_cost || ''}
                          onChange={e => updateProduct(block.key, pIdx, 'unit_cost', parseFloat(e.target.value) || 0)}
                          placeholder="₹ Cost"
                        />
                      </div>
                    )}
                    <button onClick={() => removeProduct(block.key, pIdx)} className="pb-3 text-gray-300 hover:text-blue-500">
                      <X size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Block subtotal */}
              {!isStaff && (
                <div className="mt-3 pt-3 border-t border-gray-50 text-right">
                  <span className="text-xs font-bold text-[#64748B]">Subtotal: </span>
                  <span className="text-sm font-extrabold text-[#0F172A]">
                    ₹{calcBlockSubtotal(block).toLocaleString('en-IN')}
                  </span>
                </div>
              )}
            </div>
          ))}

          <button
            onClick={() => setServiceBlocks(prev => [...prev, emptyService()])}
            className="mt-4 w-full py-3 border-2 border-dashed border-gray-200 rounded-lg text-sm font-bold text-[#64748B] hover:border-[#2563EB] hover:text-[#2563EB] transition-colors flex items-center justify-center gap-2"
          >
            <Plus size={16} /> Add Another Service
          </button>
        </section>

        {/* ─── SECTION D: Photos ───────────────────── */}
        <section className="bg-white rounded-lg p-6 shadow-sm">
          <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#64748B] mb-5">Photos</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            <FileUpload
              label="Before Photos"
              files={beforePhotos}
              onChange={setBeforePhotos}
              maxFiles={5}
            />
            <FileUpload
              label="After Photos"
              files={afterPhotos}
              onChange={setAfterPhotos}
              maxFiles={5}
            />
          </div>
        </section>

        {/* ─── SECTION E.1: Discount & Adjustments ─── */}
        {!isStaff && (
          <section className="bg-white rounded-lg p-6 shadow-sm border-l-4 border-l-amber-500">
            <div className="flex items-center gap-2 mb-3">
              <Tag size={18} className="text-amber-600" />
              <h3 className="text-xs font-extrabold uppercase tracking-widest text-[#0F172A]">Job Card Discount</h3>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <Select
                label="Discount Type"
                options={[
                  { value: 'fixed', label: 'Fixed Amount (₹)' },
                  { value: 'percentage', label: 'Percentage (%)' }
                ]}
                value={discountType}
                onChange={e => setDiscountType(e.target.value as any)}
              />
              <Input
                label={discountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                type="number"
                min="0"
                max={discountType === 'percentage' ? '100' : undefined}
                value={discountValue || ''}
                onChange={e => setDiscountValue(parseFloat(e.target.value) || 0)}
              />
            </div>

            {discountValue > 0 && (
              <div className="mt-4 pt-4 border-t border-amber-100 bg-amber-50/50 p-4 rounded-xl space-y-4">
                <div className="flex items-center gap-1.5 text-xs font-bold text-amber-900 uppercase">
                  <span>Mandatory Compliance: Reason & Reference</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <Input
                    label="Reason for Discount *"
                    placeholder="e.g. Festival offer, Corporate tie-up, Loyal customer..."
                    value={discountReason}
                    onChange={e => setDiscountReason(e.target.value)}
                    required
                  />
                  <Select
                    label="Approved By *"
                    options={approvers.map(a => ({ value: String(a.id), label: a.label }))}
                    value={discountApprovedBy}
                    onChange={e => setDiscountApprovedBy(e.target.value)}
                    placeholder="Select Super Admin / Admin…"
                  />
                </div>
              </div>
            )}
          </section>
        )}

        {/* ─── SECTION E: Grand Total ──────────────── */}
        {!isStaff && (
          <div className="bg-[#0F172A] rounded-lg p-6 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
            <div>
              <span className="text-xs text-gray-400 font-bold uppercase tracking-widest">Pricing Summary</span>
              <div className="flex items-center gap-4 mt-1">
                <span className="text-sm text-gray-300">
                  Subtotal: <strong className="text-white">₹{grandTotal.toLocaleString('en-IN')}</strong>
                </span>
                {discountValue > 0 && (
                  <span className="text-sm text-amber-400 font-semibold">
                    Discount ({discountType === 'percentage' ? `${discountValue}%` : `₹${discountValue}`}): -₹{discountAmount.toLocaleString('en-IN')}
                  </span>
                )}
              </div>
              {discountValue > 0 && discountReason && (
                <p className="text-[11px] text-gray-400 mt-1">
                  Reason: <span className="text-amber-200 font-medium">{discountReason}</span> (Approved by: {approvers.find(a => String(a.id) === discountApprovedBy)?.label || '—'})
                </p>
              )}
            </div>
            <div className="text-right">
              <span className="text-white text-xs font-bold uppercase tracking-widest block">Net Payable</span>
              <span className="text-3xl font-black text-white tracking-tight">
                ₹{netTotal.toLocaleString('en-IN')}
              </span>
            </div>
          </div>
        )}

        {/* ─── SECTION F: Actions ──────────────────── */}
        <div className="flex justify-end gap-3 pb-8">
          <Button variant="ghost" onClick={() => navigate(cancelPath)} disabled={submitting}>
            Cancel
          </Button>
          <Button variant="secondary" onClick={() => handleSave(false)} loading={submitting} disabled={submitting}>
            Save as Draft
          </Button>
          <Button onClick={() => handleSave(true)} loading={submitting} disabled={submitting}>
            Submit Job Card
          </Button>
        </div>
      </div>
    </>
  );
}
