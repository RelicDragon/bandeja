import type { EntityType, PlayIntentTimeOfDay } from '@prisma/client';

const MINUTES_IN_DAY = 1440;

export type TimeWindow = { startMinutes: number; endMinutes: number };

export type IntentCriteria = {
  dateKeys: string[];
  clubIds: string[];
  minLevel: number | null;
  maxLevel: number | null;
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime: string | null;
  endTime: string | null;
  genderTeams: 'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS';
  userLevel: number | null;
  userGender: string | null;
};

export type GameCriteria = {
  entityType?: EntityType;
  dateKey: string;
  clubId: string | null;
  startTime: Date;
  startTimeMinutes: number;
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: string | null;
};

export function timeStringToMinutes(time: string | null | undefined): number {
  if (!time) return 0;
  if (time === '24:00') return MINUTES_IN_DAY;
  const [hours, minutes] = time.split(':').map(Number);
  return (hours || 0) * 60 + (minutes || 0);
}

export function minutesToTimeString(minutes: number): string {
  if (minutes >= MINUTES_IN_DAY) return '24:00';
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function resolveTimeWindow(intent: {
  timeOfDay: PlayIntentTimeOfDay;
  startTime?: string | null;
  endTime?: string | null;
}): TimeWindow | null {
  switch (intent.timeOfDay) {
    case 'MORNING':
      return { startMinutes: 6 * 60, endMinutes: 12 * 60 };
    case 'AFTERNOON':
      return { startMinutes: 12 * 60, endMinutes: 18 * 60 };
    case 'EVENING':
      return { startMinutes: 18 * 60, endMinutes: MINUTES_IN_DAY };
    case 'CUSTOM': {
      if (!intent.startTime && !intent.endTime) return null;
      return {
        startMinutes: timeStringToMinutes(intent.startTime ?? '00:00'),
        endMinutes: timeStringToMinutes(intent.endTime ?? '24:00'),
      };
    }
    case 'ANYTIME':
    default:
      return null;
  }
}

export function resolveTimeWindows(intent: {
  timeOfDay: PlayIntentTimeOfDay;
  timeOfDays?: PlayIntentTimeOfDay[];
  startTime?: string | null;
  endTime?: string | null;
}): TimeWindow[] | null {
  const periods = intent.timeOfDays?.length
    ? [...new Set(intent.timeOfDays)]
    : [intent.timeOfDay];
  if (periods.includes('ANYTIME')) return null;

  const windows = periods
    .map((timeOfDay) =>
      resolveTimeWindow({
        timeOfDay,
        startTime: intent.startTime,
        endTime: intent.endTime,
      }),
    )
    .filter((window): window is TimeWindow => window !== null)
    .sort((a, b) => a.startMinutes - b.startMinutes);
  return windows;
}

export function datesIntersect(a: string[], b: string[]): string[] {
  if (a.length === 0 || b.length === 0) return [];
  const setB = new Set(b);
  return a.filter((d) => setB.has(d)).sort();
}

export function clubsIntersect(a: string[], b: string[]): string[] | null {
  if (a.length === 0 && b.length === 0) return [];
  if (a.length === 0) return [...b];
  if (b.length === 0) return [...a];
  const setB = new Set(b);
  const overlap = a.filter((id) => setB.has(id));
  return overlap.length > 0 ? overlap : null;
}

export function timeWindowsIntersect(a: TimeWindow | null, b: TimeWindow | null): TimeWindow | null {
  if (!a && !b) return null;
  if (!a) return b;
  if (!b) return a;
  const start = Math.max(a.startMinutes, b.startMinutes);
  const end = Math.min(a.endMinutes, b.endMinutes);
  if (start >= end) return null;
  return { startMinutes: start, endMinutes: end };
}

export function timeWindowSetsIntersect(
  a: TimeWindow[] | null,
  b: TimeWindow[] | null,
): TimeWindow[] | null {
  if (a === null && b === null) return null;
  if (a === null) return b ? [...b] : null;
  if (b === null) return [...a];

  const intersections = a.flatMap((left) =>
    b.flatMap((right) => {
      const overlap = timeWindowsIntersect(left, right);
      return overlap ? [overlap] : [];
    }),
  );
  const unique = new Map(
    intersections.map((window) => [
      `${window.startMinutes}:${window.endMinutes}`,
      window,
    ]),
  );
  return [...unique.values()].sort((left, right) =>
    left.startMinutes - right.startMinutes,
  );
}

export function levelWithinBand(
  level: number | null,
  minLevel: number | null,
  maxLevel: number | null,
): boolean {
  if (minLevel == null && maxLevel == null) return true;
  if (level == null) return true;
  if (minLevel != null && level < minLevel) return false;
  if (maxLevel != null && level > maxLevel) return false;
  return true;
}

export function levelsCompatible(a: IntentCriteria, b: IntentCriteria): boolean {
  return levelWithinBand(a.userLevel, b.minLevel, b.maxLevel) && levelWithinBand(b.userLevel, a.minLevel, a.maxLevel);
}

export function userMatchesGenderPref(
  pref: IntentCriteria['genderTeams'],
  gender: string | null,
): boolean {
  if (pref === 'ANY' || pref === 'MIX_PAIRS') return true;
  if (!gender || gender === 'PREFER_NOT_TO_SAY') return true;
  if (pref === 'MEN') return gender === 'MALE';
  if (pref === 'WOMEN') return gender === 'FEMALE';
  return true;
}

export function genderPrefsCompatible(
  a: IntentCriteria['genderTeams'],
  b: IntentCriteria['genderTeams'],
): boolean {
  if (a === 'MEN' && b === 'WOMEN') return false;
  if (a === 'WOMEN' && b === 'MEN') return false;
  if (a === 'MIX_PAIRS' && (b === 'MEN' || b === 'WOMEN')) return false;
  if (b === 'MIX_PAIRS' && (a === 'MEN' || a === 'WOMEN')) return false;
  return true;
}

export function intentsCompatible(a: IntentCriteria, b: IntentCriteria): {
  ok: boolean;
  dateKeys: string[];
  clubIds: string[];
  timeWindow: TimeWindow | null;
  timeWindows: TimeWindow[] | null;
  tightness: number;
} {
  const dateKeys = datesIntersect(a.dateKeys, b.dateKeys);
  if (dateKeys.length === 0) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }

  const clubs = clubsIntersect(a.clubIds, b.clubIds);
  if (clubs === null) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }

  const windowsA = resolveTimeWindows(a);
  const windowsB = resolveTimeWindows(b);
  const timeWindows = timeWindowSetsIntersect(windowsA, windowsB);
  if (windowsA !== null && windowsB !== null && timeWindows?.length === 0) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }
  const timeWindow = timeWindows?.[0] ?? null;

  if (!levelsCompatible(a, b)) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }

  if (!genderPrefsCompatible(a.genderTeams, b.genderTeams)) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }
  if (!userMatchesGenderPref(a.genderTeams, b.userGender)) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }
  if (!userMatchesGenderPref(b.genderTeams, a.userGender)) {
    return { ok: false, dateKeys: [], clubIds: [], timeWindow: null, timeWindows: [], tightness: 0 };
  }

  let tightness = dateKeys.length;
  if (clubs.length > 0 && a.clubIds.length > 0 && b.clubIds.length > 0) tightness += 3;
  else if (clubs.length > 0) tightness += 1;
  if (timeWindow) {
    const span = timeWindow.endMinutes - timeWindow.startMinutes;
    tightness += span <= 3 * 60 ? 3 : span <= 6 * 60 ? 2 : 1;
  } else if (windowsA === null && windowsB === null) {
    // Both anytime: flexible overlap is a solid match, not a weak one.
    tightness += 2;
  }

  return { ok: true, dateKeys, clubIds: clubs, timeWindow, timeWindows, tightness };
}

/**
 * Uses the same pairwise compatibility rule as proposal roster mutation.
 * This is intentionally derived from current proposal data so clients can
 * rediscover addable players after closing or reloading the lobby.
 */
export function canIntentJoinProposal(
  candidate: IntentCriteria,
  proposalMembers: IntentCriteria[],
): boolean {
  return proposalMembers.every((member) => intentsCompatible(candidate, member).ok);
}

export function intentMatchesGame(
  intent: IntentCriteria,
  game: GameCriteria,
  now: Date = new Date(),
): boolean {
  if (game.startTime.getTime() <= now.getTime()) return false;

  if (!intent.dateKeys.includes(game.dateKey)) return false;

  if (intent.clubIds.length > 0) {
    if (!game.clubId || !intent.clubIds.includes(game.clubId)) return false;
  }

  const windows = resolveTimeWindows(intent);
  if (windows) {
    const isInsideSelectedPeriod = windows.some(
      (window) =>
        game.startTimeMinutes >= window.startMinutes &&
        game.startTimeMinutes < window.endMinutes,
    );
    if (!isInsideSelectedPeriod) {
      return false;
    }
  }

  const gameHasLevels =
    game.entityType !== 'BAR' &&
    (game.minLevel != null || game.maxLevel != null);
  if (gameHasLevels && (intent.minLevel != null || intent.maxLevel != null)) {
    const iMin = intent.minLevel ?? Number.NEGATIVE_INFINITY;
    const iMax = intent.maxLevel ?? Number.POSITIVE_INFINITY;
    const gMin = game.minLevel ?? Number.NEGATIVE_INFINITY;
    const gMax = game.maxLevel ?? Number.POSITIVE_INFINITY;
    if (gMax < iMin || gMin > iMax) return false;
  }

  if (intent.userLevel != null && gameHasLevels) {
    if (game.minLevel != null && intent.userLevel < game.minLevel) return false;
    if (game.maxLevel != null && intent.userLevel > game.maxLevel) return false;
  }

  const gt = game.genderTeams;
  const pref = intent.genderTeams;
  if (pref === 'MEN' && gt === 'WOMEN') return false;
  if (pref === 'WOMEN' && gt === 'MEN') return false;
  if (pref === 'MIX_PAIRS' && gt && gt !== 'ANY' && gt !== 'MIX_PAIRS' && gt !== 'MIXED') return false;

  if (intent.userGender && intent.userGender !== 'PREFER_NOT_TO_SAY') {
    if (gt && gt !== 'ANY' && gt !== 'MIX_PAIRS' && gt !== 'MIXED') {
      if (gt === 'MEN' && intent.userGender !== 'MALE') return false;
      if (gt === 'WOMEN' && intent.userGender !== 'FEMALE') return false;
    }
  }

  return true;
}

export type AffinityBucket = 'near' | 'mid' | 'far';

export function affinityScore(viewer: IntentCriteria, other: IntentCriteria): { score: number; bucket: AffinityBucket } {
  const compat = intentsCompatible(viewer, other);
  if (!compat.ok) return { score: 0, bucket: 'far' };
  const score = compat.tightness;
  if (score >= 5) return { score, bucket: 'near' };
  if (score >= 2) return { score, bucket: 'mid' };
  // Compatible with weak tightness still shows as mid — far is reserved for no overlap.
  return { score, bucket: 'mid' };
}

export function buildRematchKey(userIds: string[]): string {
  return [...userIds].sort().join('|');
}
