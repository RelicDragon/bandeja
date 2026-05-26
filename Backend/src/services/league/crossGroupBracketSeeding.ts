export type CrossGroupSeedingPreset = 'WINNERS_THEN_RUNNERS_UP' | 'GROUP_BLOCK' | 'MANUAL';

export interface CrossGroupQualifierGroup {
  leagueGroupId: string;
  participantIds: string[];
}

export interface TeamsPerGroupEntry {
  leagueGroupId: string;
  k: number;
}

export function canonicalGroupOrder(groups: { id: string; createdAt?: Date }[]): string[] {
  return [...groups]
    .sort((a, b) => {
      const at = a.createdAt?.getTime() ?? 0;
      const bt = b.createdAt?.getTime() ?? 0;
      if (at !== bt) return at - bt;
      return a.id.localeCompare(b.id);
    })
    .map((g) => g.id);
}

export function buildEqualTopKQualifiers(
  groups: CrossGroupQualifierGroup[],
  k: number
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of groups) {
    if (k < 1) {
      throw new Error('equalTopK must be at least 1');
    }
    const ids = g.participantIds ?? [];
    if (ids.length < k) {
      throw new Error(`GROUP_TOO_SMALL:${g.leagueGroupId}:${ids.length}`);
    }
    const slice = ids.slice(0, k);
    if (new Set(slice).size !== slice.length) {
      throw new Error('DUPLICATE_PARTICIPANT_IN_GROUP');
    }
    out[g.leagueGroupId] = slice;
  }
  return out;
}

function sameParticipantMultiset(a: string[], b: string[]): boolean {
  if (a.length !== b.length) return false;
  const counts = new Map<string, number>();
  for (const id of a) {
    counts.set(id, (counts.get(id) ?? 0) + 1);
  }
  for (const id of b) {
    const n = counts.get(id);
    if (!n) return false;
    if (n === 1) counts.delete(id);
    else counts.set(id, n - 1);
  }
  return counts.size === 0;
}

function defaultGlobalParticipantIds(
  qualifiers: Record<string, string[]>,
  groupOrder: string[],
  preset: CrossGroupSeedingPreset
): string[] {
  if (preset === 'WINNERS_THEN_RUNNERS_UP') {
    const k = Math.max(0, ...groupOrder.map((gid) => qualifiers[gid]?.length ?? 0));
    const ids: string[] = [];
    for (let r = 0; r < k; r++) {
      for (const gid of groupOrder) {
        const row = qualifiers[gid];
        if (row && row[r]) ids.push(row[r]);
      }
    }
    return ids;
  }

  if (preset === 'GROUP_BLOCK') {
    const ids: string[] = [];
    for (const gid of groupOrder) {
      const row = qualifiers[gid] ?? [];
      for (const pid of row) ids.push(pid);
    }
    return ids;
  }

  throw new Error(`UNKNOWN_PRESET:${preset}`);
}

/** Global seed order: preset default, or client order when it is the same participant set (preview swaps). */
export function mergeGlobalParticipantIds(
  qualifiers: Record<string, string[]>,
  groupOrder: string[],
  preset: CrossGroupSeedingPreset,
  manualOrder?: string[]
): string[] {
  if (preset === 'MANUAL') {
    if (!manualOrder?.length) {
      throw new Error('MANUAL_REQUIRES_GLOBAL_ORDER');
    }
    return [...manualOrder];
  }

  const defaultOrder = defaultGlobalParticipantIds(qualifiers, groupOrder, preset);
  if (manualOrder?.length && sameParticipantMultiset(manualOrder, defaultOrder)) {
    return [...manualOrder];
  }
  return defaultOrder;
}

export function buildUnequalTopKQualifiers(
  teamsPerGroup: TeamsPerGroupEntry[],
  groups: CrossGroupQualifierGroup[]
): Record<string, string[]> {
  const byId = new Map(groups.map((g) => [g.leagueGroupId, g.participantIds ?? []]));
  const out: Record<string, string[]> = {};
  for (const { leagueGroupId, k } of teamsPerGroup) {
    if (!Number.isInteger(k) || k < 1) {
      throw new Error('teamsPerGroup.k must be a positive integer');
    }
    const ids = byId.get(leagueGroupId);
    if (!ids) {
      throw new Error(`UNKNOWN_GROUP:${leagueGroupId}`);
    }
    if (ids.length < k) {
      throw new Error(`GROUP_TOO_SMALL:${leagueGroupId}:${ids.length}`);
    }
    const slice = ids.slice(0, k);
    if (new Set(slice).size !== slice.length) {
      throw new Error('DUPLICATE_PARTICIPANT_IN_GROUP');
    }
    out[leagueGroupId] = slice;
  }
  return out;
}

export function buildUnequalQualifiersFromPayload(
  groups: CrossGroupQualifierGroup[]
): Record<string, string[]> {
  const out: Record<string, string[]> = {};
  for (const g of groups) {
    const ids = g.participantIds ?? [];
    if (ids.length < 1) {
      throw new Error(`QUALIFIER_ROW_EMPTY:${g.leagueGroupId}`);
    }
    if (new Set(ids).size !== ids.length) {
      throw new Error('DUPLICATE_PARTICIPANT_IN_GROUP');
    }
    out[g.leagueGroupId] = [...ids];
  }
  return out;
}

export function validateUnequalCrossGroupPool(params: {
  includedGroupIds: string[];
  qualifiers: Record<string, string[]>;
  globalParticipantIds: string[];
  teamsPerGroup?: TeamsPerGroupEntry[];
}): void {
  const { includedGroupIds, qualifiers, globalParticipantIds, teamsPerGroup } = params;

  if (includedGroupIds.length < 2) {
    throw new Error('CROSS_GROUP_REQUIRES_TWO_GROUPS');
  }

  const n = globalParticipantIds.length;
  const expectedN = includedGroupIds.reduce(
    (sum, gid) => sum + (qualifiers[gid]?.length ?? 0),
    0
  );

  if (n !== expectedN) {
    throw new Error(`GLOBAL_COUNT_MISMATCH:${n}:${expectedN}`);
  }
  if (n < 2 || n > 16) {
    throw new Error('TOTAL_ENTRANTS_OUT_OF_RANGE');
  }

  if (teamsPerGroup?.length) {
    const groupSet = new Set(includedGroupIds);
    for (const { leagueGroupId, k } of teamsPerGroup) {
      if (!groupSet.has(leagueGroupId)) {
        throw new Error(`TEAMS_PER_GROUP_UNKNOWN:${leagueGroupId}`);
      }
      const row = qualifiers[leagueGroupId];
      if (!row || row.length !== k) {
        throw new Error(`QUALIFIER_ROW_INVALID:${leagueGroupId}`);
      }
    }
  }

  const seen = new Set<string>();
  for (const pid of globalParticipantIds) {
    if (seen.has(pid)) {
      throw new Error('DUPLICATE_GLOBAL_PARTICIPANT');
    }
    seen.add(pid);
  }

  for (const gid of includedGroupIds) {
    const row = qualifiers[gid];
    if (!row?.length) {
      throw new Error(`QUALIFIER_ROW_INVALID:${gid}`);
    }
    for (const pid of row) {
      if (!globalParticipantIds.includes(pid)) {
        throw new Error('GLOBAL_MISSING_QUALIFIER');
      }
    }
    const rowSet = new Set(row);
    if (rowSet.size !== row.length) {
      throw new Error(`DUPLICATE_IN_GROUP:${gid}`);
    }
  }

  for (const pid of globalParticipantIds) {
    let count = 0;
    for (const gid of includedGroupIds) {
      if (qualifiers[gid]?.includes(pid)) count++;
    }
    if (count !== 1) {
      throw new Error('GLOBAL_PARTICIPANT_NOT_IN_EXACTLY_ONE_GROUP');
    }
  }
}

export function validateCrossGroupPool(params: {
  k: number;
  includedGroupIds: string[];
  qualifiers: Record<string, string[]>;
  globalParticipantIds: string[];
}): void {
  const { k, includedGroupIds, qualifiers, globalParticipantIds } = params;

  if (includedGroupIds.length < 2) {
    throw new Error('CROSS_GROUP_REQUIRES_TWO_GROUPS');
  }

  const g = includedGroupIds.length;
  const n = globalParticipantIds.length;
  const expectedN = k * g;

  if (k < 1) {
    throw new Error('equalTopK must be at least 1');
  }
  if (n !== expectedN) {
    throw new Error(`GLOBAL_COUNT_MISMATCH:${n}:${expectedN}`);
  }
  if (n < 2 || n > 16) {
    throw new Error('TOTAL_ENTRANTS_OUT_OF_RANGE');
  }

  const seen = new Set<string>();
  for (const pid of globalParticipantIds) {
    if (seen.has(pid)) {
      throw new Error('DUPLICATE_GLOBAL_PARTICIPANT');
    }
    seen.add(pid);
  }

  for (const gid of includedGroupIds) {
    const row = qualifiers[gid];
    if (!row || row.length !== k) {
      throw new Error(`QUALIFIER_ROW_INVALID:${gid}`);
    }
    for (const pid of row) {
      if (!globalParticipantIds.includes(pid)) {
        throw new Error('GLOBAL_MISSING_QUALIFIER');
      }
    }
    const rowSet = new Set(row);
    if (rowSet.size !== k) {
      throw new Error(`DUPLICATE_IN_GROUP:${gid}`);
    }
  }

  for (const pid of globalParticipantIds) {
    let count = 0;
    for (const gid of includedGroupIds) {
      if (qualifiers[gid]?.includes(pid)) count++;
    }
    if (count !== 1) {
      throw new Error('GLOBAL_PARTICIPANT_NOT_IN_EXACTLY_ONE_GROUP');
    }
  }
}

export function crossGroupSeedingErrorToMessage(code: string, groupNames?: Map<string, string>): string {
  if (code.startsWith('GROUP_TOO_SMALL:')) {
    const [, gid, n] = code.split(':');
    const name = groupNames?.get(gid) ?? gid;
    return `Group "${name}" has only ${n} teams`;
  }
  const map: Record<string, string> = {
    CROSS_GROUP_REQUIRES_TWO_GROUPS: 'Cross-group bracket requires at least 2 groups',
    TOTAL_ENTRANTS_OUT_OF_RANGE: 'Total entrants must be between 2 and 16',
    DUPLICATE_GLOBAL_PARTICIPANT: 'Duplicate participant in global pool',
    GLOBAL_COUNT_MISMATCH: 'Global participant count does not match expected pool size',
    MANUAL_REQUIRES_GLOBAL_ORDER: 'MANUAL seeding requires globalParticipantIds',
    QUALIFIER_ROW_EMPTY: 'Each group must have at least one qualifier',
    UNKNOWN_GROUP: 'Unknown group in teamsPerGroup',
    TEAMS_PER_GROUP_UNKNOWN: 'teamsPerGroup references a group not in includedGroupIds',
  };
  return map[code] ?? code;
}
