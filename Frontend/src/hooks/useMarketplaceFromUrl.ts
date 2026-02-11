import { useLocation, useSearchParams } from 'react-router-dom';

export function useMarketplaceFromUrl() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const subtab: 'market' | 'my' = location.pathname === '/marketplace/my' ? 'my' : 'market';
  const item = searchParams.get('item') || undefined;

  return { subtab, item };
}
