import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { DEFAULT_REACTION_EMOJI_SEED } from '../../utils/defaultReactionEmojiSeed';

export type ReactionEmojiUsageItem = {
  emoji: string;
  count: number;
  lastUsedAt: string | null;
};

export type ReactionEmojiUsageTouched = {
  emoji: string;
  count: number;
  lastUsedAt: string;
};

export class UserReactionEmojiUsageService {
  static async recordUseIfChanged(
    tx: Prisma.TransactionClient,
    params: { userId: string; emoji: string; previousEmoji: string | null }
  ): Promise<{ version: number; touched: ReactionEmojiUsageTouched | null }> {
    const { userId, emoji, previousEmoji } = params;
    if (previousEmoji !== null && previousEmoji === emoji) {
      const u = await tx.user.findUniqueOrThrow({
        where: { id: userId },
        select: { reactionEmojiUsageVersion: true },
      });
      return { version: u.reactionEmojiUsageVersion, touched: null };
    }

    await tx.userReactionEmojiStat.upsert({
      where: { userId_emoji: { userId, emoji } },
      create: {
        userId,
        emoji,
        count: 1,
        lastUsedAt: new Date(),
      },
      update: {
        count: { increment: 1 },
        lastUsedAt: new Date(),
      },
    });

    const updatedUser = await tx.user.update({
      where: { id: userId },
      data: { reactionEmojiUsageVersion: { increment: 1 } },
      select: { reactionEmojiUsageVersion: true },
    });

    const row = await tx.userReactionEmojiStat.findUnique({
      where: { userId_emoji: { userId, emoji } },
    });
    if (!row) {
      return { version: updatedUser.reactionEmojiUsageVersion, touched: null };
    }
    return {
      version: updatedUser.reactionEmojiUsageVersion,
      touched: {
        emoji: row.emoji,
        count: row.count,
        lastUsedAt: row.lastUsedAt.toISOString(),
      },
    };
  }

  static mergeWithSeed(
    dbRows: { emoji: string; count: number; lastUsedAt: Date }[]
  ): ReactionEmojiUsageItem[] {
    const byEmoji = new Map<string, ReactionEmojiUsageItem>();
    for (const r of dbRows) {
      byEmoji.set(r.emoji, {
        emoji: r.emoji,
        count: r.count,
        lastUsedAt: r.lastUsedAt.toISOString(),
      });
    }
    for (const e of DEFAULT_REACTION_EMOJI_SEED) {
      if (!byEmoji.has(e)) {
        byEmoji.set(e, { emoji: e, count: 1, lastUsedAt: null });
      }
    }
    return [...byEmoji.values()];
  }

  static async getMergedForUser(
    userId: string,
    sinceVersion?: number
  ): Promise<
    | { version: number; items: ReactionEmojiUsageItem[]; unchanged: false }
    | { version: number; items: []; unchanged: true }
  > {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { reactionEmojiUsageVersion: true },
    });
    if (!user) {
      throw new Error('User not found');
    }
    if (sinceVersion != null && user.reactionEmojiUsageVersion <= sinceVersion) {
      return { version: user.reactionEmojiUsageVersion, items: [], unchanged: true };
    }
    const rows = await prisma.userReactionEmojiStat.findMany({
      where: { userId },
      select: { emoji: true, count: true, lastUsedAt: true },
    });
    return {
      version: user.reactionEmojiUsageVersion,
      items: this.mergeWithSeed(rows),
      unchanged: false,
    };
  }
}
