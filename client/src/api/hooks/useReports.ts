import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';

interface ReportParams {
  from_date: string;
  to_date: string;
  format?: 'json' | 'xlsx' | 'pdf';
}

export function useSalesReport(params: ReportParams) {
  return useQuery({
    queryKey: ['report-sales', params],
    queryFn: () => api.get('/reports/sales', { params }).then(r => r.data),
    enabled: !!params.from_date && !!params.to_date,
  });
}

export function useInventoryReport() {
  return useQuery({
    queryKey: ['report-inventory'],
    queryFn: () => api.get('/reports/inventory').then(r => r.data),
  });
}

export function useJobCardReport(params: { from_date?: string; to_date?: string; status?: string; staff_id?: string }) {
  return useQuery({
    queryKey: ['report-jobcards', params],
    queryFn: () => api.get('/reports/job-cards', { params }).then(r => r.data),
    enabled: !!params.from_date && !!params.to_date,
  });
}

export function downloadReport(type: 'sales' | 'inventory' | 'job-cards' | 'package-history', params: any, format: 'xlsx' | 'pdf') {
  return api.get(`/reports/${type}`, {
    params: { ...params, format },
    responseType: 'blob',
  }).then(res => {
    const url = URL.createObjectURL(res.data);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${type}_report.${format}`;
    a.click();
    URL.revokeObjectURL(url);
  });
}

export function useWelcomeRewardsReport() {
  return useQuery({
    queryKey: ['report-welcome-rewards'],
    queryFn: () => api.get('/reports/welcome-rewards').then(r => r.data),
  });
}
