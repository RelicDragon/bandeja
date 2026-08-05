import type { PlayIntentStatus } from '@prisma/client';

type AvailabilityMember = {
  affinity: 'near' | 'mid' | 'far';
  status: PlayIntentStatus;
  inGame: boolean;
};

export function derivePlayIntentPoolAvailability(input: {
  members: AvailabilityMember[];
  partySize: number;
  viewerIsAvailable: boolean;
  proposalMemberCount: number | null;
}) {
  // A live play intent is the source of truth for availability. Being in
  // another game (inGame) is context, not a block — the player stays available
  // as long as their intent is live and they're not an incompatible (far) fit.
  // `inGame` is retained on the type for callers but no longer filters here.
  const availableCount = input.members.filter(
    (member) => member.affinity !== 'far',
  ).length;
  const clusterProgress =
    input.proposalMemberCount !== null
      ? Math.min(input.partySize, input.proposalMemberCount)
      : Math.min(
          input.partySize,
          (input.viewerIsAvailable ? 1 : 0) + availableCount,
        );

  return { availableCount, clusterProgress };
}
