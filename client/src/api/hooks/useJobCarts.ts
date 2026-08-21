import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';
import type { JobCart, PaginatedResponse, ApiResponse, VehicleLookup } from '../../types';

// ─── Queries ────────────────────────────────
export const useJobCarts = (params: { status?: string; search?: string; page?: number; limit?: number; from_date?: string; to_date?: string }) =>
  useQuery({
    queryKey: ['job-carts', params],
    queryFn: async () => {
      const res = await api.get<PaginatedResponse<any>>('/job-carts', { params });
      return res.data;
    },
  });

export const useJobCart = (id: string | number | undefined) =>
  useQuery({
    queryKey: ['job-cart', id],
    queryFn: async () => {
      const res = await api.get<ApiResponse<JobCart>>(`/job-carts/${id}`);
      return res.data.data;
    },
    enabled: !!id,
  });

export const useVehicleLookup = (regNo: string) =>
  useQuery({
    queryKey: ['vehicle-lookup', regNo],
    queryFn: async () => {
      const res = await api.get<ApiResponse<VehicleLookup>>(`/job-carts/vehicles/lookup/${encodeURIComponent(regNo)}`);
      return res.data.data;
    },
    enabled: regNo.length >= 4,
    retry: false,
  });

// ─── Mutations ──────────────────────────────
export const useCreateJobCart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const res = await api.post('/job-carts', payload);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-carts'] }),
  });
};

export const useSubmitJobCart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: number) => {
      const res = await api.patch(`/job-carts/${id}/submit`);
      return res.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-carts'] });
      qc.invalidateQueries({ queryKey: ['job-cart'] });
    },
  });
};

export const useCompleteJobCart = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; credits_awarded?: number; free_washes_awarded?: number; wax_awarded?: number }) => {
      const res = await api.patch(`/job-carts/${id}/complete`, body);
      return res.data.data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['job-carts'] });
      qc.invalidateQueries({ queryKey: ['job-cart'] });
      qc.invalidateQueries({ queryKey: ['accounts'] });
      qc.invalidateQueries({ queryKey: ['dashboard'] });
    },
  });
};

export const useAddService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, ...body }: { id: number; service_name: string; service_price: number; labor_charges: number; products?: any[] }) => {
      const res = await api.post(`/job-carts/${id}/services`, body);
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-cart'] }),
  });
};

export const useUpdateService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cartId, serviceId, ...body }: { cartId: number; serviceId: number; [key: string]: any }) => {
      const res = await api.put(`/job-carts/${cartId}/services/${serviceId}`, body);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-cart'] }),
  });
};

export const useDeleteService = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cartId, serviceId }: { cartId: number; serviceId: number }) => {
      const res = await api.delete(`/job-carts/${cartId}/services/${serviceId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-cart'] }),
  });
};

export const useUploadPhoto = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cartId, files, type }: { cartId: number; files: File[] | File; type: 'before' | 'after' }) => {
      const formData = new FormData();
      const fileArray = Array.isArray(files) ? files : [files];
      fileArray.forEach(f => formData.append('photos', f));
      formData.append('type', type);
      const res = await api.post(`/job-carts/${cartId}/photos`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-cart'] }),
  });
};

export const useDeletePhoto = () => {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ cartId, photoId }: { cartId: number; photoId: number }) => {
      const res = await api.delete(`/job-carts/${cartId}/photos/${photoId}`);
      return res.data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['job-cart'] }),
  });
};
