import type { QueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import {
  getGamesFromAvailableCache,
  withPatchedAvailableGames,
} from '@/queries/games/availableGamesCache';

/** Must match Backend AVAILABLE_ENRICH_MAX_IDS. */
export const AVAILABLE_ENRICH_CHUNK = 100;

export type AvailableEnrichmentFields = {
  userNote?: string | null;
  weatherSummary?: Game['weatherSummary'];
  reactions?: Game['reactions'];
};

export function mergeEnrichmentOntoGames(
  games: Game[],
  byGameId: Record<string, AvailableEnrichmentFields>,
): Game[] {
  let changed = false;
  const next = games.map((game) => {
    const patch = byGameId[game.id];
    if (!patch) return game;
    changed = true;
    return {
      ...game,
      ...(patch.userNote !== undefined ? { userNote: patch.userNote } : {}),
      ...(patch.weatherSummary !== undefined ? { weatherSummary: patch.weatherSummary } : {}),
      ...(patch.reactions !== undefined ? { reactions: patch.reactions } : {}),
    };
  });
  return changed ? next : games;
}

function chunkIds(ids: string[], size: number): string[][] {
  const out: string[][] = [];
  for (let i = 0; i < ids.length; i += size) {
    out.push(ids.slice(i, i + size));
  }
  return out;
}

/**
 * After core Find payload paints, attach notes/weather/reactions without
 * blocking TTFP. Enrichment failure leaves core games intact.
 * Chunks ids to cover full painted pages (month take 300).
 */
export async function attachAvailableGamesEnrichment(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  games: Game[],
): Promise<void> {
  if (games.length === 0) return;
  try {
    const ids = games.map((g) => g.id);
    const byGameId: Record<string, AvailableEnrichmentFields> = {};
    for (const chunk of chunkIds(ids, AVAILABLE_ENRICH_CHUNK)) {
      const response = await gamesApi.getAvailableGamesEnrichment(chunk);
      Object.assign(byGameId, response.data?.byGameId ?? {});
    }
    queryClient.setQueryData(queryKey, (prev) => {
      if (!prev) return prev;
      const list = getGamesFromAvailableCache(prev);
      if (!list) return prev;
      const merged = mergeEnrichmentOntoGames(list, byGameId);
      return withPatchedAvailableGames(prev, merged);
    });
  } catch (err) {
    console.warn('[attachAvailableGamesEnrichment] failed', err);
  }
}
