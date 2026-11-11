import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';
import { useVehicleStore, MyVehicle } from '../../store/vehicleStore';

/** Customer's cars + the selected one (defaults to the primary car). */
export function useMyVehicles() {
  const selectedId = useVehicleStore(s => s.selectedId);
  const q = useQuery({
    queryKey: ['my-vehicles'],
    queryFn: async (): Promise<MyVehicle[]> => {
      const { data } = await api.get('/vehicles');
      return data.data || [];
    },
    staleTime: 60_000,
  });
  const list = q.data || [];
  const selected = list.find(v => v.id === selectedId) || list.find(v => v.is_primary) || list[0] || null;
  return { ...q, vehicles: list, selected };
}
