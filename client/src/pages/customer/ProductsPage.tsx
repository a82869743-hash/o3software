import StudioQr from '../../components/shared/StudioQr';
import { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, CheckCircle, Clock, AlertTriangle, ArrowRight, Star, ThumbsUp, Check, Truck, ShieldCheck, ShoppingCart, RefreshCw, X, QrCode, Search } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useCartStore } from '../../store/useCartStore';
import ProductsCartDrawer from '../../components/shared/ProductsCartDrawer';
import PhotoBanner from '../../components/customer/PhotoBanner';
import { PHOTOS as BANNER_PHOTOS } from '../../components/customer/serviceVisuals';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

function resolveImageUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.includes('localhost:5000') || url.includes('127.0.0.1')) {
    const idx = url.indexOf('/uploads/');
    if (idx !== -1) return url.substring(idx);
  }
  return url;
}

// Static product configuration with details matching ChatGPT screenshots
// Products come only from the studio's own inventory (set up by HQ). No hard-coded catalog.
const PRODUCT_TEMPLATES: any[] = [];

export default function ProductsPage() {
  const toast = useUIStore((s) => s.toast);
  const { productsCart, productsDrawerOpen, setProductsDrawerOpen } = useCartStore();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<'qr'>('qr');
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qrTransactionId, setQrTransactionId] = useState('');
  const [submittingQr, setSubmittingQr] = useState(false);
  const [activeTab, setActiveTab] = useState<'shop' | 'orders'>('shop');

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('');
  const [dbCategories, setDbCategories] = useState<string[]>([]);

  // Normalize product name for fuzzy matching
  const normalizeProductName = (name: string) => {
    return (name || '')
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, '') // Remove all non-alphanumeric
      .trim();
  };

  // Load products and match with DB stock
  const loadData = async () => {
    try {
      setLoading(true);
      // Fetch master categories list
      try {
        const catRes = await api.get('/inventory/categories');
        if (catRes.data?.data) {
          setDbCategories(catRes.data.data.map((c: any) => c.category).filter(Boolean));
        }
      } catch { /* ignore if categories endpoint fails */ }

      // 1. Fetch DB Products (secure customer endpoint) to match live price/stock
      const invRes = await api.get('/products');
      const dbItems = invRes.data?.data || [];

      const matchedDbIds = new Set<number>();

      // Map template products to DB items using fuzzy matching
      const mapped = PRODUCT_TEMPLATES.map((tmpl) => {
        // Try exact match first
        let match = dbItems.find(
          (db: any) => db.product_name.toUpperCase() === tmpl.dbName.toUpperCase()
        );

        // If no exact match, try normalized fuzzy match
        if (!match) {
          const normalizedTmpl = normalizeProductName(tmpl.dbName);
          match = dbItems.find((db: any) => {
            const normalizedDb = normalizeProductName(db.product_name);
            return normalizedDb === normalizedTmpl || 
                   normalizedDb.includes(normalizedTmpl) || 
                   normalizedTmpl.includes(normalizedDb);
          });
        }

        // If still no match, try partial word matching
        if (!match) {
          const tmplWords = tmpl.dbName.toUpperCase().split(/[\s*\-_]+/).filter(Boolean);
          match = dbItems.find((db: any) => {
            const dbUpper = (db.product_name || '').toUpperCase();
            // At least 2 key words must match
            const matchCount = tmplWords.filter((w: string) => dbUpper.includes(w)).length;
            return matchCount >= Math.min(2, tmplWords.length);
          });
        }

        if (match) matchedDbIds.add(match.id);

        const dbQty = match ? parseFloat(match.quantity) : 0;
        const dbSellingPrice = match ? parseFloat(match.selling_price) : 0;
        const dbCostPrice = match ? parseFloat(match.cost_price) : 0;

        // Extract image(s) from DB images_json if available
        let dbImages: string[] = [];
        if (match?.images_json) {
          try {
            const imgArr = typeof match.images_json === 'string' ? JSON.parse(match.images_json) : match.images_json;
            if (Array.isArray(imgArr)) dbImages = imgArr.map(resolveImageUrl).filter(Boolean);
            else if (typeof imgArr === 'string' && imgArr) dbImages = [resolveImageUrl(imgArr)];
          } catch { /* ignore parse errors */ }
        }

        const effectiveImages = dbImages.length > 0 ? dbImages : [tmpl.image];

        // Calculate MRP and discount from DB data
        // Listed price from inventory; a strike-through only when the admin set a real discount %
        const pct = match ? Math.min(Math.max(parseFloat(match.discount_pct) || 0, 0), 100) : 0;
        const effectiveMrp = dbSellingPrice > 0 ? dbSellingPrice : Number(tmpl.price);
        const effectivePrice = Math.round(effectiveMrp * (100 - pct)) / 100;
        const effectiveDiscount = pct > 0 ? `${pct}% OFF` : '';

        return {
          ...tmpl,
          // DB data overrides template when available
          displayName: match?.product_name || tmpl.displayName,
          description: match?.description || tmpl.description,
          image: effectiveImages[0],
          images: effectiveImages,
          price: effectivePrice,
          mrp: effectiveMrp,
          discount: effectiveDiscount,
          specs: {
            ...tmpl.specs,
            ...(match?.category ? { Category: match.category } : {}),
            ...(match?.brand ? { Brand: match.brand } : {}),
            ...(match?.sku ? { SKU: match.sku } : {}),
          },
          dbId: match?.id || null,
          dbQty: dbQty,
          dbPrice: effectivePrice,
          inStock: match ? (isNaN(dbQty) ? true : dbQty > 0) : false
        };
      });

      // 2. Add any DB products that didn't match a template (so nothing is hidden)
      // De-duplicate by product name (keep the one with highest selling_price)
      const unmatchedDbProducts = dbItems.filter((db: any) => !matchedDbIds.has(db.id));
      const seenNames = new Map<string, any>();
      for (const db of unmatchedDbProducts) {
        const nameKey = (db.product_name || '').toUpperCase().trim();
        const existing = seenNames.get(nameKey);
        if (!existing || (parseFloat(db.selling_price) || 0) > (parseFloat(existing.selling_price) || 0)) {
          seenNames.set(nameKey, db);
        }
      }

      for (const db of seenNames.values()) {
        const dbQty = parseFloat(db.quantity);
        const sellingPrice = parseFloat(db.selling_price) || 0;
        // Skip products with no price set
        if (sellingPrice <= 0) continue;

        const discountPct = Math.min(Math.max(parseFloat(db.discount_pct) || 0, 0), 100);
        const estimatedMrp = sellingPrice;

        // Extract image(s) from DB images_json
        let dbImages: string[] = [];
        if (db.images_json) {
          try {
            const imgArr = typeof db.images_json === 'string' ? JSON.parse(db.images_json) : db.images_json;
            if (Array.isArray(imgArr)) dbImages = imgArr.map(resolveImageUrl).filter(Boolean);
            else if (typeof imgArr === 'string' && imgArr) dbImages = [resolveImageUrl(imgArr)];
          } catch { /* ignore parse errors */ }
        }

        const effectiveImages = dbImages.length > 0 ? dbImages : ['/assets/o3_logo.jpeg'];

        mapped.push({
          dbName: db.product_name,
          displayName: db.product_name,
          image: effectiveImages[0],
          images: effectiveImages,
          rating: 0,
          reviewsCount: 0,
          price: Math.round(sellingPrice * (100 - discountPct)) / 100,
          mrp: estimatedMrp,
          discount: discountPct > 0 ? discountPct + '% OFF' : '',
          description: db.description || db.product_name,
          features: [],
          specs: { Category: db.category || 'Premium Utility', Brand: db.brand || 'O3 Car Spaa', SKU: db.sku || '-' },
          whyBuy: '',
          dbId: db.id,
          dbQty: dbQty,
          dbPrice: Math.round(sellingPrice * (100 - discountPct)) / 100,
          inStock: isNaN(dbQty) ? true : dbQty > 0,
        } as any);
      }

      setProducts(mapped);

      // 3. Fetch Customer Orders
      const orderRes = await api.get('/products/my-orders');
      setOrders(orderRes.data?.data || []);
    } catch (err) {
      console.error('Error loading products/orders:', err);
      toast('error', 'Failed to load products. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  useLiveReload(() => { loadData(); }); // reload when anything changes elsewhere
  useEffect(() => {
    loadData();
  }, []);

  // Derive all categories from master dbCategories and loaded products
  const availableCategories = Array.from(
    new Set([
      ...dbCategories,
      ...products.map((p) => p.specs?.Category).filter(Boolean)
    ])
  ).filter(Boolean).sort((a: string, b: string) => a.localeCompare(b)) as string[];

  // Filter products by search term and selected category
  const filteredProducts = products.filter((p) => {
    const matchesSearch =
      !searchTerm ||
      p.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (p.description && p.description.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesCategory =
      !selectedCategory || p.specs?.Category === selectedCategory;

    return matchesSearch && matchesCategory;
  });

  const handlePurchase = async () => {
    if (!selectedProduct) return;
    if (!selectedProduct.dbId) {
      toast('error', 'This product is temporarily unavailable (not linked to inventory).');
      return;
    }

    if (selectedProduct.dbQty < quantity) {
      toast('error', `Only ${selectedProduct.dbQty} units left in stock.`);
      return;
    }

    // Collect at the studio and pay there (cash / UPI QR at the counter)
    try {
      const r = await api.post('/products/order', { product_id: selectedProduct.dbId, quantity, payment_method: 'cash', shipping_address: 'Collect at studio' });
      toast('success', `Order #${r.data.order_id} placed — collect and pay ₹${Number(r.data.total_amount || selectedProduct.dbPrice * quantity).toLocaleString('en-IN')} at the studio`);
      setSelectedProduct(null);
      setActiveTab('orders');
      loadData();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Could not place the order');
    }
  };

  const handleQrSubmit = async () => {
    if (!qrTransactionId.trim()) {
      toast('error', 'Please enter a valid Transaction ID / UTR number.');
      return;
    }

    try {
      setSubmittingQr(true);
      await api.post('/products/order', {
        product_id: selectedProduct.dbId,
        quantity,
        payment_method: 'qr',
        qr_transaction_id: qrTransactionId.trim()
      });

      toast('success', 'QR Payment submitted. Awaiting Admin verification!');
      setQrModalOpen(false);
      setSelectedProduct(null);
      setQrTransactionId('');
      setActiveTab('orders');
      loadData();
    } catch (err: any) {
      toast('error', err.response?.data?.error || 'Failed to submit QR payment.');
    } finally {
      setSubmittingQr(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner */}
      <div className="relative rounded-3xl overflow-hidden bg-gradient-to-r from-[#0F172A] via-[#1E293B] to-[#0F172A] border border-white/5 p-6 sm:p-8 shadow-xl">
        <img src={BANNER_PHOTOS.shop} alt="" className="absolute inset-0 w-full h-full object-cover opacity-50" />
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-600/10 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-xl space-y-3">
          <span className="px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-xs font-bold uppercase tracking-wider">
            Premium Studio Accessories
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            O3 Car Spaa Store
          </h2>
          <p className="text-sm text-slate-300">
            Car-care products and accessories our detailers use and trust. Order here, pay and collect at the studio.
          </p>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 border-b border-gray-200">
        <button
          onClick={() => setActiveTab('shop')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 ${
            activeTab === 'shop'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ShoppingCart size={16} />
          Shop Accessories
        </button>
        <button
          onClick={() => setActiveTab('orders')}
          className={`px-5 py-3 text-sm font-bold border-b-2 transition-all flex items-center gap-2 relative ${
            activeTab === 'orders'
              ? 'border-[#2563EB] text-[#2563EB]'
              : 'border-transparent text-gray-500 hover:text-gray-800'
          }`}
        >
          <ShoppingBag size={16} />
          My Orders
          {orders.length > 0 && (
            <span className="ml-1 w-5 h-5 bg-blue-500 text-white rounded-full text-[10px] flex items-center justify-center font-bold">
              {orders.length}
            </span>
          )}
        </button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-20">
          <RefreshCw className="animate-spin text-gray-400" size={32} />
        </div>
      ) : activeTab === 'shop' ? (
        <div className="space-y-6">
          {/* Search & Category Filter Bar */}
          <div className="bg-white p-4 rounded-2xl shadow-sm border border-gray-100 space-y-3">
            <div className="flex flex-col md:flex-row gap-3 items-stretch md:items-center justify-between">
              {/* Search Input */}
              <div className="relative flex-1">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 text-gray-400" size={16} />
                <input
                  type="text"
                  placeholder="Search accessories by name or keyword..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="w-full pl-10 pr-8 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-medium focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                  >
                    <X size={14} />
                  </button>
                )}
              </div>

              {/* Category Select Dropdown */}
              <div className="w-full md:w-56 flex items-center gap-2">
                <Dropdown
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  className="w-full px-3 py-2 bg-gray-50 border border-gray-200 rounded-xl text-xs font-bold text-gray-700 focus:outline-none focus:ring-2 focus:ring-blue-500/20 focus:bg-white transition-all cursor-pointer"
                >
                  <option value="">All Categories ({products.length})</option>
                  {availableCategories.map((cat) => {
                    const count = products.filter((p) => p.specs?.Category === cat).length;
                    return (
                      <option key={cat} value={cat}>
                        {cat} ({count})
                      </option>
                    );
                  })}
                </Dropdown>
              </div>

              {/* Reset Filters */}
              {(searchTerm || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('');
                  }}
                  className="px-3.5 py-2 text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 hover:bg-blue-100 rounded-xl transition-all flex items-center justify-center gap-1.5 shrink-0 cursor-pointer"
                >
                  <RefreshCw size={13} />
                  Reset Filters
                </button>
              )}
            </div>

            {/* Category Quick Pills */}
            {availableCategories.length > 0 && (
              <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs pt-2 border-t border-gray-100">
                <button
                  onClick={() => setSelectedCategory('')}
                  className={`px-3 py-1 rounded-lg font-bold transition-all shrink-0 cursor-pointer ${
                    selectedCategory === ''
                      ? 'bg-[#2563EB] text-white shadow-sm'
                      : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
                  }`}
                >
                  All ({products.length})
                </button>
                {availableCategories.map((cat) => {
                  const count = products.filter((p) => p.specs?.Category === cat).length;
                  return (
                    <button
                      key={cat}
                      onClick={() => setSelectedCategory(cat)}
                      className={`px-3 py-1 rounded-lg font-bold transition-all shrink-0 flex items-center gap-1 cursor-pointer ${
                        selectedCategory === cat
                          ? 'bg-[#2563EB] text-white shadow-sm'
                          : 'bg-gray-100 text-gray-700 hover:bg-gray-200'
                      }`}
                    >
                      <span>{cat}</span>
                      <span
                        className={`text-[10px] px-1.5 py-0.2 rounded-full font-extrabold ${
                          selectedCategory === cat ? 'bg-white/20 text-white' : 'bg-gray-200 text-gray-700'
                        }`}
                      >
                        {count}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>

          {/* Empty State vs Products Grid */}
          {filteredProducts.length === 0 ? (
            <div className="bg-white rounded-2xl p-12 text-center border border-gray-100 shadow-sm space-y-4">
              <div className="w-14 h-14 bg-blue-50 text-blue-500 rounded-full flex items-center justify-center mx-auto">
                <ShoppingBag size={26} />
              </div>
              <div className="space-y-1">
                <h3 className="text-base font-bold text-gray-800">No Accessories Found</h3>
                <p className="text-xs text-gray-500 max-w-sm mx-auto">
                  We couldn't find any products matching your search query or selected category filter.
                </p>
              </div>
              {(searchTerm || selectedCategory) && (
                <button
                  onClick={() => {
                    setSearchTerm('');
                    setSelectedCategory('');
                  }}
                  className="px-4 py-2 bg-gray-900 hover:bg-black text-white text-xs font-bold rounded-xl transition-all cursor-pointer"
                >
                  Clear Filters
                </button>
              )}
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
              {filteredProducts.map((product, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group"
                >
                  {/* Product Image */}
                  <div className="relative aspect-square bg-white overflow-hidden">
                    <img
                      src={product.image || 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80'}
                      alt={product.displayName}
                      className="w-full h-full object-contain p-2 group-hover:scale-105 transition-transform duration-500"
                      onError={(e) => {
                        (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80';
                      }}
                    />
                    {product.discount && (
                      <span className="absolute top-3 left-3 bg-blue-600 text-white text-[11px] font-black px-2 py-0.5 rounded-full uppercase">
                        {product.discount}
                      </span>
                    )}
                    {!product.inStock && (
                      <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center">
                        <span className="bg-white text-black font-extrabold text-xs px-3 py-1 rounded-full uppercase tracking-wider">
                          Out of Stock
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Body */}
                  <div className="p-5 flex-1 flex flex-col justify-between space-y-4">
                    <div className="space-y-2">
                      <div className="flex justify-between items-start">
                        <span className="text-[10px] uppercase tracking-wider text-gray-400 font-bold">
                          {product.specs?.Category || product.specs?.Material || product.specs?.GSM || 'Premium Utility'}
                        </span>
                        {product.rating > 0 && (
                          <div className="flex items-center gap-0.5 text-amber-500">
                            <Star size={12} fill="currentColor" />
                            <span className="text-xs font-bold text-gray-700">{product.rating}</span>
                          </div>
                        )}
                      </div>
                      <h3 className="font-bold text-gray-900 group-hover:text-[#2563EB] transition-colors leading-tight line-clamp-1">
                        {product.displayName}
                      </h3>
                      <p className="text-xs text-gray-500 line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>
                    </div>

                    {/* Price & Buy Button */}
                    <div className="pt-3 border-t border-gray-100 flex items-center justify-between">
                      <div>
                        <div className="flex items-baseline gap-1.5">
                          <span className="text-lg font-black text-gray-900">₹{product.price}</span>
                          {Number(product.mrp) > Number(product.price) && (
                            <span className="text-xs text-gray-400 line-through">₹{product.mrp}</span>
                          )}
                        </div>
                        <span className="text-[10px] text-emerald-600 font-bold">In Stock</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <button
                          onClick={() => setSelectedProduct(product)}
                          className="px-3 py-2 rounded-xl text-xs font-bold border border-gray-200 hover:bg-gray-50 text-gray-700 transition-all cursor-pointer"
                        >
                          Details ℹ️
                        </button>
                        <button
                          onClick={() => {
                            if (!product.dbId) {
                              toast('error', 'This product is unavailable');
                              return;
                            }
                            useCartStore.getState().addProductToCart({
                              id: product.dbId,
                              product_name: product.displayName,
                              selling_price: product.price,
                              image_url: product.image,
                              stock: product.dbQty || 99,
                            });
                            toast('success', `Added "${product.displayName}" to Products Cart!`);
                          }}
                          className={`px-3 py-2 rounded-xl text-xs font-bold flex items-center gap-1.5 transition-all shadow-sm cursor-pointer ${
                            product.inStock
                              ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-500/20'
                              : 'bg-gray-100 text-gray-400 cursor-not-allowed'
                          }`}
                          disabled={!product.inStock}
                        >
                          <ShoppingCart size={14} /> Add
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        /* Orders Tab */
        <div className="space-y-4">
          {orders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-gray-100 p-12 text-center space-y-3">
              <ShoppingBag size={48} className="mx-auto text-gray-300" />
              <h3 className="font-bold text-gray-800 text-base">No orders placed yet</h3>
              <p className="text-xs text-gray-500 max-w-sm mx-auto">
                Explore our premium accessories store tab to upgrade your car with original detailing cloths, seat covers, and damping sheets.
              </p>
              <button
                onClick={() => setActiveTab('shop')}
                className="px-5 py-2.5 bg-[#0F172A] hover:bg-[#2563EB] text-white text-xs font-bold rounded-xl transition-colors"
              >
                Go to Shop
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {orders.map((order) => {
                let cartItems: any[] = [];
                if (order.items_json) {
                  try { cartItems = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json; } catch { cartItems = []; }
                }
                const lines = cartItems.length ? cartItems : [{ product_name: order.product_name, quantity: order.quantity, total_price: order.total_amount }];
                const first = lines[0]?.product_name || order.product_name;
                const img = products.find((p: any) => p.displayName === first || p.name === first || p.product_name === first)?.image || '/photos/shop.webp';
                const st = order.payment_status === 'completed' && order.collected_at ? { t: 'Collected & paid', c: 'bg-slate-100 text-slate-700' }
                  : order.payment_status === 'completed' ? { t: 'Ready to collect', c: 'bg-emerald-50 text-emerald-700' }
                  : order.payment_status === 'pending' ? { t: 'Awaiting approval', c: 'bg-amber-50 text-amber-700' } : { t: 'Payment failed', c: 'bg-rose-50 text-rose-600' };
                return (
                  <div key={order.id} className="bg-white rounded-2xl shadow-[0_4px_18px_rgba(15,23,42,0.06)] border border-slate-100 overflow-hidden">
                    <div className="flex gap-3 p-3">
                      <img src={img} alt="" className="w-16 h-16 rounded-xl object-contain bg-white shrink-0" loading="lazy" />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start justify-between gap-2">
                          <p className="font-extrabold text-[14.5px] text-slate-900 leading-snug line-clamp-2">{lines.length > 1 ? `${first} + ${lines.length - 1} more` : first}</p>
                          <span className="text-[15px] font-black text-slate-900 shrink-0">₹{Number(order.total_amount).toLocaleString('en-IN')}</span>
                        </div>
                        <div className="flex flex-wrap items-center gap-1.5 mt-1">
                          <span className={`px-2 py-0.5 rounded-full text-[10.5px] font-bold ${st.c}`}>{st.t}</span>
                          <span className="text-[11px] text-slate-500">{lines.reduce((t: number, l: any) => t + (Number(l.quantity) || 1), 0)} item(s) · {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', timeZone: 'Asia/Kolkata' })}</span>
                        </div>
                        <p className="text-[11px] text-slate-500 mt-1 truncate">{order.payment_method === 'cash' ? 'Pay & collect at the studio' : `Paid by ${String(order.payment_method || '').toUpperCase()}`}</p>
                      </div>
                    </div>
                    {lines.length > 1 && (
                      <div className="px-3 pb-3 -mt-1 text-[11.5px] text-slate-600 space-y-0.5">
                        {lines.map((l: any, i: number) => (
                          <div key={i} className="flex justify-between"><span className="truncate">{l.product_name} × {l.quantity}</span><span className="font-semibold">₹{l.total_price || (l.unit_price * l.quantity)}</span></div>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Product Detail & Checkout Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl overflow-y-auto md:overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col md:flex-row max-h-[92vh]">
            {/* Product Picture Section */}
            <div className="relative md:w-1/2 bg-gray-900 flex flex-col justify-between min-h-[300px]">
              <div className="flex-1 flex items-center justify-center p-2">
                <img
                  src={selectedProduct.image || 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80'}
                  alt={selectedProduct.displayName}
                  className="w-full h-[280px] object-contain rounded-xl"
                  onError={(e) => {
                    (e.target as HTMLImageElement).src = 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80';
                  }}
                />
              </div>
              {selectedProduct.images && selectedProduct.images.length > 1 && (
                <div className="p-3 bg-black/40 flex items-center gap-2 overflow-x-auto justify-center">
                  {selectedProduct.images.map((img: string, idx: number) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setSelectedProduct((prev: any) => ({ ...prev, image: img }))}
                      className={`w-12 h-12 rounded-lg border-2 overflow-hidden shrink-0 transition-all ${
                        selectedProduct.image === img ? 'border-blue-500 scale-105' : 'border-transparent opacity-70 hover:opacity-100'
                      }`}
                    >
                      <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-contain bg-white" />
                    </button>
                  ))}
                </div>
              )}
              <button
                onClick={() => setSelectedProduct(null)}
                className="absolute top-4 left-4 p-2 rounded-full bg-black/50 hover:bg-black text-white transition-colors md:hidden"
              >
                <X size={18} />
              </button>
            </div>

            {/* Product Details Section */}
            <div className="md:w-1/2 p-6 overflow-y-auto flex flex-col justify-between space-y-6">
              <div className="space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="text-xl font-black text-gray-900 leading-tight">
                      {selectedProduct.displayName}
                    </h3>
                    {selectedProduct.rating > 0 && (
                      <div className="flex items-center gap-2 mt-1">
                        <div className="flex items-center text-amber-500 gap-0.5">
                          <Star size={14} fill="currentColor" />
                          <span className="text-xs font-bold text-gray-700">{selectedProduct.rating}</span>
                        </div>
                        <span className="text-xs text-gray-400">({selectedProduct.reviewsCount} Reviews)</span>
                      </div>
                    )}
                  </div>
                  <button
                    onClick={() => setSelectedProduct(null)}
                    className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors hidden md:block"
                  >
                    <X size={18} />
                  </button>
                </div>

                <div className="flex items-baseline gap-2.5">
                  <span className="text-2xl font-black text-gray-900">₹{selectedProduct.dbPrice}</span>
                  {Number(selectedProduct.mrp) > Number(selectedProduct.dbPrice) && <>
                    <span className="text-sm text-gray-400 line-through">₹{selectedProduct.mrp}</span>
                    <span className="bg-blue-50 text-blue-600 text-xs font-extrabold px-2 py-0.5 rounded-md">
                      {selectedProduct.discount}
                    </span>
                  </>}
                </div>

                <p className="text-xs text-gray-600 leading-relaxed">
                  {selectedProduct.description}
                </p>

                {/* Specs / Details */}
                <div className="bg-gray-50 rounded-2xl p-4 space-y-2">
                  <h4 className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Product Specs</h4>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {Object.entries(selectedProduct.specs).map(([key, val]: any) => (
                      <div key={key}>
                        <span className="text-gray-400">{key}:</span>{' '}
                        <strong className="text-gray-800">{val}</strong>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Features list */}
                <div className="space-y-1.5">
                  {selectedProduct.features.map((feat: string, idx: number) => (
                    <div key={idx} className="flex items-center gap-2 text-xs text-gray-700">
                      <CheckCircle size={14} className="text-blue-600 shrink-0" />
                      <span>{feat}</span>
                    </div>
                  ))}
                </div>

                {/* Qty and Payment Mode selectors */}
                <div className="pt-2 grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Quantity</label>
                    <div className="flex items-center border border-gray-200 rounded-xl overflow-hidden h-10 w-28">
                      <button
                        onClick={() => setQuantity(Math.max(1, quantity - 1))}
                        className="w-8 h-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold text-gray-600 transition-colors"
                      >
                        -
                      </button>
                      <span className="flex-1 text-center font-bold text-sm text-gray-800">{quantity}</span>
                      <button
                        onClick={() => setQuantity(Math.min(selectedProduct.dbQty, quantity + 1))}
                        className="w-8 h-full bg-gray-50 hover:bg-gray-100 flex items-center justify-center font-bold text-gray-600 transition-colors"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Payment</label>
                    <div className="h-10 px-3 rounded-xl border border-gray-200 bg-gray-50 flex items-center text-xs font-bold text-gray-700">Pay at studio</div>
                  </div>
                </div>
              </div>

              {/* Action Button */}
              <div className="pt-4 border-t border-gray-100 flex items-center justify-between">
                <div>
                  <span className="text-[10px] uppercase font-bold text-gray-400 block leading-tight">Total Amount</span>
                  <span className="text-xl font-black text-gray-900">₹{selectedProduct.dbPrice * quantity}</span>
                </div>
                <button
                  onClick={handlePurchase}
                  className="px-6 py-3 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-sm font-bold rounded-xl transition-all shadow-md flex items-center gap-2"
                >
                  Place order
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Payment Upload Modal */}
      {qrModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[120] flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-md shadow-2xl p-6 space-y-6">
            <div className="flex justify-between items-start">
              <div>
                <h3 className="font-extrabold text-[#0F172A] text-lg">Scan & Pay</h3>
                <p className="text-xs text-gray-500">Pay using any UPI app</p>
              </div>
              <button
                onClick={() => setQrModalOpen(false)}
                className="p-2 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-500 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* QR Code Image Display */}
            <div className="bg-gray-50 rounded-2xl p-4 flex flex-col items-center justify-center border border-gray-100 space-y-3">
              <StudioQr amount={selectedProduct ? selectedProduct.dbPrice * quantity : undefined} className="w-48 h-48 shadow-md" />
              <div className="text-center">
                <span className="text-xs font-bold text-gray-700">Amount to Pay:</span>{' '}
                <span className="text-sm font-black text-[#2563EB]">₹{selectedProduct.dbPrice * quantity}</span>
              </div>
            </div>

            {/* Transaction ID input */}
            <div className="space-y-2">
              <label className="text-xs font-bold text-gray-700 block">
                Transaction ID / UTR Number <span className="text-blue-500">*</span>
              </label>
              <input
                type="text"
                placeholder="Enter 12-digit UPI Transaction Ref ID"
                value={qrTransactionId}
                onChange={(e) => setQrTransactionId(e.target.value)}
                className="w-full h-11 px-4 border border-gray-200 rounded-xl text-sm focus:outline-none focus:ring-2 focus:ring-[#2563EB] focus:border-transparent font-medium"
              />
              <p className="text-[10px] text-gray-400">
                Submit the Transaction ID from GPay, PhonePe, Paytm or any other UPI App for confirmation.
              </p>
            </div>

            {/* Buttons */}
            <div className="flex gap-3 pt-2">
              <button
                onClick={() => setQrModalOpen(false)}
                className="flex-1 h-11 border border-gray-200 rounded-xl text-xs font-bold text-gray-600 hover:bg-gray-50 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleQrSubmit}
                disabled={submittingQr}
                className="flex-1 h-11 bg-[#2563EB] hover:bg-[#1D4ED8] text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center justify-center gap-1.5"
              >
                {submittingQr ? (
                  <RefreshCw className="animate-spin" size={14} />
                ) : (
                  <>
                    <Check size={14} />
                    Confirm Payment
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Floating Products Cart Button */}
      {productsCart.length > 0 && (
        // sits just above the bottom menu bar
        <div className="fixed left-4 right-4 sm:left-auto sm:right-6 bottom-[calc(5.5rem+env(safe-area-inset-bottom))] z-[95]">
          <button
            onClick={() => setProductsDrawerOpen(true)}
            className="w-full sm:w-auto flex items-center gap-3 px-5 py-3.5 bg-[#2563EB] text-white font-bold text-sm rounded-2xl shadow-xl shadow-blue-600/30 active:scale-[0.98] transition-transform"
          >
            <span className="relative"><ShoppingBag size={20} /><span className="absolute -top-2 -right-2 min-w-[18px] h-[18px] px-1 rounded-full bg-white text-[#2563EB] text-[11px] font-black flex items-center justify-center">{productsCart.reduce((n: number, i: any) => n + (i.quantity || 1), 0)}</span></span>
            <span className="flex-1 text-left">View cart</span>
            <span className="font-black">₹{productsCart.reduce((t: number, i: any) => t + Number(i.selling_price || 0) * (i.quantity || 1), 0).toLocaleString('en-IN')}</span>
          </button>
        </div>
      )}

      {/* Products Cart Drawer */}
      <ProductsCartDrawer
        isOpen={productsDrawerOpen}
        onClose={() => setProductsDrawerOpen(false)}
        onOrderSuccess={() => { setActiveTab('orders'); loadData(); }}
      />
    </div>
  );
}
