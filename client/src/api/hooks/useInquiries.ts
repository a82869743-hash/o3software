import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useInquiries = (params?: { status?: string; source?: string }) =>
  useQuery({
    queryKey: ['inquiries', params],
    queryFn: async () => {
      const res = await api.get('/inquiries', { params });
      return res.data;
    },
  });

export const useCreateInquiry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/inquiries', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inquiries'] }),
  });
};

export const useUpdateInquiryStatus = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status }: { id: number; status: string }) => {
      const res = await api.patch(`/inquiries/${id}/status`, { status });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inquiries'] }),
  });
};

export const useConvertInquiry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.post(`/inquiries/${id}/convert`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inquiries'] }),
  });
};

export const useDeleteInquiry = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/inquiries/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inquiries'] }),
  });
};
