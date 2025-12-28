import { toZonedTime, fromZonedTime } from 'date-fns-tz';
import { startOfDay, addDays } from 'date-fns';

type GameStatus = 'ANNOUNCED' | 'STARTED' | 'FINISHED' | 'ARCHIVED';

export const calculateGameStatus = (
  game: {
    startTime: Date;
    endTime: Date;
    resultsStatus: string;
  },
  clubTimezone?: string
): GameStatus => {
  const now = new Date();
  const startTime = new Date(game.startTime);
  const endTime = new Date(game.endTime);
  
  const hoursUntilStart = (startTime.getTime() - now.getTime()) / (1000 * 60 * 60);
  const hoursSinceEnd = (now.getTime() - endTime.getTime()) / (1000 * 60 * 60);
  
  let shouldArchive = false;
  
  if (clubTimezone) {
    const endTimeInTimezone = toZonedTime(endTime, clubTimezone);
    const endDatePlusOneDay = addDays(endTimeInTimezone, 1);
    const nextDayMidnight = startOfDay(endDatePlusOneDay);
    const archiveTimeUTC = fromZonedTime(nextDayMidnight, clubTimezone);
    
    shouldArchive = now >= archiveTimeUTC;
  } else {
    shouldArchive = hoursSinceEnd > 48;
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

