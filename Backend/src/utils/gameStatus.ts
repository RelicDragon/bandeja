import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, addDays } from 'date-fns';
import { EntityType } from '@prisma/client';

type GameStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';

const RESULTS_BASED_ENTITY_TYPES: readonly EntityType[] = [EntityType.GAME, EntityType.LEAGUE, EntityType.TOURNAMENT, EntityType.TRAINING];

export const isResultsBasedEntityType = (entityType: EntityType): boolean => {
  return RESULTS_BASED_ENTITY_TYPES.includes(entityType);
};

export const calculateGameStatus = (
  game: {
    startTime: Date;
    endTime: Date;
    resultsStatus: string;
    timeIsSet?: boolean;
    finishedDate?: Date | null;
    entityType: EntityType;
  },
  clubTimezone?: string
): GameStatus => {
  if (game.timeIsSet === false) {
    return 'ANNOUNCED';
  }

  const now = new Date();
  const startTime = new Date(game.startTime);
  const endTime = new Date(game.endTime);
  
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const hoursSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  
  let shouldArchive = false;
  if (clubTimezone) {
    const gameDayStart = startOfDay(toZonedTime(endTime, clubTimezone));
    const archiveMidnight = startOfDay(addDays(gameDayStart, 2));
    const archiveTimeUTC = fromZonedTime(archiveMidnight, clubTimezone);
    shouldArchive = now >= archiveTimeUTC;
  } else {
    const gameDayStartUTC = new Date(Date.UTC(endTime.getUTCFullYear(), endTime.getUTCMonth(), endTime.getUTCDate()));
    const archiveTime = addDays(gameDayStartUTC, 2);
    shouldArchive = now >= archiveTime;
  }
  if (game.entityType === EntityType.LEAGUE_SEASON && game.resultsStatus !== 'FINAL') {
    shouldArchive = false;
  }
  
  if (shouldArchive) {
    return 'ARCHIVED';
  }
  
  if (game.resultsStatus !== 'NONE') {
    return 'FINISHED';
  }
  
  if (hoursUntilStart <= 0 && hoursSinceEnd < 0) {
    return 'STARTED';
  }
  
  if (hoursSinceEnd >= 0 && game.resultsStatus === 'NONE') {
    return 'FINISHED';
  }
  
  return 'ANNOUNCED';
};

