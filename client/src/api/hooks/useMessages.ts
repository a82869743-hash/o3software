import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useMessagesLog = (params?: any, enabled = true) =>
  useQuery({
    queryKey: ['messages', params],
    enabled,
    queryFn: async () => {
      const res = await api.get('/messages/log', { params });
      return res.data;
    },
  });

export type Audience = { audience: string; days?: number; car_types?: string[]; customer_ids?: number[] };

export const useMessageAudiences = () =>
  useQuery({
    queryKey: ['messages', 'audiences'],
    queryFn: async () => (await api.get('/messages/bulk/audiences')).data,
    staleTime: 10 * 60 * 1000,
  });

export const useMessagePreview = (a: Audience) =>
  useQuery({
    queryKey: ['messages', 'preview', a],
    queryFn: async () => {
      const res = await api.get('/messages/bulk/preview', { params: {
        audience: a.audience, days: a.days,
        car_types: (a.car_types || []).join(',') || undefined,
        customer_ids: (a.customer_ids || []).join(',') || undefined,
      } });
      return res.data;
    },
    enabled: !!a.audience,
  });

export const useSendBulkMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Audience & { message_content: string }) => {
      const res = await api.post('/messages/bulk', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
};
