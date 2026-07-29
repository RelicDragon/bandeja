type RankablePoolMember = {
  userId: string;
  eligibleForProposal: boolean;
  affinityScore: number;
};

export function rankPlayIntentPoolMembers<T extends RankablePoolMember>(
  members: T[],
  cap: number,
): {
  members: T[];
  total: number;
  overflow: number;
} {
  const ranked = [...members].sort(
    (a, b) =>
      Number(b.eligibleForProposal) -
        Number(a.eligibleForProposal) ||
      b.affinityScore - a.affinityScore ||
      a.userId.localeCompare(b.userId),
  );
  const visible = ranked.slice(0, Math.max(0, cap));
  return {
    members: visible,
    total: ranked.length,
    overflow: Math.max(0, ranked.length - visible.length),
  };
}
