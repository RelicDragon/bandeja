export function normalizeDiscussUserIds(
  viewerId: string,
  userIds: string[],
): string[] {
  return [...new Set(userIds)].filter((id) => id !== viewerId);
}

export function selectDiscussProposal<T extends { members: { userId: string }[] }>(
  proposal: T | null,
  otherUserIds: string[],
): T | null {
  if (!proposal) return null;
  const memberIds = new Set(proposal.members.map((member) => member.userId));
  return otherUserIds.every((id) => memberIds.has(id)) ? proposal : null;
}

export function pickDiscussProposal<T extends { members: { userId: string }[] }>(
  proposals: T[],
  otherUserIds: string[],
): T | null {
  for (const proposal of proposals) {
    const match = selectDiscussProposal(proposal, otherUserIds);
    if (match) return match;
  }
  return null;
}
