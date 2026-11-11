import { ymd, dateOnly } from '../../utils/formatters';
import { normalizeCarType } from '../../utils/carTypes';
import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../api/axiosInstance';
import { UserCircle, Car, ArrowLeft, Loader2, Send, History, Calendar, ClipboardList, Package, Clock, RefreshCw, Download, Plus, Trash2, Tag, Award, Save, Wrench, CheckCircle } from 'lucide-react';
import Modal from '../../components/ui/Modal';
import Input from '../../components/ui/Input';
import Select from '../../components/ui/Select';
import Button from '../../components/ui/Button';
import PackageRenewModal from '../../components/shared/PackageRenewModal';
import { useAuthStore } from '../../store/authStore';
import { useLiveReload } from '../../utils/liveUpdates';
import { can } from '../../utils/access';
import Dropdown from '../../components/ui/Dropdown';

export default function CustomerDetailPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [data, setData] = useState<any>(null);
  const [activePackage, setActivePackage] = useState<any>(null);
  const [packageHistory, setPackageHistory] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newNote, setNewNote] = useState('');
  const [submittingNote, setSubmittingNote] = useState(false);

  // Customer CRM Discount & Settings
  const [customDiscountType, setCustomDiscountType] = useState<'none' | 'percentage' | 'fixed'>('none');
  const [customDiscountValue, setCustomDiscountValue] = useState<number>(0);
  const [crmNotes, setCrmNotes] = useState<string>('');
  const [savingCrm, setSavingCrm] = useState(false);

  // Assign package state
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [packages, setPackages] = useState<any[]>([]);
  const [selectedPackageId, setSelectedPackageId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [pricePaid, setPricePaid] = useState('');
  const [packageServices, setPackageServices] = useState<any[]>([]);
  const [durationMonths, setDurationMonths] = useState('12');
  const [assigning, setAssigning] = useState(false);

  // Package renewal states
  const [renewModalOpen, setRenewModalOpen] = useState(false);
  const [renewTargetPackage, setRenewTargetPackage] = useState<any>(null);
  const [renewalsHistory, setRenewalsHistory] = useState<any[]>([]);

  // Adjust credits states
  const [adjustModalOpen, setAdjustModalOpen] = useState(false);
  const [adjustService, setAdjustService] = useState('');
  const [adjustNewCount, setAdjustNewCount] = useState(0);
  const [adjustTotalCount, setAdjustTotalCount] = useState(0);
  const [adjusting, setAdjusting] = useState(false);

  const handleAdjustCreditsSubmit = async () => {
    if (!adjustService) {
      alert('Please select a service.');
      return;
    }
    setAdjusting(true);
    try {
      const res = await api.patch(`/user-packages/${activePackage.id}/adjust-credits`, {
        service_name: adjustService,
        new_used_count: Number(adjustNewCount)
      });
      if (res.data.success) {
        alert('Credits adjusted successfully!');
        setAdjustModalOpen(false);
        setAdjustService('');
        setAdjustNewCount(0);
        fetchDetail();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to adjust credits');
    } finally {
      setAdjusting(false);
    }
  };

  // Custom package states
  const [customAssignModalOpen, setCustomAssignModalOpen] = useState(false);
  const [customPackageName, setCustomPackageName] = useState('');
  const [customPricePaid, setCustomPricePaid] = useState('');
  const [customDurationMonths, setCustomDurationMonths] = useState('12');
  const [customVehicleId, setCustomVehicleId] = useState('');
  const [customServices, setCustomServices] = useState<{ service_id: number; total_count: number }[]>([]);
  const [allServicesList, setAllServicesList] = useState<any[]>([]);
  const [customAssigning, setCustomAssigning] = useState(false);

  useEffect(() => {
    if (customAssignModalOpen) {
      api.get('/services').then(res => {
        if (res.data.success) {
          setAllServicesList(res.data.data);
        }
      }).catch(console.error);
    }
  }, [customAssignModalOpen]);

  const handleCustomAssignSubmit = async () => {
    if (!customPackageName || !customVehicleId || !customServices.length) {
      alert('Please fill in name, select a vehicle, and add at least one service.');
      return;
    }
    setCustomAssigning(true);
    try {
      const res = await api.post('/packages/custom-assign', {
        user_id: Number(id),
        vehicle_id: Number(customVehicleId),
        name: customPackageName,
        price_paid: Number(customPricePaid) || 0,
        duration_months: Number(customDurationMonths) || 12,
        services: customServices
      });
      if (res.data.success) {
        alert('Custom package assigned successfully!');
        setCustomAssignModalOpen(false);
        setCustomPackageName('');
        setCustomPricePaid('');
        setCustomDurationMonths('12');
        setCustomVehicleId('');
        setCustomServices([]);
        fetchDetail();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to assign custom package');
    } finally {
      setCustomAssigning(false);
    }
  };

  const handleExportPackageHistory = async (format: 'pdf' | 'xlsx') => {
    try {
      const res = await api.get(`/customers/${id}/package-history/export`, {
        params: { format },
        responseType: 'blob'
      });
      const file = new Blob([res.data], { type: format === 'pdf' ? 'application/pdf' : 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
      const fileURL = URL.createObjectURL(file);
      const fileLink = document.createElement('a');
      fileLink.href = fileURL;
      fileLink.setAttribute('download', `PackageHistory_${data?.name?.replace(/\s+/g, '_') || 'Customer'}.${format === 'pdf' ? 'pdf' : 'xlsx'}`);
      document.body.appendChild(fileLink);
      fileLink.click();
      document.body.removeChild(fileLink);
      URL.revokeObjectURL(fileURL);
    } catch (err) {
      console.error(err);
      alert('Failed to export package history');
    }
  };

  useLiveReload(() => { fetchDetail(); }); // reload when anything changes elsewhere

  // Fetch all packages when modal opens
  useEffect(() => {
    if (assignModalOpen) {
      const fetchPackages = async () => {
        try {
          const res = await api.get('/packages');
          if (res.data.success) {
            setPackages(res.data.data);
          }
        } catch (err) {
          console.error(err);
        }
      };
      fetchPackages();
    }
  }, [assignModalOpen]);

  // Fetch services when selected package changes
  useEffect(() => {
    if (!selectedPackageId) {
      setPackageServices([]);
      return;
    }
    const loadServices = async () => {
      try {
        const res = await api.get(`/packages/${selectedPackageId}/services`);
        if (res.data.success) {
          const mapped = res.data.data.map((s: any) => ({
            service_name: s.name,
            total_count: s.total_count || 1,
            paid: s.paid || 0,
            complimentary: s.complimentary || 0,
            remaining: s.total_count || 1
          }));
          setPackageServices(mapped);
        }
      } catch (err) {
        console.error(err);
      }
    };
    loadServices();
  }, [selectedPackageId]);

  // Auto-fill price based on package and selected vehicle category
  useEffect(() => {
    if (!selectedPackageId || !selectedVehicleId) return;
    const pkg = packages.find(p => p.id.toString() === selectedPackageId);
    const vehicle = data?.vehicles?.find((v: any) => v.id.toString() === selectedVehicleId);
    if (pkg && vehicle) {
      const priceKey = `price_${normalizeCarType(vehicle.category) || 'sedan'}`;
      
      setPricePaid(pkg[priceKey] || pkg.price_sedan || '0');
    }
  }, [selectedPackageId, selectedVehicleId, packages, data]);

  const handleAssignPackageSubmit = async () => {
    if (!selectedPackageId || !selectedVehicleId) {
      alert('Please select both a package and a vehicle.');
      return;
    }
    setAssigning(true);
    try {
      const vehicle = data.vehicles.find((v: any) => v.id.toString() === selectedVehicleId);
      const payload = {
        user_id: Number(id),
        package_id: Number(selectedPackageId),
        vehicle_id: Number(selectedVehicleId),
        vehicle_segment: vehicle?.category || 'sedan',
        price_paid: Number(pricePaid) || 0,
        duration_months: Number(durationMonths) || 12,
        package_custom_services: packageServices
      };
      const res = await api.post('/packages/assign', payload);
      if (res.data.success) {
        alert('Package assigned successfully!');
        setAssignModalOpen(false);
        setSelectedPackageId('');
        setSelectedVehicleId('');
        setPricePaid('');
        setDurationMonths('12');
        setPackageServices([]);
        fetchDetail();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to assign package');
    } finally {
      setAssigning(false);
    }
  };

  useEffect(() => {
    fetchDetail();
  }, [id]);

  const fetchDetail = async () => {
    try {
      // packages are shown only to people allowed to see them (no needless "no permission" calls)
      const seesPackages = can(useAuthStore.getState().user, 'packages', 'view');
      const none = (data: any) => Promise.resolve({ data: { success: false, data } });
      const [resCust, resPkg, resPkgHistory, resRenewals] = await Promise.all([
        api.get(`/customers/${id}`),
        seesPackages ? api.get(`/user-packages/active?user_id=${id}`).catch(() => ({ data: { success: false, data: null } })) : none(null),
        seesPackages ? api.get(`/user-packages/history?user_id=${id}`).catch(() => ({ data: { success: false, data: [] } })) : none([]),
        seesPackages ? api.get(`/user-packages/renewals?user_id=${id}`).catch(() => ({ data: { success: false, data: [] } })) : none([]),
      ]);
      if (resCust.data.success) {
        setData(resCust.data.data);
        setCustomDiscountType(resCust.data.data.custom_discount_type || 'none');
        setCustomDiscountValue(Number(resCust.data.data.custom_discount_value) || 0);
        setCrmNotes(resCust.data.data.crm_notes || '');
      }
      if (resPkg.data && resPkg.data.success && resPkg.data.data) {
        setActivePackage(resPkg.data.data);
      } else {
        setActivePackage(null);
      }
      // Package history — filter out the active one
      const allPkgs = resPkgHistory.data?.data || [];
      const activePkgId = resPkg.data?.data?.id;
      setPackageHistory(allPkgs.filter((p: any) => p.id !== activePkgId));
      setRenewalsHistory(resRenewals.data?.data || []);
    } catch (err) {
      console.error(err);
      alert('Failed to load customer details.');
      navigate('/admin/customers');
    } finally {
      setLoading(false);
    }
  };

  const handleSaveCrmSettings = async () => {
    setSavingCrm(true);
    try {
      const res = await api.put(`/customers/${id}`, {
        custom_discount_type: customDiscountType,
        custom_discount_value: customDiscountValue,
        crm_notes: crmNotes,
      });
      if (res.data.success) {
        alert('CRM discount & profile settings saved successfully!');
        fetchDetail();
      }
    } catch (err: any) {
      console.error(err);
      alert(err.response?.data?.error || 'Failed to update CRM settings');
    } finally {
      setSavingCrm(false);
    }
  };

  const handleAddNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newNote.trim()) return;
    setSubmittingNote(true);
    try {
      const res = await api.post(`/customers/${id}/notes`, { note: newNote });
      if (res.data.success) {
        setData((prev: any) => ({
          ...prev,
          notes: [res.data.data, ...prev.notes]
        }));
        setNewNote('');
      }
    } catch (err) {
      console.error(err);
      alert('Failed to add note');
    } finally {
      setSubmittingNote(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!data) return null;

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl mx-auto">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center mb-6 gap-3">
        <button 
          onClick={() => navigate('/admin/customers')}
          className="flex items-center gap-2 text-gray-500 hover:text-gray-900 font-medium transition-colors"
        >
          <ArrowLeft className="w-4 h-4" /> Back to Customers
        </button>
        <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => handleExportPackageHistory('pdf')}
            className="px-3 py-2 border border-blue-200 text-blue-700 hover:bg-blue-50 text-xs font-bold rounded-xl transition flex items-center gap-1 shadow-sm"
          >
            <Download size={13} /> Export PDF
          </button>
          <button
            onClick={() => handleExportPackageHistory('xlsx')}
            className="px-3 py-2 border border-emerald-200 text-emerald-700 hover:bg-emerald-50 text-xs font-bold rounded-xl transition flex items-center gap-1 shadow-sm"
          >
            <Download size={13} /> Export Excel
          </button>
          <button
            onClick={() => setCustomAssignModalOpen(true)}
            className="px-3 py-2 bg-gradient-to-r from-purple-600 to-purple-800 text-white text-xs font-bold rounded-xl hover:from-purple-700 hover:to-purple-900 transition flex items-center gap-1.5 shadow-md shadow-purple-500/25"
          >
            <Plus size={14} />
            <span className="hidden sm:inline">Assign</span> Custom Package
          </button>
          <button
            onClick={() => setAssignModalOpen(true)}
            className="px-3 py-2 bg-gradient-to-r from-blue-600 to-blue-800 text-white text-xs font-bold rounded-xl hover:from-blue-700 hover:to-blue-900 transition flex items-center gap-1.5 shadow-md shadow-blue-500/25"
          >
            <Package size={14} />
            Assign Package
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Details & Vehicles */}
        <div className="lg:col-span-1 space-y-6">
          {/* Profile Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="bg-gradient-to-r from-blue-600 to-blue-800 h-24"></div>
            <div className="px-6 pb-6 relative">
              <div className="absolute -top-10 bg-white p-1.5 rounded-full shadow-md">
                <UserCircle className="w-16 h-16 text-gray-300 bg-white rounded-full" />
              </div>
              <div className="pt-10">
                <h2 className="text-xl font-bold text-gray-900">{data.name}</h2>
                <p className="text-sm text-gray-500 mb-4">Customer ID: CUST-{data.id}</p>
                
                <div className="space-y-3 text-sm">
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500">Mobile</span>
                    <span className="font-medium text-gray-900">{data.mobile || '—'}</span>
                  </div>
                  <div className="flex justify-between border-b border-gray-50 pb-2">
                    <span className="text-gray-500">Email</span>
                    <span className="font-medium text-gray-900">{data.email || '—'}</span>
                  </div>
                  <div className="flex justify-between pb-2">
                    <span className="text-gray-500">Joined</span>
                    <span className="font-medium text-gray-900">
                      {new Date(data.created_at).toLocaleDateString('en-IN')}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Customer CRM Profile & Custom Discount Card */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6 space-y-4">
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-sm font-bold text-gray-900 flex items-center gap-2">
                <Tag className="w-4 h-4 text-amber-600" />
                CRM Discount & Loyalty
              </h3>
              <span className="text-[10px] font-extrabold uppercase px-2 py-0.5 bg-amber-100 text-amber-800 rounded">
                Auto-Billing
              </span>
            </div>

            {/* Loyalty summary */}
            <div className="grid grid-cols-2 gap-2 bg-gradient-to-r from-amber-50 to-orange-50 p-3 rounded-xl border border-amber-200/60">
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Loyalty Points</span>
                <span className="text-base font-black text-amber-950">
                  {data.loyalty?.points || 0} pts
                </span>
              </div>
              <div>
                <span className="text-[10px] font-bold text-amber-800 uppercase block">Wash Credits</span>
                <span className="text-base font-black text-amber-950">
                  {data.loyalty?.credits || 0}
                </span>
              </div>
            </div>

            {/* Custom discount setting */}
            <div className="space-y-3 pt-1">
              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Customer Default Discount</label>
                <div className="grid grid-cols-3 gap-2">
                  {(['none', 'percentage', 'fixed'] as const).map(type => (
                    <button
                      key={type}
                      type="button"
                      onClick={() => setCustomDiscountType(type)}
                      className={`py-1.5 text-xs font-bold rounded-lg border transition-all uppercase ${
                        customDiscountType === type
                          ? 'bg-amber-500 text-white border-amber-600 shadow-xs'
                          : 'bg-gray-50 text-gray-600 border-gray-200 hover:bg-gray-100'
                      }`}
                    >
                      {type === 'none' ? 'None' : type === 'percentage' ? '% Off' : '₹ Flat'}
                    </button>
                  ))}
                </div>
              </div>

              {customDiscountType !== 'none' && (
                <div>
                  <label className="block text-xs font-bold text-gray-600 mb-1">
                    {customDiscountType === 'percentage' ? 'Discount Percentage (%)' : 'Discount Amount (₹)'}
                  </label>
                  <input
                    type="number"
                    min="0"
                    max={customDiscountType === 'percentage' ? '100' : undefined}
                    value={customDiscountValue}
                    onChange={e => setCustomDiscountValue(parseFloat(e.target.value) || 0)}
                    className="w-full px-3 py-2 text-sm border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 font-bold"
                  />
                  <p className="text-[10px] text-gray-500 mt-1">
                    * Automatically pre-fills on new job cards & quick billing for {data.name}.
                  </p>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-gray-600 mb-1">Internal CRM Special Instructions</label>
                <textarea
                  value={crmNotes}
                  onChange={e => setCrmNotes(e.target.value)}
                  placeholder="e.g. VIP client, prefers Sunil technician, allergic to strong scent..."
                  rows={2}
                  className="w-full px-3 py-2 text-xs border border-gray-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 resize-none"
                />
              </div>

              <button
                type="button"
                onClick={handleSaveCrmSettings}
                disabled={savingCrm}
                className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition flex items-center justify-center gap-1.5 shadow-sm"
              >
                {savingCrm ? <Loader2 size={13} className="animate-spin" /> : <Save size={13} />}
                <span>Save CRM & Discount Settings</span>
              </button>
            </div>
          </div>

          {/* Active Package */}
          {activePackage ? (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between mb-4 gap-2">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <Package className="w-5 h-5 text-purple-600" />
                  Active Package
                </h3>
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => {
                      if (activePackage.usage && activePackage.usage.length > 0) {
                        const firstSvc = activePackage.usage[0];
                        setAdjustService(firstSvc.service_name);
                        setAdjustNewCount(firstSvc.used_count);
                        setAdjustTotalCount(firstSvc.total_count);
                      }
                      setAdjustModalOpen(true);
                    }}
                    className="text-xs font-bold bg-purple-600 hover:bg-purple-700 text-white px-3 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    Adjust Credits
                  </button>
                  <button
                    onClick={() => {
                      setRenewTargetPackage({
                        id: activePackage.id,
                        package_name: activePackage.package_name,
                        customer_name: data.name,
                        customer_id: data.id,
                        package_id: activePackage.package_id,
                        expiry_date: activePackage.end_date,
                        package_status: activePackage.package_status || 'active'
                      });
                      setRenewModalOpen(true);
                    }}
                    className="text-xs font-bold bg-[#2563EB] hover:bg-[#1E40AF] text-white px-3 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw size={14} />
                    Renew Package
                  </button>
                </div>
              </div>
              <div className="p-4 bg-purple-50 border border-purple-100 rounded-xl relative">
                <div className="font-bold text-gray-900">{activePackage.package_name}</div>
                {activePackage.start_date && activePackage.end_date && (
                  <div className="text-xs text-gray-500 mt-2 space-y-1">
                    <div className="flex justify-between">
                      <span>Purchased On:</span>
                      <span className="font-medium text-gray-900">{new Date(activePackage.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                    <div className="flex justify-between">
                      <span>Valid Till:</span>
                      <span className="font-medium text-gray-900">{new Date(activePackage.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                    </div>
                  </div>
                )}
                {activePackage.usage && activePackage.usage.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-purple-200/50 space-y-1.5">
                    {activePackage.usage.map((u: any) => (
                      <div key={u.service_name} className="flex justify-between text-xs">
                        <span className="text-gray-700 font-semibold">{u.service_name}</span>
                        <span className={`font-bold ${u.remaining > 0 ? 'text-emerald-600' : 'text-blue-500'}`}>
                          {u.remaining} left
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          ) : (
            packageHistory.length > 0 && (
              <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                      <Package className="w-5 h-5 text-gray-400" />
                      No Active Package
                    </h3>
                    <p className="text-xs text-gray-500 mt-1">Reactivate the most recent package subscription.</p>
                  </div>
                  <button
                    onClick={() => {
                      const mostRecent = packageHistory[0];
                      setRenewTargetPackage({
                        id: mostRecent.id,
                        package_name: mostRecent.package_name,
                        customer_name: data.name,
                        customer_id: data.id,
                        package_id: mostRecent.package_id,
                        expiry_date: mostRecent.end_date,
                        package_status: mostRecent.package_status || 'expired'
                      });
                      setRenewModalOpen(true);
                    }}
                    className="text-xs font-bold bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl shadow-md transition-all flex items-center gap-1.5"
                  >
                    <RefreshCw size={14} />
                    Reactivate/Renew
                  </button>
                </div>
              </div>
            )
          )}

          {/* Package History */}
          {packageHistory.length > 0 && (
            <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2">
                  <RefreshCw className="w-5 h-5 text-gray-400" />
                  Package History
                </h3>
                <div className="flex gap-2">
                  <a
                    href={`${api.defaults.baseURL}/user-packages/export?user_id=${id}&format=pdf&token=${useAuthStore.getState().token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-blue-600 bg-blue-50 hover:bg-blue-100 px-3 py-1.5 rounded-lg transition-colors border border-blue-100 flex items-center gap-1"
                  >
                    PDF
                  </a>
                  <a
                    href={`${api.defaults.baseURL}/user-packages/export?user_id=${id}&format=excel&token=${useAuthStore.getState().token}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-xs font-medium text-green-600 bg-green-50 hover:bg-green-100 px-3 py-1.5 rounded-lg transition-colors border border-green-100 flex items-center gap-1"
                  >
                    Excel
                  </a>
                </div>
              </div>
              <div className="space-y-3">
                {packageHistory.map((pkg: any) => {
                  const isExpired = pkg.status === 'expired' || (pkg.end_date && dateOnly(pkg.end_date) < ymd());
                  return (
                    <div key={pkg.id} className={`p-3 rounded-xl border relative ${isExpired ? 'bg-gray-50 border-gray-100 opacity-70' : 'bg-blue-50 border-blue-100'}`}>
                      <div className="flex items-center justify-between">
                        <span className="font-bold text-gray-900 text-sm">{pkg.package_name || pkg.name || 'Package'}</span>
                        <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded ${
                          isExpired ? 'bg-gray-200 text-gray-500' : pkg.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'
                        }`}>
                          {pkg.status || (isExpired ? 'Expired' : 'Active')}
                        </span>
                      </div>
                      {pkg.start_date && (
                        <div className="text-[11px] text-gray-500 mt-1.5 flex items-center gap-3">
                          <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> {new Date(pkg.start_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          {pkg.end_date && (
                            <span>→ {new Date(pkg.end_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Vehicles List */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6">
            <h3 className="text-lg font-bold text-gray-900 flex items-center gap-2 mb-4">
              <Car className="w-5 h-5 text-blue-600" />
              Registered Vehicles
            </h3>
            {data.vehicles.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No vehicles registered.</p>
            ) : (
              <div className="space-y-3">
                {data.vehicles.map((v: any) => (
                  <div key={v.id} className="p-3 bg-gray-50 border border-gray-100 rounded-xl relative">
                    {v.is_primary === 1 && (
                      <span className="absolute top-2 right-2 px-2 py-0.5 bg-green-100 text-green-800 text-[10px] font-bold uppercase rounded">Primary</span>
                    )}
                    <div className="font-bold text-gray-900">
                      {v.brand} {v.model} {v.car_year ? `(${v.car_year})` : ''}
                    </div>
                    <div className="text-xs text-gray-500 mt-1 flex items-center gap-2">
                      <span className="bg-white px-2 py-0.5 rounded border border-gray-200">{v.registration_no || 'No Reg'}</span>
                      <span className="uppercase">{v.category ? v.category.replace('_', ' ') : 'UNKNOWN'}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Service History & CRM Notes */}
        <div className="lg:col-span-2 space-y-6">

          {/* Vehicle Service History (Job Cards) */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-blue-600" />
                <h3 className="font-bold text-gray-900">
                  Service History & Job Cards ({data.service_history?.length || 0})
                </h3>
              </div>
              <button
                onClick={() => navigate('/admin/job-carts/new', { state: { prefill: { customer_name: data.name, customer_mobile: data.mobile, customer_email: data.email, id: data.id } } })}
                className="text-xs font-bold text-blue-600 hover:text-blue-700 bg-blue-50 px-3 py-1.5 rounded-lg border border-blue-200 flex items-center gap-1 transition cursor-pointer"
              >
                <Plus size={13} /> New Job Card
              </button>
            </div>

            <div className="p-5 max-h-[420px] overflow-y-auto space-y-3">
              {(!data.service_history || data.service_history.length === 0) ? (
                <div className="text-center py-8 text-gray-400">
                  <ClipboardList className="w-10 h-10 mx-auto mb-2 opacity-40" />
                  <p className="text-sm">No job cards found for this customer.</p>
                </div>
              ) : (
                data.service_history.map((jc: any) => (
                  <div key={jc.id} className="p-4 rounded-xl border border-gray-200 hover:border-blue-300 bg-white transition shadow-2xs space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-gray-100 pb-2.5">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-extrabold text-sm text-[#0F172A] tracking-wide">
                          🚗 {jc.registration_no || 'Vehicle'}
                        </span>
                        <span className="text-xs text-gray-500">
                          ({jc.brand} {jc.model})
                        </span>
                        <span className="text-[10px] font-bold uppercase px-2 py-0.5 rounded bg-gray-100 text-gray-700">
                          Visit #{jc.visit_number || 1}
                        </span>
                        <span className={`text-[10px] font-extrabold uppercase px-2 py-0.5 rounded ${
                          jc.status === 'complete' ? 'bg-green-100 text-green-800' :
                          jc.status === 'in_progress' ? 'bg-blue-100 text-blue-800' :
                          'bg-amber-100 text-amber-800'
                        }`}>
                          {jc.status}
                        </span>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-gray-400 block font-medium">
                            {new Date(jc.visit_date).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' })}
                          </span>
                          <span className="text-sm font-black text-[#0F172A]">
                            ₹{Number(jc.total_amount || 0).toLocaleString('en-IN')}
                          </span>
                        </div>
                        <button
                          onClick={() => navigate(`/admin/job-carts/${jc.id}`)}
                          className="px-2.5 py-1 text-xs font-bold bg-gray-50 hover:bg-blue-50 text-gray-700 hover:text-blue-700 rounded-lg border border-gray-200 transition cursor-pointer"
                        >
                          View
                        </button>
                      </div>
                    </div>

                    {/* Services row */}
                    {jc.services && jc.services.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {jc.services.map((s: any, sIdx: number) => (
                          <span key={s.id || sIdx} className="inline-flex items-center gap-1 px-2 py-0.5 bg-slate-50 border border-slate-200 rounded text-xs text-slate-800 font-medium">
                            <span>{s.service_name}</span>
                            {s.custom_notes && (
                              <span className="text-[10px] font-bold text-amber-800 bg-amber-100 px-1 py-0.2 rounded">
                                📝 {s.custom_notes}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Discount row if present */}
                    {Number(jc.discount_value || jc.discount_amount) > 0 && (
                      <div className="text-[11px] text-amber-900 bg-amber-50/70 px-2.5 py-1 rounded-md border border-amber-200/60 flex items-center justify-between">
                        <span>
                          🏷️ Discount: <strong>{jc.discount_type === 'percentage' ? `${jc.discount_value}%` : `₹${jc.discount_amount || jc.discount_value}`}</strong>
                          {jc.discount_reason && ` (${jc.discount_reason})`}
                        </span>
                        {jc.discount_reference && (
                          <span className="text-[10px] text-amber-700 font-semibold">Ref: {jc.discount_reference}</span>
                        )}
                      </div>
                    )}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* CRM History Notes */}
          <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden flex flex-col min-h-[350px]">
            <div className="p-4 border-b border-gray-100 bg-gray-50 flex items-center gap-2">
              <History className="w-5 h-5 text-blue-600" />
              <h3 className="font-bold text-gray-900">CRM History Notes</h3>
            </div>

            <div className="flex-1 overflow-y-auto p-6 bg-gray-50/50 space-y-6 relative">
              {data.notes.length === 0 ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center text-gray-400">
                  <ClipboardList className="w-12 h-12 mb-2 opacity-50" />
                  <p>No notes yet. Add the first note below.</p>
                </div>
              ) : (
                data.notes.map((note: any) => (
                  <div key={note.id} className="flex gap-4">
                    <div className="flex flex-col items-center">
                      <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center text-blue-600 shrink-0 shadow-sm border border-blue-200">
                        <Calendar className="w-4 h-4" />
                      </div>
                      <div className="w-0.5 h-full bg-gray-200 my-1"></div>
                    </div>
                    <div className="flex-1 bg-white p-4 rounded-xl shadow-sm border border-gray-100 mb-2">
                      <div className="text-xs text-gray-500 mb-2 font-medium">
                        {new Date(note.created_at).toLocaleString('en-IN', {
                          day: 'numeric', month: 'short', year: 'numeric',
                          hour: 'numeric', minute: '2-digit', hour12: true
                        })}
                      </div>
                      <div className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">
                        {note.note}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Add Note Input */}
            <div className="p-4 border-t border-gray-100 bg-white">
              <form onSubmit={handleAddNote} className="flex gap-2">
                <textarea
                  value={newNote}
                  onChange={(e) => setNewNote(e.target.value)}
                  placeholder="Type a note about this customer (e.g. car year of registration, preferences, complaints)..."
                  className="flex-1 border border-gray-300 rounded-xl p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none h-14"
                  rows={1}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && !e.shiftKey) {
                      e.preventDefault();
                      handleAddNote(e);
                    }
                  }}
                ></textarea>
                <button
                  type="submit"
                  disabled={!newNote.trim() || submittingNote}
                  className="px-6 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2 transition-colors"
                >
                  {submittingNote ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
                  <span className="hidden sm:inline">Add</span>
                </button>
              </form>
            </div>
          </div>
        </div>
      </div>

      {/* Assign Package Modal */}
      <Modal
        open={assignModalOpen}
        onClose={() => setAssignModalOpen(false)}
        title="Assign Package to Customer"
        size="md"
      >
        <div className="space-y-4 py-2">
          {/* Select Vehicle */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Select Customer Vehicle *</label>
            <Dropdown
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={selectedVehicleId}
              onChange={(e) => setSelectedVehicleId(e.target.value)}
            >
              <option value="">Choose a vehicle...</option>
              {data.vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.registration_no || 'No Reg'}) - {v.category ? v.category.toUpperCase() : 'UNKNOWN'}
                </option>
              ))}
            </Dropdown>
          </div>

          {/* Select Package */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Select Package *</label>
            <Dropdown
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={selectedPackageId}
              onChange={(e) => setSelectedPackageId(e.target.value)}
            >
              <option value="">Choose a package...</option>
              {packages.map((pkg: any) => (
                <option key={pkg.id} value={pkg.id}>
                  {pkg.name}
                </option>
              ))}
            </Dropdown>
          </div>

          {/* Price Paid */}
          <Input
            label="Price Paid (₹) *"
            type="number"
            value={pricePaid}
            onChange={(e) => setPricePaid(e.target.value)}
            placeholder="0"
          />

          {/* Duration Months */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Duration (Months) *</label>
            <Dropdown
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={durationMonths}
              onChange={(e) => setDurationMonths(e.target.value)}
            >
              <option value="1">1 Month</option>
              <option value="3">3 Months</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months (1 Year)</option>
              <option value="24">24 Months (2 Years)</option>
            </Dropdown>
          </div>

          {/* Included Services */}
          {packageServices.length > 0 && (
            <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Included Services</p>
              <div className="space-y-2 max-h-56 overflow-y-auto">
                {packageServices.map((svc: any) => (
                  <div key={svc.service_name} className="flex items-center gap-2 bg-emerald-50 p-2.5 rounded-lg border border-emerald-100">
                    <div className="w-5 h-5 rounded-full bg-emerald-100 flex items-center justify-center flex-shrink-0">
                      <span className="text-emerald-600 text-[10px]">✓</span>
                    </div>
                    <span className="text-xs text-gray-800 font-bold">
                      {svc.total_count || (svc.paid || 0) + (svc.complimentary || 0) || 1} {svc.service_name}
                    </span>
                  </div>
                ))}
              </div>
              {/* Editable totals for admin override */}
              <details className="mt-2">
                <summary className="text-[10px] font-bold text-gray-400 cursor-pointer hover:text-gray-600">
                  ▸ Edit Service Counts (Admin Override)
                </summary>
                <div className="grid grid-cols-1 gap-2 mt-2">
                  {packageServices.map((svc: any, idx: number) => (
                    <div key={svc.service_name} className="flex justify-between items-center bg-white p-2 rounded-lg border border-gray-100">
                      <span className="text-xs font-semibold text-gray-700">{svc.service_name}</span>
                      <div className="flex items-center gap-1.5">
                        <input
                          type="number"
                          min="0"
                          className="w-12 px-1.5 py-0.5 border border-gray-300 rounded text-center text-xs font-bold focus:outline-none focus:ring-1 focus:ring-blue-500"
                          value={svc.remaining}
                          onChange={(e) => {
                            const val = Math.max(0, parseInt(e.target.value) || 0);
                            const updated = [...packageServices];
                            updated[idx].remaining = val;
                            setPackageServices(updated);
                          }}
                        />
                        <span className="text-[10px] text-gray-400 font-bold">/ {svc.total_count}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </details>
            </div>
          )}

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setAssignModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleAssignPackageSubmit} loading={assigning}>Assign Package</Button>
          </div>
        </div>
      </Modal>

      {/* Create & Assign Custom Package Modal */}
      <Modal
        open={customAssignModalOpen}
        onClose={() => setCustomAssignModalOpen(false)}
        title="Create & Assign Custom Package"
        size="md"
      >
        <div className="space-y-4 py-2">
          {/* Package Name */}
          <Input
            label="Custom Package Name *"
            value={customPackageName}
            onChange={(e) => setCustomPackageName(e.target.value)}
            placeholder="e.g. Gaurav Special Package"
          />

          {/* Selected Vehicle */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Select Vehicle *</label>
            <Dropdown
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={customVehicleId}
              onChange={(e) => setCustomVehicleId(e.target.value)}
            >
              <option value="">Choose a vehicle...</option>
              {data.vehicles.map((v: any) => (
                <option key={v.id} value={v.id}>
                  {v.brand} {v.model} ({v.registration_no || 'No Reg'})
                </option>
              ))}
            </Dropdown>
          </div>

          {/* Price Paid */}
          <Input
            label="Price Paid (₹) *"
            type="number"
            value={customPricePaid}
            onChange={(e) => setCustomPricePaid(e.target.value)}
            placeholder="0"
          />

          {/* Duration Months */}
          <div>
            <label className="block text-xs font-bold text-gray-500 mb-1">Duration (Months) *</label>
            <Dropdown
              className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
              value={customDurationMonths}
              onChange={(e) => setCustomDurationMonths(e.target.value)}
            >
              <option value="1">1 Month</option>
              <option value="3">3 Months</option>
              <option value="6">6 Months</option>
              <option value="12">12 Months (1 Year)</option>
              <option value="24">24 Months (2 Years)</option>
            </Dropdown>
          </div>

          {/* Service Builder */}
          <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 space-y-3">
            <div className="flex justify-between items-center">
              <p className="text-xs font-bold uppercase tracking-wider text-gray-500">Service Entitlements</p>
              <button
                type="button"
                onClick={() => setCustomServices(prev => [...prev, { service_id: 0, total_count: 1 }])}
                className="text-xs text-blue-600 font-bold hover:underline"
              >
                + Add Service
              </button>
            </div>

            <div className="space-y-2 max-h-48 overflow-y-auto">
              {customServices.map((row, idx) => (
                <div key={idx} className="flex gap-2 items-center">
                  <Dropdown
                    className="flex-1 px-3 py-1.5 border border-gray-200 rounded-lg text-xs bg-white"
                    value={row.service_id}
                    onChange={(e) => {
                      const updated = [...customServices];
                      updated[idx].service_id = Number(e.target.value);
                      setCustomServices(updated);
                    }}
                  >
                    <option value="0">Choose service...</option>
                    {allServicesList.map(s => (
                      <option key={s.id} value={s.id}>{s.name}</option>
                    ))}
                  </Dropdown>
                  <input
                    type="number"
                    min="1"
                    className="w-16 px-2 py-1.5 border border-gray-200 rounded-lg text-center text-xs font-bold"
                    placeholder="Qty"
                    value={row.total_count}
                    onChange={(e) => {
                      const updated = [...customServices];
                      updated[idx].total_count = Math.max(1, parseInt(e.target.value) || 1);
                      setCustomServices(updated);
                    }}
                  />
                  <button
                    type="button"
                    onClick={() => setCustomServices(prev => prev.filter((_, i) => i !== idx))}
                    className="text-blue-500 hover:text-blue-700"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              ))}
              {customServices.length === 0 && (
                <p className="text-[11px] text-gray-400 text-center py-2">No services added yet.</p>
              )}
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t">
            <Button variant="secondary" onClick={() => setCustomAssignModalOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={handleCustomAssignSubmit} loading={customAssigning}>Assign Custom Package</Button>
          </div>
        </div>
      </Modal>


      {/* Renewal History Timeline */}
      {renewalsHistory.length > 0 && (
        <div className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden p-6 mt-6">
          <details className="group">
            <summary className="flex items-center justify-between cursor-pointer list-none font-bold text-gray-900 text-lg">
              <div className="flex items-center gap-2">
                <History className="w-5 h-5 text-indigo-600" />
                Package Renewal History ({renewalsHistory.length})
              </div>
              <span className="text-gray-400 transition-transform group-open:rotate-180">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
              </span>
            </summary>
            
            <div className="mt-5 border-t border-gray-100 pt-5 space-y-4">
              {renewalsHistory.map((ren: any) => (
                <div key={ren.id} className="relative flex gap-4 pl-4 before:absolute before:left-[22px] before:top-6 before:bottom-0 before:w-0.5 before:bg-gray-100 last:before:hidden">
                  <div className="flex-shrink-0 w-4 h-4 rounded-full bg-indigo-600 border-4 border-indigo-100 flex items-center justify-center mt-1.5 z-10" />
                  <div className="flex-1 bg-gray-50 border border-gray-100 rounded-xl p-4">
                    <div className="flex justify-between items-start">
                      <div>
                        <h4 className="font-bold text-sm text-gray-900">{ren.package_name}</h4>
                        <p className="text-xs text-gray-500 mt-1">
                          Renewed By: <span className="capitalize font-semibold text-gray-700">{ren.renewed_by}</span>
                        </p>
                      </div>
                      <div className="text-right">
                        <span className="text-sm font-extrabold text-gray-900">₹{parseFloat(ren.amount_paid).toLocaleString('en-IN')}</span>
                        <p className="text-[10px] text-gray-400 mt-1">
                          {new Date(ren.renewal_date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </p>
                      </div>
                    </div>
                    {ren.notes && (
                      <p className="text-xs text-gray-600 bg-white border border-gray-100 rounded-lg p-2 mt-2 italic">
                        {ren.notes}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          </details>
        </div>
      )}

      {/* Adjust Credits Modal */}
      {activePackage && (
        <Modal
          open={adjustModalOpen}
          onClose={() => setAdjustModalOpen(false)}
          title="Adjust Package Credits"
          size="sm"
        >
          <div className="space-y-4 py-2">
            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Select Service</label>
              <Dropdown
                className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
                value={adjustService}
                onChange={(e) => {
                  setAdjustService(e.target.value);
                  const svc = activePackage.usage.find((u: any) => u.service_name === e.target.value);
                  if (svc) {
                    setAdjustNewCount(svc.used_count);
                    setAdjustTotalCount(svc.total_count);
                  }
                }}
              >
                {activePackage.usage?.map((u: any) => (
                  <option key={u.service_name} value={u.service_name}>
                    {u.service_name}
                  </option>
                ))}
              </Dropdown>
            </div>

            <div>
              <label className="block text-xs font-bold text-gray-500 mb-1">Used Count</label>
              <div className="flex items-center gap-2">
                <input
                  type="number"
                  min="0"
                  max={adjustTotalCount}
                  className="w-full px-3 py-2 border border-gray-200 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  value={adjustNewCount}
                  onChange={(e) => setAdjustNewCount(Math.max(0, parseInt(e.target.value) || 0))}
                />
                <span className="text-sm text-gray-400 font-bold">/ {adjustTotalCount}</span>
              </div>
              <p className="text-[10px] text-gray-400 mt-1">
                Remaining Credits: {Math.max(0, adjustTotalCount - adjustNewCount)}
              </p>
            </div>

            <div className="flex justify-end gap-3 pt-4 border-t">
              <Button variant="secondary" onClick={() => setAdjustModalOpen(false)}>Cancel</Button>
              <Button variant="primary" onClick={handleAdjustCreditsSubmit} loading={adjusting}>Save Changes</Button>
            </div>
          </div>
        </Modal>
      )}

      {/* Package Renewal Modal */}
      {renewTargetPackage && (
        <PackageRenewModal
          isOpen={renewModalOpen}
          onClose={() => {
            setRenewModalOpen(false);
            setRenewTargetPackage(null);
            fetchDetail();
          }}
          userPackage={renewTargetPackage}
        />
      )}
    </div>
  );
}
