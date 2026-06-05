import { Sport } from '@prisma/client';
import prisma from '../../config/database';
import { resolveUserSportSnapshot } from '../user/userSportProfile.service';

export async function resolveUserLevelForSport(
  userId: string,
  sport: Sport | undefined
): Promise<number | undefined> {
  if (!sport) return undefined;

  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      level: true,
      sportProfiles: {
        select: { sport: true, level: true, reliability: true, gamesPlayed: true, gamesWon: true },
      },
    },
  });
  if (!user) return undefined;

  return resolveUserSportSnapshot(user, sport).level;
}
