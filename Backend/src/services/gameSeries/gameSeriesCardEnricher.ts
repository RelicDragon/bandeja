import { GameSeriesStatus } from '@prisma/client';
import prisma from '../../config/database';
import { config } from '../../config/env';
import {
  registerAvailableGamesEnricher,
  type AvailableGameEnrichFields,
  type AvailableGamesEnricherInput,
} from '../game/availableGamesEnrichment';
import type { SeriesCardLabel } from '../game/availableGamesEnrichmentTypes';

/**
 * PRD 345 — the `↻ Weekly` card pill and the "Part of *Tuesday Regulars* · 12th
 * week" line on game details.
 *
 * Three batched queries, never one per game (Find calls this on every page):
 * the occurrences in view, their series, and every occurrence of those series
 * so the 1-based week number can be counted without a window function.
 *
 * The payload shape is fixed by `Frontend/src/types/gameCardEnrichment.ts` and
 * its backend mirror `availableGamesEnrichmentTypes.ts`. Do not widen it here.
 */

export const SERIES_ENRICHER_NAME = 'seriesLabel';

export async function buildSeriesCardLabels(
  gameIds: readonly string[],
): Promise<Record<string, SeriesCardLabel | null>> {
  if (gameIds.length === 0) return {};

  const occurrences = await prisma.game.findMany({
    where: { id: { in: [...gameIds] }, seriesId: { not: null } },
    select: { id: true, seriesId: true, startTime: true },
  });
  if (occurrences.length === 0) return {};

  const seriesIds = Array.from(
    new Set(
      occurrences
        .map((occurrence) => occurrence.seriesId)
        .filter((seriesId): seriesId is string => Boolean(seriesId)),
    ),
  );

  const [seriesRows, allOccurrences] = await Promise.all([
    prisma.gameSeries.findMany({
      where: { id: { in: seriesIds } },
      select: {
        id: true,
        name: true,
        cadence: true,
        weekday: true,
        startTimeLocal: true,
        status: true,
        updatedAt: true,
      },
    }),
    prisma.game.findMany({
      where: { seriesId: { in: seriesIds } },
      select: { id: true, seriesId: true, startTime: true },
      orderBy: { startTime: 'asc' },
    }),
  ]);

  const seriesById = new Map(seriesRows.map((row) => [row.id, row]));

  /** 1-based position of each occurrence inside its own series. */
  const weekNumberByGameId = new Map<string, number>();
  const counters = new Map<string, number>();
  for (const occurrence of allOccurrences) {
    if (!occurrence.seriesId) continue;
    const next = (counters.get(occurrence.seriesId) ?? 0) + 1;
    counters.set(occurrence.seriesId, next);
    weekNumberByGameId.set(occurrence.id, next);
  }

  const out: Record<string, SeriesCardLabel | null> = {};
  for (const occurrence of occurrences) {
    if (!occurrence.seriesId) continue;
    const series = seriesById.get(occurrence.seriesId);
    if (!series) continue;
    out[occurrence.id] = {
      seriesId: series.id,
      name: series.name,
      cadence: series.cadence,
      weekday: series.weekday,
      startTimeLocal: series.startTimeLocal,
      occurrenceNumber: weekNumberByGameId.get(occurrence.id),
      endedAt:
        series.status === GameSeriesStatus.ENDED ? series.updatedAt.toISOString() : null,
    };
  }

  return out;
}

registerAvailableGamesEnricher(
  SERIES_ENRICHER_NAME,
  async (
    _userId: string,
    games: AvailableGamesEnricherInput[],
  ): Promise<Record<string, Partial<AvailableGameEnrichFields>>> => {
    if (!config.gameSeriesEnabled) return {};
    const labels = await buildSeriesCardLabels(games.map((game) => game.id));
    const out: Record<string, Partial<AvailableGameEnrichFields>> = {};
    for (const [gameId, seriesLabel] of Object.entries(labels)) {
      out[gameId] = { seriesLabel };
    }
    return out;
  },
);
