import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const useImportCustomers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/import/customers', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['customers'] }),
  });
};

export const useImportInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post('/import/inventory', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['inventory'] }),
  });
};
