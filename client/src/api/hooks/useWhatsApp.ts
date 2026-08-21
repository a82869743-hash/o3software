import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import { toast } from 'react-hot-toast';

export const useWhatsAppMessages = (params?: { customer_id?: string; status?: string; message_type?: string; page?: number; limit?: number }) => {
  return useQuery({
    queryKey: ['whatsapp-messages', params],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp', { params });
      return data;
    },
  });
};

export const useWhatsAppStats = () => {
  return useQuery({
    queryKey: ['whatsapp-stats'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/stats');
      return data;
    },
  });
};

export const useSendWhatsApp = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { phone: string; message: string; customer_id?: string }) => {
      const { data } = await api.post('/whatsapp/send-manual', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('WhatsApp message sent successfully');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to send WhatsApp message');
    },
  });
};
