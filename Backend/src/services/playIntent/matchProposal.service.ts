import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import {
  EntityType,
  MatchProposalMemberResponse,
  MatchProposalStatus,
  PlayIntentStatus,
  Sport,
} from '@prisma/client';
import { getSportConfig } from '../../sport/sportRegistry';
import { canIntentJoinProposal } from './playIntentCriteria';
import { PlayIntentService } from './playIntent.service';
import { PlayIntentGameLifecycleService } from './playIntentGameLifecycle.service';
import { lockMatchProposal } from './matchProposalLock';
import {
  intentWindowEndsAt,
  intentWindowIsReachable,
  nextSuggestedStart,
  proposalWindowSource,
} from './playIntentFreshness';
import {
  declineProposalMember,
  type ProposalMutation,
} from './matchProposalMemberLifecycle';
import {
  publishPlayIntentInvalidation,
  type PlayIntentInvalidationReason,
} from './playIntentRealtime';
import { PlayIntentNotifyService } from './playIntentNotify.service';

class ClusterClaimConflict extends Error {}

function proposalUnavailable(
  message = 'Match proposal is no longer available',
  statusCode = 409,
): ApiError {
  return new ApiError(statusCode, message, true, {
    code: 'playIntent.proposalUnavailable',
  });
}

function publishProposalMutation(
  mutation: ProposalMutation | null,
  reason: PlayIntentInvalidationReason = 'proposal-updated',
): void {
  if (!mutation) return;
  publishPlayIntentInvalidation({
    reason,
    proposalId: mutation.proposalId,
    cityId: mutation.cityId,
    sport: mutation.sport,
    entityType: mutation.entityType,
    userIds: mutation.userIds,
  });
}

function proposalMutation(proposal: {
  id: string;
  cityId: string;
  sport: Sport;
  entityType: EntityType;
  members: Array<{ userId: string }>;
}): ProposalMutation {
  return {
    proposalId: proposal.id,
    cityId: proposal.cityId,
    sport: proposal.sport,
    entityType: proposal.entityType,
    userIds: proposal.members.map((member) => member.userId),
  };
}

export class MatchProposalService {
  static async createFromCluster(input: {
    cityId: string;
    sport: Sport;
    entityType?: EntityType;
    members: { userId: string; intentId: string }[];
    dateKeys: string[];
    clubIds: string[];
    startTime: string | null;
    endTime: string | null;
    rematchKey: string;
    expiresAt: Date;
  }): Promise<{
    id: string;
    // minimal shape used by callers
  } | null> {
    const city = await prisma.city.findUnique({
      where: { id: input.cityId },
      select: { timezone: true },
    });
    if (!city) return null;
    const windowSource = proposalWindowSource(input);
    const windowEndsAt = intentWindowEndsAt(windowSource, city.timezone);
    if (!windowEndsAt || windowEndsAt <= new Date()) return null;

    const intentIds = input.members.map((m) => m.intentId);

    try {
      const proposal = await prisma.$transaction(async (tx) => {
        const locked = await tx.playIntent.updateMany({
          where: { id: { in: intentIds }, status: PlayIntentStatus.OPEN },
          data: { status: PlayIntentStatus.MATCHED },
        });
        if (locked.count !== intentIds.length) {
          throw new ClusterClaimConflict();
        }
        const now = new Date();
        const suggestedStartTime = nextSuggestedStart(
          windowSource,
          city.timezone,
          now,
        );
        if (!suggestedStartTime || input.expiresAt <= now) {
          const status = intentWindowIsReachable(
            windowSource,
            city.timezone,
            now,
          )
            ? PlayIntentStatus.OPEN
            : PlayIntentStatus.EXPIRED;
          await tx.playIntent.updateMany({
            where: {
              id: { in: intentIds },
              status: PlayIntentStatus.MATCHED,
            },
            data: { status },
          });
          return null;
        }
        const expiresAt =
          input.expiresAt.getTime() < windowEndsAt.getTime()
            ? input.expiresAt
            : windowEndsAt;

        return tx.matchProposal.create({
          data: {
            cityId: input.cityId,
            sport: input.sport,
            entityType: input.entityType === EntityType.BAR ? EntityType.BAR : EntityType.GAME,
            status: MatchProposalStatus.PENDING,
            dateKeys: input.dateKeys,
            startTime: input.startTime,
            endTime: input.endTime,
            clubIds: input.clubIds,
            suggestedStartTime,
            expiresAt,
            rematchKey: input.rematchKey,
            members: {
              create: input.members.map((m) => ({
                userId: m.userId,
                intentId: m.intentId,
                response: MatchProposalMemberResponse.PENDING,
              })),
            },
          },
          include: {
            members: {
              include: {
                user: {
                  select: {
                    id: true,
                    firstName: true,
                    lastName: true,
                    avatar: true,
                    sportProfiles: { select: { sport: true, level: true } },
                  },
                },
              },
            },
          },
        });
      });
      if (proposal) {
        publishProposalMutation(
          proposalMutation(proposal),
          'proposal-created',
        );
      }
      return proposal;
    } catch (error) {
      if (error instanceof ClusterClaimConflict) return null;
      throw error;
    }
  }

  static async getById(proposalId: string, userId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: {
        members: {
          include: {
            user: {
              select: {
                id: true,
                firstName: true,
                lastName: true,
                avatar: true,
                sportProfiles: { select: { sport: true, level: true } },
              },
            },
          },
        },
        city: { select: { id: true, name: true, timezone: true } },
      },
    });
    if (!proposal) throw proposalUnavailable('Match proposal not found', 404);
    if (!proposal.members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'Not a member of this proposal');
    }
    const active =
      proposal.status === MatchProposalStatus.PENDING ||
      proposal.status === MatchProposalStatus.ACCEPTED;
    if (
      !proposal.gameId &&
      (!active ||
        proposal.expiresAt <= new Date() ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
        ))
    ) {
      throw proposalUnavailable();
    }
    return {
      ...proposal,
      members: proposal.members.map((m) => ({
        userId: m.userId,
        intentId: m.intentId,
        isHost: m.isHost,
        response: m.response,
        firstName: m.user.firstName,
        lastName: m.user.lastName,
        avatar: m.user.avatar,
        level: m.user.sportProfiles.find((p) => p.sport === proposal.sport)?.level ?? null,
      })),
    };
  }

  private static buildCreatePrefill(
    proposal: {
      id: string;
      sport: Sport;
      entityType: EntityType;
      clubIds: string[];
      dateKeys: string[];
      startTime: string | null;
      endTime: string | null;
      suggestedStartTime: Date | null;
      city: { timezone: string };
      members: { userId: string; response?: MatchProposalMemberResponse }[];
    },
    hostUserId: string,
  ) {
    const inviteeIds = proposal.members
      .filter(
        (member) =>
          member.userId !== hostUserId &&
          member.response !== MatchProposalMemberResponse.DECLINED,
      )
      .map((member) => member.userId);
    const startIso =
      proposal.suggestedStartTime?.toISOString() ||
      nextSuggestedStart(
        proposalWindowSource(proposal),
        proposal.city.timezone,
      )?.toISOString() ||
      undefined;
    const endIso = startIso
      ? new Date(new Date(startIso).getTime() + 90 * 60 * 1000).toISOString()
      : undefined;

    return {
      proposalId: proposal.id,
      sport: proposal.sport,
      entityType: proposal.entityType === EntityType.BAR ? 'BAR' : 'GAME',
      clubId: proposal.clubIds[0] ?? undefined,
      startTime: startIso,
      endTime: endIso,
      inviteeIds,
      dateKeys: proposal.dateKeys,
      clubIds: proposal.clubIds,
      startTimeOfDay: proposal.startTime,
      endTimeOfDay: proposal.endTime,
    };
  }

  static async confirm(proposalId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
      await lockMatchProposal(tx, proposalId);
      const proposal = await tx.matchProposal.findUnique({
        where: { id: proposalId },
        include: { members: true, city: { select: { timezone: true } } },
      });
      if (!proposal) throw new ApiError(404, 'Match proposal not found');
      const membership = proposal.members.find((member) => member.userId === userId);
      if (
        !membership ||
        membership.response === MatchProposalMemberResponse.DECLINED
      ) {
        throw new ApiError(403, 'Not an active member of this proposal');
      }
      if (
        proposal.gameId ||
        proposal.status === MatchProposalStatus.CONVERTED_TO_GAME
      ) {
        return {
          kind: 'converted' as const,
          role:
            proposal.hostUserId === userId
              ? ('host' as const)
              : ('invitee' as const),
          proposal,
        };
      }
      const now = new Date();
      if (
        proposal.expiresAt <= now ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
          now,
        )
      ) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
        });
        for (const member of [...proposal.members].sort((a, b) =>
          a.intentId.localeCompare(b.intentId),
        )) {
          await PlayIntentGameLifecycleService.release(tx, member.intentId, now);
        }
        return { kind: 'expired' as const, proposal };
      }
      if (proposal.status === MatchProposalStatus.ACCEPTED && proposal.hostUserId) {
        return {
          kind:
            proposal.hostUserId === userId
              ? ('host' as const)
              : ('invitee' as const),
          proposal,
        };
      }
      if (proposal.status !== MatchProposalStatus.PENDING) {
        throw proposalUnavailable();
      }
      const activeMembers = proposal.members.filter(
        (member) => member.response !== MatchProposalMemberResponse.DECLINED,
      );
      const partySize =
        proposal.entityType === EntityType.BAR
          ? 2
          : getSportConfig(proposal.sport).defaultPlayersPerMatch;
      if (activeMembers.length < partySize) {
        throw new ApiError(400, 'Match roster is incomplete', true, {
          code: 'playIntent.rosterIncomplete',
          needed: partySize,
          current: activeMembers.length,
        });
      }
      await tx.matchProposal.update({
        where: { id: proposalId },
        data: {
          status: MatchProposalStatus.ACCEPTED,
          hostUserId: userId,
        },
      });
      await tx.matchProposalMember.update({
        where: { id: membership.id },
        data: {
          isHost: true,
          response: MatchProposalMemberResponse.ACCEPTED,
        },
      });
      return { kind: 'host' as const, proposal };
    });

    if (result.kind === 'expired') {
      publishProposalMutation(
        proposalMutation(result.proposal),
        'proposal-expired',
      );
      throw proposalUnavailable();
    }
    publishProposalMutation(proposalMutation(result.proposal));
    const latest = await this.getById(proposalId, userId);
    if (result.kind === 'converted') {
      return {
        role: result.role,
        proposal: latest,
        createPrefill: null,
        gameId: latest.gameId ?? null,
      };
    }
    if (result.kind === 'invitee') {
      return {
        role: 'invitee' as const,
        proposal: latest,
        createPrefill: null,
        gameId: latest.gameId ?? null,
      };
    }
    return {
      role: 'host' as const,
      proposal: latest,
      createPrefill: this.buildCreatePrefill(result.proposal, userId),
    };
  }

  /** Host abandoned create-game — reopen proposal for others within TTL. */
  static async releaseHost(proposalId: string, userId: string) {
    const result = await prisma.$transaction(async (tx) => {
      await lockMatchProposal(tx, proposalId);
      const proposal = await tx.matchProposal.findUnique({
        where: { id: proposalId },
        include: {
          members: true,
          city: { select: { timezone: true } },
        },
      });
      if (!proposal) throw new ApiError(404, 'Match proposal not found');
      if (
        proposal.gameId ||
        proposal.status === MatchProposalStatus.CONVERTED_TO_GAME
      ) {
        throw new ApiError(400, 'Proposal already converted');
      }
      if (proposal.hostUserId !== userId) {
        throw new ApiError(403, 'Only the host can release');
      }
      const now = new Date();
      if (
        proposal.expiresAt <= now ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
          now,
        )
      ) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: {
            status: MatchProposalStatus.EXPIRED,
            hostUserId: null,
          },
        });
        for (const member of [...proposal.members].sort((a, b) =>
          a.intentId.localeCompare(b.intentId),
        )) {
          await PlayIntentGameLifecycleService.release(
            tx,
            member.intentId,
            now,
          );
        }
        return {
          released: true,
          expired: true,
          mutation: proposalMutation(proposal),
        };
      }
      await tx.matchProposal.update({
        where: { id: proposalId },
        data: {
          status: MatchProposalStatus.PENDING,
          hostUserId: null,
        },
      });
      await tx.matchProposalMember.updateMany({
        where: { proposalId, userId },
        data: {
          isHost: false,
          response: MatchProposalMemberResponse.PENDING,
        },
      });
      return {
        released: true,
        expired: false,
        mutation: proposalMutation(proposal),
      };
    });
    publishProposalMutation(
      result.mutation,
      result.expired ? 'proposal-expired' : 'proposal-updated',
    );
    return { released: result.released, expired: result.expired };
  }

  static async decline(proposalId: string, userId: string) {
    const mutation = await prisma.$transaction((tx) =>
      declineProposalMember(tx, proposalId, userId),
    );
    publishProposalMutation(mutation);

    return { declined: true };
  }

  static async expireDue(): Promise<number> {
    const candidates = await prisma.matchProposal.findMany({
      where: {
        status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
        gameId: null,
      },
      select: {
        id: true,
        dateKeys: true,
        startTime: true,
        endTime: true,
        expiresAt: true,
        city: { select: { timezone: true } },
      },
    });
    const now = new Date();
    const due = candidates.filter(
      (proposal) =>
        proposal.expiresAt <= now ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
          now,
        ),
    );

    for (const p of due) {
      await this.expireOne(p.id);
    }
    return due.length;
  }

  /** Drop a member from a pending proposal (roster edit). Intent returns to OPEN. */
  static async removeMember(proposalId: string, actorUserId: string, targetUserId: string) {
    const result = await prisma.$transaction(async (tx) => {
      await lockMatchProposal(tx, proposalId);
      const proposal = await tx.matchProposal.findUnique({
        where: { id: proposalId },
        include: { members: true },
      });
      if (!proposal) throw new ApiError(404, 'Match proposal not found');
      if (proposal.expiresAt <= new Date()) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
        });
        for (const member of [...proposal.members].sort((a, b) =>
          a.intentId.localeCompare(b.intentId),
        )) {
          await PlayIntentGameLifecycleService.release(
            tx,
            member.intentId,
            new Date(),
          );
        }
        return {
          expired: true,
          mutation: proposalMutation(proposal),
        };
      }
      if (proposal.status !== MatchProposalStatus.PENDING || proposal.hostUserId) {
        throw new ApiError(400, 'Roster is locked');
      }
      if (!proposal.members.some((m) => m.userId === actorUserId)) {
        throw new ApiError(403, 'Not a member of this proposal');
      }
      if (targetUserId === actorUserId) {
        throw new ApiError(400, 'You cannot remove yourself from the match roster');
      }
      const target = proposal.members.find((m) => m.userId === targetUserId);
      if (!target) throw new ApiError(404, 'Member not found');
      await tx.matchProposalMember.delete({ where: { id: target.id } });
      await PlayIntentGameLifecycleService.release(
        tx,
        target.intentId,
        new Date(),
      );
      return {
        expired: false,
        mutation: proposalMutation(proposal),
      };
    });
    publishProposalMutation(
      result.mutation,
      result.expired ? 'proposal-expired' : 'proposal-updated',
    );
    if (result.expired) {
      throw proposalUnavailable();
    }

    return {
      removed: true,
      dissolved: false,
      proposal: await this.getById(proposalId, actorUserId),
    };
  }

  /** Fill a vacant roster slot from a free intersecting intent. */
  static async addMember(
    proposalId: string,
    actorUserId: string,
    input: { userId: string; intentId: string },
  ) {
    const added = await prisma.$transaction(async (tx) => {
      await lockMatchProposal(tx, proposalId);
      const proposal = await tx.matchProposal.findUnique({
      where: { id: proposalId },
      include: {
        city: { select: { timezone: true } },
        members: {
          include: {
            intent: {
              include: {
                user: {
                  select: {
                    gender: true,
                    sportProfiles: { select: { sport: true, level: true } },
                  },
                },
              },
            },
          },
        },
      },
      });
      if (!proposal) throw new ApiError(404, 'Match proposal not found');
      const now = new Date();
      if (
        proposal.expiresAt <= now ||
        !intentWindowIsReachable(
          proposalWindowSource(proposal),
          proposal.city.timezone,
          now,
        )
      ) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
        });
        for (const member of [...proposal.members].sort((a, b) =>
          a.intentId.localeCompare(b.intentId),
        )) {
          await PlayIntentGameLifecycleService.release(
            tx,
            member.intentId,
            now,
          );
        }
        return {
          added: false as const,
          expired: true as const,
          mutation: proposalMutation(proposal),
        };
      }
      if (proposal.status !== MatchProposalStatus.PENDING || proposal.hostUserId) {
        throw new ApiError(400, 'Roster is locked');
      }
      if (!proposal.members.some((m) => m.userId === actorUserId)) {
        throw new ApiError(403, 'Not a member of this proposal');
      }

      const partySize =
        proposal.entityType === EntityType.BAR
          ? 2
          : getSportConfig(proposal.sport).defaultPlayersPerMatch;
      if (proposal.members.length >= partySize) {
        throw new ApiError(400, 'Match roster is full', true, { code: 'playIntent.rosterFull' });
      }
      if (proposal.members.some((m) => m.userId === input.userId)) {
        throw new ApiError(400, 'Already in the match');
      }

      const intent = await tx.playIntent.findFirst({
      where: {
        id: input.intentId,
        userId: input.userId,
        cityId: proposal.cityId,
        sport: proposal.sport,
        entityType: proposal.entityType,
        status: {
          in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED],
        },
        expiresAt: { gt: now },
        gameParticipants: { none: {} },
      },
      include: {
        user: {
          select: {
            gender: true,
            sportProfiles: { select: { sport: true, level: true } },
          },
        },
      },
      });
      if (!intent) throw new ApiError(404, 'Open play intent not found');
      if (!intentWindowIsReachable(intent, proposal.city.timezone, now)) {
        throw new ApiError(409, 'Intent no longer available');
      }

      const candidateCrit = PlayIntentService.toCriteria(intent);
      const proposalMemberCriteria = proposal.members.map((member) =>
        PlayIntentService.toCriteria(member.intent),
      );
      if (!canIntentJoinProposal(candidateCrit, proposalMemberCriteria)) {
        throw new ApiError(400, 'Player does not intersect with the match', true, {
          code: 'playIntent.noIntersection',
        });
      }

      const updated = await tx.playIntent.updateMany({
        where: {
          id: intent.id,
          status: {
            in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED],
          },
          expiresAt: { gt: now },
          gameParticipants: { none: {} },
        },
        data: { status: PlayIntentStatus.MATCHED },
      });
      if (updated.count !== 1) {
        return {
          added: false as const,
          expired: false as const,
          mutation: null,
        };
      }
      await tx.matchProposalMember.create({
        data: {
          proposalId,
          userId: input.userId,
          intentId: intent.id,
          response: MatchProposalMemberResponse.PENDING,
        },
      });
      return {
        added: true as const,
        expired: false as const,
        mutation: {
          proposalId,
          cityId: proposal.cityId,
          sport: proposal.sport,
          entityType: proposal.entityType,
          userIds: [
            ...proposal.members.map((member) => member.userId),
            input.userId,
          ],
        } satisfies ProposalMutation,
      };
    });
    if (added.expired) {
      publishProposalMutation(added.mutation, 'proposal-expired');
      throw proposalUnavailable();
    }
    if (!added.added) {
      throw new ApiError(409, 'Intent no longer available');
    }

    publishProposalMutation(added.mutation);
    await PlayIntentNotifyService.notifyPlayIntentMatch(proposalId);
    return {
      added: true,
      proposal: await this.getById(proposalId, actorUserId),
    };
  }

  static async expireOne(proposalId: string) {
    const mutation = await prisma.$transaction(async (tx) => {
      await lockMatchProposal(tx, proposalId);
      const proposal = await tx.matchProposal.findUnique({
        where: { id: proposalId },
        include: {
          members: { select: { intentId: true, userId: true } },
        },
      });
      if (
        !proposal ||
        proposal.gameId ||
        proposal.status === MatchProposalStatus.CONVERTED_TO_GAME
      ) {
        return null;
      }
      if (
        proposal.status !== MatchProposalStatus.PENDING &&
        proposal.status !== MatchProposalStatus.ACCEPTED
      ) {
        return null;
      }
      await tx.matchProposal.update({
        where: { id: proposalId },
        data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
      });
      for (const member of [...proposal.members].sort((a, b) =>
        a.intentId.localeCompare(b.intentId),
      )) {
        await PlayIntentGameLifecycleService.release(
          tx,
          member.intentId,
          new Date(),
        );
      }
      return proposalMutation(proposal);
    });
    publishProposalMutation(mutation, 'proposal-expired');
  }
}
