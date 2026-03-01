import { useSearchParams } from 'react-router-dom';

export function useHomeFromUrl() {
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') || 'calendar') as 'calendar' | 'list' | 'past-games';
  return { tab };
}
