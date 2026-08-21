import { useQuery, useMutation } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { AccountSummary, Transaction, PaginatedResponse, ApiResponse } from '../../types';

export const useAccountSummary = (params?: { from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['accounts', 'summary', params],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AccountSummary>>('/accounts/summary', { params });
      return res.data.data;
    },
  });

export const useAccountKPIs = (params?: { from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['accounts', 'kpis', params],
    queryFn: async () => {
      // Create type structure inline or map it to a generic any since the accounts UI will map it.
      const res = await api.get<ApiResponse<any>>('/accounts/kpis', { params });
      return res.data.data;
    },
  });

export const useTransactions = (params: {
  type?: string; direction?: string; from_date?: string; to_date?: string; page?: number; limit?: number;
}) =>
  useQuery({
    queryKey: ['accounts', 'transactions', params],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<Transaction>>('/accounts/transactions', { params });
      return res.data;
    },
  });

export const useExportReport = () =>
  useMutation({
    mutationFn: async (params: { from_date: string; to_date: string; format: 'excel' | 'pdf' }) => {
      const res = await api.get('/accounts/report', {
        params,
        responseType: 'blob',
      });
      const ext = params.format === 'pdf' ? 'pdf' : 'xlsx';
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `GKAutoHerb_Report_${params.from_date}_to_${params.to_date}.${ext}`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    },
  });

export const usePurchaseBills = (params?: any) =>
  useQuery({
    queryKey: ['accounts', 'purchase-bills', params],
    queryFn: async () => {
      const res = await api.get('/purchase-bills', { params });
      return res.data;
    },
  });

export const useCreatePurchaseBill = () => {
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/purchase-bills', payload);
      return res.data;
    },
  });
};

export const useGstReport = (params?: { month?: string; year?: string; format?: string }) =>
  useQuery({
    queryKey: ['accounts', 'gst-report', params],
    queryFn: async () => {
      const res = await api.get('/gst-reports', { params });
      return res.data.data;
    },
  });

export const useReturns = () =>
  useQuery({
    queryKey: ['accounts', 'returns'],
    queryFn: async () => {
      const res = await api.get('/accounts/returns');
      return res.data.data;
    },
  });

export const useCreateReturn = () => {
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/accounts/returns', payload);
      return res.data;
    },
  });
};
