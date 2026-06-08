import { QueryClient } from '@tanstack/react-query';

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      gcTime: 10 * 60 * 1000,
      retry: 2,
      networkMode: 'online',
      refetchOnReconnect: true,
    },
  },
});
