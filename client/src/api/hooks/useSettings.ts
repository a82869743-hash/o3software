import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useSettings = () =>
  useQuery({
    queryKey: ['settings'],
    queryFn: async () => {
      const res = await api.get('/settings');
      return res.data;
    },
  });

export const useUpdateSettings = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: Record<string, string>) => {
      const res = await api.patch('/settings', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['settings'] }),
  });
};
