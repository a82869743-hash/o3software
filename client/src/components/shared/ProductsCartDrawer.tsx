import React, { useState, useMemo, useEffect } from 'react';
import { ShoppingBag, Trash2, Plus, Minus, MapPin, X, CreditCard, QrCode } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import { useUIStore } from '../../store/uiStore';
import Button from '../ui/Button';
import Input from '../ui/Input';
import api from '../../api/axiosInstance';

interface ProductsCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  onOrderSuccess?: () => void;
}

export default function ProductsCartDrawer({ isOpen, onClose, onOrderSuccess }: ProductsCartDrawerProps) {
  const toast = useUIStore((s) => s.toast);
  const { productsCart, updateProductQty, removeProductFromCart, clearProductsCart } = useCartStore();

  const [fulfillmentMethod, setFulfillmentMethod] = useState<'pickup' | 'delivery'>('pickup');
  const [shippingAddress, setShippingAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'qr' | 'cash'>('qr');
  const [qrTransactionId, setQrTransactionId] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [settings, setSettings] = useState<{
    studio_name: string;
    upi_id: string;
    upi_number: string;
    upi_name: string;
    upi_qr_url: string | null;
  }>({
    studio_name: 'O3 Car Spa',
    upi_id: '7225030303@paytm',
    upi_number: '7225030303',
    upi_name: 'O3 Car Spa',
    upi_qr_url: null,
  });

  useEffect(() => {
    if (isOpen) {
      api.get('/settings/public')
        .then(res => {
          if (res.data?.success && res.data?.data) {
            setSettings(res.data.data);
          }
        })
        .catch(() => {});
    }
  }, [isOpen]);

  const subtotal = useMemo(() => {
    return productsCart.reduce((sum, item) => sum + (item.selling_price as number) * item.quantity, 0);
  }, [productsCart]);

  if (!isOpen) return null;

  const handlePlaceCartOrder = async () => {
    if (productsCart.length === 0) {
      toast('error', 'Your products cart is empty');
      return;
    }
    
    const finalAddress = fulfillmentMethod === 'pickup'
      ? `Collect from Store (${settings.studio_name || 'O3 Car Spa Studio'})`
      : shippingAddress.trim();

    if (fulfillmentMethod === 'delivery' && !finalAddress) {
      toast('error', 'Please enter your home delivery address');
      return;
    }
    if (paymentMethod === 'qr' && (!qrTransactionId.trim() || qrTransactionId.trim().length < 6)) {
      toast('error', 'Please enter your valid 12-digit UPI UTR / Transaction Reference ID from GPay, PhonePe, or Paytm.');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        cart_items: productsCart.map((item) => ({
          product_id: item.id,
          quantity: item.quantity,
          unit_price: item.selling_price,
        })),
        shipping_address: finalAddress,
        payment_method: paymentMethod,
        qr_transaction_id: paymentMethod === 'qr' ? qrTransactionId.trim() : undefined,
      };

      const res = await api.post('/products/order', payload);
      if (res.data.success) {
        toast('success', 'Order placed successfully! Pending Admin Approval & Verification.');
        clearProductsCart();
        onClose();
        if (onOrderSuccess) onOrderSuccess();
      } else {
        toast('error', res.data.error || 'Order creation failed');
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Order error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-slide-left">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-slate-900 to-[#0F172A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-[#0284C7]" />
            <h3 className="font-black text-lg">Products Cart ({productsCart.length})</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-slate-300">
            <X size={20} />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {productsCart.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ShoppingBag size={48} className="text-slate-300 mx-auto" />
              <p className="font-bold text-slate-700">Your Products Cart is empty</p>
              <p className="text-xs text-slate-400">Browse store products and tap "Add to Cart"</p>
            </div>
          ) : (
            <>
              {/* Item List */}
              <div className="space-y-3">
                <h4 className="text-xs font-black uppercase text-slate-400">Cart Items</h4>
                {productsCart.map((item) => (
                  <div key={item.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-100">
                    {item.image_url ? (
                      <img src={item.image_url} alt={item.product_name} className="w-12 h-12 rounded-lg object-cover bg-white" />
                    ) : (
                      <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-400 font-bold text-xs">
                        No Img
                      </div>
                    )}

                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-bold text-slate-900 truncate">{item.product_name}</p>
                      <p className="text-[10px] text-slate-400">₹{item.selling_price} each</p>
                    </div>

                    {/* Qty Controls */}
                    <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                      <button
                        onClick={() => updateProductQty(item.id, item.quantity - 1)}
                        className="p-1 text-slate-600 hover:text-black hover:bg-slate-100 rounded"
                      >
                        <Minus size={12} />
                      </button>
                      <span className="text-xs font-extrabold w-5 text-center">{item.quantity}</span>
                      <button
                        onClick={() => updateProductQty(item.id, item.quantity + 1)}
                        className="p-1 text-slate-600 hover:text-black hover:bg-slate-100 rounded"
                      >
                        <Plus size={12} />
                      </button>
                    </div>

                    <button onClick={() => removeProductFromCart(item.id)} className="p-1 text-slate-400 hover:text-rose-600">
                      <Trash2 size={16} />
                    </button>
                  </div>
                ))}
              </div>

              {/* Order Fulfillment Option */}
              <div>
                <h4 className="text-xs font-black uppercase text-slate-400 mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-[#0284C7]" /> Fulfillment Option
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs mb-3">
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod('pickup')}
                    className={`p-3 rounded-xl border text-left font-bold transition-all flex items-center gap-2 ${
                      fulfillmentMethod === 'pickup' ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <span>🏬</span> Collect from Store
                  </button>
                  <button
                    type="button"
                    onClick={() => setFulfillmentMethod('delivery')}
                    className={`p-3 rounded-xl border text-left font-bold transition-all flex items-center gap-2 ${
                      fulfillmentMethod === 'delivery' ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    <span>🚚</span> Home Delivery
                  </button>
                </div>

                {fulfillmentMethod === 'delivery' ? (
                  <textarea
                    value={shippingAddress}
                    onChange={(e) => setShippingAddress(e.target.value)}
                    placeholder="Enter full street address, landmark, city & pincode"
                    rows={2}
                    className="w-full text-xs font-medium p-3 bg-slate-50 border border-slate-200 rounded-xl focus:ring-2 focus:ring-[#0284C7]"
                  />
                ) : (
                  <div className="p-3 bg-sky-50/70 rounded-xl border border-sky-100 text-xs text-sky-900 font-medium flex items-center gap-2">
                    <span>📍</span> Pick up your ordered products directly at <strong>{settings.studio_name || 'O3 Car Spa Studio'}</strong>.
                  </div>
                )}
              </div>

              {/* Payment Method */}
              <div>
                <h4 className="text-xs font-black uppercase text-slate-400 mb-2 flex items-center gap-1.5">
                  <CreditCard size={14} className="text-[#0284C7]" /> Payment Option
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('qr')}
                    className={`p-3 rounded-xl border text-left font-bold transition-all ${
                      paymentMethod === 'qr' ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    UPI QR Code
                  </button>
                  <button
                    type="button"
                    onClick={() => setPaymentMethod('cash')}
                    className={`p-3 rounded-xl border text-left font-bold transition-all ${
                      paymentMethod === 'cash' ? 'border-[#0284C7] bg-sky-50 text-[#0284C7]' : 'border-slate-200 bg-slate-50'
                    }`}
                  >
                    Pay at Store (Cash)
                  </button>
                </div>

                {paymentMethod === 'qr' && (
                  <div className="mt-3 bg-gradient-to-br from-sky-50 to-blue-50 border border-sky-200 rounded-2xl p-4 space-y-3">
                    <div className="text-center space-y-2">
                      <p className="text-xs font-black text-sky-900">Scan {settings.studio_name || 'O3 Car Spa'} QR Code to Pay</p>
                      <div className="w-44 h-44 mx-auto bg-white p-2 rounded-2xl border border-sky-200 shadow-md flex items-center justify-center">
                        {settings.upi_qr_url ? (
                          <img src={settings.upi_qr_url} alt="O3 Car Spa QR Code" className="w-full h-full object-contain rounded-lg" />
                        ) : (
                          <div className="flex flex-col items-center justify-center p-2 text-center">
                            <QrCode size={48} className="text-[#0284C7] mb-1" />
                            <p className="text-[10px] font-bold text-slate-800">{settings.upi_name || 'O3 Car Spa'}</p>
                            <p className="text-[10px] text-[#0284C7] font-mono">{settings.upi_id || '7225030303@paytm'}</p>
                          </div>
                        )}
                      </div>
                      <p className="text-[11px] font-bold text-slate-700 font-mono">
                        UPI ID: <span className="text-[#0284C7] bg-white px-2 py-0.5 rounded border border-sky-200">{settings.upi_id || '7225030303@paytm'}</span>
                      </p>
                      <p className="text-[10px] text-slate-500">
                        Scan with GPay, PhonePe, Paytm or any UPI app to pay <strong className="text-[#0284C7]">₹{subtotal}</strong>.
                      </p>
                    </div>

                    <div className="pt-2 border-t border-sky-200/60 space-y-1">
                      <Input
                        label="12-Digit UPI Transaction Ref / UTR *"
                        value={qrTransactionId}
                        onChange={(e) => setQrTransactionId(e.target.value)}
                        placeholder="e.g. 421589304812"
                      />
                      <p className="text-[10px] text-sky-800 font-semibold">
                        📌 After completing UPI payment, copy the 12-digit UTR Ref number from your app and paste it above for Admin verification.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Total Calculation */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-1.5 text-xs">
                <div className="flex justify-between text-slate-600">
                  <span>Cart Items Subtotal</span>
                  <span className="font-bold">₹{subtotal}</span>
                </div>
                <div className="flex justify-between text-slate-600">
                  <span>Shipping & Handling</span>
                  <span className="font-bold text-[#0284C7]">FREE</span>
                </div>
                <div className="pt-2 border-t border-slate-200 flex justify-between text-sm font-black text-slate-900">
                  <span>Total Amount</span>
                  <span className="text-[#0284C7]">₹{subtotal}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* CTA */}
        {productsCart.length > 0 && (
          <div className="p-4 border-t border-slate-100 bg-white">
            <Button
              onClick={handlePlaceCartOrder}
              loading={submitting}
              className="w-full bg-[#0284C7] hover:bg-[#0369A1] text-white py-3 text-sm font-black rounded-xl shadow-lg"
            >
              Place Products Order (₹{subtotal})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
