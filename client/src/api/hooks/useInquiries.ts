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
