import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import { ApiError } from '../../utils/ApiError';
import { getBasicUsersForMessage } from '../../services/user/basicUsersForMessage.service';

const MAX_ID_LENGTH = 64;

export const getBasicUsersByIds = asyncHandler(async (req: AuthRequest, res: Response) => {
  const body = req.body as { ids?: unknown; messageId?: unknown };
  const messageId = typeof body.messageId === 'string' ? body.messageId.trim() : '';

  const raw = body.ids;
  const ids = Array.isArray(raw)
    ? [
        ...new Set(
          raw
            .map((id) => String(id).trim())
            .filter((id) => id.length > 0 && id.length <= MAX_ID_LENGTH)
        ),
      ]
    : [];

  if (!req.userId) {
    throw new ApiError(401, 'Unauthorized');
  }

  const users = await getBasicUsersForMessage({
    messageId,
    requestedIds: ids,
    viewerUserId: req.userId,
  });

  res.json({ success: true, data: users });
});
