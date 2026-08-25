import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { verifyPushInviteActionToken } from '../services/push/pushInviteActionToken.service';
import { InviteService } from '../services/invite.service';
import { UserTeamService } from '../services/userTeam.service';

export const performPushInviteAction = asyncHandler(async (req: Request, res: Response) => {
  let scope;
  try {
    scope = verifyPushInviteActionToken(String(req.body?.actionToken ?? ''));
  } catch {
    throw new ApiError(401, 'push.inviteActionTokenInvalid', true, {
      code: 'push.inviteActionTokenInvalid',
    });
  }

  if (scope.kind === 'team') {
    const data =
      scope.action === 'accept'
        ? await UserTeamService.acceptInvite(scope.targetId, scope.userId)
        : await UserTeamService.declineInvite(scope.targetId, scope.userId);
    res.json({ success: true, data });
    return;
  }

  const result =
    scope.action === 'accept'
      ? await InviteService.acceptInvite(scope.targetId, scope.userId, true)
      : await InviteService.declineInvite(scope.targetId, scope.userId, false);
  if (!result.success) throw new ApiError(400, result.message);
  res.json({ success: true, message: result.message });
});
