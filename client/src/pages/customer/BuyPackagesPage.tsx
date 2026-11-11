import { ymd } from '../../utils/formatters';
import { useVehicleStore } from '../../store/vehicleStore';
import FitImg from '../../components/shared/FitImg';
import { useState, useEffect } from 'react';
import api from '../../api/axiosInstance';
import { useAuthStore } from '../../store/authStore';
import { useToastStore } from '../../store/toastStore';
import { PackageOpen, Car, CheckCircle, Loader2, ArrowRight, ShieldCheck, X, AlertCircle, Clock, XCircle, Check, Minus, FileSpreadsheet, FileDown, CreditCard, QrCode, Search, Sparkles, SlidersHorizontal } from 'lucide-react';
import QrPaymentModal from '../../components/shared/QrPaymentModal';
import ErrorState from '../../components/shared/ErrorState';
import { ServiceArt, ILLUSTRATIONS, PHOTOS, photoFor, pictureSrc } from '../../components/customer/serviceVisuals';
import { getCategoryForModel } from '../../utils/carData';
import { CAR_TYPES, carTypeLabel, normalizeCarType } from '../../utils/carTypes';
import { useLiveReload } from '../../utils/liveUpdates';
import Dropdown from '../../components/ui/Dropdown';

interface Vehicle {
  id: number;
  registration_no: string;
  brand: string;
  model: string;
  category: string | null;
}

interface PkgPricing {
  id: number;
  car_type: string;
  pricing_type: string;
  price: number;
}


interface PkgService {
  id: number;
  ps_id?: number;
  name: string;
  total_count: number;
}

interface Pkg {
  image_url?: string | null;
  id: number;
  name: string;
  description: string;
  wash_count: number;
  paid_wash_count?: number;
  price_hatchback: number;
  price_semi_sedan: number;
  price_sedan: number;
  price_premium_sedan: number;
  price_suv: number;
  price_premium_suv?: number;
  services?: PkgService[];
  pricing?: PkgPricing[];
}

// Package tier colors
const TIER_COLORS: Record<string, { gradient: string; border: string; badge: string; text: string }> = {
  bronze:   { gradient: 'from-amber-800 to-amber-950',  border: 'border-amber-400',  badge: 'bg-amber-100 text-amber-800',    text: 'text-amber-400' },
  silver:   { gradient: 'from-slate-500 to-slate-800',   border: 'border-slate-400',  badge: 'bg-slate-100 text-slate-700',    text: 'text-slate-300' },
  gold:     { gradient: 'from-yellow-600 to-yellow-900', border: 'border-yellow-500', badge: 'bg-yellow-100 text-yellow-800',  text: 'text-yellow-400' },
  diamond:  { gradient: 'from-sky-600 to-sky-900',       border: 'border-sky-400',    badge: 'bg-sky-100 text-sky-800',        text: 'text-sky-300' },
  platinum: { gradient: 'from-purple-700 to-purple-950', border: 'border-purple-400', badge: 'bg-purple-100 text-purple-800',  text: 'text-purple-300' },
};

const DEFAULT_TIER_COLOR = { gradient: 'from-gray-700 to-gray-900', border: 'border-blue-500', badge: 'bg-blue-100 text-blue-800', text: 'text-blue-400' };

function getTierKey(name: string): string {
  const lower = name.toLowerCase();
  for (const key of Object.keys(TIER_COLORS)) {
    if (lower.includes(key)) return key;
  }
  return '';
}


export default function BuyPackagesPage() {
  const { user } = useAuthStore();
  const { addToast } = useToastStore();
  const [vehicles, setVehicles] = useState<Vehicle[]>([]);
  const [selectedVehicle, setSelectedVehicle] = useState<Vehicle | null>(null);
  // car switched in the header while on this page
  const headerCarId = useVehicleStore(s => s.selectedId);
  useEffect(() => {
    const v = vehicles.find(x => x.id === headerCarId);
    if (v && v.id !== selectedVehicle?.id) setSelectedVehicle(v);
  }, [headerCarId]); // eslint-disable-line react-hooks/exhaustive-deps
  const [packages, setPackages] = useState<Pkg[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [submittingId, setSubmittingId] = useState<number | null>(null);
  const [pricingType, setPricingType] = useState<'basic' | 'premium'>('basic');
  // Confirmation modal state
  const [confirmPkg, setConfirmPkg] = useState<Pkg | null>(null);
  const [myRequests, setMyRequests] = useState<any[]>([]);
  const [exportingPdf, setExportingPdf] = useState(false);
  const [exportingExcel, setExportingExcel] = useState(false);
  
  // QR Payment states
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrAmount, setQrAmount] = useState(0);
  const [activePackageRequestId, setActivePackageRequestId] = useState<number | undefined>(undefined);

  // Car model auto-detect state

  const handleExport = async (format: 'pdf' | 'excel') => {
    if (format === 'pdf') setExportingPdf(true);
    else setExportingExcel(true);
    try {
      const response = await api.get(`/user-packages/export?format=${format}`, {
        responseType: 'blob',
      });
      const blob = new Blob([response.data], {
        type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      });
      const link = document.createElement('a');
      link.href = window.URL.createObjectURL(blob);
      link.download = `Package_History_${ymd()}.${format === 'pdf' ? 'pdf' : 'xlsx'}`;
      link.click();
      window.URL.revokeObjectURL(link.href);
      addToast('success', `Package history exported to ${format.toUpperCase()} successfully!`);
    } catch (err) {
      console.error(err);
      addToast('error', `Failed to export package history to ${format.toUpperCase()}.`);
    } finally {
      if (format === 'pdf') setExportingPdf(false);
      else setExportingExcel(false);
    }
  };

  const loadData = async () => {
    setError(null);
    setLoading(true);
    try {
      const [vehRes, pkgRes] = await Promise.all([
        api.get('/vehicles/my-vehicles'),
        api.get('/packages')
      ]);
      if (vehRes.data.success) {
        setVehicles(vehRes.data.data);
        if (vehRes.data.data.length > 0) {
          const current = useVehicleStore.getState().selectedId;
          setSelectedVehicle(vehRes.data.data.find((v: any) => v.id === current) || vehRes.data.data.find((v: any) => v.is_primary) || vehRes.data.data[0]);
        }
      }
      if (pkgRes.data.success) {
        setPackages(pkgRes.data.data);
      }
    } catch (err: any) {
      console.error(err);
      setError(err.response?.data?.error || 'Failed to load packages. Please check your connection.');
    } finally {
      setLoading(false);
    }
  };

  useLiveReload(() => { loadData(); }); // reload when anything changes elsewhere
  useEffect(() => {
    loadData();
    // Fetch customer's own package requests
    api.get('/packages/requests/my').then(res => {
      if (res.data.success) setMyRequests(res.data.data || []);
    }).catch(() => {});
  }, []);

  // prices always follow the selected car's own type
  const filterCarType: string = selectedVehicle
    ? (normalizeCarType(selectedVehicle.category) || getCategoryForModel(selectedVehicle.brand, selectedVehicle.model) || 'sedan')
    : 'sedan';

  // Price set by the studio for this car type (package price list first, then the package's own column)
  const getPrice = (pkg: Pkg) => {
    const row = (pkg.pricing || []).find(r => r.car_type === filterCarType && r.pricing_type === pricingType);
    if (row && Number(row.price) > 0) return Number(row.price);
    if (pricingType === 'premium') return 0;
    return Number((pkg as any)[`price_${filterCarType}`]) || 0;
  };
  const hasPremium = packages.some(p => (p.pricing || []).some(r => r.pricing_type === 'premium' && Number(r.price) > 0));

  // Step 1: User clicks "Request to Buy" → show confirmation modal
  const handleBuyClick = (pkg: Pkg) => {
    if (!selectedVehicle) {
      addToast('error', 'Please select a vehicle first.');
      return;
    }
    setConfirmPkg(pkg);
  };

  // Step 2: User confirms "Yes" → submit to admin
  const handleConfirmPurchase = async () => {
    if (!confirmPkg || !selectedVehicle) return;
    setSubmittingId(confirmPkg.id);
    try {
      const price = getPrice(confirmPkg);
      const res = await api.post('/packages/requests', {
        vehicle_id: selectedVehicle.id,
        package_id: confirmPkg.id,
        pricing_type: pricingType,
        car_type: filterCarType
      });
      if (res.data.success) {
        addToast('success', 'Package request submitted! Admin will review and approve it shortly.');
      }
    } catch (err: any) {
      addToast('error', err?.response?.data?.error || 'Could not send the package request. Please try again.');
    } finally {
      setSubmittingId(null);
      setConfirmPkg(null);
    }
  };

  const [submittingOnline, setSubmittingOnline] = useState(false);

  const handlePayQR = async () => {
    if (!confirmPkg || !selectedVehicle) return;
    setSubmittingOnline(true);
    try {
      const price = getPrice(confirmPkg);

      // 1. Submit the package request first to get requestId
      const resRequest = await api.post('/packages/requests', {
        vehicle_id: selectedVehicle.id,
        package_id: confirmPkg.id,
        pricing_type: pricingType,
        car_type: filterCarType
      });

      if (!resRequest.data.success) {
        throw new Error('Failed to submit package request');
      }

      const requestId = resRequest.data.requestId;
      setQrAmount(Number(resRequest.data.price) || price);
      setActivePackageRequestId(requestId);
      setShowQrModal(true);
      setConfirmPkg(null);
    } catch (err: any) {
      console.error(err);
      addToast('error', err?.response?.data?.error || err.message || 'An error occurred during payment checkout.');
    } finally {
      setSubmittingOnline(false);
    }
  };


  if (error) {
    return (
      <div className="pt-4">
        <ErrorState
          message={error}
          onRetry={loadData}
        />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="font-sans">
      {/* Header: showroom photo */}
      <div className="rise relative overflow-hidden rounded-3xl h-40 sm:h-48 mb-5 shadow-[0_10px_30px_rgba(11,31,77,0.16)]">
        <img src={PHOTOS.showroom} alt="" className="absolute inset-0 w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-[#0B1F4D]/90 via-[#0B1F4D]/60 to-transparent" />
        <div className="relative h-full flex flex-col justify-end p-5 text-white max-w-[78%]">
          <span className="inline-flex w-fit items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] bg-amber-400 text-slate-900 px-2 py-0.5 rounded"><PackageOpen className="w-3.5 h-3.5" /> Prepaid packages</span>
          <h1 className="text-[22px] sm:text-3xl font-black leading-tight mt-2">Annual car care, sorted</h1>
          <p className="text-xs sm:text-sm text-white/75 mt-1">Prices below are for your car.</p>
        </div>
      </div>

      {vehicles.length === 0 ? (
        <div className="text-center bg-white p-10 rounded-2xl shadow-sm border border-blue-100">
          <Car className="w-12 h-12 text-gray-300 mx-auto mb-4" />
          <h3 className="text-lg font-bold text-gray-900">No Vehicles Found</h3>
          <p className="text-gray-500 mt-2">You need to add a vehicle to your profile before purchasing packages.</p>
        </div>
      ) : (
        <div className="mb-10 max-w-xl mx-auto space-y-4">
          <div>
            <label className="block text-sm font-bold text-gray-700 mb-2">Select Saved Garage Vehicle</label>
            <Dropdown
              className="w-full bg-white border-2 border-blue-100 focus:border-blue-500 focus:ring-0 rounded-xl py-3 px-4 shadow-sm text-gray-900 font-medium transition-colors"
              value={selectedVehicle?.id || ''}
              onChange={(e) => {
                const v = vehicles.find(v => v.id === Number(e.target.value)) || null;
                setSelectedVehicle(v);
                if (v) useVehicleStore.getState().select(v.id);
              }}
            >
              {vehicles.map(v => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.registration_no || 'No Reg'}) - {carTypeLabel(v.category)}
                </option>
              ))}
            </Dropdown>
          </div>

          <div className="bg-white p-5 rounded-2xl border border-blue-100 shadow-sm space-y-4">
            <p className="text-sm text-slate-600">
              Prices for your <b className="text-slate-900">{selectedVehicle?.brand} {selectedVehicle?.model}</b> · <span className="font-bold text-[#2563EB]">{carTypeLabel(filterCarType)}</span>
            </p>

            {/* Basic / Premium Toggle */}
            {hasPremium && <div className="flex items-center justify-center gap-3 pt-3 border-t border-gray-100">
              <span className={`text-xs font-bold uppercase tracking-wider ${pricingType === 'basic' ? 'text-blue-600' : 'text-gray-400'}`}>Basic</span>
              <button
                onClick={() => setPricingType(pricingType === 'basic' ? 'premium' : 'basic')}
                className={`relative w-14 h-7 rounded-full transition-colors ${pricingType === 'premium' ? 'bg-purple-600' : 'bg-gray-300'}`}
              >
                <div className={`absolute top-0.5 left-0.5 w-6 h-6 bg-white rounded-full shadow transition-transform ${pricingType === 'premium' ? 'translate-x-7' : ''}`} />
              </button>
              <span className={`text-xs font-bold uppercase tracking-wider ${pricingType === 'premium' ? 'text-purple-600' : 'text-gray-400'}`}>Premium</span>
            </div>}
            {hasPremium && <p className="text-center text-[10px] text-gray-400">Premium includes additional interior care & product upgrades</p>}
          </div>
        </div>
      )}

      {/* ─── Package Cards Grid ─────────────────────── */}
      {selectedVehicle && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {packages.map(pkg => {
            const price = getPrice(pkg);
            const isSubmitting = submittingId === pkg.id;
            const tierKey = getTierKey(pkg.name);
            const colors = TIER_COLORS[tierKey] || DEFAULT_TIER_COLOR;

            const mapServices = (pkg.services && pkg.services.length > 0)
              ? pkg.services.map((s: any) => ({ service_name: s.name, count: s.total_count || 1 }))
              : [];

            return (
              <div
                key={pkg.id}
                className={`bg-white rounded-2xl shadow-[0_4px_24px_-4px_rgba(0,0,0,0.12)] overflow-hidden flex flex-col transition-all hover:-translate-y-1 hover:shadow-[0_8px_30px_-4px_rgba(0,0,0,0.18)] duration-300`}
              >
                {/* ─── Package Header: studio photo, O3 blue overlay, tier badge ─── */}
                <div className="relative aspect-video overflow-hidden">
                  <FitImg src={pkg.image_url && !/illustrations\//.test(pkg.image_url) ? pictureSrc(pkg.image_url) : [PHOTOS.showroom, PHOTOS.studio, PHOTOS.beading, PHOTOS.coating, PHOTOS.glass][pkg.id % 5]}
                    className="absolute inset-0 h-full" />
                  <div className="absolute inset-0 bg-gradient-to-t from-[#0B1F4D]/90 via-[#0B1F4D]/20 to-transparent" />
                  <span className={`absolute top-3 left-3 text-[10px] font-black uppercase tracking-wider px-2 py-0.5 rounded ${colors.badge}`}>{tierKey !== 'default' ? tierKey : 'Package'}</span>
                  <div className="absolute bottom-3 left-4 right-4 text-white text-left">
                    <h3 className="text-xl font-black leading-tight">{pkg.name.replace(/ Package$/i, '')}</h3>
                    <p className="text-[11px] font-semibold text-white/75">Prepaid package · valid 12 months</p>
                  </div>
                </div>

                {/* ─── Services ─── */}
                <div className="p-4 flex-1 flex flex-col">
                  
                  {/* Included Services */}
                  <p className="text-[9px] font-extrabold uppercase tracking-[0.15em] text-gray-400 mb-2 text-center">
                    Included Services
                  </p>
                  <div className="space-y-2 flex-1">
                    {mapServices && mapServices.length > 0 ? (
                      mapServices.map((s: any, idx: number) => (
                        <div key={(s.service_name || s.name) + idx} className="flex items-center gap-2">
                          <div className="w-5 h-5 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                            <Check className="w-3 h-3 text-green-600" strokeWidth={3} />
                          </div>
                          <span className="text-xs text-gray-800 font-bold">
                            {s.count || s.total_count} {s.service_name || s.name}
                          </span>
                        </div>
                      ))
                    ) : (
                      <p className="text-xs text-gray-400 italic text-center py-4">No services specified</p>
                    )}
                  </div>

                  {/* ─── Price ─── */}
                  {price > 0 && (
                    <div className="text-center mt-4 pt-3 border-t border-gray-100">
                      <span className="text-2xl font-extrabold text-gray-900">₹{price.toLocaleString('en-IN')}</span>
                    </div>
                  )}

                  {/* ─── Buy Button ─── */}
                  <button
                    onClick={() => handleBuyClick(pkg)}
                    disabled={isSubmitting}
                    className="w-full mt-4 py-3 px-4 rounded-xl font-bold text-sm text-white bg-blue-600 hover:bg-blue-700 shadow-md hover:shadow-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-all flex items-center justify-center gap-2 disabled:opacity-70 disabled:cursor-not-allowed"
                  >
                    {isSubmitting ? (
                      <Loader2 className="w-5 h-5 animate-spin" />
                    ) : (
                      <>
                        Request to Buy <ArrowRight className="w-4 h-4" />
                      </>
                    )}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── My Package Requests ─────────────────────── */}
      {myRequests.length > 0 && (() => {
        // Find the most recent approved request (active package)
        const approvedRequests = myRequests
          .filter((r: any) => r.status === 'approved')
          .sort((a: any, b: any) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        
        const activeRequest = approvedRequests.length > 0 ? approvedRequests[0] : null;
        const pastRequests = myRequests.filter((r: any) => r.id !== activeRequest?.id);

        const renderRequestCard = (req: any, isActive: boolean) => {
          const statusConfig: Record<string, { bg: string; text: string; icon: any; label: string }> = {
            pending:  { bg: 'bg-amber-50 border-amber-200', text: 'text-amber-700', icon: Clock, label: 'Pending Approval' },
            approved: { bg: 'bg-green-50 border-green-200', text: 'text-green-700', icon: CheckCircle, label: 'Approved' },
            rejected: { bg: 'bg-blue-50 border-blue-200', text: 'text-blue-700', icon: XCircle, label: 'Rejected' },
          };
          const cfg = statusConfig[req.status] || statusConfig.pending;
          const StatusIcon = cfg.icon;
          return (
            <div key={req.id} className={`px-5 py-4 flex items-start gap-4 ${isActive ? '' : 'opacity-60'}`}>
              <div className={`p-2 rounded-xl ${isActive ? 'bg-emerald-50 border-emerald-300' : cfg.bg} border flex-shrink-0 mt-0.5`}>
                <StatusIcon size={18} className={isActive ? 'text-emerald-600' : cfg.text} />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between mb-1">
                  <h4 className={`font-bold text-sm ${isActive ? 'text-gray-900' : 'text-gray-500'}`}>{req.package_name}</h4>
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full border ${isActive ? 'bg-emerald-50 border-emerald-300 text-emerald-700' : req.status === 'approved' ? 'bg-gray-100 border-gray-200 text-gray-500' : `${cfg.bg} ${cfg.text}`}`}>
                    {isActive ? '✦ Active' : req.status === 'approved' ? 'Past' : cfg.label}
                  </span>
                </div>
                <p className={`text-xs ${isActive ? 'text-gray-500' : 'text-gray-400'}`}>
                  {req.brand} {req.model} ({req.registration_no}) • ₹{req.price}
                </p>
                <p className="text-[10px] text-gray-400 mt-0.5">
                  Requested: {new Date(req.created_at).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                </p>
                {req.status === 'rejected' && req.rejection_reason && (
                  <div className="mt-2 flex items-start gap-2 bg-blue-50 rounded-lg p-2.5 border border-blue-100">
                    <AlertCircle size={14} className="text-blue-500 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-blue-700">
                      <span className="font-bold">Reason: </span>{req.rejection_reason}
                    </p>
                  </div>
                )}
              </div>
            </div>
          );
        };

        return (
          <div className="mt-12 max-w-4xl mx-auto space-y-6">
            {/* Header with Export Buttons */}
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-gray-100 pb-4">
              <div>
                <h2 className="text-xl font-bold text-gray-900 flex items-center gap-2">
                  <PackageOpen className="w-5 h-5 text-blue-600" />
                  My Package History & Requests
                </h2>
                <p className="text-xs text-gray-500 mt-1">Track your active packages, purchase requests, and download statements.</p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleExport('excel')}
                  disabled={exportingExcel}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all disabled:opacity-50"
                >
                  {exportingExcel ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileSpreadsheet className="w-3.5 h-3.5" />}
                  Export Excel
                </button>
                <button
                  onClick={() => handleExport('pdf')}
                  disabled={exportingPdf}
                  className="flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold text-blue-700 bg-blue-50 hover:bg-blue-100 border border-blue-200 transition-all disabled:opacity-50"
                >
                  {exportingPdf ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <FileDown className="w-3.5 h-3.5" />}
                  Export PDF
                </button>
              </div>
            </div>

            {/* Active Package */}
            {activeRequest && (
              <div>
                <h2 className="text-xl font-bold text-gray-900 mb-4 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-emerald-500" />
                  Active Package
                </h2>
                <div className="bg-white rounded-2xl shadow-sm border-2 border-emerald-200 overflow-hidden ring-1 ring-emerald-100">
                  {renderRequestCard(activeRequest, true)}
                </div>
              </div>
            )}

            {/* Past Packages */}
            {pastRequests.length > 0 && (
              <div>
                <h2 className="text-lg font-bold text-gray-500 mb-3 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-gray-400" />
                  Past Packages
                </h2>
                <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden divide-y divide-gray-50">
                  {pastRequests.map((req: any) => renderRequestCard(req, false))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* ─── Confirmation Modal ─────────────────────── */}
      {confirmPkg && selectedVehicle && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Header */}
            <div className="bg-gradient-to-r from-blue-600 to-blue-700 px-6 py-4 flex items-center justify-between">
              <h3 className="text-white font-bold text-lg flex items-center gap-2">
                <ShieldCheck size={20} />
                Confirm Purchase Request
              </h3>
              <button
                onClick={() => setConfirmPkg(null)}
                className="text-white/80 hover:text-white transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {/* Body */}
            <div className="p-6">
              <p className="text-gray-600 text-sm mb-5">
                You are requesting to purchase the following package. An admin will review and approve your request.
              </p>

              <div className="bg-gray-50 rounded-xl p-4 space-y-3 mb-5">
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Package</span>
                  <span className="font-bold text-gray-900">{confirmPkg.name}</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Tier</span>
                  <span className={`px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wider rounded-full ${pricingType === 'premium' ? 'bg-purple-100 text-purple-700' : 'bg-gray-200 text-gray-600'}`}>{pricingType}</span>
                </div>

                {/* Show services included */}
                {confirmPkg.services && confirmPkg.services.length > 0 && (
                  <div className="border-t border-gray-200 pt-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-gray-400 mb-2">Included Services</p>
                    <div className="space-y-1.5">
                      {confirmPkg.services.map((svc: any) => (
                        <div key={svc.id || svc.ps_id || svc.name} className="flex items-center gap-2 text-xs">
                          <Check className="w-3.5 h-3.5 text-emerald-500 flex-shrink-0" />
                          <span className="text-gray-800 font-bold">{svc.total_count || (svc.paid || 0) + (svc.complimentary || 0) || 1} {svc.name}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Vehicle</span>
                  <span className="font-semibold text-gray-900">
                    {selectedVehicle.brand} {selectedVehicle.model}
                  </span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">Reg No</span>
                  <span className="font-medium text-gray-700">{selectedVehicle.registration_no || '—'}</span>
                </div>
                <div className="border-t border-gray-200 pt-3 flex justify-between">
                  <span className="text-gray-500 text-sm">Price</span>
                  <span className="text-xl font-extrabold text-blue-600">
                    ₹{getPrice(confirmPkg).toLocaleString('en-IN')}
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-2">

                <button
                  onClick={handleConfirmPurchase}
                  disabled={submittingId !== null || submittingOnline}
                  className="w-full py-3 px-4 bg-slate-800 text-white rounded-xl font-bold text-sm hover:bg-slate-900 shadow-md hover:shadow-lg transition-all flex items-center justify-center gap-2 disabled:opacity-75"
                >
                  {submittingId === confirmPkg.id ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <CheckCircle size={16} />
                      Request package — pay at studio
                    </>
                  )}
                </button>

                <button
                  onClick={() => setConfirmPkg(null)}
                  disabled={submittingId !== null || submittingOnline}
                  className="w-full py-2.5 bg-slate-100 text-slate-700 rounded-xl font-semibold text-sm hover:bg-slate-200 transition-all disabled:opacity-50"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {showQrModal && (
        <QrPaymentModal
          open={showQrModal}
          onClose={() => {
            setShowQrModal(false);
            // Refresh list to show pending request
            api.get('/packages/requests/my').then(res => {
              if (res.data.success) setMyRequests(res.data.data || []);
            }).catch(() => {});
          }}
          amount={qrAmount}
          packageRequestId={activePackageRequestId}
          onSuccess={() => {
            setShowQrModal(false);
            addToast('success', 'Your QR Payment confirmation request has been submitted for admin verification.');
            window.location.reload();
          }}
        />
      )}
    </div>
  );
}
