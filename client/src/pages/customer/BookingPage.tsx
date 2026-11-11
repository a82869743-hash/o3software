import { useVehicleStore } from '../../store/vehicleStore';
import { formatDuration } from '../../utils/formatters';
import { regNoError, normalizeRegNo } from '../../utils/validators';
import { CAR_TYPES, carTypeLabel } from '../../utils/carTypes';
import { useState, useEffect, useMemo } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { ChevronLeft, ChevronRight, Check, Calendar, Clock, Car, Sparkles, Loader2, ArrowLeft, CreditCard, QrCode, Gift, Crosshair } from 'lucide-react';
import GpsOffPrompt, { GpsProblem } from '../../components/shared/GpsOffPrompt';
import { getLocation, addressFor, locationPermission, pointFor } from '../../utils/location';
import PinPicker from '../../components/shared/PinPicker';
import { useSlots, useSlotClosures } from '../../api/hooks/useSlots';
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
import { carImage } from '../../utils/carImage';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

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
  // the studio set its own display order → keep it exactly as the server sends it
  if (services.some(s => Number(s.sort_order) > 0)) return services;
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
  const { data: closuresRes } = useSlotClosures();
  const closuresList = useMemo(() => closuresRes?.data || [], [closuresRes]);

  // Step 5: Confirm
  const [selectedSlot, setSelectedSlot] = useState<any>(null);
  const [bookingResult, setBookingResult] = useState<any>(null);
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [submittingOnline, setSubmittingOnline] = useState(false);
  const [payAdvance, setPayAdvance] = useState<'full' | 'part' | 'none'>('none');

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
  const [pickupPin, setPickupPin] = useState<{ lat: number; lng: number; accuracy: number } | null>(null);
  // A rough device location (laptops, weak GPS) must be checked by the customer before booking.
  const [pinConfirmed, setPinConfirmed] = useState(false);
  const pinNeedsCheck = !!pickupPin && pickupPin.accuracy > 100 && !pinConfirmed;
  const [locating, setLocating] = useState(false);
  const [findingOnMap, setFindingOnMap] = useState(false);
  // Typed address -> pin on the map (the customer then drags it to the exact gate)
  const findOnMap = async () => {
    setFindingOnMap(true);
    const p = await pointFor([pickupAddress, landmark, city, stateName, pincode]);
    setFindingOnMap(false);
    if (p) { setPickupPin({ ...p, accuracy: 0 }); setPinConfirmed(false); toast('success', 'Address found. Drag the pin to your exact gate.'); }
    else toast('error', 'Could not find this address on the map. Drag the pin to your place.');
  };
  const [gpsProblem, setGpsProblem] = useState<GpsProblem>(null);

  // Pickup/drop: fill the address from the phone's location (asks to turn on / allow location if needed)
  const detectPickup = async (silent = false) => {
    setLocating(true);
    try {
      const fix = await getLocation();
      // auto-fill on page open only with a good fix; a rough one would put the driver at the wrong place
      if (silent && fix.accuracy > 100) return;
      setPickupPin(fix);
      setPinConfirmed(false);
      const place = await addressFor(fix.lat, fix.lng);
      setSelectedAddressId('new');
      if (place.address) setPickupAddress(place.address);
      if (place.landmark) setLandmark(place.landmark);
      if (place.city) setCity(place.city);
      if (place.state) setStateName(place.state);
      if (place.pincode) setPincode(place.pincode);
      if (!silent) toast(fix.accuracy > 100 ? 'error' : 'success', fix.accuracy > 100
        ? `Only a rough location (about ${fix.accuracy} m off). Drag the pin to your exact gate.`
        : `Location found (±${fix.accuracy} m). Check the address.`);
    } catch (p: any) {
      if (!silent) setGpsProblem(p);
    } finally {
      setLocating(false);
    }
  };
  useEffect(() => {
    // location already allowed and no saved address → fill it in without asking
    if (pickupOption === 'none' || pickupPin || pickupAddress) return;
    locationPermission().then(st => { if (st === 'granted') detectPickup(true); });
  }, [pickupOption]); // eslint-disable-line react-hooks/exhaustive-deps

  // Autocomplete data
  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(brand);

  // Admin changed services / packages / offer while the customer is booking: refresh those lists, keep their choices
  useLiveReload(() => {
    api.get('/services', { params: { for_app: true } }).then(r => setServices(sortServicesByPriority(r.data.data || []))).catch(() => {});
    api.get('/packages').then(r => setPackages(r.data.data || [])).catch(() => {});
    api.get('/settings/public').then(r => { if (r.data.success) setSettings(r.data.data || {}); }).catch(() => {});
  });

  // Load services, packages, vehicles
  useEffect(() => {
    (async () => {
      try {
        const initialVehicleId = new URLSearchParams(window.location.search).get('vehicle_id');
        const activePkgUrl = initialVehicleId ? `/user-packages/active?vehicle_id=${initialVehicleId}` : '/user-packages/active';
        const [svcRes, pkgRes, myVehiclesRes, activePkgRes, settingsRes, dashboardRes, lastAddressRes, addressesRes, fwRes] = await Promise.all([
          api.get('/services', { params: { for_app: true } }).catch(() => ({ data: { data: [] } })),
          api.get('/packages').catch(() => ({ data: { data: [] } })),
          api.get('/vehicles/my-vehicles').catch(() => ({ data: { data: [] } })),
          api.get(activePkgUrl).catch(() => ({ data: { data: [] } })),
          api.get('/settings/public').catch(() => ({ data: { data: {} } })),
          api.get('/dashboard/customer').catch(() => ({ data: {} })),
          api.get('/pickup-requests/last-address').catch(() => ({ data: { address: '' } })),
          api.get('/pickup-requests/addresses').catch(() => ({ data: { success: false, data: [] } })),
          api.get('/bookings/first-wash-eligibility').catch(() => ({ data: { is_eligible: false } })),
        ]);
        setServices(sortServicesByPriority(svcRes.data.data || []));
        setPackages(pkgRes.data.data || []);
        
        const fetchedVehicles = myVehiclesRes.data.data || [];
        setUserVehicles(fetchedVehicles);
        
        if (fetchedVehicles.length > 0) {
          // car chosen in the app header (vehicle switcher) wins over the primary car
          const current = useVehicleStore.getState().selectedId;
          const primary = (initialVehicleId && fetchedVehicles.find((v: any) => v.id.toString() === initialVehicleId))
            || fetchedVehicles.find((v: any) => v.id === current)
            || fetchedVehicles.find((v: any) => v.is_primary) || fetchedVehicles[0];
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
            if (defAddr.latitude && defAddr.longitude) setPickupPin({ lat: Number(defAddr.latitude), lng: Number(defAddr.longitude), accuracy: 0 });
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
        // a typed-in car needs a valid number plate (saved cars already have one)
        const regValid = selectedVehicleId ? true : (regNo.trim().length > 0 && !regNoError(regNo));
        return servicesValid && brandValid && modelValid && regValid;
      }
      case 1: return selectedDate.length > 0;
      case 2: return selectedSlot !== null;
      default: return true;
    }
  }, [step, selectedServices, selectedPackage, selectedPackageServiceNames, isPackageBooking, brand, model, customBrand, customModel, selectedDate, selectedSlot, regNo, selectedVehicleId]);

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

  const getDayClosureInfo = (d: Date) => {
    const dateStr = formatLocalDate(d);
    const dayOfWeek = d.getDay();
    const month = d.getMonth() + 1;
    const dayNum = d.getDate();

    return closuresList.find((c: any) => {
      if (c.is_recurring) {
        if (c.recurrence_type === 'weekly') {
          return dayOfWeek === parseInt(c.recurrence_day, 10);
        }
        if (c.recurrence_type === 'yearly' && c.start_date) {
          const [cy, cm, cd] = c.start_date.split('-').map(Number);
          return month === cm && dayNum === cd;
        }
      } else {
        if (!c.slot_time) {
          return dateStr >= c.start_date && dateStr <= c.end_date;
        }
      }
      return false;
    });
  };

  const selectedDateClosure = useMemo(() => {
    if (!selectedDate) return null;
    const parts = selectedDate.split('-').map(Number);
    const d = new Date(parts[0], parts[1] - 1, parts[2]);
    return getDayClosureInfo(d);
  }, [selectedDate, closuresList]);

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
        if (matched && matched.show_duration !== 0) sum += Number(matched.duration_minutes) || 0;
      }
      return sum;
    } else {
      return selectedServicesObjs.reduce((sum, s) => sum + (s.show_duration !== 0 ? Number(s.duration_minutes) || 0 : 0), 0);
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
    if (pickupOption === 'pickup') return parseFloat(settings.pickup_charge || '0');
    if (pickupOption === 'drop') return parseFloat(settings.drop_charge || '0');
    if (pickupOption === 'both') return parseFloat(settings.pickup_drop_charge || '0');
    return 0;
  }, [pickupOption, activePackageHasFreePickup, settings]);

  const firstWashDiscountAmount = useMemo(() => {
    if (isPackageBooking || !isFirstWashEligible || washServicesTotal <= 0) return 0;
    return Math.round(washServicesTotal * 0.50);
  }, [isPackageBooking, isFirstWashEligible, washServicesTotal]);

  // Offer code (from the home-screen offer or typed in) — checked by the server, never trusted from the app
  const [offerCode, setOfferCode] = useState<string>(() => { try { return sessionStorage.getItem('o3-offer') || ''; } catch { return ''; } });
  const [offerInfo, setOfferInfo] = useState<{ discount: number; label: string; code: string } | null>(null);
  const [offerErr, setOfferErr] = useState('');
  const checkOffer = async (code = offerCode) => {
    if (!code.trim() || isPackageBooking || estimatedTotal <= 0) { setOfferInfo(null); return; }
    try {
      const { data } = await api.get('/bookings/offer-check', { params: { code: code.trim(), amount: estimatedTotal } });
      setOfferInfo({ discount: data.discount, label: data.label, code: data.code }); setOfferErr('');
    } catch (e: any) { setOfferInfo(null); setOfferErr(e?.response?.data?.error || 'Code not valid'); }
  };
  useEffect(() => { if (offerCode && estimatedTotal > 0) checkOffer(); /* re-check when the services change */ }, [estimatedTotal, isPackageBooking]); // eslint-disable-line react-hooks/exhaustive-deps
  const offerDiscount = offerInfo && offerInfo.discount > firstWashDiscountAmount ? offerInfo.discount : 0;

  const totalAfterFirstWashDiscount = useMemo(() => {
    return Math.max(0, estimatedTotal - (offerDiscount || firstWashDiscountAmount));
  }, [estimatedTotal, firstWashDiscountAmount, offerDiscount]);

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


  const handleBook = async () => {
    try {
      setSubmittingOnline(true);
      const res = await createMut.mutateAsync({
        slot_id: selectedSlot.id,
        service_ids: !isPackageBooking && selectedServices.length > 0 ? selectedServices : undefined,
        package_service_name: isPackageBooking && selectedPackageServiceNames.length > 0 ? selectedPackageServiceNames.join(',') : undefined,
        package_id: isPackageBooking ? (selectedPackage || undefined) : undefined,
        vehicle_id: selectedVehicleId || undefined,
        vehicle_brand: brand === 'Others' ? customBrand : brand,
        vehicle_model: (brand === 'Others' || model === 'Other') ? customModel : model,
        vehicle_reg_no: regNo || undefined,
        vehicle_category: filter !== 'all' ? filter : undefined,
        use_package: isPackageBooking ? true : undefined,
        is_free_wash: useFreeWash || undefined,
        pay_advance: !isPackageBooking && !useFreeWash ? payAdvance : undefined,
        offer_code: offerDiscount > 0 && offerInfo ? offerInfo.code : undefined,
        pickup_type: pickupOption,
        pickup_address_details: pickupOption !== 'none' ? {
          address: pickupAddress,
          landmark,
          city,
          state: stateName,
          pincode,
          latitude: pickupPin?.lat,
          longitude: pickupPin?.lng
        } : undefined
      });

      const bookingData = res.data;

      if (bookingData && bookingData.id && (pickupOption === 'pickup' || pickupOption === 'both')) {
        await api.post('/pickup-requests', {
          booking_id: bookingData.id,
          address: `${pickupAddress}${landmark ? ', Landmark: ' + landmark : ''}, ${city}, ${stateName} - ${pincode}`,
          scheduled_time: pickupTime || undefined,
          latitude: pickupPin?.lat,
          longitude: pickupPin?.lng,
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
        <p className="text-sm text-[#64748B] mb-1">Your appointment request has been submitted for approval.</p>
        {isPackageBooking && (
          <p className="text-xs text-purple-600 font-semibold mb-1">📦 Package credit will be deducted once admin approves your booking.</p>
        )}
        <p className="text-xs text-[#64748B] mb-6">Reference: <span className="font-bold">#{bookingResult.data?.id}</span></p>
        <div className="bg-white rounded-lg p-6 shadow-sm max-w-sm w-full text-left space-y-2">
          <div className="flex justify-between text-sm">
            <span className="text-[#64748B]">Service(s)</span>
            <span className="font-bold text-right ml-4">
              {isPackageBooking ? selectedPackageServiceNames.join(', ') : selectedServicesObjs.length > 0 ? selectedServicesObjs.map(s => s.name).join(', ') : (selectedPackageObj?.package_name || selectedPackageObj?.name)}
            </span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#64748B]">Date</span>
            <span className="font-bold">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#64748B]">Time</span>
            <span className="font-bold">{formatTime(selectedSlot.start_time)} – {formatTime(selectedSlot.end_time)}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-[#64748B]">Vehicle</span>
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

  if (String(settings.bookings_paused) === '1' || String(settings.bookings_paused) === 'true') {
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
        className="hidden lg:flex items-center gap-2 text-gray-500 hover:text-gray-900 mb-4 text-sm font-medium transition-colors"
      >
        <ArrowLeft size={14} /> Back to My Bookings
      </button>

      {/* Progress Stepper */}
      <div className="flex items-center justify-between mb-8">
        {STEPS.map((label, i) => (
          <div key={label} className="flex items-center">
            <div className={`flex items-center justify-center w-8 h-8 rounded-full text-xs font-extrabold transition-colors ${
              i < step ? 'bg-[#2563EB] text-white' : i === step ? 'bg-[#2563EB] text-white ring-4 ring-blue-100' : 'bg-[#F1F5F9] text-[#64748B]'
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
                <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-2">Select Your Vehicle</p>
                {/* Saved cars as picture cards */}
                <div className="flex gap-2.5 overflow-x-auto -mx-1 px-1 pb-1 snap-x">
                  {userVehicles.map((v: any) => {
                    const on = selectedVehicleId === v.id;
                    return (
                      <button type="button" key={v.id}
                        onClick={() => {
                          setSelectedVehicleId(v.id);
                          useVehicleStore.getState().select(v.id);
                          setBrand(v.brand);
                          setModel(v.model);
                          setRegNo(v.registration_no || '');
                          setFilter(v.category || getCategoryForModel(v.brand, v.model));
                        }}
                        className={`snap-start shrink-0 w-[150px] rounded-xl border-2 bg-white p-2 text-left transition ${on ? 'border-[#2563EB] shadow-md shadow-blue-500/15' : 'border-slate-100 hover:border-blue-200'}`}>
                        <img src={carImage(v)} alt="" className="w-full h-20 object-contain" loading="lazy" />
                        <span className="block text-[12.5px] font-extrabold text-slate-900 truncate">{v.brand} {v.model}</span>
                        <span className="block text-[10.5px] font-semibold text-slate-500 truncate">{v.registration_no || 'No number'}{v.is_primary ? ' · ★ Primary' : ''}</span>
                      </button>
                    );
                  })}
                </div>
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
                      const primary = userVehicles.find((v: any) => v.id === useVehicleStore.getState().selectedId) || userVehicles.find((v: any) => v.is_primary) || userVehicles[0];
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
                      if (e.target.value && e.target.value !== 'Other') setFilter(getCategoryForModel(brand, e.target.value));
                    }}
                    placeholder={brand ? "Select Model" : "Select brand first"}
                    disabled={!brand || brand === 'Others'}
                  />
                </div>
                {(brand === 'Others' || model === 'Other') && (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-left mt-2">
                    {brand === 'Others' && (
                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1.5 uppercase tracking-wide">Enter Brand Name *</label>
                        <input
                          type="text"
                          value={customBrand}
                          onChange={(e) => setCustomBrand(e.target.value)}
                          placeholder="e.g. Porsche"
                          className="w-full px-4 py-3 bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 text-sm"
                          required
                        />
                      </div>
                    )}
                    {(brand === 'Others' || model === 'Other') && (
                      <div>
                        <label className="block text-xs font-bold text-[#64748B] mb-1.5 uppercase tracking-wide">Enter Model Name *</label>
                        <input
                          type="text"
                          value={customModel}
                          onChange={(e) => setCustomModel(e.target.value)}
                          placeholder="e.g. Cayenne"
                          className="w-full px-4 py-3 bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 text-sm"
                          required
                        />
                      </div>
                    )}
                  </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  <Input label="Registration No *" placeholder="e.g. GJ01AB1234" maxLength={11} value={regNo} onChange={(e) => setRegNo(normalizeRegNo(e.target.value))}
                    error={regNo && regNoError(regNo) ? regNoError(regNo) || undefined : undefined} />
                  <div>
                    <label className="block text-xs font-bold text-[#64748B] mb-1.5 uppercase tracking-wide">Vehicle Category *</label>
                    <Dropdown
                      value={filter}
                      onChange={(e) => setFilter(e.target.value)}
                      className="w-full px-3 py-2 bg-[#F1F5F9] border border-transparent rounded-lg text-sm font-bold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 cursor-pointer"
                    >
                      {CAR_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </Dropdown>
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
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-3">Available Package Services</p>
                  <div className="grid gap-3">
                    {(() => {
                      const packageUsage = activePackages[0]?.usage || [];
                      const availableServices = packageUsage.filter((u: any) => u.remaining > 0);

                      if (availableServices.length === 0) {
                        return (
                          <div className="text-center py-8 bg-white rounded-lg border border-gray-100">
                            <Sparkles size={32} className="text-gray-300 mx-auto mb-2" />
                            <p className="text-[#64748B] font-medium">All package credits have been used</p>
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
                                  {matchedService?.duration_minutes && matchedService.show_duration !== 0 ? ` · approx. ${formatDuration(matchedService.duration_minutes)}` : ''}
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
                              <p className="text-xs text-[#64748B] mt-1 ml-[22px] line-clamp-2">{matchedService.description}</p>
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
                  <p className="text-sm text-[#64748B] mb-4">You do not have an active package. Your previous package may have expired or ran out of credits. Please purchase a new package or book a regular service.</p>
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
                  {/* Package first: a customer with credits should use them before paying */}
                  {activePackages.length > 0 && (
                    <div className="bg-gradient-to-r from-purple-50 to-purple-100 border border-purple-200 rounded-xl p-4 mb-4">
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

              {/* Vehicle category filter (read-only label since it matches chosen car) */}
              <div className="mb-4 text-left">
                <span className="text-xs font-bold text-gray-500 uppercase tracking-wider">
                  Pricing Category: <span className="text-[#2563EB] font-extrabold">{carTypeLabel(filter)}</span>
                </span>
              </div>

              {servicesLoading ? (
                <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2563EB]" /></div>
              ) : (
                <div className="space-y-6">
                  {services.length > 0 && (
                    <div>
                      <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-3">Services</p>
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
                                <p className="font-bold text-[#0F172A]">{svc.name}{svc.duration_minutes && svc.show_duration !== 0 ? ` · approx. ${formatDuration(svc.duration_minutes)}` : ''}</p>
                                <div className={`w-5 h-5 rounded border flex items-center justify-center ${isSelected ? 'bg-[#2563EB] border-[#2563EB]' : 'border-gray-300'}`}>
                                  {isSelected && <Check size={12} className="text-white" />}
                                </div>
                              </div>
                            {svc.description && <p className="text-xs text-[#64748B] mt-1 line-clamp-2">{svc.description}</p>}
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mt-2 text-xs text-[#64748B]">
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

                  {!services.length && (
                    <p className="text-center py-8 text-[#64748B]">No services available yet. Please check back later.</p>
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

          {selectedDateClosure && (
            <div className="mb-4 p-3.5 rounded-xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-3">
              <div className="p-2 bg-amber-100 rounded-lg text-amber-700 shrink-0 mt-0.5">
                <Calendar size={18} />
              </div>
              <div className="text-left">
                <p className="font-extrabold text-[11px] uppercase tracking-wider text-amber-800">
                  Studio Closure / Holiday
                </p>
                <p className="text-sm font-bold text-amber-950 mt-0.5">
                  {selectedDateClosure.title || 'Studio Closed'}
                </p>
                {selectedDateClosure.reason && (
                  <p className="text-xs text-amber-800 mt-0.5">
                    Reason: {selectedDateClosure.reason}
                  </p>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-7 gap-1 mb-2">
            {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((d) => (
              <div key={d} className="text-center text-[10px] font-bold uppercase tracking-widest text-[#64748B] py-2">{d}</div>
            ))}
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calDays.map((d, i) => {
              if (!d) return <div key={i} />;
              const dateStr = formatLocalDate(d);
              const isPast = d < today;
              const isSelected = dateStr === selectedDate;
              const isToday = dateStr === todayStr;
              const dayClosure = getDayClosureInfo(d);
              const isClosedDay = !!dayClosure;

              return (
                <button
                  key={i}
                  disabled={isPast}
                  onClick={() => { setSelectedDate(dateStr); setSelectedSlot(null); }}
                  className={`p-2 rounded-xl text-center transition-all relative flex flex-col items-center justify-center min-h-[52px] ${
                    isPast ? 'text-gray-300 cursor-not-allowed' :
                    isSelected ? 'bg-[#2563EB] text-white font-bold shadow-sm' :
                    isClosedDay ? 'bg-rose-50 text-rose-700 font-bold border border-rose-200 hover:bg-rose-100' :
                    isToday ? 'bg-blue-50 text-[#2563EB] font-bold border border-blue-200' :
                    'hover:bg-[#F1F5F9] text-[#0F172A]'
                  }`}
                >
                  <span className="text-sm font-bold">{d.getDate()}</span>
                  {isClosedDay && !isPast && (
                    <span className={`text-[8px] font-black truncate max-w-full px-1 rounded mt-0.5 ${
                      isSelected ? 'text-white/90 bg-white/20' : 'text-rose-700 bg-rose-100'
                    }`} title={dayClosure.title || dayClosure.reason || 'Closed'}>
                      {dayClosure.title || 'Closed'}
                    </span>
                  )}
                </button>
              );
            })}
          </div>

          <div className="flex flex-wrap items-center justify-center gap-4 mt-4 pt-3 border-t border-gray-100 text-[11px] text-[#64748B]">
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-blue-50 border border-blue-200"></div>
              <span>Today</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-[#2563EB]"></div>
              <span>Selected</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-3 h-3 rounded-full bg-rose-100 border border-rose-300"></div>
              <span>Closed / Holiday</span>
            </div>
          </div>
        </div>
      )}

      {/* ═══ Step 2: Select Time Slot ═══ */}
      {step === 2 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-4">
            <p className="text-xs text-[#64748B]">
              Available slots for <span className="font-bold text-[#0F172A]">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long' })}</span>
            </p>
            {totalBookingDuration > 0 && (
              <span className="inline-flex items-center gap-1.5 text-xs font-bold text-[#2563EB] bg-blue-50 px-2.5 py-1 rounded-lg border border-blue-100 w-fit">
                <Clock size={13} />
                Approx. {formatDuration(totalBookingDuration)}
              </span>
            )}
          </div>
          {totalBookingDuration > 0 && (
            <p className="text-[11px] text-[#64748B] -mt-2 mb-3">Times are approximate. The studio will tell you the actual time after checking your car.</p>
          )}

          {selectedDateClosure && (
            <div className="mb-4 p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-900 flex items-start gap-3">
              <div className="p-2 bg-rose-100 rounded-lg text-rose-700 shrink-0 mt-0.5">
                <Calendar size={18} />
              </div>
              <div className="text-left">
                <p className="font-extrabold text-[11px] uppercase tracking-wider text-rose-800">
                  Studio Closed on This Date
                </p>
                <p className="text-sm font-bold text-rose-950 mt-0.5">
                  {selectedDateClosure.title || 'Studio Holiday'}
                </p>
                <p className="text-xs text-rose-700 mt-0.5">
                  {selectedDateClosure.reason || 'No bookings can be scheduled on this day. Please select another date.'}
                </p>
              </div>
            </div>
          )}

          {slotsLoading ? (
            <div className="flex justify-center py-12"><Loader2 className="animate-spin text-[#2563EB]" /></div>
          ) : (
            (() => {
              const rawSlots = (slotsData?.data || []).slice().sort((a: any, b: any) => a.start_time.localeCompare(b.start_time));
              // Service times are only a rough guide: the customer just picks a drop-off slot, the studio decides the real time.
              const requiredSlotCount = 1;

              if (rawSlots.length === 0) {
                return (
                  <div className="text-center py-12 bg-gray-50 rounded-xl border border-gray-100">
                    <Calendar size={36} className="text-gray-300 mx-auto mb-2" />
                    <p className="font-bold text-[#0F172A]">No slots scheduled for this date</p>
                    <p className="text-xs text-[#64748B] mt-1">Please pick another date or check back later.</p>
                  </div>
                );
              }

              return (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {rawSlots.map((slot: any, idx: number) => {
                    const isSelected = selectedSlot?.id === slot.id;
                    const isBlocked = !!slot.is_blocked;
                    let isFull = slot.booked_count >= slot.max_capacity;

                    // Filter out past slots for today
                    const isToday = selectedDate === todayStr;
                    if (isToday) {
                      const [hour, minute] = slot.start_time.split(':').map(Number);
                      const now = new Date();
                      if (hour < now.getHours() || (hour === now.getHours() && minute <= now.getMinutes())) {
                        isFull = true;
                      }
                    }

                    // Multi-hour consecutive slot validation
                    let hasConsecutive = true;
                    let durationErrorReason = '';
                    if (!isBlocked && !isFull && requiredSlotCount > 1) {
                      if (idx + requiredSlotCount > rawSlots.length) {
                        hasConsecutive = false;
                        durationErrorReason = `Exceeds studio closing hours (${requiredSlotCount}h needed)`;
                      } else {
                        for (let offset = 0; offset < requiredSlotCount; offset++) {
                          const checkSlot = rawSlots[idx + offset];
                          if (offset > 0) {
                            const prevSlot = rawSlots[idx + offset - 1];
                            if (checkSlot.start_time !== prevSlot.end_time) {
                              hasConsecutive = false;
                              durationErrorReason = `Gap in schedule (${requiredSlotCount} consecutive hrs needed)`;
                              break;
                            }
                          }
                          if (checkSlot.is_blocked) {
                            hasConsecutive = false;
                            durationErrorReason = `Next slot (${formatTime(checkSlot.start_time)}) is closed`;
                            break;
                          }
                          if (checkSlot.booked_count >= checkSlot.max_capacity) {
                            hasConsecutive = false;
                            durationErrorReason = `Next slot (${formatTime(checkSlot.start_time)}) is fully booked`;
                            break;
                          }
                        }
                      }
                    }

                    const isDisabled = isBlocked || isFull || !hasConsecutive;

                    return (
                      <button
                        key={slot.id}
                        disabled={isDisabled}
                        onClick={() => setSelectedSlot(slot)}
                        className={`p-3.5 rounded-xl text-left transition-all border-2 relative flex flex-col justify-between min-h-[76px] ${
                          isSelected
                            ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-md ring-2 ring-[#2563EB]/30'
                            : isBlocked
                            ? 'bg-rose-50/70 border-rose-200 text-rose-900 cursor-not-allowed opacity-90'
                            : isFull
                            ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed'
                            : !hasConsecutive
                            ? 'bg-amber-50/70 border-amber-200 text-amber-900 cursor-not-allowed opacity-90'
                            : 'bg-white border-gray-200 hover:border-[#2563EB] text-[#0F172A] hover:shadow-sm'
                        }`}
                      >
                        <div className="flex items-center justify-between w-full">
                          <p className={`text-sm font-extrabold ${isSelected ? 'text-white' : ''}`}>
                            {formatTime(slot.start_time)}
                            {requiredSlotCount > 1 && !isDisabled && (
                              <span className="font-normal text-xs ml-1 opacity-90">
                                – {formatTime(rawSlots[idx + requiredSlotCount - 1]?.end_time || slot.end_time)}
                              </span>
                            )}
                          </p>
                          {requiredSlotCount > 1 && !isDisabled && (
                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded ${
                              isSelected ? 'bg-white/20 text-white' : 'bg-blue-100 text-blue-700'
                            }`}>
                              {requiredSlotCount} hrs
                            </span>
                          )}
                        </div>

                        <p className={`text-[11px] mt-1 leading-tight ${
                          isSelected
                            ? 'text-white/90'
                            : isBlocked
                            ? 'text-rose-700 font-bold'
                            : isFull
                            ? 'text-gray-400 font-medium'
                            : !hasConsecutive
                            ? 'text-amber-800 font-medium'
                            : 'text-emerald-700 font-bold'
                        }`}>
                          {isBlocked
                            ? (slot.blocked_reason ? `Closed: ${slot.blocked_reason}` : 'Closed / Blocked')
                            : isFull
                            ? 'Fully Booked'
                            : !hasConsecutive
                            ? durationErrorReason
                            : `${slot.max_capacity - slot.booked_count} spots left`}
                        </p>
                      </button>
                    );
                  })}
                </div>
              );
            })()
          )}
        </div>
      )}

      {/* ═══ Step 3: Confirm ═══ */}
      {step === 3 && (
        <div className="bg-white rounded-lg p-6 shadow-sm">
          <p className="text-[10px] font-bold uppercase tracking-widest text-[#64748B] mb-4">Booking Summary</p>

          <div className="space-y-3 text-sm mb-6">
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Sparkles size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#64748B]">Service(s)</span>
              <span className="ml-auto font-bold text-[#0F172A] text-right ml-4">
                {isPackageBooking ? selectedPackageServiceNames.join(', ') : selectedServicesObjs.length > 0 ? selectedServicesObjs.map(s => s.name).join(', ') : (selectedPackageObj?.package_name || selectedPackageObj?.name)}
              </span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <img src={carImage({ brand, model, category: filter })} alt="" className="w-12 h-8 object-contain shrink-0 -ml-1" />
              <span className="text-[#64748B]">Vehicle</span>
              <span className="ml-auto font-bold text-[#0F172A]">{brand} {model} {regNo && `(${regNo})`}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Calendar size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#64748B]">Date</span>
              <span className="ml-auto font-bold text-[#0F172A]">{new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
            </div>
            <div className="flex items-center gap-3 py-2 border-b border-gray-50">
              <Clock size={16} className="text-[#2563EB] shrink-0" />
              <span className="text-[#64748B]">Time</span>
              <span className="ml-auto font-bold text-[#0F172A]">{formatTime(selectedSlot?.start_time)} – {formatTime(selectedSlot?.end_time)}</span>
            </div>
            {totalBookingDuration > 0 && (
              <div className="flex items-center gap-3 py-2 border-b border-gray-50">
                <Clock size={16} className="text-[#2563EB] shrink-0" />
                <span className="text-[#64748B]">Approx. time</span>
                <span className="ml-auto font-bold text-[#0F172A]">{formatDuration(totalBookingDuration)}</span>
              </div>
            )}
            {/* Payment: pay at the studio by UPI QR or cash */}
            {!isPackageBooking && !useFreeWash && (
              <div className="mt-4 mb-2 flex items-start gap-3 rounded-xl bg-emerald-50 border border-emerald-100 p-3 text-left">
                <QrCode size={18} className="text-emerald-600 shrink-0 mt-0.5" />
                <p className="text-xs text-emerald-800"><b>Pay at the studio</b> — scan our UPI QR or pay cash after your service. No advance needed.</p>
              </div>
            )}
            <div className="space-y-2 border-t border-gray-100 pt-4">
              {!isPackageBooking && (
                <>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                    <span className="text-[#64748B] font-normal">Original Total Price</span>
                    <span className="ml-auto">₹{estimatedTotal}</span>
                  </div>
                  {/* Offer code */}
                  <div className="py-2">
                    <div className="flex gap-2">
                      <input value={offerCode} onChange={e => { setOfferCode(e.target.value.toUpperCase()); setOfferErr(''); }} placeholder="Offer code (e.g. DIWALI30)"
                        className="flex-1 min-w-0 px-3 py-2.5 rounded-xl bg-[#F1F5F9] text-sm font-bold uppercase tracking-wide outline-none focus:ring-2 focus:ring-[#2563EB]/20" />
                      <button type="button" onClick={() => checkOffer()} className="px-4 rounded-xl bg-[#0F172A] text-white text-sm font-bold">Apply</button>
                    </div>
                    {offerErr && <p className="text-[11px] text-rose-600 font-semibold mt-1">{offerErr}</p>}
                    {offerInfo && !offerDiscount && <p className="text-[11px] text-slate-500 mt-1">Your first-wash discount is bigger, so we kept that.</p>}
                  </div>
                  {offerDiscount > 0 && (
                    <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-emerald-700 bg-emerald-50/70 px-2.5 rounded-lg">
                      <span className="flex items-center gap-1.5"><Sparkles size={14} className="text-amber-500" />{offerInfo?.label}</span>
                      <span className="ml-auto font-extrabold">-₹{offerDiscount}</span>
                    </div>
                  )}
                  {firstWashDiscountAmount > 0 && !offerDiscount && (
                    <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-blue-600 bg-blue-50/70 px-2.5 rounded-lg">
                      <span className="text-blue-700 font-bold flex items-center gap-1.5">
                        <Sparkles size={14} className="text-amber-500" />
                        First wash offer: 50% off {selectedServicesObjs.filter((sv: any) => /wash/i.test(sv.name)).map((sv: any) => sv.name).join(', ') || 'wash'}
                      </span>
                      <span className="ml-auto text-blue-700 font-extrabold">-₹{firstWashDiscountAmount}</span>
                    </div>
                  )}
                  {firstWashDiscountAmount > 0 && !offerDiscount && (
                    <p className="text-[11px] text-slate-500 px-1 pt-1">The 50% first-wash offer applies to the wash only. Other services are charged in full.</p>
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
                  <span className="text-[#64748B] font-normal">Pickup & Drop ({pickupOption})</span>
                  <span className="ml-auto text-gray-800">
                    {pickupCharge > 0 ? `₹${pickupCharge}` : 'Free (Waived)'}
                  </span>
                </div>
              )}
              <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                <span className="text-[#64748B] font-normal">Total Price</span>
                <span className="ml-auto">₹{finalTotal}</span>
              </div>
              {requiredAdvance > 0 && (
                <>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-base text-[#2563EB]">
                    <span className="text-[#64748B] font-normal text-sm">Advance Required</span>
                    <span className="ml-auto">₹{requiredAdvance}</span>
                  </div>
                  <div className="flex items-center gap-3 py-2 border-b border-gray-50 font-bold text-sm text-gray-700">
                    <span className="text-[#64748B] font-normal">Balance Due at Studio</span>
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
                <p className="text-[10px] text-purple-600 ml-[28px]">This uses 1 credit from your package now. If the booking is rejected or cancelled, the credit comes back.</p>
              </div>
            )}

            {/* Pickup & Drop Option Section */}
            <div className="mt-4 p-4 rounded-xl border border-gray-100 bg-gray-50/50 space-y-4">
              <div>
                <label className="block text-xs font-bold text-[#64748B] mb-1.5 uppercase tracking-wide">Pickup & Drop Option</label>
                <Dropdown
                  value={pickupOption}
                  onChange={(e) => setPickupOption(e.target.value as any)}
                  className="w-full px-3 py-2 bg-white border border-gray-300 rounded-lg text-sm font-bold text-[#0F172A] focus:ring-2 focus:ring-[#2563EB]/20 focus:border-[#2563EB]/30 transition-all cursor-pointer"
                >
                  <option value="none">None (No Pickup/Drop)</option>
                  <option value="pickup">Pickup Only</option>
                  <option value="drop">Drop Only</option>
                  <option value="both">Pickup + Drop</option>
                </Dropdown>
                <p className="text-[11px] text-[#64748B] mt-1">
                  {pickupOption === 'none' ? 'No extra charges apply.' :
                   activePackageHasFreePickup ? '🎉 Free Pickup & Drop under your active package!' :
                   pickupOption === 'pickup' ? `Pickup charge: ₹${settings.pickup_charge || 0}` :
                   pickupOption === 'drop' ? `Drop charge: ₹${settings.drop_charge || 0}` :
                   `Pickup + Drop charge: ₹${settings.pickup_drop_charge || 0}`}
                </p>
              </div>

              {pickupOption !== 'none' && (
                <div className="space-y-3 pt-2 border-t border-gray-200/50 animate-fade-in-up">
                  <GpsOffPrompt purpose="pickup" problem={gpsProblem} onClose={() => setGpsProblem(null)} onRetry={() => { setGpsProblem(null); detectPickup(); }} />
                  <button type="button" onClick={() => detectPickup()} disabled={locating}
                    className="w-full py-2.5 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 text-sm font-bold flex items-center justify-center gap-2 disabled:opacity-60">
                    {locating ? <Loader2 size={15} className="animate-spin" /> : <Crosshair size={15} />}
                    {locating ? 'Finding your location…' : pickupPin ? `Location pinned (±${pickupPin.accuracy} m) · Update` : 'Use my current location'}
                  </button>
                  {savedAddresses.length > 0 && (
                    <div>
                      <label className="block text-xs font-semibold text-gray-700 mb-1">Select Saved Address</label>
                      <Dropdown
                        value={selectedAddressId}
                        onChange={(e) => {
                          const val = e.target.value;
                          setSelectedAddressId(val === 'new' ? 'new' : parseInt(val));
                          if (val !== 'new') {
                            const addr = savedAddresses.find(a => a.id === parseInt(val));
                            if (addr) {
                              setPickupPin(addr.latitude && addr.longitude ? { lat: Number(addr.latitude), lng: Number(addr.longitude), accuracy: 0 } : null);
                              setPickupAddress(addr.address);
                              setLandmark(addr.landmark || '');
                              setCity(addr.city || '');
                              setStateName(addr.state || 'Gujarat');
                              setPincode(addr.pincode || '');
                            }
                          } else {
                            setPickupPin(null);
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
                      </Dropdown>
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

                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <label className="text-xs font-semibold text-gray-700">Exact pin for the driver *</label>
                      <button type="button" onClick={findOnMap} disabled={findingOnMap || !pickupAddress.trim()} className="text-xs font-bold text-blue-600 disabled:opacity-50">
                        {findingOnMap ? 'Finding…' : 'Find this address on map'}
                      </button>
                    </div>
                    {pickupPin ? (
                      <>
                        <PinPicker pin={pickupPin} onChange={p => { setPickupPin({ ...p, accuracy: 0 }); setPinConfirmed(true); }} />
                        <p className="text-[11px] text-gray-500">
                          Drag the pin or tap the map on your exact gate. The driver navigates to this pin.
                        </p>
                        {pinNeedsCheck && (
                          <div className="p-2.5 rounded-xl bg-amber-50 border border-amber-200 text-[12px] text-amber-900 space-y-2">
                            <p className="font-bold">Your device gave only a rough location (about {pickupPin.accuracy} m off).</p>
                            <p>Move the pin to your gate, or tap "Find this address on map".</p>
                            <button type="button" onClick={() => setPinConfirmed(true)} className="px-3 py-1.5 rounded-lg bg-amber-600 text-white font-bold">The pin is at my gate</button>
                          </div>
                        )}
                      </>
                    ) : (
                      <p className="text-[11px] text-gray-500">Use your current location or tap "Find this address on map", then drag the pin to your exact gate.</p>
                    )}
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
            disabled={(pickupOption !== 'none' && (!pickupAddress.trim() || !pickupPin || pinNeedsCheck)) || createMut.isPending || submittingOnline}
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
          title="Pay the advance"
          size="sm"
        >
          <div className="flex flex-col gap-3 py-2 text-center">
            <p className="text-sm text-gray-600 mb-2">
              An advance payment of <span className="font-extrabold text-[#2563EB]">₹{choiceBookingData.bookingData.advance_amount}</span> is required to reserve your slot.
            </p>
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
