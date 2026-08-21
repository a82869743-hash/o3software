import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useStaffTasks(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-tasks', params],
    queryFn: async () => {
      const { data } = await api.get('/staff-hr/tasks', { params });
      return data.data;
    },
  });
}

export function useCreateStaffTask() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/staff-hr/tasks', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-tasks'] }),
  });
}

export function useUpdateTaskStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await api.put(`/staff-hr/tasks/${id}/status`, { status });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-tasks'] }),
  });
}

export function useStaffLeaves(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-leaves', params],
    queryFn: async () => {
      const { data } = await api.get('/staff-hr/leaves', { params });
      return data.data;
    },
  });
}

export function useRequestLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/staff-hr/leaves', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-leaves'] }),
  });
}

export function useUpdateLeaveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const { data } = await api.put(`/staff-hr/leaves/${id}/status`, { status });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-leaves'] }),
  });
}

export function useStaffPerformance(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-performance', params],
    queryFn: async () => {
      const { data } = await api.get('/staff-hr/performance', { params });
      return data.data;
    },
  });
}

export function useAddPerformanceReview() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/staff-hr/performance', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-performance'] }),
  });
}

export function useStaffAttendance(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-attendance', params],
    queryFn: async () => {
      const { data } = await api.get('/staff-hr/attendance', { params });
      return data.data || [];
    },
  });
}

export function useStaffAttendanceSummary(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-attendance-summary', params],
    queryFn: async () => {
      const { data } = await api.get('/staff/all-attendance', { params });
      return data;
    },
  });
}

export function useMarkStaffAttendance() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ staffId, ...payload }: { staffId: number; [key: string]: any }) => {
      const { data } = await api.post(`/staff/${staffId}/attendance`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['staff-attendance-summary'] });
      qc.invalidateQueries({ queryKey: ['staff-attendance'] });
    },
  });
}

export function useStaffPayroll(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['staff-payroll', params],
    queryFn: async () => {
      const { data } = await api.get('/staff-hr/payroll', { params });
      return data.data || [];
    },
  });
}

export function useProcessPayroll() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { month: number; year: number }) => {
      const { data } = await api.post('/staff-hr/payroll/process', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-payroll'] }),
  });
}

export function useUpdatePayrollItem() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...payload }: { id: number; [key: string]: any }) => {
      const { data } = await api.put(`/staff-hr/payroll/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['staff-payroll'] }),
  });
}
