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
import { startOfCalendarDate } from '../game/calendarDateBounds';
import { canIntentJoinProposal, timeStringToMinutes } from './playIntentCriteria';
import { PlayIntentService } from './playIntent.service';

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
    let suggestedStartTime: Date | null = null;
    if (city && input.dateKeys[0]) {
      try {
        const dayStart = startOfCalendarDate(input.dateKeys[0], city.timezone);
        const minutes = input.startTime ? timeStringToMinutes(input.startTime) : 18 * 60;
        suggestedStartTime = new Date(dayStart.getTime() + minutes * 60 * 1000);
      } catch {
        suggestedStartTime = null;
      }
    }

    const intentIds = input.members.map((m) => m.intentId);

    return prisma.$transaction(async (tx) => {
      const locked = await tx.playIntent.updateMany({
        where: { id: { in: intentIds }, status: PlayIntentStatus.OPEN },
        data: { status: PlayIntentStatus.MATCHED },
      });
      if (locked.count !== intentIds.length) {
        return null;
      }

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
          expiresAt: input.expiresAt,
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
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (!proposal.members.some((m) => m.userId === userId)) {
      throw new ApiError(403, 'Not a member of this proposal');
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
      members: { userId: string }[];
    },
    hostUserId: string,
  ) {
    const inviteeIds = proposal.members.filter((m) => m.userId !== hostUserId).map((m) => m.userId);
    const startIso =
      proposal.suggestedStartTime?.toISOString() ||
      (proposal.dateKeys[0] && proposal.startTime
        ? new Date(
            startOfCalendarDate(proposal.dateKeys[0], proposal.city.timezone).getTime() +
              timeStringToMinutes(proposal.startTime) * 60 * 1000,
          ).toISOString()
        : proposal.dateKeys[0]
          ? new Date(
              startOfCalendarDate(proposal.dateKeys[0], proposal.city.timezone).getTime() + 18 * 60 * 60 * 1000,
            ).toISOString()
          : undefined);
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
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: true, city: { select: { timezone: true } } },
    });
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (proposal.expiresAt <= new Date()) {
      await this.expireOne(proposalId);
      throw new ApiError(400, 'Proposal expired');
    }
    const membership = proposal.members.find((m) => m.userId === userId);
    if (!membership) throw new ApiError(403, 'Not a member of this proposal');

    if (proposal.status === MatchProposalStatus.ACCEPTED && proposal.hostUserId) {
      if (proposal.hostUserId === userId) {
        return {
          role: 'host' as const,
          proposal: await this.getById(proposalId, userId),
          createPrefill: this.buildCreatePrefill(proposal, userId),
        };
      }
      return {
        role: 'invitee' as const,
        proposal: await this.getById(proposalId, userId),
        createPrefill: null,
        gameId: proposal.gameId,
      };
    }

    if (proposal.status !== MatchProposalStatus.PENDING) {
      throw new ApiError(400, 'Proposal is no longer pending');
    }

    const partySize =
      proposal.entityType === EntityType.BAR
        ? 2
        : getSportConfig(proposal.sport).defaultPlayersPerMatch;
    if (proposal.members.length < partySize) {
      throw new ApiError(400, 'Match roster is incomplete', true, {
        code: 'playIntent.rosterIncomplete',
        needed: partySize,
        current: proposal.members.length,
      });
    }

    const claimed = await prisma.$transaction(async (tx) => {
      const updated = await tx.matchProposal.updateMany({
        where: {
          id: proposalId,
          status: MatchProposalStatus.PENDING,
          hostUserId: null,
        },
        data: {
          status: MatchProposalStatus.ACCEPTED,
          hostUserId: userId,
        },
      });
      if (updated.count === 0) return false;
      await tx.matchProposalMember.update({
        where: { id: membership.id },
        data: {
          isHost: true,
          response: MatchProposalMemberResponse.ACCEPTED,
        },
      });
      return true;
    });

    if (!claimed) {
      const latest = await this.getById(proposalId, userId);
      return {
        role: 'invitee' as const,
        proposal: latest,
        createPrefill: null,
        gameId: latest.gameId ?? null,
      };
    }

    return {
      role: 'host' as const,
      proposal: await this.getById(proposalId, userId),
      createPrefill: this.buildCreatePrefill(proposal, userId),
    };
  }

  /** Host abandoned create-game — reopen proposal for others within TTL. */
  static async releaseHost(proposalId: string, userId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: true },
    });
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (proposal.gameId) throw new ApiError(400, 'Proposal already converted');
    if (proposal.hostUserId !== userId) throw new ApiError(403, 'Only the host can release');

    if (proposal.expiresAt <= new Date()) {
      await this.expireOne(proposalId);
      return { released: true, expired: true };
    }

    await prisma.$transaction(async (tx) => {
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
    });

    return { released: true, expired: false };
  }

  static async decline(proposalId: string, userId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: true },
    });
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (proposal.status === MatchProposalStatus.CONVERTED_TO_GAME) {
      throw new ApiError(400, 'Proposal already converted');
    }
    const membership = proposal.members.find((m) => m.userId === userId);
    if (!membership) throw new ApiError(403, 'Not a member of this proposal');

    const partySize = getSportConfig(proposal.sport).defaultPlayersPerMatch;

    await prisma.$transaction(async (tx) => {
      await tx.matchProposalMember.update({
        where: { id: membership.id },
        data: {
          response: MatchProposalMemberResponse.DECLINED,
          isHost: false,
        },
      });

      // Decliner returns to OPEN pool immediately.
      await tx.playIntent.updateMany({
        where: { id: membership.intentId, status: PlayIntentStatus.MATCHED },
        data: { status: PlayIntentStatus.OPEN },
      });

      const remaining = proposal.members.filter(
        (m) =>
          m.userId !== userId &&
          m.response !== MatchProposalMemberResponse.DECLINED,
      );

      const wasHost = proposal.hostUserId === userId;
      if (wasHost) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: { hostUserId: null, status: MatchProposalStatus.PENDING },
        });
      }

      if (remaining.length < partySize) {
        await tx.matchProposal.update({
          where: { id: proposalId },
          data: { status: MatchProposalStatus.DECLINED, hostUserId: null },
        });
        await tx.playIntent.updateMany({
          where: {
            id: { in: remaining.map((m) => m.intentId) },
            status: PlayIntentStatus.MATCHED,
          },
          data: { status: PlayIntentStatus.OPEN },
        });
      }
    });

    return { declined: true };
  }

  static async markConverted(proposalId: string, userId: string, gameId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: true },
    });
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (proposal.hostUserId && proposal.hostUserId !== userId) {
      throw new ApiError(403, 'Only the host can convert this proposal');
    }

    await prisma.$transaction(async (tx) => {
      await tx.matchProposal.update({
        where: { id: proposalId },
        data: {
          status: MatchProposalStatus.CONVERTED_TO_GAME,
          gameId,
          hostUserId: userId,
        },
      });
      await tx.playIntent.updateMany({
        where: {
          id: { in: proposal.members.map((m) => m.intentId) },
          status: { in: [PlayIntentStatus.MATCHED, PlayIntentStatus.OPEN] },
        },
        data: { status: PlayIntentStatus.CONSUMED },
      });
    });

    return { gameId };
  }

  static async expireDue(): Promise<number> {
    const due = await prisma.matchProposal.findMany({
      where: {
        status: { in: [MatchProposalStatus.PENDING, MatchProposalStatus.ACCEPTED] },
        expiresAt: { lte: new Date() },
        gameId: null,
      },
      select: { id: true },
    });

    for (const p of due) {
      await this.expireOne(p.id);
    }
    return due.length;
  }

  /** Drop a member from a pending proposal (roster edit). Intent returns to OPEN. */
  static async removeMember(proposalId: string, actorUserId: string, targetUserId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: true },
    });
    if (!proposal) throw new ApiError(404, 'Match proposal not found');
    if (proposal.expiresAt <= new Date()) {
      await this.expireOne(proposalId);
      throw new ApiError(400, 'Proposal expired');
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

    await prisma.$transaction(async (tx) => {
      await tx.matchProposalMember.delete({ where: { id: target.id } });
      await tx.playIntent.updateMany({
        where: { id: target.intentId, status: PlayIntentStatus.MATCHED },
        data: { status: PlayIntentStatus.OPEN },
      });
    });

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
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: {
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
    if (proposal.expiresAt <= new Date()) {
      await this.expireOne(proposalId);
      throw new ApiError(400, 'Proposal expired');
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

    const intent = await prisma.playIntent.findFirst({
      where: {
        id: input.intentId,
        userId: input.userId,
        cityId: proposal.cityId,
        sport: proposal.sport,
        entityType: proposal.entityType,
        status: {
          in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED],
        },
        expiresAt: { gt: new Date() },
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

    const candidateCrit = PlayIntentService.toCriteria(intent);
    const proposalMemberCriteria = proposal.members.map((member) =>
      PlayIntentService.toCriteria(member.intent),
    );
    if (!canIntentJoinProposal(candidateCrit, proposalMemberCriteria)) {
      throw new ApiError(400, 'Player does not intersect with the match', true, {
        code: 'playIntent.noIntersection',
      });
    }

    const locked = await prisma.$transaction(async (tx) => {
      const updated = await tx.playIntent.updateMany({
        where: {
          id: intent.id,
          status: {
            in: [PlayIntentStatus.OPEN, PlayIntentStatus.MATCHED],
          },
          expiresAt: { gt: new Date() },
        },
        data: { status: PlayIntentStatus.MATCHED },
      });
      if (updated.count !== 1) return null;
      await tx.matchProposalMember.create({
        data: {
          proposalId,
          userId: input.userId,
          intentId: intent.id,
          response: MatchProposalMemberResponse.PENDING,
        },
      });
      return true;
    });
    if (!locked) throw new ApiError(409, 'Intent no longer available');

    return { added: true, proposal: await this.getById(proposalId, actorUserId) };
  }

  static async expireOne(proposalId: string) {
    const proposal = await prisma.matchProposal.findUnique({
      where: { id: proposalId },
      include: { members: { select: { intentId: true } } },
    });
    if (!proposal) return;
    if (proposal.status === MatchProposalStatus.CONVERTED_TO_GAME) return;

    await prisma.$transaction(async (tx) => {
      await tx.matchProposal.update({
        where: { id: proposalId },
        data: { status: MatchProposalStatus.EXPIRED, hostUserId: null },
      });
      await tx.playIntent.updateMany({
        where: {
          id: { in: proposal.members.map((m) => m.intentId) },
          status: PlayIntentStatus.MATCHED,
        },
        data: { status: PlayIntentStatus.OPEN },
      });
    });
  }
}
