import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function usePayments(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['payments', params],
    queryFn: async () => {
      const { data } = await api.get('/payments', { params });
      return data;
    },
  });
}

export function usePaymentStats() {
  return useQuery({
    queryKey: ['payment-stats'],
    queryFn: async () => {
      const { data } = await api.get('/payments/stats');
      return data.data;
    },
  });
}

export function useWalletBalance(customerId: string | undefined) {
  return useQuery({
    queryKey: ['wallet-balance', customerId],
    queryFn: async () => {
      if (!customerId) return 0;
      const { data } = await api.get(`/payments/wallet/${customerId}`);
      return data.data.balance;
    },
    enabled: !!customerId,
  });
}

export function useAdvancePayments(status = 'advance_paid') {
  return useQuery({
    queryKey: ['advance-payments', status],
    queryFn: async () => {
      const { data } = await api.get('/payments/advances', { params: { status } });
      return data.data;
    },
  });
}

export function useCreatePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/payments', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payment-stats'] });
    },
  });
}

export function useCreateAdvancePayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/payments/advance', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['advance-payments'] });
      qc.invalidateQueries({ queryKey: ['payment-stats'] });
    },
  });
}

export function useCreateRefund() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/payments/refund', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['payments'] }),
  });
}

export function useSendPaymentReminder() {
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/payments/${id}/remind`);
      return data;
    },
  });
}

export function useCreateRazorpayOrder() {
  return useMutation({
    mutationFn: async (payload: { amount: number; currency?: string; receipt?: string }) => {
      const { data } = await api.post('/payments/razorpay/order', payload);
      return data;
    },
  });
}

export function useVerifyRazorpayPayment() {
  return useMutation({
    mutationFn: async (payload: { razorpay_order_id: string; razorpay_payment_id: string; razorpay_signature: string }) => {
      const { data } = await api.post('/payments/razorpay/verify', payload);
      return data;
    },
  });
}
