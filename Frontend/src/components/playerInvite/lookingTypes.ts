import type { EntityType, Sport } from '@/types';
import type { InviteLookingMember, InviteLookingPool } from '@/api/playIntents';

export type PlayerInviteLookingDraft = {
  sport: Sport;
  entityType: EntityType;
  clubId: string | null;
  startTime: string;
  endTime?: string | null;
  timeZone?: string | null;
  minLevel: number | null;
  maxLevel: number | null;
  genderTeams: string | null;
};

export type { InviteLookingMember, InviteLookingPool };

export function lookingMembersForSlot<T extends { gender?: string | null }>(
  members: T[],
  filterGender?: 'MALE' | 'FEMALE',
): T[] {
  if (!filterGender) return members;
  return members.filter((member) => member.gender === filterGender);
}

export function lookingSelectionAfterPoolChange(
  selectedUserIds: string[],
  previousMemberIds: ReadonlySet<string>,
  nextMemberIds: ReadonlySet<string>,
): { nextSelected: string[]; removedIds: string[] } {
  const removedIds = selectedUserIds.filter(
    (id) => previousMemberIds.has(id) && !nextMemberIds.has(id),
  );
  if (removedIds.length === 0) return { nextSelected: selectedUserIds, removedIds };
  const removed = new Set(removedIds);
  return {
    nextSelected: selectedUserIds.filter((id) => !removed.has(id)),
    removedIds,
  };
}
