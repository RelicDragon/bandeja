import { Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { AuthRequest } from '../middleware/auth';
import { InviteService } from '../services/invite.service';
import { sendInviteAsUser } from '../services/invite/sendInviteAsUser.service';
import { GameReadService, participantsToInviteShape } from '../services/game/read.service';

export const sendInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { receiverId, gameId, message, expiresAt, asTrainer, inviteUserTeamId, userTeamId, playIntentId } = req.body;
  const resolvedInviteUserTeamId =
    typeof inviteUserTeamId === 'string' && inviteUserTeamId.length > 0
      ? inviteUserTeamId
      : typeof userTeamId === 'string' && userTeamId.length > 0
        ? userTeamId
        : null;

  // Validation, `assertCanInviteToGame`, dedupe and side effects live in the service so
  // the AI agent goes through this exact path.
  const result = await sendInviteAsUser(
    { userId: req.userId!, isAdmin: req.user?.isAdmin || false },
    {
      gameId,
      receiverId,
      message,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      asTrainer: asTrainer === true,
      inviteUserTeamId: resolvedInviteUserTeamId,
      playIntentId: typeof playIntentId === 'string' && playIntentId.length > 0 ? playIntentId : null,
    },
  );

  switch (result.kind) {
    case 'existingInvite':
      return res.status(200).json({
        success: true,
        data: result.invite,
      });
    case 'alreadyParticipant':
      return res.status(200).json({
        success: true,
        message: 'User is already a participant',
      });
    case 'acceptedFromQueue':
      return res.status(200).json({
        success: true,
        message: 'User was automatically accepted from queue',
      });
    case 'created':
      return res.status(201).json({
        success: true,
        data: result.invite,
        ...(result.intentLinked !== null ? { intentLinked: result.intentLinked } : {}),
      });
  }
});

export const getMyInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const data = await InviteService.getMyPendingInvites(req.userId!);
  res.json({ success: true, data });
});

export const acceptInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const confirmOverlap = req.body?.confirmOverlap === true;
  const isAdmin = req.user?.isAdmin || false;

  const result = await InviteService.acceptInvite(id, req.userId!, false, isAdmin, confirmOverlap);

  if (!result.success) {
    const statusCode = result.message === 'errors.invites.notFound' ? 404 :
                      result.message === 'errors.invites.notAuthorizedToAccept' ? 403 : 400;
    throw new ApiError(statusCode, result.message);
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const declineInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const { message } = req.body ?? {};

  if (message !== undefined && message !== null && typeof message !== 'string') {
    throw new ApiError(400, 'errors.invalidInput');
  }

  let declineMessage: string | undefined;
  if (typeof message === 'string') {
    const trimmed = message.trim();
    if (trimmed.length > 10000) {
      throw new ApiError(400, 'errors.invites.declineMessageTooLong');
    }
    declineMessage = trimmed || undefined;
  }

  const result = await InviteService.declineInvite(
    id,
    req.userId!,
    req.user?.isAdmin || false,
    declineMessage
  );

  if (!result.success) {
    const statusCode = result.message === 'errors.invites.notFound' ? 404 :
                      result.message === 'errors.invites.notAuthorizedToDecline' ? 403 :
                      result.message === 'errors.invites.ownerCannotDecline' ? 400 : 400;
    throw new ApiError(statusCode, result.message);
  }

  res.json({
    success: true,
    message: result.message,
  });
});

export const deleteExpiredInvites = asyncHandler(async (_req: AuthRequest, res: Response) => {
  const deleted = await InviteService.expireDueInvites();
  res.json({ success: true, deleted });
});

export const getGameInvites = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { gameId } = req.params;
  const game = await GameReadService.getGameById(gameId, req.userId);
  const gameAny = game as any;
  res.json({ success: true, data: participantsToInviteShape(gameAny.participants ?? [], game) });
});

export const cancelInvite = asyncHandler(async (req: AuthRequest, res: Response) => {
  const { id } = req.params;
  const result = await InviteService.cancelInvite(id, req.userId!);
  if (!result.success) {
    const statusCode =
      result.message === 'errors.invites.notFound'
        ? 404
        : result.message === 'errors.invites.onlySenderCanCancel'
          ? 403
          : 400;
    throw new ApiError(statusCode, result.message);
  }
  res.json({
    success: true,
    message: result.message,
  });
});
