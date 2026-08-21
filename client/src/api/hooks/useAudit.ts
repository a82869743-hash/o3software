import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useAuditLogs(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['audit-logs', params],
    queryFn: async () => {
      const { data } = await api.get('/audit', { params });
      return data;
    },
  });
}

export function useAuditSummary() {
  return useQuery({
    queryKey: ['audit-summary'],
    queryFn: async () => {
      const { data } = await api.get('/audit/summary');
      return data.data;
    },
  });
}
