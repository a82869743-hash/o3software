import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useDashboardStats = () =>
  useQuery({
    queryKey: ['dashboard', 'stats'],
    queryFn: async () => {
      const res = await api.get('/dashboard/stats');
      return res.data.data;
    },
    refetchInterval: 60_000, // Auto-refresh every 60s
  });

export const useCustomerDashboard = () =>
  useQuery({
    queryKey: ['dashboard', 'customer'],
    queryFn: async () => {
      const res = await api.get('/dashboard/customer');
      return res.data.data;
    },
    refetchInterval: 120_000, // Auto-refresh every 2 min
  });
