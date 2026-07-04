import {
  ChatType,
  type CancelledGame,
  type CancelledGameParticipant,
  type Game,
  type GameParticipant,
  ParticipantRole,
} from '@prisma/client';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { hasParentGamePermission } from '../../utils/parentGamePermissions';
import { MessageService } from './message.service';

export type GameChatViewerAccessActive = {
  lifecycle: 'active';
  game: Game & { participants: GameParticipant[] };
  participant: GameParticipant | undefined;
  isParticipant: boolean;
  hasPendingInvite: boolean;
};

export type GameChatViewerAccessArchived = {
  lifecycle: 'archived';
  stub: CancelledGame;
  participant: CancelledGameParticipant | undefined;
  archivedAt: Date;
  isParticipant: boolean;
};

export type GameChatViewerAccessResult =
  | GameChatViewerAccessActive
  | GameChatViewerAccessArchived;

const PARENT_PARTICIPANT_ROLES = [
  ParticipantRole.OWNER,
  ParticipantRole.ADMIN,
  ParticipantRole.PARTICIPANT,
] as const;

const PARENT_ADMIN_ROLES = [ParticipantRole.OWNER, ParticipantRole.ADMIN] as const;

async function isGlobalAdmin(userId: string): Promise<boolean> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  return user?.isAdmin ?? false;
}

async function hasArchivedParentGamePermission(
  stub: CancelledGame,
  userId: string,
  allowedRoles: readonly ParticipantRole[]
): Promise<boolean> {
  if (!stub.parentId) {
    return false;
  }
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { isAdmin: true },
  });
  if (!user) {
    return false;
  }
  return hasParentGamePermission(stub.parentId, userId, [...allowedRoles], user.isAdmin);
}

async function assertChatTypeReadable(
  access: GameChatViewerAccessResult,
  userId: string,
  chatType: ChatType
): Promise<void> {
  if (access.lifecycle === 'active') {
    await MessageService.validateChatTypeAccess(
      access.participant,
      chatType,
      access.game,
      userId,
      access.game.id,
      false
    );
    return;
  }

  const participant = access.participant;
  if (await isGlobalAdmin(userId)) {
    return;
  }
  const isParentGameAdminOrOwner = await hasArchivedParentGamePermission(
    access.stub,
    userId,
    PARENT_ADMIN_ROLES
  );

  const isPlaying = participant?.status === 'PLAYING';
  const isNonPlaying = participant?.status === 'NON_PLAYING';
  const isAdminOrOwner =
    participant?.role === ParticipantRole.OWNER || participant?.role === ParticipantRole.ADMIN;

  if (chatType === ChatType.PUBLIC) {
    return;
  }

  if (chatType === ChatType.PRIVATE) {
    if (!isPlaying && !isNonPlaying && !isAdminOrOwner && !isParentGameAdminOrOwner) {
      throw new ApiError(403, 'Only participants can access private chat');
    }
    return;
  }

  if (chatType === ChatType.ADMINS) {
    if (!isAdminOrOwner && !isParentGameAdminOrOwner) {
      throw new ApiError(403, 'Only game owners and admins can access admin chat');
    }
    return;
  }

  throw new ApiError(403, 'Access denied');
}

export class GameChatViewerAccessService {
  static async resolve(gameId: string, userId: string): Promise<GameChatViewerAccessResult | null> {
    const activeGame = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });

    if (activeGame) {
      const { game, isParticipant, hasPendingInvite, participant } =
        await MessageService.validateGameAccess(gameId, userId);
      return {
        lifecycle: 'active',
        game,
        participant,
        isParticipant,
        hasPendingInvite,
      };
    }

    const stub = await prisma.cancelledGame.findUnique({
      where: { id: gameId },
      include: {
        participants: {
          where: { userId },
        },
      },
    });

    if (!stub) {
      return null;
    }

    const isDirectParticipant = stub.participants.length > 0;
    const globalAdmin = await isGlobalAdmin(userId);
    const hasParentParticipantPermission = await hasArchivedParentGamePermission(
      stub,
      userId,
      PARENT_PARTICIPANT_ROLES
    );

    return {
      lifecycle: 'archived',
      stub,
      participant: stub.participants[0],
      archivedAt: stub.cancelledAt,
      isParticipant: globalAdmin || isDirectParticipant || hasParentParticipantPermission,
    };
  }

  static async assertReadable(
    gameId: string,
    userId: string,
    chatType?: ChatType
  ): Promise<GameChatViewerAccessResult> {
    const access = await this.resolve(gameId, userId);
    if (!access) {
      throw new ApiError(404, 'Game not found');
    }
    if (!access.isParticipant) {
      throw new ApiError(403, 'Access denied');
    }
    if (chatType != null) {
      await assertChatTypeReadable(access, userId, chatType);
    }
    return access;
  }

  static async assertWritable(gameId: string, userId: string): Promise<GameChatViewerAccessResult> {
    const access = await this.resolve(gameId, userId);
    if (!access) {
      throw new ApiError(404, 'Game not found');
    }
    if (!access.isParticipant) {
      throw new ApiError(403, 'Access denied');
    }
    if (access.lifecycle === 'archived') {
      throw new ApiError(403, 'This chat is archived', true, { code: 'chat.threadArchived' });
    }
    return access;
  }

  static async hasArchivedParentAdminAccess(stub: CancelledGame, userId: string): Promise<boolean> {
    return hasArchivedParentGamePermission(stub, userId, PARENT_ADMIN_ROLES);
  }
}
