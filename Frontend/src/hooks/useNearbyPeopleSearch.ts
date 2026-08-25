import { useEffect, useState } from 'react';
import { usePlayersStore } from '@/store/playersStore';
import type { NearbyInvitableCity } from '@/api/users';

export function useNearbyPeopleSearch(input: {
  enabled: boolean;
  query: string;
  cityId?: string;
}) {
  const { enabled, query, cityId } = input;
  const [groups, setGroups] = useState<NearbyInvitableCity[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!enabled || !cityId || query.trim().length < 2) {
      setGroups([]);
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    void usePlayersStore
      .getState()
      .fetchPlayers(undefined, undefined, query.trim(), undefined, {
        cityId,
        expandNearby: true,
      })
      .then((result) => {
        if (cancelled) return;
        setGroups(result.length > 0 ? [] : (result.nearby ?? []).filter((group) => group.players.length > 0));
      })
      .catch(() => {
        if (!cancelled) setGroups([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [cityId, enabled, query]);

  return { groups, loading };
}
