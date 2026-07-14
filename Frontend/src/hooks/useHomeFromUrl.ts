import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type HomeSubTab = 'calendar' | 'past-games';

export function useHomeFromUrl(): { tab: HomeSubTab } {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const focusInvites = searchParams.get('focus') === 'invites';
  const tab: HomeSubTab =
    focusInvites ? 'calendar' : rawTab === 'past-games' ? 'past-games' : 'calendar';

  useEffect(() => {
    if (rawTab === 'list' || rawTab === 'advanced') {
      navigate('/', { replace: true });
      return;
    }
    if (focusInvites && rawTab === 'past-games') {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      const qs = next.toString();
      navigate(qs ? `/?${qs}` : '/', { replace: true });
    }
  }, [rawTab, focusInvites, navigate, searchParams]);

  return { tab };
}
