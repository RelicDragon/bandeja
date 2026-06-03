import { Sport, SportLevelSource } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  parsePlaytomicSportLevels,
  type PlaytomicSportLevelInput,
} from '../../integrations/playtomicSport';
import { ensureSportInEnabled, loadProfileUser } from '../user/userSportProfile.service';

export async function syncPlaytomicLevelsToUser(
  userId: string,
  levels: PlaytomicSportLevelInput[],
) {
  if (!Array.isArray(levels) || levels.length === 0) {
    throw new ApiError(400, 'At least one Playtomic sport level is required');
  }

  const parsed = parsePlaytomicSportLevels(levels);
  if (parsed.length === 0) {
    throw new ApiError(400, 'No supported Playtomic sports in payload');
  }

  await prisma.$transaction(async (tx) => {
    for (const row of parsed) {
      await ensureSportInEnabled(userId, row.sport, tx);
      await tx.userSportProfile.upsert({
        where: { userId_sport: { userId, sport: row.sport } },
        create: {
          userId,
          sport: row.sport,
          level: row.bandejaLevel,
          reliability: row.reliability ?? 0,
          levelSource: SportLevelSource.PLAYTOMIC,
          externalRatingHint: row.externalHint,
        },
        update: {
          level: row.bandejaLevel,
          ...(row.reliability !== undefined ? { reliability: row.reliability } : {}),
          levelSource: SportLevelSource.PLAYTOMIC,
          externalRatingHint: row.externalHint,
        },
      });
    }

    const padelRow = parsed.find((r) => r.sport === Sport.PADEL);
    if (padelRow) {
      await tx.user.update({
        where: { id: userId },
        data: {
          level: padelRow.bandejaLevel,
          ...(padelRow.reliability !== undefined ? { reliability: padelRow.reliability } : {}),
        },
      });
    }
  });

  return loadProfileUser(userId);
}
