import { normalizeCarType } from '../../utils/carTypes';
import { CAR_TYPES } from '../../utils/carTypes';
import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import io from 'socket.io-client';
import {
  IndianRupee, Package, Search, Plus, Trash2, User, Car,
  FileText, ShieldCheck, Tag, AlertTriangle
} from 'lucide-react';
import { useForm, useFieldArray } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import * as z from 'zod';
import toast from 'react-hot-toast';

import AdminTopBar from '../../components/layout/AdminTopBar';
import Button from '../../components/ui/Button';
import api from '../../api/axiosInstance';
import { useInventory } from '../../api/hooks/useInventory';
import { useServices } from '../../api/hooks/useServices';
import { useLoyaltySearch } from '../../api/hooks/useLoyalty';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import { carBrands, getModelsForBrand, getCategoryForModel } from '../../utils/carData';
import { formatINR } from '../../utils/formatters';
import { carImage } from '../../utils/carImage';
import { socketUrl } from '../../utils/endpoints';
import Dropdown from '../../components/ui/Dropdown';
import { can } from '../../utils/access';
import { useAuthStore } from '../../store/authStore';

const schema = z.object({
  customer_name: z.string().min(1, 'Customer name is required'),
  customer_mobile: z.string().min(10, 'Valid mobile number is required'),
  description: z.string().optional(),
  discount_type: z.enum(['fixed', 'percentage']).optional(),
  discount_value: z.number().min(0).optional(),
  discount_reason: z.string().optional(),
  discount_reference: z.string().optional(),
  gst_type: z.enum(['with_gst', 'none']).optional(),
  gst_pct: z.number().min(0).optional(),
  items: z.array(z.object({
    type: z.enum(['service', 'product']),
    id: z.number().optional(),
    name: z.string().min(1, 'Name is required'),
    price: z.number().min(0, 'Price must be non-negative'),
    quantity: z.number().min(1, 'Quantity must be at least 1'),
  })).min(1, 'Add at least one item to bill'),
  payment_method: z.enum(['cash', 'upi', 'card', 'bank_transfer', 'other']),
  loyalty_redeemed: z.boolean().optional(),
  vehicle_brand: z.string().optional(),
  vehicle_model: z.string().optional(),
  vehicle_reg_no: z.string().optional(),
  vehicle_category: z.string().optional(),
});

type QuickBillForm = z.infer<typeof schema>;

export default function QuickBillingPage() {
  const navigate = useNavigate();
  const authUser = useAuthStore((s) => s.user);
  const [submitting, setSubmitting] = useState(false);

  const { data: inventoryData } = useInventory({ limit: 1000 });
  const { data: servicesData } = useServices();

  const products = inventoryData?.data || [];
  const services = Array.isArray(servicesData) ? servicesData : (servicesData?.data || []);

  const {
    register, control, handleSubmit, watch, setValue,
    formState: { errors }
  } = useForm<QuickBillForm>({
    resolver: zodResolver(schema),
    defaultValues: {
      customer_name: '',
      customer_mobile: '',
      items: [],
      discount_type: 'fixed',
      discount_value: 0,
      discount_reason: '',
      discount_reference: '',
      gst_type: 'with_gst',
      gst_pct: 18,
      payment_method: 'cash',
      loyalty_redeemed: false,
      vehicle_brand: '',
      vehicle_model: '',
      vehicle_reg_no: '',
      vehicle_category: '',
    }
  });

  const { fields, append, remove } = useFieldArray({
    control,
    name: 'items'
  });

  const selectedBrand = watch('vehicle_brand');
  const { data: brandsResponse } = useBrands();
  const { data: modelsResponse } = useModels(selectedBrand || '');

  const brandsList = brandsResponse?.data || [];
  const modelsList = modelsResponse?.data || [];

  const watchedItems = watch("items") || [];
  const discountType = watch("discount_type");
  const discountValue = watch("discount_value") || 0;
  const gstType = watch("gst_type") || 'with_gst';
  const gstPct = watch("gst_pct") !== undefined ? watch("gst_pct")! : 18;

  const subtotal = watchedItems.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
  
  const watchedCustomerMobile = watch("customer_mobile");
  const watchedCustomerName = watch("customer_name");
  const watchedRegNo = watch("vehicle_reg_no");
  const currentBrand = watch("vehicle_brand") || '';
  const currentModel = watch("vehicle_model") || '';
  const currentCategory = watch("vehicle_category") || '';

  // Lookup loyalty by mobile if length >= 10
  const { data: loyaltyCustomers } = useLoyaltySearch(watchedCustomerMobile?.length >= 10 ? watchedCustomerMobile : '');
  const matchedCustomer = loyaltyCustomers?.find((c: any) => c.mobile === watchedCustomerMobile);
  const availableCredits = matchedCustomer?.credits || 0;

  const liveBrands = brandsResponse?.data || [];
  const effectiveBrands = useMemo(() => {
    return Array.from(new Set([...liveBrands, ...carBrands, currentBrand].filter(Boolean)));
  }, [liveBrands, currentBrand]);

  const liveModels = (modelsResponse?.data || []).map((m: any) => typeof m === 'string' ? m : m.model);
  const datasetModels = currentBrand ? getModelsForBrand(currentBrand) : [];
  const effectiveModels = useMemo(() => {
    return Array.from(new Set([...liveModels, ...datasetModels, currentModel].filter(Boolean))).map(m => ({ model: m }));
  }, [liveModels, datasetModels, currentModel]);

  const applyCustomerMatch = (match: any) => {
    if (!match) return;
    if (match.name) setValue('customer_name', match.name);
    if (match.mobile) setValue('customer_mobile', match.mobile);
    if (match.vehicle_brand) setValue('vehicle_brand', match.vehicle_brand);
    if (match.vehicle_model) setValue('vehicle_model', match.vehicle_model);
    if (match.vehicle_reg_no) setValue('vehicle_reg_no', match.vehicle_reg_no);
    const cat = normalizeCarType(match.vehicle_category) || (match.vehicle_model ? getCategoryForModel(match.vehicle_brand || '', match.vehicle_model) : '');
    if (cat) setValue('vehicle_category', cat);
  };

  let discountAmount = 0;
  if (discountType === 'percentage') {
    discountAmount = subtotal * (discountValue / 100);
  } else {
    discountAmount = discountValue;
  }
  discountAmount = Math.min(subtotal, Math.max(0, discountAmount));
  const amountAfterDiscount = subtotal - discountAmount;

  const isWithGst = gstType === 'with_gst';
  const gstAmount = isWithGst ? (amountAfterDiscount * (gstPct / 100)) : 0;

  const total = Math.max(0, amountAfterDiscount + gstAmount);

  const applyLoyaltyCredits = () => {
    if (availableCredits > 0) {
      setValue('discount_type', 'fixed');
      const redeemAmt = subtotal > 0 ? Math.min(availableCredits, subtotal) : availableCredits;
      setValue('discount_value', redeemAmt);
      setValue('loyalty_redeemed', true);
      toast.success(`Applied ${formatINR(redeemAmt)} loyalty credits as discount!`);
    }
  };

  const handleAddService = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    if (val === 'other') {
      append({ type: 'service', id: undefined, name: '', price: 0, quantity: 1 });
    } else {
      const sId = Number(val);
      const service = services.find((s: any) => s.id === sId);
      if (service) {
        const catKey = currentCategory ? `price_${currentCategory}` : 'price_sedan';
        const parsedPrice = Number(service[catKey] || service.price_sedan || service.price_hatchback || service.price || 0);
        append({ type: 'service', id: service.id, name: service.name, price: isNaN(parsedPrice) ? 0 : parsedPrice, quantity: 1 });
      }
    }
    e.target.value = ''; // reset
  };

  const handleAddProduct = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    if (!val) return;
    if (val === 'other') {
      append({ type: 'product', id: undefined, name: '', price: 0, quantity: 1 });
    } else {
      const pId = Number(val);
      const prod = products.find((p: any) => p.id === pId);
      if (prod) {
        const parsedPrice = Number((prod as any).selling_price || (prod as any).franchise_price || (prod as any).price || 0);
        append({ type: 'product', id: prod.id, name: prod.product_name, price: isNaN(parsedPrice) ? 0 : parsedPrice, quantity: 1 });
      }
    }
    e.target.value = ''; // reset
  };

  const onSubmit = async (data: QuickBillForm) => {
    try {
      setSubmitting(true);
      
      const payloadServices = data.items.filter(i => i.type === 'service').map(i => ({ service_name: i.name, price: i.price }));
      const payloadProducts = data.items.filter(i => i.type === 'product').map(i => ({ id: i.id, product_name: i.name, price: i.price, quantity: i.quantity }));

      if ((data.discount_value || 0) > 0) {
        if (!data.discount_reason?.trim() || !data.discount_reference?.trim()) {
          toast.error('Discount reason and approved/referred by are mandatory');
          setSubmitting(false);
          return;
        }
      }

      const payload = {
        customer_id: matchedCustomer?.id,
        customer_name: data.customer_name,
        customer_mobile: data.customer_mobile,
        description: data.description || 'Quick Bill',
        amount: total,
        discount_type: data.discount_type,
        discount_value: data.discount_value,
        discount_reason: data.discount_reason,
        discount_reference: data.discount_reference,
        gst_type: data.gst_type,
        gst_pct: data.gst_pct,
        services: payloadServices,
        products: payloadProducts,
        payment_method: data.payment_method,
        loyalty_redeemed: data.loyalty_redeemed,
        vehicle_brand: data.vehicle_brand,
        vehicle_model: data.vehicle_model,
        vehicle_reg_no: data.vehicle_reg_no,
        vehicle_category: data.vehicle_category,
      };

      const res = await api.post('/billing', payload);
      toast.success('Bill generated successfully!');
      
      // Show the new bill in All Invoices → Manual Bills (the old /admin/dashboard path does not exist)
      navigate(can(authUser, 'invoices') ? '/admin/invoices' : '/admin');
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to generate bill');
    } finally {
      setSubmitting(false);
    }
  };

  const [existingCustomers, setExistingCustomers] = useState<any[]>([]);
  const [selectedCustKey, setSelectedCustKey] = useState('');
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');

  const refreshCustomerList = (searchQuery?: string) => {
    const q = searchQuery || '';
    api.get(`/search/customers?q=${encodeURIComponent(q)}&limit=100`).then(res => {
      const data = res.data?.data || [];
      setExistingCustomers(data);
    }).catch(err => console.error(err));
  };

  useEffect(() => {
    refreshCustomerList();

    // Setup Socket.io real-time listener for customer & bill updates
    const wsUrl = socketUrl();
    const socket = io(wsUrl, { transports: ['websocket', 'polling'] });

    socket.on('customer_updated', () => refreshCustomerList());
    socket.on('new_booking', () => refreshCustomerList());
    socket.on('customer_created', () => refreshCustomerList());
    socket.on('manual_bill_created', () => refreshCustomerList());

    return () => {
      socket.disconnect();
    };
  }, []);

  const filteredCustomers = useMemo(() => {
    if (!customerSearchQuery.trim()) return existingCustomers.slice(0, 50);
    const q = customerSearchQuery.trim().toLowerCase();
    const matches = existingCustomers.filter((c: any) =>
      (c.name && c.name.toLowerCase().includes(q)) ||
      (c.mobile && c.mobile.includes(q)) ||
      (c.vehicle_reg_no && c.vehicle_reg_no.toLowerCase().includes(q)) ||
      (c.vehicle_brand && c.vehicle_brand.toLowerCase().includes(q))
    );
    return matches.slice(0, 50);
  }, [existingCustomers, customerSearchQuery]);

  const handleSelectExistingCustomer = (key: string) => {
    setSelectedCustKey(key);
    if (!key) return;
    const found = existingCustomers.find((c: any, idx: number) => {
      const uniqueVal = c.id ? `user_${c.id}` : `bill_${c.mobile}_${c.name}_${idx}`;
      return uniqueVal === key;
    });
    if (found) {
      applyCustomerMatch(found);
      toast.success(`Auto-filled details for ${found.name}`);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50/50 pb-20">
      <AdminTopBar
        title="Quick Billing (POS)"
        subtitle="Generate instant invoices without job cards"
      />

      <div className="max-w-4xl mx-auto space-y-6">
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-6">
          
          {/* Customer Details */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-[#0F172A] mb-3 flex items-center gap-2">
              <User size={18} className="text-[#2563EB]" /> Customer Details
            </h2>

            {/* Find a saved customer: search, then tap a card (fills name, mobile and car) */}
            <div className="mb-4 space-y-2">
              <div className="relative">
                <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="text" value={customerSearchQuery}
                  onChange={(e) => { setCustomerSearchQuery(e.target.value); if (selectedCustKey) setSelectedCustKey(''); }}
                  onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); refreshCustomerList(customerSearchQuery); } }}
                  placeholder="Find saved customer — name, mobile or number plate"
                  className="w-full pl-10 pr-24 py-3 rounded-xl bg-slate-50 border border-slate-200 text-sm font-semibold text-slate-900 outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white" />
                <button type="button" onClick={() => refreshCustomerList(customerSearchQuery)}
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 px-3 py-1.5 bg-[#2563EB] text-white text-xs font-bold rounded-lg">Search</button>
              </div>
              {selectedCustKey ? (
                <div className="flex items-center justify-between gap-2 rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2">
                  <span className="text-xs font-bold text-emerald-800">✓ Customer filled in below</span>
                  <button type="button" onClick={() => { setSelectedCustKey(''); setCustomerSearchQuery(''); }} className="text-xs font-bold text-emerald-800 underline">Change</button>
                </div>
              ) : customerSearchQuery.trim() && (
                <div className="max-h-64 overflow-y-auto rounded-xl border border-slate-100 divide-y divide-slate-100 bg-white">
                  {filteredCustomers.slice(0, 12).map((c: any, idx: number) => {
                    const key = c.id ? `user_${c.id}` : `bill_${c.mobile}_${c.name}_${idx}`;
                    return (
                      <button type="button" key={key} onClick={() => handleSelectExistingCustomer(key)} className="w-full flex items-center gap-3 px-3 py-2.5 text-left hover:bg-blue-50/50">
                        <img src={carImage({ brand: c.vehicle_brand, model: c.vehicle_model, category: c.vehicle_category })} alt="" className="w-12 h-8 object-contain shrink-0" />
                        <span className="min-w-0 flex-1">
                          <span className="block text-sm font-bold text-slate-900 truncate">{c.name}</span>
                          <span className="block text-[11px] text-slate-500 truncate">{c.mobile}{c.vehicle_reg_no ? ` · ${c.vehicle_reg_no}` : ''}{c.vehicle_brand ? ` · ${c.vehicle_brand} ${c.vehicle_model || ''}` : ''}</span>
                        </span>
                        <span className="text-[11px] font-bold text-[#2563EB] shrink-0">Use</span>
                      </button>
                    );
                  })}
                  {!filteredCustomers.length && <p className="px-3 py-3 text-xs text-slate-400">No saved customer found — fill the details below for a new one.</p>}
                </div>
              )}
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Customer Name</label>
                <input
                  type="text"
                  {...register("customer_name")}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-all text-sm font-semibold"
                  placeholder="e.g. Rahul Sharma"
                />
                {errors.customer_name && <p className="text-blue-500 text-xs mt-1">{errors.customer_name.message}</p>}
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Mobile Number</label>
                <input
                  type="text"
                  {...register("customer_mobile")}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-all text-sm font-semibold"
                  placeholder="e.g. 9876543210"
                />
                {errors.customer_mobile && <p className="text-blue-500 text-xs mt-1">{errors.customer_mobile.message}</p>}
                
                {availableCredits > 0 && (
                  <div className="mt-2 p-2 bg-green-50 rounded-lg flex items-center justify-between border border-green-100">
                    <div>
                      <p className="text-[10px] font-bold uppercase text-green-700">Available Credits</p>
                      <p className="text-sm font-black text-green-800">{formatINR(availableCredits)}</p>
                    </div>
                    <button 
                      type="button" 
                      onClick={applyLoyaltyCredits}
                      className="px-3 py-1 bg-green-600 text-white text-xs font-bold rounded hover:bg-green-700"
                    >
                      Redeem
                    </button>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Vehicle Details */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <h2 className="text-lg font-bold text-[#0F172A] mb-4 flex items-center gap-2">
              <Car size={18} className="text-[#2563EB]" /> Vehicle Details
            </h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Vehicle Brand</label>
                <Dropdown
                  value={currentBrand}
                  onChange={(e) => {
                    setValue("vehicle_brand", e.target.value);
                    setValue("vehicle_model", "");
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#2563EB] outline-none bg-white font-medium"
                >
                  <option value="">-- Select Brand --</option>
                  {effectiveBrands.map((b: string) => (
                    <option key={b} value={b}>{b}</option>
                  ))}
                </Dropdown>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Vehicle Model</label>
                <Dropdown
                  value={currentModel}
                  disabled={!currentBrand}
                  onChange={(e) => {
                    const modelName = e.target.value;
                    setValue("vehicle_model", modelName);
                    const autoCat = getCategoryForModel(currentBrand, modelName);
                    if (autoCat) {
                      setValue("vehicle_category", autoCat);
                    }
                  }}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#2563EB] outline-none bg-white disabled:bg-gray-100 disabled:text-gray-400 font-medium"
                >
                  <option value="">{currentBrand ? '-- Select Model --' : 'Select Brand First'}</option>
                  {effectiveModels.map((m: any) => {
                    const mName = typeof m === 'string' ? m : m.model;
                    return <option key={mName} value={mName}>{mName}</option>;
                  })}
                </Dropdown>
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Registration Number</label>
                <input
                  type="text"
                  {...register("vehicle_reg_no")}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none transition-all uppercase text-sm font-semibold"
                  placeholder="e.g. MH12AB1234"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1">Category</label>
                <Dropdown
                  value={currentCategory}
                  onChange={(e) => setValue("vehicle_category", e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#2563EB] outline-none bg-white font-medium"
                >
                  <option value="">Select Category...</option>
                  {CAR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </Dropdown>
              </div>
            </div>
          </div>

          {/* Add Items */}
          <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
            <div className="flex justify-between items-center mb-4">
              <h2 className="text-lg font-bold text-[#0F172A] flex items-center gap-2">
                <Package size={18} className="text-[#2563EB]" /> Bill Items
              </h2>
            </div>

            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#64748B] mb-1">Add Service</label>
                <Dropdown onChange={handleAddService} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#2563EB] outline-none">
                  <option value="">-- Select Service --</option>
                  {services.map((s: any) => (
                    <option key={s.id} value={s.id}>{s.name} (₹{s.price})</option>
                  ))}
                  <option value="other">-- Other (Custom) --</option>
                </Dropdown>
              </div>
              <div className="flex-1">
                <label className="block text-xs font-bold text-[#64748B] mb-1">Add Product</label>
                <Dropdown onChange={handleAddProduct} className="w-full px-3 py-2 rounded-lg border border-gray-200 text-sm focus:border-[#2563EB] outline-none">
                  <option value="">-- Select Inventory Product --</option>
                  {products.map((p: any) => (
                    <option key={p.id} value={p.id} disabled={Number(p.quantity) <= 0}>{p.product_name} {Number(p.quantity) <= 0 ? "— 0 stock left, kindly reorder from main admin" : `(${Number(p.quantity)} in stock)`}</option>
                  ))}
                  <option value="other">-- Other (Custom) --</option>
                </Dropdown>
              </div>
            </div>

            {errors.items && <p className="text-blue-500 text-xs mb-4">{errors.items.message}</p>}

            {fields.length > 0 ? (
              <div className="space-y-3">
                {fields.map((field, index) => (
                  <div key={field.id} className="flex flex-col sm:flex-row gap-3 p-3 bg-[#F8FAFC] rounded-xl border border-gray-100 items-start sm:items-center">
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-[#64748B] uppercase mb-1">{watchedItems[index].type}</p>
                      <input
                        {...register(`items.${index}.name` as const)}
                        className="w-full px-2 py-1 bg-white rounded border border-gray-200 text-sm font-medium"
                      />
                    </div>
                    
                    <div className="w-full sm:w-24">
                      <p className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Price</p>
                      <input
                        type="number"
                        {...register(`items.${index}.price` as const, { valueAsNumber: true })}
                        className="w-full px-2 py-1 bg-white rounded border border-gray-200 text-sm"
                      />
                    </div>

                    {watchedItems[index].type === 'product' && (
                      <div className="w-full sm:w-20">
                        <p className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Qty</p>
                        <input
                          type="number"
                          {...register(`items.${index}.quantity` as const, { valueAsNumber: true })}
                          className="w-full px-2 py-1 bg-white rounded border border-gray-200 text-sm"
                        />
                      </div>
                    )}

                    <div className="w-full sm:w-24 text-right">
                      <p className="text-[10px] font-bold text-[#64748B] uppercase mb-1">Amount</p>
                      <p className="font-bold text-[#0F172A]">
                        ₹{((watchedItems[index]?.price || 0) * (watchedItems[index]?.quantity || 1)).toLocaleString('en-IN')}
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => remove(index)}
                      className="p-1.5 text-blue-500 hover:bg-blue-50 rounded-lg mt-4 sm:mt-0"
                    >
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-center py-8 bg-gray-50 rounded-xl border border-dashed border-gray-200">
                <Package size={24} className="text-gray-300 mx-auto mb-2" />
                <p className="text-sm text-[#64748B]">No items added yet.</p>
              </div>
            )}
          </div>

          {/* Payment & Summary */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100">
                <h2 className="text-sm font-bold text-[#0F172A] mb-4">Payment & Notes</h2>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1">Payment Method</label>
                    <Dropdown
                      name="payment_method"
                      value={watch('payment_method')}
                      onChange={(e: any) => setValue('payment_method', e.target.value, { shouldDirty: true, shouldValidate: true })}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none"
                    >
                      <option value="cash">Cash</option>
                      <option value="upi">UPI / QR Code</option>
                      <option value="card">Credit/Debit Card</option>
                      <option value="bank_transfer">Bank Transfer</option>
                      <option value="other">Other</option>
                    </Dropdown>
                  </div>
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1">Bill Description / Notes</label>
                    <textarea
                      {...register("description")}
                      rows={3}
                      className="w-full px-3 py-2 rounded-lg border border-gray-200 focus:border-[#2563EB] focus:ring-1 focus:ring-[#2563EB] outline-none"
                      placeholder="Optional notes..."
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white p-6 rounded-2xl shadow-sm border border-gray-100 h-fit">
              <h2 className="text-sm font-bold text-[#0F172A] mb-4">Bill Summary</h2>
              
              <div className="space-y-3 mb-4 pb-4 border-b border-gray-100">
                <div className="flex justify-between text-sm">
                  <span className="text-[#64748B] font-medium">Subtotal</span>
                  <span className="font-bold text-[#0F172A]">{formatINR(subtotal)}</span>
                </div>
                
                {/* GST Tax Mode Toggle */}
                <div className="bg-gray-50 p-2.5 rounded-xl border border-gray-200 my-2 space-y-2">
                  <label className="block text-[10px] font-extrabold uppercase tracking-wider text-slate-500">
                    GST Tax Mode
                  </label>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setValue("gst_type", "with_gst")}
                      className={`py-1.5 px-2 font-extrabold text-xs rounded-lg border text-center transition-colors ${
                        gstType === 'with_gst'
                          ? 'bg-[#2563EB] text-white border-[#2563EB]'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      With GST
                    </button>
                    <button
                      type="button"
                      onClick={() => setValue("gst_type", "none")}
                      className={`py-1.5 px-2 font-bold text-xs rounded-lg border text-center transition-colors ${
                        gstType === 'none'
                          ? 'bg-gray-800 text-white border-gray-800'
                          : 'bg-white text-gray-700 border-gray-200 hover:bg-gray-50'
                      }`}
                    >
                      Without GST (0%)
                    </button>
                  </div>
                  {gstType === 'with_gst' && (
                    <div className="flex items-center gap-2 pt-1">
                      <span className="text-xs text-gray-600 font-semibold">GST Rate (%):</span>
                      <input
                        type="number"
                        {...register("gst_pct", { valueAsNumber: true })}
                        className="w-20 px-2 py-1 text-xs border rounded bg-white font-extrabold text-[#2563EB]"
                      />
                    </div>
                  )}
                </div>

                <div className="flex items-center gap-2">
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[#64748B] uppercase">Discount Type</label>
                    <Dropdown name="discount_type" value={watch('discount_type') || 'fixed'} onChange={(e: any) => setValue('discount_type', e.target.value, { shouldDirty: true })} className="w-full text-xs p-1.5 mt-1 border rounded bg-white font-medium">
                      <option value="fixed">Fixed (₹)</option>
                      <option value="percentage">Percentage (%)</option>
                    </Dropdown>
                  </div>
                  <div className="flex-1">
                    <label className="text-[10px] font-bold text-[#64748B] uppercase">Value</label>
                    <input 
                      type="number" 
                      {...register("discount_value", { valueAsNumber: true })} 
                      className="w-full text-xs p-1.5 mt-1 border rounded bg-white font-semibold"
                    />
                  </div>
                </div>

                {discountValue > 0 && (
                  <div className="space-y-2 p-2.5 bg-amber-50 rounded-xl border border-amber-200">
                    <div>
                      <label className="text-[10px] font-bold text-amber-900 uppercase">Discount Reason *</label>
                      <input
                        type="text"
                        {...register("discount_reason")}
                        placeholder="e.g. Regular Customer / Festive Offer"
                        className="w-full text-xs p-1.5 mt-1 border border-amber-300 rounded bg-white"
                      />
                    </div>
                    <div>
                      <label className="text-[10px] font-bold text-amber-900 uppercase">Approved / Referred By *</label>
                      <input
                        type="text"
                        {...register("discount_reference")}
                        placeholder="e.g. Approved by Sodhi Sir / Reference"
                        className="w-full text-xs p-1.5 mt-1 border border-amber-300 rounded bg-white"
                      />
                    </div>
                  </div>
                )}
                
                {discountAmount > 0 && (
                  <div className="flex justify-between text-sm text-green-600">
                    <span className="font-medium">Discount</span>
                    <span className="font-bold">- {formatINR(discountAmount)}</span>
                  </div>
                )}
                {isWithGst && gstAmount > 0 && (
                  <div className="flex justify-between text-sm text-blue-600">
                    <span className="font-medium">GST ({gstPct}%)</span>
                    <span className="font-bold">+ {formatINR(gstAmount)}</span>
                  </div>
                )}
              </div>
              
              <div className="flex justify-between items-center mb-6">
                <span className="text-lg font-black text-[#0F172A]">Total Payable</span>
                <span className="text-2xl font-black text-[#2563EB]">{formatINR(total)}</span>
              </div>
              
              <Button
                type="submit"
                loading={submitting}
                className="w-full py-3"
              >
                Generate Bill
              </Button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
