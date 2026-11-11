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

/** Record money received against a balance due (old / imported / manual dues). */
export function useCollectAdvance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, amount, payment_method }: { id: number; amount: number; payment_method: string }) => {
      const { data } = await api.post(`/payments/advances/${id}/collect`, { amount, payment_method });
      return data;
    },
    onSuccess: () => {
      ['advance-payments', 'payment-stats', 'payments', 'user-packages'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    },
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

// Studio checked the bank app for a customer's UPI QR payment: confirm (counts it) or reject.
export function useVerifyQrPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, action, reason }: { id: number; action: 'confirm' | 'reject'; reason?: string }) => {
      const { data } = await api.post(`/payments/${id}/qr-verify`, { action, reason });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['payments'] });
      qc.invalidateQueries({ queryKey: ['payment-stats'] });
      qc.invalidateQueries({ queryKey: ['advance-payments'] });
    },
  });
}
