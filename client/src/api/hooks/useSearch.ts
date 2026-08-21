import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { GlobalSearchResult } from '../../types';

// ─── Global Search ──────────────────────────
export const useGlobalSearch = (q: string) => {
  return useQuery<GlobalSearchResult>({
    queryKey: ['global-search', q],
    queryFn: async () => {
      const { data } = await api.get('/search/global', { params: { q, limit: 5 } });
      return data.data;
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
};

// ─── Customer Search ────────────────────────
export const useCustomerSearch = (q: string) => {
  return useQuery({
    queryKey: ['search-customers', q],
    queryFn: async () => {
      const { data } = await api.get('/search/customers', { params: { q, limit: 10 } });
      return data.data;
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
};

// ─── Vehicle Search ─────────────────────────
export const useVehicleSearch = (q: string) => {
  return useQuery({
    queryKey: ['search-vehicles', q],
    queryFn: async () => {
      const { data } = await api.get('/search/vehicles', { params: { q, limit: 10 } });
      return data.data;
    },
    enabled: q.length >= 2,
    staleTime: 30_000,
  });
};
