import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useLoyalty = (customerId?: number | 'mine') =>
  useQuery({
    queryKey: ['loyalty', customerId],
    queryFn: async () => {
      const path = customerId === 'mine' ? '/loyalty/mine' : `/loyalty/${customerId}`;
      const res = await api.get(path);
      return res.data.data;
    },
    enabled: !!customerId,
  });

export const useLoyaltyHistory = (customerId?: number | 'mine') =>
  useQuery({
    queryKey: ['loyalty-history', customerId],
    queryFn: async () => {
      const path = customerId === 'mine' ? '/loyalty/mine/history' : `/loyalty/${customerId}/history`;
      const res = await api.get(path);
      return res.data.data;
    },
    enabled: !!customerId,
  });

export const useUpdateLoyalty = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ customerId, ...body }: { customerId: number; credits?: number; free_washes?: number; wax_count?: number; note?: string }) => {
      const res = await api.patch(`/loyalty/${customerId}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['loyalty'] }),
  });
};

export const useLoyaltySearch = (q: string) =>
  useQuery({
    queryKey: ['loyalty-search', q],
    queryFn: async () => {
      const res = await api.get('/loyalty/search', { params: { q } });
      return res.data.data;
    },
    enabled: q.length >= 2,
  });
