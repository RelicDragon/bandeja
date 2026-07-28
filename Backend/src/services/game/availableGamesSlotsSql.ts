import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Narrow an id list to games with at least one open PLAYING slot
 * (count(PLAYING) < maxParticipants). MIX gender precision stays client-side.
 * Uses a grouped aggregate so `(gameId, status)` can serve the count.
 */
export async function filterIdsByAvailableSlots(gameIds: string[]): Promise<string[]> {
  const unique = [...new Set(gameIds.filter(Boolean))];
  if (unique.length === 0) return [];
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT g.id
    FROM "Game" g
    LEFT JOIN (
      SELECT p."gameId" AS "gameId", COUNT(*)::int AS playing_count
      FROM "GameParticipant" p
      WHERE p.status = 'PLAYING'
        AND p."gameId" IN (${Prisma.join(unique)})
      GROUP BY p."gameId"
    ) pc ON pc."gameId" = g.id
    WHERE g.id IN (${Prisma.join(unique)})
      AND COALESCE(pc.playing_count, 0) < g."maxParticipants"
  `);
  return rows.map((r) => r.id);
}

/**
 * Preserve input order while keeping only open-slot games.
 */
export async function filterOrderedRowsByAvailableSlots<T extends { id: string }>(
  rows: T[],
): Promise<T[]> {
  if (rows.length === 0) return [];
  const openIds = new Set(await filterIdsByAvailableSlots(rows.map((r) => r.id)));
  return rows.filter((r) => openIds.has(r.id));
}
