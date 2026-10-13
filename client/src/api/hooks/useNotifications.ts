import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import { toast } from 'react-hot-toast';

export interface NotificationLog {
  id: number;
  idempotency_key: string | null;
  customer_id: number | null;
  customer_name?: string | null;
  mobile: string | null;
  email: string | null;
  channel: 'whatsapp' | 'email' | 'sms';
  template_name: string;
  message_body: string;
  attachment_url: string | null;
  attachment_path: string | null;
  status: 'queued' | 'processing' | 'sent' | 'failed' | 'cancelled';
  attempts: number;
  max_retries: number;
  last_attempt_at: string | null;
  next_retry_at: string | null;
  error_message: string | null;
  response_data: any;
  reference_type: string | null;
  reference_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface WarrantyCertificate {
  id: number;
  certificate_no: string;
  job_card_id: number;
  customer_id: number;
  customer_name?: string;
  customer_mobile?: string;
  customer_email?: string;
  vehicle_id: number | null;
  vehicle_reg_no: string;
  vehicle_model: string;
  service_type: string;
  service_name: string;
  warranty_years: number;
  issue_date: string;
  expiry_date: string;
  terms: string | null;
  pdf_path: string | null;
  pdf_url: string | null;
  status: string;
  created_at: string;
}

export const useNotificationLogs = (params?: {
  status?: string;
  channel?: string;
  search?: string;
  customer_id?: number | string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['notification-logs', params],
    queryFn: async () => {
      const { data } = await api.get('/notifications/logs', { params });
      return data;
    },
    refetchInterval: 10000, // Poll every 10s for active queue status
  });
};

export const useNotificationStats = () => {
  return useQuery({
    queryKey: ['notification-stats'],
    queryFn: async () => {
      const { data } = await api.get('/notifications/stats');
      return data;
    },
    refetchInterval: 15000,
  });
};

export const useResendNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/notifications/logs/${id}/resend`);
      return data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Notification requeued for immediate dispatch');
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] });
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Failed to resend notification');
    },
  });
};

export const useWarranties = (params?: {
  search?: string;
  customer_id?: number | string;
  job_card_id?: number | string;
  page?: number;
  limit?: number;
}) => {
  return useQuery({
    queryKey: ['warranties', params],
    queryFn: async () => {
      const { data } = await api.get('/notifications/warranties', { params });
      return data;
    },
  });
};

export const useTestSendNotification = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { channel: string; mobile?: string; email?: string; template_name?: string; message_body?: string }) => {
      const { data } = await api.post('/notifications/test-send', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('Test notification queued successfully');
      queryClient.invalidateQueries({ queryKey: ['notification-logs'] });
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] });
    },
    onError: (err: any) => {
      toast.error(err.response?.data?.error || 'Test send failed');
    },
  });
};
