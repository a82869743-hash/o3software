import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Plus, Trash2, ArrowLeft, Loader2, Save, ShoppingBag, Search } from 'lucide-react';
import toast from 'react-hot-toast';
import io from 'socket.io-client';

import api from '../../api/axiosInstance';
import { useServices } from '../../api/hooks/useServices';
import { usePackages } from '../../api/hooks/usePackages';
import { useCreateQuotation, useUpdateQuotation, useQuotation } from '../../api/hooks/useQuotations';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import { getCategoryForModel, carBrands as fallbackCarBrands, getModelsForBrand } from '../../utils/carData';

const CAR_SEGMENTS = [
  { value: 'hatchback', label: 'Small Hatchback', packageCarType: 'SMALL_HATCHBACK', serviceCol: 'price_hatchback' },
  { value: 'medium_hatchback', label: 'Medium Hatchback', packageCarType: 'MEDIUM_HATCHBACK', serviceCol: 'price_medium_hatchback' },
  { value: 'sedan', label: 'Sedan', packageCarType: 'SEDAN_SUV', serviceCol: 'price_sedan' },
  { value: 'premium_sedan', label: 'Premium Sedan', packageCarType: 'PREMIUM_SEDAN', serviceCol: 'price_premium_sedan' },
  { value: 'suv', label: 'SUV / Large Car', packageCarType: 'LARGE_CAR', serviceCol: 'price_suv' }
];

function formatINR(n: number) {
  return Number(n || 0).toLocaleString('en-IN', { minimumFractionDigits: 0, maximumFractionDigits: 0 });
}

interface FormItem {
  id?: string; // client-side temp id
  item_type: 'service' | 'package' | 'custom';
  item_id: number | null;
  name: string;
  price: number;
  quantity: number;
  total: number;
  pricing_type?: 'basic' | 'premium'; // packages only
}

export default function QuotationCreatePage() {
  const navigate = useNavigate();
  const { id } = useParams<{ id: string }>();
  const isEdit = !!id;

  const [customerName, setCustomerName] = useState('');
  const [customerMobile, setCustomerMobile] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [vehicleNo, setVehicleNo] = useState('');
  const [carBrand, setCarBrand] = useState('');
  const [carModel, setCarModel] = useState('');
  const [carSegment, setCarSegment] = useState('sedan');
  const [validUntil, setValidUntil] = useState('');
  const [notes, setNotes] = useState('');
  const [status, setStatus] = useState<'draft' | 'sent' | 'accepted' | 'declined'>('draft');

  const [items, setItems] = useState<FormItem[]>([]);
  const [discountType, setDiscountType] = useState<'fixed' | 'percentage'>('fixed');
  const [discountValue, setDiscountValue] = useState(0);
  const [taxPercentage, setTaxPercentage] = useState(18);
  const [applyTax, setApplyTax] = useState(true);

  // Queries & Mutations
  const { data: servicesRes, isLoading: loadingServices } = useServices({ active_only: true });
  const { data: packagesRes, isLoading: loadingPackages } = usePackages({ published_only: true });
  const { data: existingQuotation, isLoading: loadingQuotation } = useQuotation(isEdit ? Number(id) : undefined);

  const [existingCustomers, setExistingCustomers] = useState<any[]>([]);
  const [selectedCustKey, setSelectedCustKey] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  const refreshCustomerList = (searchQuery?: string) => {
    const q = searchQuery || '';
    api.get(`/search/customers?q=${encodeURIComponent(q)}&limit=100`).then(res => {
      setExistingCustomers(res.data?.data || []);
    }).catch(err => console.error(err));
  };

  useEffect(() => {
    refreshCustomerList();

    const socketUrl = import.meta.env.VITE_API_URL?.replace('/api/v1', '') || window.location.origin;
    const socket = io(socketUrl, { transports: ['websocket', 'polling'] });

    socket.on('customer_updated', () => refreshCustomerList());
    socket.on('customer_created', () => refreshCustomerList());
    socket.on('manual_bill_created', () => refreshCustomerList());

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return existingCustomers;
    const q = customerSearchQuery.trim().toLowerCase();
    return existingCustomers.filter((c: any) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.mobile && c.mobile.includes(q)) ||
      (c.vehicle_reg_no && c.vehicle_reg_no.toLowerCase().includes(q)) ||
      (c.vehicle_brand && c.vehicle_brand.toLowerCase().includes(q))
    );
  }, [existingCustomers, customerSearchQuery]);

  const applyCustomerMatch = (cust: any) => {
    if (!cust) return;
    if (cust.name) setCustomerName(cust.name);
    if (cust.mobile) setCustomerMobile(cust.mobile);
    if (cust.email) setCustomerEmail(cust.email);
    if (cust.vehicle_reg_no) setVehicleNo(cust.vehicle_reg_no);
    if (cust.vehicle_brand) setCarBrand(cust.vehicle_brand);
    if (cust.vehicle_model) setCarModel(cust.vehicle_model);
    if (cust.vehicle_category) handleSegmentChange(cust.vehicle_category);
    toast.success(`Auto-filled details for ${cust.name}`);
  };

  const handleSelectExistingCustomer = (key: string) => {
    setSelectedCustKey(key);
    if (!key) return;
    const found = existingCustomers.find((c: any, idx: number) => {
      const uniqueVal = c.id ? `user_${c.id}` : `bill_${c.mobile}_${c.name}_${idx}`;
      return uniqueVal === key;
    });
    if (found) {
      applyCustomerMatch(found);
    }
  };

  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(carBrand);

  const liveBrands: string[] = brandsRes?.data || [];
  const carBrandsList = liveBrands.length > 0 ? Array.from(new Set([...liveBrands, 'Others'])) : fallbackCarBrands;

  const liveModels: string[] = modelsRes?.data || [];
  const carModelsList = carBrand
    ? (liveModels.length > 0 ? Array.from(new Set([...liveModels, 'Other'])) : getModelsForBrand(carBrand))
    : [];

  const createMutation = useCreateQuotation();
  const updateMutation = useUpdateQuotation();

  const servicesCatalog = servicesRes?.data || [];
  const packagesCatalog = packagesRes?.data || [];

  // Default valid until date (30 days from today)
  useEffect(() => {
    if (!isEdit) {
      const d = new Date();
      d.setDate(d.getDate() + 30);
      setValidUntil(d.toISOString().split('T')[0]);
    }
  }, [isEdit]);

  // Populate form if editing
  useEffect(() => {
    if (isEdit && existingQuotation) {
      setCustomerName(existingQuotation.customer_name || '');
      setCustomerMobile(existingQuotation.customer_mobile || '');
      setCustomerEmail(existingQuotation.customer_email || '');
      setVehicleNo(existingQuotation.vehicle_no || '');
      setCarBrand(existingQuotation.car_brand || '');
      setCarModel(existingQuotation.car_model || '');
      setCarSegment(existingQuotation.car_segment || 'sedan');
      if (existingQuotation.valid_until) {
        setValidUntil(new Date(existingQuotation.valid_until).toISOString().split('T')[0]);
      }
      setNotes(existingQuotation.notes || '');
      setStatus(existingQuotation.status || 'draft');
      setDiscountType(existingQuotation.discount_type || 'fixed');
      setDiscountValue(Number(existingQuotation.discount_value || 0));
      setTaxPercentage(Number(existingQuotation.tax_percentage || 0));
      setApplyTax(Number(existingQuotation.tax_percentage || 0) > 0);

      if (existingQuotation.items) {
        setItems(existingQuotation.items.map((item: any) => ({
          id: String(item.id),
          item_type: item.item_type,
          item_id: item.item_id,
          name: item.name,
          price: Number(item.price),
          quantity: Number(item.quantity),
          total: Number(item.total),
          pricing_type: item.pricing_type || 'basic'
        })));
      }
    }
  }, [isEdit, existingQuotation]);

  // Handle Car Segment Change: recalculate prices of catalog services and packages
  const handleSegmentChange = (newSegment: string) => {
    setCarSegment(newSegment);
    
    // Recalculate rates of existing items from catalog
    setItems(prev => prev.map(item => {
      if (item.item_type === 'custom') return item;
      const rate = getPriceFromCatalog(item.item_type, item.item_id, newSegment, item.pricing_type || 'basic');
      return {
        ...item,
        price: rate,
        total: rate * item.quantity
      };
    }));
  };

  // Helper to extract segment-based price from catalogs
  const getPriceFromCatalog = (type: 'service' | 'package', itemId: number | null, segmentVal: string, packageTier: 'basic' | 'premium' = 'basic'): number => {
    if (!itemId) return 0;
    const segment = CAR_SEGMENTS.find(s => s.value === segmentVal) || CAR_SEGMENTS[2];

    if (type === 'service') {
      const found = servicesCatalog.find((s: any) => s.id === itemId);
      if (found) {
        return Number(found[segment.serviceCol]) || 0;
      }
    } else if (type === 'package') {
      const found = packagesCatalog.find((p: any) => p.id === itemId);
      if (found) {
        // Try v2 pricing matrix first
        if (found.pricing && found.pricing.length > 0) {
          const pricingRow = found.pricing.find((pr: any) => pr.car_type === segment.packageCarType && pr.pricing_type === packageTier);
          if (pricingRow) return Number(pricingRow.price);
        }
        // Fall back to package base columns
        return Number(found[segment.serviceCol]) || 0;
      }
    }
    return 0;
  };

  // Add Row
  const handleAddItemRow = () => {
    const newItem: FormItem = {
      id: crypto.randomUUID(),
      item_type: 'service',
      item_id: null,
      name: '',
      price: 0,
      quantity: 1,
      total: 0,
      pricing_type: 'basic'
    };
    setItems(prev => [...prev, newItem]);
  };

  // Remove Row
  const handleRemoveItemRow = (tempId: string) => {
    setItems(prev => prev.filter(item => item.id !== tempId));
  };

  // Update Row
  const handleUpdateItemRow = (tempId: string, updates: Partial<FormItem>) => {
    setItems(prev => prev.map(item => {
      if (item.id !== tempId) return item;
      const updated = { ...item, ...updates };

      // If switching item type or item ID, pre-fill catalog rate
      if (updates.item_type !== undefined || updates.item_id !== undefined || updates.pricing_type !== undefined) {
        const itemType = updates.item_type ?? item.item_type;
        const itemId = updates.item_id ?? item.item_id;
        const pkgTier = updates.pricing_type ?? item.pricing_type ?? 'basic';

        if (itemType !== 'custom' && itemId) {
          const catalogItem = itemType === 'service' 
            ? servicesCatalog.find((s: any) => s.id === itemId)
            : packagesCatalog.find((p: any) => p.id === itemId);
          
          updated.name = catalogItem?.name || '';
          updated.price = getPriceFromCatalog(itemType, itemId, carSegment, pkgTier);
        } else if (itemType === 'custom') {
          updated.item_id = null;
          if (updates.item_type !== undefined) {
            updated.name = '';
            updated.price = 0;
          }
        }
      }

      // Compute total
      updated.total = updated.price * updated.quantity;
      return updated;
    }));
  };

  // Totals calculation
  const subtotal = items.reduce((sum, item) => sum + item.total, 0);
  
  let discount_amount = 0;
  if (discountType === 'percentage') {
    discount_amount = subtotal * (discountValue / 100);
  } else {
    discount_amount = discountValue;
  }
  discount_amount = Math.min(subtotal, Math.max(0, discount_amount));

  const afterDiscount = Math.max(0, subtotal - discount_amount);
  const tax_amount = applyTax ? afterDiscount * (taxPercentage / 100) : 0;
  const grand_total = afterDiscount + tax_amount;

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!customerName || !customerMobile) {
      toast.error('Please enter customer name and mobile number');
      return;
    }

    if (items.length === 0) {
      toast.error('Please add at least one service or package');
      return;
    }

    const invalidRow = items.find(item => !item.name.trim() || item.price < 0 || item.quantity <= 0);
    if (invalidRow) {
      toast.error('Please ensure all items have descriptions, valid rates, and quantities');
      return;
    }

    const payload = {
      customer_name: customerName,
      customer_mobile: customerMobile,
      customer_email: customerEmail,
      vehicle_no: vehicleNo,
      car_brand: carBrand,
      car_model: carModel,
      car_segment: carSegment,
      subtotal,
      discount_type: discountType,
      discount_value: discountValue,
      discount_amount,
      tax_percentage: applyTax ? taxPercentage : 0,
      tax_amount,
      grand_total,
      valid_until: validUntil,
      notes,
      status,
      items: items.map(it => ({
        item_type: it.item_type,
        item_id: it.item_id,
        name: it.name,
        price: it.price,
        quantity: it.quantity,
        total: it.total,
        pricing_type: it.pricing_type
      }))
    };

    try {
      if (isEdit) {
        await updateMutation.mutateAsync({ id: Number(id), ...payload });
        toast.success('Quotation updated successfully');
      } else {
        await createMutation.mutateAsync(payload);
        toast.success('Quotation created successfully');
      }
      navigate('/admin/quotations');
    } catch (err) {
      toast.error('Failed to save quotation. Check server logs.');
    }
  };

  if (isEdit && loadingQuotation) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', minHeight: '60vh' }}>
        <Loader2 size={40} color="#2563EB" style={{ animation: 'spin 1s linear infinite' }} />
        <p style={{ marginTop: '16px', color: '#5f5e5e', fontWeight: 600 }}>Loading quotation details...</p>
      </div>
    );
  }

  const isPending = createMutation.isPending || updateMutation.isPending;

  return (
    <div style={{ fontFamily: "'Segoe UI', sans-serif", minHeight: '100vh', paddingBottom: '40px' }}>
      {/* ─── Header ─── */}
      <div style={{ marginBottom: '24px', display: 'flex', alignItems: 'center', gap: '16px' }}>
        <button
          onClick={() => navigate('/admin/quotations')}
          style={{ background: '#f6f3f2', border: 'none', borderRadius: '50%', padding: '10px', width: '40px', height: '40px', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: '#0F172A' }}
        >
          <ArrowLeft size={18} />
        </button>
        <div>
          <h1 style={{ fontSize: '24px', fontWeight: 800, color: '#0F172A', margin: 0, letterSpacing: '-0.5px' }}>
            {isEdit ? `Edit Quotation Estimate` : 'Create New Quotation'}
          </h1>
          <p style={{ color: '#5f5e5e', fontSize: '13px', marginTop: '2px' }}>
            Draft a detailed service estimate with segment-matched pricing
          </p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="quotation-form-grid" style={{ display: 'grid', gap: '20px', alignItems: 'start' }}>
        
        {/* Left Side Column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: Customer & Vehicle Details */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', padding: '24px' }}>
            <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', marginBottom: '18px', borderBottom: '1px solid #f5f0ef', paddingBottom: '10px' }}>
              Customer & Vehicle Details
            </h2>

            {/* Auto-fill Customer Selector with Search */}
            <div style={{ marginBottom: '16px', background: 'linear-gradient(to right, rgba(254,242,242,0.8), rgba(255,237,213,0.8))', padding: '14px', borderRadius: '12px', border: '1px solid #fca5a5', display: 'flex', flexDirection: 'column', gap: '8px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <label style={{ fontSize: '11px', fontWeight: 800, color: '#b91c1c', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                  ⚡ Search & Select Saved Customer ({filteredCustomers.length} available)
                </label>
                {selectedCustKey && (
                  <button
                    type="button"
                    onClick={() => {
                      setSelectedCustKey('');
                      setCustomerSearchQuery('');
                    }}
                    style={{ fontSize: '11px', color: '#dc2626', fontWeight: 700, textDecoration: 'underline', background: 'none', border: 'none', cursor: 'pointer' }}
                  >
                    Clear Selection
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ position: 'relative', flex: 1 }}>
                  <input
                    type="text"
                    value={customerSearchQuery}
                    onChange={(e) => setCustomerSearchQuery(e.target.value)}
                    placeholder="Type name, mobile or vehicle reg no to search..."
                    style={{ width: '100%', padding: '8px 12px 8px 30px', borderRadius: '8px', border: '1px solid #f87171', fontSize: '12px', fontWeight: 600, outline: 'none', background: 'white' }}
                  />
                  <Search size={14} style={{ position: 'absolute', left: '10px', top: '10px', color: '#9ca3af' }} />
                </div>
                <button
                  type="button"
                  onClick={() => refreshCustomerList(customerSearchQuery)}
                  style={{ padding: '8px 14px', background: '#2563EB', color: 'white', fontSize: '12px', fontWeight: 700, borderRadius: '8px', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '4px', flexShrink: 0 }}
                >
                  <Search size={12} />
                  Search
                </button>
              </div>
              <select
                value={selectedCustKey}
                onChange={(e) => handleSelectExistingCustomer(e.target.value)}
                style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #f87171', fontSize: '13px', fontWeight: 700, color: '#111827', background: 'white', outline: 'none' }}
              >
                <option value="">-- Select Saved Customer from Filtered List --</option>
                {filteredCustomers.map((c: any, idx: number) => {
                  const uniqueVal = c.id ? `user_${c.id}` : `bill_${c.mobile}_${c.name}_${idx}`;
                  return (
                    <option key={uniqueVal} value={uniqueVal}>
                      {c.name} {c.mobile ? `(${c.mobile})` : ''} {c.vehicle_reg_no ? `— [${c.vehicle_reg_no}]` : ''} {c.vehicle_brand ? `(${c.vehicle_brand} ${c.vehicle_model || ''})` : ''}
                    </option>
                  );
                })}
              </select>
            </div>

            <div className="quotation-fields-grid" style={{ display: 'grid', gap: '16px 20px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Customer Name *</label>
                <input
                  value={customerName}
                  onChange={e => setCustomerName(e.target.value)}
                  placeholder="e.g. Gaurav Patel"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Mobile Number *</label>
                <input
                  value={customerMobile}
                  onChange={e => setCustomerMobile(e.target.value)}
                  placeholder="e.g. 9876543210"
                  required
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Email Address</label>
                <input
                  type="email"
                  value={customerEmail}
                  onChange={e => setCustomerEmail(e.target.value)}
                  placeholder="e.g. customer@example.com"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Vehicle Registration No.</label>
                <input
                  value={vehicleNo}
                  onChange={e => setVehicleNo(e.target.value.toUpperCase())}
                  placeholder="e.g. GJ06AB1234"
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Car Brand</label>
                <select
                  value={carBrand}
                  onChange={e => {
                    const selectedB = e.target.value;
                    setCarBrand(selectedB);
                    setCarModel('');
                  }}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}
                >
                  <option value="">Select brand...</option>
                  {carBrandsList.map(b => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#5f5e5e', marginBottom: '6px' }}>Car Model</label>
                <select
                  value={carModel}
                  onChange={e => {
                    const selectedM = e.target.value;
                    setCarModel(selectedM);
                    if (carBrand && selectedM && selectedM !== 'Other') {
                      const autoCat = getCategoryForModel(carBrand, selectedM);
                      if (autoCat) handleSegmentChange(autoCat);
                    }
                  }}
                  disabled={!carBrand}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1px solid #ede8e7', fontSize: '13px', outline: 'none', background: 'white', cursor: 'pointer' }}
                >
                  <option value="">{carBrand ? 'Select model...' : 'Select brand first'}</option>
                  {carModelsList.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>

              <div className="quotation-segment-col">
                <label style={{ display: 'block', fontSize: '12px', fontWeight: 700, color: '#2563EB', marginBottom: '6px' }}>
                  Vehicle Segment (Pricing Dictator) *
                </label>
                <select
                  value={carSegment}
                  onChange={e => handleSegmentChange(e.target.value)}
                  style={{ width: '100%', padding: '10px 12px', borderRadius: '8px', border: '1.5px solid #2563EB', fontSize: '13px', fontWeight: 600, outline: 'none', background: 'white', cursor: 'pointer' }}
                >
                  {CAR_SEGMENTS.map(seg => (
                    <option key={seg.value} value={seg.value}>{seg.label}</option>
                  ))}
                </select>
                <p style={{ fontSize: '11px', color: '#9e9e9e', marginTop: '4px' }}>
                  Changing the segment automatically updates the prices of added services and packages.
                </p>
              </div>
            </div>
          </div>

          {/* Card: Services & Packages Estimator */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '18px', borderBottom: '1px solid #f5f0ef', paddingBottom: '10px' }}>
              <h2 style={{ fontSize: '16px', fontWeight: 700, color: '#0F172A', margin: 0 }}>
                Quoted Services & Packages
              </h2>
              <button
                type="button"
                onClick={handleAddItemRow}
                style={{ display: 'flex', alignItems: 'center', gap: '6px', padding: '6px 12px', background: '#2563EB', color: 'white', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}
              >
                <Plus size={13} /> Add Item
              </button>
            </div>

            {items.length === 0 ? (
              <div style={{ padding: '40px 20px', textAlign: 'center', border: '2px dashed #ede8e7', borderRadius: '8px' }}>
                <ShoppingBag size={32} color="#bdbdbd" style={{ marginBottom: '8px' }} />
                <p style={{ fontSize: '13px', color: '#9e9e9e', fontWeight: 600 }}>No items added yet</p>
                <button
                  type="button"
                  onClick={handleAddItemRow}
                  style={{ marginTop: '8px', color: '#2563EB', background: 'transparent', border: 'none', fontWeight: 700, fontSize: '12px', cursor: 'pointer' }}
                >
                  Click here to add the first item
                </button>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                {items.map((item, idx) => (
                  <div
                    key={item.id}
                    className="quotation-item-row"
                    style={{
                      display: 'grid',
                      gap: '12px',
                      alignItems: 'center',
                      padding: '12px',
                      background: '#f9f6f5',
                      borderRadius: '10px',
                      border: '1px solid #ede8e7'
                    }}
                  >
                    {/* Item Type */}
                    <select
                      value={item.item_type}
                      onChange={e => handleUpdateItemRow(item.id!, { item_type: e.target.value as any, item_id: null, name: '', price: 0 })}
                      style={{ padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', background: 'white', outline: 'none' }}
                    >
                      <option value="service">Service</option>
                      <option value="package">Package</option>
                      <option value="custom">Custom Item</option>
                    </select>

                    {/* Item Selector / Custom Name */}
                    {item.item_type === 'service' ? (
                      <select
                        value={item.item_id || ''}
                        onChange={e => handleUpdateItemRow(item.id!, { item_id: Number(e.target.value) })}
                        style={{ padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', background: 'white', outline: 'none' }}
                      >
                        <option value="">-- Select Service --</option>
                        {servicesCatalog.map((s: any) => (
                          <option key={s.id} value={s.id}>{s.name}</option>
                        ))}
                      </select>
                    ) : item.item_type === 'package' ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                        <select
                          value={item.item_id || ''}
                          onChange={e => handleUpdateItemRow(item.id!, { item_id: Number(e.target.value) })}
                          style={{ padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', background: 'white', outline: 'none' }}
                        >
                          <option value="">-- Select Package --</option>
                          {packagesCatalog.map((p: any) => (
                            <option key={p.id} value={p.id}>{p.name}</option>
                          ))}
                        </select>
                        {item.item_id && (
                          <div style={{ display: 'flex', gap: '10px', alignItems: 'center' }}>
                            <label style={{ fontSize: '10px', color: '#5f5e5e', fontWeight: 700 }}>Tier:</label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`tier-${item.id}`}
                                checked={item.pricing_type === 'basic'}
                                onChange={() => handleUpdateItemRow(item.id!, { pricing_type: 'basic' })}
                              />
                              Basic
                            </label>
                            <label style={{ display: 'flex', alignItems: 'center', gap: '3px', fontSize: '10px', cursor: 'pointer' }}>
                              <input
                                type="radio"
                                name={`tier-${item.id}`}
                                checked={item.pricing_type === 'premium'}
                                onChange={() => handleUpdateItemRow(item.id!, { pricing_type: 'premium' })}
                              />
                              Premium
                            </label>
                          </div>
                        )}
                      </div>
                    ) : (
                      <input
                        value={item.name}
                        onChange={e => handleUpdateItemRow(item.id!, { name: e.target.value })}
                        placeholder="Enter item description..."
                        style={{ padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', background: 'white', outline: 'none' }}
                      />
                    )}

                    {/* Rate (Pre-filled / Editable) */}
                    <div>
                      <input
                        type="number"
                        value={item.price}
                        onChange={e => handleUpdateItemRow(item.id!, { price: parseFloat(e.target.value) || 0 })}
                        placeholder="Rate"
                        style={{ width: '100%', padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                      />
                    </div>

                    {/* Qty */}
                    <div>
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={e => handleUpdateItemRow(item.id!, { quantity: parseInt(e.target.value) || 1 })}
                        style={{ width: '100%', padding: '8px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', outline: 'none', textAlign: 'center' }}
                      />
                    </div>

                    {/* Total */}
                    <div style={{ fontSize: '13px', fontWeight: 800, color: '#0F172A', textAlign: 'right', paddingRight: '4px' }}>
                      ₹{formatINR(item.total)}
                    </div>

                    {/* Delete Icon */}
                    <button
                      type="button"
                      onClick={() => handleRemoveItemRow(item.id!)}
                      style={{ background: 'transparent', border: 'none', cursor: 'pointer', color: '#9e9e9e', display: 'flex', justifyContent: 'center' }}
                    >
                      <Trash2 size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Side Column (Calculations, Status, Submit) */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
          
          {/* Card: General Settings */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>Estimate Settings</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5f5e5e', marginBottom: '4px' }}>Quotation Status</label>
                <select
                  value={status}
                  onChange={e => setStatus(e.target.value as any)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ede8e7', fontSize: '12px', outline: 'none', background: 'white', cursor: 'pointer' }}
                >
                  <option value="draft">Draft</option>
                  <option value="sent">Sent</option>
                  <option value="accepted">Accepted</option>
                  <option value="declined">Declined</option>
                </select>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5f5e5e', marginBottom: '4px' }}>Valid Until Date</label>
                <input
                  type="date"
                  value={validUntil}
                  onChange={e => setValidUntil(e.target.value)}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ede8e7', fontSize: '12px', outline: 'none' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '11px', fontWeight: 700, color: '#5f5e5e', marginBottom: '4px' }}>Quotation / Notes</label>
                <textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder="Terms, specific notes, car condition details..."
                  rows={3}
                  style={{ width: '100%', padding: '8px 10px', borderRadius: '6px', border: '1px solid #ede8e7', fontSize: '12px', outline: 'none', resize: 'vertical' }}
                />
              </div>
            </div>
          </div>

          {/* Card: Quotation Summary Card */}
          <div style={{ background: 'white', borderRadius: '14px', border: '1px solid #ede8e7', padding: '20px' }}>
            <h3 style={{ fontSize: '14px', fontWeight: 700, color: '#0F172A', marginBottom: '14px' }}>Summary</h3>

            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', fontSize: '13px', color: '#5f5e5e' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span>Subtotal ({items.length} items)</span>
                <span style={{ fontWeight: 600, color: '#0F172A' }}>₹{formatINR(subtotal)}</span>
              </div>

              {/* Discount inputs */}
              <div style={{ borderTop: '1px solid #f5f0ef', borderBottom: '1px solid #f5f0ef', padding: '10px 0' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <span>Discount</span>
                  <div style={{ display: 'flex', gap: '4px' }}>
                    <button
                      type="button"
                      onClick={() => setDiscountType('fixed')}
                      style={{ border: '1px solid #ede8e7', padding: '2px 6px', fontSize: '10px', fontWeight: 700, background: discountType === 'fixed' ? '#0F172A' : 'white', color: discountType === 'fixed' ? 'white' : '#5f5e5e', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      ₹ Fixed
                    </button>
                    <button
                      type="button"
                      onClick={() => setDiscountType('percentage')}
                      style={{ border: '1px solid #ede8e7', padding: '2px 6px', fontSize: '10px', fontWeight: 700, background: discountType === 'percentage' ? '#0F172A' : 'white', color: discountType === 'percentage' ? 'white' : '#5f5e5e', borderRadius: '4px', cursor: 'pointer' }}
                    >
                      % Percent
                    </button>
                  </div>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <input
                    type="number"
                    value={discountValue}
                    min="0"
                    onChange={e => setDiscountValue(Math.max(0, parseFloat(e.target.value) || 0))}
                    style={{ width: '100%', padding: '6px', border: '1px solid #ede8e7', borderRadius: '6px', fontSize: '12px', outline: 'none' }}
                  />
                  <span style={{ fontSize: '11px', color: '#9e9e9e', whiteSpace: 'nowrap' }}>
                    (- ₹{formatINR(discount_amount)})
                  </span>
                </div>
              </div>

              {/* GST options */}
              <div style={{ borderBottom: '1px solid #f5f0ef', paddingBottom: '10px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                  <label style={{ display: 'flex', alignItems: 'center', gap: '6px', cursor: 'pointer' }}>
                    <input
                      type="checkbox"
                      checked={applyTax}
                      onChange={e => setApplyTax(e.target.checked)}
                    />
                    <span>Apply GST (Tax)</span>
                  </label>
                  {applyTax && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                      <input
                        type="number"
                        value={taxPercentage}
                        onChange={e => setTaxPercentage(Math.max(0, parseFloat(e.target.value) || 0))}
                        style={{ width: '45px', padding: '2px 4px', border: '1px solid #ede8e7', borderRadius: '4px', fontSize: '11px', outline: 'none', textAlign: 'center' }}
                      />
                      <span>%</span>
                    </div>
                  )}
                </div>
                {applyTax && (
                  <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '12px', color: '#9e9e9e' }}>
                    <span>GST Amount</span>
                    <span>₹{formatINR(tax_amount)}</span>
                  </div>
                )}
              </div>

              {/* Grand Total */}
              <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '16px', fontWeight: 800, color: '#2563EB', marginTop: '6px', borderTop: '2px double #ede8e7', paddingTop: '10px' }}>
                <span>Grand Total</span>
                <span>₹{formatINR(grand_total)}</span>
              </div>
            </div>

            {/* Action Buttons */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '20px' }}>
              <button
                type="submit"
                disabled={isPending}
                style={{
                  width: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: '8px',
                  background: '#2563EB',
                  color: 'white',
                  border: 'none',
                  borderRadius: '10px',
                  padding: '12px',
                  fontWeight: 700,
                  fontSize: '14px',
                  cursor: isPending ? 'not-allowed' : 'pointer',
                  boxShadow: '0 2px 8px rgba(211,47,47,0.25)',
                  transition: 'background 0.1s'
                }}
                onMouseEnter={e => { if(!isPending) e.currentTarget.style.background = '#C62828'; }}
                onMouseLeave={e => { if(!isPending) e.currentTarget.style.background = '#2563EB'; }}
              >
                {isPending ? (
                  <Loader2 size={16} style={{ animation: 'spin 1s linear infinite' }} />
                ) : (
                  <Save size={16} />
                )}
                {isEdit ? 'Save Changes' : 'Create Quotation'}
              </button>

              <button
                type="button"
                onClick={() => navigate('/admin/quotations')}
                style={{ width: '100%', background: 'transparent', color: '#5f5e5e', border: '1px solid #ede8e7', borderRadius: '10px', padding: '10px', fontWeight: 600, fontSize: '13px', cursor: 'pointer' }}
              >
                Cancel
              </button>
            </div>
          </div>

        </div>

      </form>
      <style>{`
        @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
        .quotation-form-grid { grid-template-columns: 1fr 340px; }
        .quotation-fields-grid { grid-template-columns: 1fr 1fr; }
        .quotation-segment-col { grid-column: span 2; }
        .quotation-item-row { grid-template-columns: 120px 1fr 100px 70px 100px 30px; }
        @media (max-width: 768px) {
          .quotation-form-grid { grid-template-columns: 1fr !important; }
          .quotation-fields-grid { grid-template-columns: 1fr !important; }
          .quotation-segment-col { grid-column: span 1; }
          .quotation-item-row { grid-template-columns: 1fr 1fr !important; }
        }
      `}</style>
    </div>
  );
}
