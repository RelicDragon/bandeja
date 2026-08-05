import type { QueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import {
  getGamesFromAvailableCache,
  withPatchedAvailableGames,
} from '@/queries/games/availableGamesCache';

/** Must match Backend AVAILABLE_ENRICH_MAX_IDS. */
export const AVAILABLE_ENRICH_CHUNK = 100;

/** Delayed re-fetches so background Open-Meteo warm can land without blocking TTFP. */
export const AVAILABLE_WEATHER_RETRY_DELAYS_MS = [3000, 9000] as const;

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

export function idsMissingWeatherSummary(games: Game[]): string[] {
  return games
    .filter((g) => g.timeIsSet === true && g.weatherSummary == null)
    .map((g) => g.id);
}

async function fetchEnrichmentByIds(
  ids: string[],
): Promise<Record<string, AvailableEnrichmentFields>> {
  const byGameId: Record<string, AvailableEnrichmentFields> = {};
  const chunks = chunkIds(ids, AVAILABLE_ENRICH_CHUNK);
  const parts = await Promise.all(
    chunks.map(async (chunk) => {
      const response = await gamesApi.getAvailableGamesEnrichment(chunk);
      return response.data?.byGameId ?? {};
    }),
  );
  for (const part of parts) {
    Object.assign(byGameId, part);
  }
  return byGameId;
}

function patchAvailableCache(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  byGameId: Record<string, AvailableEnrichmentFields>,
): void {
  queryClient.setQueryData(queryKey, (prev: unknown) => {
    if (!prev) return prev;
    const list = getGamesFromAvailableCache(prev);
    if (!list) return prev;
    const merged = mergeEnrichmentOntoGames(list, byGameId);
    return withPatchedAvailableGames(prev, merged);
  });
}

/**
 * After core Find payload paints, attach notes/weather/reactions without
 * blocking TTFP. Enrichment failure leaves core games intact.
 * Chunks ids to cover full painted pages (month take 300).
 *
 * If scheduled games still lack weather (cold cache + background warm),
 * one delayed re-fetch picks it up without a full list reload.
 */
export async function attachAvailableGamesEnrichment(
  queryClient: QueryClient,
  queryKey: readonly unknown[],
  games: Game[],
): Promise<void> {
  if (games.length === 0) return;
  try {
    const ids = games.map((g) => g.id);
    const byGameId = await fetchEnrichmentByIds(ids);
    patchAvailableCache(queryClient, queryKey, byGameId);

    const mergedProbe = mergeEnrichmentOntoGames(games, byGameId);
    const initialMissing = idsMissingWeatherSummary(mergedProbe);
    if (initialMissing.length === 0) return;

    void (async () => {
      try {
        for (const delayMs of AVAILABLE_WEATHER_RETRY_DELAYS_MS) {
          await new Promise((r) => setTimeout(r, delayMs));
          const current = getGamesFromAvailableCache(queryClient.getQueryData(queryKey));
          if (!current) return;
          const stillMissing = idsMissingWeatherSummary(current).filter((id) =>
            initialMissing.includes(id),
          );
          if (stillMissing.length === 0) return;
          const retryById = await fetchEnrichmentByIds(stillMissing);
          patchAvailableCache(queryClient, queryKey, retryById);
        }
      } catch (err) {
        console.warn('[attachAvailableGamesEnrichment] weather retry failed', err);
      }
    })();
  } catch (err) {
    console.warn('[attachAvailableGamesEnrichment] failed', err);
  }
}
