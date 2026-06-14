import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, addDays, isAfter } from 'date-fns';
import { EntityType } from '@prisma/client';

type GameStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';

const RESULTS_BASED_ENTITY_TYPES: readonly EntityType[] = [EntityType.GAME, EntityType.LEAGUE, EntityType.TOURNAMENT, EntityType.TRAINING];

export const ARCHIVE_BY_FINISHED_DATE_TYPES: readonly EntityType[] = [EntityType.GAME, EntityType.LEAGUE, EntityType.TOURNAMENT];

const ARCHIVE_BY_START_TIME_ENTITY_TYPES: readonly EntityType[] = [EntityType.GAME, EntityType.TOURNAMENT];
const ARCHIVE_AFTER_START_DAYS = 7;

export const isResultsBasedEntityType = (entityType: EntityType): boolean => {
  return RESULTS_BASED_ENTITY_TYPES.includes(entityType);
};

function isPastStartTimeArchiveThreshold(startTime: Date): boolean {
  return isAfter(new Date(), addDays(startTime, ARCHIVE_AFTER_START_DAYS));
}

function isPastArchiveTime(baseDate: Date, clubTimezone: string): boolean {
  const gameDayStart = startOfDay(toZonedTime(baseDate, clubTimezone));
  const archiveMidnight = startOfDay(addDays(gameDayStart, 2));
  const archiveTimeUTC = fromZonedTime(archiveMidnight, clubTimezone);
  return new Date() >= archiveTimeUTC;
}

export const calculateGameStatus = (
  game: {
    startTime: Date;
    endTime: Date;
    resultsStatus: string;
    timeIsSet?: boolean;
    finishedDate?: Date | null;
    entityType: EntityType;
  },
  clubTimezone: string
): GameStatus => {
  if (game.timeIsSet === false) {
    return 'ANNOUNCED';
  }

  const startTime = new Date(game.startTime);

  if (
    ARCHIVE_BY_START_TIME_ENTITY_TYPES.includes(game.entityType) &&
    isPastStartTimeArchiveThreshold(startTime)
  ) {
    return 'ARCHIVED';
  }

  if (game.resultsStatus === 'IN_PROGRESS') {
    return 'STARTED';
  }

  const now = new Date();
  const endTime = new Date(game.endTime);
  
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const hoursSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  
  let shouldArchive = false;
  if (ARCHIVE_BY_FINISHED_DATE_TYPES.includes(game.entityType)) {
    shouldArchive = game.resultsStatus === 'FINAL' && !!game.finishedDate && isPastArchiveTime(new Date(game.finishedDate), clubTimezone);
  } else {
    shouldArchive = isPastArchiveTime(endTime, clubTimezone) && !(game.entityType === EntityType.LEAGUE_SEASON && game.resultsStatus !== 'FINAL');
  }

  if (game.resultsStatus === 'FINAL') {
    return shouldArchive ? 'ARCHIVED' : 'FINISHED';
  }

  if (shouldArchive) {
    return 'ARCHIVED';
  }
  
  if (hoursUntilStart <= 0 && hoursSinceEnd < 0) {
    return 'STARTED';
  }
  
  if (hoursSinceEnd >= 0 && game.resultsStatus === 'NONE') {
    return 'FINISHED';
  }
  
  return 'ANNOUNCED';
};

