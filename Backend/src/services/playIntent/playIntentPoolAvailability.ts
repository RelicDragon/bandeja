import type { PlayIntentStatus } from '@prisma/client';

type AvailabilityMember = {
  affinity: 'near' | 'mid' | 'far';
  status: PlayIntentStatus;
  busyInGame: boolean;
};

export function derivePlayIntentPoolAvailability(input: {
  members: AvailabilityMember[];
  partySize: number;
  viewerIsAvailable: boolean;
  proposalMemberCount: number | null;
}) {
  // Pending proposals are suggestions, not reservations. A compatible player
  // stays available until an actual game makes them busy.
  const availableCount = input.members.filter(
    (member) => !member.busyInGame && member.affinity !== 'far',
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
