import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useDeliveries = (params?: { status?: string }) =>
  useQuery({
    queryKey: ['deliveries', params],
    queryFn: async () => {
      const res = await api.get('/deliveries', { params });
      return res.data;
    },
  });

export const useDelivery = (id: number | undefined) =>
  useQuery({
    queryKey: ['delivery', id],
    queryFn: async () => {
      const res = await api.get(`/deliveries/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useDeliveryLocation = (id: number | undefined) =>
  useQuery({
    queryKey: ['delivery-location', id],
    queryFn: async () => {
      const res = await api.get(`/deliveries/${id}/location`);
      return res.data.data;
    },
    enabled: !!id,
    refetchInterval: 5000, // Poll every 5 seconds for live tracking
  });
