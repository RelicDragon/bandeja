import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

export async function countGamesTogetherWith(
  viewerId: string,
  otherUserIds: string[],
): Promise<Map<string, number>> {
  const unique = [...new Set(otherUserIds.filter((id) => id && id !== viewerId))];
  if (unique.length === 0) return new Map();

  const rows = await prisma.$queryRaw<Array<{ userId: string; count: number }>>(
    Prisma.sql`
      SELECT gp2."userId" AS "userId", COUNT(DISTINCT g.id)::int AS count
      FROM "GameParticipant" gp1
      INNER JOIN "GameParticipant" gp2 ON gp1."gameId" = gp2."gameId"
      INNER JOIN "Game" g ON g.id = gp1."gameId"
      WHERE gp1."userId" = ${viewerId}
        AND gp1.status = 'PLAYING'::"ParticipantStatus"
        AND gp2.status = 'PLAYING'::"ParticipantStatus"
        AND gp2."userId" IN (${Prisma.join(unique)})
        AND g."resultsStatus" = 'FINAL'::"ResultsStatus"
        AND g."entityType" NOT IN ('BAR'::"EntityType", 'LEAGUE_SEASON'::"EntityType")
      GROUP BY gp2."userId"
    `,
  );

  return new Map(rows.map((row) => [row.userId, row.count]));
}
