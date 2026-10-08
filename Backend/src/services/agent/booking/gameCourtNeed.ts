/**
 * "Does this game still need a court at that time?" for agent book / link writes.
 * Tonight's prod case (2026-10-07): a 4-player fixture already had Court 1 linked from the app
 * when the agent linked Court 4 at the same time — two courts for one game, no warning.
 */
import { ApiError } from '../../../utils/ApiError';
import prisma from '../../../config/database';
import { computeRequiredCourtSlotCount } from '@bandeja/shared/gameBooking/courtReservations';

type GameNeedRow = { id: string; maxParticipants: number; playersPerMatch: number | null; courtSlotCount: number | null };

/** Refuses when the game's linked courts overlapping [start, end) plus `courtIds` exceed its need. */
export async function assertGameNeedsCourts(
  game: GameNeedRow,
  courtIds: readonly string[],
  start: Date,
  end: Date,
): Promise<void> {
  const needed = computeRequiredCourtSlotCount(game, 0, game.courtSlotCount);
  const links = await prisma.gameExternalBooking.findMany({
    where: { gameId: game.id, bookingStart: { lt: end }, bookingEnd: { gt: start } },
    select: { courtId: true, court: { select: { name: true } } },
  });
  const adding = new Set(courtIds);
  const held = new Map<string, string>();
  for (const link of links) {
    if (link.courtId && !adding.has(link.courtId)) held.set(link.courtId, link.court?.name ?? 'a court');
  }
  if (held.size + adding.size > needed) {
    const names = [...held.values()].join(', ');
    throw new ApiError(
      400,
      `This game needs ${needed} court${needed === 1 ? '' : 's'} and already has ${names} booked at that time. ` +
        'Ask the user whether to use that booking, or to unlink / cancel it first; never book or link an extra court.',
    );
  }
}
