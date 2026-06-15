import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type HomeSubTab = 'calendar' | 'past-games' | 'advanced';

export function useHomeFromUrl(): { tab: HomeSubTab } {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: HomeSubTab =
    rawTab === 'past-games' ? 'past-games' : rawTab === 'advanced' ? 'advanced' : 'calendar';

  useEffect(() => {
    if (rawTab === 'list') {
      navigate('/', { replace: true });
    }
  }, [rawTab, navigate]);

  return { tab };
}
