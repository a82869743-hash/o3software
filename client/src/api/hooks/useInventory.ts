import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { InventoryItem, PaginatedResponse, ApiResponse } from '../../types';

export const useInventory = (params: { search?: string; low_stock?: boolean; page?: number; limit?: number; category?: string; brand?: string; status?: string }) =>
  useQuery({
    queryKey: ['inventory', params],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<InventoryItem>>('/inventory', { params });
      return res.data;
    },
  });

export const useInventoryCategories = () =>
  useQuery({
    queryKey: ['inventory-categories'],
    queryFn: async () => {
      const res = await api.get<{ success: boolean; data: Array<{ category: string; count: number }> }>('/inventory/categories');
      return res.data.data;
    },
    placeholderData: (prev) => prev,
  });

export const useInventoryItem = (id: number | undefined) =>
  useQuery({
    queryKey: ['inventory-item', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<InventoryItem>>(`/inventory/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useCreateInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { product_name: string; unit: string; quantity: number; low_stock_threshold: number }) => {
      const res = await api.post('/inventory', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
};

export const useUpdateInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; product_name?: string; unit?: string; low_stock_threshold?: number }) => {
      const res = await api.put(`/inventory/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
};

export const useAdjustQuantity = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, delta }: { id: number; delta: number }) => {
      const res = await api.patch(`/inventory/${id}/quantity`, { delta });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
};

export const useDeleteInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/inventory/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
};

export const useCreateCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (name: string) => {
      const res = await api.post('/inventory/categories', { name });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useRenameCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ old_name, new_name }: { old_name: string; new_name: string }) => {
      const res = await api.put('/inventory/categories', { old_name, new_name });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};

export const useDeleteCategory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ name, reassign_to }: { name: string; reassign_to?: string }) => {
      const res = await api.delete('/inventory/categories', { data: { name, reassign_to } });
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['inventory-categories'] });
      qc.invalidateQueries({ queryKey: ['inventory'] });
    },
  });
};
