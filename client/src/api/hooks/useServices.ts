import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useServices = (params?: { search?: string; active_only?: boolean; for_app?: boolean }) =>
  useQuery({
    queryKey: ['services', params],
    queryFn: async () => {
      const res = await api.get('/services', { params });
      return res.data;
    },
  });

export const useCreateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/services', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
};

export const useUpdateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res = await api.put(`/services/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
};

export const useToggleService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/services/${id}/toggle`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
};

export const useDeleteService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/services/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['services'] }),
  });
};

/** Service categories (also drive the customer home tiles when "show on home" is on). */
export const useServiceCategories = () =>
  useQuery({
    queryKey: ['service-categories'],
    queryFn: async () => (await api.get('/services/categories/list')).data.data as any[],
  });

export const useSaveCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: any) =>
      (id ? await api.put(`/services/categories/${id}`, body) : await api.post('/services/categories', body)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-categories'] }); qc.invalidateQueries({ queryKey: ['services'] }); },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => (await api.delete(`/services/categories/${id}`)).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-categories'] }); qc.invalidateQueries({ queryKey: ['services'] }); },
  });
};

/** Saves a new display order: ids in the order customers should see them. */
export const useReorder = (kind: 'services' | 'categories') => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (ids: number[]) => (await api.put(`/services/reorder/${kind}`, { ids })).data,
    onSuccess: () => { qc.invalidateQueries({ queryKey: ['service-categories'] }); qc.invalidateQueries({ queryKey: ['services'] }); },
  });
};
