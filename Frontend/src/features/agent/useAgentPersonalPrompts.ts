import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery } from '@tanstack/react-query';
import { useAuthStore } from '@/store/authStore';
import { useMyGamesQuery } from '@/queries/games/useMyGamesQuery';
import { flattenPastGamesPages, pastGamesInfiniteQueryOptions } from '@/queries/games/usePastGamesQuery';
import { useOwedSharesQuery } from '@/queries/useGameCostQuery';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { resolveViewerCityTimezone } from '@/utils/cityTimezone';
import {
  buildAgentPersonalPrompts,
  formatAgentShortWhen,
  type AgentPersonalPrompt,
} from './agentPersonalPrompts';

/** Never hold the empty state on a slow query longer than this; show what we have. */
const MAX_LOADING_MS = 1500;

/**
 * Personalized prompts for the agent's empty states. Reads the my-tab query (usually warm: the
 * AI tab lives on My), the owed-shares query and the past-games cache only when already
 * loaded (`enabled: false`, nothing fetched). `loading` is capped so the screen never waits.
 */
export function useAgentPersonalPrompts(): { prompts: AgentPersonalPrompt[]; loading: boolean } {
  const user = useAuthStore((s) => s.user);
  const userId = user?.id;
  const settings = useMemo(() => resolveDisplaySettings(user), [user]);
  const viewerTimeZone = resolveViewerCityTimezone(user?.currentCity?.timezone);

  const myGames = useMyGamesQuery(userId);
  const owed = useOwedSharesQuery(Boolean(userId));
  const past = useInfiniteQuery({ ...pastGamesInfiniteQueryOptions(userId), enabled: false });

  const [timedOut, setTimedOut] = useState(false);
  const waiting = myGames.isLoading || owed.isLoading;
  useEffect(() => {
    if (!waiting) return;
    const timer = window.setTimeout(() => setTimedOut(true), MAX_LOADING_MS);
    return () => window.clearTimeout(timer);
  }, [waiting]);

  const prompts = useMemo(() => {
    if (!userId) return [];
    const now = new Date();
    return buildAgentPersonalPrompts({
      userId,
      games: myGames.data?.games ?? [],
      pastGames: flattenPastGamesPages(past.data?.pages),
      invites: myGames.data?.invites ?? [],
      owed: owed.data ?? null,
      now,
      formatWhen: (iso, timeZone) => formatAgentShortWhen(iso, settings, timeZone ?? viewerTimeZone, now),
    });
  }, [userId, myGames.data, past.data, owed.data, settings, viewerTimeZone]);

  return { prompts, loading: waiting && !timedOut };
}
