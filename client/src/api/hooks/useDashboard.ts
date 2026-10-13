import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useDashboardStats = (params?: { timeframe?: string; franchise_id?: string | number }) =>
  useQuery({
    queryKey: ['dashboard', 'stats', params?.timeframe || 'today', params?.franchise_id || 'default'],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats', { params });
      return res.data.data;
    },
    refetchInterval: 30_000, // Auto-refresh every 30s
  });

export const useCustomerDashboard = () =>
  useQuery({
    queryKey: ['dashboard', 'customer'],
    queryFn: async () => {
      const res = await api.get('/dashboard/customer');
      return res.data.data;
    },
    refetchInterval: 60_000, // Auto-refresh every 60s
  });
