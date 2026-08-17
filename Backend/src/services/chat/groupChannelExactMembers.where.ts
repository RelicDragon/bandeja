import type { Prisma } from '@prisma/client';

export function discussionGroupCandidateWhere(
  ownerId: string,
  memberCount: number,
): Prisma.GroupChannelWhereInput {
  return {
    isChannel: false,
    isCityGroup: false,
    isPublic: false,
    bugId: null,
    marketItemId: null,
    participantsCount: memberCount,
    participants: { some: { userId: ownerId } },
  };
}

export function participantIdsMatch(expected: string[], actual: string[]): boolean {
  if (expected.length !== actual.length) return false;
  const left = [...expected].sort();
  const right = [...actual].sort();
  return left.every((id, index) => id === right[index]);
}
