import type { Response, NextFunction } from 'express';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import type { AuthRequest } from '../../middleware/auth';

/** Mirrors the signed-in direct-link visibility rules of GameReadService.getGameById. */
export async function assertCanReadGameFaq(gameId: string, userId: string | undefined, isAdmin: boolean): Promise<void> {
    if (!userId) throw new ApiError(401, 'User not authenticated');
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { cityId: true, entityType: true, eventApprovalStatus: true, participants: { where: { userId, role: 'OWNER' }, select: { id: true } } },
    });
    if (!game) throw new ApiError(404, 'Game not found');
    if (game.cityId === null && !isAdmin) throw new ApiError(403, 'Access denied: System games are not accessible');
    if (game.entityType === 'EVENT' && game.eventApprovalStatus !== 'APPROVED' && !isAdmin && game.participants.length === 0) throw new ApiError(404, 'Game not found');
}

export async function canReadGameFaq(req: AuthRequest, _res: Response, next: NextFunction): Promise<void> {
  try {
    await assertCanReadGameFaq(req.params.gameId, req.userId, req.user?.isAdmin || false);
    next();
  } catch (error) { next(error); }
}
