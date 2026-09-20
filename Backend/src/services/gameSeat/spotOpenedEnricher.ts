import prisma from '../../config/database';
import {
  registerAvailableGamesEnricher,
  type AvailableGamesEnricherInput,
} from '../game/availableGamesEnrichment';
import { SPOT_OPENED_WINDOW_MS, isWithinSpotOpenedWindow } from './spotOpenedWindow';

/**
 * PRD 347 — attaches `spotOpenedAt` to Find / Home / My-Tab cards.
 *
 * Present only while the last seat-opened event is inside the 2 h window, the
 * roster is still mutable **and a seat is actually still open**; the frontend
 * turns that into the "Spot opened" pill and the day-group sort boost. Locked
 * rosters never get the pill, which is why `resultsStatus` is filtered here and
 * not on the client.
 */
export const SPOT_OPENED_ENRICHER_NAME = 'prd347.spotOpened';

export async function spotOpenedEnricher(
  _userId: string,
  games: AvailableGamesEnricherInput[],
): Promise<Record<string, { spotOpenedAt: string | null }>> {
  if (games.length === 0) return {};

  const now = new Date();
  const since = new Date(now.getTime() - SPOT_OPENED_WINDOW_MS);

  const rows = await prisma.game.findMany({
    where: {
      id: { in: games.map((game) => game.id) },
      lastSeatOpenedAt: { gte: since },
      resultsStatus: 'NONE',
      status: { in: ['ANNOUNCED', 'STARTED'] },
    },
    select: {
      id: true,
      lastSeatOpenedAt: true,
      maxParticipants: true,
      /*
       * The pill is keyed on "a seat **is** open", not "a seat opened
       * recently". `lastSeatOpenedAt` is never cleared, so with auto-fill on
       * the queue head takes the seat ~200 ms later and the game is full again
       * — yet every Find / My-Tab card kept the sky "A spot opened" pill, and
       * the day-group sort boost, for the remaining two hours.
       */
      participants: { where: { status: 'PLAYING' }, select: { id: true } },
    },
  });

  const out: Record<string, { spotOpenedAt: string | null }> = {};
  for (const row of rows) {
    const openedAt = row.lastSeatOpenedAt;
    if (!openedAt || !isWithinSpotOpenedWindow(openedAt, now)) continue;
    if (hasNoOpenSeat(row.maxParticipants, row.participants.length)) continue;
    out[row.id] = { spotOpenedAt: openedAt.toISOString() };
  }
  return out;
}

/**
 * `maxParticipants` is always set on a `Game`, but a 0 / missing value fails
 * **open**: the pill is a nudge, so showing one card too many is a far cheaper
 * mistake than a bad capacity reading hiding the pill everywhere.
 */
function hasNoOpenSeat(maxParticipants: number | null, playingCount: number): boolean {
  if (!maxParticipants || maxParticipants <= 0) return false;
  return playingCount >= maxParticipants;
}

registerAvailableGamesEnricher(SPOT_OPENED_ENRICHER_NAME, spotOpenedEnricher);
