import { BRACKET_MAX_ENTRANTS, BRACKET_MIN_ENTRANTS } from './bracketStructure';

export type CrossGroupSeedingPreset = 'WINNERS_THEN_RUNNERS_UP' | 'GROUP_BLOCK' | 'MANUAL';

export type CrossGroupValidationError =
  | 'TOO_FEW_GROUPS'
  | 'TOTAL_BELOW_MIN'
  | 'TOTAL_OVER_MAX'
  | 'GROUP_TOO_SMALL'
  | 'DUPLICATE_PARTICIPANT'
  | 'GLOBAL_LENGTH_MISMATCH';

export interface StandingSortable {
  id: string;
  points: number;
  wins: number;
  scoreDelta: number;
}

export function compareStandingsForBracket(a: StandingSortable, b: StandingSortable): number {
  if (b.points !== a.points) return b.points - a.points;
  if (b.wins !== a.wins) return b.wins - a.wins;
  if (b.scoreDelta !== a.scoreDelta) return b.scoreDelta - a.scoreDelta;
  return 0;
}

export function sortCanonicalGroups<T extends { id: string; createdAt: string }>(groups: T[]): T[] {
  return [...groups].sort((a, b) => a.createdAt.localeCompare(b.createdAt));
}

export function maxEqualTopKPerGroup(includedGroupCount: number, minGroupSize: number): number {
  if (includedGroupCount < 1) return 0;
  const capByBracket = Math.floor(BRACKET_MAX_ENTRANTS / includedGroupCount);
  return Math.max(0, Math.min(capByBracket, minGroupSize));
}

export function crossGroupTotalEntrants(k: number, includedGroupCount: number): number {
  return k * includedGroupCount;
}

export function buildEqualTopKQualifiers(
  standingsByGroup: Record<string, StandingSortable[]>,
  k: number,
  includedGroupIds: string[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const groupId of includedGroupIds) {
    const sorted = [...(standingsByGroup[groupId] ?? [])].sort(compareStandingsForBracket);
    out[groupId] = sorted.slice(0, k).map((s) => s.id);
  }
  return out;
}

export function mergeGlobalParticipantIds(
  qualifiers: Record<string, string[]>,
  groupOrder: string[],
  preset: CrossGroupSeedingPreset,
  manualOrder?: string[]
): string[] {
  if (preset === 'MANUAL' && manualOrder?.length) {
    return [...manualOrder];
  }

  const k = Math.max(0, ...groupOrder.map((gid) => qualifiers[gid]?.length ?? 0));
  const ids: string[] = [];

  if (preset === 'GROUP_BLOCK') {
    for (const groupId of groupOrder) {
      const row = qualifiers[groupId] ?? [];
      for (let r = 0; r < k; r++) {
        if (row[r]) ids.push(row[r]);
      }
    }
    return ids;
  }

  // WINNERS_THEN_RUNNERS_UP (default)
  for (let r = 0; r < k; r++) {
    for (const groupId of groupOrder) {
      const row = qualifiers[groupId] ?? [];
      if (row[r]) ids.push(row[r]);
    }
  }
  return ids;
}

export class CrossGroupPoolValidationError extends Error {
  constructor(
    public readonly code: CrossGroupValidationError,
    public readonly details?: { groupId?: string; groupName?: string; n?: number; k?: number }
  ) {
    super(code);
    this.name = 'CrossGroupPoolValidationError';
  }
}

export function validateCrossGroupPool(params: {
  k: number;
  includedGroupIds: string[];
  qualifiers: Record<string, string[]>;
  globalParticipantIds: string[];
  groupNames?: Record<string, string>;
}): void {
  const { k, includedGroupIds, qualifiers, globalParticipantIds, groupNames } = params;
  const g = includedGroupIds.length;
  const total = k * g;

  if (g < 2) {
    throw new CrossGroupPoolValidationError('TOO_FEW_GROUPS');
  }
  if (total < BRACKET_MIN_ENTRANTS) {
    throw new CrossGroupPoolValidationError('TOTAL_BELOW_MIN');
  }
  if (total > BRACKET_MAX_ENTRANTS) {
    throw new CrossGroupPoolValidationError('TOTAL_OVER_MAX');
  }

  for (const groupId of includedGroupIds) {
    const row = qualifiers[groupId] ?? [];
    if (row.length < k) {
      throw new CrossGroupPoolValidationError('GROUP_TOO_SMALL', {
        groupId,
        groupName: groupNames?.[groupId],
        n: row.length,
        k,
      });
    }
  }

  const seen = new Set<string>();
  for (const id of globalParticipantIds) {
    if (seen.has(id)) {
      throw new CrossGroupPoolValidationError('DUPLICATE_PARTICIPANT');
    }
    seen.add(id);
  }

  if (globalParticipantIds.length !== total) {
    throw new CrossGroupPoolValidationError('GLOBAL_LENGTH_MISMATCH');
  }
}
