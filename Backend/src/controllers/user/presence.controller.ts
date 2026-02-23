import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest } from '../../middleware/auth';
import prisma from '../../config/database';

const getSocketService = () => (global as any).socketService;

const MAX_PRESENCE_IDS = 3000;
const MAX_ID_LENGTH = 64;

export const getPresence = asyncHandler(async (req: AuthRequest, res: Response) => {
  const result: Record<string, boolean> = {};
  if (req.userId) {
    const viewer = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { showOnlineStatus: true },
    });
    if (viewer?.showOnlineStatus === false) {
      return res.json({ success: true, data: result });
    }
  }
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
  if (ids.length === 0) {
    return res.json({ success: true, data: result });
  }
  const showStatus = await prisma.user.findMany({
    where: { id: { in: ids } },
    select: { id: true, showOnlineStatus: true },
  });
  const showStatusById = new Map(showStatus.map((u) => [u.id, u.showOnlineStatus]));
  for (const id of ids) {
    const visible = showStatusById.get(id) !== false;
    const online = socketService?.isUserOnline?.(id) ?? false;
    result[id] = visible && online;
  }
  res.json({ success: true, data: result });
});
