import prisma from '../../config/database';

export type GameChatContextStatus = 'active' | 'cancelled' | 'missing';

export class GameChatContextService {
  static async resolve(gameId: string): Promise<GameChatContextStatus> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (game) return 'active';

    const cancelled = await prisma.cancelledGame.findUnique({
      where: { id: gameId },
      select: { id: true },
    });
    if (cancelled) return 'cancelled';

    return 'missing';
  }

  static async filterExistingGameIds(gameIds: readonly string[]): Promise<{
    activeIds: Set<string>;
    cancelledIds: Set<string>;
    missingIds: string[];
  }> {
    if (gameIds.length === 0) {
      return { activeIds: new Set(), cancelledIds: new Set(), missingIds: [] };
    }
    const ids = [...new Set(gameIds)];
    const [games, cancelled] = await Promise.all([
      prisma.game.findMany({ where: { id: { in: ids } }, select: { id: true } }),
      prisma.cancelledGame.findMany({ where: { id: { in: ids } }, select: { id: true } }),
    ]);
    const activeIds = new Set(games.map((g) => g.id));
    const cancelledIds = new Set(cancelled.map((c) => c.id));
    const missingIds = ids.filter((id) => !activeIds.has(id) && !cancelledIds.has(id));
    return { activeIds, cancelledIds, missingIds };
  }
}
