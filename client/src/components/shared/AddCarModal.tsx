import { CAR_TYPES } from '../../utils/carTypes';
import { useState, useEffect } from 'react';
import { regNoError, normalizeRegNo } from '../../utils/validators';
import { X, Car, ChevronDown, Search, Check } from 'lucide-react';
import { CAR_TYPE_IMAGES, carImage, brandLogo } from '../../utils/carImage';
import toast from 'react-hot-toast';
import { carBrands as fallbackCarBrands, getModelsForBrand, getVariantsForModel, getCategoryForModel } from '../../utils/carData';
import { useBrands, useModels, useVariants } from '../../api/hooks/useVehicles';
import api from '../../api/axiosInstance';
import { useQueryClient } from '@tanstack/react-query';
import Dropdown from '../ui/Dropdown';

interface AddCarModalProps {
  isOpen: boolean;
  onClose: () => void;
  editVehicle?: any;
  /** first car: cannot be dismissed */
  required?: boolean;
}

export default function AddCarModal({ isOpen, onClose, editVehicle, required = false }: AddCarModalProps) {
  const queryClient = useQueryClient();
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [regNo, setRegNo] = useState('');
  const [regTouched, setRegTouched] = useState(false); // show the plate error only after leaving the field
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('sedan');
  const [isPending, setIsPending] = useState(false);
  const [brandQ, setBrandQ] = useState('');
  const [modelQ, setModelQ] = useState('');

  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(brand);
  const { data: variantsRes } = useVariants(brand, model);

  const liveBrands: string[] = brandsRes?.data || [];
  const carBrands = liveBrands.length > 0 ? Array.from(new Set([...liveBrands, ...fallbackCarBrands, 'Others'])) : fallbackCarBrands;

  // Popular brands first (like big car apps), then A–Z, "Others" last
  const POPULAR = ['Maruti Suzuki', 'Hyundai', 'Tata', 'Mahindra', 'Kia', 'Toyota', 'Honda', 'MG', 'Skoda', 'Volkswagen', 'Renault', 'Nissan'];
  const pop = (b: string) => { const i = POPULAR.findIndex(p => b.toLowerCase().startsWith(p.toLowerCase())); return i < 0 ? 99 : i; };
  const brandGrid = [...carBrands].sort((x, y) => (x === 'Others' ? 1 : 0) - (y === 'Others' ? 1 : 0) || pop(x) - pop(y) || x.localeCompare(y));
  const liveModels: string[] = modelsRes?.data || [];
  const datasetModels = brand ? getModelsForBrand(brand) : [];
  const models = brand
    ? Array.from(new Set([...liveModels, ...datasetModels, 'Other']))
    : [];

  const liveVariants: string[] = variantsRes?.data || [];
  const datasetVariants = (brand && model) ? getVariantsForModel(brand, model) : [];
  const variants = Array.from(new Set([...liveVariants, ...datasetVariants]));

  useEffect(() => {
    if (editVehicle) {
      setBrand(editVehicle.brand || '');
      setModel(editVehicle.model || '');
      setRegNo(editVehicle.registration_no || '');
      setYear(editVehicle.car_year ? String(editVehicle.car_year) : '');
      setCategory(editVehicle.category || 'sedan');
    } else {
      resetForm();
    }
  }, [editVehicle, isOpen]);

  const isOtherBrand = brand === 'Others';
  const isOtherModel = model === 'Other';

  const finalBrand = isOtherBrand ? customBrand : brand;
  const finalModel = isOtherModel ? customModel : (variant ? `${model} ${variant}` : model);

  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: currentYear - 1989 }, (_, i) => currentYear - i);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!finalBrand || !finalModel) {
      toast.error('Please select brand and model');
      return;
    }
    if (!regNo.trim()) {
      toast.error('Enter the registration number (number plate)');
      return;
    }
    if (regNoError(regNo)) {
      toast.error(regNoError(regNo));
      return;
    }
    try {
      setIsPending(true);
      if (editVehicle) {
        await api.patch(`/vehicles/${editVehicle.id}`, {
          brand: finalBrand,
          model: finalModel,
          registration_no: regNo,
          car_year: year ? parseInt(year) : undefined,
          category: category,
        });
        toast.success('Car updated successfully!');
      } else {
        await api.post('/vehicles/add', {
          brand: finalBrand,
          model: finalModel,
          registration_no: regNo,
          car_year: year ? parseInt(year) : undefined,
          category: category,
        });
        toast.success('Car added successfully!');
      }
      queryClient.invalidateQueries({ queryKey: ['customer-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['my-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
      resetForm();
      onClose();
    } catch (err: any) {
      console.error('SAVE CAR ERROR:', err);
      toast.error(err.response?.data?.error || 'Failed to save car');
    } finally {
      setIsPending(false);
    }
  };

  const resetForm = () => {
    setBrandQ(''); setModelQ('');
    setBrand(''); setModel(''); setCustomBrand(''); setCustomModel(''); setRegNo(''); setYear(''); setCategory('sedan');
  };

  if (!isOpen) return null;

  const selectCls = 'w-full px-4 py-3.5 bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 appearance-none cursor-pointer';
  const inputCls = 'w-full px-4 py-3.5 bg-[#F1F5F9] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-[#94A3B8]/60 transition-all duration-200';
  const labelCls = 'block text-[10px] font-extrabold uppercase tracking-widest text-[#64748B] mb-2';

  return (
    <div className="fixed inset-0 z-[120] flex items-end sm:items-center justify-center p-0 sm:p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={required ? undefined : onClose} />
      <div className="relative bg-white rounded-t-3xl sm:rounded-2xl shadow-2xl w-full max-w-md max-h-[92vh] overflow-y-auto overscroll-contain animate-fade-in-up pb-[env(safe-area-inset-bottom)]">
        {/* Header */}
        <div className="sticky top-0 z-10 px-6 py-4 border-b border-gray-100 bg-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center text-white">
              <Car size={16} />
            </div>
            <h3 className="font-bold text-[#0F172A]">{editVehicle ? 'Edit Car' : required ? 'Add your car to continue' : 'Add New Car'}</h3>
          </div>
          <button onClick={onClose} hidden={required} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Live picture of the chosen car type */}
          <div className="relative rounded-2xl bg-white border border-slate-100 shadow-[0_6px_24px_rgba(37,99,235,0.08)] overflow-hidden">
            <img src={carImage({ brand: finalBrand, model: finalModel, category })} alt="" className="w-full h-36 object-contain" />
            <div className="absolute left-3 bottom-2 text-[12px] font-extrabold text-slate-800">{finalModel || 'Your car'}{finalBrand ? <span className="font-semibold text-slate-500"> · {finalBrand}</span> : null}</div>
          </div>

          {/* Brand grid (popular first), with search */}
          <div>
            <label className={labelCls}>Car Brand</label>
            {brand ? (
              <div className="flex items-center justify-between bg-[#EFF6FF] border border-blue-100 rounded-xl px-3 py-2.5">
                <span className="flex items-center gap-2 font-bold text-slate-900"><span className="w-8 h-8 rounded-lg bg-white text-[#2563EB] text-[13px] font-black flex items-center justify-center shadow-sm overflow-hidden">{brandLogo(brand) ? <img src={brandLogo(brand)!} alt="" className="w-7 h-7 object-contain" /> : brand.slice(0, 2).toUpperCase()}</span>{brand}</span>
                <button type="button" onClick={() => { setBrand(''); setModel(''); setVariant(''); setCustomBrand(''); setCustomModel(''); }} className="text-[12px] font-bold text-[#2563EB]">Change</button>
              </div>
            ) : (
              <>
                <div className="relative mb-2.5">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={brandQ} onChange={e => setBrandQ(e.target.value)} placeholder="Search brand" className={`${inputCls} pl-9 py-2.5`} />
                </div>
                <div className="grid grid-cols-4 gap-2 max-h-56 overflow-y-auto pr-0.5">
                  {brandGrid.filter(b => b.toLowerCase().includes(brandQ.trim().toLowerCase())).map(b => (
                    <button type="button" key={b} onClick={() => { setBrand(b); setModel(''); setCustomBrand(''); setCustomModel(''); setModelQ(''); }}
                      className="tap flex flex-col items-center gap-1 rounded-xl border border-slate-100 bg-white py-2.5 px-1 hover:border-blue-300 hover:shadow-sm transition">
                      {brandLogo(b)
                        ? <img src={brandLogo(b)!} alt="" className="w-10 h-10 object-contain" loading="lazy" />
                        : <span className="w-10 h-10 rounded-full bg-gradient-to-br from-[#EFF6FF] to-[#DBEAFE] text-[#1D4ED8] text-[12px] font-black flex items-center justify-center">{b === 'Others' ? '+' : b.slice(0, 2).toUpperCase()}</span>}
                      <span className="text-[10.5px] font-bold text-slate-700 leading-tight text-center line-clamp-2">{b === 'Others' ? "Can't find it?" : b}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* Custom brand input */}
          {isOtherBrand && (
            <div>
              <label className={labelCls}>Enter Brand Name</label>
              <input type="text" value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} placeholder="e.g. Porsche" className={inputCls} autoFocus />
            </div>
          )}

          {/* Model chips */}
          {brand && !isOtherBrand && (
            <div>
              <label className={labelCls}>Car Model</label>
              {models.length > 10 && (
                <div className="relative mb-2">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input value={modelQ} onChange={e => setModelQ(e.target.value)} placeholder={`Search ${brand} models`} className={`${inputCls} pl-9 py-2.5`} />
                </div>
              )}
              <div className="flex flex-wrap gap-1.5 max-h-44 overflow-y-auto">
                {models.filter(m => m === model || m.toLowerCase().includes(modelQ.trim().toLowerCase())).map(m => (
                  <button type="button" key={m} onClick={() => { setModel(m); setVariant(''); setCustomModel(''); if (m !== 'Other') setCategory(getCategoryForModel(brand, m)); }}
                    className={`tap px-3 py-2 rounded-full text-[12.5px] font-bold border transition ${model === m ? 'bg-[#2563EB] text-white border-[#2563EB] shadow-md shadow-blue-500/20' : 'bg-white text-slate-700 border-slate-200 hover:border-blue-300'}`}>
                    {m === 'Other' ? 'Other model' : m}
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Variant Dropdown */}
          {model && !isOtherModel && variants.length > 0 && (
            <div>
              <label className={labelCls}>Car Variant <span className="text-[#94A3B8]/60 normal-case tracking-normal">(optional)</span></label>
              <div className="relative">
                <Dropdown value={variant} onChange={(e) => setVariant(e.target.value)} className={selectCls}>
                  <option value="">Select variant...</option>
                  {variants.map(v => <option key={v} value={v}>{v}</option>)}
                </Dropdown>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Custom model input (when "Other" model selected or brand is Others) */}
          {(isOtherModel || isOtherBrand) && (
            <div>
              <label className={labelCls}>Enter Model Name</label>
              <input
                type="text"
                value={customModel}
                onChange={(e) => {
                  const val = e.target.value;
                  setCustomModel(val);
                  if (val.trim()) {
                    setCategory(getCategoryForModel(finalBrand, val));
                  }
                }}
                placeholder="e.g. Cayenne"
                className={inputCls}
              />
            </div>
          )}

          {/* Registration Number (required) */}
          <div>
            <label className={labelCls}>Registration No. <span className="text-rose-500">*</span></label>
            <input type="text" required value={regNo} onChange={(e) => setRegNo(normalizeRegNo(e.target.value))} onBlur={() => setRegTouched(true)} maxLength={11} placeholder="e.g. MH01AB1234" className={`${inputCls} uppercase ${regTouched && regNo && regNoError(regNo) ? 'ring-2 ring-rose-300' : ''}`} />
            {regTouched && regNo && regNoError(regNo) && <p className="text-[11px] text-rose-600 mt-1.5 font-medium">{regNoError(regNo)}</p>}
          </div>

          {/* Year of Registration Dropdown */}
          <div>
            <label className={labelCls}>Year of Registration <span className="text-[#94A3B8]/60 normal-case tracking-normal">(optional)</span></label>
            <div className="relative">
              <Dropdown value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
                <option value="">Select year...</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </Dropdown>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Vehicle type picture cards (auto-picked from the model; customer can correct it) */}
          <div>
            <label className={labelCls}>Vehicle Type</label>
            <div className="grid grid-cols-3 gap-2">
              {CAR_TYPES.map(t => (
                <button type="button" key={t.value} onClick={() => setCategory(t.value)}
                  className={`tap relative rounded-xl border bg-white p-1.5 pb-2 text-center transition ${category === t.value ? 'border-[#2563EB] ring-2 ring-[#2563EB]/20' : 'border-slate-100 hover:border-blue-200'}`}>
                  {category === t.value && <Check size={14} className="absolute top-1 right-1 text-white bg-[#2563EB] rounded-full p-0.5" />}
                  <img src={CAR_TYPE_IMAGES[t.value]} alt="" className="w-full h-12 object-contain" loading="lazy" />
                  <span className="block text-[10.5px] font-bold text-slate-700 leading-tight">{t.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={isPending || !finalBrand || !finalModel || !regNo.trim() || !!regNoError(regNo)} className="w-full py-3.5 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white font-bold rounded-lg shadow-lg shadow-[#2563EB]/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wider text-sm">
            {isPending ? (
              <span className="flex items-center justify-center gap-2">
                <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" /></svg>
                {editVehicle ? 'Saving...' : 'Adding...'}
              </span>
            ) : editVehicle ? 'Save Changes' : 'Add Car'}
          </button>
        </form>
      </div>
    </div>
  );
}
