import { useState } from 'react';
import { Car, ChevronRight, Plus, Star, Trash2 } from 'lucide-react';
import toast from 'react-hot-toast';
import AdminTopBar from '../../components/layout/AdminTopBar';
import EmptyState from '../../components/shared/EmptyState';
import { SkeletonCard } from '../../components/ui/SkeletonLoader';
import { useCustomerVehicles } from '../../api/hooks/useVehicles';
import AddCarModal from '../../components/shared/AddCarModal';
import api from '../../api/axiosInstance';
import { useQueryClient } from '@tanstack/react-query';

export default function VehiclesPage() {
  const { data, isLoading } = useCustomerVehicles();
  const vehicles = data?.data || [];
  const [showAddCar, setShowAddCar] = useState(false);
  const [editingVehicle, setEditingVehicle] = useState<any>(null);
  const queryClient = useQueryClient();

  const handleSetPrimary = async (id: number) => {
    try {
      await api.patch(`/vehicles/${id}/primary`);
      toast.success('Primary car updated');
      queryClient.invalidateQueries({ queryKey: ['customer-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to update');
    }
  };

  const handleDelete = async (id: number) => {
    if (!confirm('Are you sure you want to remove this car?')) return;
    try {
      await api.delete(`/vehicles/${id}`);
      toast.success('Car removed');
      queryClient.invalidateQueries({ queryKey: ['customer-vehicles'] });
      queryClient.invalidateQueries({ queryKey: ['dashboard'] });
    } catch (err: any) {
      toast.error(err.response?.data?.error || 'Failed to delete');
    }
  };

  return (
    <>
      <AdminTopBar 
        title="My Vehicles" 
        subtitle="Manage your registered vehicles" 
        actions={
          <button
            onClick={() => setShowAddCar(true)}
            className="flex items-center gap-1.5 px-4 py-2.5 bg-gradient-to-br from-[#1D4ED8] to-[#2563EB] text-white font-bold rounded-lg shadow-lg shadow-[#2563EB]/20 hover:shadow-xl hover:-translate-y-0.5 active:scale-[0.98] transition-all text-xs uppercase tracking-wider"
          >
            <Plus size={14} /> Add Car
          </button>
        }
      />

      <div className="max-w-5xl">
        {isLoading ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {[1, 2, 3].map(i => <SkeletonCard key={i} />)}
          </div>
        ) : !vehicles.length ? (
          <EmptyState
            icon={Car}
            title="No Vehicles Found"
            description="Add your first car to get started."
            actionLabel="Add Your First Car"
            onAction={() => setShowAddCar(true)}
          />
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {vehicles.map((v: any, idx: number) => (
              <div
                key={v.id}
                className="bg-white p-6 rounded-xl border border-gray-100 shadow-sm card-premium group relative overflow-hidden opacity-0 animate-fade-in-up"
                style={{ animationDelay: `${idx * 0.08}s`, animationFillMode: 'forwards' }}
              >
                {/* Top accent */}
                <div className={`absolute top-0 left-0 right-0 h-1 ${v.is_primary ? 'bg-gradient-to-r from-[#2563EB] to-[#3B82F6]' : 'bg-gradient-to-r from-transparent via-gray-200 to-transparent'} transition-all duration-500`} />
                
                {/* Primary badge */}
                {v.is_primary ? (
                  <div className="absolute top-3 right-3 flex items-center gap-1 px-2 py-1 bg-[#2563EB]/10 rounded-md">
                    <Star size={10} className="text-[#2563EB] fill-[#2563EB]" />
                    <span className="text-[9px] font-bold uppercase tracking-wider text-[#2563EB]">Primary</span>
                  </div>
                ) : null}
                
                <div className="w-14 h-14 bg-gradient-to-br from-gray-100 to-gray-50 text-gray-500 rounded-2xl flex items-center justify-center mb-4 group-hover:from-[#2563EB] group-hover:to-[#1D4ED8] group-hover:text-white group-hover:shadow-blue-glow transition-all duration-300">
                  <Car size={26} />
                </div>
                <h3 className="text-xl font-black text-[#0F172A] mb-1 tracking-tight">
                  {v.brand} {v.model} {v.car_year ? `(${v.car_year})` : ''}
                </h3>
                {v.registration_no && (
                  <p className="text-[#5f5e5e] font-medium text-sm">{v.registration_no}</p>
                )}
                
                <div className="pt-4 mt-4 border-t border-gray-100 flex items-center justify-between">
                  {!v.is_primary ? (
                    <button
                      onClick={() => handleSetPrimary(v.id)}
                      className="flex items-center gap-1 text-xs font-bold text-blue-600 hover:underline"
                    >
                      <Star size={12} /> Set Primary
                    </button>
                  ) : (
                    <span className="text-xs text-gray-400 font-medium">Active car</span>
                  )}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={() => setEditingVehicle(v)}
                      className="text-xs font-bold text-gray-500 hover:text-gray-700 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(v.id)}
                      className="flex items-center gap-1 text-xs font-bold text-blue-400 hover:text-blue-600 transition-colors"
                    >
                      <Trash2 size={12} /> Remove
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <AddCarModal isOpen={showAddCar || !!editingVehicle} onClose={() => { setShowAddCar(false); setEditingVehicle(null); }} editVehicle={editingVehicle} />
    </>
  );
}

