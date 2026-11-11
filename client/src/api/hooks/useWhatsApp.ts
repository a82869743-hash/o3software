import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import { toast } from 'react-hot-toast';

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

export interface ProviderConfigData {
  franchise_id: number;
  provider: 'meta_cloud' | 'aisensy' | 'baileys_demo' | 'mock';
  phone_number?: string;
  phone_number_id?: string;
  business_account_id?: string;
  demo_whitelist?: string;
  is_enabled: number;
  demoModeAllowed: boolean;
  isDemoActive: boolean;
  health: {
    provider: string;
    status: 'connected' | 'disconnected' | 'ready' | 'demo_active';
    details?: any;
  };
}

export const useWhatsAppProviderConfig = () => {
  return useQuery<{ success: boolean; data: ProviderConfigData }>({
    queryKey: ['whatsapp-provider-config'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/provider-config');
      return data;
    },
  });
};

export const useUpdateWhatsAppProviderConfig = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/whatsapp/provider-config', payload);
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res.message || 'WhatsApp provider updated successfully');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-provider-config'] });
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to update WhatsApp provider');
    },
  });
};

export const useBaileysWipeSession = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post('/whatsapp/baileys/wipe');
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res.message || 'Baileys session wiped completely');
      queryClient.invalidateQueries({ queryKey: ['baileys-status'] });
      queryClient.invalidateQueries({ queryKey: ['whatsapp-provider-config'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to wipe Baileys session');
    },
  });
};

export const useWhatsAppUsage = () => {
  return useQuery({
    queryKey: ['whatsapp-usage'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/usage');
      return data;
    },
  });
};

export const useWhatsAppOptOuts = () => {
  return useQuery({
    queryKey: ['whatsapp-opt-outs'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/opt-outs');
      return data;
    },
  });
};

export const useRemoveOptOut = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (phone: string) => {
      const { data } = await api.post('/whatsapp/opt-outs/remove', { phone });
      return data;
    },
    onSuccess: (res: any) => {
      toast.success(res.message || 'Phone unblocked from opt-out list');
      queryClient.invalidateQueries({ queryKey: ['whatsapp-opt-outs'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to remove opt-out');
    },
  });
};

export const useWhatsAppTemplates = () => {
  return useQuery({
    queryKey: ['whatsapp-templates'],
    queryFn: async () => {
      const { data } = await api.get('/whatsapp/templates');
      return data;
    },
  });
};

