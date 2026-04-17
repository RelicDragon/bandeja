import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from '../chat/message.service';
import { assertValidReactionEmoji, normalizeReactionEmoji } from '../../utils/validateReactionEmoji';
import { UserReactionEmojiUsageService } from '../user/userReactionEmojiUsage.service';

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

  static async addReaction(
    gameId: string,
    userId: string,
    emoji: string
  ): Promise<{
    reactions: GameReactionDto[];
    emojiUsage: Awaited<ReturnType<typeof UserReactionEmojiUsageService.recordUseIfChanged>>;
  }> {
    if (!emoji || typeof emoji !== 'string') {
      throw new ApiError(400, 'Emoji is required');
    }

    const { isParticipant } = await MessageService.validateGameAccess(gameId, userId);
    if (!isParticipant) {
      throw new ApiError(403, 'Access denied');
    }

    const normalizedEmoji = assertValidReactionEmoji(emoji);

    const emojiUsage = await prisma.$transaction(async (tx) => {
      const existing = await tx.gameReaction.findUnique({
        where: {
          gameId_userId: { gameId, userId },
        },
        select: { emoji: true },
      });
      const previousEmoji = existing?.emoji != null ? normalizeReactionEmoji(existing.emoji) : null;

      await tx.gameReaction.upsert({
        where: {
          gameId_userId: { gameId, userId },
        },
        create: { gameId, userId, emoji: normalizedEmoji },
        update: { emoji: normalizedEmoji },
      });

      return UserReactionEmojiUsageService.recordUseIfChanged(tx, {
        userId,
        emoji: normalizedEmoji,
        previousEmoji,
      });
    });

    const reactions = await this.listForGame(gameId);
    return { reactions, emojiUsage };
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
