export const SLOT_BUSY_PARTICIPANT_STATUSES = ['PLAYING'] as const;

export const SLOT_OVERLAP_GAME_STATUSES = ['ANNOUNCED', 'STARTED'] as const;

export const SLOT_OVERLAP_ENTITY_TYPES = ['GAME', 'TOURNAMENT', 'LEAGUE', 'TRAINING'] as const;

export type SlotBusyParticipantStatus = (typeof SLOT_BUSY_PARTICIPANT_STATUSES)[number];
export type SlotOverlapGameStatus = (typeof SLOT_OVERLAP_GAME_STATUSES)[number];
export type SlotOverlapEntityType = (typeof SLOT_OVERLAP_ENTITY_TYPES)[number];

export type SlotTarget = {
  gameId: string;
  startTime: Date | string | number;
  endTime: Date | string | number;
  timeIsSet: boolean;
};

export type SlotOccupancy = {
  gameId: string;
  status: string;
  startTime: Date | string | number;
  endTime: Date | string | number;
  timeIsSet: boolean;
  gameStatus: string;
  entityType: string;
};

function toEpochMs(value: Date | string | number): number {
  if (typeof value === 'number') return value;
  if (value instanceof Date) return value.getTime();
  return new Date(value).getTime();
}

function includesLiteral<T extends string>(list: readonly T[], value: string): value is T {
  return (list as readonly string[]).includes(value);
}

export function gameSlotIntervalsOverlap(
  aStart: Date | string | number,
  aEnd: Date | string | number,
  bStart: Date | string | number,
  bEnd: Date | string | number,
): boolean {
  const aS = toEpochMs(aStart);
  const aE = toEpochMs(aEnd);
  const bS = toEpochMs(bStart);
  const bE = toEpochMs(bEnd);
  if (!Number.isFinite(aS) || !Number.isFinite(aE) || !Number.isFinite(bS) || !Number.isFinite(bE)) {
    return false;
  }
  if (!(aS < aE) || !(bS < bE)) return false;
  return aS < bE && bS < aE;
}

export function occupancyBlocksSlot(occupancy: SlotOccupancy, target: SlotTarget): boolean {
  if (!target.timeIsSet || !occupancy.timeIsSet) return false;
  if (occupancy.gameId === target.gameId) return false;
  if (!includesLiteral(SLOT_BUSY_PARTICIPANT_STATUSES, occupancy.status)) return false;
  if (!includesLiteral(SLOT_OVERLAP_GAME_STATUSES, occupancy.gameStatus)) return false;
  if (!includesLiteral(SLOT_OVERLAP_ENTITY_TYPES, occupancy.entityType)) return false;
  return gameSlotIntervalsOverlap(
    occupancy.startTime,
    occupancy.endTime,
    target.startTime,
    target.endTime,
  );
}

export function userIdsBusyInSlot(
  occupancies: Array<SlotOccupancy & { userId: string }>,
  target: SlotTarget,
): string[] {
  const ids = new Set<string>();
  for (const row of occupancies) {
    if (occupancyBlocksSlot(row, target)) ids.add(row.userId);
  }
  return [...ids];
}
