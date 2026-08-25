import {
  MatchProposalStatus,
  PlayIntentStatus,
  type Prisma,
} from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import { intentWindowIsReachable } from './playIntentFreshness';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { lockMatchProposal } from './matchProposalLock';

type TransactionClient = Prisma.TransactionClient;

async function detachConsumedMemberFromProposal(
  tx: TransactionClient,
  proposalId: string,
  userId: string,
  now: Date,
): Promise<void> {
  await lockMatchProposal(tx, proposalId);
  const proposal = await tx.matchProposal.findUnique({
    where: { id: proposalId },
    include: { members: true },
  });
  if (!proposal) return;
  if (
    proposal.gameId ||
    proposal.status === MatchProposalStatus.CONVERTED_TO_GAME
  ) {
    return;
  }
  if (
    proposal.status !== MatchProposalStatus.PENDING &&
    proposal.status !== MatchProposalStatus.ACCEPTED
  ) {
    return;
  }

  const membership = proposal.members.find((member) => member.userId === userId);
  if (!membership) return;

  await tx.matchProposalMember.delete({ where: { id: membership.id } });

  const remaining = proposal.members.filter(
    (member) => member.userId !== userId,
  );
  if (proposal.hostUserId === userId) {
    await tx.matchProposal.update({
      where: { id: proposalId },
      data: { hostUserId: null, status: MatchProposalStatus.PENDING },
    });
  }

  const partySize =
    proposal.entityType === 'BAR'
      ? 2
      : getSportConfig(proposal.sport).defaultPlayersPerMatch;
  if (remaining.length >= partySize) return;

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
    await PlayIntentGameLifecycleService.release(tx, member.intentId, now);
  }
}

/** Consume a reachable looking intent after the viewer becomes PLAYING. */
export async function consumeLookingIntentOnPlayingJoin(
  tx: TransactionClient,
  userId: string,
  cityId: string,
  now: Date,
): Promise<string | null> {
  const intent = await tx.playIntent.findFirst({
    where: {
      userId,
      cityId,
      status: { in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED] },
      expiresAt: { gt: now },
    },
    include: { city: { select: { timezone: true } } },
    orderBy: { createdAt: 'desc' },
  });
  if (!intent) return null;
  if (!intentWindowIsReachable(intent, intent.city.timezone, now)) return null;

  await PlayIntentGameLifecycleService.consume(tx, intent.id, userId, now);

  const memberships = await tx.matchProposalMember.findMany({
    where: {
      userId,
      intentId: intent.id,
      proposal: {
        gameId: null,
        status: {
          in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED],
        },
        expiresAt: { gt: now },
      },
    },
    select: { proposalId: true },
  });
  for (const membership of memberships) {
    await detachConsumedMemberFromProposal(tx, membership.proposalId, userId, now);
  }
  return intent.id;
}
