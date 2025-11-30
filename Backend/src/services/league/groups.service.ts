import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { getDistinctLeagueGroupColor } from './groupColors';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';

const participantInclude = {
  user: {
    select: USER_SELECT_FIELDS,
  },
  leagueTeam: {
    include: {
      players: {
        include: {
          user: {
            select: USER_SELECT_FIELDS,
          },
        },
      },
    },
  },
  currentGroup: {
    select: {
      id: true,
      name: true,
      color: true,
    },
  },
};

const participantOrder: Prisma.LeagueParticipantOrderByWithRelationInput[] = [
  { points: 'desc' },
  { wins: 'desc' },
  { scoreDelta: 'desc' },
];

export class LeagueGroupManagementService {
  private static async ensureLeagueAccess(leagueSeasonId: string, userId: string) {
    const leagueSeason = await prisma.leagueSeason.findUnique({
      where: { id: leagueSeasonId },
      include: {
        game: true,
      },
    });

    if (!leagueSeason) {
      throw new ApiError(404, 'League season not found');
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { isAdmin: true },
    });

    if (!user) {
      throw new ApiError(404, 'User not found');
    }

    if (user.isAdmin) {
      return leagueSeason;
    }

    const hasPermission = await hasParentGamePermission(leagueSeasonId, userId);

    if (!hasPermission) {
      throw new ApiError(403, 'Only owners and admins can manage league groups');
    }

    return leagueSeason;
  }

  private static async ensureGroupAccess(groupId: string, userId: string) {
    const group = await prisma.leagueGroup.findUnique({
      where: { id: groupId },
    });

    if (!group) {
      throw new ApiError(404, 'League group not found');
    }

    await this.ensureLeagueAccess(group.leagueSeasonId, userId);
    return group;
  }

  private static async buildPayload(leagueSeasonId: string) {
    const allGroups = await prisma.leagueGroup.findMany({
      where: { leagueSeasonId },
      include: {
        participants: {
          include: participantInclude,
          orderBy: participantOrder,
        },
      },
    });

    const firstGroup = allGroups.find(g => !g.betterGroupId);
    const groups: typeof allGroups = [];
    
    if (firstGroup) {
      const groupMap = new Map(allGroups.map(g => [g.id, g]));
      let current: typeof firstGroup | undefined = firstGroup;
      
      while (current) {
        groups.push(current);
        current = current.worseGroupId ? groupMap.get(current.worseGroupId) : undefined;
      }
    }

    const unassignedParticipants = await prisma.leagueParticipant.findMany({
      where: {
        leagueSeasonId,
        currentGroupId: null,
      },
      include: participantInclude,
      orderBy: participantOrder,
    });

    return { groups, unassignedParticipants };
  }

  static async getGroups(leagueSeasonId: string, userId: string) {
    await this.ensureLeagueAccess(leagueSeasonId, userId);
    return this.buildPayload(leagueSeasonId);
  }

  static async createGroup(leagueSeasonId: string, name: string, userId: string) {
    if (!name.trim()) {
      throw new ApiError(400, 'Group name is required');
    }

    await this.ensureLeagueAccess(leagueSeasonId, userId);

    const [lastGroup, existingGroupColors] = await Promise.all([
      prisma.leagueGroup.findFirst({
        where: { leagueSeasonId },
        orderBy: { createdAt: 'desc' },
      }),
      prisma.leagueGroup.findMany({
        where: { leagueSeasonId },
        select: { color: true },
      }),
    ]);

    const usedColors = existingGroupColors
      .map(group => group.color)
      .filter((color): color is string => Boolean(color));
    const nextColor = getDistinctLeagueGroupColor(usedColors);

    const newGroup = await prisma.leagueGroup.create({
      data: {
        leagueSeasonId,
        name: name.trim(),
        betterGroupId: lastGroup ? lastGroup.id : null,
        color: nextColor,
      },
    });

    if (lastGroup) {
      await prisma.leagueGroup.update({
        where: { id: lastGroup.id },
        data: { worseGroupId: newGroup.id },
      });
    }

    return this.buildPayload(leagueSeasonId);
  }

  static async renameGroup(groupId: string, name: string, userId: string) {
    if (!name.trim()) {
      throw new ApiError(400, 'Group name is required');
    }

    const group = await this.ensureGroupAccess(groupId, userId);

    await prisma.leagueGroup.update({
      where: { id: groupId },
      data: { name: name.trim() },
    });

    return this.buildPayload(group.leagueSeasonId);
  }

  static async deleteGroup(groupId: string, userId: string) {
    const group = await this.ensureGroupAccess(groupId, userId);

    const operations: Prisma.PrismaPromise<unknown>[] = [
      prisma.leagueParticipant.updateMany({
        where: { currentGroupId: groupId },
        data: { currentGroupId: null },
      }),
    ];

    if (group.betterGroupId) {
      operations.push(
        prisma.leagueGroup.update({
          where: { id: group.betterGroupId },
          data: { worseGroupId: group.worseGroupId },
        })
      );
    }

    if (group.worseGroupId) {
      operations.push(
        prisma.leagueGroup.update({
          where: { id: group.worseGroupId },
          data: { betterGroupId: group.betterGroupId },
        })
      );
    }

    operations.push(
      prisma.leagueGroup.delete({
        where: { id: groupId },
      })
    );

    await prisma.$transaction(operations);

    return this.buildPayload(group.leagueSeasonId);
  }

  static async addParticipant(groupId: string, participantId: string, userId: string) {
    const group = await this.ensureGroupAccess(groupId, userId);

    const participant = await prisma.leagueParticipant.findUnique({
      where: { id: participantId },
      select: { id: true, leagueSeasonId: true, currentGroupId: true },
    });

    if (!participant || participant.leagueSeasonId !== group.leagueSeasonId) {
      throw new ApiError(404, 'Participant not found in this league season');
    }

    if (participant.currentGroupId && participant.currentGroupId !== groupId) {
      throw new ApiError(400, 'Participant is already assigned to another group');
    }

    await prisma.leagueParticipant.update({
      where: { id: participantId },
      data: { currentGroupId: groupId },
    });

    return this.buildPayload(group.leagueSeasonId);
  }

  static async removeParticipant(groupId: string, participantId: string, userId: string) {
    const group = await this.ensureGroupAccess(groupId, userId);

    const participant = await prisma.leagueParticipant.findFirst({
      where: { id: participantId, currentGroupId: groupId },
      select: { id: true },
    });

    if (!participant) {
      throw new ApiError(404, 'Participant not found in this group');
    }

    await prisma.leagueParticipant.update({
      where: { id: participantId },
      data: { currentGroupId: null },
    });

    return this.buildPayload(group.leagueSeasonId);
  }

  static async reorderGroups(leagueSeasonId: string, groupIds: string[], userId: string) {
    await this.ensureLeagueAccess(leagueSeasonId, userId);

    const groups = await prisma.leagueGroup.findMany({
      where: { leagueSeasonId },
      select: { id: true },
    });

    if (groups.length !== groupIds.length) {
      throw new ApiError(400, 'Invalid number of groups');
    }

    const groupIdSet = new Set(groups.map(g => g.id));
    for (const groupId of groupIds) {
      if (!groupIdSet.has(groupId)) {
        throw new ApiError(400, 'Invalid group ID');
      }
    }

    const operations: Prisma.PrismaPromise<unknown>[] = [];

    for (let i = 0; i < groupIds.length; i++) {
      const groupId = groupIds[i];
      const betterGroupId = i > 0 ? groupIds[i - 1] : null;
      const worseGroupId = i < groupIds.length - 1 ? groupIds[i + 1] : null;

      operations.push(
        prisma.leagueGroup.update({
          where: { id: groupId },
          data: { betterGroupId, worseGroupId },
        })
      );
    }

    await prisma.$transaction(operations);

    return this.buildPayload(leagueSeasonId);
  }
}


