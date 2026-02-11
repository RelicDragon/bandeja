import { useSearchParams } from 'react-router-dom';

export function useHomeFromUrl() {
  const [searchParams] = useSearchParams();
  const tab = (searchParams.get('tab') || 'my-games') as 'my-games' | 'past-games';
  return { tab };
}
