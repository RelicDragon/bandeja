import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type HomeSubTab = 'calendar' | 'advanced';

export function useHomeFromUrl(): { tab: HomeSubTab } {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab: HomeSubTab = rawTab === 'advanced' ? 'advanced' : 'calendar';

  useEffect(() => {
    if (rawTab === 'list' || rawTab === 'past-games') {
      navigate('/', { replace: true });
    }
  }, [rawTab, navigate]);

  return { tab };
}
