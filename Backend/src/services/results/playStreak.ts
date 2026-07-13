import { formatInTimeZone, fromZonedTime } from 'date-fns-tz';

export const PLAY_STREAK_AT_RISK_HOURS = 48;

export type PlayStreakState = {
  count: number;
  best: number;
  lastPlayAt: Date | null;
  /** Start of local day of last streak-advancing play (in-memory / recompute only). */
  weekStartAt: Date | null;
};

export type PlayStreakAdvanceResult = PlayStreakState & {
  lastPlayAt: Date;
  weekStartAt: Date;
  advanced: boolean;
};

export type PlayStreakView = {
  current: number;
  best: number;
  lastPlayAt: string | null;
  deadlineAt: string | null;
  atRisk: boolean;
  hoursLeft: number | null;
};

export function localDateKey(instant: Date, timezone: string): string {
  return formatInTimeZone(instant, timezone, 'yyyy-MM-dd');
}

export function startOfLocalDateKey(dateKey: string, timezone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return fromZonedTime(new Date(y, m - 1, d, 0, 0, 0, 0), timezone);
}

export function endOfLocalDateKey(dateKey: string, timezone: string): Date {
  const [y, m, d] = dateKey.split('-').map(Number);
  return fromZonedTime(new Date(y, m - 1, d, 23, 59, 59, 999), timezone);
}

export function addLocalDateKeys(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d));
  utc.setUTCDate(utc.getUTCDate() + days);
  return utc.toISOString().slice(0, 10);
}

/** Deadline = end of local calendar day of (lastPlayAt local date + 7 days).
 * Played Tuesday → keep streak by next Tuesday EOD; day-7 play can advance the week. */
export function getPlayStreakDeadline(lastPlayAt: Date, timezone: string): Date {
  const lastDay = localDateKey(lastPlayAt, timezone);
  return endOfLocalDateKey(addLocalDateKeys(lastDay, 7), timezone);
}

export function isPlayStreakAlive(
  lastPlayAt: Date | null | undefined,
  timezone: string,
  now: Date = new Date(),
): boolean {
  if (!lastPlayAt) return false;
  return now.getTime() <= getPlayStreakDeadline(lastPlayAt, timezone).getTime();
}

/**
 * Advance streak for one qualifying play.
 * Same open week: local day in [weekStart, weekStart+7) → refresh lastPlayAt only.
 * New week while alive → count += 1 and reset weekStart.
 * Broken / first → count = 1.
 */
export function advancePlayStreak(
  state: PlayStreakState,
  playAt: Date,
  timezone: string,
): PlayStreakAdvanceResult {
  const playDay = localDateKey(playAt, timezone);
  const playDayStart = startOfLocalDateKey(playDay, timezone);

  const weekStartAt = state.weekStartAt;
  const lastPlayAt = state.lastPlayAt;
  const brokenOrEmpty =
    !lastPlayAt ||
    state.count <= 0 ||
    !weekStartAt ||
    !isPlayStreakAlive(lastPlayAt, timezone, playAt);

  if (brokenOrEmpty) {
    return {
      count: 1,
      best: Math.max(state.best, 1),
      lastPlayAt: playAt,
      weekStartAt: playDayStart,
      advanced: true,
    };
  }

  const weekStartDay = localDateKey(weekStartAt, timezone);
  const nextWeekDay = addLocalDateKeys(weekStartDay, 7);

  if (playDay < nextWeekDay) {
    return {
      count: state.count,
      best: state.best,
      lastPlayAt: playAt,
      weekStartAt,
      advanced: false,
    };
  }

  const count = state.count + 1;
  return {
    count,
    best: Math.max(state.best, count),
    lastPlayAt: playAt,
    weekStartAt: playDayStart,
    advanced: true,
  };
}

/** Replay qualifying plays ascending; apply lazy break vs `now`. */
export function recomputePlayStreak(
  playAts: Date[],
  timezone: string,
  now: Date = new Date(),
): PlayStreakState {
  let state: PlayStreakState = {
    count: 0,
    best: 0,
    lastPlayAt: null,
    weekStartAt: null,
  };

  const sorted = [...playAts].sort((a, b) => a.getTime() - b.getTime());
  for (const playAt of sorted) {
    const next = advancePlayStreak(state, playAt, timezone);
    state = {
      count: next.count,
      best: next.best,
      lastPlayAt: next.lastPlayAt,
      weekStartAt: next.weekStartAt,
    };
  }

  if (state.lastPlayAt && !isPlayStreakAlive(state.lastPlayAt, timezone, now)) {
    return {
      count: 0,
      best: state.best,
      lastPlayAt: state.lastPlayAt,
      weekStartAt: state.weekStartAt,
    };
  }

  return state;
}

export function projectPlayStreak(
  fields: { count: number; best: number; lastPlayAt: Date | null },
  timezone: string,
  now: Date = new Date(),
  options: { includeAtRisk: boolean } = { includeAtRisk: false },
): PlayStreakView {
  const alive = isPlayStreakAlive(fields.lastPlayAt, timezone, now);
  const current = alive ? fields.count : 0;
  const deadline = fields.lastPlayAt ? getPlayStreakDeadline(fields.lastPlayAt, timezone) : null;
  const hoursLeft =
    alive && deadline != null
      ? Math.max(0, (deadline.getTime() - now.getTime()) / 3_600_000)
      : null;
  const atRisk =
    options.includeAtRisk && alive && hoursLeft != null && hoursLeft <= PLAY_STREAK_AT_RISK_HOURS;

  return {
    current,
    best: fields.best,
    lastPlayAt: fields.lastPlayAt ? fields.lastPlayAt.toISOString() : null,
    deadlineAt: deadline ? deadline.toISOString() : null,
    atRisk: options.includeAtRisk ? atRisk : false,
    hoursLeft: options.includeAtRisk ? hoursLeft : null,
  };
}
