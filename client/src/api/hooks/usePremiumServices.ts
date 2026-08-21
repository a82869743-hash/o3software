import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

/** Fetch only premium services (is_premium = 1) */
export const usePremiumServices = () =>
  useQuery({
    queryKey: ['services', 'premium'],
    queryFn: async () => {
      const res = await api.get('/services');
      // Filter premium on client — avoids needing a new endpoint
      const all = res.data.data || [];
      return all.filter((s: any) => s.is_premium === 1 || s.is_premium === true);
    },
  });

/** Fetch add-ons for a specific service */
export const useServiceAddons = (serviceId?: number) =>
  useQuery({
    queryKey: ['service-addons', serviceId],
    queryFn: async () => {
      const res = await api.get(`/services/${serviceId}/addons`);
      return res.data.data || [];
    },
    enabled: !!serviceId,
  });

/** Create a new add-on for a service */
export const useCreateAddon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, ...body }: { serviceId: number; addon_name: string; addon_price: number; duration_minutes?: number }) => {
      const res = await api.post(`/services/${serviceId}/addons`, body);
      return res.data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-addons', vars.serviceId] });
    },
  });
};

/** Update an existing add-on */
export const useUpdateAddon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, addonId, ...body }: { serviceId: number; addonId: number; addon_name?: string; addon_price?: number; duration_minutes?: number; is_active?: boolean }) => {
      const res = await api.put(`/services/${serviceId}/addons/${addonId}`, body);
      return res.data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-addons', vars.serviceId] });
    },
  });
};

/** Delete an add-on */
export const useDeleteAddon = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ serviceId, addonId }: { serviceId: number; addonId: number }) => {
      const res = await api.delete(`/services/${serviceId}/addons/${addonId}`);
      return res.data;
    },
    onSuccess: (_d, vars) => {
      qc.invalidateQueries({ queryKey: ['service-addons', vars.serviceId] });
    },
  });
};

/** Toggle premium flag for a service */
export const useTogglePremium = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, is_premium }: { id: number; is_premium: boolean }) => {
      const res = await api.put(`/services/${id}`, { is_premium: is_premium ? 1 : 0 });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['services'] });
    },
  });
};
