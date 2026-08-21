import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useMessagesLog = (params?: any) =>
  useQuery({
    queryKey: ['messages', params],
    queryFn: async () => {
      const res = await api.get('/messages/log', { params });
      return res.data;
    },
  });

export const useMessagePreview = (campaign: string) =>
  useQuery({
    queryKey: ['messages', 'preview', campaign],
    queryFn: async () => {
      if (!campaign) return { data: null };
      const res = await api.get('/messages/bulk/preview', { params: { campaign } });
      return res.data;
    },
    enabled: !!campaign
  });

export const useSendBulkMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { message_type: string; channel: string; target_audience?: string; message_content: string }) => {
      const res = await api.post('/messages/bulk', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
};

export const useSendSingleMessage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { customer_id: number; channel: string; message_content: string; message_type?: string }) => {
      const res = await api.post('/messages/send', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['messages'] }),
  });
};
