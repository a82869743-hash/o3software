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
    mutationFn: async (payload: { phone: string; message: string; customer_id?: string | number; customer_name?: string }) => {
      const { data } = await api.post('/whatsapp/send-manual', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('WhatsApp message dispatched successfully');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-stats'] });
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] });
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to dispatch WhatsApp message');
    },
  });
};

export interface BaileysStatusData {
  connected: boolean;
  state: 'qr' | 'connecting' | 'open' | 'disconnected' | 'logged_out';
  phone: string | null;
  qr: string | null;
  rawQr: string | null;
  pairingCode?: string | null;
}

export const useBaileysStatus = () => {
  return useQuery<{ success: boolean; data: BaileysStatusData }>({
    queryKey: ['baileys-status'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/baileys/status');
      return data;
    },
    refetchInterval: (query) => {
      const state = query.state.data?.data?.state;
      // Auto-poll every 3s if waiting for QR scan or connecting
      if (state === 'qr' || state === 'connecting') return 3000;
      return 15000;
    },
  });
};

export const useBaileysConnect = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/whatsapp/baileys/connect');
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res.message || 'WhatsApp connection initiated');
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to initiate WhatsApp connection');
    },
  });
};

export const useBaileysDisconnect = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/whatsapp/baileys/disconnect');
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res.message || 'WhatsApp disconnected');
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to disconnect WhatsApp');
    },
  });
};

export const useBaileysSendTest = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { mobile: string; message?: string }) => {
      const { data } = await api.post('/whatsapp/baileys/send-test', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('Test WhatsApp message sent directly!');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-messages'] });
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to send test WhatsApp message');
    },
  });
};

export const useBaileysRequestPairingCode = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phone?: string) => {
      const { data } = await api.post('/whatsapp/baileys/pairing-code', { phone });
      return data;
    },
    onSuccess: (data: any) => {
      toast.success(`Pairing code generated: ${data.pairingCode}`);
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate pairing code');
    },
  });
};

export const usePreviewHumanized = () => {
  return useMutation({
    mutationFn: async (payload: { eventTrigger?: string; variables?: Record<string, any>; customText?: string }) => {
      const { data } = await api.post('/whatsapp/preview-humanized', payload);
      return data;
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to generate dynamic preview');
    },
  });
};

