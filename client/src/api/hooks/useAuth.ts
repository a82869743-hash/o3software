import { useMutation } from '@tanstack/react-query';
import api from '../axiosInstance';
import { User } from '../../types';

interface LoginPayload {
  mobile: string;
  password: string;
}

interface RegisterPayload {
  name: string;
  mobile: string;
  email?: string;
  password: string;
  role?: 'customer' | 'staff';
  car_brand?: string;
  car_model?: string;
  car_reg_no?: string;
  referral_code?: string;
}

interface AuthResponse {
  token: string;
  user: User;
}

export const useLogin = () =>
  useMutation({
    mutationFn: async (payload: LoginPayload): Promise<AuthResponse> => {
      const res = await api.post('/auth/login', payload);
      return res.data.data;
    },
  });

export const useRegister = () =>
  useMutation({
    mutationFn: async (payload: RegisterPayload): Promise<AuthResponse> => {
      const res = await api.post('/auth/register', payload);
      return res.data.data;
    },
  });

export const useChangePassword = () =>
  useMutation({
    mutationFn: async (payload: { old_password: string; new_password: string }) => {
      const res = await api.post('/auth/change-password', payload);
      return res.data;
    },
  });

export const useUpdateProfile = () =>
  useMutation({
    mutationFn: async (payload: { name: string; email: string; address?: string; opt_out_promotional?: number }) => {
      const res = await api.put('/auth/profile', payload);
      return res.data;
    },
  });
