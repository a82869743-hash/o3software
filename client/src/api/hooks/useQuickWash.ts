import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { QuickWashBooking, QuickWashStats } from '../../types';

// ─── List Quick Washes ──────────────────────
export const useQuickWashes = (params?: { status?: string; date?: string; page?: number }) => {
  return useQuery<QuickWashBooking[]>({
    queryKey: ['quick-washes', params],
    queryFn: async () => {
      const { data } = await api.get('/quick-wash', { params });
      return data.data;
    },
    refetchInterval: 15000, // Auto-refresh every 15 sec for live queue
  });
};

// ─── Queue Stats ────────────────────────────
export const useQuickWashStats = () => {
  return useQuery<QuickWashStats>({
    queryKey: ['quick-wash-stats'],
    queryFn: async () => {
      const { data } = await api.get('/quick-wash/stats');
      return data.data;
    },
    refetchInterval: 10000,
  });
};

// ─── Create Quick Wash ──────────────────────
export const useCreateQuickWash = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      customer_id?: number;
      vehicle_id?: number;
      service_id?: number;
      vehicle_brand?: string;
      vehicle_model?: string;
      vehicle_reg_no?: string;
      vehicle_category?: string;
      notes?: string;
    }) => {
      const { data } = await api.post('/quick-wash', payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-washes'] });
      queryClient.invalidateQueries({ queryKey: ['quick-wash-stats'] });
    },
  });
};

// ─── Update Wash Status ─────────────────────
export const useUpdateWashStatus = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, wash_status }: { id: number; wash_status: string }) => {
      const { data } = await api.patch(`/quick-wash/${id}/status`, { wash_status });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-washes'] });
      queryClient.invalidateQueries({ queryKey: ['quick-wash-stats'] });
    },
  });
};

// ─── Update Wash Phase ──────────────────────
export const useUpdateWashPhase = () => {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, phase }: { id: number; phase: string }) => {
      const { data } = await api.patch(`/quick-wash/${id}/phase`, { phase });
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['quick-washes'] });
      queryClient.invalidateQueries({ queryKey: ['quick-wash-stats'] });
    },
  });
};
