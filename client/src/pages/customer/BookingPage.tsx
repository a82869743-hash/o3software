import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, Car, Sparkles, Loader2, ArrowLeft, CreditCard, QrCode, Gift } from 'lucide-react';
import { useSlots } from '../../api/hooks/useSlots';
import { useCreateBooking } from '../../api/hooks/useBookings';
import Button from '../../components/ui/Button';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import SearchableSelect from '../../components/ui/SearchableSelect';
import { useUIStore } from '../../store/uiStore';
import { formatTime } from '../../utils/formatters';
import { useBrands, useModels } from '../../api/hooks/useVehicles';
import { getCategoryForModel } from '../../utils/carData';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import QrPaymentModal from '../../components/shared/QrPaymentModal';
import Modal from '../../components/ui/Modal';

const STEPS = ['Service & Vehicle', 'Date', 'Time', 'Confirm'];

// ─── Service Priority Sorting ─────────────────
// Hot services appear first: washes, PPF, coating, polish, ceramic, then the rest
const HOT_KEYWORDS = ['wash', 'premium wash', 'basic wash', 'ppf', 'coating', 'ceramic', 'polish', 'wax', 'paint protection', 'interior clean', 'detailing'];

function getServicePriority(name: string): number {
  const lower = name.toLowerCase();
  for (let i = 0; i < HOT_KEYWORDS.length; i++) {
    if (lower.includes(HOT_KEYWORDS[i])) return i;
  }
  return HOT_KEYWORDS.length + 1; // Non-hot services go last
}

function sortServicesByPriority(services: any[]): any[] {
  return [...services].sort((a, b) => getServicePriority(a.name) - getServicePriority(b.name));
}

export default function BookingPage() {
  const toast = useUIStore((s) => s.toast);
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const createMut = useCreateBooking();

  const [step, setStep] = useState(0);
  const [filter, setFilter] = useState('sedan');
  const [loyalty, setLoyalty] = useState<{ credits: number; free_washes: number; wax_count: number }>({ credits: 0, free_washes: 0, wax_count: 0 });
  const [useFreeWash, setUseFreeWash] = useState(false);
  const [isFirstWashEligible, setIsFirstWashEligible] = useState(false);

  // QR Payment states
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [activeBookingId, setActiveBookingId] = useState<number | undefined>(undefined);
  const [choiceBookingData, setChoiceBookingData] = useState<any | null>(null);

  // Detect if this is a package-booking flow
  const isPackageBooking = searchParams.get('from_package') === '1';

  // Step 1: Service/Package
  const [services, setServices] = useState<any[]>([]);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedServices, setSelectedServices] = useState<number[]>([]);
  const [selectedPackageServiceNames, setSelectedPackageServiceNames] = useState<string[]>([]);
  const [selectedPackage, setSelectedPackage] = useState<number | null>(null);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [activePackages, setActivePackages] = useState<any[]>([]);

  // Step 2: Vehicle
  const [userVehicles, setUserVehicles] = useState<any[]>([]);
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(null);
  const [manualEntry, setManualEntry] = useState(false);

  // Step 2: Vehicle
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [regNo, setRegNo] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');

  // Step 3: Date
  const [selectedDate, setSelectedDate] = useState('');
  const [calMonth, setCalMonth] = useState(new Date());

  // Step 4: Time
  const { data: slotsData, isLoading: slotsLoading } = useSlots({ date: selectedDate || undefined });

  // Step 5: Confirm
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [submittingOnline, setSubmittingOnline] = useState(false);
  const [payAdvance, setPayAdvance] = useState<'full' | 'part' | 'none'>('full');

  // Pickup options
  const [pickupOption, setPickupOption] = useState<'none' | 'pickup' | 'drop' | 'both'>('none');
  const [pickupAddress, setPickupAddress] = useState('');
  const [pickupTime, setPickupTime] = useState('');
  const [savedAddresses, setSavedAddresses] = useState<any[]>([]);
  const [selectedAddressId, setSelectedAddressId] = useState<number | 'new'>('new');
  const [landmark, setLandmark] = useState('');
  const [city, setCity] = useState('');
  const [stateName, setStateName] = useState('Gujarat');
  const [pincode, setPincode] = useState('');

  // Autocomplete data
  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(brand);

  // Load services, packages, vehicles
  useEffect(() => {
    (async () => {
      try {
        const initialVehicleId = new URLSearchParams(window.location.search).get('vehicle_id');
        const activePkgUrl = initialVehicleId ? `/user-packages/active?vehicle_id=${initialVehicleId}` : '/user-packages/active';
        const [svcRes, pkgRes, myVehiclesRes, activePkgRes, settingsRes, dashboardRes, lastAddressRes, addressesRes, fwRes] = await Promise.all([
          api.get('/services').catch(() => ({ data: { data: [] } })),
          api.get('/packages').catch(() => ({ data: { data: [] } })),
          api.get('/vehicles/my-vehicles').catch(() => ({ data: { data: [] } })),
          api.get(activePkgUrl).catch(() => ({ data: { data: [] } })),
          api.get('/settings').catch(() => ({ data: { data: {} } })),
          api.get('/dashboard').catch(() => ({ data: {} })),
          api.get('/pickup-requests/last-address').catch(() => ({ data: { address: '' } })),
          api.get('/pickup-requests/addresses').catch(() => ({ data: { success: false, data: [] } })),
          api.get('/bookings/first-wash-eligibility').catch(() => ({ data: { is_eligible: false } })),
        ]);
        setServices(sortServicesByPriority(svcRes.data.data || []));
        setPackages(pkgRes.data.data || []);
        
        const fetchedVehicles = myVehiclesRes.data.data || [];
        setUserVehicles(fetchedVehicles);
        
        if (fetchedVehicles.length > 0) {
          const primary = initialVehicleId
            ? (fetchedVehicles.find((v: any) => v.id.toString() === initialVehicleId) || fetchedVehicles.find((v: any) => v.is_primary) || fetchedVehicles[0])
            : (fetchedVehicles.find((v: any) => v.is_primary) || fetchedVehicles[0]);
          setSelectedVehicleId(primary.id);
          setBrand(primary.brand);
          setModel(primary.model);
          setRegNo(primary.registration_no || '');
          setFilter(primary.category || getCategoryForModel(primary.brand, primary.model));
        } else {
          setManualEntry(true);
          setFilter('sedan');
        }

        const actPkg = activePkgRes.data.data;
        setActivePackages(actPkg ? [actPkg] : []);

        if (settingsRes.data.success) {
          setSettings(settingsRes.data.data || {});
        }

        const loyaltyData = dashboardRes?.data?.data?.loyalty || { credits: 0, free_washes: 0, wax_count: 0 };
        setLoyalty(loyaltyData);
        
        const isEligibleFromDash = dashboardRes?.data?.data?.first_wash_eligible;
        const isEligibleFromDirect = fwRes?.data?.is_eligible;
        const finalEligibility = isEligibleFromDirect !== undefined ? isEligibleFromDirect : (isEligibleFromDash ?? false);
        setIsFirstWashEligible(finalEligibility);

        if (searchParams.get('free_wash') === 'true' && loyaltyData.free_washes > 0) {
          setUseFreeWash(true);
        }

        const addrRes = addressesRes || { data: { success: false, data: [] } };
        if (addrRes?.data?.success && addrRes?.data?.data) {
          const addrs = addressesRes.data.data;
          setSavedAddresses(addrs);
          if (addrs.length > 0) {
            const defAddr = addrs.find((a: any) => a.is_default) || addrs[0];
            setSelectedAddressId(defAddr.id);
            setPickupAddress(defAddr.address);
            setLandmark(defAddr.landmark || '');
            setCity(defAddr.city || '');
            setStateName(defAddr.state || 'Gujarat');
            setPincode(defAddr.pincode || '');
          } else if (lastAddressRes.data?.success && lastAddressRes.data?.address) {
            setPickupAddress(lastAddressRes.data.address);
          }
        } else if (lastAddressRes.data?.success && lastAddressRes.data?.address) {
          setPickupAddress(lastAddressRes.data.address);
        }
      } catch {} finally { setServicesLoading(false); }
    })();
  }, []);

  // Handle URL params: service_id, package_id, from_package
  useEffect(() => {
    const sid = searchParams.get('service_id');
    const pid = searchParams.get('package_id');
    if (sid && !isPackageBooking) setSelectedServices([parseInt(sid)]);
    if (pid) setSelectedPackage(parseInt(pid));
    // If coming from "Book from Package" flow, auto-select active package
    if (isPackageBooking && activePackages.length > 0) {
      setSelectedPackage(activePackages[0].package_id);
      setSelectedServices([]);
      setSelectedPackageServiceNames([]);
    }
  }, [searchParams, activePackages, isPackageBooking]);

  useEffect(() => {
    if (!selectedVehicleId) return;
    (async () => {
      try {
        const res = await api.get(`/user-packages/active?vehicle_id=${selectedVehicleId}`);
        const actPkg = res.data.data;
        setActivePackages(actPkg ? [actPkg] : []);
      } catch {}
    })();
  }, [selectedVehicleId]);

  const canNext = useMemo(() => {
    switch (step) {
      case 0: {
        const brandValid = brand === 'Others' ? customBrand.trim().length > 0 : brand.trim().length > 0;
        const modelValid = (brand === 'Others' || model === 'Other') ? customModel.trim().length > 0 : model.trim().length > 0;
        const servicesValid = isPackageBooking ? selectedPackageServiceNames.length > 0 : selectedServices.length > 0;
        return servicesValid && brandValid && modelValid;
      }
      case 1: return selectedDate.length > 0;
      case 2: return selectedSlot !== null;
      default: return true;
    }
  }, [step, selectedServices, selectedPackage, selectedPackageServiceNames, isPackageBooking, brand, model, customBrand, customModel, selectedDate, selectedSlot]);

  const selectedServicesObjs = services.filter((s) => selectedServices.includes(s.id));
  const selectedPackageObj = activePackages.find((p) => p.package_id === selectedPackage) || packages.find((p) => p.id === selectedPackage);

  // ─── Calendar helpers ───────────────────
  // Format date as YYYY-MM-DD using LOCAL time (avoids UTC timezone shift)
  const formatLocalDate = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const todayStr = formatLocalDate(today);

  const calDays = useMemo(() => {
    const y = calMonth.getFullYear();
    const m = calMonth.getMonth();
    const firstDay = new Date(y, m, 1).getDay();
    const daysInMonth = new Date(y, m + 1, 0).getDate();
    const days: (Date | null)[] = [];
    for (let i = 0; i < (firstDay === 0 ? 6 : firstDay - 1); i++) days.push(null);
    for (let i = 1; i <= daysInMonth; i++) days.push(new Date(y, m, i));
    return days;
  }, [calMonth]);

  const totalBookingDuration = useMemo(() => {
    if (isPackageBooking) {
      let sum = 0;
      for (const name of selectedPackageServiceNames) {
        const matched = services.find((s) => {
          const sName = s.name.toLowerCase();
          const uName = name.toLowerCase();
          if (sName === uName) return true;
          if ((uName === 'foam wash' || uName === 'car foam wash' || uName === 'full foam wash') && (sName.includes('foam wash') || sName.includes('car wash'))) return true;
          if ((uName === 'wax coat' || uName === 'body wax coat') && (sName.includes('teflon') || sName.includes('wax') || sName.includes('ceramic'))) return true;
          if (uName === 'deep cleaning' && sName.includes('interior cleaning')) return true;
          if (uName === 'two wheeler wash' && sName.includes('bike wash')) return true;
          if (uName.includes('two wheeler') && sName.includes('two wheeler')) return true;
          return false;
        });
        if (matched) sum += Number(matched.duration_minutes) || 0;
      }
      return sum;
    } else {
      return selectedServicesObjs.reduce((sum, s) => sum + (Number(s.duration_minutes) || 0), 0);
    }
  }, [isPackageBooking, selectedPackageServiceNames, selectedServicesObjs, services]);

  const washServicesTotal = useMemo(() => {
    if (isPackageBooking) return 0;
    const cat = filter !== 'all' ? filter : 'sedan';
    return selectedServicesObjs.reduce((sum, s) => {
      if (!s.name || !s.name.toLowerCase().includes('wash')) return sum;
      const priceKey = `price_${cat}`;
      return sum + (Number(s[priceKey]) || Number(s.price_sedan) || 0);
    }, 0);
  }, [isPackageBooking, filter, selectedServicesObjs]);

  const estimatedTotal = useMemo(() => {
    if (isPackageBooking) return 0;
    const cat = filter !== 'all' ? filter : 'sedan';
    return selectedServicesObjs.reduce((sum, s) => {
      const priceKey = `price_${cat}`;
      return sum + (Number(s[priceKey]) || Number(s.price_sedan) || 0);
    }, 0);
  }, [isPackageBooking, filter, selectedServicesObjs]);

  const activePackageHasFreePickup = useMemo(() => {
    return activePackages.length > 0 && activePackages[0].pickup_enabled === 1;
  }, [activePackages]);

  const pickupCharge = useMemo(() => {
    if (pickupOption === 'none') return 0;
    if (activePackageHasFreePickup) return 0;
    if (pickupOption === 'pickup') return parseFloat(settings.pickup_charge || '150');
    if (pickupOption === 'drop') return parseFloat(settings.drop_charge || '150');
    if (pickupOption === 'both') return parseFloat(settings.pickup_drop_charge || '250');
    return 0;
  }, [pickupOption, activePackageHasFreePickup, settings]);

  const firstWashDiscountAmount = useMemo(() => {
    if (isPackageBooking || !isFirstWashEligible || washServicesTotal <= 0) return 0;
    return Math.round(washServicesTotal * 0.50);
  }, [isPackageBooking, isFirstWashEligible, washServicesTotal]);

  const totalAfterFirstWashDiscount = useMemo(() => {
    return Math.max(0, estimatedTotal - firstWashDiscountAmount);
  }, [estimatedTotal, firstWashDiscountAmount]);

  const discountAmount = useMemo(() => {
    if (isPackageBooking || useFreeWash || payAdvance !== 'full') return 0;
    return Math.round(totalAfterFirstWashDiscount * 0.10);
  }, [isPackageBooking, useFreeWash, payAdvance, totalAfterFirstWashDiscount]);

  const finalTotal = useMemo(() => {
    return totalAfterFirstWashDiscount - discountAmount + pickupCharge;
  }, [totalAfterFirstWashDiscount, discountAmount, pickupCharge]);

  const requiredAdvancePossible = useMemo(() => {
    if (isPackageBooking || useFreeWash) return 0;
    return totalAfterFirstWashDiscount + pickupCharge;
  }, [isPackageBooking, totalAfterFirstWashDiscount, useFreeWash, pickupCharge]);

  const requiredAdvance = useMemo(() => {
    if (payAdvance === 'full') return finalTotal;
    if (payAdvance === 'part') return Math.min(200, finalTotal);
    return 0;
  }, [payAdvance, finalTotal]);


  const loadRazorpayScript = () => {
    return new Promise<boolean>((resolve) => {
      if ((window as any).Razorpay) return resolve(true);
      const script = document.createElement('script');
      script.src = 'https://checkout.razorpay.com/v1/checkout.js';
      script.onload = () => resolve(true);
      script.onerror = () => resolve(false);
      document.body.appendChild(script);
    });
  };

  const handlePayOnline = async (bookingId: number, advanceAmt: number, fullBookingResponse: any) => {
    setSubmittingOnline(true);
    try {
      const sdkLoaded = await loadRazorpayScript();
      if (!sdkLoaded) {
        toast('error', 'Razorpay SDK failed to load. Are you online?');
        setSubmittingOnline(false);
        return;
      }

      const resOrder = await api.post('/payments/razorpay/order', {
        amount: advanceAmt,
        booking_id: bookingId
      });

      if (!resOrder.data.success) {
        throw new Error(resOrder.data.error || 'Failed to create payment order');
      }

      const orderData = resOrder.data.data;

      const options = {
        key: import.meta.env.VITE_RAZORPAY_KEY_ID || 'rzp_test_123',
        amount: orderData.amount,
        currency: orderData.currency,
        name: 'O3 Car Spa',
        description: `Booking Advance Payment (Booking #${bookingId})`,
        order_id: orderData.id,
        prefill: {
          name: useAuthStore.getState().user?.name || '',
          email: useAuthStore.getState().user?.email || '',
          contact: useAuthStore.getState().user?.mobile || ''
        },
        handler: async function (response: any) {
          try {
            const resVerify = await api.post('/payments/razorpay/verify', {
              razorpay_order_id: response.razorpay_order_id,
              razorpay_payment_id: response.razorpay_payment_id,
              razorpay_signature: response.razorpay_signature
            });

            if (resVerify.data.success) {
              toast('success', 'Payment successful! Your booking is registered.');
              setBookingResult(fullBookingResponse);
              setChoiceBookingData(null);
            } else {
              throw new Error('Payment verification failed');
            }
          } catch (err: any) {
            toast('error', err.response?.data?.error || 'Payment verification failed. Please contact support.');
          }
        },
        modal: {
          ondismiss: function () {
            toast('warning', 'Payment cancelled. Your booking slot is reserved for 10 minutes. You can pay from bookings list.');
          }
        },
        theme: { color: '#2563EB' }
      };

      if (orderData.id.startsWith('order_mock_')) {
        const confirmSimulate = window.confirm(
          "RAZORPAY SANDBOX MODE (Keys Missing)\n\nWould you like to simulate a successful online payment?"
        );
        if (confirmSimulate) {
          await options.handler({
            razorpay_order_id: orderData.id,
            razorpay_payment_id: 'pay_mock_' + Date.now(),
            razorpay_signature: 'sig_mock_' + Date.now()
          });
        } else {
          options.modal.ondismiss();
        }
        return;
      }

      const rzp = new (window as any).Razorpay(options);
      rzp.open();
    } catch (err: any) {
      console.error('RAZORPAY ERROR:', err);
      toast('error', err.message || 'An error occurred during Razorpay checkout.');
    } finally {
      setSubmittingOnline(false);
    }
  };

  const handleBook = async () => {
    try {
      setSubmittingOnline(true);
      const res = await createMut.mutateAsync({
        slot_id: selectedSlot.id,
        service_ids: !isPackageBooking && selectedServices.length > 0 ? selectedServices : undefined,
        package_service_name: isPackageBooking && selectedPackageServiceNames.length > 0 ? selectedPackageServiceNames.join(',') : undefined,
        package_id: selectedPackage || undefined,
        vehicle_id: selectedVehicleId || undefined,
        vehicle_brand: brand === 'Others' ? customBrand : brand,
        vehicle_model: (brand === 'Others' || model === 'Other') ? customModel : model,
        vehicle_reg_no: regNo || undefined,
        vehicle_category: filter !== 'all' ? filter : undefined,
        use_package: isPackageBooking ? true : undefined,
        is_free_wash: useFreeWash || undefined,
        pay_advance: !isPackageBooking && !useFreeWash ? payAdvance : undefined,
        pickup_type: pickupOption,
        pickup_address_details: pickupOption !== 'none' ? {
          address: pickupAddress,
          landmark,
          city,
          state: stateName,
          pincode
        } : undefined
      });

      const bookingData = res.data;

      if (bookingData && bookingData.id && (pickupOption === 'pickup' || pickupOption === 'both')) {
        await api.post('/pickup-requests', {
          booking_id: bookingData.id,
          address: `${pickupAddress}${landmark ? ', Landmark: ' + landmark : ''}, ${city}, ${stateName} - ${pincode}`,
          scheduled_time: pickupTime || undefined,
          request_type: pickupOption
        });
      }

      if (bookingData && bookingData.status === 'pending_payment' && bookingData.advance_amount > 0) {
        setChoiceBookingData({ bookingData, fullRes: res });
      } else {
        setBookingResult(res);
      }
    } catch (err: any) {
      console.error('BOOKING ERROR:', err);
      toast('error', err?.response?.data?.error || 'Booking failed');
    } finally {
      setSubmittingOnline(false);
    }
  };

  // ─── Success screen ─────────────────────
  if (bookingResult) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <div className="w-20 h-20 rounded-full bg-green-100 flex items-center justify-center mb-6">
          <Check size={36} className="text-green-600" />
        </div>
        <h2 className="text-2xl font-extrabold text-[#0F172A] mb-2">Booking Requested!</h2>
        <p className="text-sm text-[#5f5e5e] mb-1">Your appointment request has been submitted for approval.</p>
        {isPackageBooking && (
          <p className="text-xs text-purple-600 font-semibold mb-1">📦 Package credit will be deducted once admin approves your booking.</p>
        )}
        <p className="text-xs text-[#5f5e5e] mb-6">Reference: <span className="font-bold">#{bookingResult.data?.id}</span></p>
        <div className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#5f5e5e]">Service(s)</span>
            <span className="font-bold text-right ml-4">
              {isPackageBooking ? selectedPackageServiceNames.join(', ') : selectedServicesObjs.length > 0 ? selectedServicesObjs.map(s => s.name).join(', ') : (selectedPackageObj?.package_name || selectedPackageObj?.name)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#5f5e5e]">Date</span>
            <span className="font-bold">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#5f5e5e]">Time</span>
            <span className="font-bold">{formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#5f5e5e]">Vehicle</span>
            <span className="font-bold">{brand} {model}</span>
          </div>
        </div>
        <div className="flex gap-3 mt-6">
          <Button variant="ghost" onClick={() => navigate('/customer/bookings')}>
            View Bookings
          </Button>
          <Button onClick={() => { setBookingResult(null); setStep(0); setSelectedServices([]); setSelectedPackageServiceNames([]); setSelectedPackage(null); setSelectedSlot(null); setSelectedDate(''); }}>
            Book Another
          </Button>
        </div>
      </div>
    );
  }

  if (settings.bookings_paused === '1') {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center max-w-md mx-auto">
        <div className="w-20 h-20 rounded-full bg-blue-50 flex items-center justify-center mb-6 border border-blue-100">
          <Calendar className="w-10 h-10 text-[#2563EB]" />
        </div>
        <h2 className="text-2xl font-extrabold text-gray-900 mb-3">Bookings Paused</h2>
        <p className="text-gray-600 text-sm mb-6 leading-relaxed">
          We are temporarily not accepting new online bookings. Please check back later or contact the studio directly for urgent assistance.
        </p>
        <button
          onClick={() => navigate('/customer/bookings')}
          className="w-full bg-[#0F172A] text-white py-3 px-4 rounded-xl font-bold uppercase tracking-wider text-xs hover:bg-black transition-colors"
        >
          View My Bookings
        </button>
      </div>
    );
  }

  return (
    <div className="pt-4 max-w-2xl mx-auto">
      {/* Back to bookings */}
      <button
        onClick={() => {
          if (step > 0 && !window.confirm('You have unsaved booking progress. Leave this page?')) return;
          navigate('/customer/bookings');
        }}
        className="flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={14} /> Back to My Bookings
      </button>

      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-extrabold transition-colors ${
              i < step ? 'bg-[#2563EB] text-white' : i === step ? 'bg-[#2563EB] text-white ring-4 ring-blue-100' : 'bg-[#f6f3f2] text-[#5f5e5e]'
            }`}>
              {i < step ? <Check size={14} /> : i + 1}
            </div>
            {i < STEPS.length - 1 && (
              <div className={`hidden sm:block w-12 md:w-20 h-0.5 mx-1 ${i < step ? 'bg-[#2563EB]' : 'bg-gray-200'}`} />
            )}
          </div>
        ))}
      </div>

      <h3 className="text-lg font-extrabold text-[#0F172A] uppercase tracking-wide mb-6">{isPackageBooking ? 'Package Services' : STEPS[step]}</h3>

      {/* ═══ Step 0: Select Service ═══ */}
      {step === 0 && (
        <div>
          {/* Vehicle Selector */}
          <div className="bg-white rounded-lg p-4 shadow-sm border border-gray-100 mb-6 space-y-4 text-left">
            {userVehicles.length > 0 && !manualEntry ? (
              <div>
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-2">Select Your Vehicle</p>
                <select
                  value={selectedVehicleId || ''}
                  onChange={(e) => {
                    const vid = parseInt(e.target.value);
                    const v = userVehicles.find((veh: any) => veh.id === vid);
                    if (v) {
                      setSelectedVehicleId(v.id);
                      setBrand(v.brand);
                      setModel(v.model);
                      setRegNo(v.registration_no || '');
                      if (v.category) {
                        setFilter(v.category);
                      } else {
                        setFilter(getCategoryForModel(v.brand, v.model));
                      }
                    }
                  }}
                  className="w-full px-4 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-[#0F172A] font-bold focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 cursor-pointer text-sm"
                >
                  {userVehicles.map((v: any) => (
                    <option key={v.id} value={v.id}>
                      🚗 {v.brand} {v.model} {v.registration_no ? `(${v.registration_no})` : ''} {v.is_primary ? '★ Primary' : ''}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={() => { setManualEntry(true); setSelectedVehicleId(null); setBrand(''); setModel(''); setRegNo(''); setFilter('hatchback'); }}
                  className="mt-2 text-xs font-bold text-[#2563EB] hover:underline"
                >
                  + Enter vehicle details manually
                </button>
              </div>
            ) : (
              <div className="space-y-3">
                {userVehicles.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      setManualEntry(false);
                      const primary = userVehicles.find((v: any) => v.is_primary) || userVehicles[0];
                      setSelectedVehicleId(primary.id);
                      setBrand(primary.brand);
                      setModel(primary.model);
                      setRegNo(primary.registration_no || '');
                      if (primary.category) {
                        setFilter(primary.category);
                      } else {
                        setFilter(getCategoryForModel(primary.brand, primary.model));
                      }
                    }}
                    className="text-xs font-bold text-[#2563EB] hover:underline mb-2"
                  >
                    ← Back to saved vehicles
                  </button>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left">
                  <SearchableSelect
                    label="Car Brand *"
                    options={[
                      ...(brandsRes?.data || []).map((b: string) => ({ value: b, label: b })),
                      { value: 'Others', label: 'Others (Enter Manually)' }
                    ]}
                    value={brand}
                    onChange={(e) => {
                      setBrand(e.target.value);
                      setModel('');
                      setCustomBrand('');
                      setCustomModel('');
                    }}
                    placeholder="Select Brand"
                  />
                  <SearchableSelect
                    label="Car Model *"
                    options={[
                      ...(modelsRes?.data || []).map((m: string) => ({ value: m, label: m })),
                      { value: 'Other', label: 'Other (Enter Manually)' }
                    ]}
                    value={model}
                    onChange={(e) => {
                      setModel(e.target.value);
                      setCustomModel('');
                    }}
                    placeholder={brand ? "Select Model" : "Select brand first"}
                    disabled={!brand || brand === 'Others'}
                  />
                </div>
                {(brand === 'Others' || model === 'Other') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mt-2">
                    {brand === 'Others' && (
                      <div>
                        <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">Enter Brand Name *</label>
                        <input
                          type="text"
                          value={customBrand}
                          onChange={(e) => setCustomBrand(e.target.value)}
                          placeholder="e.g. Porsche"
                          className="w-full px-4 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 text-sm"
                          required
                        />
                      </div>
                    )}
                    {(brand === 'Others' || model === 'Other') && (
                      <div>
                        <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">Enter Model Name *</label>
                        <input
                          type="text"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="e.g. Cayenne"
                          className="w-full px-4 py-3 bg-[#f6f3f2] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 text-sm"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Registration No (Optional)" placeholder="e.g. GJ01AB1234" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} />
                  <div>
                    <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">Vehicle Category *</label>
                    <select
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-[#f6f3f2] border border-transparent rounded-lg text-sm font-bold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 cursor-pointer"
                    >
                      <option value="hatchback">Hatchback</option>
                      <option value="medium_hatchback">Medium Hatchback</option>
                      <option value="sedan">Sedan</option>
                      <option value="premium_sedan">Premium Sedan</option>
                      <option value="suv">SUV</option>
                    </select>
                  </div>
                </div>
              </div>
            )}
          </div>

          {isPackageBooking ? (
            /* ── PACKAGE BOOKING FLOW ── */
            <div>
              {activePackages.length > 0 ? (
                <div>
                  {/* Package info header */}
                  <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 mb-5">
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-purple-200 flex items-center justify-center">
                        <Sparkles size={20} className="text-purple-700" />
                      </div>
                      <div>
                        <p className="text-[10px] font-bold uppercase tracking-widest text-purple-500">Booking from Package</p>
                        <p className="text-base font-extrabold text-purple-800">{activePackages[0].package_name}</p>
                      </div>
                      <span className="ml-auto text-[10px] font-bold px-2.5 py-1 bg-green-100 text-green-700 rounded-lg uppercase tracking-wider border border-green-200">Active</span>
                    </div>
                    <p className="text-xs text-purple-600 ml-[52px]">Select a service from your package credits below. Usage will be deducted upon admin approval.</p>
                  </div>

                  {/* Package services with remaining counts */}
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-3">Available Package Services</p>
                  <div className="grid gap-3">
                    {(() => {
                      const packageUsage = activePackages[0]?.usage || [];
                      const availableServices = packageUsage.filter((u: any) => u.remaining > 0);

                      if (availableServices.length === 0) {
                        return (
                          <div className="text-center py-8 bg-white rounded-lg border border-gray-100">
                            <Sparkles size={32} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-[#5f5e5e] font-medium">All package credits have been used</p>
                            <p className="text-xs text-gray-400 mt-1">Please purchase a new package or book a regular service</p>
                          </div>
                        );
                      }

                      return availableServices.map((usage: any) => {
                        // Find matching service from services list by name
                        const matchedService = services.find((s) => {
                          const sName = s.name.toLowerCase();
                          const uName = usage.service_name.toLowerCase();
                          if (sName === uName) return true;
                          if ((uName === 'foam wash' || uName === 'car foam wash' || uName === 'full foam wash') && (sName.includes('foam wash') || sName.includes('car wash'))) return true;
                          if ((uName === 'wax coat' || uName === 'body wax coat') && (sName.includes('teflon') || sName.includes('wax') || sName.includes('ceramic'))) return true;
                          if (uName === 'deep cleaning' && sName.includes('interior cleaning')) return true;
                          if (uName === 'two wheeler wash' && sName.includes('bike wash')) return true;
                          if (uName.includes('two wheeler') && sName.includes('two wheeler')) return true;
                          return false;
                        });
                        const isSelected = selectedPackageServiceNames.includes(usage.service_name);

                        return (
                          <button
                            key={usage.service_name}
                            onClick={() => {
                              setSelectedPackageServiceNames(prev => 
                                prev.includes(usage.service_name)
                                  ? prev.filter(n => n !== usage.service_name)
                                  : [...prev, usage.service_name]
                              );
                              setSelectedPackage(activePackages[0].package_id);
                            }}
                            className={`text-left p-4 rounded-lg border-2 transition-all ${
                              isSelected ? 'border-purple-500 bg-purple-50/50' :
                              'border-gray-100 bg-white hover:border-purple-200'
                            }`}
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Sparkles size={14} className={usage.complimentary > 0 ? "text-purple-500" : "text-blue-500"} />
                                <p className="font-bold text-[#0F172A]">
                                  {usage.service_name}
                                  <span className={`ml-2 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded ${
                                    usage.complimentary > 0 ? 'bg-purple-50 text-purple-700' : 'bg-blue-50 text-blue-700'
                                  }`}>
                                    {usage.complimentary > 0 ? 'Free' : 'Mandatory'}
                                  </span>
                                  {matchedService?.duration_minutes ? ` · ~${matchedService.duration_minutes} min` : ''}
                                </p>
                              </div>
                              <div className="flex items-center gap-3">
                                <span className={`text-xs font-bold px-2 py-0.5 rounded-lg ${
                                  usage.remaining > 1 ? 'bg-emerald-50 text-emerald-600 border border-emerald-200' : 'bg-amber-50 text-amber-600 border border-amber-200'
                                }`}>
                                  {usage.remaining} / {usage.total_count} left
                                </span>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${
                                  isSelected ? 'bg-purple-500 border-purple-500' : 'border-gray-300'
                                }`}>
                                  {isSelected && <Check size={12} className="text-white" />}
                                </div>
                              </div>
                            </div>
                            {matchedService?.description && (
                              <p className="text-xs text-[#5f5e5e] mt-1 ml-[22px] line-clamp-2">{matchedService.description}</p>
                            )}
                          </button>
                        );
                      });
                    })()}
                  </div>
                </div>
              ) : servicesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2563EB]" /></div>
              ) : (
                /* No active package */
                <div className="text-center py-12 bg-white rounded-xl border border-gray-100">
                  <Sparkles size={48} className="text-gray-300 mx-auto mb-3" />
                  <h3 className="text-lg font-bold text-[#0F172A] mb-2">No Active or Valid Package</h3>
                  <p className="text-sm text-[#5f5e5e] mb-4">You do not have an active package. Your previous package may have expired or ran out of credits. Please purchase a new package or book a regular service.</p>
                  <div className="flex justify-center gap-3">
                    <button
                      onClick={() => navigate('/customer/bookings/new')}
                      className="px-5 py-2.5 bg-[#2563EB] text-white text-sm font-bold rounded-lg hover:bg-[#1D4ED8] transition-colors uppercase tracking-wider"
                    >
                      Book Normal Service
                    </button>
                  </div>
                </div>
              )}
            </div>
          ) : (
            <div>
              {/* Vehicle category filter (read-only label since it matches chosen car) */}
              <div className="mb-4 text-left">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Pricing Category: <span className="text-[#2563EB] font-extrabold">{filter === 'medium_hatchback' ? 'Medium Hatchback' : filter === 'premium_sedan' ? 'Premium Sedan' : filter.toUpperCase().replace('_', ' ')}</span>
                </span>
              </div>

              {servicesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2563EB]" /></div>
              ) : (
                <div className="space-y-6">
                  {services.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-3">Services</p>
                      <div className="grid gap-3">
                        {sortServicesByPriority(services.filter(s => s.is_active && (!useFreeWash || s.name.toLowerCase().includes('wash')))).map((svc) => {
                          const isSelected = selectedServices.includes(svc.id);
                          return (
                            <button
                              key={svc.id}
                              onClick={() => {
                                setSelectedServices(prev => prev.includes(svc.id) ? prev.filter(id => id !== svc.id) : [...prev, svc.id]);
                                setSelectedPackage(null);
                                setSelectedPackageServiceNames([]);
                              }}
                              className={`text-left p-4 rounded-lg border-2 transition-all ${
                                isSelected ? 'border-[#2563EB] bg-blue-50/30' : 'border-gray-100 bg-white hover:border-gray-200'
                              }`}
                            >
                              <div className="flex items-center justify-between">
                                <p className="font-bold text-[#0F172A]">{svc.name}{svc.duration_minutes ? ` · ~${svc.duration_minutes} min` : ''}</p>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#2563EB] border-[#2563EB]' : 'border-gray-300'}`}>
                                  {isSelected && <Check size={12} className="text-white" />}
                                </div>
                              </div>
                            {svc.description && <p className="text-xs text-[#5f5e5e] mt-1 line-clamp-2">{svc.description}</p>}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[#5f5e5e]">
                              <span className="font-bold text-[#2563EB]">
                                {(() => {
                                  const p = parseFloat(String(svc[`price_${filter}`] || svc.price_sedan || 0));
                                  if (p <= 0) return 'Ask Studio';
                                  const isWash = svc.name && svc.name.toLowerCase().includes('wash');
                                  if (isFirstWashEligible && isWash && !isPackageBooking) {
                                    const discounted = Math.round(p * 0.50);
                                    return (
                                      <span className="inline-flex items-center gap-1.5">
                                        <span className="line-through text-gray-400 text-[11px]">₹{p}</span>
                                        <span className="font-extrabold text-[#2563EB]">₹{discounted}</span>
                                        <span className="text-[9px] font-black bg-blue-100 text-blue-700 px-1.5 py-0.5 rounded">50% OFF</span>
                                      </span>
                                    );
                                  }
                                  return `₹${p}`;
                                })()}
                              </span>
                            </div>
                          </button>
                        );})}
                      </div>
                    </div>
                  )}

                  {/* 50% OFF First Wash Promo Banner */}
                  {isFirstWashEligible && !isPackageBooking && (
                    <div className="bg-gradient-to-r from-blue-600 via-rose-600 to-amber-600 text-white rounded-xl p-4 flex items-center justify-between gap-3 mb-4 shadow-md border border-blue-300">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-white/20 backdrop-blur-md flex items-center justify-center shrink-0">
                          <Sparkles size={18} className="text-amber-200 animate-bounce" />
                        </div>
                        <div className="text-left">
                          <div className="flex items-center gap-1.5 mb-0.5">
                            <span className="px-2 py-0.5 bg-amber-300 text-blue-950 text-[9px] font-black uppercase tracking-wider rounded-full">
                              First Wash Special
                            </span>
                            <span className="text-[10px] font-bold text-amber-100">50% OFF WASHES</span>
                          </div>
                          <p className="text-xs font-black text-white">Flat 50% Discount on car washes will be automatically applied at checkout!</p>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* Info-only: Show active package reminder if user has one */}
                  {activePackages.length > 0 && (
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-lg bg-purple-200 flex items-center justify-center">
                          <Sparkles size={16} className="text-purple-700" />
                        </div>
                        <div className="flex-1">
                          <p className="text-xs font-bold text-purple-800">You have an active <strong>{activePackages[0].package_name}</strong> package!</p>
                          <p className="text-[10px] text-purple-600 mt-0.5">
                            {(activePackages[0].usage || []).filter((u: any) => u.remaining > 0).map((u: any) => `${u.remaining} ${u.service_name}`).join(', ')} remaining
                          </p>
                        </div>
                        <button
                          onClick={() => navigate('/customer/bookings/new?from_package=1')}
                          className="px-3 py-1.5 bg-purple-600 text-white text-[10px] font-bold uppercase tracking-wider rounded-lg hover:bg-purple-700 transition-colors flex-shrink-0"
                        >
                          Use Package
                        </button>
                      </div>
                    </div>
                  )}

                  {!services.length && (
                    <p className="text-center py-8 text-[#5f5e5e]">No services available yet. Please check back later.</p>
                  )}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Step 1: Select Date ═══ */}
      {step === 1 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() - 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronLeft size={18} />
            </button>
            <span className="font-bold text-[#0F172A]">
              {calMonth.toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })}
            </span>
            <button onClick={() => setCalMonth(new Date(calMonth.getFullYear(), calMonth.getMonth() + 1))} className="p-2 hover:bg-gray-100 rounded-lg">
              <ChevronRight size={18} />
            </button>
          </div>

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = formatLocalDate(d);
              const isPast = d < today;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;

              return (
                <button
                  key={i}
                  disabled={isPast}
                  onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                  className={`p-2 rounded-lg text-sm font-medium text-center transition-all ${
                    isPast ? 'text-gray-300 cursor-not-allowed' :
                    isSelected ? 'bg-[#2563EB] text-white font-bold' :
                    isToday ? 'bg-blue-50 text-[#2563EB] font-bold' :
                    'hover:bg-[#f6f3f2] text-[#0F172A]'
                  }`}
                >
                  {d.getDate()}
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══ Step 2: Select Time Slot ═══ */}
      {step === 2 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <p className="text-xs text-[#5f5e5e] mb-4">
            Available slots for <span className="font-bold text-[#0F172A]">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
          </p>

          {slotsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2563EB]" /></div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {(slotsData?.data || []).filter((s: any) => !s.is_blocked).map((slot: any) => {
                let isFull = slot.booked_count >= slot.max_capacity;
                const isSelected = selectedSlot?.id === slot.id;
                
                // Filter out past slots for today
                const isToday = selectedDate === todayStr;
                if (isToday) {
                  const [hour, minute] = slot.start_time.split(':').map(Number);
                  const now = new Date();
                  if (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes())) {
                    isFull = true; // Mark as disabled
                  }
                }

                return (
                  <button
                    key={slot.id}
                    disabled={isFull}
                    onClick={() => setSelectedSlot(slot)}
                    className={`p-3 rounded-lg text-center transition-all border-2 ${
                      isSelected ? 'bg-[#2563EB] text-white border-[#2563EB]' :
                      isFull ? 'bg-gray-100 text-gray-400 border-gray-100 cursor-not-allowed' :
                      'bg-white border-gray-100 hover:border-[#2563EB] text-[#0F172A]'
                    }`}
                  >
                    <p className={`text-sm font-bold ${isSelected ? 'text-white' : ''}`}>
                      {formatTime(slot.start_time)}
                    </p>
                    <p className={`text-[10px] mt-0.5 ${isSelected ? 'text-white/80' : 'text-[#5f5e5e]'}`}>
                      {isFull ? 'Fully Booked' : `${slot.max_capacity - slot.booked_count} spots left`}
                    </p>
                  </button>
                );
              })}
              {(slotsData?.data || []).filter((s: any) => !s.is_blocked).length === 0 && (
                <p className="col-span-full text-center py-8 text-[#5f5e5e]">No slots available on this date</p>
              )}
            </div>
          )}
        </div>
      )}

      {/* ═══ Step 3: Confirm ═══ */}
      {step === 3 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] mb-4">Booking Summary</p>

          <div className="space-y-3 text-sm mb-6">
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Sparkles size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#5f5e5e]">Service(s)</span>
              <span className="ml-auto font-bold text-[#0F172A] text-right ml-4">
                {isPackageBooking ? selectedPackageServiceNames.join(', ') : selectedServicesObjs.length > 0 ? selectedServicesObjs.map(s => s.name).join(', ') : (selectedPackageObj?.package_name || selectedPackageObj?.name)}
              </span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Car size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#5f5e5e]">Vehicle</span>
              <span className="ml-auto font-bold text-[#0F172A]">{brand} {model} {regNo && `(${regNo})`}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Calendar size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#5f5e5e]">Date</span>
              <span className="ml-auto font-bold text-[#0F172A]">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Clock size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#5f5e5e]">Time</span>
              <span className="ml-auto font-bold text-[#0F172A]">{formatTime(selectedSlot?.start_time)} – {formatTime(selectedSlot?.end_time)}</span>
            </div>
            {totalBookingDuration > 0 && (
              <div className="flex items-center gap-3 py-2 border-b border-gray-50">
                <Clock size={16} className="text-[#2563EB] shrink-0" />
                <span className="text-[#5f5e5e]">Est. Duration</span>
                <span className="ml-auto font-bold text-[#0F172A]">~{totalBookingDuration} mins</span>
              </div>
            )}
            {/* Payment Option Selection */}
            {!isPackageBooking && !useFreeWash && requiredAdvancePossible > 0 && (
              <div className="mt-4 space-y-3 pb-4 border-b border-gray-100">
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#5f5e5e] text-left">Select Payment Option</p>
                <div className="flex flex-col gap-3 text-left">

                  {/* Part Advance — Priority */}
                  <button
                    type="button"
                    onClick={() => setPayAdvance('part')}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                      payAdvance === 'part' ? 'border-[#2563EB] bg-blue-50/30 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {payAdvance === 'part' && <div className="absolute top-0 left-0 w-1 h-full bg-[#2563EB] rounded-r" />}
                    <div className="flex flex-wrap justify-between items-center w-full gap-2">
                      <span className="font-extrabold text-sm text-[#0F172A]">₹200 Part Advance</span>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-emerald-100 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">⚡ 1st Priority</span>
                        <span className="bg-amber-100 text-amber-700 text-[10px] font-bold px-2 py-0.5 rounded-full">Part Pay</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#5f5e5e] mt-1.5 leading-relaxed font-medium">Pay ₹200 online now to secure your slot with <strong className="text-emerald-700">first priority</strong>. Pay remaining balance at the studio.</p>
                  </button>

                  {/* Full Advance — Priority + Discount */}
                  <button
                    type="button"
                    onClick={() => setPayAdvance('full')}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                      payAdvance === 'full' ? 'border-[#2563EB] bg-blue-50/30 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {payAdvance === 'full' && <div className="absolute top-0 left-0 w-1 h-full bg-[#2563EB] rounded-r" />}
                    <div className="flex flex-wrap justify-between items-center w-full gap-2">
                      <span className="font-extrabold text-sm text-[#0F172A]">Full Advance</span>
                      <div className="flex items-center gap-1.5">
                        <span className="bg-emerald-100 text-emerald-700 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">⚡ 1st Priority</span>
                        <span className="bg-green-100 text-green-700 text-[10px] font-bold px-2.5 py-0.5 rounded-full">Save 10%</span>
                      </div>
                    </div>
                    <p className="text-xs text-[#5f5e5e] mt-1.5 leading-relaxed font-medium">Pay full amount online now — get <strong className="text-green-700">10% discount</strong> and <strong className="text-emerald-700">first priority</strong> service.</p>
                  </button>

                  {/* Pay at Studio — No Priority */}
                  <button
                    type="button"
                    onClick={() => setPayAdvance('none')}
                    className={`p-4 rounded-xl border-2 text-left transition-all relative overflow-hidden ${
                      payAdvance === 'none' ? 'border-[#2563EB] bg-blue-50/30 shadow-md' : 'border-gray-200 bg-white hover:border-gray-300'
                    }`}
                  >
                    {payAdvance === 'none' && <div className="absolute top-0 left-0 w-1 h-full bg-[#2563EB] rounded-r" />}
                    <div className="flex flex-wrap justify-between items-center w-full gap-2">
                      <span className="font-extrabold text-sm text-[#0F172A]">Pay at Studio</span>
                      <span className="bg-gray-100 text-gray-500 text-[9px] font-extrabold px-2 py-0.5 rounded-full uppercase tracking-wider">No Priority</span>
                    </div>
                    <p className="text-xs text-[#5f5e5e] mt-1.5 leading-relaxed font-medium">Book your slot without paying advance. Pay full price at studio after service.</p>
                    <div className="mt-2 bg-amber-50 border border-amber-200 rounded-lg px-3 py-1.5">
                      <p className="text-[10px] text-amber-700 font-bold leading-snug">⚠️ Advance-paying customers will be given first priority. Your service may be delayed if the studio is busy.</p>
                    </div>
                  </button>

                </div>
              </div>
            )}

            <div className="space-y-2 border-t border-gray-100 pt-4">
              {!isPackageBooking && (
                <>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                    <span className="text-[#5f5e5e] font-normal">Original Total Price</span>
                    <span className="ml-auto">₹{estimatedTotal}</span>
                  </div>
                  {firstWashDiscountAmount > 0 && (
                    <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-blue-600 bg-blue-50/70 px-2.5 rounded-lg">
                      <span className="text-blue-700 font-bold flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-500" />
                        First Wash Special (50% OFF)
                      </span>
                      <span className="ml-auto text-blue-700 font-extrabold">-₹{firstWashDiscountAmount}</span>
                    </div>
                  )}
                  {discountAmount > 0 && (
                    <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-green-600">
                      <span className="text-green-600 font-normal">Advance Discount (10% Off)</span>
                      <span className="ml-auto">-₹{discountAmount}</span>
                    </div>
                  )}
                </>
              )}
              {pickupOption !== 'none' && (
                <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                  <span className="text-[#5f5e5e] font-normal">Pickup & Drop ({pickupOption})</span>
                  <span className="ml-auto text-gray-800">
                    {pickupCharge > 0 ? `₹${pickupCharge}` : 'Free (Waived)'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                <span className="text-[#5f5e5e] font-normal">Total Price</span>
                <span className="ml-auto">₹{finalTotal}</span>
              </div>
              {requiredAdvance > 0 && (
                <>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-base text-[#2563EB]">
                    <span className="text-[#5f5e5e] font-normal text-sm">Advance Required</span>
                    <span className="ml-auto">₹{requiredAdvance}</span>
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                    <span className="text-[#5f5e5e] font-normal">Balance Due at Studio</span>
                    <span className="ml-auto">₹{finalTotal - requiredAdvance}</span>
                  </div>
                </>
              )}
            </div>
            {isPackageBooking && (
              <div className="py-2 bg-purple-50 rounded-lg px-3 mt-2 space-y-1">
                <div className="flex items-center gap-3">
                  <Sparkles size={16} className="text-purple-600 shrink-0" />
                  <span className="text-purple-700 font-bold text-xs">Package Credit</span>
                  <span className="ml-auto text-xs font-bold text-purple-800">{activePackages[0]?.package_name}</span>
                </div>
                <p className="text-[10px] text-purple-600 ml-[28px]">Credit will be deducted only after admin approves this booking. If rejected or cancelled, your balance is restored.</p>
              </div>
            )}

            {/* Pickup & Drop Option Section */}
            <div className="mt-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#5f5e5e] mb-1.5 uppercase tracking-wide">Pickup & Drop Option</label>
                <select
                  value={pickupOption}
                  onChange={(e) => setPickupOption(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 transition-all cursor-pointer"
                >
                  <option value="none">None (No Pickup/Drop)</option>
                  <option value="pickup">Pickup Only</option>
                  <option value="drop">Drop Only</option>
                  <option value="both">Pickup + Drop</option>
                </select>
                <p className="text-[11px] text-[#5f5e5e] mt-1">
                  {pickupOption === 'none' ? 'No extra charges apply.' :
                   activePackageHasFreePickup ? '🎉 Free Pickup & Drop under your active package!' :
                   pickupOption === 'pickup' ? `Pickup charge: ₹${settings.pickup_charge || 150}` :
                   pickupOption === 'drop' ? `Drop charge: ₹${settings.drop_charge || 150}` :
                   `Pickup + Drop charge: ₹${settings.pickup_drop_charge || 250}`}
                </p>
              </div>

              {pickupOption !== 'none' && (
                <div className="space-y-3 pt-2 border-t border-gray-200/50 animate-fade-in-up">
                  {savedAddresses.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Select Saved Address</label>
                      <select
                        value={selectedAddressId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedAddressId(val === 'new' ? 'new' : parseInt(val));
                          if (val !== 'new') {
                            const addr = savedAddresses.find(a => a.id === parseInt(val));
                            if (addr) {
                              setPickupAddress(addr.address);
                              setLandmark(addr.landmark || '');
                              setCity(addr.city || '');
                              setStateName(addr.state || 'Gujarat');
                              setPincode(addr.pincode || '');
                            }
                          } else {
                            setPickupAddress('');
                            setLandmark('');
                            setCity('');
                            setStateName('Gujarat');
                            setPincode('');
                          }
                        }}
                        className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-medium text-gray-800"
                      >
                        {savedAddresses.map((addr) => (
                          <option key={addr.id} value={addr.id}>
                            📍 {addr.address}, {addr.city} {addr.is_default ? '(Default)' : ''}
                          </option>
                        ))}
                        <option value="new">+ Add New Address</option>
                      </select>
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-gray-700 mb-1">Address *</label>
                    <textarea
                      rows={2}
                      value={pickupAddress}
                      onChange={(e) => setPickupAddress(e.target.value)}
                      placeholder="Street address, building, apartment..."
                      className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                      required
                      disabled={selectedAddressId !== 'new'}
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Landmark</label>
                      <input
                        type="text"
                        value={landmark}
                        onChange={(e) => setLandmark(e.target.value)}
                        placeholder="Near mall..."
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                        disabled={selectedAddressId !== 'new'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">City *</label>
                      <input
                        type="text"
                        value={city}
                        onChange={(e) => setCity(e.target.value)}
                        placeholder="Anand"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                        required
                        disabled={selectedAddressId !== 'new'}
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">State *</label>
                      <input
                        type="text"
                        value={stateName}
                        onChange={(e) => setStateName(e.target.value)}
                        placeholder="Gujarat"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                        required
                        disabled={selectedAddressId !== 'new'}
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Pincode *</label>
                      <input
                        type="text"
                        value={pincode}
                        onChange={(e) => setPincode(e.target.value)}
                        placeholder="390001"
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                        required
                        disabled={selectedAddressId !== 'new'}
                      />
                    </div>
                  </div>

                  {(pickupOption === 'pickup' || pickupOption === 'both') && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Preferred Pickup Time (Optional)</label>
                      <input
                        type="datetime-local"
                        value={pickupTime}
                        onChange={(e) => setPickupTime(e.target.value)}
                        className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 bg-white"
                      />
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>

          <Button 
            className="w-full" 
            onClick={handleBook} 
            loading={createMut.isPending || submittingOnline}
            disabled={pickupOption !== 'none' && !pickupAddress.trim()}
          >
            {requiredAdvance > 0 ? `Pay Advance (₹${requiredAdvance})` : 'Confirm Booking'}
          </Button>
        </div>
      )}

      {/* Navigation */}
      <div className="flex justify-between mt-6 pb-8">
        {step > 0 ? (
          <Button variant="ghost" onClick={() => setStep(step - 1)} icon={<ChevronLeft size={14} />}>Back</Button>
        ) : <div />}
        {step < 3 && (
          <Button onClick={() => setStep(step + 1)} disabled={!canNext}>
            Next <ChevronRight size={14} className="ml-1" />
          </Button>
        )}
      </div>

      {showQrModal && (
        <QrPaymentModal
          open={showQrModal}
          onClose={() => {
            setShowQrModal(false);
            toast('warning', 'Payment cancelled. Your booking slot is reserved for 10 minutes. You can pay from bookings list.');
            navigate('/customer/bookings');
          }}
          amount={qrAmount}
          bookingId={activeBookingId}
          onSuccess={() => {
            setShowQrModal(false);
            toast('success', 'Your QR Payment confirmation request has been submitted for admin verification.');
            navigate('/customer/bookings');
          }}
        />
      )}

      {choiceBookingData && (
        <Modal 
          open={!!choiceBookingData} 
          onClose={() => setChoiceBookingData(null)} 
          title="Choose Advance Payment Method"
          size="sm"
        >
          <div className="flex flex-col gap-3 py-2 text-center">
            <p className="text-sm text-gray-600 mb-2">
              An advance payment of <span className="font-extrabold text-[#2563EB]">₹{choiceBookingData.bookingData.advance_amount}</span> is required to reserve your slot.
            </p>
            <button
              onClick={() => handlePayOnline(choiceBookingData.bookingData.id, choiceBookingData.bookingData.advance_amount, choiceBookingData.fullRes)}
              className="w-full py-3 px-4 bg-[#2563EB] text-white rounded-xl font-extrabold text-sm hover:bg-[#1E40AF] shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <CreditCard size={16} />
              Pay Online (Razorpay)
            </button>
            <button
              onClick={() => {
                setQrAmount(choiceBookingData.bookingData.advance_amount);
                setActiveBookingId(choiceBookingData.bookingData.id);
                setShowQrModal(true);
                setChoiceBookingData(null);
              }}
              className="w-full py-3 px-4 bg-gradient-to-r from-emerald-600 to-teal-600 text-white rounded-xl font-extrabold text-sm hover:from-emerald-700 hover:to-teal-700 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2"
            >
              <QrCode size={16} />
              Scan & Pay (UPI QR)
            </button>
            <button
              onClick={() => setChoiceBookingData(null)}
              className="w-full py-2.5 bg-gray-100 text-gray-700 rounded-xl font-semibold text-sm hover:bg-gray-200 transition-all"
            >
              Cancel
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}
