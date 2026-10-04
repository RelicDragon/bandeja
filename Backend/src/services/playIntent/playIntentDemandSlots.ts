/**
 * Demand slots — "4 players at your level want Tue evening".
 *
 * The cluster matcher only proposes when a full roster (padel: 4) is pairwise
 * compatible at the same moment, which a one-city pool rarely reaches. Demand
 * slots turn the same open intents into something a person can act on: they
 * bucket every reachable OPEN intent into day × part-of-day slots, so an
 * organizer can create the game and invite them, and a spectator can join the
 * slot (which is what tips it into an automatic proposal).
 *
 * Pure: the service loads rows, this file decides buckets, fit and order.
 */
import type { IntentCriteria } from './playIntentCriteria';
import {
  clubsIntersect,
  levelWithinBand,
  resolveTimeWindows,
  userMatchesGenderPref,
} from './playIntentCriteria';

export type DemandPeriod = 'MORNING' | 'AFTERNOON' | 'EVENING';

export const DEMAND_PERIODS: ReadonlyArray<{
  period: DemandPeriod;
  startMinutes: number;
  endMinutes: number;
}> = [
  { period: 'MORNING', startMinutes: 6 * 60, endMinutes: 12 * 60 },
  { period: 'AFTERNOON', startMinutes: 12 * 60, endMinutes: 18 * 60 },
  { period: 'EVENING', startMinutes: 18 * 60, endMinutes: 24 * 60 },
];

/** A custom window must cover this much of a period to count as wanting it. */
export const DEMAND_MIN_PERIOD_OVERLAP_MINUTES = 60;
/** Today's period stays offerable while a game this long still fits before it ends. */
export const DEMAND_MIN_REMAINING_MINUTES = 90;
/** "At your level": within half a level of the viewer. */
export const DEMAND_LEVEL_FIT_DELTA = 0.5;
export const DEMAND_SLOTS_CAP = 6;
export const DEMAND_SLOT_MEMBERS_CAP = 8;

export type DemandIntent = {
  intentId: string;
  userId: string;
  criteria: IntentCriteria;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  gender: string | null;
};

export type DemandViewer = {
  userId: string;
  level: number | null;
  gender: string | null;
  /** The viewer's own reachable GAME intent in this sport, if any. */
  intent: IntentCriteria | null;
};

export type DemandSlotMember = {
  userId: string;
  intentId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  gender: string | null;
  level: number | null;
  fitsViewer: boolean;
};

export type DemandSlot = {
  key: string;
  dateKey: string;
  period: DemandPeriod;
  /** `HH:mm` local; the period, not narrowed to "now" — the client clips. */
  windowStart: string;
  windowEnd: string;
  count: number;
  fitCount: number;
  viewerIn: boolean;
  /** Clubs every fitting member accepts; `[]` when any club works for all. `null` when they disagree. */
  clubIds: string[] | null;
  members: DemandSlotMember[];
};

const PERIOD_ORDER: Record<DemandPeriod, number> = {
  MORNING: 0,
  AFTERNOON: 1,
  EVENING: 2,
};

function hhmm(minutes: number): string {
  if (minutes >= 1440) return '24:00';
  return `${String(Math.floor(minutes / 60)).padStart(2, '0')}:${String(minutes % 60).padStart(2, '0')}`;
}

export function periodsCoveredBy(criteria: IntentCriteria): DemandPeriod[] {
  const windows = resolveTimeWindows(criteria);
  if (windows === null) return DEMAND_PERIODS.map((p) => p.period);
  return DEMAND_PERIODS.filter((p) =>
    windows.some(
      (w) =>
        Math.min(w.endMinutes, p.endMinutes) - Math.max(w.startMinutes, p.startMinutes) >=
        DEMAND_MIN_PERIOD_OVERLAP_MINUTES,
    ),
  ).map((p) => p.period);
}

export function demandSlotIsOpen(
  dateKey: string,
  period: DemandPeriod,
  todayKey: string,
  nowMinutes: number,
): boolean {
  if (dateKey < todayKey) return false;
  if (dateKey > todayKey) return true;
  const def = DEMAND_PERIODS.find((p) => p.period === period)!;
  return def.endMinutes - nowMinutes >= DEMAND_MIN_REMAINING_MINUTES;
}

/**
 * Would this person be a sensible invite for the viewer's game? Both sides'
 * level bands, a close level, gender preference, and — when the viewer is
 * looking too — the viewer's own band and clubs.
 */
export function demandMemberFitsViewer(viewer: DemandViewer, other: DemandIntent): boolean {
  const theirs = other.criteria;
  if (!userMatchesGenderPref(theirs.genderTeams, viewer.gender)) return false;
  if (!levelWithinBand(viewer.level, theirs.minLevel, theirs.maxLevel)) return false;
  if (
    viewer.level != null &&
    theirs.userLevel != null &&
    Math.abs(viewer.level - theirs.userLevel) > DEMAND_LEVEL_FIT_DELTA
  ) {
    return false;
  }
  if (viewer.intent) {
    if (!levelWithinBand(theirs.userLevel, viewer.intent.minLevel, viewer.intent.maxLevel)) {
      return false;
    }
    if (!userMatchesGenderPref(viewer.intent.genderTeams, other.gender)) return false;
    if (clubsIntersect(viewer.intent.clubIds, theirs.clubIds) === null) return false;
  }
  return true;
}

function commonClubIds(members: DemandIntent[]): string[] | null {
  let acc: string[] = [];
  for (const m of members) {
    const next = clubsIntersect(acc, m.criteria.clubIds);
    if (next === null) return null;
    acc = next;
  }
  return acc;
}

export function buildDemandSlots(input: {
  viewer: DemandViewer;
  intents: DemandIntent[];
  /** Day keys the slots may use (today .. today+2 in the city timezone). */
  dayKeys: string[];
  todayKey: string;
  nowMinutes: number;
  /** Users already PLAYING in a game on that day — not offered for it. */
  busyByDateKey: Map<string, Set<string>>;
  cap?: number;
}): DemandSlot[] {
  const { viewer, dayKeys, todayKey, nowMinutes, busyByDateKey } = input;
  const allowedDays = new Set(dayKeys);
  const buckets = new Map<string, { dateKey: string; period: DemandPeriod; intents: DemandIntent[] }>();

  for (const intent of input.intents) {
    if (intent.userId === viewer.userId) continue;
    const periods = periodsCoveredBy(intent.criteria);
    for (const dateKey of new Set(intent.criteria.dateKeys)) {
      if (!allowedDays.has(dateKey)) continue;
      if (busyByDateKey.get(dateKey)?.has(intent.userId)) continue;
      for (const period of periods) {
        if (!demandSlotIsOpen(dateKey, period, todayKey, nowMinutes)) continue;
        const key = `${dateKey}:${period}`;
        const bucket = buckets.get(key) ?? { dateKey, period, intents: [] };
        // One intent per user is the DB invariant; guard anyway.
        if (!bucket.intents.some((i) => i.userId === intent.userId)) bucket.intents.push(intent);
        buckets.set(key, bucket);
      }
    }
  }

  const viewerPeriods = viewer.intent ? new Set(periodsCoveredBy(viewer.intent)) : null;
  const viewerDays = viewer.intent ? new Set(viewer.intent.dateKeys) : null;

  const slots: DemandSlot[] = [];
  for (const [key, bucket] of buckets) {
    const def = DEMAND_PERIODS.find((p) => p.period === bucket.period)!;
    const scored = bucket.intents.map((intent) => ({
      intent,
      fits: demandMemberFitsViewer(viewer, intent),
      gap:
        viewer.level != null && intent.criteria.userLevel != null
          ? Math.abs(viewer.level - intent.criteria.userLevel)
          : Number.POSITIVE_INFINITY,
    }));
    scored.sort(
      (a, b) =>
        Number(b.fits) - Number(a.fits) ||
        a.gap - b.gap ||
        a.intent.userId.localeCompare(b.intent.userId),
    );
    const fitting = scored.filter((s) => s.fits).map((s) => s.intent);
    slots.push({
      key,
      dateKey: bucket.dateKey,
      period: bucket.period,
      windowStart: hhmm(def.startMinutes),
      windowEnd: hhmm(def.endMinutes),
      count: scored.length,
      fitCount: fitting.length,
      viewerIn:
        !!viewerDays?.has(bucket.dateKey) && !!viewerPeriods?.has(bucket.period),
      clubIds: commonClubIds(fitting),
      members: scored.slice(0, DEMAND_SLOT_MEMBERS_CAP).map(({ intent, fits }) => ({
        userId: intent.userId,
        intentId: intent.intentId,
        firstName: intent.firstName,
        lastName: intent.lastName,
        avatar: intent.avatar,
        gender: intent.gender,
        level: intent.criteria.userLevel,
        fitsViewer: fits,
      })),
    });
  }

  slots.sort(
    (a, b) =>
      b.fitCount - a.fitCount ||
      b.count - a.count ||
      a.dateKey.localeCompare(b.dateKey) ||
      PERIOD_ORDER[a.period] - PERIOD_ORDER[b.period],
  );
  return slots.slice(0, input.cap ?? DEMAND_SLOTS_CAP);
}
