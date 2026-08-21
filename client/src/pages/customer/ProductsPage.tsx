import { useState, useEffect } from 'react';
import { ShoppingBag, CreditCard, CheckCircle, Clock, AlertTriangle, ArrowRight, Star, ThumbsUp, Check, Truck, ShieldCheck, ShoppingCart, RefreshCw, X, QrCode, Search } from 'lucide-react';
import api from '../../api/axiosInstance';
import { useUIStore } from '../../store/uiStore';
import { useCartStore } from '../../store/useCartStore';
import ProductsCartDrawer from '../../components/shared/ProductsCartDrawer';

function resolveImageUrl(url: string | undefined): string {
  if (!url) return '';
  if (url.includes('localhost:5000') || url.includes('127.0.0.1')) {
    const idx = url.indexOf('/uploads/');
    if (idx !== -1) return url.substring(idx);
  }
  return url;
}

// Static product configuration with details matching ChatGPT screenshots
const PRODUCT_TEMPLATES = [
  {
    dbName: 'MICROFIBER 40*60 800 GSM',
    displayName: 'Microfiber Towel 40x60 800 GSM',
    image: '/products/microfiber_40x60_800gsm.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 399,
    mrp: 699,
    discount: '43% OFF',
    description: 'Premium 800 GSM microfiber towel for a swirl-free shine. Ultra absorbent, lint-free & safe on all surfaces.',
    features: ['Ultra Soft Touch', 'High Absorbency', 'Scratch Free', 'Durable & Long Lasting'],
    specs: {
      Size: '40 x 60 cm',
      GSM: '800 GSM',
      Material: 'Premium Microfiber',
      Color: 'Grey with Red Stitch'
    },
    whyBuy: 'Engineered for perfect care. Soft, absorbent & scratch-free for a flawless finish every time.'
  },
  {
    dbName: 'MICROFIBER 40*40 450 GSM 2PCS - SMOOTH FUR',
    displayName: 'Microfiber 40x40 450 GSM 2PCS - Smooth Fur',
    image: '/products/microfiber_40x40_smooth_fur.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 299,
    mrp: 499,
    discount: '40% OFF',
    description: 'Premium 450 GSM microfiber towel with smooth fur texture. Ultra soft, lint-free & safe on all surfaces. Perfect for polishing, buffing & final finish.',
    features: ['Ultra Soft Touch', 'High Absorbency', 'Scratch Free', 'Durable & Long Lasting'],
    specs: {
      Size: '40 x 40 cm',
      GSM: '450 GSM',
      Quantity: '2 PCS',
      Color: 'Grey with Red Stitch'
    },
    whyBuy: 'Ideal for wax removal, detailing sprays, and interior dusting without leaving any swirl marks.'
  },
  {
    dbName: 'MICROFIBER 40*40 450 GSM 2PCS - HEAVY FUR',
    displayName: 'Microfiber Towel 40x40 450 GSM 2PCS - Heavy Fur',
    image: '/products/microfiber_40x40_heavy_fur.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 299,
    mrp: 499,
    discount: '40% OFF',
    description: 'Premium 450 GSM microfiber towel with heavy fur texture. Ultra soft, lint-free & safe on all surfaces. Perfect for polishing, buffing & final finish.',
    features: ['Ultra Soft Touch', 'High Absorbency', 'Scratch Free', 'Durable & Long Lasting'],
    specs: {
      Size: '40 x 40 cm',
      GSM: '450 GSM',
      Quantity: '2 PCS',
      Color: 'Dark Grey with Red Stitch'
    },
    whyBuy: 'Long pile fibers safely trap dirt particles away from paint surfaces for a swirl-free finish.'
  },
  {
    dbName: 'ASTONISH PREMIUM DAMPING - 2.8 PLUS',
    displayName: 'Astonish Premium Damping-2.8 Plus',
    image: '/products/astonish_damping_2.8_plus.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 1999,
    mrp: 3499,
    discount: '43% OFF',
    description: 'Premium damping sheet with 2.8mm thickness for superior noise reduction and vibration control. Enhances driving comfort with excellent heat resistance and durability.',
    features: ['Noise Reduction', 'Vibration Control', 'Heat Resistant', 'Long Lasting'],
    specs: {
      Thickness: '2.8 mm',
      PackSize: '5 Sheets (2.8mm Each)',
      Material: 'Premium Butyl Rubber',
      Adhesive: 'Industrial grade self-adhesive'
    },
    whyBuy: 'Damping sheets improve driving comfort by reducing noise, vibrations and heat for a quieter, smoother and more enjoyable ride.'
  },
  {
    dbName: 'SIDE CONSOL',
    displayName: 'Side Consol Storage Pocket',
    image: '/products/side_consol.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 799,
    mrp: 1299,
    discount: '38% OFF',
    description: 'Smart side storage solution to keep your essentials within reach. Fills the gap between seat and console. Prevents items from falling into the gap.',
    features: ['Extra Storage', 'Premium Quality', 'Universal Fit', 'Easy Install'],
    specs: {
      Color: 'Black with Red Stitch',
      Material: 'Premium PU Leather',
      Fit: 'Universal',
      Installation: 'Insert directly into seat gap'
    },
    whyBuy: 'Maximize your car space and keep essentials within reach while driving. Smart, stylish & practical.'
  },
  {
    dbName: 'SIDE CONSOL FIX',
    displayName: 'Side Consol Fix Pocket',
    image: '/products/side_consol_fix.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 499,
    mrp: 799,
    discount: '38% OFF',
    description: 'Smart solution to fill the gap between seat and console. Prevents small items from falling into the gap. Keeps your car clean, organized and clutter-free.',
    features: ['Prevents Falls', 'Perfect Fit', 'Premium Quality', 'Easy Install'],
    specs: {
      Color: 'Black',
      Material: 'Flexible ABS & PU Leather',
      Fit: 'Universal Fit',
      Installation: 'Insert into seat gap'
    },
    whyBuy: 'Small items falling into the seat gap can be annoying and hard to retrieve. Side Consol Fix prevents drops, keeps your car clean and adds a premium look.'
  },
  {
    dbName: 'HOOK',
    displayName: 'Premium Car Headrest Hook',
    image: '/products/hook.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 199,
    mrp: 299,
    discount: '33% OFF',
    description: 'Universal hook for your car to hang bags, accessories, and more. Strong grip that holds heavy items securely. Keeps your car organized and clutter-free.',
    features: ['Strong Hold', 'Premium Quality', 'Universal Fit', 'Easy Install'],
    specs: {
      Color: 'Black Carbon Fiber Texture',
      LoadCapacity: 'Up to 10 kg',
      Fit: 'Universal headrest shafts',
      Installation: 'Side-opening design, no removal needed'
    },
    whyBuy: 'From groceries to gadgets, keep everything securely hung and within reach. HOOK makes your car tidy, organized and stress-free.'
  },
  {
    dbName: 'TISSU COVER',
    displayName: 'Premium PU Leather Tissue Cover',
    image: '/products/tissue_cover.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 249,
    mrp: 399,
    discount: '38% OFF',
    description: 'Stylish tissue cover for your car. Made with premium material for long-lasting use. Easy tissue access and keeps your car interior organized.',
    features: ['Premium Quality', 'Easy Access', 'Universal Fit', 'Stylish Design'],
    specs: {
      Color: 'Black',
      Material: 'Soft PU Leather',
      Fit: 'Fits most car dashboards/visors',
      Closure: 'Magnetic bottom flap'
    },
    whyBuy: 'Keep tissues within reach and your car interior organized. A perfect blend of style, convenience and premium quality.'
  },
  {
    dbName: 'TISSU COVER HEAVY',
    displayName: 'Heavy Build Tissue Cover',
    image: '/products/tissue_cover_heavy.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 449,
    mrp: 699,
    discount: '36% OFF',
    description: 'Premium heavy build tissue cover for your car. Made with high-quality material for long-lasting use. Keeps tissues within reach and adds a premium look to your car.',
    features: ['Heavy Build', 'Premium Quality', 'Universal Fit', 'Easy To Use'],
    specs: {
      Color: 'Black with Red Stitch',
      Material: 'Textured PU Leather',
      Pattern: 'Diamond Quilted',
      Fit: 'Universal dash or armrest placement'
    },
    whyBuy: 'Keep tissues within easy reach and maintain the premium look of your car interior. Heavy build quality ensures long-lasting performance.'
  },
  {
    dbName: 'ST COVER',
    displayName: 'Premium PU Leather Seat Cover',
    image: '/products/seat_cover.png',
    rating: 4.8,
    reviewsCount: 128,
    price: 1499,
    mrp: 2499,
    discount: '40% OFF',
    description: 'Give your car interior a premium upgrade. Made with high-quality PU leather for durability and comfort. Universal fit for most cars.',
    features: ['Premium Quality', 'Comfortable Design', 'Universal Fit', 'Multi-Layer Protection'],
    specs: {
      ColorsAvailable: 'Black & Beige, Black & Red',
      Material: 'High-grade PU Leather',
      Quantity: 'Complete Set (Front & Rear)',
      Cleaning: 'Wipe clean surface'
    },
    whyBuy: 'Seat covers protect your original seats from dirt, spills, stains and wear & tear. Enhance comfort and give your car interior a premium look.'
  },
  {
    dbName: 'MEMORY NECK REST - ASTONISH',
    displayName: 'Memory Neck Rest - ASTONISH',
    image: '/products/memory_neck_rest.png',
    rating: 4.8,
    reviewsCount: 128,
    price: 699,
    mrp: 1299,
    discount: '46% OFF',
    description: 'Experience superior comfort on every drive. Premium memory foam supports your neck and reduces fatigue. Ergonomic design for perfect neck & head support. Universal fit for most cars.',
    features: ['Memory Foam Comfort', 'Ergonomic Support', 'Universal Fit', 'Reduces Neck Fatigue'],
    specs: {
      Color: 'Black with Red Stitching',
      Material: 'High-Density Memory Foam',
      Cover: 'Breathable perforated leatherette',
      Strap: 'Adjustable elastic strap'
    },
    whyBuy: 'Long drives can cause neck pain and fatigue. ASTONISH Memory Neck Rest provides perfect support and comfort for a relaxed and enjoyable journey.'
  },
  {
    dbName: 'MEMORY CUSION PILLOW - ASTONISH',
    displayName: 'Memory Cushion Pillow - ASTONISH',
    image: '/products/memory_cushion_pillow.png',
    rating: 4.8,
    reviewsCount: 128,
    price: 599,
    mrp: 1099,
    discount: '45% OFF',
    description: 'Experience superior comfort on every drive. Premium memory foam adapts to your back for perfect support. Reduces fatigue and enhances posture while driving. Universal fit for most car seats.',
    features: ['Memory Foam Comfort', 'Ergonomic Support', 'Universal Fit', 'Reduces Back Fatigue'],
    specs: {
      Color: 'Black with Red Stitching',
      Material: 'High-Density Memory Foam',
      Design: 'Ergonomic lumbar curvature',
      Washable: 'Removable zip cover'
    },
    whyBuy: 'Long drives can cause back pain and discomfort. ASTONISH Memory Cushion Pillow provides the perfect support to keep you relaxed and comfortable through every journey.'
  },
  {
    dbName: 'TYRE INFLATOR (14)',
    displayName: 'Digital Tyre Inflator',
    image: '/products/tyre_inflator.png',
    rating: 4.8,
    reviewsCount: 156,
    price: 1499,
    mrp: 2499,
    discount: '40% OFF',
    description: 'Portable tyre inflator with powerful motor for quick inflation. Digital display for accurate pressure reading. Auto shut-off, LED light & multiple nozzles for all uses. Perfect for cars, bikes, cycles & sports equipment.',
    features: ['Fast Inflation', 'Digital Display', 'Auto Shut-off', 'LED Light & Multi-use Nozzles'],
    specs: {
      PressureUnits: 'BAR, PSI',
      PowerSource: '12V Car Cigarette Lighter',
      MaxPressure: '150 PSI',
      Display: 'Backlit LCD Digital Display'
    },
    whyBuy: 'Proper tyre pressure ensures safety, better fuel efficiency & longer tyre life. Keep this compact inflator in your car and be always ready for emergencies.'
  },
  {
    dbName: 'PORTABLE CAR VACUUM CLEANER',
    displayName: 'Portable Car Vacuum Cleaner',
    image: '/products/car_vacuum.png',
    rating: 4.8,
    reviewsCount: 156,
    price: 1499,
    mrp: 2499,
    discount: '40% OFF',
    description: 'High power portable vacuum cleaner for deep cleaning. Strong suction for dust, crumbs, pet hair & more. Compact, lightweight & easy to carry. Perfect for car, home & office use.',
    features: ['Strong Suction', 'HEPA Filter', 'Lightweight & Portable', 'Multi-use Attachments'],
    specs: {
      Power: '120W High Performance Motor',
      FilterType: 'Washable HEPA Filter',
      Weight: 'Lightweight ergonomic body',
      Accessories: 'Comes with multiple cleaning nozzles'
    },
    whyBuy: 'A clean car is a happy car! Remove dust, dirt, crumbs & pet hair easily with powerful suction. Compact & portable - clean anytime, anywhere.'
  },
  {
    dbName: 'CROSS BODY BAG',
    displayName: 'Premium Cross Body Bag',
    image: '/products/cross_body_bag.png',
    rating: 4.9,
    reviewsCount: 128,
    price: 799,
    mrp: 1299,
    discount: '38% OFF',
    description: 'Stylish and durable cross body bag for everyday use. Spacious compartments to keep your essentials organized. Adjustable strap for a comfortable fit. Perfect for travel, work, or casual outings.',
    features: ['Premium Quality', 'Lightweight Design', 'Spacious Storage', 'Water Resistant'],
    specs: {
      Color: 'Black with White Branding',
      Material: 'Water-resistant nylon/polyester',
      Strap: 'Adjustable shoulder strap',
      Zippers: 'Heavy-duty smooth zippers'
    },
    whyBuy: 'Keep your essentials organized and secure wherever you go. A perfect blend of style, functionality and durability for every journey.'
  }
];

export default function ProductsPage() {
  const toast = useUIStore((s) => s.toast);
  const { productsCart, productsDrawerOpen, setProductsDrawerOpen } = useCartStore();
  const [products, setProducts] = useState<any[]>([]);
  const [orders, setOrders] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedProduct, setSelectedProduct] = useState<any | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [paymentMode, setPaymentMode] = useState<'razorpay' | 'qr'>('razorpay');
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
            const matchCount = tmplWords.filter(w => dbUpper.includes(w)).length;
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
        const effectivePrice = dbSellingPrice > 0 ? dbSellingPrice : tmpl.price;
        const effectiveMrp = dbSellingPrice > 0
          ? Math.ceil(dbSellingPrice * 1.6 / 10) * 10
          : tmpl.mrp;
        const effectiveDiscount = effectiveMrp > effectivePrice
          ? Math.round(((effectiveMrp - effectivePrice) / effectiveMrp) * 100) + '% OFF'
          : tmpl.discount;

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

        const estimatedMrp = Math.ceil(sellingPrice * 1.6 / 10) * 10; // Round up to nearest 10
        const discountPct = Math.round(((estimatedMrp - sellingPrice) / estimatedMrp) * 100);

        // Extract image(s) from DB images_json
        let dbImages: string[] = [];
        if (db.images_json) {
          try {
            const imgArr = typeof db.images_json === 'string' ? JSON.parse(db.images_json) : db.images_json;
            if (Array.isArray(imgArr)) dbImages = imgArr.map(resolveImageUrl).filter(Boolean);
            else if (typeof imgArr === 'string' && imgArr) dbImages = [resolveImageUrl(imgArr)];
          } catch { /* ignore parse errors */ }
        }

        const effectiveImages = dbImages.length > 0 ? dbImages : ['https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80'];

        mapped.push({
          dbName: db.product_name,
          displayName: db.product_name,
          image: effectiveImages[0],
          images: effectiveImages,
          rating: 4.5,
          reviewsCount: 0,
          price: sellingPrice,
          mrp: estimatedMrp,
          discount: discountPct > 0 ? discountPct + '% OFF' : '',
          description: db.description || db.product_name,
          features: [],
          specs: { Category: db.category || 'Premium Utility', Brand: db.brand || 'O3 Car Spa', SKU: db.sku || '-' },
          whyBuy: '',
          dbId: db.id,
          dbQty: dbQty,
          dbPrice: sellingPrice,
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

  const loadRazorpayScript = () => {
    return new Promise((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.async = true;
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

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

    try {
      if (paymentMode === 'razorpay') {
        const sdkLoaded = await loadRazorpayScript();
        if (!sdkLoaded) {
          toast('error', 'Razorpay SDK failed to load. Are you online?');
          return;
        }

        // 1. Create Order
        const orderRes = await api.post('/products/order', {
          product_id: selectedProduct.dbId,
          quantity,
          payment_method: 'razorpay'
        });

        const orderData = orderRes.data?.razorpay_order;
        const productOrderId = orderRes.data?.order_id;

        if (!orderData) {
          toast('error', 'Failed to initialize payment.');
          return;
        }

        const options = {
          key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_123',
          amount: orderData.amount,
          currency: orderData.currency,
          name: 'O3 Car Spa',
          description: `Purchase: ${selectedProduct.displayName}`,
          image: '/assets/logo.png',
          order_id: orderData.id,
          handler: async (response: any) => {
            try {
              toast('info', 'Verifying payment...');
              await api.post('/products/order/verify', {
                razorpay_order_id: response.razorpay_order_id,
                razorpay_payment_id: response.razorpay_payment_id,
                razorpay_signature: response.razorpay_signature
              });
              toast('success', 'Order placed successfully! Stock updated.');
              setSelectedProduct(null);
              loadData();
            } catch (err: any) {
              toast('error', err.response?.data?.error || 'Verification failed.');
            }
          },
          prefill: {
            name: '',
            email: '',
            contact: ''
          },
          theme: {
            color: '#2563EB'
          },
          modal: {
            ondismiss: () => {
              toast('warning', 'Payment cancelled.');
            }
          }
        };

        // If mock order
        if (orderData.id.startsWith('order_mock_')) {
          const confirmSim = window.confirm(
            "RAZORPAY SANDBOX MODE (Keys Missing)\n\nWould you like to simulate a successful online payment for this product?"
          );
          if (confirmSim) {
            try {
              await api.post('/products/order/verify', {
                razorpay_order_id: orderData.id,
                razorpay_payment_id: 'pay_mock_' + Date.now(),
                razorpay_signature: 'sig_mock_' + Date.now()
              });
              toast('success', 'Order placed successfully! (Simulated)');
              setSelectedProduct(null);
              loadData();
            } catch (err: any) {
              toast('error', err.response?.data?.error || 'Verification failed.');
            }
          }
          return;
        }

        const rzp = new (window as any).Razorpay(options);
        rzp.open();

      } else {
        // QR Code Modal Open
        setQrModalOpen(true);
      }
    } catch (err: any) {
      console.error('Purchase error:', err);
      toast('error', err.response?.data?.error || 'Failed to place order.');
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
        <div className="absolute top-0 right-0 w-64 h-64 bg-sky-600/10 rounded-full blur-3xl" />
        <div className="relative z-10 max-w-xl space-y-3">
          <span className="px-3 py-1 bg-sky-500/10 border border-sky-500/20 text-sky-400 rounded-full text-xs font-bold uppercase tracking-wider">
            Premium Studio Accessories
          </span>
          <h2 className="text-2xl sm:text-4xl font-black text-white tracking-tight leading-tight">
            O3 Car Spa Store
          </h2>
          <p className="text-sm text-slate-300">
            Professional grade detailing cloths, premium damping sheets, memory foam cushions, and car utilities designed to maintain and upgrade your ride.
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
                <select
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
                </select>
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
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
              {filteredProducts.map((product, idx) => (
                <div
                  key={idx}
                  className="bg-white rounded-2xl overflow-hidden border border-gray-100 shadow-sm hover:shadow-xl transition-all duration-300 flex flex-col group"
                >
                  {/* Product Image */}
                  <div className="relative aspect-video bg-gray-50 overflow-hidden">
                    <img
                      src={product.image || 'https://images.unsplash.com/photo-1607860108855-64acf2078ed9?w=500&q=80'}
                      alt={product.displayName}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
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
                        <div className="flex items-center gap-0.5 text-amber-500">
                          <Star size={12} fill="currentColor" />
                          <span className="text-xs font-bold text-gray-700">{product.rating}</span>
                        </div>
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
                          {product.mrp > product.price && (
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
            <div className="grid grid-cols-1 gap-4">
              {orders.map((order) => {
                let cartItems: any[] = [];
                if (order.items_json) {
                  try {
                    cartItems = typeof order.items_json === 'string' ? JSON.parse(order.items_json) : order.items_json;
                  } catch {
                    cartItems = [];
                  }
                }

                return (
                  <div
                    key={order.id}
                    className="bg-white rounded-2xl border border-gray-100 p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm hover:border-gray-200 transition-all"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-12 h-12 bg-blue-50 text-blue-600 rounded-xl flex items-center justify-center border border-blue-100 shrink-0 shadow-sm">
                        <ShoppingBag size={22} />
                      </div>
                      <div className="space-y-1.5 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <h4 className="font-extrabold text-gray-900 text-sm">
                            {cartItems.length > 1
                              ? `Cart Order (${cartItems.length} items)`
                              : cartItems.length === 1
                              ? cartItems[0].product_name
                              : order.product_name}
                          </h4>
                          <span
                            className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                              order.payment_status === 'completed'
                                ? 'bg-green-50 text-green-700 border border-green-200'
                                : order.payment_status === 'pending'
                                ? 'bg-amber-50 text-amber-700 border border-amber-200'
                                : 'bg-blue-50 text-blue-700 border border-blue-200'
                            }`}
                          >
                            {order.payment_status === 'completed'
                              ? 'Paid & Approved'
                              : order.payment_status === 'pending'
                              ? 'Pending Verification / Awaiting Approval'
                              : 'Failed'}
                          </span>
                        </div>

                        {/* Cart Items List */}
                        {cartItems.length > 0 ? (
                          <div className="bg-gray-50/80 p-3 rounded-xl border border-gray-100 space-y-1.5 text-xs text-gray-700">
                            {cartItems.map((item: any, idx: number) => (
                              <div key={idx} className="flex items-center justify-between gap-2">
                                <span className="font-semibold text-gray-800">• {item.product_name}</span>
                                <div className="flex items-center gap-2 text-[11px]">
                                  <span className="bg-gray-200/80 text-gray-700 font-bold px-1.5 py-0.5 rounded">x{item.quantity}</span>
                                  <span className="font-bold text-gray-900">₹{item.total_price || (item.unit_price * item.quantity)}</span>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="text-xs text-gray-500">
                            Qty: <strong>{parseInt(order.quantity)}</strong> &bull; Total: <strong>₹{order.total_amount}</strong>
                          </p>
                        )}

                        {order.shipping_address && (
                          <p className="text-[11px] text-blue-600 font-semibold flex items-center gap-1 pt-0.5">
                            <span>📍</span> {order.shipping_address}
                          </p>
                        )}

                        <p className="text-[10px] text-gray-400">
                          Ordered: {new Date(order.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })}
                        </p>
                      </div>
                    </div>

                    <div className="text-left md:text-right space-y-1 md:self-center shrink-0 border-t md:border-t-0 pt-3 md:pt-0 border-gray-100">
                      <div className="text-lg font-black text-gray-900">₹{order.total_amount}</div>
                      <p className="text-[11px] text-gray-500 font-medium">
                        Payment: <span className="uppercase font-bold text-gray-700">{order.payment_method}</span>
                      </p>
                      {order.payment_method === 'razorpay' && order.razorpay_payment_id && (
                        <p className="text-[10px] text-gray-400 font-mono">
                          Ref: {order.razorpay_payment_id}
                        </p>
                      )}
                      {order.payment_method === 'qr' && order.qr_transaction_id && (
                        <p className="text-[10px] text-gray-400 font-mono">
                          Ref: {order.qr_transaction_id}
                        </p>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* Product Detail & Checkout Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl overflow-hidden w-full max-w-4xl shadow-2xl flex flex-col md:flex-row max-h-[90vh]">
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
                      <img src={img} alt={`Thumb ${idx + 1}`} className="w-full h-full object-cover" />
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
                    <div className="flex items-center gap-2 mt-1">
                      <div className="flex items-center text-amber-500 gap-0.5">
                        <Star size={14} fill="currentColor" />
                        <span className="text-xs font-bold text-gray-700">{selectedProduct.rating}</span>
                      </div>
                      <span className="text-xs text-gray-400">({selectedProduct.reviewsCount} Reviews)</span>
                    </div>
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
                  <span className="text-sm text-gray-400 line-through">₹{selectedProduct.mrp}</span>
                  <span className="bg-blue-50 text-blue-600 text-xs font-extrabold px-2 py-0.5 rounded-md">
                    {selectedProduct.discount}
                  </span>
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
                    <label className="text-[10px] uppercase font-black text-gray-400 tracking-wider">Payment Method</label>
                    <div className="flex rounded-xl overflow-hidden border border-gray-200 h-10">
                      <button
                        onClick={() => setPaymentMode('razorpay')}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                          paymentMode === 'razorpay' ? 'bg-[#111] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <CreditCard size={14} />
                        Online
                      </button>
                      <button
                        onClick={() => setPaymentMode('qr')}
                        className={`flex-1 flex items-center justify-center gap-1 text-xs font-bold transition-all ${
                          paymentMode === 'qr' ? 'bg-[#111] text-white' : 'bg-gray-50 text-gray-600 hover:bg-gray-100'
                        }`}
                      >
                        <QrCode size={14} />
                        Scan QR
                      </button>
                    </div>
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
                  Confirm Purchase
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Payment Upload Modal */}
      {qrModalOpen && selectedProduct && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
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
              <img
                src="/qr.jpg"
                alt="UPI QR Code"
                className="w-48 h-48 rounded-xl object-cover shadow-md"
                onError={(e) => {
                  (e.target as HTMLImageElement).src = 'https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=upi://pay?pa=yourname@upi%26pn=GK%20AutoHerb%26am=' + (selectedProduct.dbPrice * quantity);
                }}
              />
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
        <div className="fixed bottom-6 right-6 z-40 animate-bounce">
          <button
            onClick={() => setProductsDrawerOpen(true)}
            className="flex items-center gap-2.5 px-5 py-3.5 bg-gradient-to-r from-emerald-600 to-teal-700 text-white font-black text-xs uppercase tracking-wider rounded-full shadow-2xl hover:scale-105 transition-all cursor-pointer"
          >
            <ShoppingBag size={18} />
            <span>Products Cart</span>
            <span className="w-5 h-5 rounded-full bg-white text-emerald-800 text-[11px] font-black flex items-center justify-center">
              {productsCart.length}
            </span>
          </button>
        </div>
      )}

      {/* Products Cart Drawer */}
      <ProductsCartDrawer
        isOpen={productsDrawerOpen}
        onClose={() => setProductsDrawerOpen(false)}
        onOrderSuccess={() => loadData()}
      />
    </div>
  );
}
