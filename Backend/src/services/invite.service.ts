import prisma from '../config/database';
import { ChatContextType, ChatType, EntityType, GameInviteOutcomeType, ParticipantRole } from '@prisma/client';
import { MessageService } from './chat/message.service';
import {
  deleteGameInviteOutcome,
  upsertGameInviteOutcome,
} from '../utils/gameInviteOutcome';
import { createSystemMessage } from '../controllers/chat.controller';
import { USER_SELECT_FIELDS_WITH_SPORT_PROFILES } from '../utils/constants';
import { SystemMessageType, getUserDisplayName } from '../utils/systemMessages';
import { hasParentGamePermission } from '../utils/parentGamePermissions';
import { validatePlayerCanJoinGame, validateGameCanAcceptParticipants } from '../utils/participantValidation';
import { fetchGameWithPlayingParticipants } from '../utils/gameQueries';
import { performPostJoinOperations } from '../utils/postJoinOperations';
import { applyUserTeamToFixedTeamsIfReady } from './game/userTeamFixedTeams.service';
import { ApiError } from '../utils/ApiError';
import { createSystemMessageWithNotification } from '../utils/systemMessageHelper';
import { GameService } from './game/game.service';
import { ParticipantMessageHelper } from './game/participantMessageHelper';
import { projectUserForSportContext } from './user/userSportProfile.service';

export interface InviteActionResult {
  success: boolean;
  message: string;
  invite?: any;
}

const DECLINE_MESSAGE_MAX_LENGTH = 10000;

async function postDeclineReasonIfNeeded(
  gameId: string,
  inviteeUserId: string,
  actingUserId: string,
  declineMessage?: string
): Promise<void> {
  if (!declineMessage) return;
  if (inviteeUserId !== actingUserId) return;
  await MessageService.createMessageWithEvent({
    chatContextType: ChatContextType.GAME,
    contextId: gameId,
    senderId: inviteeUserId,
    content: declineMessage,
    mediaUrls: [],
    chatType: ChatType.PUBLIC,
  });
}

type InviteOutcomeSocketPayload = {
  userId: string;
  outcome: GameInviteOutcomeType;
  closedAt: string;
  invitedByUserId: string | null;
};

async function emitDeclineCancelSockets(
  gameId: string | null,
  participantId: string,
  userId: string,
  invitedByUserId: string | null,
  extras:
    | { participantPatch: { id?: string; userId: string; status: string; inviteClosedAt?: string | null } }
    | { removedParticipantId: string; removedUserId: string; inviteOutcome: InviteOutcomeSocketPayload }
) {
  const socketService = (global as any).socketService as
    | {
        emitInviteDeleted: (receiverId: string, inviteId: string, gameId?: string, extras?: unknown) => void;
        emitGameUpdate: (a: string, b: string, c?: unknown, d?: boolean) => Promise<void>;
      }
    | undefined;
  if (!socketService) return;
  socketService.emitInviteDeleted(userId, participantId, gameId || undefined, extras);
  if (invitedByUserId) {
    socketService.emitInviteDeleted(invitedByUserId, participantId, gameId || undefined, extras);
  }
  if (gameId) {
    await socketService.emitGameUpdate(gameId, userId, undefined, false);
  }
}

async function recordInviteOutcomeAndRemoveParticipant(
  participant: { id: string; gameId: string; userId: string; invitedByUserId: string | null },
  outcome: GameInviteOutcomeType
): Promise<InviteOutcomeSocketPayload> {
  const closedAt = new Date();
  const record = await prisma.$transaction(async (tx) => {
    const row = await upsertGameInviteOutcome(
      {
        gameId: participant.gameId,
        userId: participant.userId,
        outcome,
        invitedByUserId: participant.invitedByUserId,
        closedAt,
      },
      tx
    );
    await tx.gameParticipant.delete({ where: { id: participant.id } });
    return row;
  });
  return {
    userId: record.userId,
    outcome: record.outcome,
    closedAt: record.closedAt.toISOString(),
    invitedByUserId: record.invitedByUserId,
  };
}

export class InviteService {
  static async getMyPendingInvites(userId: string) {
    const participants = await prisma.gameParticipant.findMany({
      where: { userId, status: 'INVITED' },
      include: {
        invitedByUser: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES },
        game: {
          select: {
            id: true,
            name: true,
            gameType: true,
            startTime: true,
            endTime: true,
            maxParticipants: true,
            minParticipants: true,
            minLevel: true,
            maxLevel: true,
            isPublic: true,
            affectsRating: true,
            hasBookedCourt: true,
            afterGameGoToBar: true,
            hasFixedTeams: true,
            teamsReady: true,
            participantsReady: true,
            status: true,
            resultsStatus: true,
            entityType: true,
            sport: true,
            court: { select: { id: true, name: true, club: { select: { id: true, name: true, avatar: true } } } },
            club: { select: { id: true, name: true, avatar: true } },
            participants: {
              include: {
                user: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES },
                invitedByUser: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES },
              },
            },
          },
        },
      },
      orderBy: { joinedAt: 'desc' },
    });
    const now = new Date();
    const filtered = participants.filter(
      (p) => !p.inviteExpiresAt || new Date(p.inviteExpiresAt) > now
    );
    return filtered.map((p) => {
      const sport = p.game.sport;
      return {
      id: p.id,
      receiverId: p.userId,
      gameId: p.gameId,
      status: 'PENDING',
      message: p.inviteMessage,
      expiresAt: p.inviteExpiresAt,
      createdAt: p.joinedAt,
      updatedAt: p.joinedAt,
      receiver: null,
      sender: {
        ...projectUserForSportContext(p.invitedByUser, sport),
        sportProfiles: p.invitedByUser?.sportProfiles,
      },
      game: {
        ...p.game,
        participants: p.game.participants.map((participant) => ({
          ...participant,
          user: projectUserForSportContext(participant.user, sport),
          invitedByUser: projectUserForSportContext(participant.invitedByUser, sport),
        })),
      },
    };
    });
  }

  static async deleteInvitesForUserInGame(gameId: string, userId: string): Promise<void> {
    await deleteGameInviteOutcome(gameId, userId);
    const participants = await prisma.gameParticipant.findMany({
      where: { gameId, userId, status: 'INVITED' },
      select: { id: true, role: true, userId: true, invitedByUserId: true, gameId: true },
    });
    if (participants.length === 0) return;
    const ownerIds = participants.filter((p) => p.role === ParticipantRole.OWNER).map((p) => p.id);
    const toDelete = participants.filter((p) => p.role !== ParticipantRole.OWNER).map((p) => p.id);
    if (ownerIds.length > 0) {
      await prisma.gameParticipant.updateMany({
        where: { id: { in: ownerIds } },
        data: {
          status: 'NON_PLAYING',
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
          inviteUserTeamId: null,
          inviteClosedAt: null,
        },
      });
    }
    if (toDelete.length > 0) {
      await prisma.gameParticipant.deleteMany({ where: { id: { in: toDelete } } });
    }
    if ((global as any).socketService) {
      participants.forEach((p) => {
        (global as any).socketService.emitInviteDeleted(p.userId, p.id, p.gameId || undefined);
        if (p.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(p.invitedByUserId, p.id, p.gameId || undefined);
        }
      });
    }
  }

  static async acceptInvite(
    participantId: string,
    userId: string,
    _forceUpdate: boolean = false,
    isAdmin: boolean = false
  ): Promise<InviteActionResult> {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: {
        user: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES },
        invitedByUser: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES },
        game: { include: { participants: true } },
      },
    });
    if (!participant || participant.status !== 'INVITED') {
      return { success: false, message: 'errors.invites.notFound' };
    }
    const isReceiver = participant.userId === userId;
    let hasAdminPermission = false;
    if (!isReceiver && participant.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        participant.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }
    if (!isReceiver && !hasAdminPermission) {
      return { success: false, message: 'errors.invites.notAuthorizedToAccept' };
    }
    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({
        where: { id: participantId },
        data: {
          status: 'NON_PLAYING',
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
          inviteUserTeamId: null,
          inviteClosedAt: null,
        },
      });
      if ((global as any).socketService) {
        const ownerAcceptExtras = {
          participantPatch: {
            id: participantId,
            userId: participant.userId,
            status: 'NON_PLAYING' as const,
            inviteClosedAt: null as string | null,
          },
        };
        (global as any).socketService.emitInviteDeleted(
          participant.userId,
          participantId,
          participant.gameId || undefined,
          ownerAcceptExtras
        );
        if (participant.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(
            participant.invitedByUserId,
            participantId,
            participant.gameId || undefined,
            ownerAcceptExtras
          );
        }
      }
      if (participant.gameId) {
        await ParticipantMessageHelper.emitGameUpdate(participant.gameId, participant.userId);
      }
      return { success: true, message: 'invites.acceptedSuccessfully' };
    }
    if (participant.inviteExpiresAt && new Date() > participant.inviteExpiresAt) {
      return { success: false, message: 'errors.invites.expired' };
    }
    const gameId = participant.gameId;
    const receiverId = participant.userId;
    const inviteUserTeamIdForFixedTeams = participant.inviteUserTeamId ?? null;

    const refetchedGame =
      gameId && !participant.game
        ? await prisma.game.findUnique({
            where: { id: gameId },
            include: { participants: true },
          })
        : null;
    const gameForJoin = participant.game ?? refetchedGame;
    if (!gameId || !gameForJoin) {
      return { success: false, message: 'errors.invites.notFound' };
    }

    const acceptedPlayingStatus: 'PLAYING' | 'NON_PLAYING' =
      participant.role === ParticipantRole.ADMIN && gameForJoin.entityType === EntityType.TRAINING
        ? 'NON_PLAYING'
        : 'PLAYING';

    try {
        await prisma.$transaction(async (tx: any) => {
          const locked = await tx.gameParticipant.findFirst({
            where: { id: participantId, status: 'INVITED' },
          });
          if (!locked) {
            throw new ApiError(400, 'errors.invites.notFound');
          }
          const currentGame = await fetchGameWithPlayingParticipants(tx, gameId);
          validateGameCanAcceptParticipants(currentGame);
          const joinResult = await validatePlayerCanJoinGame(currentGame, receiverId, { skipLevelCheck: true });
          if (!joinResult.canJoin && joinResult.shouldQueue) {
            throw new ApiError(400, joinResult.reason || 'errors.invites.gameFull', true, {
              code: 'INVITE_ACCEPT_TO_QUEUE',
            });
          }
          const isTrainerInvite =
            locked.role === ParticipantRole.ADMIN && currentGame.entityType === EntityType.TRAINING;
          if (isTrainerInvite) {
            await tx.game.update({ where: { id: gameId }, data: { trainerId: receiverId } });
          }
          await tx.gameParticipant.update({
            where: { id: participantId, status: 'INVITED' },
            data: {
              status: isTrainerInvite ? 'NON_PLAYING' : 'PLAYING',
              role: locked.role,
              invitedByUserId: null,
              inviteMessage: null,
              inviteExpiresAt: null,
              inviteUserTeamId: null,
              inviteClosedAt: null,
            },
          });
        });
        await performPostJoinOperations(gameId, receiverId);
        if (inviteUserTeamIdForFixedTeams) {
          try {
            await applyUserTeamToFixedTeamsIfReady(gameId, inviteUserTeamIdForFixedTeams);
          } catch (e) {
            console.error('[userTeamFixedTeams] apply after invite accept', e);
          }
        }
      } catch (error: any) {
        if (gameId && error instanceof ApiError && error.statusCode === 400 && error.data?.code === 'INVITE_ACCEPT_TO_QUEUE') {
          const u = await prisma.gameParticipant.updateMany({
            where: { id: participantId, userId: receiverId, status: 'INVITED' },
            data: {
              status: 'IN_QUEUE',
              role: ParticipantRole.PARTICIPANT,
              invitedByUserId: null,
              inviteMessage: null,
              inviteExpiresAt: null,
              inviteClosedAt: null,
              inviteUserTeamId: inviteUserTeamIdForFixedTeams,
            },
          });
          if (u.count === 0) {
            return { success: false, message: 'errors.invites.notFound' };
          }
          await createSystemMessageWithNotification(
            gameId,
            SystemMessageType.USER_JOINED_JOIN_QUEUE,
            receiverId,
            ChatType.ADMINS
          );
          await GameService.updateGameReadiness(gameId);
          await ParticipantMessageHelper.emitGameUpdate(gameId, receiverId);
          if ((global as any).socketService) {
            const queueExtras = {
              participantPatch: {
                id: participantId,
                userId: receiverId,
                status: 'IN_QUEUE' as const,
                inviteClosedAt: null as string | null,
              },
            };
            (global as any).socketService.emitInviteDeleted(receiverId, participantId, gameId || undefined, queueExtras);
            if (participant.invitedByUserId) {
              (global as any).socketService.emitInviteDeleted(
                participant.invitedByUserId,
                participantId,
                gameId || undefined,
                queueExtras
              );
            }
          }
          return { success: true, message: 'games.addedToJoinQueue' };
        }
        throw error;
      }
    if ((global as any).socketService) {
      const acceptExtras = {
        participantPatch: {
          id: participantId,
          userId: receiverId,
          status: acceptedPlayingStatus,
          inviteClosedAt: null as string | null,
        },
      };
      (global as any).socketService.emitInviteDeleted(receiverId, participantId, gameId || undefined, acceptExtras);
      if (participant.invitedByUserId) {
        (global as any).socketService.emitInviteDeleted(
          participant.invitedByUserId,
          participantId,
          gameId || undefined,
          acceptExtras
        );
      }
    }
    if (gameId) {
      await ParticipantMessageHelper.emitGameUpdate(gameId, receiverId);
    }
    return { success: true, message: 'invites.acceptedSuccessfully' };
  }

  static async declineInvite(
    participantId: string,
    userId: string,
    isAdmin: boolean = false,
    declineMessage?: string
  ): Promise<InviteActionResult> {
    const normalizedDeclineMessage = declineMessage?.trim() || undefined;
    if (
      normalizedDeclineMessage &&
      normalizedDeclineMessage.length > DECLINE_MESSAGE_MAX_LENGTH
    ) {
      throw new ApiError(400, 'errors.invites.declineMessageTooLong');
    }
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      include: { user: { select: USER_SELECT_FIELDS_WITH_SPORT_PROFILES } },
    });
    if (!participant || participant.status !== 'INVITED') {
      return { success: false, message: 'errors.invites.notFound' };
    }
    if (participant.role === ParticipantRole.OWNER) {
      if (participant.gameId) {
        await postDeclineReasonIfNeeded(
          participant.gameId,
          participant.userId,
          userId,
          normalizedDeclineMessage
        );
      }
      await prisma.gameParticipant.update({
        where: { id: participantId },
        data: {
          status: 'NON_PLAYING',
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
          inviteUserTeamId: null,
          inviteClosedAt: null,
        },
      });
      if ((global as any).socketService) {
        const ownerDeclineExtras = {
          participantPatch: {
            id: participantId,
            userId: participant.userId,
            status: 'NON_PLAYING' as const,
            inviteClosedAt: null as string | null,
          },
        };
        (global as any).socketService.emitInviteDeleted(
          participant.userId,
          participantId,
          participant.gameId || undefined,
          ownerDeclineExtras
        );
        if (participant.invitedByUserId) {
          (global as any).socketService.emitInviteDeleted(
            participant.invitedByUserId,
            participantId,
            participant.gameId || undefined,
            ownerDeclineExtras
          );
        }
      }
      if (participant.gameId) {
        await ParticipantMessageHelper.emitGameUpdate(participant.gameId, participant.userId);
      }
      return { success: true, message: 'invites.declinedSuccessfully' };
    }
    const isReceiver = participant.userId === userId;
    let hasAdminPermission = false;
    if (!isReceiver && participant.gameId) {
      hasAdminPermission = await hasParentGamePermission(
        participant.gameId,
        userId,
        [ParticipantRole.OWNER, ParticipantRole.ADMIN],
        isAdmin
      );
    }
    if (!isReceiver && !hasAdminPermission) {
      return { success: false, message: 'errors.invites.notAuthorizedToDecline' };
    }
    if (!participant.gameId) {
      return { success: false, message: 'errors.invites.notFound' };
    }
    await postDeclineReasonIfNeeded(
      participant.gameId,
      participant.userId,
      userId,
      normalizedDeclineMessage
    );
    const inviteOutcome = await recordInviteOutcomeAndRemoveParticipant(
      {
        id: participantId,
        gameId: participant.gameId,
        userId: participant.userId,
        invitedByUserId: participant.invitedByUserId,
      },
      GameInviteOutcomeType.DECLINED
    );
    if (participant.user) {
      const receiverName = getUserDisplayName(participant.user.firstName, participant.user.lastName);
      try {
        await createSystemMessage(participant.gameId, {
          type: SystemMessageType.USER_DECLINED_INVITE,
          variables: { userName: receiverName },
        });
      } catch (error) {
        console.error('Failed to create system message for invite decline:', error);
      }
    }
    await emitDeclineCancelSockets(participant.gameId, participantId, participant.userId, participant.invitedByUserId, {
      removedParticipantId: participantId,
      removedUserId: participant.userId,
      inviteOutcome,
    });
    return { success: true, message: 'invites.declinedSuccessfully' };
  }

  static async cancelInvite(participantId: string, cancellerUserId: string): Promise<InviteActionResult> {
    const participant = await prisma.gameParticipant.findUnique({
      where: { id: participantId },
      select: {
        id: true,
        status: true,
        role: true,
        invitedByUserId: true,
        userId: true,
        gameId: true,
      },
    });
    if (!participant || participant.status !== 'INVITED') {
      return { success: false, message: 'errors.invites.notFound' };
    }
    if (participant.invitedByUserId !== cancellerUserId) {
      return { success: false, message: 'errors.invites.onlySenderCanCancel' };
    }
    if (participant.role === ParticipantRole.OWNER) {
      await prisma.gameParticipant.update({
        where: { id: participantId },
        data: {
          status: 'NON_PLAYING',
          invitedByUserId: null,
          inviteMessage: null,
          inviteExpiresAt: null,
          inviteUserTeamId: null,
          inviteClosedAt: null,
        },
      });
      await emitDeclineCancelSockets(participant.gameId, participantId, participant.userId, participant.invitedByUserId, {
        participantPatch: {
          id: participantId,
          userId: participant.userId,
          status: 'NON_PLAYING',
          inviteClosedAt: null,
        },
      });
      return { success: true, message: 'invites.cancelledSuccessfully' };
    }
    if (!participant.gameId) {
      return { success: false, message: 'errors.invites.notFound' };
    }
    const inviteOutcome = await recordInviteOutcomeAndRemoveParticipant(
      {
        id: participantId,
        gameId: participant.gameId,
        userId: participant.userId,
        invitedByUserId: participant.invitedByUserId,
      },
      GameInviteOutcomeType.CANCELLED
    );
    await emitDeclineCancelSockets(participant.gameId, participantId, participant.userId, participant.invitedByUserId, {
      removedParticipantId: participantId,
      removedUserId: participant.userId,
      inviteOutcome,
    });
    return { success: true, message: 'invites.cancelledSuccessfully' };
  }
}
