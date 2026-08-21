import { useState, useRef, useEffect } from 'react';
import { Plus, Package, Edit2, Trash2, Check, Upload, Search, ShieldAlert, BarChart3, HelpCircle, RefreshCw, FolderPlus, CheckSquare, Square, Layers, ShoppingCart } from 'lucide-react';
import { useInventory, useCreateInventory, useUpdateInventory, useAdjustQuantity, useDeleteInventory, useInventoryCategories, useCreateCategory, useRenameCategory, useDeleteCategory } from '../../api/hooks/useInventory';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import PremiumStatCard from '../../components/shared/PremiumStatCard';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/shared/ConfirmDialog';
import { useUIStore } from '../../store/uiStore';
import api from '../../api/axiosInstance';

const unitOptions = [
  { value: 'ml', label: 'ml' },
  { value: 'litre', label: 'Litre' },
  { value: 'g', label: 'g' },
  { value: 'kg', label: 'kg' },
  { value: 'pcs', label: 'Pieces' },
  { value: 'roll', label: 'Roll' },
];

const INVENTORY_CATEGORIES = [
  'Seat Covers',
  'Floor Mats',
  'Android Stereo',
  'Speakers',
  'Amplifier',
  'Subwoofer',
  'Dash Camera',
  'Reverse Camera',
  'LED Lights',
  'Fog Lamps',
  'Horn',
  'Car Perfume',
  'Steering Cover',
  'Wiper Blades',
  'Battery',
  'GPS Tracker',
  'Mobile Holder',
  'Vacuum Cleaner',
  'Cleaning Products',
  'PPF & Coating Products',
  'Comfort Accessories',
  'Car Electronics',
  'Miscellaneous Accessories'
];

import { useAuthStore } from '../../store/authStore';

export default function InventoryPage() {
  const { user } = useAuthStore();
  const activeFranchiseId = parseInt(localStorage.getItem('active_franchise_id') || '1', 10);
  const isMainStudioAdmin = user?.role === 'admin' && (!user?.franchise_id || user?.franchise_id === 1) && activeFranchiseId === 1;
  const isFranchise = (user?.role as any) === 'franchise' || activeFranchiseId !== 1;
  const isStaff = user?.role === 'staff';

  const toast = useUIStore((s) => s.toast);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState('');

  const [brandFilter, setBrandFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [pricingView, setPricingView] = useState<'selling' | 'cost' | 'franchise' | 'staff'>(
    isMainStudioAdmin ? 'cost' : isFranchise ? 'franchise' : 'selling'
  );

  useEffect(() => {
    if (!isMainStudioAdmin) {
      if (isFranchise) setPricingView('franchise');
      else setPricingView('selling');
    }
  }, [isMainStudioAdmin, isFranchise]);

  // Franchise-specific pricing modal state (Admin only)
  const [fPricingModalOpen, setFPricingModalOpen] = useState(false);
  const [fPricingItem, setFPricingItem] = useState<any>(null);
  const [fPricingList, setFPricingList] = useState<any[]>([]);
  const [franchisesList, setFranchisesList] = useState<any[]>([]);
  const [selectedFranchiseId, setSelectedFranchiseId] = useState<number | ''>('');
  const [customFranchisePriceVal, setCustomFranchisePriceVal] = useState<number | ''>('');
  const [customSellingPriceVal, setCustomSellingPriceVal] = useState<number | ''>('');
  const [savingFPricing, setSavingFPricing] = useState(false);

  const openFranchisePricingModal = async (item: any) => {
    setFPricingItem(item);
    setFPricingModalOpen(true);
    try {
      const [fRes, fpRes] = await Promise.all([
        api.get('/franchises'),
        api.get(`/inventory/${item.id}/franchise-pricing`)
      ]);
      if (fRes.data.success) setFranchisesList(fRes.data.data || []);
      if (fpRes.data.success) setFPricingList(fpRes.data.data || []);
    } catch (e) {
      console.error(e);
    }
  };

  const handleSaveFranchisePrice = async () => {
    if (!fPricingItem || !selectedFranchiseId || customFranchisePriceVal === '') return;
    setSavingFPricing(true);
    try {
      await api.post(`/inventory/${fPricingItem.id}/franchise-pricing`, {
        franchise_id: selectedFranchiseId,
        franchise_price: customFranchisePriceVal,
        selling_price: customSellingPriceVal !== '' ? customSellingPriceVal : undefined
      });
      toast('success', 'Franchise-specific pricing saved successfully!');
      const fpRes = await api.get(`/inventory/${fPricingItem.id}/franchise-pricing`);
      if (fpRes.data.success) setFPricingList(fpRes.data.data || []);
      setSelectedFranchiseId('');
      setCustomFranchisePriceVal('');
      setCustomSellingPriceVal('');
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to save franchise price');
    } finally {
      setSavingFPricing(false);
    }
  };

  const { data, isLoading, refetch } = useInventory({ search, page, limit: 100, category: categoryFilter, brand: brandFilter });
  const { data: dbCategories, isLoading: isLoadingCategories, refetch: refetchCategories } = useInventoryCategories();

  // Multi-select state
  const [selectedIds, setSelectedIds] = useState<number[]>([]);
  const [bulkActionLoading, setBulkActionLoading] = useState(false);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState('');

  // Custom Category State in Modal
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');

  // Category Manager Modal State
  const [catManagerOpen, setCatManagerOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [editingCatName, setEditingCatName] = useState<string | null>(null);
  const [renameCatVal, setRenameCatVal] = useState('');
  const [deletingCatName, setDeletingCatName] = useState<string | null>(null);
  const [reassignCatTarget, setReassignCatTarget] = useState('');

  const createCatMut = useCreateCategory();
  const renameCatMut = useRenameCategory();
  const deleteCatMut = useDeleteCategory();

  // ─── Add/Edit Modal ─────────────────────
  const [modalOpen, setModalOpen] = useState(false);
  const [editItem, setEditItem] = useState<any>(null);
  const [activeTab, setActiveTab] = useState<'basic' | 'stock' | 'pricing' | 'franchises' | 'warranty'>('basic');
  const [allFranchisesList, setAllFranchisesList] = useState<any[]>([]);
  const [formTargetFranchises, setFormTargetFranchises] = useState<Record<number, { enabled: boolean, franchise_price: number | '', selling_price: number | '' }>>({});

  const [formName, setFormName] = useState('');
  const [formUnit, setFormUnit] = useState('pcs');
  const [formQty, setFormQty] = useState(0);
  const [formThreshold, setFormThreshold] = useState(5);
  const [formImage, setFormImage] = useState('');
  const [formImages, setFormImages] = useState<string[]>([]);
  const [formDescription, setFormDescription] = useState('');

  // 19 Professional accessories fields
  const [formSku, setFormSku] = useState('');
  const [formBarcode, setFormBarcode] = useState('');
  const [formCategory, setFormCategory] = useState('Seat Covers');
  const [formSubCategory, setFormSubCategory] = useState('');
  const [formBrand, setFormBrand] = useState('');
  const [formVehicleCompatibility, setFormVehicleCompatibility] = useState('');
  const [formVariant, setFormVariant] = useState('');
  const [formCostPrice, setFormCostPrice] = useState(0);
  const [formFranchisePrice, setFormFranchisePrice] = useState(0);
  const [formSellingPrice, setFormSellingPrice] = useState(0);
  const [formStaffPrice, setFormStaffPrice] = useState(0);
  const [formPriceVisibleToStaff, setFormPriceVisibleToStaff] = useState<number>(1);
  const [formDiscountPct, setFormDiscountPct] = useState(0);
  const [formGstPct, setFormGstPct] = useState(0);
  const [formSupplier, setFormSupplier] = useState('');
  const [formPurchaseDate, setFormPurchaseDate] = useState('');
  const [formPurchaseInvoiceNo, setFormPurchaseInvoiceNo] = useState('');
  const [formWarehouseLocation, setFormWarehouseLocation] = useState('');
  const [formWarranty, setFormWarranty] = useState('');
  const [formSerialNumber, setFormSerialNumber] = useState('');
  const [formExpiryDate, setFormExpiryDate] = useState('');
  const [formStatus, setFormStatus] = useState<'active' | 'inactive'>('active');

  const [uploadingImage, setUploadingImage] = useState(false);
  const imageInputRef = useRef<HTMLInputElement>(null);

  const createMut = useCreateInventory();
  const updateMut = useUpdateInventory();
  const adjustMut = useAdjustQuantity();
  const deleteMut = useDeleteInventory();

  // ─── Inline quantity edit ───────────────
  const [editingQtyId, setEditingQtyId] = useState<number | null>(null);
  const [editingQtyVal, setEditingQtyVal] = useState('');
  const qtyInputRef = useRef<HTMLInputElement>(null);

  // ─── Delete confirm ─────────────────────
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  useEffect(() => {
    if (editingQtyId && qtyInputRef.current) qtyInputRef.current.focus();
  }, [editingQtyId]);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const [isUploading, setIsUploading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const formData = new FormData();
    formData.append('file', file);

    try {
      setIsUploading(true);
      const res = await api.post('/inventory/bulk-upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      toast('success', res.data.message || 'Import successful');
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to import file');
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    const uploadFormData = new FormData();
    Array.from(files).forEach(f => uploadFormData.append('images', f));

    try {
      setUploadingImage(true);
      const res = await api.post('/inventory/upload-image', uploadFormData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      const newUrls = res.data?.urls || (res.data?.url ? [res.data.url] : []);
      if (newUrls.length > 0) {
        setFormImages(prev => [...prev, ...newUrls]);
        setFormImage(newUrls[0]);
        toast('success', `Uploaded ${newUrls.length} image(s) successfully`);
      }
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to upload image');
    } finally {
      setUploadingImage(false);
      if (imageInputRef.current) imageInputRef.current.value = '';
    }
  };

  const loadFranchisesForModal = async (itemId?: number) => {
    try {
      const fRes = await api.get('/franchises');
      const fList = fRes.data?.data || [];
      setAllFranchisesList(fList);

      let existingPrices: Record<number, any> = {};
      if (itemId) {
        try {
          const fpRes = await api.get(`/inventory/${itemId}/franchise-pricing`);
          const rows = fpRes.data?.data || [];
          rows.forEach((r: any) => {
            existingPrices[r.franchise_id] = r;
          });
        } catch (e) {}
      }

      const initialMap: Record<number, { enabled: boolean, franchise_price: number | '', selling_price: number | '' }> = {};
      fList.forEach((f: any) => {
        const exist = existingPrices[f.id];
        initialMap[f.id] = {
          enabled: !!exist || true,
          franchise_price: exist ? parseFloat(exist.franchise_price) : '',
          selling_price: exist && exist.selling_price ? parseFloat(exist.selling_price) : '',
        };
      });
      setFormTargetFranchises(initialMap);
    } catch (e) {
      console.error('Failed to load franchises for modal:', e);
    }
  };

  const openAddModal = () => {
    setEditItem(null);
    setFormName('');
    setFormUnit('pcs');
    setFormQty(0);
    setFormThreshold(5);
    setFormImage('');
    setFormImages([]);
    setFormDescription('');
    setFormSku('');
    setFormBarcode('');
    setFormCategory('Seat Covers');
    setFormSubCategory('');
    setFormBrand('');
    setFormVehicleCompatibility('');
    setFormVariant('');
    setFormCostPrice(0);
    setFormFranchisePrice(0);
    setFormSellingPrice(0);
    setFormStaffPrice(0);
    setFormPriceVisibleToStaff(1);
    setFormDiscountPct(0);
    setFormGstPct(0);
    setFormSupplier('');
    setFormPurchaseDate('');
    setFormPurchaseInvoiceNo('');
    setFormWarehouseLocation('');
    setFormWarranty('');
    setFormSerialNumber('');
    setFormExpiryDate('');
    setFormStatus('active');
    setActiveTab('basic');
    loadFranchisesForModal();
    setModalOpen(true);
  };

  const openEditModal = (item: any) => {
    setEditItem(item);
    setFormName(item.product_name);
    setFormUnit(item.unit);
    setFormQty(parseFloat(item.quantity));
    setFormThreshold(parseFloat(item.low_stock_threshold));
    setFormDescription(item.description || '');
    setFormSku(item.sku || '');
    setFormBarcode(item.barcode || '');
    setFormCategory(item.category || 'Seat Covers');
    setFormSubCategory(item.sub_category || '');
    setFormBrand(item.brand || '');
    setFormVehicleCompatibility(item.vehicle_compatibility || '');
    setFormVariant(item.variant || '');
    setFormCostPrice(parseFloat(item.cost_price) || 0);
    setFormFranchisePrice(parseFloat(item.franchise_price) || 0);
    setFormSellingPrice(parseFloat(item.selling_price) || 0);
    setFormStaffPrice(parseFloat(item.staff_price) || 0);
    setFormPriceVisibleToStaff(item.price_visible_to_staff !== undefined ? Number(item.price_visible_to_staff) : 1);
    setFormDiscountPct(parseFloat(item.discount_pct) || 0);
    setFormGstPct(parseFloat(item.gst_pct) || 0);
    setFormSupplier(item.supplier || '');
    setFormPurchaseDate(item.purchase_date ? item.purchase_date.split('T')[0] : '');
    setFormPurchaseInvoiceNo(item.purchase_invoice_no || '');
    setFormWarehouseLocation(item.warehouse_location || '');
    setFormWarranty(item.warranty || '');
    setFormSerialNumber(item.serial_number || '');
    setFormExpiryDate(item.expiry_date ? item.expiry_date.split('T')[0] : '');
    setFormStatus(item.status || 'active');
    setActiveTab('basic');
    let imgArr: string[] = [];
    if (item.images_json) {
      try {
        const arr = typeof item.images_json === 'string' ? JSON.parse(item.images_json) : item.images_json;
        if (Array.isArray(arr)) imgArr = arr;
        else if (typeof arr === 'string' && arr) imgArr = [arr];
      } catch (e) {
        console.error(e);
      }
    }
    setFormImages(imgArr);
    setFormImage(imgArr[0] || '');
    loadFranchisesForModal(item.id);
    setModalOpen(true);
  };

  const handleSave = async () => {
    if (!formName.trim()) {
      toast('error', 'Product name is required');
      return;
    }

    const target_franchises = Object.entries(formTargetFranchises)
      .filter(([_, v]) => v.enabled)
      .map(([fId, v]) => ({
        franchise_id: Number(fId),
        franchise_price: v.franchise_price !== '' ? Number(v.franchise_price) : formFranchisePrice,
        selling_price: v.selling_price !== '' ? Number(v.selling_price) : formSellingPrice
      }));

    try {
      if (editItem) {
        await updateMut.mutateAsync({
          id: editItem.id,
          product_name: formName,
          unit: formUnit,
          low_stock_threshold: formThreshold,
          images_json: formImages.length > 0 ? formImages : (formImage ? [formImage] : []),
          description: formDescription,
          sku: formSku || null,
          barcode: formBarcode || null,
          category: formCategory || null,
          sub_category: formSubCategory || null,
          brand: formBrand || null,
          vehicle_compatibility: formVehicleCompatibility || null,
          variant: formVariant || null,
          cost_price: formCostPrice,
          franchise_price: formFranchisePrice,
          selling_price: formSellingPrice,
          staff_price: formStaffPrice,
          price_visible_to_staff: formPriceVisibleToStaff,
          discount_pct: formDiscountPct,
          gst_pct: formGstPct,
          supplier: formSupplier || null,
          purchase_date: formPurchaseDate || null,
          purchase_invoice_no: formPurchaseInvoiceNo || null,
          warehouse_location: formWarehouseLocation || null,
          warranty: formWarranty || null,
          serial_number: formSerialNumber || null,
          expiry_date: formExpiryDate || null,
          status: formStatus,
          target_franchises
        } as any);
        toast('success', 'Product updated successfully');
      } else {
        await createMut.mutateAsync({
          product_name: formName,
          unit: formUnit,
          quantity: formQty,
          low_stock_threshold: formThreshold,
          images_json: formImages.length > 0 ? formImages : (formImage ? [formImage] : []),
          description: formDescription,
          sku: formSku || null,
          barcode: formBarcode || null,
          category: formCategory || null,
          sub_category: formSubCategory || null,
          brand: formBrand || null,
          vehicle_compatibility: formVehicleCompatibility || null,
          variant: formVariant || null,
          cost_price: formCostPrice,
          franchise_price: formFranchisePrice,
          selling_price: formSellingPrice,
          staff_price: formStaffPrice,
          price_visible_to_staff: formPriceVisibleToStaff,
          discount_pct: formDiscountPct,
          gst_pct: formGstPct,
          supplier: formSupplier || null,
          purchase_date: formPurchaseDate || null,
          purchase_invoice_no: formPurchaseInvoiceNo || null,
          warehouse_location: formWarehouseLocation || null,
          warranty: formWarranty || null,
          serial_number: formSerialNumber || null,
          expiry_date: formExpiryDate || null,
          status: formStatus,
          target_franchises
        } as any);
        toast('success', 'Product added successfully');
      }
      setModalOpen(false);
      refetch();
      refetchCategories();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to save product');
    }
  };

  // ─── Bulk Operations ─────────────
  const handleSelectAll = (filteredItems: any[]) => {
    if (selectedIds.length === filteredItems.length && filteredItems.length > 0) {
      setSelectedIds([]);
    } else {
      setSelectedIds(filteredItems.map((item: any) => item.id));
    }
  };

  const handleSelectOne = (id: number) => {
    if (selectedIds.includes(id)) {
      setSelectedIds(selectedIds.filter(i => i !== id));
    } else {
      setSelectedIds([...selectedIds, id]);
    }
  };

  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    if (!window.confirm(`Are you sure you want to delete ${selectedIds.length} selected products?`)) return;
    setBulkActionLoading(true);
    try {
      await api.post('/inventory/bulk-delete', { ids: selectedIds });
      toast('success', `${selectedIds.length} products deleted`);
      setSelectedIds([]);
      refetch();
      refetchCategories();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed bulk delete');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkCategoryChange = async (cat: string) => {
    if (selectedIds.length === 0 || !cat) return;
    setBulkActionLoading(true);
    try {
      await api.post('/inventory/bulk-update-category', { ids: selectedIds, category: cat });
      toast('success', `Updated category to "${cat}" for ${selectedIds.length} items`);
      setSelectedIds([]);
      setBulkCategoryTarget('');
      refetch();
      refetchCategories();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed bulk category update');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleBulkStatusChange = async (status: 'active' | 'inactive') => {
    if (selectedIds.length === 0) return;
    setBulkActionLoading(true);
    try {
      await api.post('/inventory/bulk-update-status', { ids: selectedIds, status });
      toast('success', `Status updated to "${status}" for ${selectedIds.length} items`);
      setSelectedIds([]);
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed bulk status update');
    } finally {
      setBulkActionLoading(false);
    }
  };

  const handleInlineQtySave = async (id: number, oldVal: number) => {
    const val = parseFloat(editingQtyVal);
    if (isNaN(val) || val < 0) {
      toast('error', 'Please enter a valid positive number');
      return;
    }

    const diff = val - oldVal;
    if (diff === 0) {
      setEditingQtyId(null);
      return;
    }

    try {
      await adjustMut.mutateAsync({
        id,
        delta: diff,
      });
      toast('success', 'Quantity updated successfully');
      setEditingQtyId(null);
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Adjustment failed');
    }
  };

  const handleDelete = async () => {
    if (!deleteId) return;
    try {
      await deleteMut.mutateAsync(deleteId);
      toast('success', 'Product deleted successfully');
      setDeleteConfirmOpen(false);
      setDeleteId(null);
      refetch();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to delete product');
    }
  };

  // Compute stat totals
  const allItems = data?.data || [];

  const masterCategoryList = Array.from(
    new Set([
      ...(dbCategories ? dbCategories.map((dc: any) => dc.category) : []),
      ...(allItems ? allItems.map((i: any) => i.category).filter(Boolean) : [])
    ])
  ).filter(Boolean).map((catName: string) => {
    const existing = dbCategories?.find((dc: any) => dc.category === catName);
    const countFromItems = allItems.filter((i: any) => i.category === catName).length;
    return {
      category: catName,
      count: Math.max(existing?.count || 0, countFromItems)
    };
  }).sort((a, b) => a.category.localeCompare(b.category));

  const categoryOptions = masterCategoryList.map(c => c.category);
  
  // Filter items based on statusFilter, categoryFilter, brandFilter
  const filteredItems = allItems.filter((item: any) => {
    if (statusFilter === 'low') return item.is_low_stock && parseFloat(item.quantity) > 0;
    if (statusFilter === 'out') return parseFloat(item.quantity) === 0;
    if (statusFilter === 'ok') return !item.is_low_stock && parseFloat(item.quantity) > 0;
    
    if (categoryFilter && item.category !== categoryFilter) return false;
    if (brandFilter && !String(item.brand || '').toLowerCase().includes(brandFilter.toLowerCase())) return false;
    
    return true;
  });

  const totalProducts = allItems.length;
  const lowStockCount = allItems.filter((i: any) => i.is_low_stock && parseFloat(i.quantity) > 0).length;
  const outOfStockCount = allItems.filter((i: any) => parseFloat(i.quantity) === 0).length;
  
  // Financial valuations
  const totalValuation = allItems.reduce((sum: number, i: any) => sum + ((parseFloat(i.selling_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
  const totalCost = allItems.reduce((sum: number, i: any) => sum + ((parseFloat(i.cost_price) || 0) * (parseFloat(i.quantity) || 0)), 0);
  const profitMargin = totalValuation - totalCost;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto space-y-6 font-sans">
      {/* Page Header */}
      <PremiumPageHeader
        title="Accessories Stock Ledger"
        subtitle="Manage professional stock counts, barcodes, location shelf numbers, pricing, and valuations."
        icon={Package}
        iconColor="#2563EB"
        accentGradient="from-blue-600 to-indigo-600"
        actions={
          <div className="grid grid-cols-1 xs:grid-cols-3 sm:flex gap-2 w-full sm:w-auto">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".xlsx,.xls,.csv"
              className="hidden"
            />
            {isMainStudioAdmin && (
              <>
                <Button variant="secondary" onClick={() => setCatManagerOpen(true)} icon={<FolderPlus size={16} />} className="w-full sm:w-auto justify-center">
                  Manage Categories
                </Button>
                <Button variant="secondary" onClick={() => fileInputRef.current?.click()} icon={<Upload size={16} />} loading={isUploading} className="w-full sm:w-auto justify-center">
                  Import Excel
                </Button>
              </>
            )}
            {isFranchise && (
              <Button
                variant="secondary"
                onClick={async () => {
                  const prodName = window.prompt('Product Name or ID to request:');
                  if (!prodName) return;
                  const qty = window.prompt('Quantity to request from Main Admin:', '10');
                  if (!qty) return;
                  try {
                    const match = allItems.find((i: any) => i.product_name.toLowerCase().includes(prodName.toLowerCase()) || String(i.id) === prodName);
                    if (!match) { toast('error', 'Product not found'); return; }
                    await api.post('/stock-requests', { product_id: match.id, requested_quantity: parseInt(qty, 10) });
                    toast('success', `Stock request submitted for ${qty} units of ${match.product_name}`);
                  } catch {
                    toast('error', 'Failed to submit stock request');
                  }
                }}
                icon={<ShoppingCart size={16} />}
                className="w-full sm:w-auto justify-center"
              >
                Request Stock Order
              </Button>
            )}
            {isMainStudioAdmin && (
              <Button onClick={openAddModal} icon={<Plus size={16} />} className="w-full sm:w-auto justify-center shadow-lg shadow-blue-500/20">
                Add Product
              </Button>
            )}
          </div>
        }
      />

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <PremiumStatCard
          title="Active Stock Items"
          value={totalProducts}
          suffix=" Products"
          icon={Package}
          color="#2563EB"
          gradient="from-blue-500/10 to-indigo-400/5"
          delay={0.1}
        />
        <PremiumStatCard
          title="Low / Out of Stock"
          value={lowStockCount + outOfStockCount}
          suffix=" Alert Items"
          icon={ShieldAlert}
          color="#F59E0B"
          gradient="from-amber-500/10 to-yellow-400/5"
          delay={0.2}
        />
        <PremiumStatCard
          title="Stock Valuation (Sale)"
          value={Math.round(totalValuation)}
          prefix="₹"
          icon={BarChart3}
          color="#10B981"
          gradient="from-emerald-500/10 to-teal-400/5"
          delay={0.3}
        />
        <PremiumStatCard
          title="Est. Gross Profit"
          value={Math.round(profitMargin)}
          prefix="₹"
          icon={BarChart3}
          color="#8B5CF6"
          gradient="from-purple-500/10 to-indigo-400/5"
          delay={0.4}
        />
      </div>

      {/* Category Horizontal Pills & Product Count Summary */}
      <div className="bg-white p-3 rounded-xl shadow-sm border border-gray-200 space-y-2">
        {(() => {
          const totalAllProducts = allItems.length;

          return (
            <>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-xs font-bold text-gray-700">
                  <Layers className="w-4 h-4 text-blue-600" />
                  <span>Categories Breakdown</span>
                  <span className="bg-blue-100 text-blue-800 text-[10px] px-2 py-0.5 rounded-full font-bold">
                    {totalAllProducts} Total Products
                  </span>
                </div>
                <span className="text-xs text-gray-500 font-medium">
                  Showing {filteredItems.length} of {totalAllProducts} items
                </span>
              </div>

              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
                <button
                  onClick={() => { setCategoryFilter(''); setPage(1); }}
                  className={`px-3 py-1 rounded-lg font-bold transition-all shrink-0 ${
                    categoryFilter === '' ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All Products ({totalAllProducts})
                </button>
                {categoryOptions.map(c => {
                  const count = allItems.filter((i: any) => i.category === c).length;
                  if (count === 0 && categoryFilter !== c) return null;
                  return (
                    <button
                      key={c}
                      onClick={() => { setCategoryFilter(c); setPage(1); }}
                      className={`px-3 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1.5 ${
                        categoryFilter === c ? 'bg-blue-600 text-white shadow-sm' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                      }`}
                    >
                      <span>{c}</span>
                      <span className={`text-[10px] px-1.5 py-0.2 rounded-full ${
                        categoryFilter === c ? 'bg-white/30 text-white' : 'bg-gray-200 text-gray-700'
                      }`}>
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            </>
          );
        })()}
      </div>

      {/* Search and Filters */}
      <div className="flex flex-col md:flex-row gap-4 bg-white p-4 rounded-xl shadow-sm border border-gray-200">
        <div className="flex-1 relative">
          <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search products by name, SKU, barcode, brand..."
            className="w-full pl-10 pr-4 py-2 border border-gray-200 rounded-lg text-sm font-extrabold text-slate-900 placeholder:text-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          />
        </div>
        <div className="w-full md:w-48 text-left">
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={categoryFilter}
            onChange={(e) => { setCategoryFilter(e.target.value); setPage(1); }}
          >
            <option value="">All Categories</option>
            {categoryOptions.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
        <div className="w-full md:w-48 text-left">
          <input
            type="text"
            placeholder="Filter by brand..."
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={brandFilter}
            onChange={(e) => { setBrandFilter(e.target.value); setPage(1); }}
          />
        </div>
        {isMainStudioAdmin && (
          <div className="w-full md:w-56 text-left">
            <select
              className="w-full px-3 py-2 border-2 border-blue-400 bg-blue-50/80 text-blue-900 font-extrabold rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-600 shadow-sm"
              value={pricingView}
              onChange={(e: any) => setPricingView(e.target.value)}
            >
              <option value="cost">👁️ Pricing: Admin Cost Price</option>
              <option value="franchise">🏬 Pricing: Franchise Price</option>
              <option value="selling">🏷️ Pricing: Customer Price</option>
              <option value="staff">🔧 Pricing: Staff Reference Price</option>
            </select>
          </div>
        )}
        <div className="w-full md:w-48 text-left">
          <select
            className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="">All Stock Levels</option>
            <option value="ok">Stock level OK</option>
            <option value="low">Low stock alert</option>
            <option value="out">Out of stock</option>
          </select>
        </div>
      </div>

      {/* Floating Bulk Actions Bar */}
      {selectedIds.length > 0 && (
        <div className="sticky top-4 z-20 bg-gray-900 text-white p-3 rounded-xl shadow-xl border border-gray-800 flex items-center justify-between flex-wrap gap-3 animate-in fade-in slide-in-from-top-2">
          <div className="flex items-center gap-2 text-xs font-bold">
            <CheckSquare className="w-4 h-4 text-blue-400" />
            <span>{selectedIds.length} Products Selected</span>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="flex items-center gap-1">
              <select
                className="px-2.5 py-1.5 bg-gray-800 border border-gray-700 text-white text-xs rounded-lg focus:outline-none focus:ring-1 focus:ring-blue-500"
                value={bulkCategoryTarget}
                onChange={(e) => setBulkCategoryTarget(e.target.value)}
              >
                <option value="">Move to Category...</option>
                {categoryOptions.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
              <Button
                variant="secondary"
                size="sm"
                className="text-xs py-1"
                disabled={!bulkCategoryTarget || bulkActionLoading}
                onClick={() => handleBulkCategoryChange(bulkCategoryTarget)}
              >
                Apply Category
              </Button>
            </div>

            <Button
              variant="secondary"
              size="sm"
              className="text-xs py-1 text-emerald-400 hover:text-emerald-300"
              disabled={bulkActionLoading}
              onClick={() => handleBulkStatusChange('active')}
            >
              Mark Active
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="text-xs py-1 text-amber-400 hover:text-amber-300"
              disabled={bulkActionLoading}
              onClick={() => handleBulkStatusChange('inactive')}
            >
              Mark Inactive
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="text-xs py-1 bg-blue-950 text-blue-400 hover:bg-blue-900 border-blue-900"
              disabled={bulkActionLoading}
              onClick={handleBulkDelete}
              icon={<Trash2 size={13} />}
            >
              Delete ({selectedIds.length})
            </Button>

            <button
              onClick={() => setSelectedIds([])}
              className="text-xs text-gray-400 hover:text-white underline ml-2"
            >
              Deselect All
            </button>
          </div>
        </div>
      )}

      {/* Main Table */}
      <div className="bg-white rounded-xl border border-gray-200 overflow-hidden shadow-sm">
        {isLoading ? (
          <div className="p-12 text-center">
            <RefreshCw className="animate-spin w-8 h-8 text-blue-600 mx-auto mb-2" />
            <p className="text-sm text-gray-500">Loading stock records...</p>
          </div>
        ) : filteredItems.length === 0 ? (
          <div className="p-12 text-center text-gray-500">
            <Package size={40} className="mx-auto text-gray-300 mb-3" />
            <p className="text-sm font-semibold text-gray-700">No Products Found</p>
            <p className="text-xs text-gray-400 mt-1">Try refining search parameters.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-100 text-left text-sm">
              <thead className="bg-gray-50">
                <tr className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  <th className="p-4 w-10 text-center">
                    <input
                      type="checkbox"
                      checked={selectedIds.length === filteredItems.length && filteredItems.length > 0}
                      onChange={() => handleSelectAll(filteredItems)}
                      className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                    />
                  </th>
                  <th className="p-4">SKU / Barcode</th>
                  <th className="p-4">Product Details</th>
                  <th className="p-4">Category & Brand</th>
                  <th className="p-4">Warehouse & Warranty</th>
                  <th className="p-4">Pricing & Value</th>
                  <th className="p-4">Stock Level</th>
                  <th className="p-4 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 bg-white">
                {filteredItems.map((row: any) => {
                  const isLow = row.is_low_stock && parseFloat(row.quantity) > 0;
                  const isOut = parseFloat(row.quantity) === 0;

                  return (
                    <tr key={row.id} className={`hover:bg-gray-50/50 transition-colors ${selectedIds.includes(row.id) ? 'bg-blue-50/30' : ''}`}>
                      <td className="p-4 w-10 text-center">
                        <input
                          type="checkbox"
                          checked={selectedIds.includes(row.id)}
                          onChange={() => handleSelectOne(row.id)}
                          className="rounded border-gray-300 text-blue-600 focus:ring-blue-500 w-4 h-4 cursor-pointer"
                        />
                      </td>
                      {/* SKU & Barcode */}
                      <td className="p-4">
                        <div className="font-mono text-xs font-bold text-gray-800">
                          {row.sku || `#INV-${String(row.id).padStart(4, '0')}`}
                        </div>
                        {row.barcode && (
                          <div className="text-[10px] text-gray-400 font-mono mt-0.5" title="Barcode/QR Code">
                            BC: {row.barcode}
                          </div>
                        )}
                      </td>

                      {/* Product details */}
                      <td className="p-4">
                        <div className="flex items-center gap-3">
                          {(() => {
                            let imgUrl = '';
                            if (row.images_json) {
                              try {
                                const arr = typeof row.images_json === 'string' ? JSON.parse(row.images_json) : row.images_json;
                                if (Array.isArray(arr) && arr.length > 0 && arr[0]) imgUrl = arr[0];
                              } catch {}
                            }
                            return imgUrl ? (
                              <img
                                src={imgUrl}
                                alt={row.product_name}
                                className="w-9 h-9 rounded-lg object-cover border border-gray-100 bg-gray-50 shrink-0"
                                onError={(e) => {
                                  const el = e.target as HTMLImageElement;
                                  // Replace with a colored initial instead of broken icon
                                  el.outerHTML = `<div class="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0 text-gray-400 font-bold text-sm border border-gray-100">${(row.product_name || 'P')[0]}</div>`;
                                }}
                              />
                            ) : (
                              <div className="w-9 h-9 rounded-lg bg-gradient-to-br from-gray-100 to-gray-200 flex items-center justify-center shrink-0 text-gray-400 font-bold text-sm border border-gray-100">
                                {(row.product_name || 'P')[0]}
                              </div>
                            );
                          })()}
                          <div className="flex flex-col">
                            <span className="font-bold text-gray-900 leading-tight">{row.product_name}</span>
                            <div className="flex flex-wrap gap-1.5 mt-1">
                              {row.variant && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-gray-100 text-gray-600 rounded">
                                  {row.variant}
                                </span>
                              )}
                              {row.vehicle_compatibility && (
                                <span className="text-[9px] font-bold px-1.5 py-0.2 bg-blue-50 text-blue-600 rounded">
                                  🚘 {row.vehicle_compatibility}
                                </span>
                              )}
                            </div>
                            {row.description && (
                              <span className="text-[11px] text-gray-400 font-normal mt-0.5 line-clamp-1 max-w-[200px]" title={row.description}>
                                {row.description}
                              </span>
                            )}
                          </div>
                        </div>
                      </td>

                      {/* Category & Brand */}
                      <td className="p-4">
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-extrabold uppercase tracking-wide bg-indigo-50 text-indigo-700 border border-indigo-100">
                          {row.category || 'Uncategorized'}
                        </span>
                        {row.brand && (
                          <div className="text-xs font-semibold text-gray-600 mt-1 pl-1">
                            ⭐ {row.brand}
                          </div>
                        )}
                      </td>

                      {/* Warehouse & Warranty */}
                      <td className="p-4 text-xs text-gray-700">
                        <div>Loc: <span className="font-semibold text-gray-900">{row.warehouse_location || 'N/A'}</span></div>
                        {row.warranty && <div className="text-[10px] text-gray-500 mt-0.5">🛡️ {row.warranty}</div>}
                      </td>

                      {/* Pricing & Valuation */}
                      <td className="p-4 text-xs text-gray-700">
                        {pricingView === 'cost' && (
                          <>
                            <div>Cost: <span className="font-bold text-gray-900">₹{parseFloat(row.cost_price || 0).toLocaleString()}</span></div>
                            <div className="text-[11px] text-gray-500 mt-0.5">Customer Sale: ₹{parseFloat(row.selling_price || 0).toLocaleString()}</div>
                            {parseFloat(row.selling_price) > 0 && parseFloat(row.cost_price || 0) > 0 && (
                              <div className="text-[9px] text-emerald-600 font-bold mt-0.5">
                                Margin: {Math.round(((parseFloat(row.selling_price) - parseFloat(row.cost_price || 0)) / parseFloat(row.selling_price)) * 100)}%
                              </div>
                            )}
                          </>
                        )}
                        {pricingView === 'franchise' && (
                          <>
                            <div className="text-blue-700 font-extrabold text-xs">Franchise: ₹{parseFloat(row.franchise_price || 0).toLocaleString()}</div>
                            <div className="text-[11px] text-gray-500 mt-0.5">Retail: ₹{parseFloat(row.selling_price || 0).toLocaleString()}</div>
                          </>
                        )}
                        {pricingView === 'selling' && (
                          <>
                            <div className="text-gray-900 font-extrabold text-xs">Customer: ₹{parseFloat(row.selling_price || 0).toLocaleString()}</div>
                            {isMainStudioAdmin && parseFloat(row.cost_price) > 0 && (
                              <div className="text-[10px] text-gray-400 mt-0.5">Cost: ₹{parseFloat(row.cost_price || 0).toLocaleString()}</div>
                            )}
                          </>
                        )}
                        {pricingView === 'staff' && (
                          <>
                            <div className="text-purple-700 font-extrabold text-xs">
                              {row.price_visible_to_staff === 0 ? (
                                <span className="text-gray-400 font-normal italic">Hidden from Staff</span>
                              ) : (
                                `Staff: ₹${parseFloat(row.staff_price || row.selling_price || 0).toLocaleString()}`
                              )}
                            </div>
                            <div className="text-[11px] text-gray-500 mt-0.5">Retail: ₹{parseFloat(row.selling_price || 0).toLocaleString()}</div>
                          </>
                        )}
                      </td>

                      {/* Stock Level */}
                      <td className="p-4">
                        <div className="flex items-center gap-1.5">
                          {isMainStudioAdmin && editingQtyId === row.id ? (
                            <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                              <input
                                ref={qtyInputRef}
                                type="number"
                                className="w-16 px-1.5 py-0.5 border border-gray-300 rounded text-center text-xs focus:outline-none focus:ring-1 focus:ring-blue-500"
                                value={editingQtyVal}
                                onChange={(e) => setEditingQtyVal(e.target.value)}
                              />
                              <button
                                onClick={() => handleInlineQtySave(row.id, parseFloat(row.quantity))}
                                className="p-1 text-green-600 hover:bg-green-50 rounded"
                              >
                                <Check size={14} />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => {
                                if (isMainStudioAdmin) {
                                  setEditingQtyId(row.id);
                                  setEditingQtyVal(String(parseFloat(row.quantity)));
                                }
                              }}
                              className={`font-bold text-gray-900 ${isMainStudioAdmin ? 'hover:text-blue-600 hover:underline cursor-pointer' : 'cursor-default'} transition-colors`}
                              title={isMainStudioAdmin ? "Click to quickly edit quantity" : "Current Quantity"}
                            >
                              {parseFloat(row.quantity)} {row.unit}
                            </button>
                          )}
                        </div>
                        <div className="text-[10px] text-gray-400 mt-0.5">Min: {parseFloat(row.low_stock_threshold)}</div>
                        <div className="mt-1">
                          {isOut ? (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-blue-100 text-blue-800 border border-blue-200">
                              Out
                            </span>
                          ) : isLow ? (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-amber-100 text-amber-800 border border-amber-200">
                              Low
                            </span>
                          ) : (
                            <span className="inline-flex items-center px-1.5 py-0.2 rounded text-[8px] font-extrabold uppercase tracking-wider bg-emerald-100 text-emerald-800 border border-emerald-200">
                              OK
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Actions */}
                      <td className="p-4 text-right">
                        <div className="flex items-center justify-end gap-2">
                          {isMainStudioAdmin && (
                            <>
                              <button
                                onClick={() => openFranchisePricingModal(row)}
                                className="px-2 py-1 bg-blue-50 hover:bg-blue-100 text-blue-700 font-extrabold text-[10px] rounded-lg border border-blue-200 transition-all flex items-center gap-1"
                                title="Set Custom Prices for Franchises"
                              >
                                🏬 Franchise Prices
                              </button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="p-1.5 rounded-lg"
                                title="Edit Product Details"
                                onClick={() => openEditModal(row)}
                              >
                                <Edit2 size={13} />
                              </Button>
                              <Button
                                variant="secondary"
                                size="sm"
                                className="p-1.5 rounded-lg hover:text-blue-600 hover:bg-blue-50"
                                title="Delete Product"
                                onClick={() => { setDeleteId(row.id); setDeleteConfirmOpen(true); }}
                              >
                                <Trash2 size={13} />
                              </Button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Category Manager Modal */}
      <Modal open={catManagerOpen} onClose={() => setCatManagerOpen(false)} title="Manage Categories" size="md">
        <div className="space-y-4 text-left">
          {/* Add New Category */}
          <form
            onSubmit={async (e) => {
              e.preventDefault();
              const nameToAdd = newCatInput.trim();
              if (!nameToAdd) return;
              try {
                const res = await createCatMut.mutateAsync(nameToAdd);
                toast('success', res.message || 'Category added');
                setNewCatInput('');
                await refetchCategories();
                await refetch();
                setCategoryFilter(nameToAdd);
              } catch (err: any) {
                toast('error', err.response?.data?.error || 'Failed to add category');
              }
            }}
            className="flex flex-col sm:flex-row gap-2 items-stretch sm:items-center bg-gray-50 p-3 rounded-xl border border-gray-200"
          >
            <input
              type="text"
              placeholder="Enter new category name..."
              value={newCatInput}
              onChange={(e) => setNewCatInput(e.target.value)}
              className="flex-1 px-3 py-2 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
            />
            <Button
              type="submit"
              size="sm"
              loading={createCatMut.isPending}
              disabled={!newCatInput.trim()}
              className="w-full sm:w-auto shrink-0 py-2"
              icon={<Plus size={14} />}
            >
              Add Category
            </Button>
          </form>

          {/* List of Existing Categories */}
          <div className="space-y-2 max-h-[350px] overflow-y-auto pr-1">
            <h4 className="text-xs font-bold text-gray-700 uppercase tracking-wider">Active Categories</h4>
            {!dbCategories && isLoadingCategories ? (
              <div className="text-xs text-gray-500 py-4 text-center animate-pulse">Loading categories...</div>
            ) : masterCategoryList && masterCategoryList.length > 0 ? (
              masterCategoryList.map((c: any) => (
                <div key={c.category} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-gray-200 text-xs">
                  {editingCatName === c.category ? (
                    <div className="flex-1 flex gap-2 items-center mr-2">
                      <input
                        type="text"
                        value={renameCatVal}
                        onChange={(e) => setRenameCatVal(e.target.value)}
                        className="flex-1 px-2 py-1 border border-blue-400 rounded text-xs font-medium focus:outline-none"
                      />
                      <button
                        onClick={async () => {
                          try {
                            const res = await renameCatMut.mutateAsync({ old_name: c.category, new_name: renameCatVal.trim() });
                            toast('success', res.message);
                            setEditingCatName(null);
                            await refetchCategories();
                            await refetch();
                          } catch (err: any) {
                            toast('error', err.response?.data?.error || 'Failed to rename category');
                          }
                        }}
                        className="text-green-600 hover:text-green-700 p-1 font-bold"
                      >
                        <Check size={14} />
                      </button>
                    </div>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-gray-800">{c.category}</span>
                      <span className="bg-gray-100 text-gray-600 text-[10px] px-2 py-0.5 rounded-full font-bold">
                        {c.count} product(s)
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-1">
                    {editingCatName !== c.category && (
                      <button
                        onClick={() => { setEditingCatName(c.category); setRenameCatVal(c.category); }}
                        className="p-1 text-gray-500 hover:text-blue-600 rounded"
                        title="Rename Category"
                      >
                        <Edit2 size={13} />
                      </button>
                    )}
                    <button
                      onClick={() => { setDeletingCatName(c.category); setReassignCatTarget(''); }}
                      className="p-1 text-gray-500 hover:text-blue-600 rounded"
                      title="Delete Category"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ))
            ) : (
              <p className="text-xs text-gray-400 italic">No categories found.</p>
            )}
          </div>

          {/* Delete Category Sub-Dialog */}
          {deletingCatName && (
            <div className="p-3 bg-blue-50 rounded-lg border border-blue-200 text-xs space-y-2 mt-3">
              <p className="font-bold text-blue-800">Delete Category "{deletingCatName}"?</p>
              <p className="text-gray-600 text-[11px]">
                If products are assigned to this category, select a target category to reassign them to:
              </p>
              <select
                className="w-full px-2 py-1.5 border border-blue-300 rounded text-xs bg-white focus:outline-none"
                value={reassignCatTarget}
                onChange={(e) => setReassignCatTarget(e.target.value)}
              >
                <option value="">-- Select Re-assignment Category (Optional if 0 products) --</option>
                {masterCategoryList?.filter((dc: any) => dc.category !== deletingCatName).map((dc: any) => (
                  <option key={dc.category} value={dc.category}>{dc.category}</option>
                ))}
              </select>
              <div className="flex justify-end gap-2 pt-1">
                <Button size="sm" variant="secondary" onClick={() => setDeletingCatName(null)}>Cancel</Button>
                <Button
                  size="sm"
                  variant="primary"
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  loading={deleteCatMut.isPending}
                  onClick={async () => {
                    try {
                      const res = await deleteCatMut.mutateAsync({ name: deletingCatName, reassign_to: reassignCatTarget });
                      toast('success', res.message);
                      setDeletingCatName(null);
                      await refetchCategories();
                      await refetch();
                    } catch (err: any) {
                      toast('error', err.response?.data?.error || 'Failed to delete category');
                    }
                  }}
                >
                  Confirm Delete
                </Button>
              </div>
            </div>
          )}
        </div>
      </Modal>

      {/* Franchise-Specific Pricing Modal (Admin Only) */}
      <Modal open={fPricingModalOpen} onClose={() => setFPricingModalOpen(false)} title={`Franchise-Wise Pricing: ${fPricingItem?.product_name || ''}`} size="md">
        <div className="py-2 space-y-4 text-left">
          <p className="text-xs text-slate-600">
            Set custom wholesale and customer retail prices for individual franchise branches. If no custom price is set for a franchise, default global prices (Wholesale: ₹{fPricingItem?.franchise_price || 0}, Retail: ₹{fPricingItem?.selling_price || 0}) will be active.
          </p>

          <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-3">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Set Custom Outlet Prices</h4>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Select Franchise</label>
                <select
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 font-semibold"
                  value={selectedFranchiseId}
                  onChange={(e) => setSelectedFranchiseId(e.target.value ? Number(e.target.value) : '')}
                >
                  <option value="">-- Choose Branch --</option>
                  {franchisesList.map((f: any) => (
                    <option key={f.id} value={f.id}>{f.name} ({f.code || `#FR-${f.id}`})</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Wholesale Price (₹) *</label>
                <input
                  type="number"
                  placeholder="e.g. 1500"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={customFranchisePriceVal}
                  onChange={(e) => setCustomFranchisePriceVal(e.target.value ? parseFloat(e.target.value) : '')}
                />
              </div>
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">Customer Retail Price (₹)</label>
                <input
                  type="number"
                  placeholder="e.g. 2200"
                  className="w-full px-3 py-2 border border-slate-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-bold"
                  value={customSellingPriceVal}
                  onChange={(e) => setCustomSellingPriceVal(e.target.value ? parseFloat(e.target.value) : '')}
                />
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                size="sm"
                variant="primary"
                loading={savingFPricing}
                disabled={!selectedFranchiseId || customFranchisePriceVal === ''}
                onClick={handleSaveFranchisePrice}
              >
                Save Franchise Price
              </Button>
            </div>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider">Active Franchise Overrides</h4>
            {fPricingList.length > 0 ? (
              <div className="space-y-1.5 max-h-48 overflow-y-auto pr-1">
                {fPricingList.map((fp: any) => (
                  <div key={fp.id} className="flex items-center justify-between p-2.5 bg-white rounded-lg border border-slate-200 text-xs">
                    <span className="font-bold text-slate-800">{fp.franchise_name} ({fp.franchise_code})</span>
                    <div className="text-right">
                      <div className="font-extrabold text-blue-700 text-xs">Wholesale: ₹{parseFloat(fp.franchise_price).toLocaleString()}</div>
                      {fp.selling_price && <div className="text-[10px] text-emerald-700 font-bold">Retail: ₹{parseFloat(fp.selling_price).toLocaleString()}</div>}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-xs text-slate-400 italic">No custom franchise prices configured yet. Global franchise price is active.</p>
            )}
          </div>
        </div>
      </Modal>

      {/* Add / Edit Product Modal */}
      <Modal open={modalOpen} onClose={() => setModalOpen(false)} title={editItem ? 'Edit Product' : 'Add Product'} size="md"
        footer={<><Button variant="ghost" onClick={() => setModalOpen(false)}>Cancel</Button><Button onClick={handleSave} loading={createMut.isPending || updateMut.isPending}>{editItem ? 'Save Changes' : 'Add Product'}</Button></>}
      >
        <div className="py-2">
          {/* Tab Navigation */}
          <div className="flex border-b border-gray-100 mb-4 bg-gray-50/50 p-1.5 rounded-lg gap-1 overflow-x-auto scrollbar-none">
            {(['basic', 'stock', 'pricing', 'franchises', 'warranty'] as const).map(tab => (
              <button
                key={tab}
                type="button"
                onClick={() => setActiveTab(tab)}
                className={`flex-1 py-1.5 px-2 text-center text-xs font-bold rounded-md capitalize transition-all whitespace-nowrap ${
                  activeTab === tab
                    ? 'bg-white text-[#2563EB] shadow-sm'
                    : 'text-gray-400 hover:text-gray-600'
                }`}
              >
                {tab === 'basic' ? 'Basic Info' : tab === 'stock' ? 'Stock & Location' : tab === 'pricing' ? 'Global Pricing' : tab === 'franchises' ? '🏬 Franchises & Prices' : 'Warranty & Status'}
              </button>
            ))}
          </div>

          {/* Tab Content */}
          <div className="space-y-4 min-h-[300px]">
            {/* Tab 1: Basic Info */}
            {activeTab === 'basic' && (
              <div className="space-y-4 text-left">
                <Input label="Product Name *" value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Android Touchscreen Stereo" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="SKU / Model Code" value={formSku} onChange={e => setFormSku(e.target.value)} placeholder="e.g. ACC-STER-02" />
                  <Input label="Barcode / QR" value={formBarcode} onChange={e => setFormBarcode(e.target.value)} placeholder="e.g. 8901072003" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-gray-700 mb-1">Category *</label>
                    <select
                      className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                      value={isCustomCategory ? '__custom__' : formCategory}
                      onChange={(e) => {
                        if (e.target.value === '__custom__') {
                          setIsCustomCategory(true);
                          setCustomCategoryInput('');
                        } else {
                          setIsCustomCategory(false);
                          setFormCategory(e.target.value);
                        }
                      }}
                    >
                      {categoryOptions.map(c => (
                        <option key={c} value={c}>{c}</option>
                      ))}
                      <option value="__custom__">➕ Add Custom Category...</option>
                    </select>
                    {isCustomCategory && (
                      <input
                        type="text"
                        placeholder="Type custom category name..."
                        value={customCategoryInput}
                        onChange={(e) => {
                          setCustomCategoryInput(e.target.value);
                          setFormCategory(e.target.value);
                        }}
                        className="w-full mt-2 px-3 py-1.5 border border-blue-300 rounded-lg text-xs focus:outline-none focus:ring-2 focus:ring-blue-500 font-medium"
                      />
                    )}
                  </div>
                  <Input label="Sub Category" value={formSubCategory} onChange={e => setFormSubCategory(e.target.value)} placeholder="e.g. 9-inch Touchscreen" />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Brand" value={formBrand} onChange={e => setFormBrand(e.target.value)} placeholder="e.g. Blaupunkt" />
                  <Select
                    label="Base Unit *"
                    options={unitOptions}
                    value={formUnit}
                    onChange={e => setFormUnit(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Vehicle Compatibility" value={formVehicleCompatibility} onChange={e => setFormVehicleCompatibility(e.target.value)} placeholder="e.g. Swift / Baleno / Universal" />
                  <Input label="Variant (Color, Size)" value={formVariant} onChange={e => setFormVariant(e.target.value)} placeholder="e.g. Matte Black / 4GB RAM" />
                </div>
              </div>
            )}

            {/* Tab 2: Stock & Location */}
            {activeTab === 'stock' && (
              <div className="space-y-4 text-left">
                {!editItem && (
                  <Input label="Initial Stock Quantity *" type="number" value={formQty || ''} onChange={e => setFormQty(parseFloat(e.target.value) || 0)} />
                )}
                <Input label="Minimum Alert Threshold (Low Stock) *" type="number" value={formThreshold || ''} onChange={e => setFormThreshold(parseFloat(e.target.value) || 0)} />
                <Input label="Warehouse Location (Rack/Shelf)" value={formWarehouseLocation} onChange={e => setFormWarehouseLocation(e.target.value)} placeholder="e.g. Rack C, Row 4" />
                <Input label="Expiry Date (If applicable)" type="date" value={formExpiryDate} onChange={e => setFormExpiryDate(e.target.value)} />
              </div>
            )}

            {/* Tab 3: Pricing & Financials */}
            {activeTab === 'pricing' && (
              <div className="space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Purchase / Admin Cost Price (₹) *" type="number" value={formCostPrice || ''} onChange={e => setFormCostPrice(parseFloat(e.target.value) || 0)} />
                  <Input label="Customer Selling Price / MRP (₹) *" type="number" value={formSellingPrice || ''} onChange={e => setFormSellingPrice(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Franchise Wholesale Price (₹)" type="number" value={formFranchisePrice || ''} onChange={e => setFormFranchisePrice(parseFloat(e.target.value) || 0)} />
                  <Input label="Staff Reference Price (₹)" type="number" value={formStaffPrice || ''} onChange={e => setFormStaffPrice(parseFloat(e.target.value) || 0)} />
                </div>
                <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                  <div>
                    <label className="text-xs font-bold text-slate-800">Price Visible to Staff Profiles</label>
                    <p className="text-[10px] text-slate-500">If disabled, prices are completely hidden from staff users.</p>
                  </div>
                  <input
                    type="checkbox"
                    checked={formPriceVisibleToStaff === 1}
                    onChange={e => setFormPriceVisibleToStaff(e.target.checked ? 1 : 0)}
                    className="w-4 h-4 rounded border-slate-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Discount Offered (%)" type="number" value={formDiscountPct || ''} onChange={e => setFormDiscountPct(parseFloat(e.target.value) || 0)} />
                  <Input label="GST / VAT (%)" type="number" value={formGstPct || ''} onChange={e => setFormGstPct(parseFloat(e.target.value) || 0)} />
                </div>
                <Input label="Supplier Name (Vendor)" value={formSupplier} onChange={e => setFormSupplier(e.target.value)} placeholder="e.g. Soni Auto Distributers" />
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Purchase Date" type="date" value={formPurchaseDate} onChange={e => setFormPurchaseDate(e.target.value)} />
                  <Input label="Purchase Invoice No." value={formPurchaseInvoiceNo} onChange={e => setFormPurchaseInvoiceNo(e.target.value)} placeholder="e.g. INV-ACC-9821" />
                </div>
              </div>
            )}

            {/* Tab 4: Franchise Distribution & Pricing */}
            {activeTab === 'franchises' && (
              <div className="space-y-4 text-left">
                <div className="p-3 bg-blue-50/80 border border-blue-200 rounded-xl">
                  <h4 className="text-xs font-extrabold text-blue-900 uppercase tracking-wider mb-1">
                    🏬 Franchise Outlets & Custom Pricing Distribution
                  </h4>
                  <p className="text-[11px] text-blue-700 font-medium leading-relaxed">
                    Select target franchises to assign this product and set outlet-specific wholesale and customer retail prices. The product will automatically appear on the selected franchise's inventory page with the exact set price.
                  </p>
                </div>

                <div className="space-y-3 max-h-[300px] overflow-y-auto pr-1 divide-y divide-slate-100">
                  {allFranchisesList.map((f: any) => {
                    const fState = formTargetFranchises[f.id] || { enabled: true, franchise_price: '', selling_price: '' };
                    return (
                      <div key={f.id} className="pt-3 first:pt-0 space-y-2">
                        <div className="flex items-center justify-between">
                          <label className="flex items-center gap-2 cursor-pointer select-none">
                            <input
                              type="checkbox"
                              checked={fState.enabled}
                              onChange={(e) => {
                                setFormTargetFranchises(prev => ({
                                  ...prev,
                                  [f.id]: { ...fState, enabled: e.target.checked }
                                }));
                              }}
                              className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500 cursor-pointer"
                            />
                            <span className="text-xs font-extrabold text-slate-900">{f.name}</span>
                            <span className="text-[10px] text-slate-400 font-bold">({f.code || `#FR-${f.id}`})</span>
                          </label>
                          <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md uppercase ${fState.enabled ? 'bg-emerald-100 text-emerald-800' : 'bg-gray-100 text-gray-500'}`}>
                            {fState.enabled ? 'Active on Franchise' : 'Excluded'}
                          </span>
                        </div>

                        {fState.enabled && (
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pl-6">
                            <div>
                              <label className="block text-[10px] font-extrabold text-slate-600 mb-1">
                                Franchise Wholesale Price (₹)
                              </label>
                              <input
                                type="number"
                                placeholder={`Default: ₹${formFranchisePrice || 0}`}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 bg-white"
                                value={fState.franchise_price}
                                onChange={(e) => {
                                  const val = e.target.value !== '' ? parseFloat(e.target.value) : '';
                                  setFormTargetFranchises(prev => ({
                                    ...prev,
                                    [f.id]: { ...fState, franchise_price: val }
                                  }));
                                }}
                              />
                            </div>

                            <div>
                              <label className="block text-[10px] font-extrabold text-slate-600 mb-1">
                                Customer Retail Price (₹)
                              </label>
                              <input
                                type="number"
                                placeholder={`Default: ₹${formSellingPrice || 0}`}
                                className="w-full px-3 py-1.5 border border-slate-200 rounded-lg text-xs font-bold text-slate-900 focus:ring-2 focus:ring-blue-500 bg-white"
                                value={fState.selling_price}
                                onChange={(e) => {
                                  const val = e.target.value !== '' ? parseFloat(e.target.value) : '';
                                  setFormTargetFranchises(prev => ({
                                    ...prev,
                                    [f.id]: { ...fState, selling_price: val }
                                  }));
                                }}
                              />
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Tab 4: Warranty, Image & Status */}
            {activeTab === 'warranty' && (
              <div className="space-y-4 text-left">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Input label="Warranty" value={formWarranty} onChange={e => setFormWarranty(e.target.value)} placeholder="e.g. 1 Year Brand Warranty" />
                  <Input label="Serial Number" value={formSerialNumber} onChange={e => setFormSerialNumber(e.target.value)} placeholder="e.g. SN-BLAU-89028" />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Product Status</label>
                  <select
                    className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                    value={formStatus}
                    onChange={(e: any) => setFormStatus(e.target.value)}
                  >
                    <option value="active">Active (Available)</option>
                    <option value="inactive">Inactive (Suspended)</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Description Features</label>
                  <textarea
                    className="w-full px-3 py-2 bg-[#f6f3f2] border-none rounded-lg text-sm focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all placeholder:text-[#8f6f6c]/60"
                    rows={2}
                    value={formDescription}
                    onChange={e => setFormDescription(e.target.value)}
                    placeholder="Enter additional details, features..."
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-gray-500 mb-1">Product Images (Multi-Image Support)</label>
                  <div className="flex flex-wrap items-center gap-3">
                    {formImages.map((imgUrl, idx) => (
                      <div key={idx} className="relative w-16 h-16 rounded-xl border border-gray-200 overflow-hidden bg-gray-50 flex items-center justify-center shrink-0 group">
                        <img src={imgUrl} alt={`Product ${idx + 1}`} className="w-full h-full object-contain" />
                        <button
                          type="button"
                          onClick={() => {
                            const filtered = formImages.filter((_, i) => i !== idx);
                            setFormImages(filtered);
                            if (formImage === imgUrl) setFormImage(filtered[0] || '');
                          }}
                          className="absolute inset-0 bg-black/60 text-white flex items-center justify-center text-[10px] font-bold opacity-0 group-hover:opacity-100 transition-opacity cursor-pointer"
                        >
                          Remove
                        </button>
                      </div>
                    ))}

                    <button
                      type="button"
                      disabled={uploadingImage}
                      onClick={() => imageInputRef.current?.click()}
                      className="w-16 h-16 rounded-xl border-2 border-dashed border-blue-400 bg-blue-50/50 hover:bg-blue-100/50 flex flex-col items-center justify-center text-blue-600 font-bold transition-all shrink-0 cursor-pointer"
                    >
                      <Upload size={16} />
                      <span className="text-[9px] font-extrabold mt-1">{uploadingImage ? 'Uploading...' : 'Upload File'}</span>
                    </button>
                    <input
                      type="file"
                      ref={imageInputRef}
                      className="hidden"
                      accept="image/*"
                      multiple
                      onChange={handleImageUpload}
                    />
                  </div>
                  
                  {/* Direct Image URL input option */}
                  <div className="mt-3 flex gap-2">
                    <input
                      type="url"
                      placeholder="Or paste image URL (https://...)"
                      value={formImage}
                      onChange={(e) => {
                        const url = e.target.value;
                        setFormImage(url);
                        if (url && !formImages.includes(url)) {
                          setFormImages(prev => [url, ...prev]);
                        }
                      }}
                      className="flex-1 px-3 py-2 bg-gray-50 border border-gray-200 rounded-lg text-xs font-medium focus:ring-2 focus:ring-blue-500 focus:bg-white"
                    />
                  </div>
                  <p className="text-[10px] text-gray-400 mt-1">Upload files or paste direct web URLs. JPG, PNG, WEBP supported.</p>
                </div>
              </div>
            )}

          </div>
        </div>
      </Modal>

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirmOpen}
        onClose={() => { setDeleteConfirmOpen(false); setDeleteId(null); }}
        onConfirm={handleDelete}
        title="Delete Product"
        message="This will hide the product from active inventory. Historical data references will be preserved. Continue?"
        confirmLabel="Delete"
        loading={deleteMut.isPending}
      />
    </div>
  );
}
