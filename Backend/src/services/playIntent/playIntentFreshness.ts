import type { PlayIntentTimeOfDay } from '@prisma/client';
import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';
import {
  endOfCalendarDate,
  startOfCalendarDate,
} from '../game/calendarDateBounds';
import { resolveTimeWindows } from './playIntentCriteria';

const MINUTES_IN_DAY = 1440;
const SUGGESTED_START_STEP_MINUTES = 15;

export type IntentWindowSource = {
  dateKeys: string[];
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime?: string | null;
  endTime?: string | null;
};

function dateAtLocalMinutes(
  dateKey: string,
  minutes: number,
  timezone: string,
): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dateKey);
  if (!match) return null;
  const [, year, month, day] = match.map(Number);
  const dayOffset = Math.floor(minutes / MINUTES_IN_DAY);
  const minuteOfDay = minutes % MINUTES_IN_DAY;
  const localDate = new Date(
    year,
    month - 1,
    day + dayOffset,
    Math.floor(minuteOfDay / 60),
    minuteOfDay % 60,
    0,
    0,
  );
  const result = fromZonedTime(localDate, timezone);
  const expected = [
    localDate.getFullYear(),
    String(localDate.getMonth() + 1).padStart(2, '0'),
    String(localDate.getDate()).padStart(2, '0'),
  ].join('-') +
    ` ${String(localDate.getHours()).padStart(2, '0')}:${String(localDate.getMinutes()).padStart(2, '0')}`;
  return formatInTimeZone(result, timezone, 'yyyy-MM-dd HH:mm') === expected
    ? result
    : null;
}

export function gameStartIsFuture(startTime: Date, now: Date = new Date()): boolean {
  return startTime.getTime() > now.getTime();
}

export function futureGameDateBounds(
  dateKeys: string[],
  timezone: string,
  now: Date = new Date(),
): ({ gt: Date; lte: Date } | { gte: Date; lte: Date })[] {
  const bounds: ({ gt: Date; lte: Date } | { gte: Date; lte: Date })[] = [];
  for (const dateKey of [...new Set(dateKeys)]) {
    try {
      const dayStart = startOfCalendarDate(dateKey, timezone);
      const dayEnd = endOfCalendarDate(dateKey, timezone);
      const from = dayStart.getTime() > now.getTime() ? dayStart : now;
      if (from.getTime() >= dayEnd.getTime()) continue;
      bounds.push(
        dayStart.getTime() > now.getTime()
          ? { gte: dayStart, lte: dayEnd }
          : { gt: now, lte: dayEnd },
      );
    } catch {
      continue;
    }
  }
  return bounds;
}

export function intentWindowEndsAt(
  intent: IntentWindowSource,
  timezone: string,
): Date | null {
  const windows = resolveTimeWindows(intent);
  const endMinutes = windows?.length
    ? Math.max(...windows.map((window) => window.endMinutes))
    : MINUTES_IN_DAY;
  const dateKeys = [...new Set(intent.dateKeys)].sort().reverse();
  for (const dateKey of dateKeys) {
    const end = dateAtLocalMinutes(dateKey, endMinutes, timezone);
    if (end) return end;
  }
  return null;
}

export function intentWindowIsReachable(
  intent: IntentWindowSource,
  timezone: string,
  now: Date = new Date(),
): boolean {
  const end = intentWindowEndsAt(intent, timezone);
  return !!end && end.getTime() > now.getTime();
}

export function proposalWindowSource(input: {
  dateKeys: string[];
  startTime: string | null;
  endTime: string | null;
}): IntentWindowSource {
  return {
    dateKeys: input.dateKeys,
    timeOfDay: input.startTime || input.endTime ? 'CUSTOM' : 'ANYTIME',
    startTime: input.startTime,
    endTime: input.endTime,
  };
}

export function nextSuggestedStart(
  intent: IntentWindowSource,
  timezone: string,
  now: Date = new Date(),
): Date | null {
  const resolvedWindows = resolveTimeWindows(intent);
  const windows = resolvedWindows?.length
    ? resolvedWindows
    : [{ startMinutes: 18 * 60, endMinutes: MINUTES_IN_DAY }];
  const stepMs = SUGGESTED_START_STEP_MINUTES * 60_000;
  const earliestStart = now.getTime() + stepMs;
  const roundedNow = new Date(Math.ceil(earliestStart / stepMs) * stepMs);

  for (const dateKey of [...new Set(intent.dateKeys)].sort()) {
    for (const window of windows) {
      const windowStart = dateAtLocalMinutes(
        dateKey,
        window.startMinutes,
        timezone,
      );
      const windowEnd = dateAtLocalMinutes(
        dateKey,
        window.endMinutes,
        timezone,
      );
      if (!windowStart || !windowEnd) continue;
      const candidate =
        windowStart.getTime() > roundedNow.getTime() ? windowStart : roundedNow;
      if (candidate.getTime() < windowEnd.getTime()) return candidate;
    }
  }
  return null;
}
