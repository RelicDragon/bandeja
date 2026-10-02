import { useEffect, useState } from 'react';
import { leaguesApi, type LeagueGroupChatLink } from '@/api/leagues';

const cache = new Map<string, LeagueGroupChatLink[]>();

/** Viewer's group chats of a league season; cached so switching between them doesn't flash the tabs. */
export function useLeagueSeasonGroupChats(leagueSeasonId: string | null): LeagueGroupChatLink[] {
  const [chats, setChats] = useState<LeagueGroupChatLink[]>(
    () => (leagueSeasonId ? cache.get(leagueSeasonId) : undefined) ?? []
  );

  useEffect(() => {
    if (!leagueSeasonId) {
      setChats([]);
      return;
    }
    setChats(cache.get(leagueSeasonId) ?? []);
    let cancelled = false;
    leaguesApi
      .getMyGroupChats(leagueSeasonId)
      .then((res) => {
        const data = res.data ?? [];
        cache.set(leagueSeasonId, data);
        if (!cancelled) setChats(data);
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [leagueSeasonId]);

  return chats;
}
