import { useLocation, useSearchParams } from 'react-router-dom';

export type ChatsFilter = 'users' | 'bugs' | 'channels' | 'market';

export function useChatsFromUrl() {
  const location = useLocation();
  const [searchParams] = useSearchParams();

  const filter: ChatsFilter =
    location.pathname === '/bugs'
      ? 'bugs'
      : location.pathname === '/chats/marketplace'
        ? 'market'
        : ((searchParams.get('filter') || 'users') as ChatsFilter);

  const q = searchParams.get('q') || '';
  const role = (searchParams.get('role') || 'buyer') as 'buyer' | 'seller';
  const item = searchParams.get('item') || undefined;

  return { filter, q, role, item };
}
