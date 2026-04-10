import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { isAllowedReactionEmoji } from '../../utils/allowedReactionEmojis';
import { MessageService } from '../chat/message.service';

export type GameReactionDto = { userId: string; emoji: string };

export async function fetchReactionsByGameIds(gameIds: string[]): Promise<Map<string, GameReactionDto[]>> {
  const map = new Map<string, GameReactionDto[]>();
  if (gameIds.length === 0) return map;
  const rows = await prisma.gameReaction.findMany({
    where: { gameId: { in: gameIds } },
    select: { gameId: true, userId: true, emoji: true },
  });
  for (const r of rows) {
    const list = map.get(r.gameId) ?? [];
    list.push({ userId: r.userId, emoji: r.emoji });
    map.set(r.gameId, list);
  }
  return map;
}

export function attachReactionsToGames<T extends { id: string }>(
  games: T[],
  reactionsMap: Map<string, GameReactionDto[]>
): (T & { reactions: GameReactionDto[] })[] {
  return games.map((g) => ({
    ...g,
    reactions: reactionsMap.get(g.id) ?? [],
  }));
}

export class GameReactionService {
  static async listForGame(gameId: string): Promise<GameReactionDto[]> {
    const rows = await prisma.gameReaction.findMany({
      where: { gameId },
      select: { userId: true, emoji: true },
    });
    return rows;
  }

  static async addReaction(gameId: string, userId: string, emoji: string): Promise<GameReactionDto[]> {
    if (!emoji || typeof emoji !== 'string') {
      throw new ApiError(400, 'Emoji is required');
    }
    if (!isAllowedReactionEmoji(emoji)) {
      throw new ApiError(400, 'Invalid reaction emoji');
    }

    const { isParticipant } = await MessageService.validateGameAccess(gameId, userId);
    if (!isParticipant) {
      throw new ApiError(403, 'Access denied');
    }

    await prisma.gameReaction.upsert({
      where: {
        gameId_userId: { gameId, userId },
      },
      create: { gameId, userId, emoji },
      update: { emoji },
    });

    return this.listForGame(gameId);
  }

  static async removeReaction(gameId: string, userId: string): Promise<GameReactionDto[]> {
    const { isParticipant } = await MessageService.validateGameAccess(gameId, userId);
    if (!isParticipant) {
      throw new ApiError(403, 'Access denied');
    }

    await prisma.gameReaction.deleteMany({
      where: { gameId, userId },
    });

    return this.listForGame(gameId);
  }
}
