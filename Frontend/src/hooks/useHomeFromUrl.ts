import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type HomeSubTab = 'calendar' | 'past-games';

export function useHomeFromUrl(): { tab: HomeSubTab } {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: HomeSubTab = rawTab === 'past-games' ? 'past-games' : 'calendar';

  useEffect(() => {
    if (rawTab === 'list' || rawTab === 'advanced') {
      navigate('/', { replace: true });
    }
  }, [rawTab, navigate]);

  return { tab };
}
