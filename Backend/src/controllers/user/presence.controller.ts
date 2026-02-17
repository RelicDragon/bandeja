import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';

const getSocketService = () => (global as any).socketService;

const MAX_PRESENCE_IDS = 3000;
const MAX_ID_LENGTH = 64;

export const getPresence = asyncHandler(async (req: AuthRequest, res: Response) => {
  const idsParam = req.query.ids;
  const raw = typeof idsParam === 'string'
    ? idsParam.split(',').map((id) => String(id).trim()).filter(Boolean)
    : Array.isArray(idsParam)
      ? (idsParam as string[]).slice(0, MAX_PRESENCE_IDS).filter((id) => typeof id === 'string')
      : [];
  const ids = raw
    .filter((id) => id.length > 0 && id.length <= MAX_ID_LENGTH)
    .slice(0, MAX_PRESENCE_IDS);
  const socketService = getSocketService();
  const result: Record<string, boolean> = {};
  for (const id of ids) {
    result[id] = socketService?.isUserOnline?.(id) ?? false;
  }
  res.json({ success: true, data: result });
});
