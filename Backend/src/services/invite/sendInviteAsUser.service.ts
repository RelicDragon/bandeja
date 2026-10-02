/**
 * `POST /invites` as a service: validation, permission, dedupe and side effects of
 * sending a game invite on behalf of a signed-in user. The HTTP controller and the
 * AI agent both call this, so neither path can skip `assertCanInviteToGame` or the
 * already-invited / already-playing / queued dedupe.
 */
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_WITH_SPORT_PROFILES } from '../../utils/constants';
import { isInviteInboxListed } from '../../utils/gameInviteInbox';
import { appendGameLog } from '../game/gameLog.service';
import { assertCanInviteToGame } from '../game/canInviteToGame';
import { ParticipantService } from '../game/participant.service';
import { ParticipantMessageHelper } from '../game/participantMessageHelper';
import notificationService from '../notification.service';
import { stampInviteUserTeamId } from '../userTeam/userTeamInviteStamp';
import { inboxInviteGameSelect, mapInvitedParticipantToInboxInvite } from './pendingInviteShape';

export type InviteActor = {
  userId: string;
  isAdmin: boolean;
};

export type SendInviteAsUserInput = {
  gameId: string;
  receiverId: string;
  message?: string | null;
  expiresAt?: Date | null;
  asTrainer?: boolean;
  inviteUserTeamId?: string | null;
  playIntentId?: string | null;
};

type SentInvite = Awaited<ReturnType<typeof ParticipantService.sendInvite>>;

export type SendInviteAsUserResult =
  /** Receiver already holds a pending invite; returned as the inbox shape (HTTP 200). */
  | { kind: 'existingInvite'; invite: ReturnType<typeof mapInvitedParticipantToInboxInvite> }
  /** Receiver is already on the roster (HTTP 200, `User is already a participant`). */
  | { kind: 'alreadyParticipant' }
  /** Receiver was in the join queue and got accepted instead (HTTP 200). */
  | { kind: 'acceptedFromQueue' }
  /** A new invite was created (HTTP 201). */
  | { kind: 'created'; invite: SentInvite['invite']; intentLinked: SentInvite['intentLinked'] };

/**
 * Permission half of sending an invite: the game must exist and the actor must be
 * allowed to invite to it (`assertCanInviteToGame`). Throws 404 / 403.
 */
export async function authorizeInviteAsUser(actor: InviteActor, gameId: string): Promise<void> {
  const game = await prisma.game.findUnique({
    where: { id: gameId },
    select: { anyoneCanInvite: true },
  });

  if (!game) {
    throw new ApiError(404, 'errors.invites.gameNotFound');
  }

  await assertCanInviteToGame(gameId, actor.userId, actor.isAdmin, game.anyoneCanInvite);
}

export async function sendInviteAsUser(
  actor: InviteActor,
  input: SendInviteAsUserInput,
): Promise<SendInviteAsUserResult> {
  const { gameId, receiverId, message, expiresAt, asTrainer } = input;
  const resolvedInviteUserTeamId = input.inviteUserTeamId ?? null;
  const actorId = actor.userId;

  if (!gameId) {
    throw new ApiError(400, 'errors.invites.mustSpecifyGameId');
  }

  const receiver = await prisma.user.findUnique({
    where: { id: receiverId },
  });

  if (!receiver) {
    throw new ApiError(404, 'errors.invites.receiverNotFound');
  }

  await authorizeInviteAsUser(actor, gameId);

  const existingInvited = await prisma.gameParticipant.findFirst({
    where: { gameId, userId: receiverId, status: 'INVITED' },
    include: {
      user: { select: USER_SELECT_WITH_SPORT_PROFILES },
      invitedByUser: { select: USER_SELECT_WITH_SPORT_PROFILES },
      game: {
        select: inboxInviteGameSelect,
      },
    },
  });
  if (existingInvited) {
    if (resolvedInviteUserTeamId) {
      await stampInviteUserTeamId(gameId, receiverId, resolvedInviteUserTeamId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, actorId);
    }
    return { kind: 'existingInvite', invite: mapInvitedParticipantToInboxInvite(existingInvited) };
  }

  const existingParticipant = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId: receiverId,
      status: 'PLAYING',
    },
  });

  const existingQueue = await prisma.gameParticipant.findFirst({
    where: {
      gameId,
      userId: receiverId,
      status: 'IN_QUEUE',
      role: 'PARTICIPANT',
    },
  });

  if (existingParticipant) {
    if (resolvedInviteUserTeamId) {
      await stampInviteUserTeamId(gameId, receiverId, resolvedInviteUserTeamId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, actorId);
    }
    return { kind: 'alreadyParticipant' };
  }

  if (existingQueue) {
    try {
      await ParticipantService.acceptNonPlayingParticipant(gameId, actorId, receiverId);
      if (resolvedInviteUserTeamId) {
        await stampInviteUserTeamId(gameId, receiverId, resolvedInviteUserTeamId);
        await ParticipantMessageHelper.emitGameUpdate(gameId, actorId);
      }
      return { kind: 'acceptedFromQueue' };
    } catch (error: unknown) {
      if ((error as { statusCode?: number } | null)?.statusCode === 403) {
        throw new ApiError(403, 'errors.invites.notAuthorizedToAcceptQueue');
      }
      throw error;
    }
  }

  if (resolvedInviteUserTeamId) {
    const existingOther = await prisma.gameParticipant.findFirst({
      where: { gameId, userId: receiverId },
      select: { id: true },
    });
    if (existingOther) {
      await stampInviteUserTeamId(gameId, receiverId, resolvedInviteUserTeamId);
      await ParticipantMessageHelper.emitGameUpdate(gameId, actorId);
      return { kind: 'alreadyParticipant' };
    }
  }

  const { invite, intentLinked } = await ParticipantService.sendInvite(
    gameId,
    actorId,
    receiverId,
    message,
    expiresAt ?? null,
    asTrainer === true,
    resolvedInviteUserTeamId,
    input.playIntentId ?? null,
  );

  if (invite.sender && invite.receiver) {
    await appendGameLog({
      gameId,
      type: 'USER_INVITED',
      actorId: invite.sender.id,
      targetId: invite.receiver.id,
      metadata: {
        inviteId: invite.id,
        asTrainer: asTrainer === true,
      },
    });
  }

  // Emit notification to receiver via Socket.IO
  const socketService = (global as { socketService?: { emitNewInvite: (userId: string, invite: unknown) => void } })
    .socketService;
  if (socketService && isInviteInboxListed(invite)) {
    socketService.emitNewInvite(receiverId, invite);
  }

  await ParticipantMessageHelper.emitGameUpdate(gameId, actorId);

  // Send notification if enabled
  if (invite.game) {
    notificationService.sendInviteNotification(invite).catch(error => {
      console.error('Failed to send invite notification:', error);
    });
  }

  return { kind: 'created', invite, intentLinked };
}
