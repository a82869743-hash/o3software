import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useBrands = () => {
  return useQuery({
    queryKey: ['vehicles', 'brands'],
    queryFn: async () => {
      const res = await api.get('/vehicles/brands');
      return res.data;
    },
  });
};

export const useModels = (brand: string) => {
  return useQuery({
    queryKey: ['vehicles', 'models', brand],
    queryFn: async () => {
      if (!brand) return { data: [] };
      const res = await api.get(`/vehicles/models?brand=${encodeURIComponent(brand)}`);
      return res.data;
    },
    enabled: !!brand,
  });
};

export const useVariants = (brand: string, model: string) => {
  return useQuery({
    queryKey: ['vehicles', 'variants', brand, model],
    queryFn: async () => {
      if (!brand || !model) return { data: [] };
      const res = await api.get(`/vehicles/variants?brand=${encodeURIComponent(brand)}&model=${encodeURIComponent(model)}`);
      return res.data;
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

export const useUpdateVehicle = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, payload }: { id: number; payload: { brand?: string; model?: string; registration_no?: string; car_year?: number; manufacture_year?: number } }) => {
      const res = await api.patch(`/vehicles/${id}`, payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['customer-vehicles'] });
      qc.invalidateQueries({ queryKey: ['vehicles'] });
    },
  });
};

