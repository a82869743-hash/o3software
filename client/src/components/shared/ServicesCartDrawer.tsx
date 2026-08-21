import React, { useState, useMemo } from 'react';
import { ShoppingBag, Trash2, Calendar, Clock, Car, MapPin, Sparkles, CheckCircle2, X } from 'lucide-react';
import { useCartStore } from '../../store/useCartStore';
import { useUIStore } from '../../store/uiStore';
import Button from '../ui/Button';
import { formatINR } from '../../utils/formatters';
import api from '../../api/axiosInstance';

interface ServicesCartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  userVehicles?: any[];
  isFirstWashEligible?: boolean;
  onBookingSuccess?: () => void;
}

export default function ServicesCartDrawer({
  isOpen,
  onClose,
  userVehicles = [],
  isFirstWashEligible = false,
  onBookingSuccess,
}: ServicesCartDrawerProps) {
  const toast = useUIStore((s) => s.toast);
  const { servicesCart, removeServiceFromCart, clearServicesCart } = useCartStore();

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(userVehicles[0]?.id?.toString() || '');
  const [selectedCategory, setSelectedCategory] = useState<string>('sedan');
  const [pickupOption, setPickupOption] = useState<'none' | 'pickup' | 'drop' | 'both'>('none');
  const [payAdvance, setPayAdvance] = useState<'none' | 'part' | 'full'>('none');
  const [selectedDate, setSelectedDate] = useState<string>(new Date().toISOString().split('T')[0]);
  const [selectedSlotId, setSelectedSlotId] = useState<number | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // Sync category when vehicle changes
  React.useEffect(() => {
    if (selectedVehicleId && userVehicles.length > 0) {
      const v = userVehicles.find((item) => item.id.toString() === selectedVehicleId.toString());
      if (v) {
        setSelectedCategory(v.category || 'sedan');
      }
    }
  }, [selectedVehicleId, userVehicles]);

  // Calculate pricing breakdown
  const catKey = `price_${selectedCategory || 'sedan'}`;

  const { washTotal, nonWashTotal, grossTotal } = useMemo(() => {
    let wash = 0;
    let nonWash = 0;
    servicesCart.forEach((svc: any) => {
      const p = parseFloat(String(svc[catKey] || svc.price_sedan || 0));
      if (svc.name && svc.name.toLowerCase().includes('wash')) {
        wash += p;
      } else {
        nonWash += p;
      }
    });
    return { washTotal: wash, nonWashTotal: nonWash, grossTotal: wash + nonWash };
  }, [servicesCart, catKey]);

  // 50% First Wash Promo on Wash Services only
  const firstWashDiscount = useMemo(() => {
    if (!isFirstWashEligible || washTotal <= 0) return 0;
    return Math.round(washTotal * 0.50);
  }, [isFirstWashEligible, washTotal]);

  const pickupFee = useMemo(() => {
    if (pickupOption === 'pickup') return 150;
    if (pickupOption === 'drop') return 150;
    if (pickupOption === 'both') return 250;
    return 0;
  }, [pickupOption]);

  const totalAfterFirstWash = grossTotal - firstWashDiscount;

  const advanceDiscount = useMemo(() => {
    if (payAdvance !== 'full') return 0;
    return Math.round(totalAfterFirstWash * 0.10);
  }, [payAdvance, totalAfterFirstWash]);

  const finalPayable = totalAfterFirstWash - advanceDiscount + pickupFee;

  if (!isOpen) return null;

  const handleSubmitCartBooking = async () => {
    if (servicesCart.length === 0) {
      toast('error', 'Your services cart is empty');
      return;
    }
    if (!selectedVehicleId && userVehicles.length > 0) {
      toast('error', 'Please select a vehicle');
      return;
    }

    setSubmitting(true);
    try {
      const payload = {
        service_id: servicesCart[0].id,
        all_service_ids: servicesCart.map((s) => s.id),
        cart_items: servicesCart.map((s) => ({
          id: s.id,
          name: s.name,
          category: s.category_name || 'Studio Service',
          price: parseFloat(String(s[catKey] || s.price_sedan || 0)),
          is_wash: s.name && s.name.toLowerCase().includes('wash'),
        })),
        vehicle_id: selectedVehicleId ? parseInt(selectedVehicleId) : null,
        vehicle_category: selectedCategory,
        slot_id: selectedSlotId || 1, // Fallback default slot
        pickup_type: pickupOption,
        pay_advance: payAdvance,
      };

      const res = await api.post('/bookings', payload);
      if (res.data.success) {
        toast('success', 'Multi-service cart booking submitted! Admin has been notified for approval.');
        clearServicesCart();
        onClose();
        if (onBookingSuccess) onBookingSuccess();
      } else {
        toast('error', res.data.error || 'Failed to submit cart booking');
      }
    } catch (err: any) {
      toast('error', err?.response?.data?.error || 'Booking error');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-black/60 backdrop-blur-sm flex justify-end">
      <div className="w-full max-w-md bg-white h-full flex flex-col shadow-2xl animate-slide-left">
        {/* Header */}
        <div className="p-4 bg-gradient-to-r from-gray-900 to-[#0F172A] text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag size={20} className="text-[#2563EB]" />
            <h3 className="font-black text-lg">Services Cart ({servicesCart.length})</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg hover:bg-white/10 text-gray-300">
            <X size={20} />
          </button>
        </div>

        {/* Cart Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-5">
          {servicesCart.length === 0 ? (
            <div className="text-center py-12 space-y-3">
              <ShoppingBag size={48} className="text-gray-300 mx-auto" />
              <p className="font-bold text-gray-700">Your Services Cart is empty</p>
              <p className="text-xs text-gray-400">Browse the service catalog and tap "Add to Cart"</p>
            </div>
          ) : (
            <>
              {/* Service Items List */}
              <div className="space-y-2">
                <h4 className="text-xs font-black uppercase text-gray-400">Selected Services</h4>
                {servicesCart.map((svc: any) => {
                  const p = parseFloat(String(svc[catKey] || svc.price_sedan || 0));
                  const isWash = svc.name && svc.name.toLowerCase().includes('wash');
                  return (
                    <div
                      key={svc.id}
                      className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100"
                    >
                      <div>
                        <p className="text-xs font-bold text-gray-900">{svc.name}</p>
                        <p className="text-[10px] text-gray-400">{svc.category_name || 'Service'}</p>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-extrabold text-gray-900">
                          {p > 0 ? (
                            isFirstWashEligible && isWash ? (
                              <span className="text-[#2563EB]">₹{Math.round(p * 0.50)} (50% OFF)</span>
                            ) : (
                              `₹${p}`
                            )
                          ) : (
                            'Ask Studio'
                          )}
                        </span>
                        <button
                          onClick={() => removeServiceFromCart(svc.id)}
                          className="p-1 text-gray-400 hover:text-blue-600 transition-colors"
                        >
                          <Trash2 size={16} />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>

              {/* Vehicle Selection */}
              {userVehicles.length > 0 && (
                <div>
                  <h4 className="text-xs font-black uppercase text-gray-400 mb-2 flex items-center gap-1.5">
                    <Car size={14} className="text-[#2563EB]" /> Select Vehicle
                  </h4>
                  <select
                    value={selectedVehicleId}
                    onChange={(e) => setSelectedVehicleId(e.target.value)}
                    className="w-full text-xs font-bold p-2.5 bg-gray-50 border border-gray-200 rounded-xl"
                  >
                    {userVehicles.map((v) => (
                      <option key={v.id} value={v.id}>
                        {v.brand} {v.model} ({v.registration_no || v.category})
                      </option>
                    ))}
                  </select>
                </div>
              )}

              {/* First Wash 50% Promo Alert */}
              {isFirstWashEligible && washTotal > 0 && (
                <div className="p-3 bg-gradient-to-r from-blue-600 to-amber-600 text-white rounded-xl text-xs space-y-1 shadow-sm">
                  <div className="flex items-center gap-1.5 font-black uppercase text-[10px]">
                    <Sparkles size={14} className="text-amber-200 animate-bounce" /> 50% OFF First Wash Active
                  </div>
                  <p className="font-bold">
                    You save <span className="underline">₹{firstWashDiscount}</span> on car washes in this cart!
                  </p>
                </div>
              )}

              {/* Pickup & Drop Option */}
              <div>
                <h4 className="text-xs font-black uppercase text-gray-400 mb-2 flex items-center gap-1.5">
                  <MapPin size={14} className="text-blue-500" /> Pickup & Drop Service
                </h4>
                <div className="grid grid-cols-2 gap-2 text-xs">
                  {[
                    { key: 'none', label: 'Self Visit (₹0)' },
                    { key: 'pickup', label: 'Pickup (+₹150)' },
                    { key: 'drop', label: 'Drop (+₹150)' },
                    { key: 'both', label: 'Both (+₹250)' },
                  ].map((opt) => (
                    <button
                      key={opt.key}
                      onClick={() => setPickupOption(opt.key as any)}
                      className={`p-2.5 rounded-xl border text-left font-bold transition-all ${
                        pickupOption === opt.key
                          ? 'border-blue-600 bg-blue-50 text-blue-900'
                          : 'border-gray-200 bg-gray-50 text-gray-600'
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Price Breakdown */}
              <div className="p-4 bg-gray-50 rounded-xl border border-gray-200 space-y-2 text-xs">
                <div className="flex justify-between text-gray-600">
                  <span>Gross Services Subtotal</span>
                  <span className="font-bold">₹{grossTotal}</span>
                </div>
                {firstWashDiscount > 0 && (
                  <div className="flex justify-between text-blue-600 font-bold">
                    <span>50% First Wash Promo</span>
                    <span>-₹{firstWashDiscount}</span>
                  </div>
                )}
                {pickupFee > 0 && (
                  <div className="flex justify-between text-blue-600 font-bold">
                    <span>Pickup/Drop Charge</span>
                    <span>+₹{pickupFee}</span>
                  </div>
                )}
                <div className="pt-2 border-t border-gray-200 flex justify-between text-sm font-black text-gray-900">
                  <span>Final Total</span>
                  <span className="text-[#2563EB]">₹{finalPayable}</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Footer CTA */}
        {servicesCart.length > 0 && (
          <div className="p-4 border-t border-gray-100 bg-white space-y-2">
            <Button
              onClick={handleSubmitCartBooking}
              loading={submitting}
              className="w-full bg-[#2563EB] hover:bg-[#1D4ED8] text-white py-3 text-sm font-black rounded-xl shadow-lg"
            >
              Submit Services Cart Booking (₹{finalPayable})
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
