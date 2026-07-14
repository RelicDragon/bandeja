import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Narrow an id list to games with at least one open PLAYING slot
 * (count(PLAYING) < maxParticipants). MIX gender precision stays client-side.
 */
export async function filterIdsByAvailableSlots(gameIds: string[]): Promise<string[]> {
  if (gameIds.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT g.id
    FROM "Game" g
    WHERE g.id IN (${Prisma.join(gameIds)})
      AND (
        SELECT COUNT(*)::int FROM "GameParticipant" p
        WHERE p."gameId" = g.id AND p.status = 'PLAYING'
      ) < g."maxParticipants"
  `);
  return rows.map((r) => r.id);
}
