import { useEffect, useState } from 'react';
import { clubsApi, peekCachedMapClubs, type ClubMapItem } from '@/api/clubs';

/** Full club list for city-selector search + map (backed by clubsApi map cache). */
export function useCitySelectorClubs(enabled: boolean): ClubMapItem[] {
  const [clubs, setClubs] = useState<ClubMapItem[]>(() => peekCachedMapClubs() ?? []);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    const cached = peekCachedMapClubs();
    if (cached) setClubs(cached);
    clubsApi
      .getForMap(null)
      .then((data) => {
        if (!cancelled && data) setClubs(Array.isArray(data) ? data : []);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [enabled]);

  return clubs;
}
