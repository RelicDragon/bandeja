/**
 * `GET /games/booked-courts` rows → planner {@link OccupancyBlock}s.
 *
 * The game being moved must not block itself, so rows that carry its
 * `gameId` are dropped (newer payloads also carry `gameCourtId` and a
 * per-court `reservation`). Kinds: a hold → `hold`; an external/club booking
 * → `club`; another app game → `app_game_reserved` when its court is reserved,
 * else `app_game_planned` (a soft warning only).
 */
import type { OccupancyBlock } from '@shared/gameBooking/planReschedule';

export type BookedCourtRow = {
  courtId: string | null;
  startTime: string;
  endTime: string;
  hasBookedCourt?: boolean;
  clubBooked?: boolean;
  slotKind?: 'game' | 'external' | 'hold';
  holdBlocked?: boolean;
  gameId?: string | null;
  gameCourtId?: string | null;
  reservation?: 'planned' | 'reserved' | null;
  courtName?: string | null;
};

export function toOccupancyBlocks(rows: readonly BookedCourtRow[], ownGameId: string): OccupancyBlock[] {
  const out: OccupancyBlock[] = [];
  for (const row of rows) {
    if (!row.courtId) continue;
    if (row.gameId && row.gameId === ownGameId) continue;
    let kind: OccupancyBlock['kind'];
    if (row.slotKind === 'hold' || row.holdBlocked) kind = 'hold';
    else if (row.slotKind === 'external' || (row.clubBooked && !row.gameId)) kind = 'club';
    else if (row.reservation === 'reserved' || (row.reservation == null && row.hasBookedCourt)) kind = 'app_game_reserved';
    else kind = 'app_game_planned';
    out.push({
      courtId: row.courtId,
      start: row.startTime,
      end: row.endTime,
      kind,
      ...(row.gameId ? { gameId: row.gameId } : {}),
    });
  }
  return out;
}
