import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useBalanceSheet(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['balance-sheet', params],
    queryFn: async () => {
      const { data } = await api.get('/balance-sheet', { params });
      return data.data;
    },
  });
}

export function useExpenses(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['expenses', params],
    queryFn: async () => {
      const { data } = await api.get('/balance-sheet/expenses', { params });
      return data;
    },
  });
}

export function useExpenseCategories() {
  return useQuery({
    queryKey: ['expense-categories'],
    queryFn: async () => {
      const { data } = await api.get('/balance-sheet/expense-categories');
      return data.data;
    },
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/balance-sheet/expenses', payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['expenses'] });
      qc.invalidateQueries({ queryKey: ['balance-sheet'] });
    },
  });
}
