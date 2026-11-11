import { useState } from 'react';
import { CheckCircle2, Plus, X } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useVehicleStore, CATEGORY_LABEL } from '../../store/vehicleStore';
import { useMyVehicles } from '../../api/hooks/useMyVehicles';
import AddCarModal from '../shared/AddCarModal';
import { carImage } from '../../utils/carImage';

/** Bottom sheet to pick the active car (prices across the app follow this car). */
export default function VehicleSheet() {
  const { sheetOpen, closeSheet, select } = useVehicleStore();
  const { vehicles, selected } = useMyVehicles();
  const [adding, setAdding] = useState(false);
  const qc = useQueryClient();

  return (
    <>
      {sheetOpen && (
        <div className="fixed inset-0 z-[90] flex items-end sm:items-center justify-center">
          <div className="absolute inset-0 bg-slate-900/50 backdrop-blur-[2px]" onClick={closeSheet} />
          <div className="relative w-full sm:max-w-md bg-white rounded-t-3xl sm:rounded-3xl p-5 pb-8 shadow-2xl animate-slide-up max-h-[80vh] overflow-y-auto">
            <div className="w-10 h-1.5 bg-slate-200 rounded-full mx-auto mb-4 sm:hidden" />
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-extrabold text-slate-900">Select vehicle</h3>
              <div className="flex items-center gap-2">
                <button onClick={() => { closeSheet(); setAdding(true); }} className="flex items-center gap-1 px-3 py-1.5 rounded-xl border border-slate-200 text-sm font-bold text-slate-700">
                  <Plus size={15} /> Add vehicle
                </button>
                <button onClick={closeSheet} className="p-1.5 text-slate-400"><X size={18} /></button>
              </div>
            </div>
            <p className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-2">Saved vehicles</p>
            {vehicles.length === 0 && (
              <button onClick={() => { closeSheet(); setAdding(true); }} className="w-full p-5 rounded-2xl border-2 border-dashed border-blue-200 text-blue-700 font-bold text-sm">
                + Add your first car to see exact prices
              </button>
            )}
            <div className="divide-y divide-slate-100">
              {vehicles.map(v => (
                <button key={v.id} onClick={() => select(v.id)} className="w-full flex items-center gap-3 py-3 text-left">
                  <img src={carImage(v)} alt="" className="w-16 h-11 object-contain shrink-0" />
                  <span className="flex-1 min-w-0">
                    <span className="block font-bold text-slate-900 truncate">{v.model}, <span className="font-medium text-slate-500">{v.brand}</span></span>
                    <span className="block text-xs text-slate-500">{v.registration_no || 'No number'}{v.category ? ` · ${CATEGORY_LABEL[v.category] || v.category}` : ''}</span>
                  </span>
                  {selected?.id === v.id && <CheckCircle2 className="text-blue-600" size={22} />}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
      <AddCarModal
        isOpen={adding}
        onClose={() => { setAdding(false); qc.invalidateQueries({ queryKey: ['my-vehicles'] }); qc.invalidateQueries({ queryKey: ['customer-vehicles'] }); }}
      />
    </>
  );
}
