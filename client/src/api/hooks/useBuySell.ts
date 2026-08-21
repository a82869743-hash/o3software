import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { BuySell, PaginatedResponse } from '../../types';

export const useBuySellList = (params: { type?: string; status?: string; page?: number; limit?: number; from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['buy-sell', params],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<BuySell>>('/buy-sell', { params });
      return res.data;
    },
  });

export const useCreateBuySell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Partial<BuySell> & { type: string; party_name: string; product_name: string; quantity: number; unit_price: number; transaction_date: string }) => {
      const res = await api.post('/buy-sell', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['buy-sell'] }),
  });
};

export const useCompleteBuySell = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/buy-sell/${id}/complete`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['buy-sell'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const downloadBuySellInvoice = async (id: number) => {
  const res = await api.get(`/buy-sell/${id}/invoice`, { responseType: 'blob' });
  const url = window.URL.createObjectURL(new Blob([res.data]));
  const link = document.createElement('a');
  link.href = url;
  link.setAttribute('download', `BuySell_Invoice_${id}.pdf`);
  document.body.appendChild(link);
  link.click();
  link.parentNode?.removeChild(link);
};
