import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useServices = (params?: { search?: string; active_only?: boolean }) =>
  useQuery({
    queryKey: ['services', params],
    queryFn: async () => {
      const res = await api.get('/services', { params });
      return res.data;
    },
  });

export const useService = (id: number | undefined) =>
  useQuery({
    queryKey: ['service', id],
    queryFn: async () => {
      const res = await api.get(`/services/${id}`);
      return res.data.data;
    },
    enabled: !!id,
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
