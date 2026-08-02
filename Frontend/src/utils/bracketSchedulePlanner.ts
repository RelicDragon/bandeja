import type {
  BracketPlayoffPreviewResponse,
  BracketPreviewSlotDto,
  BracketSlotScheduleInput,
} from '@/api/leagues';

export interface BracketScheduleCourt {
  id: string;
  name: string;
}

export interface PlannedBracketFixture extends BracketSlotScheduleInput {
  label: string;
  groupName: string;
  courtName: string;
  slotKind: BracketPreviewSlotDto['slotKind'];
  roundIndex: number;
  matchIndex: number;
}

export const bracketPlannerFixtureKey = (
  leagueGroupId: string | null | undefined,
  slotKey: string
) => `${leagueGroupId ?? '__cross_group__'}\0${slotKey}`;

function localDateTime(date: string, time: string): Date {
  const value = new Date(`${date}T${time}:00`);
  if (!Number.isFinite(value.getTime())) throw new Error('Invalid schedule start');
  return value;
}

export function bracketFixtureLabel(slot: BracketPreviewSlotDto): string {
  const match = slot.matchIndex + 1;
  switch (slot.slotKind) {
    case 'THIRD_PLACE':
      return 'Bronze match';
    case 'GRAND_FINAL':
      return slot.roundIndex === 0 ? 'Grand final' : 'Grand final reset';
    case 'CONSOLATION':
      return `${slot.roundLabel} · C${match}`;
    case 'LOSERS':
      return `${slot.roundLabel} · L${match}`;
    case 'PLAY_IN':
      return `Play-in ${match}`;
    default:
      return `${slot.roundLabel} · ${match}`;
  }
}

/**
 * Earliest-start list scheduler. Scheduling one tree completely before the next
 * naturally creates the compact pipeline used for multi-division playoff days:
 * later rounds use the first courts while the next division starts on freed courts.
 */
export function buildBracketPipelineSchedule(params: {
  preview: BracketPlayoffPreviewResponse;
  groupOrder: Array<string | null>;
  groupNames: Record<string, string>;
  clubId: string;
  courts: BracketScheduleCourt[];
  date: string;
  startTime: string;
  durationMinutes: number;
  durationOverrides?: Record<string, number>;
}): PlannedBracketFixture[] {
  const {
    preview,
    groupOrder,
    groupNames,
    clubId,
    courts,
    date,
    startTime,
    durationMinutes,
    durationOverrides = {},
  } = params;
  if (!clubId || courts.length === 0) return [];
  if (!Number.isFinite(durationMinutes) || durationMinutes < 5) {
    throw new Error('Invalid fixture duration');
  }

  const baseStart = localDateTime(date, startTime).getTime();
  const courtAvailable = new Map(courts.map((court) => [court.id, baseStart]));
  const scheduledEnd = new Map<string, number>();
  const result: PlannedBracketFixture[] = [];
  const groupsById = new Map(
    preview.groups.map((group) => [group.leagueGroupId ?? '__cross_group__', group])
  );

  for (const groupId of groupOrder) {
    const group = groupsById.get(groupId ?? '__cross_group__');
    if (!group) continue;
    const slots = [...group.slots].sort(
      (a, b) =>
        a.phaseIndex - b.phaseIndex ||
        a.roundIndex - b.roundIndex ||
        a.matchIndex - b.matchIndex
    );
    for (const slot of slots) {
      const key = bracketPlannerFixtureKey(group.leagueGroupId, slot.slotKey);
      const feederReady = [slot.feederSlotAKey, slot.feederSlotBKey]
        .filter((value): value is string => Boolean(value))
        .reduce(
          (latest, feeder) =>
            Math.max(
              latest,
              scheduledEnd.get(bracketPlannerFixtureKey(group.leagueGroupId, feeder)) ?? baseStart
            ),
          baseStart
        );
      const court = courts.reduce((best, candidate) => {
        const candidateStart = Math.max(courtAvailable.get(candidate.id) ?? baseStart, feederReady);
        const bestStart = Math.max(courtAvailable.get(best.id) ?? baseStart, feederReady);
        return candidateStart < bestStart ? candidate : best;
      }, courts[0]!);
      const start = Math.max(courtAvailable.get(court.id) ?? baseStart, feederReady);
      const duration = Math.max(5, durationOverrides[key] ?? durationMinutes);
      const end = start + duration * 60_000;
      courtAvailable.set(court.id, end);
      scheduledEnd.set(key, end);
      result.push({
        leagueGroupId: group.leagueGroupId,
        slotKey: slot.slotKey,
        clubId,
        courtId: court.id,
        startTime: new Date(start).toISOString(),
        endTime: new Date(end).toISOString(),
        label: bracketFixtureLabel(slot),
        groupName:
          group.leagueGroupId == null
            ? 'Season playoff'
            : groupNames[group.leagueGroupId] ?? 'Group',
        courtName: court.name,
        slotKind: slot.slotKind,
        roundIndex: slot.roundIndex,
        matchIndex: slot.matchIndex,
      });
    }
  }
  return result;
}

export function scheduleDurationMinutes(schedule: Pick<BracketSlotScheduleInput, 'startTime' | 'endTime'>) {
  return Math.round((new Date(schedule.endTime).getTime() - new Date(schedule.startTime).getTime()) / 60_000);
}
