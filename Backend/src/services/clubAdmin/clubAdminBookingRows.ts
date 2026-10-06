import { Prisma } from '@prisma/client';
import prisma from '../../config/database';

/**
 * Thin booking rows for club-wide money and report math (dashboard billing, reports). One SQL
 * query for game court-time and one for holds, whatever the range — never per booking.
 *
 * Game court-time follows `CourtOccupancyService`: a game with `GameCourt` slots occupies each of
 * its slots on this club's courts; a game without slots occupies its primary court if that court
 * is here. Every `Game.status` counts (past games are FINISHED / ARCHIVED; cancelled games are
 * deleted). Only `timeIsSet` games have court-time.
 */

export interface GameCourtTimeRow {
  gameId: string;
  /** This club's courts the game uses (at least one). */
  courtIds: string[];
  start: Date;
  end: Date;
  entityType: string;
}

export interface HoldRow {
  holdId: string;
  courtId: string;
  label: string;
  start: Date;
  end: Date;
}

/** Games with court-time at the club overlapping `[from, to)`. */
export async function loadGameCourtTime(clubId: string, from: Date, to: Date): Promise<GameCourtTimeRow[]> {
  const rows = await prisma.$queryRaw<Array<{ gameId: string; courtId: string; startTime: Date; endTime: Date; entityType: string }>>(Prisma.sql`
    SELECT g.id AS "gameId", gc."courtId" AS "courtId", g."startTime", g."endTime", g."entityType"::text AS "entityType"
    FROM "Court" c
    JOIN "GameCourt" gc ON gc."courtId" = c.id
    JOIN "Game" g ON g.id = gc."gameId"
    WHERE c."clubId" = ${clubId} AND g."timeIsSet" AND g."startTime" < ${to} AND g."endTime" > ${from}
    UNION ALL
    SELECT g.id, g."courtId", g."startTime", g."endTime", g."entityType"::text
    FROM "Court" c
    JOIN "Game" g ON g."courtId" = c.id
    WHERE c."clubId" = ${clubId} AND g."timeIsSet" AND g."startTime" < ${to} AND g."endTime" > ${from}
      AND NOT EXISTS (SELECT 1 FROM "GameCourt" x WHERE x."gameId" = g.id)
  `);
  const byGame = new Map<string, GameCourtTimeRow>();
  for (const r of rows) {
    const row = byGame.get(r.gameId);
    if (row) {
      if (!row.courtIds.includes(r.courtId)) row.courtIds.push(r.courtId);
    } else {
      byGame.set(r.gameId, { gameId: r.gameId, courtIds: [r.courtId], start: r.startTime, end: r.endTime, entityType: r.entityType });
    }
  }
  return [...byGame.values()];
}

/** Live (not deleted) holds at the club overlapping `[from, to)`. */
export async function loadHoldRows(clubId: string, from: Date, to: Date): Promise<HoldRow[]> {
  const rows = await prisma.courtSlotHold.findMany({
    where: { clubId, deletedAt: null, startTime: { lt: to }, endTime: { gt: from } },
    select: { id: true, courtId: true, label: true, startTime: true, endTime: true },
  });
  return rows.map((h) => ({ holdId: h.id, courtId: h.courtId, label: h.label, start: h.startTime, end: h.endTime }));
}
