import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useBookings = (params: {
  page?: number;
  limit?: number;
  status?: string;
  search?: string;
  slot_id?: number;
}) =>
  useQuery({
    queryKey: ['bookings', params],
    queryFn: async () => {
      const res = await api.get('/bookings', { params });
      return res.data;
    },
  });

export const useBooking = (id: number | undefined) =>
  useQuery({
    queryKey: ['booking', id],
    queryFn: async () => {
      const res = await api.get(`/bookings/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useVehicleHistory = (regNo: string) =>
  useQuery({
    queryKey: ['vehicle-history', regNo],
    queryFn: async () => {
      const res = await api.get(`/bookings/vehicle-history/${encodeURIComponent(regNo)}`);
      return res.data.data;
    },
    enabled: regNo.length >= 4,
    retry: false,
  });

export const useCreateBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      slot_id: number;
      service_id?: number; service_ids?: number[]; package_id?: number; package_service_name?: string;
      vehicle_id?: number;
      vehicle_brand?: string; vehicle_model?: string; vehicle_reg_no?: string;
      vehicle_category?: string;
      is_free_wash?: boolean; use_package?: boolean; notes?: string;
      pay_advance?: boolean | 'full' | 'part' | 'none';
      pickup_type?: string;
      pickup_address_details?: any;
    }) => {
      const res = await api.post('/bookings', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
};

export const useCancelBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/bookings/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
};

export const useCanChangeBooking = (id: number | undefined) =>
  useQuery({
    queryKey: ['booking-can-change', id],
    queryFn: async () => {
      const res = await api.get(`/bookings/${id}/can-change`);
      return res.data;
    },
    enabled: !!id,
  });

export const useChangeBookingServices = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, service_ids }: { id: number; service_ids: number[] }) => {
      const res = await api.patch(`/bookings/${id}/change-services`, { service_ids });
      return res.data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['booking', variables.id] });
      qc.invalidateQueries({ queryKey: ['booking-can-change', variables.id] });
    },
  });
};

export const useCreateManualBooking = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: {
      customer_id: number;
      slot_id: number;
      service_id?: number;
      service_ids?: number[];
      package_id?: number;
      package_service_name?: string;
      vehicle_id?: number;
      vehicle_brand?: string;
      vehicle_model?: string;
      vehicle_reg_no?: string;
      vehicle_category?: string;
      is_free_wash?: boolean;
      use_package?: boolean;
      notes?: string;
      booking_notes?: string;
    }) => {
      const res = await api.post('/bookings/manual', payload);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['bookings'] });
      qc.invalidateQueries({ queryKey: ['slots'] });
    },
  });
};
