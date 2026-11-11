import { useState, useEffect } from 'react';
import { ShoppingBag, Search, Plus, RefreshCw, AlertCircle, Clock, CheckCircle2, XCircle, ShoppingCart, Trash2, ArrowRight, ShieldCheck, Edit3, PackageCheck, Filter } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import PremiumPageHeader from '../../components/shared/PremiumPageHeader';
import Modal from '../../components/ui/Modal';
import Button from '../../components/ui/Button';

interface InventoryItem {
  id: number;
  product_name: string;
  category?: string;
  brand?: string;
  sku?: string;
  unit: string;
  quantity: number; // Main studio stock
  franchise_price?: number;
  selling_price?: number;
}

interface CartItem {
  product_id?: number;
  product_name: string;
  quantity: number;
  unit: string;
  unit_price: number;
  is_custom?: boolean;
  notes?: string;
}

import { useAuthStore } from '../../store/authStore';
import { Link } from 'react-router-dom';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

export default function FranchiseStockOrdersPage() {
  const toast = useUIStore((s) => s.toast);
  const { user } = useAuthStore();
  const activeFranchiseId = parseInt(localStorage.getItem('active_franchise_id') || '1', 10);
  const isMainStudioAdmin = (user?.role === 'admin' || user?.role === 'super_admin') && (!user?.franchise_id || user?.franchise_id === 1) && activeFranchiseId === 1;
  
  // Data states
  const [catalog, setCatalog] = useState<InventoryItem[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'catalog' | 'history'>('catalog');
  const [statusFilter, setStatusFilter] = useState<'all' | 'pending' | 'approved' | 'rejected'>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');

  // Replenishment Order Cart Drawer State
  const [cart, setCart] = useState<CartItem[]>([]);
  const [orderModalOpen, setOrderModalOpen] = useState(false);
  const [orderNotes, setOrderNotes] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Dropdown Quick Selection State inside Order Builder
  const [selectedCatalogId, setSelectedCatalogId] = useState<string>('');
  const [dropdownQty, setDropdownQty] = useState<number>(1);

  // Manual Custom Written Item Form State
  const [manualModalOpen, setManualModalOpen] = useState(false);
  const [manualName, setManualName] = useState('');
  const [manualQty, setManualQty] = useState<number>(1);
  const [manualUnit, setManualUnit] = useState('pcs');
  const [manualEstPrice, setManualEstPrice] = useState<string>('');
  const [manualNotes, setManualNotes] = useState('');

  // Load Main Studio Catalog & Franchise Stock Orders
  const loadData = async () => {
    try {
      setLoading(true);
      
      // 1. Fetch Main Studio inventory for Franchise wholesale ordering
      const catalogRes = await api.get('/inventory?franchise_id=1');
      if (catalogRes.data?.success) {
        setCatalog(catalogRes.data.data || []);
      } else {
        setCatalog([]);
      }

      // 2. Fetch franchise stock orders history
      const ordersRes = await api.get('/stock-requests');
      if (ordersRes.data?.success) {
        setOrders(ordersRes.data.data || []);
      } else {
        setOrders([]);
      }
    } catch (err) {
      console.warn('Initial load catalog or orders notice:', err);
      setCatalog([]);
      setOrders([]);
    } finally {
      setLoading(false);
    }
  };

  useLiveReload(() => { loadData(); }); // reload when anything changes elsewhere
  useEffect(() => {
    loadData();
  }, []);

  // Cart operations for Catalog items
  const addCatalogToCart = (product: InventoryItem, qty: number = 1) => {
    const price = parseFloat(String(product.franchise_price || product.selling_price || 0));
    setCart((prev) => {
      const existingIndex = prev.findIndex((item) => item.product_id === product.id);
      if (existingIndex > -1) {
        const updated = [...prev];
        updated[existingIndex].quantity += qty;
        return updated;
      }
      return [
        ...prev,
        {
          product_id: product.id,
          product_name: product.product_name,
          quantity: qty,
          unit: product.unit || 'pcs',
          unit_price: price,
          is_custom: false,
        },
      ];
    });
    toast('success', `Added ${product.product_name} to replenishment cart`);
  };

  // Add Custom / Manually Written item to Cart
  const handleAddManualItem = (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim()) {
      toast('error', 'Product name is required for manual written item');
      return;
    }
    if (manualQty <= 0) {
      toast('error', 'Please enter a valid quantity');
      return;
    }

    const estPrice = parseFloat(manualEstPrice) || 0;
    setCart((prev) => [
      ...prev,
      {
        product_name: manualName.trim(),
        quantity: manualQty,
        unit: manualUnit.trim() || 'pcs',
        unit_price: estPrice,
        is_custom: true,
        notes: manualNotes.trim() || undefined,
      },
    ]);

    toast('success', `Added custom item "${manualName.trim()}" to order list`);
    setManualName('');
    setManualQty(1);
    setManualUnit('pcs');
    setManualEstPrice('');
    setManualNotes('');
    setManualModalOpen(false);
    setOrderModalOpen(true); // Open drawer so user sees updated list
  };

  // Update Item Qty in Cart
  const updateCartQty = (index: number, newQty: number) => {
    if (newQty <= 0) {
      removeFromCart(index);
      return;
    }
    setCart((prev) =>
      prev.map((item, idx) => (idx === index ? { ...item, quantity: newQty } : item))
    );
  };

  // Remove Item from Cart
  const removeFromCart = (index: number) => {
    setCart((prev) => prev.filter((_, idx) => idx !== index));
  };

  // Total Cost Calculation
  const calculateCartTotal = () => {
    return cart.reduce((sum, item) => sum + item.unit_price * item.quantity, 0);
  };

  // Submit Bulk / Customized Stock Request
  const handleSubmitBulkOrder = async () => {
    if (cart.length === 0) {
      toast('error', 'Your order list is empty.');
      return;
    }
    setSubmitting(true);
    try {
      const payload = {
        notes: orderNotes,
        items: cart.map((item) => ({
          product_id: item.product_id || null,
          product_name: item.product_name,
          requested_quantity: item.quantity,
          unit: item.unit,
          estimated_price: item.unit_price || null,
          notes: item.notes,
        })),
      };

      const res = await api.post('/stock-requests', payload);
      toast('success', res.data.message || 'Stock replenishment request submitted to Admin!');
      setCart([]);
      setOrderModalOpen(false);
      setOrderNotes('');
      setActiveTab('history');
      loadData();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to submit stock request.');
    } finally {
      setSubmitting(false);
    }
  };

  // Filter Catalog
  const categories = ['all', ...Array.from(new Set(catalog.map((i) => i.category).filter(Boolean)))];
  const filteredCatalog = catalog.filter((item) => {
    const matchesSearch =
      item.product_name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (item.sku && item.sku.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (item.brand && item.brand.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory = selectedCategory === 'all' || item.category === selectedCategory;
    return matchesSearch && matchesCategory;
  });

  // Filter History
  const filteredOrders = orders.filter((o) => {
    if (statusFilter === 'all') return true;
    return o.status === statusFilter;
  });

  // Stats
  const pendingCount = orders.filter((o) => o.status === 'pending').length;
  const approvedCount = orders.filter((o) => o.status === 'approved').length;

  if (isMainStudioAdmin) {
    return (
      <div className="space-y-6">
        <PremiumPageHeader title="Stock orders" subtitle="Branch studios order stock from the main studio here." icon={ShoppingBag} />
        <div className="bg-white border border-slate-200 rounded-2xl p-6 text-sm text-slate-600">
          <p className="font-bold text-slate-900 mb-1">You are in the main studio.</p>
          <p>The main studio does not order stock from itself. Orders from other studios arrive in {user?.role === 'super_admin' ? <Link to="/admin/stock-approvals" className="font-bold text-blue-600">Stock approvals</Link> : <b>Stock approvals</b>} (Super Admin). To add your own stock, use <Link to="/admin/inventory" className="font-bold text-blue-600">Inventory</Link>.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PremiumPageHeader
        title="Stock orders"
        subtitle="Order stock from the main studio — pick items, add to the list, send."
        icon={ShoppingBag}
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => setManualModalOpen(true)}
              className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 border border-emerald-200 text-xs font-extrabold rounded-xl transition-all flex items-center gap-1.5 shadow-xs"
            >
              <Edit3 size={15} />
              <span>Unlisted item</span>
            </button>

            <button
              type="button"
              onClick={() => setOrderModalOpen(true)}
              className="relative px-4 py-2 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 shadow-md"
            >
              <ShoppingCart size={16} />
              <span>Order List ({cart.reduce((a, c) => a + c.quantity, 0)})</span>
              {cart.length > 0 && (
                <span className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-red-500 text-white font-extrabold text-[10px] rounded-full flex items-center justify-center border-2 border-white">
                  {cart.length}
                </span>
              )}
            </button>
          </div>
        }
      />

      {isMainStudioAdmin && (
        <p className="text-[12px] text-slate-500"><AlertCircle size={14} className="inline -mt-0.5 mr-1 text-[#2563EB]" />You are the main studio — orders from other studios arrive in <strong className="text-slate-700">Stock approvals</strong>.</p>
      )}

      {/* Navigation Tabs & Quick Stats */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2 bg-gray-100 p-1 rounded-2xl">
          <button
            type="button"
            onClick={() => setActiveTab('catalog')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all ${
              activeTab === 'catalog'
                ? 'bg-white text-[#2563EB] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            Catalogue
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('history')}
            className={`px-5 py-2 rounded-xl text-xs font-extrabold transition-all flex items-center gap-2 ${
              activeTab === 'history'
                ? 'bg-white text-[#2563EB] shadow-sm'
                : 'text-gray-600 hover:text-gray-900'
            }`}
          >
            <span>My orders</span>
            {pendingCount > 0 && (
              <span className="px-2 py-0.5 bg-amber-500 text-white font-black text-[10px] rounded-full">
                {pendingCount} Pending
              </span>
            )}
          </button>
        </div>

        <span className="text-xs font-bold text-emerald-700 bg-emerald-50 px-3 py-1.5 rounded-xl inline-flex items-center gap-1.5 w-fit"><PackageCheck size={14} /> {approvedCount} orders received</span>
      </div>

      {/* TAB 1: ORDER CATALOG & DROPDOWN PICKER */}
      {activeTab === 'catalog' && (
        <div className="space-y-6">
          {/* Quick Select Dropdown Bar + Manual Item Trigger */}
          <div className="bg-white p-4 rounded-2xl border border-slate-100 shadow-sm space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-extrabold text-slate-900 flex items-center gap-2">
                <Filter size={16} className="text-[#2563EB]" /> Quick add
              </h3>
            </div>

            <div className="flex flex-col sm:flex-row items-center gap-3">
              <Dropdown
                value={selectedCatalogId}
                onChange={(e) => setSelectedCatalogId(e.target.value)}
                className="flex-1 w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-semibold text-slate-900 focus:outline-none focus:border-[#2563EB]"
              >
                <option value="">Choose a product…</option>
                {catalog.map((p) => {
                  const rate = parseFloat(String(p.franchise_price || p.selling_price || 0));
                  return (
                    <option key={p.id} value={String(p.id)}>
                      {p.product_name} — ₹{rate}/{p.unit || 'pc'} · {p.quantity} in stock
                    </option>
                  );
                })}
              </Dropdown>

              <div className="flex items-center gap-2 w-full sm:w-auto">
                <input
                  type="number"
                  min="1"
                  value={dropdownQty}
                  onChange={(e) => setDropdownQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                  className="w-20 p-2.5 bg-white border border-gray-200 rounded-2xl text-xs font-extrabold text-center"
                  title="Quantity"
                />

                <button
                  type="button"
                  onClick={() => {
                    if (!selectedCatalogId) {
                      toast('error', 'Please select a product from dropdown first');
                      return;
                    }
                    const item = catalog.find((p) => String(p.id) === selectedCatalogId);
                    if (item) {
                      addCatalogToCart(item, dropdownQty);
                      setSelectedCatalogId('');
                      setDropdownQty(1);
                    }
                  }}
                  className="px-4 py-2.5 bg-[#2563EB] hover:bg-blue-700 text-white text-xs font-extrabold rounded-2xl transition-all shrink-0 flex items-center gap-1 shadow-xs"
                >
                  <Plus size={15} /> Add to list
                </button>
              </div>
            </div>

            <div className="pt-2 border-t border-blue-100/60 flex items-center justify-between text-xs">
              <span className="text-gray-500 font-medium">Not in the list?</span>
              <button
                type="button"
                onClick={() => setManualModalOpen(true)}
                className="font-extrabold text-emerald-700 hover:text-emerald-800 flex items-center gap-1 underline"
              >
                <Edit3 size={13} /> Add an unlisted item
              </button>
            </div>
          </div>

          {/* Search & Category Filter */}
          <div className="flex flex-col md:flex-row gap-4 justify-between items-center bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="relative w-full md:w-80">
              <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" />
              <input
                type="text"
                placeholder="Search catalog products..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="w-full pl-10 pr-4 py-2.5 bg-gray-50 border border-gray-200 rounded-2xl text-xs font-semibold focus:outline-none focus:border-[#2563EB] focus:bg-white transition-all"
              />
            </div>

            <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider shrink-0">Category:</span>
              {categories.map((cat) => (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setSelectedCategory(cat || 'all')}
                  className={`px-3 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all shrink-0 ${
                    selectedCategory === cat
                      ? 'bg-[#2563EB] text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Catalog Product Grid */}
          {loading ? (
            <div className="flex items-center justify-center py-20 bg-white rounded-3xl border border-gray-100">
              <RefreshCw className="animate-spin text-gray-400" size={32} />
            </div>
          ) : filteredCatalog.length === 0 ? (
            <div className="p-12 text-center text-gray-400 bg-white rounded-3xl border border-gray-100 space-y-2">
              <AlertCircle size={40} className="mx-auto text-gray-300" />
              <p className="font-bold text-gray-700">No products found</p>
              <p className="text-xs text-gray-400">Use the manual button above to write an unlisted product manually</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
              {filteredCatalog.map((p) => {
                const wholesalePrice = parseFloat(String(p.franchise_price || p.selling_price || 0));
                const inStock = p.quantity > 0;

                return (
                  <div
                    key={p.id}
                    className="bg-white rounded-3xl border border-gray-100 p-5 shadow-sm hover:shadow-md transition-all flex flex-col justify-between group"
                  >
                    <div>
                      <div className="flex items-start justify-between gap-2 mb-2">
                        <span className="text-[10px] font-extrabold uppercase tracking-wider px-2 py-0.5 rounded-md bg-slate-100 text-slate-600">
                          {p.category || 'Product'}
                        </span>
                        <span
                          className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${
                            inStock ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-red-50 text-red-700 border border-red-200'
                          }`}
                        >
                          {inStock ? `Main Stock: ${p.quantity} ${p.unit || 'pcs'}` : 'Out of Stock'}
                        </span>
                      </div>

                      <h3 className="font-extrabold text-slate-900 text-sm group-hover:text-[#2563EB] transition-colors line-clamp-2">
                        {p.product_name}
                      </h3>
                      {p.sku && <p className="text-[11px] text-gray-400 font-mono mt-0.5">SKU: {p.sku}</p>}

                      <div className="mt-4 pt-3 border-t border-dashed border-gray-100 flex items-center justify-between">
                        <div>
                          <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Wholesale Price</p>
                          <p className="text-lg font-black text-[#2563EB]">
                            ₹{wholesalePrice.toLocaleString('en-IN')}
                            <span className="text-xs text-gray-400 font-normal">/{p.unit || 'pc'}</span>
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="mt-5 flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => addCatalogToCart(p, 1)}
                        className="w-full py-2.5 bg-blue-50 hover:bg-blue-100 text-[#2563EB] text-xs font-extrabold rounded-2xl transition-all flex items-center justify-center gap-1.5"
                      >
                        <Plus size={15} /> Add to Order List
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: MY ORDER HISTORY */}
      {activeTab === 'history' && (
        <div className="space-y-6">
          {/* Status Filter Toolbar */}
          <div className="flex items-center justify-between bg-white p-4 rounded-3xl border border-gray-100 shadow-sm">
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-gray-400 uppercase tracking-wider mr-2">Filter Status:</span>
              {(['all', 'pending', 'approved', 'rejected'] as const).map((st) => (
                <button
                  key={st}
                  type="button"
                  onClick={() => setStatusFilter(st)}
                  className={`px-3.5 py-1.5 rounded-xl text-xs font-extrabold uppercase tracking-wider transition-all ${
                    statusFilter === st
                      ? 'bg-slate-900 text-white shadow-xs'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>

            <button
              type="button"
              onClick={loadData}
              className="p-2 text-gray-400 hover:text-gray-700 transition-colors"
              title="Refresh Orders"
            >
              <RefreshCw size={16} />
            </button>
          </div>

          {/* Orders Table */}
          <div className="bg-white rounded-3xl border border-gray-100 shadow-xl overflow-hidden">
            {loading ? (
              <div className="flex items-center justify-center py-20">
                <RefreshCw className="animate-spin text-gray-400" size={32} />
              </div>
            ) : filteredOrders.length === 0 ? (
              <div className="p-12 text-center text-gray-400 space-y-2">
                <AlertCircle size={40} className="mx-auto text-gray-300" />
                <p className="font-bold text-gray-700">No stock orders found</p>
                <p className="text-xs text-gray-400">Order requests submitted to Main Studio will appear here</p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100 text-[10px] uppercase font-bold text-gray-500 tracking-wider">
                      <th className="px-6 py-4">Order ID / Date</th>
                      <th className="px-6 py-4">Product Name</th>
                      <th className="px-6 py-4 text-center">Type</th>
                      <th className="px-6 py-4 text-center">Requested Qty</th>
                      <th className="px-6 py-4 text-right">Wholesale Rate</th>
                      <th className="px-6 py-4 text-right">Total Est. Cost</th>
                      <th className="px-6 py-4">Status</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-100 text-sm font-medium text-gray-800">
                    {filteredOrders.map((o) => {
                      const unitRate = parseFloat(String(o.unit_price || 0));
                      const totalCost = parseFloat(String(o.total_amount || 0));

                      return (
                        <tr key={o.id} className="hover:bg-gray-50/50 transition-colors">
                          <td className="px-6 py-4 font-bold text-slate-900">
                            <span className="text-xs font-black text-[#2563EB]">#ORD-{o.id}</span>
                            <p className="text-[10px] text-gray-400 font-normal">
                              {o.created_at ? new Date(o.created_at).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '-'}
                            </p>
                          </td>
                          <td className="px-6 py-4">
                            <p className="font-extrabold text-slate-900">{o.product_name}</p>
                            {o.notes && <p className="text-[11px] text-gray-500 italic mt-0.5">Note: {o.notes}</p>}
                          </td>
                          <td className="px-6 py-4 text-center">
                            {o.is_custom ? (
                              <span className="px-2 py-0.5 bg-emerald-50 text-emerald-700 border border-emerald-200 rounded-md font-extrabold text-[10px] uppercase">
                                Manual Written
                              </span>
                            ) : (
                              <span className="px-2 py-0.5 bg-slate-100 text-slate-700 rounded-md font-extrabold text-[10px] uppercase">
                                Uploaded Catalog
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-center font-bold text-slate-900">
                            {o.requested_quantity} {o.unit || 'pcs'}
                          </td>
                          <td className="px-6 py-4 text-right font-bold text-slate-700">
                            ₹{unitRate.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4 text-right font-extrabold text-[#2563EB]">
                            ₹{totalCost.toLocaleString('en-IN')}
                          </td>
                          <td className="px-6 py-4">
                            <span
                              className={`inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold ${
                                o.status === 'approved'
                                  ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                  : o.status === 'pending'
                                  ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                  : 'bg-red-50 text-red-700 border border-red-200'
                              }`}
                            >
                              {o.status === 'approved' ? (
                                <><CheckCircle2 size={12} /> Approved & Transferred</>
                              ) : o.status === 'pending' ? (
                                <><Clock size={12} /> Pending Admin Approval</>
                              ) : (
                                <><XCircle size={12} /> Rejected</>
                              )}
                            </span>
                            {o.rejection_reason && (
                              <p className="text-[10px] text-red-600 mt-1 font-semibold">Reason: {o.rejection_reason}</p>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* CURATED ORDER REPLENISHMENT CART DRAWER MODAL */}
      <Modal open={orderModalOpen} onClose={() => setOrderModalOpen(false)} title="Curated Stock Order Request List" size="md">
        <div className="space-y-4 py-2">
          {cart.length === 0 ? (
            <div className="p-8 text-center text-gray-400 space-y-2">
              <ShoppingCart size={40} className="mx-auto text-gray-300" />
              <p className="font-bold text-gray-700">Your order list is empty</p>
              <p className="text-xs text-gray-400">Add products from dropdown or write custom items to create an order request</p>
            </div>
          ) : (
            <>
              <div className="divide-y divide-gray-100 max-h-[300px] overflow-y-auto pr-1">
                {cart.map((item, index) => (
                  <div key={index} className="py-3 flex items-center justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="font-extrabold text-slate-900 text-xs truncate">{item.product_name}</p>
                        {item.is_custom ? (
                          <span className="px-1.5 py-0.2 bg-emerald-50 text-emerald-700 text-[9px] font-black uppercase rounded border border-emerald-200">
                            Manual Written
                          </span>
                        ) : (
                          <span className="px-1.5 py-0.2 bg-slate-100 text-slate-600 text-[9px] font-black uppercase rounded">
                            Catalog
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-gray-400">Rate: ₹{item.unit_price.toLocaleString('en-IN')} / {item.unit}</p>
                    </div>

                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        min="1"
                        value={item.quantity}
                        onChange={(e) => updateCartQty(index, parseInt(e.target.value, 10) || 1)}
                        className="w-16 px-2 py-1 bg-gray-50 border border-gray-200 rounded-lg text-xs font-bold text-center"
                      />
                      <span className="text-xs font-extrabold text-[#2563EB] w-20 text-right">
                        ₹{(item.unit_price * item.quantity).toLocaleString('en-IN')}
                      </span>
                      <button
                        type="button"
                        onClick={() => removeFromCart(index)}
                        className="text-gray-400 hover:text-red-600 transition-colors p-1"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Order Notes / Instructions for Admin (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Urgent stock request for upcoming weekend detailing bookings"
                  value={orderNotes}
                  onChange={(e) => setOrderNotes(e.target.value)}
                  className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB]"
                />
              </div>

              <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <p className="text-[10px] text-gray-400 font-bold uppercase tracking-wider">Total Est. Order Value</p>
                  <p className="text-xl font-black text-[#2563EB]">₹{calculateCartTotal().toLocaleString('en-IN')}</p>
                </div>

                <div className="flex items-center gap-2">
                  <Button variant="ghost" onClick={() => setOrderModalOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={handleSubmitBulkOrder}
                    loading={submitting}
                    icon={<ArrowRight size={16} />}
                  >
                    Submit Order to Admin
                  </Button>
                </div>
              </div>
            </>
          )}
        </div>
      </Modal>

      {/* MANUAL CUSTOM ITEM ENTRY MODAL */}
      <Modal open={manualModalOpen} onClose={() => setManualModalOpen(false)} title="Write Custom / Unlisted Stock Item" size="sm">
        <form onSubmit={handleAddManualItem} className="space-y-4 py-2 text-left">
          <p className="text-xs text-slate-600">
            Write down any unlisted or custom stock item not present in the uploaded catalog to request it from Admin.
          </p>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Product / Item Name *</label>
            <input
              type="text"
              required
              placeholder="e.g. 5L Degreaser Can, Special Ceramic Gel"
              value={manualName}
              onChange={(e) => setManualName(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Requested Qty *</label>
              <input
                type="number"
                min="1"
                required
                value={manualQty}
                onChange={(e) => setManualQty(Math.max(1, parseInt(e.target.value, 10) || 1))}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold focus:outline-none focus:border-[#2563EB]"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-700 mb-1">Unit (e.g. pcs, Litres, Cans)</label>
              <input
                type="text"
                placeholder="pcs"
                value={manualUnit}
                onChange={(e) => setManualUnit(e.target.value)}
                className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB]"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Estimated Unit Rate (₹) (Optional)</label>
            <input
              type="number"
              min="0"
              step="0.01"
              placeholder="e.g. 1200"
              value={manualEstPrice}
              onChange={(e) => setManualEstPrice(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div>
            <label className="block text-xs font-bold text-gray-700 mb-1">Notes / Description for Admin</label>
            <input
              type="text"
              placeholder="e.g. Special requirement for upcoming commercial car wash project"
              value={manualNotes}
              onChange={(e) => setManualNotes(e.target.value)}
              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:border-[#2563EB]"
            />
          </div>

          <div className="pt-2 flex justify-end gap-2">
            <Button variant="ghost" type="button" onClick={() => setManualModalOpen(false)}>
              Cancel
            </Button>
            <Button type="submit" icon={<Plus size={16} />}>
              Add to Order List
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}
