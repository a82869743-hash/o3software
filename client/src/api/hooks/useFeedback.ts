import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import api from '../axiosInstance';

export function useFeedback(params?: Record<string, string>) {
  return useQuery({
    queryKey: ['feedback', params],
    queryFn: async () => {
      const { data } = await api.get('/feedback', { params });
      return data;
    },
  });
}

export function useFeedbackStats() {
  return useQuery({
    queryKey: ['feedback-stats'],
    queryFn: async () => {
      const { data } = await api.get('/feedback/stats');
      return data.data;
    },
  });
}

export function useSubmitFeedback() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: any) => {
      const { data } = await api.post('/feedback', payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ['feedback'] }),
  });
}

export function useFeedbackFormContext(token: string | undefined) {
  return useQuery({
    queryKey: ['feedback-form-context', token],
    queryFn: async () => {
      if (!token) return null;
      const { data } = await api.get(`/feedback/form/${token}`);
      return data.data;
    },
    enabled: !!token,
    retry: false
  });
}
