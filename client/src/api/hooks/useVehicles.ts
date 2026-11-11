import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { carDataFull, getModelsForBrand, getVariantsForModel } from '../../utils/carData';
import api from '../axiosInstance';

// The full Indian car dataset is always merged with brands/models already saved on customer vehicles,
// so every dropdown (job card, quick wash, booking, add car, registration) shows the complete list.
const uniqSort = (arr: string[]) => Array.from(new Set(arr.filter(Boolean).map(s => String(s).trim()))).filter(s => !/^others?$/i.test(s)).sort((a, b) => a.localeCompare(b));

export const useBrands = () => {
  return useQuery({
    queryKey: ['vehicles', 'brands'],
    queryFn: async () => {
      let live: string[] = [];
      try { live = (await api.get('/vehicles/brands')).data?.data || []; } catch { /* dataset only */ }
      return { success: true, data: uniqSort([...Object.keys(carDataFull), ...live]) };
    },
    staleTime: 10 * 60 * 1000,
  });
};

export const useModels = (brand: string) => {
  return useQuery({
    queryKey: ['vehicles', 'models', brand],
    queryFn: async () => {
      if (!brand) return { data: [] };
      let live: string[] = [];
      try { live = (await api.get(`/vehicles/models?brand=${encodeURIComponent(brand)}`)).data?.data || []; } catch { /* dataset only */ }
      return { success: true, data: uniqSort([...getModelsForBrand(brand), ...live]) };
    },
    enabled: !!brand,
  });
};

export const useVariants = (brand: string, model: string) => {
  return useQuery({
    queryKey: ['vehicles', 'variants', brand, model],
    queryFn: async () => {
      if (!brand || !model) return { data: [] };
      let live: string[] = [];
      try { live = (await api.get(`/vehicles/variants?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`)).data?.data || []; } catch { /* dataset only */ }
      return { success: true, data: uniqSort([...getVariantsForModel(brand, model), ...live]) };
    },
    enabled: !!brand && !!model,
  });
};

export const useCustomerVehicles = () => {
  return useQuery({
    queryKey: ['customer-vehicles'],
    queryFn: async () => {
      const res = await api.get('/vehicles/my-vehicles');
      return res.data;
    },
  });
};

