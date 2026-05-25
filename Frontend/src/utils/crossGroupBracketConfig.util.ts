import type { LeagueGroup, LeagueStanding } from '@/api/leagues';
import {
  type CrossGroupSeedingPreset,
  sortCanonicalGroups,
} from './crossGroupBracketSeeding';
import {
  deriveCrossGroupPool,
  type TeamsPerGroupMap,
} from './crossGroupUnequalK.util';

export function computeCrossGroupBracketDerived(
  groups: LeagueGroup[],
  getStandingsForGroup: (groupId: string) => LeagueStanding[],
  teamsPerGroup: TeamsPerGroupMap,
  includedGroupIds: Set<string>,
  seedingPreset: CrossGroupSeedingPreset,
  manualGlobalIds: string[] | null
) {
  const canonicalGroups = sortCanonicalGroups(groups);
  const includedList = canonicalGroups.filter((g) => includedGroupIds.has(g.id));
  const standingsByGroup: Record<string, LeagueStanding[]> = {};
  for (const g of groups) {
    standingsByGroup[g.id] = getStandingsForGroup(g.id);
  }
  const groupOrder = includedList.map((g) => g.id);
  const { qualifiers, globalParticipantIds, totalN } = deriveCrossGroupPool({
    standingsByGroup,
    includedGroupIds: groupOrder,
    teamsPerGroup,
    seedingPreset,
    manualGlobalIds,
  });
  return { includedList, groupOrder, qualifiers, globalParticipantIds, totalN, standingsByGroup };
}
