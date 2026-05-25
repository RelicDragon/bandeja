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
