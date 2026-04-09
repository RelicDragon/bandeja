import prisma from '../config/database';
import { ApiError } from '../utils/ApiError';
import { USER_SELECT_FIELDS } from '../utils/constants';
import { generateRandomAdjectiveAnimalLabel } from './user/userDisplayName.service';
import { UserTeamMemberStatus, Prisma } from '@prisma/client';
import notificationService from './notification.service';

const TEAM_INCLUDE = {
  owner: { select: USER_SELECT_FIELDS },
  members: {
    include: { user: { select: USER_SELECT_FIELDS } },
    orderBy: [{ isOwner: 'desc' as const }, { createdAt: 'asc' as const }],
  },
};

async function assertNotBlocked(aId: string, bId: string) {
  const block = await prisma.blockedUser.findFirst({
    where: {
      OR: [
        { userId: aId, blockedUserId: bId },
        { userId: bId, blockedUserId: aId },
      ],
    },
  });
  if (block) throw new ApiError(403, 'errors.userTeams.blocked');
}

function socketSvc() {
  return (global as any).socketService as
    | {
        emitUserTeamInvite: (receiverId: string, payload: unknown) => void;
        emitUserTeamInviteAccepted: (ownerId: string, payload: unknown) => void;
        emitUserTeamInviteDeclined: (ownerId: string, payload: unknown) => void;
        emitUserTeamMemberRemoved: (userId: string, payload: unknown) => void;
        emitUserTeamUpdated: (userIds: string[], payload: unknown) => void;
        emitUserTeamDeleted: (userIds: string[], teamId: string) => void;
      }
    | undefined;
}

async function collectNotifyUserIds(teamId: string): Promise<string[]> {
  const members = await prisma.userTeamMember.findMany({
    where: { teamId },
    select: { userId: true },
  });
  return [...new Set(members.map((m) => m.userId))];
}

async function pickUniqueTeamNameForOwner(ownerId: string, db: Prisma.TransactionClient | typeof prisma) {
  for (let i = 0; i < 12; i++) {
    const name = generateRandomAdjectiveAnimalLabel();
    const clash = await db.userTeam.findFirst({ where: { ownerId, name }, select: { id: true } });
    if (!clash) return name;
  }
  return `${generateRandomAdjectiveAnimalLabel()} ${Date.now().toString(36).slice(-4)}`;
}

export class UserTeamService {
  static async createTeam(
    ownerId: string,
    data: { name?: string; avatar?: string | null; originalAvatar?: string | null }
  ) {
    const owner = await prisma.user.findUnique({
      where: { id: ownerId },
      select: { id: true },
    });
    if (!owner) throw new ApiError(404, 'errors.userTeams.userNotFound');

    const trimmed = data.name?.trim();
    const explicitName = trimmed && trimmed.length > 0 ? trimmed : null;
    if (explicitName && explicitName.length < 3) {
      throw new ApiError(400, 'errors.userTeams.nameTooShort');
    }

    const team = await prisma.$transaction(async (tx) => {
      const name = explicitName ?? (await pickUniqueTeamNameForOwner(ownerId, tx));
      const t = await tx.userTeam.create({
        data: {
          name,
          avatar: data.avatar ?? null,
          originalAvatar: data.originalAvatar ?? null,
          ownerId,
          size: 2,
        },
      });
      await tx.userTeamMember.create({
        data: {
          teamId: t.id,
          userId: ownerId,
          status: UserTeamMemberStatus.ACCEPTED,
          isOwner: true,
          joinedAt: new Date(),
        },
      });
      return tx.userTeam.findUniqueOrThrow({
        where: { id: t.id },
        include: TEAM_INCLUDE,
      });
    });

    return team;
  }

  static async getMyTeams(ownerId: string) {
    return prisma.userTeam.findMany({
      where: { ownerId },
      include: TEAM_INCLUDE,
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getMyMemberships(userId: string) {
    return prisma.userTeamMember.findMany({
      where: { userId },
      include: {
        team: { include: TEAM_INCLUDE },
      },
      orderBy: { updatedAt: 'desc' },
    });
  }

  static async getTeamForUser(teamId: string, userId: string) {
    const membership = await prisma.userTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!membership) throw new ApiError(403, 'errors.userTeams.accessDenied');

    const team = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: TEAM_INCLUDE,
    });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
    return team;
  }

  static async updateTeam(
    teamId: string,
    requesterId: string,
    data: { name?: string; avatar?: string | null; originalAvatar?: string | null; cutAngle?: number }
  ) {
    const team = await prisma.userTeam.findUnique({ where: { id: teamId } });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
    if (team.ownerId !== requesterId) throw new ApiError(403, 'errors.userTeams.onlyOwner');

    if (data.name !== undefined) {
      const n = data.name.trim();
      if (n.length < 3) throw new ApiError(400, 'errors.userTeams.nameTooShort');
    }

    let cutAngle: number | undefined;
    if (data.cutAngle !== undefined) {
      const raw = Number(data.cutAngle);
      cutAngle = Number.isFinite(raw) ? ((raw % 360) + 360) % 360 : 45;
    }

    const updated = await prisma.userTeam.update({
      where: { id: teamId },
      data: {
        ...(data.name !== undefined ? { name: data.name.trim() } : {}),
        ...(data.avatar !== undefined ? { avatar: data.avatar } : {}),
        ...(data.originalAvatar !== undefined ? { originalAvatar: data.originalAvatar } : {}),
        ...(cutAngle !== undefined ? { cutAngle } : {}),
      },
      include: TEAM_INCLUDE,
    });

    const ids = await collectNotifyUserIds(teamId);
    socketSvc()?.emitUserTeamUpdated(ids, { team: updated });
    return updated;
  }

  static async deleteTeam(teamId: string, requesterId: string) {
    const team = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
    if (team.ownerId !== requesterId) throw new ApiError(403, 'errors.userTeams.onlyOwner');

    const notifyDeleted = team.members.filter(
      (m) =>
        !m.isOwner &&
        (m.status === UserTeamMemberStatus.ACCEPTED || m.status === UserTeamMemberStatus.PENDING)
    );
    for (const m of notifyDeleted) {
      void notificationService.sendUserTeamDeletedNotification(team.name, m.userId).catch((err) =>
        console.error('[UserTeam] delete notify', err)
      );
    }

    const ids = [...new Set(team.members.map((x) => x.userId))];
    await prisma.userTeam.delete({ where: { id: teamId } });
    socketSvc()?.emitUserTeamDeleted(ids, teamId);
  }

  static async inviteMember(teamId: string, ownerId: string, targetUserId: string) {
    if (targetUserId === ownerId) throw new ApiError(400, 'errors.userTeams.cannotInviteSelf');

    const team = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');
    if (team.ownerId !== ownerId) throw new ApiError(403, 'errors.userTeams.onlyOwnerInvites');

    const target = await prisma.user.findUnique({ where: { id: targetUserId }, select: { id: true, isActive: true } });
    if (!target || !target.isActive) throw new ApiError(404, 'errors.userTeams.userNotFound');

    await assertNotBlocked(ownerId, targetUserId);

    const acceptedOthers = team.members.filter((m) => !m.isOwner && m.status === UserTeamMemberStatus.ACCEPTED);
    if (acceptedOthers.length >= team.size - 1) {
      throw new ApiError(400, 'errors.userTeams.teamFull');
    }

    const existing = team.members.find((m) => m.userId === targetUserId);
    if (existing?.isOwner) throw new ApiError(400, 'errors.userTeams.cannotInviteSelf');
    if (existing?.status === UserTeamMemberStatus.ACCEPTED) {
      throw new ApiError(400, 'errors.userTeams.alreadyMember');
    }

    await prisma.userTeamMember.deleteMany({
      where: {
        teamId,
        isOwner: false,
        status: UserTeamMemberStatus.PENDING,
        userId: { not: targetUserId },
      },
    });

    let membership;
    if (existing && existing.status === UserTeamMemberStatus.DECLINED) {
      membership = await prisma.userTeamMember.update({
        where: { id: existing.id },
        data: { status: UserTeamMemberStatus.PENDING, joinedAt: null },
        include: { user: { select: USER_SELECT_FIELDS } },
      });
    } else if (existing && existing.status === UserTeamMemberStatus.PENDING) {
      membership = await prisma.userTeamMember.findUniqueOrThrow({
        where: { id: existing.id },
        include: { user: { select: USER_SELECT_FIELDS } },
      });
    } else {
      membership = await prisma.userTeamMember.create({
        data: {
          teamId,
          userId: targetUserId,
          status: UserTeamMemberStatus.PENDING,
          isOwner: false,
        },
        include: { user: { select: USER_SELECT_FIELDS } },
      });
    }

    const fullTeam = await prisma.userTeam.findUniqueOrThrow({
      where: { id: teamId },
      include: TEAM_INCLUDE,
    });

    const ownerUser = await prisma.user.findUnique({
      where: { id: ownerId },
      select: USER_SELECT_FIELDS,
    });

    socketSvc()?.emitUserTeamInvite(targetUserId, { team: fullTeam, invitedBy: ownerUser });

    const notifyIds = await collectNotifyUserIds(teamId);
    socketSvc()?.emitUserTeamUpdated(notifyIds, { team: fullTeam });

    if (ownerUser && existing?.status !== UserTeamMemberStatus.PENDING) {
      void notificationService
        .sendUserTeamInviteNotification(
          { id: fullTeam.id, name: fullTeam.name },
          ownerUser,
          targetUserId
        )
        .catch((err) => console.error('[UserTeam] invite notify', err));
    }

    return { team: fullTeam, membership };
  }

  static async acceptInvite(teamId: string, userId: string) {
    const row = await prisma.userTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!row || row.status !== UserTeamMemberStatus.PENDING) {
      throw new ApiError(404, 'errors.userTeams.inviteNotFound');
    }
    if (row.isOwner) throw new ApiError(400, 'errors.userTeams.invalidInvite');

    const team = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');

    const acceptedOthers = team.members.filter((m) => !m.isOwner && m.status === UserTeamMemberStatus.ACCEPTED);
    if (acceptedOthers.length >= team.size - 1) {
      throw new ApiError(400, 'errors.userTeams.teamFull');
    }

    await prisma.userTeamMember.update({
      where: { id: row.id },
      data: { status: UserTeamMemberStatus.ACCEPTED, joinedAt: new Date() },
    });

    const fullTeam = await prisma.userTeam.findUniqueOrThrow({
      where: { id: teamId },
      include: TEAM_INCLUDE,
    });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT_FIELDS });
    socketSvc()?.emitUserTeamInviteAccepted(team.ownerId, { teamId, user });

    const notifyIds = await collectNotifyUserIds(teamId);
    socketSvc()?.emitUserTeamUpdated(notifyIds, { team: fullTeam });

    if (user) {
      void notificationService
        .sendUserTeamInviteAcceptedNotification(
          { id: fullTeam.id, name: fullTeam.name },
          user,
          team.ownerId
        )
        .catch((err) => console.error('[UserTeam] accept notify', err));
    }

    return fullTeam;
  }

  static async declineInvite(teamId: string, userId: string) {
    const row = await prisma.userTeamMember.findUnique({
      where: { teamId_userId: { teamId, userId } },
    });
    if (!row || row.status !== UserTeamMemberStatus.PENDING || row.isOwner) {
      throw new ApiError(404, 'errors.userTeams.inviteNotFound');
    }

    const team = await prisma.userTeam.findUnique({ where: { id: teamId } });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');

    await prisma.userTeamMember.delete({ where: { id: row.id } });

    const user = await prisma.user.findUnique({ where: { id: userId }, select: USER_SELECT_FIELDS });
    if (user) {
      void notificationService
        .sendUserTeamInviteDeclinedNotification(
          { id: team.id, name: team.name },
          user,
          team.ownerId
        )
        .catch((err) => console.error('[UserTeam] decline notify', err));
    }
    socketSvc()?.emitUserTeamInviteDeclined(team.ownerId, { teamId, user });

    const fullTeam = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: TEAM_INCLUDE,
    });
    if (fullTeam) {
      const notifyIds = await collectNotifyUserIds(teamId);
      socketSvc()?.emitUserTeamUpdated(notifyIds, { team: fullTeam });
    }

    return { success: true };
  }

  static async removeMember(teamId: string, requesterId: string, targetUserId: string) {
    const team = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: { members: true },
    });
    if (!team) throw new ApiError(404, 'errors.userTeams.notFound');

    const targetRow = team.members.find((m) => m.userId === targetUserId);
    if (!targetRow) throw new ApiError(404, 'errors.userTeams.memberNotFound');

    if (targetRow.isOwner) {
      throw new ApiError(400, 'errors.userTeams.cannotRemoveOwner');
    }

    if (requesterId !== team.ownerId && requesterId !== targetUserId) {
      throw new ApiError(403, 'errors.userTeams.accessDenied');
    }

    const leaverUser = await prisma.user.findUnique({
      where: { id: targetUserId },
      select: USER_SELECT_FIELDS,
    });

    await prisma.userTeamMember.delete({ where: { id: targetRow.id } });

    const teamMini = { id: team.id, name: team.name };
    if (requesterId === team.ownerId && targetUserId !== team.ownerId) {
      void notificationService
        .sendUserTeamMemberRemovedNotification(teamMini, targetUserId)
        .catch((err) => console.error('[UserTeam] removed notify', err));
    } else if (requesterId === targetUserId && leaverUser) {
      void notificationService
        .sendUserTeamMemberLeftNotification(teamMini, leaverUser, team.ownerId)
        .catch((err) => console.error('[UserTeam] left notify', err));
    }

    socketSvc()?.emitUserTeamMemberRemoved(targetUserId, { teamId });

    const fullTeam = await prisma.userTeam.findUnique({
      where: { id: teamId },
      include: TEAM_INCLUDE,
    });
    if (fullTeam) {
      const notifyIds = await collectNotifyUserIds(teamId);
      socketSvc()?.emitUserTeamUpdated(notifyIds, { team: fullTeam });
    }

    return fullTeam;
  }
}
