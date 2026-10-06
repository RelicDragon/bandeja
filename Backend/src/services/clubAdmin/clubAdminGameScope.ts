import { Prisma } from '@prisma/client';

/**
 * "This game belongs to club X" for every club admin surface: the game's club is X,
 * or its primary court is at X, or any of its court slots (`GameCourt`) is at X.
 * Nothing else makes a game touchable by a club admin.
 */
export function gameBelongsToClubWhere(clubId: string): Prisma.GameWhereInput {
  return {
    OR: [{ clubId }, { court: { clubId } }, { gameCourts: { some: { court: { clubId } } } }],
  };
}

export function gameBelongsToClub(
  game: {
    clubId: string | null;
    court?: { clubId: string } | null;
    gameCourts?: Array<{ court: { clubId: string } }>;
  },
  clubId: string
): boolean {
  if (game.clubId === clubId) return true;
  if (game.court?.clubId === clubId) return true;
  return (game.gameCourts ?? []).some((gc) => gc.court.clubId === clubId);
}
