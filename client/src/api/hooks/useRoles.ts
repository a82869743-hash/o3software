import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useRoles() {
  return useQuery({
    queryKey: ['roles'],
    queryFn: async () => {
      const { data } = await api.get('/admin/roles');
      return data.data || [];
    },
  });
}

export function usePermissions() {
  return useQuery({
    queryKey: ['permissions'],
    queryFn: async () => {
      const { data } = await api.get('/admin/roles/permissions');
      return data.data || [];
    },
  });
}

export function useRolePermissions(roleId: number | null) {
  return useQuery({
    queryKey: ['role-permissions', roleId],
    queryFn: async () => {
      if (!roleId) return [];
      const { data } = await api.get(`/admin/roles/${roleId}/permissions`);
      return data.data || [];
    },
    enabled: !!roleId,
  });
}

export function useCreateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { role_name: string; description: string }) => {
      const { data } = await api.post('/admin/roles', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useUpdateRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, role_name, description }: { id: number; role_name: string; description: string }) => {
      const { data } = await api.put(`/admin/roles/${id}`, { role_name, description });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useDeleteRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const { data } = await api.delete(`/admin/roles/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['roles'] }),
  });
}

export function useSaveRolePermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ roleId, permissionIds }: { roleId: number; permissionIds: number[] }) => {
      const { data } = await api.post(`/admin/roles/${roleId}/permissions`, { permission_ids: permissionIds });
      return data;
    },
    onSuccess: (_, variables) => {
      qc.invalidateQueries({ queryKey: ['role-permissions', variables.roleId] });
    },
  });
}
