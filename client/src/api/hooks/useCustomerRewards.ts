import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import { toast } from 'react-hot-toast';

export const useCustomerRewards = (params?: { customer_id?: string; redeemed?: boolean }) => {
  return useQuery({
    queryKey: ['customer-rewards', params],
    queryFn: async () => {
      const { data } = await api.get('/customer-rewards', { params });
      return data;
    },
  });
};

export const useAwardWelcomeReward = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { customer_id: string }) => {
      const { data } = await api.post('/customer-rewards/award-welcome', payload);
      return data;
    },
    onSuccess: () => {
      toast.success('Welcome reward awarded successfully');
      queryClient.invalidateQueries({ queryKey: ['customer-rewards'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to award welcome reward');
    },
  });
};

export const useRedeemReward = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.post(`/customer-rewards/${id}/redeem`);
      return data;
    },
    onSuccess: () => {
      toast.success('Reward redeemed successfully');
      queryClient.invalidateQueries({ queryKey: ['customer-rewards'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to redeem reward');
    },
  });
};
