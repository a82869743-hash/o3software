import { useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export interface ImportArgs { file: File; dryRun?: boolean; stock?: 'add' | 'set' }

const send = async (path: string, { file, dryRun, stock }: ImportArgs) => {
  const formData = new FormData();
  formData.append('file', file);
  const res = await api.post(path, formData, {
    params: { dry_run: dryRun ? 1 : undefined, stock },
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return res.data;
};

export const useImportCustomers = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: ImportArgs) => send('/import/customers', a),
    onSuccess: (_d, a) => {
      if (a.dryRun) return;
      ['customers', 'user-packages', 'payments', 'advance-payments', 'payment-stats', 'dashboard'].forEach(k => qc.invalidateQueries({ queryKey: [k] }));
    },
  });
};

export const useImportInventory = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (a: ImportArgs) => send('/import/inventory', a),
    onSuccess: (_d, a) => { if (!a.dryRun) qc.invalidateQueries({ queryKey: ['inventory'] }); },
  });
};
