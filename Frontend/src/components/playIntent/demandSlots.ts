/**
 * Demand slots (`GET /play-intents/slots`) → labels, the one-tap create-game
 * prefill and the "I'm in" intent body. Pure so the lobby, the idle card and
 * tests share one definition.
 */
import type { CreatePlayIntentDto, DemandSlot, DemandSlotMember } from '@/api/playIntents';
import type { PlayIntentCreateSource } from '@shared/playIntentCreateSource';
import type { BasicUser, Sport } from '@/types';
import { localDayMinuteToInstant, timeStringToMinutes } from '@/utils/playIntentWindow';
import { resolvePlayIntentCreateLevelRange } from '@/utils/createGamePlayIntentLevelRange';

type T = (key: string, options?: Record<string, unknown>) => string;

const PERIOD_DEFAULT_START: Record<DemandSlot['period'], string> = {
  MORNING: '09:00',
  AFTERNOON: '14:00',
  EVENING: '18:00',
};
const GAME_MINUTES = 90;
const LEAD_MINUTES = 60;
const STEP_MINUTES = 30;

function addDays(dateKey: string, days: number): string {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

export function demandSlotDayLabel(dateKey: string, todayKey: string, t: T, locale?: string): string {
  if (dateKey === todayKey) return t('playIntent.today');
  if (dateKey === addDays(todayKey, 1)) return t('playIntent.tomorrow');
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat(locale, { weekday: 'short', timeZone: 'UTC' }).format(
    new Date(Date.UTC(y, m - 1, d)),
  );
}

export function demandSlotPeriodLabel(period: DemandSlot['period'], t: T): string {
  if (period === 'MORNING') return t('playIntent.morning');
  if (period === 'AFTERNOON') return t('playIntent.afternoon');
  return t('playIntent.evening');
}

/** "Tue · Evening" */
export function demandSlotWhen(slot: Pick<DemandSlot, 'dateKey' | 'period'>, todayKey: string, t: T, locale?: string): string {
  return `${demandSlotDayLabel(slot.dateKey, todayKey, t, locale)} · ${demandSlotPeriodLabel(slot.period, t)}`;
}

/**
 * The slot worth a headline: the viewer's own slot when someone shares it,
 * else the first (server-ranked) slot with at least two people at their level.
 */
export function headlineDemandSlot(slots: DemandSlot[] | undefined): DemandSlot | null {
  if (!slots?.length) return null;
  return (
    slots.find((s) => s.viewerIn && s.count > 0) ??
    slots.find((s) => s.fitCount >= 2) ??
    null
  );
}

/**
 * Up to `partySize - 1` invitees. Only people at the viewer's level when there
 * are any — that is what the card promised; the rest of the game fills from the
 * public feed. A slot with no fit offers everyone looking (server order).
 */
export function pickDemandSlotInvitees(slot: DemandSlot, partySize: number): DemandSlotMember[] {
  const pool = slot.fitCount > 0 ? slot.members.filter((m) => m.fitsViewer) : slot.members;
  return pool.slice(0, Math.max(0, partySize - 1));
}

/** Local `HH:mm` "now" in a timezone. */
function nowMinutesIn(timezone: string, now: Date): number {
  const parts = new Intl.DateTimeFormat('en-GB', {
    timeZone: timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const h = Number(parts.find((p) => p.type === 'hour')?.value ?? 0);
  const m = Number(parts.find((p) => p.type === 'minute')?.value ?? 0);
  return h * 60 + m;
}

/**
 * The period's usual start ("Evening" → 18:00), pushed to the next half hour at
 * least an hour out when that has already passed today.
 */
export function demandSlotStartMinutes(slot: DemandSlot, todayKey: string, timezone: string, now: Date): number {
  const base = timeStringToMinutes(PERIOD_DEFAULT_START[slot.period]);
  if (slot.dateKey !== todayKey) return base;
  const earliest = nowMinutesIn(timezone, now) + LEAD_MINUTES;
  if (earliest <= base) return base;
  return Math.ceil(earliest / STEP_MINUTES) * STEP_MINUTES;
}

/** Looking-player rows (demand slot or invite pool) as the avatar/chip user shape. */
export function demandMemberAsBasicUser(member: {
  userId: string;
  firstName: string | null;
  lastName: string | null;
  avatar: string | null;
  gender?: string | null;
  level: number | null;
}): BasicUser {
  return {
    id: member.userId,
    firstName: member.firstName ?? undefined,
    lastName: member.lastName ?? undefined,
    avatar: member.avatar,
    level: member.level ?? 0,
    socialLevel: 0,
    gender:
      member.gender === 'MALE' || member.gender === 'FEMALE'
        ? member.gender
        : 'PREFER_NOT_TO_SAY',
    approvedLevel: false,
    isTrainer: false,
  };
}

export type DemandSlotCreateState = {
  entityType: 'GAME';
  initialGameData: Record<string, unknown>;
  invitedPlayerIds: string[];
  invitedPlayers: BasicUser[];
  /** Invite path: receiver → intent, so the post-create invite reserves it. */
  invitePlayIntentIds?: Record<string, string>;
  /** Host path: the viewer's own OPEN intent covers the slot. */
  playIntentSource?: PlayIntentCreateSource;
  playIntentRosterLevels?: number[];
};

/**
 * `/create-game` navigation state for "Create & invite". A viewer whose OPEN
 * intent covers the slot creates as host (DIRECT source — their intent is
 * consumed, invitees linked atomically). Anyone else creates normally and the
 * invites carry `playIntentId`, which reserves each still-OPEN intent.
 */
export function demandSlotCreateState(input: {
  slot: DemandSlot;
  partySize: number;
  sport: Sport;
  timezone: string;
  todayKey: string;
  viewerIntentId: string | null;
  viewerLevel: number | null;
  now?: Date;
}): DemandSlotCreateState {
  const { slot, partySize, sport, timezone, todayKey, viewerIntentId, viewerLevel } = input;
  const invitees = pickDemandSlotInvitees(slot, partySize);
  const startMinutes = demandSlotStartMinutes(slot, todayKey, timezone, input.now ?? new Date());
  const start = localDayMinuteToInstant(slot.dateKey, startMinutes, timezone);
  const rosterLevels = invitees
    .map((m) => m.level)
    .filter((l): l is number => typeof l === 'number');
  const host = typeof viewerLevel === 'number' ? viewerLevel : null;
  const [minLevel, maxLevel] = resolvePlayIntentCreateLevelRange({
    fromPlayIntent: true,
    hostDefault: host != null
      ? [host - 0.7, host + 0.7]
      : rosterLevels.length
        ? [Math.min(...rosterLevels), Math.max(...rosterLevels)]
        : [1, 7],
    rosterLevels,
  });

  const initialGameData: Record<string, unknown> = {
    sport,
    isPublic: true,
    maxParticipants: partySize,
    playersPerMatch: partySize === 2 ? 2 : 4,
    minLevel,
    maxLevel,
    ...(slot.clubIds && slot.clubIds.length === 1 ? { clubId: slot.clubIds[0] } : {}),
    ...(start
      ? {
          startTime: start.toISOString(),
          endTime: new Date(start.getTime() + GAME_MINUTES * 60_000).toISOString(),
        }
      : {}),
  };

  const base = {
    entityType: 'GAME' as const,
    initialGameData,
    invitedPlayerIds: invitees.map((m) => m.userId),
    invitedPlayers: invitees.map(demandMemberAsBasicUser),
  };
  if (viewerIntentId && slot.viewerIn) {
    return {
      ...base,
      playIntentSource: {
        type: 'DIRECT',
        hostIntentId: viewerIntentId,
        invitees: invitees.map((m) => ({ userId: m.userId, intentId: m.intentId })),
      },
      playIntentRosterLevels: rosterLevels,
    };
  }
  return {
    ...base,
    invitePlayIntentIds: Object.fromEntries(invitees.map((m) => [m.userId, m.intentId])),
  };
}

/** "I'm in": an intent for exactly this day and part of day. */
export function demandSlotIntentBody(slot: DemandSlot, cityId: string, sport: Sport): CreatePlayIntentDto {
  return {
    cityId,
    sport,
    entityType: 'GAME',
    dateKeys: [slot.dateKey],
    timeOfDay: slot.period,
    timeOfDays: [slot.period],
  };
}
