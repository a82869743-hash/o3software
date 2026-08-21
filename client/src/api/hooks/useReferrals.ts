import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import { toast } from 'react-hot-toast';

export const useReferralCode = (customerId: number | string | 'mine') => {
  return useQuery({
    queryKey: ['referral-code', customerId],
    queryFn: async () => {
      const id = customerId === 'mine' ? 'mine' : customerId;
      // In the backend, getReferralCode uses req.params.customer_id. 
      // If we are logged in as customer, we can fetch their ID or let server handle.
      const res = await api.get(`/referrals/${id}/code`);
      return res.data.data;
    },
    enabled: !!customerId,
  });
};

export const useReferralHistory = (customerId: number | string | 'mine') => {
  return useQuery({
    queryKey: ['referral-history', customerId],
    queryFn: async () => {
      const id = customerId === 'mine' ? 'mine' : customerId;
      const res = await api.get(`/referrals/${id}/history`);
      return res.data.data;
    },
    enabled: !!customerId,
  });
};

export const useApplyReferral = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { code: string; new_customer_id: number | string }) => {
      const res = await api.post('/referrals/apply', payload);
      return res.data;
    },
    onSuccess: (data) => {
      toast.success(data.message || 'Referral code applied successfully');
      queryClient.invalidateQueries({ queryKey: ['referral-history'] });
      queryClient.invalidateQueries({ queryKey: ['loyalty'] });
    },
    onError: (error: any) => {
      toast.error(error.response?.data?.error || 'Failed to apply referral code');
    },
  });
};
