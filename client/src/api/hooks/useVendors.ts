import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useVendors(params?: { search?: string; active_only?: boolean }) {
  return useQuery({
    queryKey: ['vendors', params],
    queryFn: () => api.get('/vendors', { params }).then(r => r.data),
  });
}

export function useVendor(id: number | string) {
  return useQuery({
    queryKey: ['vendor', id],
    queryFn: () => api.get(`/vendors/${id}`).then(r => r.data),
    enabled: !!id,
  });
}

export function useCreateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (data: any) => api.post('/vendors', data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useUpdateVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...data }: any) => api.put(`/vendors/${id}`, data).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}

export function useDeleteVendor() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: number) => api.delete(`/vendors/${id}`).then(r => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['vendors'] }),
  });
}
