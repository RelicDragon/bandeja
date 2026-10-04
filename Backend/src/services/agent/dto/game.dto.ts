/**
 * Agent-facing game shapes. Whitelisted Prisma selects:
 * no `paymentHint` / `paymentMethods`, no cost shares, no chat, no booking provider data.
 * Game `name` / `description` are user-written text and reach the model as DATA only.
 */
import { ParticipantStatus, type Prisma } from '@prisma/client';
import { formatInTimeZone } from 'date-fns-tz';
import type { AgentEntityRef } from '@bandeja/shared/agentContract';

const DESCRIPTION_MAX = 600;
const LOCAL_FORMAT = 'EEE yyyy-MM-dd HH:mm';

/**
 * Wall-clock start/end in the game's city timezone, computed here so the model never
 * converts UTC itself (it got offsets wrong). Null when the time isn't set or the zone is
 * missing/invalid; then the model only has the UTC `startTime`.
 */
export function agentLocalTimes(
  row: { startTime: Date; endTime: Date; timeIsSet: boolean },
  timezone: string | null | undefined,
): { localStart: string | null; localEnd: string | null } {
  if (!row.timeIsSet || !timezone) return { localStart: null, localEnd: null };
  try {
    return {
      localStart: formatInTimeZone(row.startTime, timezone, LOCAL_FORMAT),
      localEnd: formatInTimeZone(row.endTime, timezone, LOCAL_FORMAT),
    };
  } catch {
    return { localStart: null, localEnd: null };
  }
}

export function agentGameSummarySelect(viewerId: string) {
  return {
    id: true,
    name: true,
    entityType: true,
    sport: true,
    gameType: true,
    status: true,
    resultsStatus: true,
    startTime: true,
    endTime: true,
    timeIsSet: true,
    isPublic: true,
    maxParticipants: true,
    minLevel: true,
    maxLevel: true,
    parentId: true,
    club: { select: { id: true, name: true } },
    court: { select: { name: true } },
    city: { select: { name: true, timezone: true } },
    participants: {
      where: { userId: viewerId },
      select: { role: true, status: true },
    },
    _count: {
      select: { participants: { where: { status: ParticipantStatus.PLAYING } }, externalBookings: true },
    },
  } satisfies Prisma.GameSelect;
}

export type AgentGameSummaryRow = Prisma.GameGetPayload<{
  select: ReturnType<typeof agentGameSummarySelect>;
}>;

export function agentGameTitle(row: {
  name: string | null;
  entityType: string;
  club: { name: string } | null;
}): string {
  const name = (row.name ?? '').trim();
  if (name) return name;
  const kind = row.entityType.charAt(0) + row.entityType.slice(1).toLowerCase().replace(/_/g, ' ');
  return row.club ? `${kind} at ${row.club.name}` : kind;
}

export function toAgentGameSummary(row: AgentGameSummaryRow) {
  const mine = row.participants[0] ?? null;
  return {
    gameId: row.id,
    title: agentGameTitle(row),
    entityType: row.entityType,
    sport: row.sport,
    gameType: row.gameType,
    status: row.status,
    resultsStatus: row.resultsStatus,
    startTime: row.timeIsSet ? row.startTime.toISOString() : null,
    endTime: row.timeIsSet ? row.endTime.toISOString() : null,
    ...agentLocalTimes(row, row.city?.timezone),
    timeIsSet: row.timeIsSet,
    cityTimezone: row.city?.timezone ?? null,
    cityName: row.city?.name ?? null,
    clubId: row.club?.id ?? null,
    clubName: row.club?.name ?? null,
    courtName: row.court?.name ?? null,
    isPublic: row.isPublic,
    playingCount: row._count.participants,
    maxParticipants: row.maxParticipants,
    /** Court bookings linked to the game (`GameExternalBooking`): 0 = no booking to cancel with it. */
    linkedCourtBookings: row._count.externalBookings,
    levelRange: row.minLevel != null || row.maxLevel != null ? { min: row.minLevel, max: row.maxLevel } : null,
    parentId: row.parentId,
    myRole: mine?.role ?? null,
    myStatus: mine?.status ?? null,
  };
}

export function agentGameEntity(row: AgentGameSummaryRow): AgentEntityRef {
  return {
    type: 'game',
    id: row.id,
    title: agentGameTitle(row),
    entityType: row.entityType,
    status: row.status,
    startTime: row.timeIsSet ? row.startTime.toISOString() : null,
    clubName: row.club?.name ?? null,
  };
}

export function truncateUserText(text: string | null | undefined, max = DESCRIPTION_MAX): string | null {
  const value = (text ?? '').trim();
  if (!value) return null;
  return value.length > max ? `${value.slice(0, max)}…` : value;
}
