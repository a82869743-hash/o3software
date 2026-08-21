import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { StaffMember, AttendanceRecord, StaffPayment, ApiResponse } from '../../types';

export const useStaffList = () =>
  useQuery({
    queryKey: ['staff'],
    queryFn: async () => {
      const res = await api.get<ApiResponse<(StaffMember & { today_attendance: string | null })[]>>('/staff');
      return res.data.data;
    },
  });

export const useStaffDetail = (id: number | undefined) =>
  useQuery({
    queryKey: ['staff', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StaffMember>>(`/staff/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useCreateStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { name: string; mobile: string; password: string; specialisations?: string; email?: string }) => {
      const res = await api.post('/staff', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useUpdateStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; name?: string; mobile?: string; email?: string; specialisations?: string }) => {
      const res = await api.put(`/staff/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useStaffAttendance = (staffId: number | undefined, params?: { from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['staff-attendance', staffId, params],
    queryFn: async () => {
      const res = await api.get<ApiResponse<AttendanceRecord[]>>(`/staff/${staffId}/attendance`, { params });
      return res.data.data;
    },
    enabled: !!staffId,
  });

export const useMarkAttendance = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, ...body }: { staffId: number; status: string; note?: string; att_date?: string }) => {
      const res = await api.post(`/staff/${staffId}/attendance`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff'] }),
  });
};

export const useStaffPayments = (staffId: number | undefined) =>
  useQuery({
    queryKey: ['staff-payments', staffId],
    queryFn: async () => {
      const res = await api.get<ApiResponse<StaffPayment[]>>(`/staff/${staffId}/payments`);
      return res.data.data;
    },
    enabled: !!staffId,
  });

export const useAddPayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, ...body }: { staffId: number; amount: number; purpose: string; payment_date: string }) => {
      const res = await api.post(`/staff/${staffId}/payment`, body);
      return res.data;
    },
    onSuccess: (_d, vars) => qc.invalidateQueries({ queryKey: ['staff-payments', vars.staffId] }),
  });
};

export const useCompletePayment = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, paymentId }: { staffId: number; paymentId: number }) => {
      const res = await api.patch(`/staff/${staffId}/payment/${paymentId}/complete`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-payments'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
    },
  });
};

export const useMyPayments = () =>
  useQuery({
    queryKey: ['my-payments'],
    queryFn: async () => {
      const res = await api.get('/staff/my-payments');
      return res.data;
    },
  });

export const useMyAttendance = (params?: { from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['my-attendance', params],
    queryFn: async () => {
      const res = await api.get('/staff/my-attendance', { params });
      return res.data;
    },
  });

export const useCheckIn = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/staff/check-in');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-attendance'] });
    },
  });
};

export const useCheckOut = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const res = await api.post('/staff/check-out');
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['my-attendance'] });
    },
  });
};

