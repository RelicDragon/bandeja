import type { QueryClient } from '@tanstack/react-query';
import { gamesApi } from '@/api';
import type { Game } from '@/types';
import { GAME_CARD_ENRICHMENT_KEYS } from '@/types/gameCardEnrichment';
import type { GameCardEnrichment } from '@/types/gameCardEnrichment';
import {
  getGamesFromAvailableCache,
  withPatchedAvailableGames,
} from '@/queries/games/availableGamesCache';

/** Must match Backend AVAILABLE_ENRICH_MAX_IDS. */
export const AVAILABLE_ENRICH_CHUNK = 100;

/** Delayed re-fetches so background Open-Meteo warm can land without blocking TTFP. */
export const AVAILABLE_WEATHER_RETRY_DELAYS_MS = [3000, 9000] as const;

/**
 * The by-ids enrichment payload, **derived** from the shared card contract
 * (`types/gameCardEnrichment.ts`) rather than restated.
 *
 * `format: 'card'` list queries skip inline enrichment, so this endpoint is the
 * only source for every field the six PRD 345–357 card surfaces render. A
 * hand-maintained union here once dropped six of nine fields on the floor; the
 * merge below now walks {@link GAME_CARD_ENRICHMENT_KEYS}, which the type system
 * keeps exhaustive.
 */
export type AvailableEnrichmentFields = GameCardEnrichment;

/** Keys the server actually sent. Absent ⇒ "no change"; `null` ⇒ "nothing". */
function definedEnrichmentFields(
  patch: AvailableEnrichmentFields,
): Partial<GameCardEnrichment> | null {
  let out: Partial<GameCardEnrichment> | null = null;
  for (const key of GAME_CARD_ENRICHMENT_KEYS) {
    const value = patch[key];
    if (value === undefined) continue;
    out ??= {};
    Object.assign(out, { [key]: value });
  }
  return out;
}

export function mergeEnrichmentOntoGames(
  games: Game[],
  byGameId: Record<string, AvailableEnrichmentFields>,
): Game[] {
  let changed = false;
  const next = games.map((game) => {
    const patch = byGameId[game.id];
    if (!patch) return game;
    const fields = definedEnrichmentFields(patch);
    if (!fields) return game;
    changed = true;
    return { ...game, ...fields };
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
