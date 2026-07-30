export type Phase4FlagsByGroup = Record<string, boolean>;

export function getPhase4FlagForGroup(map: Phase4FlagsByGroup, groupId: string): boolean {
  return map[groupId] ?? false;
}

export function setPhase4FlagForGroup(
  map: Phase4FlagsByGroup,
  groupId: string,
  value: boolean
): Phase4FlagsByGroup {
  return { ...map, [groupId]: value };
}

export function copyPhase4FlagToGroups(
  map: Phase4FlagsByGroup,
  groupIds: string[],
  value: boolean
): Phase4FlagsByGroup {
  return groupIds.reduce<Phase4FlagsByGroup>(
    (next, groupId) => ({ ...next, [groupId]: value }),
    { ...map }
  );
}

export function copyExclusivePhase4FlagToGroups(params: {
  targetMap: Phase4FlagsByGroup;
  opposingMap: Phase4FlagsByGroup;
  groupIds: string[];
  value: boolean;
}): { targetMap: Phase4FlagsByGroup; opposingMap: Phase4FlagsByGroup } {
  const targetMap = copyPhase4FlagToGroups(params.targetMap, params.groupIds, params.value);
  const opposingMap = params.value
    ? copyPhase4FlagToGroups(params.opposingMap, params.groupIds, false)
    : params.opposingMap;
  return { targetMap, opposingMap };
}

export function getPhase4MismatchGroupNames(
  map: Phase4FlagsByGroup,
  currentGroupId: string,
  groups: Array<{ id: string; name: string }>
): string[] {
  const currentValue = getPhase4FlagForGroup(map, currentGroupId);
  return groups
    .filter((group) => group.id !== currentGroupId)
    .filter((group) => getPhase4FlagForGroup(map, group.id) !== currentValue)
    .map((group) => group.name);
}

export function clearIneligiblePhase4Flags(
  map: Phase4FlagsByGroup,
  eligibleGroupIds: Iterable<string>
): Phase4FlagsByGroup {
  const eligible = new Set(eligibleGroupIds);
  let changed = false;
  const next: Phase4FlagsByGroup = { ...map };
  for (const [groupId, enabled] of Object.entries(map)) {
    if (enabled && !eligible.has(groupId)) {
      next[groupId] = false;
      changed = true;
    }
  }
  return changed ? next : map;
}
