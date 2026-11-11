import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export const usePickups = () =>
  useQuery({
    queryKey: ['pickup-requests'],
    queryFn: async () => {
      const res = await api.get('/pickup-requests');
      return res.data;
    },
  });

export const useAssignPickupStaff = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, assigned_staff_id }: { id: number; assigned_staff_id: number }) => {
      const res = await api.patch(`/pickup-requests/${id}/assign`, { assigned_staff_id });
      return res.data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['pickup-requests'] });
      qc.invalidateQueries({ queryKey: ['pickup-request', variables.id] });
    },
  });
};

export const useMarkPickedUp = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/pickup-requests/${id}/picked-up`);
      return res.data;
    },
    onSuccess: (_, id) => {
      qc.invalidateQueries({ queryKey: ['pickup-requests'] });
      qc.invalidateQueries({ queryKey: ['pickup-request', id] });
    },
  });
};
