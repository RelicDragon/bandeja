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

// Automated browsers (Playwright) hide the floating devtools button: it sits over bottom-right
// controls and intercepts clicks, even on a reused dev server started without the env flag.
const showQueryDevtools =
  import.meta.env.DEV &&
  import.meta.env.VITE_DISABLE_RQ_DEVTOOLS !== '1' &&
  !(typeof navigator !== 'undefined' && navigator.webdriver);

export function QueryProvider({ children }: { children: ReactNode }) {
  return (
    <QueryClientProvider client={queryClient}>
      {children}
      {showQueryDevtools ? <ReactQueryDevtools initialIsOpen={false} /> : null}
    </QueryClientProvider>
  );
}
