import { useState, useMemo, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { ShoppingBag, Trash2, Plus, Minus, MapPin, X, Wallet, CheckCircle2 } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import { useUIStore } from '../../store/uiStore';
import Button from '../ui/Button';
import api from '../../api/axiosInstance';

interface ProductsCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess?: () => void;
}

/**
 * Product checkout. For now every order is collected at the studio and paid there
 * (no home delivery, no online payment). The studio confirms the order in Admin → Product Orders.
 */
export default function ProductsCartDrawer({ isOpen, onClose, onOrderSuccess }: ProductsCartDrawerProps) {
  const toast = useUIStore((s) => s.toast);
  const { productsCart, updateProductQty, removeProductFromCart, clearProductsCart } = useCartStore();
  const [submitting, setSubmitting] = useState(false);
  const [placed, setPlaced] = useState<{ id: number; total: number } | null>(null);
  const [studio, setStudio] = useState<{ studio_name?: string; address?: string }>({});

  useEffect(() => {
    if (!isOpen) return;
    setPlaced(null);
    api.get('/settings/public').then(res => { if (res.data?.data) setStudio(res.data.data); }).catch(() => {});
  }, [isOpen]);

  const subtotal = useMemo(
    () => productsCart.reduce((sum, item) => sum + Number(item.selling_price || 0) * item.quantity, 0),
    [productsCart]
  );

  if (!isOpen) return null;
  const studioName = studio.studio_name || 'O3 Car Spaa';

  const placeOrder = async () => {
    if (!productsCart.length) { toast('error', 'Your cart is empty'); return; }
    setSubmitting(true);
    try {
      const res = await api.post('/products/order', {
        cart_items: productsCart.map(item => ({ product_id: item.id, quantity: item.quantity })),
        shipping_address: `Collect at studio (${studioName})`,
        payment_method: 'cash',
      });
      if (res.data.success) {
        setPlaced({ id: res.data.order_id, total: Number(res.data.total_amount) || subtotal });
        clearProductsCart();
        onOrderSuccess?.();
      } else {
        toast('error', res.data.error || 'Could not place the order');
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Could not place the order');
    } finally {
      setSubmitting(false);
    }
  };

  // rendered on <body> so it always sits above the bottom menu bar; bottom sheet on phones, side panel on desktop
  return createPortal(
    <div className="fixed inset-0 z-[120] bg-black/60 backdrop-blur-sm flex items-end sm:items-stretch sm:justify-end" onClick={onClose}>
      <div className="w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-none max-h-[88vh] sm:max-h-none sm:h-full flex flex-col shadow-2xl animate-slide-up sm:animate-slide-left" onClick={e => e.stopPropagation()}>
        <div className="px-4 py-3.5 border-b border-slate-100 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-[#2563EB]" />
            <h3 className="font-black text-lg text-slate-900">{placed ? 'Order placed' : `Your cart (${productsCart.length})`}</h3>
          </div>
          <button onClick={onClose} className="w-9 h-9 rounded-xl hover:bg-slate-100 flex items-center justify-center text-slate-500" aria-label="Close"><X size={20} /></button>
        </div>

        {placed ? (
          <div className="overflow-y-auto sm:flex-1 p-6 text-center space-y-3">
            <CheckCircle2 size={56} className="text-emerald-500 mx-auto" />
            <p className="text-lg font-black text-slate-900">Order #{placed.id} placed</p>
            <p className="text-sm text-slate-600">Collect it at <b>{studioName}</b> and pay <b>₹{placed.total.toLocaleString('en-IN')}</b> at the counter.</p>
            <p className="text-xs text-slate-500">You can see it under “My orders” on the Shop page. The studio will confirm it shortly.</p>
            <Button onClick={onClose} className="w-full mt-4">Done</Button>
          </div>
        ) : (
          <>
            <div className="overflow-y-auto sm:flex-1 p-4 space-y-4">
              {productsCart.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <ShoppingBag size={48} className="text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">Your cart is empty</p>
                  <p className="text-xs text-slate-400">Browse products and tap “Add to cart”.</p>
                </div>
              ) : (
                <>
                  <div className="space-y-2.5">
                    {productsCart.map((item) => (
                      <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                        <img src={item.image_url || '/illustrations/shop.webp'} alt="" className="w-12 h-12 rounded-lg object-contain bg-white" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-bold text-slate-900 truncate">{item.product_name}</p>
                          <p className="text-xs text-slate-500">₹{Number(item.selling_price).toLocaleString('en-IN')} each</p>
                        </div>
                        <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-lg p-1">
                          <button onClick={() => updateProductQty(item.id, item.quantity - 1)} className="p-1 text-slate-600 hover:bg-slate-100 rounded" aria-label="Less"><Minus size={13} /></button>
                          <span className="text-sm font-extrabold w-6 text-center">{item.quantity}</span>
                          <button onClick={() => updateProductQty(item.id, item.quantity + 1)} className="p-1 text-slate-600 hover:bg-slate-100 rounded" aria-label="More"><Plus size={13} /></button>
                        </div>
                        <button onClick={() => removeProductFromCart(item.id)} className="p-1 text-slate-400 hover:text-rose-600" aria-label="Remove"><Trash2 size={16} /></button>
                      </div>
                    ))}
                  </div>

                  <div className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-sm">
                    <div className="flex items-start gap-3 p-3">
                      <MapPin size={18} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div><p className="font-bold text-slate-900">Collect at the studio</p><p className="text-xs text-slate-500">{studioName}{studio.address ? `, ${studio.address}` : ''}</p></div>
                    </div>
                    <div className="flex items-start gap-3 p-3">
                      <Wallet size={18} className="text-[#2563EB] shrink-0 mt-0.5" />
                      <div><p className="font-bold text-slate-900">Pay at the studio</p><p className="text-xs text-slate-500">Cash or UPI when you collect your order</p></div>
                    </div>
                  </div>
                </>
              )}
            </div>

            {productsCart.length > 0 && (
              <div className="p-4 border-t border-slate-100 bg-white pb-[max(1rem,env(safe-area-inset-bottom))]">
                <div className="flex items-center justify-between mb-3">
                  <span className="text-sm text-slate-500">Total to pay at studio</span>
                  <span className="text-xl font-black text-slate-900">₹{subtotal.toLocaleString('en-IN')}</span>
                </div>
                <Button onClick={placeOrder} loading={submitting} className="w-full py-3 text-sm font-black">
                  Place order
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
}
