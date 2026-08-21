import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useQuotations = (params?: { page?: number; limit?: number; status?: string; search?: string; from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['quotations', params],
    queryFn: async () => {
      const res = await api.get('/quotations', { params });
      return res.data;
    },
  });

export const useQuotation = (id: number | undefined) =>
  useQuery({
    queryKey: ['quotation', id],
    queryFn: async () => {
      const res = await api.get(`/quotations/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useCreateQuotation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/quotations', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
};

export const useUpdateQuotation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res = await api.put(`/quotations/${id}`, body);
      return res.data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
      qc.invalidateQueries({ queryKey: ['quotation', variables.id] });
    },
  });
};

export const useDeleteQuotation = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/quotations/${id}`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['quotations'] });
    },
  });
};
