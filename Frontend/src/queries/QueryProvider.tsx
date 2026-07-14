import type { ReactNode } from 'react';
import { QueryClientProvider } from '@tanstack/react-query';
import { ReactQueryDevtools } from '@tanstack/react-query-devtools';
import { queryClient } from './queryClient';
import { setupOnlineManager } from './onlineManager';
import { setupQueryInvalidationBridge } from './queryInvalidationBridge';
import { setupWidgetNextGamesSync } from '@/services/widgetNextGamesSync';

setupOnlineManager();
setupQueryInvalidationBridge(queryClient);
setupWidgetNextGamesSync(queryClient);

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {import.meta.env.DEV && import.meta.env.VITE_DISABLE_RQ_DEVTOOLS !== '1' ? (
        <ReactQueryDevtools initialIsOpen={false} />
      ) : null}
    </QueryClientProvider>
  );
}
