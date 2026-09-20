import type { Request, Response } from 'express';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { verifyPushInviteActionToken } from '../services/push/pushInviteActionToken.service';
import { resolvePushActionHandler } from '../services/push/pushActionHandlers';
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

  if (scope.kind === 'game') {
    const result =
      scope.action === 'accept'
        ? await InviteService.acceptInvite(scope.targetId, scope.userId, true)
        : await InviteService.declineInvite(scope.targetId, scope.userId, false);
    if (!result.success) throw new ApiError(400, result.message);
    res.json({ success: true, message: result.message });
    return;
  }

  // series / attendance / weather — supplied by the owning PRD agent through
  // `registerPushActionHandler` (services/push/pushActionHandlers.ts).
  const handler = resolvePushActionHandler(scope.kind);
  if (!handler) {
    throw new ApiError(400, 'push.inviteActionUnsupported', true, {
      code: 'push.inviteActionUnsupported',
    });
  }

  const result = await handler(scope);
  if (!result.success) throw new ApiError(400, result.message);
  res.json({ success: true, message: result.message });
});
