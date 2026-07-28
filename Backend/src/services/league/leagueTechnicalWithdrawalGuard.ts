import { Prisma } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';

export function gameMetadataIsTechnicalWithdrawal(metadata: unknown): boolean {
  if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) return false;
  return Boolean((metadata as Record<string, unknown>).technicalWithdrawal);
}

/** Block undo / recalculate / delete of neutral technical withdrawal fixtures. */
export async function assertGameNotLockedTechnicalWithdrawal(
  gameId: string,
  tx: Prisma.TransactionClient | typeof import('../../config/database').default
): Promise<void> {
  const game = await tx.game.findUnique({
    where: { id: gameId },
    select: { metadata: true },
  });
  if (gameMetadataIsTechnicalWithdrawal(game?.metadata)) {
    throw new ApiError(
      409,
      'Technical withdrawal results cannot be edited or cleared'
    );
  }
}
