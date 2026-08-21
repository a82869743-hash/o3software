import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useWallet(customerId: string | number | undefined) {
  return useQuery({
    queryKey: ['wallet', customerId],
    queryFn: () => api.get(`/api/wallets/${customerId}`).then(r => r.data),
    enabled: !!customerId,
  });
}

export function useWalletTransactions(customerId: string | number | undefined) {
  return useQuery({
    queryKey: ['wallet-txns', customerId],
    queryFn: () => api.get(`/api/wallets/${customerId}/transactions`).then(r => r.data),
    enabled: !!customerId,
  });
}

export function useAdjustWallet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ customer_id, ...data }: any) => api.post(`/api/wallets/${customer_id}/adjust`, data).then(r => r.data),
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: ['wallet', vars.customer_id] });
      qc.invalidateQueries({ queryKey: ['wallet-txns', vars.customer_id] });
    },
  });
}
