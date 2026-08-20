export type RankableInvitePoolMember = {
  userId: string;
  matchesGame: boolean;
  matchScore: number;
  gamesTogetherCount: number;
};

export const INVITE_POOL_CAP = 100;

export function rankInvitePoolMembers<T extends RankableInvitePoolMember>(members: T[]): T[] {
  const ranked = [...members].sort(
    (a, b) =>
      Number(b.matchesGame) - Number(a.matchesGame) ||
      b.matchScore - a.matchScore ||
      b.gamesTogetherCount - a.gamesTogetherCount ||
      a.userId.localeCompare(b.userId),
  );
  const seen = new Set<string>();
  const unique: T[] = [];
  for (const member of ranked) {
    if (seen.has(member.userId)) continue;
    seen.add(member.userId);
    unique.push(member);
    if (unique.length >= INVITE_POOL_CAP) break;
  }
  return unique;
}
