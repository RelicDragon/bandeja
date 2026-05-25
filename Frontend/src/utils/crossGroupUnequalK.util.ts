import { BRACKET_MAX_ENTRANTS, BRACKET_MIN_ENTRANTS } from './bracketStructure';
import {
  buildEqualTopKQualifiers,
  compareStandingsForBracket,
  mergeGlobalParticipantIds,
  type CrossGroupSeedingPreset,
  type StandingSortable,
} from './crossGroupBracketSeeding';

export type TeamsPerGroupMap = Record<string, number>;

export function maxTopKForGroup(groupSize: number): number {
  return Math.max(0, Math.min(groupSize, BRACKET_MAX_ENTRANTS));
}

export function crossGroupTotalFromTeamsPerGroup(
  teamsPerGroup: TeamsPerGroupMap,
  includedGroupIds: string[]
): number {
  return includedGroupIds.reduce((sum, gid) => sum + Math.max(0, teamsPerGroup[gid] ?? 0), 0);
}

export function buildQualifiersFromTeamsPerGroup(
  standingsByGroup: Record<string, StandingSortable[]>,
  teamsPerGroup: TeamsPerGroupMap,
  includedGroupIds: string[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const groupId of includedGroupIds) {
    const k = teamsPerGroup[groupId] ?? 0;
    if (k < 1) {
      out[groupId] = [];
      continue;
    }
    const sorted = [...(standingsByGroup[groupId] ?? [])].sort(compareStandingsForBracket);
    out[groupId] = sorted.slice(0, k).map((s) => s.id);
  }
  return out;
}

export function isUnequalTeamsPerGroup(teamsPerGroup: TeamsPerGroupMap, includedGroupIds: string[]): boolean {
  const ks = includedGroupIds.map((gid) => teamsPerGroup[gid] ?? 0).filter((k) => k > 0);
  if (ks.length < 2) return false;
  return new Set(ks).size > 1;
}

export function deriveCrossGroupPool(params: {
  standingsByGroup: Record<string, StandingSortable[]>;
  includedGroupIds: string[];
  teamsPerGroup: TeamsPerGroupMap;
  seedingPreset: CrossGroupSeedingPreset;
  manualGlobalIds?: string[] | null;
}) {
  const { standingsByGroup, includedGroupIds, teamsPerGroup, seedingPreset, manualGlobalIds } = params;
  const qualifiers = buildQualifiersFromTeamsPerGroup(standingsByGroup, teamsPerGroup, includedGroupIds);
  const globalParticipantIds = mergeGlobalParticipantIds(
    qualifiers,
    includedGroupIds,
    seedingPreset,
    manualGlobalIds ?? undefined
  );
  const totalN = globalParticipantIds.length;
  return { qualifiers, globalParticipantIds, totalN };
}

/** Backward-compatible equal-K helper. */
export function deriveEqualCrossGroupPool(
  standingsByGroup: Record<string, StandingSortable[]>,
  equalTopK: number,
  includedGroupIds: string[],
  seedingPreset: CrossGroupSeedingPreset,
  manualGlobalIds?: string[] | null
) {
  const teamsPerGroup = Object.fromEntries(includedGroupIds.map((gid) => [gid, equalTopK]));
  return deriveCrossGroupPool({
    standingsByGroup,
    includedGroupIds,
    teamsPerGroup,
    seedingPreset,
    manualGlobalIds,
  });
}

export type UnequalCrossGroupValidationCode =
  | 'TOO_FEW_GROUPS'
  | 'TOTAL_BELOW_MIN'
  | 'TOTAL_OVER_MAX'
  | 'GROUP_TOO_SMALL'
  | 'GROUP_K_ZERO'
  | 'DUPLICATE_PARTICIPANT'
  | 'GLOBAL_LENGTH_MISMATCH';

export class UnequalCrossGroupValidationError extends Error {
  constructor(
    public readonly code: UnequalCrossGroupValidationCode,
    public readonly details?: { groupId?: string; groupName?: string; n?: number; k?: number }
  ) {
    super(code);
    this.name = 'UnequalCrossGroupValidationError';
  }
}

export function validateUnequalCrossGroupPool(params: {
  includedGroupIds: string[];
  qualifiers: Record<string, string[]>;
  globalParticipantIds: string[];
  teamsPerGroup?: TeamsPerGroupMap;
  groupNames?: Record<string, string>;
}): void {
  const { includedGroupIds, qualifiers, globalParticipantIds, teamsPerGroup, groupNames } = params;
  const g = includedGroupIds.length;
  const total = globalParticipantIds.length;

  if (g < 2) {
    throw new UnequalCrossGroupValidationError('TOO_FEW_GROUPS');
  }
  if (total < BRACKET_MIN_ENTRANTS) {
    throw new UnequalCrossGroupValidationError('TOTAL_BELOW_MIN');
  }
  if (total > BRACKET_MAX_ENTRANTS) {
    throw new UnequalCrossGroupValidationError('TOTAL_OVER_MAX');
  }

  let expectedTotal = 0;
  for (const groupId of includedGroupIds) {
    const k = teamsPerGroup?.[groupId] ?? teamsPerGroupKFromQualifiers(qualifiers, groupId);
    if (k < 1) {
      throw new UnequalCrossGroupValidationError('GROUP_K_ZERO', {
        groupId,
        groupName: groupNames?.[groupId],
        k: 0,
      });
    }
    const row = qualifiers[groupId] ?? [];
    if (row.length < k) {
      throw new UnequalCrossGroupValidationError('GROUP_TOO_SMALL', {
        groupId,
        groupName: groupNames?.[groupId],
        n: row.length,
        k,
      });
    }
    expectedTotal += k;
  }

  if (total !== expectedTotal) {
    throw new UnequalCrossGroupValidationError('GLOBAL_LENGTH_MISMATCH');
  }

  const seen = new Set<string>();
  for (const id of globalParticipantIds) {
    if (seen.has(id)) {
      throw new UnequalCrossGroupValidationError('DUPLICATE_PARTICIPANT');
    }
    seen.add(id);
  }
}

function teamsPerGroupKFromQualifiers(qualifiers: Record<string, string[]>, groupId: string): number {
  return qualifiers[groupId]?.length ?? 0;
}

/** @deprecated use deriveEqualCrossGroupPool — kept for tests mirroring equal-K path */
export { buildEqualTopKQualifiers };
