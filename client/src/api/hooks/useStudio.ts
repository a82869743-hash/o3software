import { useQuery } from '@tanstack/react-query';
import api from '../axiosInstance';

export interface StudioInfo {
  studio_name: string; latitude?: number | null; longitude?: number | null; tagline?: string; mobile: string; email: string; address: string; gstin?: string;
  upi_id?: string; upi_name?: string; upi_number?: string; upi_qr_url?: string | null;
  google_review_url?: string; app_banner_url?: string; app_offer_title?: string; app_offer_subtitle?: string;
  app_offer_code?: string; app_offer_popup?: boolean; support_whatsapp?: string; support_hours?: string;
}

/** Studio details + active payment QR from Settings (one cached request for the whole app). */
export const useStudio = () =>
  useQuery({
    queryKey: ['studio-public'],
    queryFn: async (): Promise<StudioInfo> => (await api.get('/settings/public')).data.data,
    staleTime: 5 * 60 * 1000,
  });
