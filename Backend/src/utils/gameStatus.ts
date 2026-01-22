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
  
  const isResultsBased = isResultsBasedEntityType(game.entityType);
  
  let shouldArchive = false;
  
  if (isResultsBased && game.finishedDate) {
    const finishedDate = new Date(game.finishedDate);
    const hoursSinceFinished = (now.getTime() - finishedDate.getTime()) / (1000 * 60 * 60);
    shouldArchive = hoursSinceFinished >= 24;
  } else {
    if (clubTimezone) {
      const endTimeInTimezone = toZonedTime(endTime, clubTimezone);
      const endDatePlusTwoDays = addDays(endTimeInTimezone, 2);
      const nextDayMidnight = startOfDay(endDatePlusTwoDays);
      const archiveTimeUTC = fromZonedTime(nextDayMidnight, clubTimezone);
      
      shouldArchive = now >= archiveTimeUTC;
    } else {
      shouldArchive = hoursSinceEnd > 48;
    }
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

