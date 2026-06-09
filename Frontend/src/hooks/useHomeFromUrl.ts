import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export function useHomeFromUrl() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const tab = (rawTab === 'past-games' ? 'past-games' : 'calendar') as 'calendar' | 'past-games';

  useEffect(() => {
    if (rawTab === 'list') {
      navigate('/', { replace: true });
    }
  }, [rawTab, navigate]);

  return { tab };
}
