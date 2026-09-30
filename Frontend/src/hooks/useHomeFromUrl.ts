import { useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

export type HomeSubTab = 'calendar' | 'past-games' | 'ai';

/**
 * Pure `?tab=` → My sub-tab. `?focus=invites` forces the calendar (invites live there).
 * Unknown and legacy values (`list`, `advanced`) fall back to the calendar.
 */
export function resolveHomeSubTab(rawTab: string | null | undefined, focusInvites = false): HomeSubTab {
  if (focusInvites) return 'calendar';
  if (rawTab === 'past-games') return 'past-games';
  if (rawTab === 'ai') return 'ai';
  return 'calendar';
}

export function useHomeFromUrl(): { tab: HomeSubTab } {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const rawTab = searchParams.get('tab');
  const focusInvites = searchParams.get('focus') === 'invites';
  const tab = resolveHomeSubTab(rawTab, focusInvites);

  useEffect(() => {
    if (rawTab === 'list' || rawTab === 'advanced') {
      navigate('/', { replace: true });
      return;
    }
    if (focusInvites && (rawTab === 'past-games' || rawTab === 'ai')) {
      const next = new URLSearchParams(searchParams);
      next.delete('tab');
      const qs = next.toString();
      navigate(qs ? `/?${qs}` : '/', { replace: true });
    }
  }, [rawTab, focusInvites, navigate, searchParams]);

  return { tab };
}
