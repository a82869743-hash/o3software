import { QueryClient } from '@tanstack/react-query';

/** One shared cache for the whole app (also used to refresh lists after any save — see axiosInstance). */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      // live updates (utils/liveUpdates.ts) refresh screens the moment anything changes; this also catches up when the app is reopened
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      staleTime: 10_000,
    },
  },
});
