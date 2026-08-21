import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const usePackages = (params?: { published_only?: boolean }) =>
  useQuery({
    queryKey: ['packages', params],
    queryFn: async () => {
      const res = await api.get('/packages', { params });
      return res.data;
    },
  });

export const usePackage = (id: number | undefined) =>
  useQuery({
    queryKey: ['package', id],
    queryFn: async () => {
      const res = await api.get(`/packages/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useCreatePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/packages', payload);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
};

export const useUpdatePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: any) => {
      const res = await api.put(`/packages/${id}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
};

export const useTogglePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/packages/${id}/toggle`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
};

export const useTogglePackageVisibility = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/packages/${id}/visibility`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
};

export const useDeletePackage = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.delete(`/packages/${id}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['packages'] }),
  });
};
