import {
  MatchProposalMemberResponse,
  MatchProposalStatus,
  type EntityType,
  type Prisma,
  type Sport,
} from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import { ApiError } from '../../utils/ApiError';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { lockMatchProposal } from './matchProposalLock';

export type ProposalMutation = {
  proposalId: string;
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  userIds: string[];
};

/**
 * Declines one proposal member using the caller's transaction. This is shared
 * by explicit proposal actions and intent replacement/cancellation so proposal
 * membership and intent status cannot commit independently.
 */
export async function declineProposalMember(
  tx: Prisma.TransactionClient,
  proposalId: string,
  userId: string,
  options: { allowUnavailable?: boolean } = {},
): Promise<ProposalMutation | null> {
  await lockMatchProposal(tx, proposalId);
  const proposal = await tx.matchProposal.findUnique({
    where: { id: proposalId },
    include: { members: true },
  });
  if (!proposal) {
    if (options.allowUnavailable) return null;
    throw new ApiError(404, 'Match proposal not found');
  }
  if (
    proposal.gameId ||
    proposal.status === MatchProposalStatus.CONVERTED_TO_GAME
  ) {
    if (options.allowUnavailable) return null;
    throw new ApiError(400, 'Proposal already converted');
  }
  if (
    proposal.status !== MatchProposalStatus.PENDING &&
    proposal.status !== MatchProposalStatus.ACCEPTED
  ) {
    if (options.allowUnavailable) return null;
    throw new ApiError(409, 'Match proposal is no longer available', true, {
      code: 'playIntent.proposalUnavailable',
    });
  }

  const membership = proposal.members.find(
    (member) => member.userId === userId,
  );
  if (!membership) {
    if (options.allowUnavailable) return null;
    throw new ApiError(403, 'Not a member of this proposal');
  }
  if (membership.response === MatchProposalMemberResponse.DECLINED) {
    return null;
  }

  const partySize =
    proposal.entityType === 'BAR'
      ? 2
      : getSportConfig(proposal.sport).defaultPlayersPerMatch;
  const now = new Date();
  await tx.matchProposalMember.update({
    where: { id: membership.id },
    data: {
      response: MatchProposalMemberResponse.DECLINED,
      isHost: false,
    },
  });
  await PlayIntentGameLifecycleService.release(
    tx,
    membership.intentId,
    now,
  );

  const remaining = proposal.members.filter(
    (member) =>
      member.userId !== userId &&
      member.response !== MatchProposalMemberResponse.DECLINED,
  );
  if (proposal.hostUserId === userId) {
    await tx.matchProposal.update({
      where: { id: proposalId },
      data: {
        hostUserId: null,
        status: MatchProposalStatus.PENDING,
      },
    });
  }

  if (remaining.length < partySize) {
    await tx.matchProposal.update({
      where: { id: proposalId },
      data: {
        status: MatchProposalStatus.DECLINED,
        hostUserId: null,
      },
    });
    for (const member of [...remaining].sort((a, b) =>
      a.intentId.localeCompare(b.intentId),
    )) {
      await PlayIntentGameLifecycleService.release(
        tx,
        member.intentId,
        now,
      );
    }
  }

  return {
    proposalId,
    cityId: proposal.cityId,
    sport: proposal.sport,
    entityType: proposal.entityType,
    userIds: proposal.members.map((member) => member.userId),
  };
}
