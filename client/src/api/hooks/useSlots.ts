import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useSlots = (params: { date?: string; from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['slots', params],
    queryFn: async () => {
      const res = await api.get('/slots', { params });
      return res.data;
    },
    enabled: !!(params.date || (params.from_date && params.to_date)),
  });

export const useCreateSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { slot_date: string; start_time: string; end_time: string; max_capacity: number }) => {
      const res = await api.post('/slots', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
};

export const useBulkCreateSlots = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      from_date: string; to_date: string;
      start_time: string; end_time: string;
      slot_duration_minutes: number; max_capacity: number;
    }) => {
      const res = await api.post('/slots/bulk', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
};

export const useUpdateSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; max_capacity?: number; is_blocked?: boolean; reason?: string }) => {
      const res = await api.patch(`/slots/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
};

export const useDeleteSlot = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/slots/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['slots'] }),
  });
};
