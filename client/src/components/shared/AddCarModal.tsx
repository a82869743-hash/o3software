import { useState, useEffect } from 'react';
import { X, Car, ChevronDown } from 'lucide-react';
import toast from 'react-hot-toast';
import { carBrands as fallbackCarBrands, getModelsForBrand, getVariantsForModel, getCategoryForModel } from '../../utils/carData';
import { useBrands, useModels, useVariants } from '../../api/hooks/useVehicles';
import api from '../../api/axiosInstance';
import { useQueryClient } from '@tanstack/react-query';

interface AddCarModalProps {
  isOpen: boolean;
  onClose: () => void;
  editVehicle?: any;
}

export default function AddCarModal({ isOpen, onClose, editVehicle }: AddCarModalProps) {
  const queryClient = useQueryClient();
  const [brand, setBrand] = useState('');
  const [model, setModel] = useState('');
  const [variant, setVariant] = useState('');
  const [customBrand, setCustomBrand] = useState('');
  const [customModel, setCustomModel] = useState('');
  const [regNo, setRegNo] = useState('');
  const [year, setYear] = useState('');
  const [category, setCategory] = useState('sedan');
  const [isPending, setIsPending] = useState(false);

  const { data: brandsRes } = useBrands();
  const { data: modelsRes } = useModels(brand);
  const { data: variantsRes } = useVariants(brand, model);

  const liveBrands: string[] = brandsRes?.data || [];
  const carBrands = liveBrands.length > 0 ? Array.from(new Set([...liveBrands, ...fallbackCarBrands, 'Others'])) : fallbackCarBrands;

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
    try {
      setIsPending(true);
      if (editVehicle) {
        await api.patch(`/vehicles/${editVehicle.id}`, {
          brand: finalBrand,
          model: finalModel,
          registration_no: regNo || undefined,
          car_year: year ? parseInt(year) : undefined,
          category: category,
        });
        toast.success('Car updated successfully!');
      } else {
        await api.post('/vehicles/add', {
          brand: finalBrand,
          model: finalModel,
          registration_no: regNo || undefined,
          car_year: year ? parseInt(year) : undefined,
          category: category,
        });
        toast.success('Car added successfully!');
      }
      queryClient.invalidateQueries({ queryKey: ['customer-vehicles'] });
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
    setBrand(''); setModel(''); setCustomBrand(''); setCustomModel(''); setRegNo(''); setYear(''); setCategory('sedan');
  };

  if (!isOpen) return null;

  const selectCls = 'w-full px-4 py-3.5 bg-[#f6f3f2] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 transition-all duration-200 appearance-none cursor-pointer';
  const inputCls = 'w-full px-4 py-3.5 bg-[#f6f3f2] border border-transparent rounded-lg text-[#0F172A] font-medium focus:ring-2 focus:ring-[#2563EB]/20 focus:bg-white focus:border-[#2563EB]/30 placeholder:text-[#8f6f6c]/60 transition-all duration-200';
  const labelCls = 'block text-[10px] font-extrabold uppercase tracking-widest text-[#5f5e5e] mb-2';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-2xl shadow-2xl w-full max-w-md overflow-hidden animate-fade-in-up">
        {/* Header */}
        <div className="px-6 py-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-[#2563EB] to-[#1D4ED8] flex items-center justify-center text-white">
              <Car size={16} />
            </div>
            <h3 className="font-bold text-[#0F172A]">{editVehicle ? 'Edit Car' : 'Add New Car'}</h3>
          </div>
          <button onClick={onClose} className="w-8 h-8 rounded-lg bg-gray-100 flex items-center justify-center text-gray-500 hover:bg-gray-200 hover:text-gray-700 transition-colors">
            <X size={16} />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {/* Brand Dropdown */}
          <div>
            <label className={labelCls}>Car Brand</label>
            <div className="relative">
              <select value={brand} onChange={(e) => { setBrand(e.target.value); setModel(''); setCustomBrand(''); setCustomModel(''); }} className={selectCls}>
                <option value="">Select brand...</option>
                {carBrands.map(b => <option key={b} value={b}>{b}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Custom brand input */}
          {isOtherBrand && (
            <div>
              <label className={labelCls}>Enter Brand Name</label>
              <input type="text" value={customBrand} onChange={(e) => setCustomBrand(e.target.value)} placeholder="e.g. Porsche" className={inputCls} autoFocus />
            </div>
          )}

          {/* Model Dropdown */}
          {brand && !isOtherBrand && (
            <div>
              <label className={labelCls}>Car Model</label>
              <div className="relative">
                <select value={model} onChange={(e) => {
                  const val = e.target.value;
                  setModel(val);
                  setVariant('');
                  setCustomModel('');
                  if (val && val !== 'Other') {
                    setCategory(getCategoryForModel(brand, val));
                  }
                }} className={selectCls}>
                  <option value="">Select model...</option>
                  {models.map(m => <option key={m} value={m}>{m}</option>)}
                </select>
                <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
              </div>
            </div>
          )}

          {/* Variant Dropdown */}
          {model && !isOtherModel && variants.length > 0 && (
            <div>
              <label className={labelCls}>Car Variant <span className="text-[#8f6f6c]/60 normal-case tracking-normal">(optional)</span></label>
              <div className="relative">
                <select value={variant} onChange={(e) => setVariant(e.target.value)} className={selectCls}>
                  <option value="">Select variant...</option>
                  {variants.map(v => <option key={v} value={v}>{v}</option>)}
                </select>
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

          {/* Registration Number (optional) */}
          <div>
            <label className={labelCls}>Registration No. <span className="text-[#8f6f6c]/60 normal-case tracking-normal">(optional)</span></label>
            <input type="text" value={regNo} onChange={(e) => setRegNo(e.target.value.toUpperCase())} placeholder="e.g. GJ06AB1234" className={inputCls} />
          </div>

          {/* Year of Registration Dropdown */}
          <div>
            <label className={labelCls}>Year of Registration <span className="text-[#8f6f6c]/60 normal-case tracking-normal">(optional)</span></label>
            <div className="relative">
              <select value={year} onChange={(e) => setYear(e.target.value)} className={selectCls}>
                <option value="">Select year...</option>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Vehicle Category */}
          <div>
            <label className={labelCls}>Vehicle Category</label>
            <div className="relative">
              <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectCls}>
                <option value="hatchback">Hatchback</option>
                <option value="medium_hatchback">Medium Hatchback</option>
                <option value="sedan">Sedan</option>
                <option value="premium_sedan">Premium Sedan</option>
                <option value="suv">SUV</option>
              </select>
              <ChevronDown size={16} className="absolute right-4 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
            </div>
          </div>

          {/* Submit */}
          <button type="submit" disabled={isPending || !finalBrand || !finalModel} className="w-full py-3.5 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white font-bold rounded-lg shadow-lg shadow-[#2563EB]/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:translate-y-0 uppercase tracking-wider text-sm">
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
