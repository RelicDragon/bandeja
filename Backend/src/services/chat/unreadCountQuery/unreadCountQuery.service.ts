import { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { ChatMuteService } from '../chatMute.service';
import { ReadReceiptService } from '../readReceipt.service';
import { UnreadObjectsService } from '../unreadObjects.service';
import { computeTotals } from '@bandeja/unread-contract';
import {
  buildByContextFromUnreadObjects,
  buildGroupChannelMeta,
  type ContextKey,
  type UnreadSnapshotDto,
} from '../unreadSnapshot.service';
import { batchGameUnreadCounts } from './batchGameCounts';
import { buildCountsByContext } from './countsByContext';
import type {
  CountsByContextResult,
  SlimUnreadSnapshotDto,
  UnreadSnapshotShape,
  UnreadTotalsResult,
} from './types';

async function fetchContextRevisions(
  userId: string,
  contextKeys: ContextKey[]
): Promise<Record<ContextKey, number>> {
  if (contextKeys.length === 0) return {};

  const rows = await prisma.userContextUnreadState.findMany({
    where: {
      userId,
      contextKey: { in: contextKeys },
    },
    select: { contextKey: true, unreadRevision: true },
  });

  const revisions: Record<ContextKey, number> = {};
  for (const row of rows) {
    revisions[row.contextKey as ContextKey] = row.unreadRevision;
  }
  return revisions;
}

async function fetchUserUnreadRevision(userId: string): Promise<number> {
  const row = await prisma.userUnreadState.findUnique({
    where: { userId },
    select: { unreadRevision: true },
  });
  return row?.unreadRevision ?? 0;
}

async function getScopedGameTotals(
  userId: string
): Promise<Pick<import('../unreadSnapshot.service').UnreadTotals, 'myGames' | 'pastGames'>> {
  const unreadContexts = await prisma.$queryRaw<Array<{ contextId: string }>>(
    Prisma.sql`
      SELECT DISTINCT m."contextId"
      FROM "ChatMessage" m
      WHERE m."chatContextType" = 'GAME'::"ChatContextType"
        AND m."deletedAt" IS NULL
        AND m."senderId" IS NOT NULL
        AND m."senderId" <> ${userId}
        AND NOT EXISTS (
          SELECT 1 FROM "MessageReadReceipt" r
          WHERE r."messageId" = m.id AND r."userId" = ${userId}
        )
        AND NOT EXISTS (
          SELECT 1 FROM "ChatReadCursor" c
          WHERE c."userId" = ${userId}
            AND c."chatContextType" = m."chatContextType"
            AND c."contextId" = m."contextId"
            AND c."chatType" = m."chatType"
            AND (
              COALESCE(m."serverSyncSeq", -1) < c."readMaxServerSyncSeq"
              OR (
                COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
                AND m."createdAt" < c."readMaxCreatedAt"
              )
              OR (
                COALESCE(m."serverSyncSeq", -1) = c."readMaxServerSyncSeq"
                AND m."createdAt" = c."readMaxCreatedAt"
                AND m."id" <= c."readMaxMessageId"
              )
            )
        )
    `
  );

  const gameIds = unreadContexts.map((row) => row.contextId).filter(Boolean);
  if (gameIds.length === 0) return { myGames: 0, pastGames: 0 };

  const games = await prisma.game.findMany({
    where: {
      id: { in: gameIds },
      participants: { some: { userId } },
    },
    select: {
      id: true,
      status: true,
      startTime: true,
      participants: {
        where: { userId },
        select: { status: true, role: true },
      },
    },
  });
  if (games.length === 0) return { myGames: 0, pastGames: 0 };

  const unreadCounts = await ReadReceiptService.getGamesUnreadCountsFromGames(
    games.map((game) => ({
      id: game.id,
      status: String(game.status),
      participants: game.participants.map((participant) => ({
        status: String(participant.status),
        role: String(participant.role),
      })),
    })),
    userId
  );

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  let myGames = 0;
  let pastGames = 0;
  for (const game of games) {
    const count = unreadCounts[game.id] ?? 0;
    if (count <= 0) continue;
    if (game.status === 'ARCHIVED' && game.startTime < today) {
      pastGames += count;
    } else {
      myGames += count;
    }
  }
  return { myGames, pastGames };
}

async function buildSlimSnapshot(userId: string): Promise<SlimUnreadSnapshotDto> {
  const [counts, mutedChats, scopedGameTotals, userUnreadRevision] = await Promise.all([
    buildCountsByContext(userId),
    ChatMuteService.getMutedChats(userId, 'GROUP'),
    getScopedGameTotals(userId),
    fetchUserUnreadRevision(userId),
  ]);

  const mutedGroupIds = new Set(
    mutedChats
      .map((mute) => mute.contextId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const contextKeys = Object.keys(counts.byContext) as ContextKey[];
  const contextRevisions = await fetchContextRevisions(userId, contextKeys);

  const totals = computeTotals(counts.byContext, {
    groupChannelMeta: counts.groupChannelMeta,
    mutedGroupIds,
  });
  totals.myGames = scopedGameTotals.myGames;
  totals.pastGames = scopedGameTotals.pastGames;

  return {
    version: userUnreadRevision > 0 ? userUnreadRevision : Date.now(),
    clock: { userUnreadRevision },
    contextRevisions,
    byContext: counts.byContext,
    totals,
    mutedGroupIds: [...mutedGroupIds],
    groupChannelMeta: counts.groupChannelMeta,
    games: [],
    userChats: [],
    bugs: [],
    groupChannels: [],
    marketItems: [],
  };
}

async function buildObjectsSnapshot(userId: string): Promise<UnreadSnapshotDto> {
  const [objects, mutedChats, scopedGameTotals, userUnreadRevision] = await Promise.all([
    UnreadObjectsService.getUnreadObjects(userId),
    ChatMuteService.getMutedChats(userId, 'GROUP'),
    getScopedGameTotals(userId),
    fetchUserUnreadRevision(userId),
  ]);

  const mutedGroupIds = new Set(
    mutedChats
      .map((mute) => mute.contextId)
      .filter((id): id is string => typeof id === 'string' && id.length > 0)
  );

  const byContext = buildByContextFromUnreadObjects(objects);
  const groupChannelMeta = buildGroupChannelMeta(objects);
  const contextKeys = Object.keys(byContext) as ContextKey[];
  const contextRevisions = await fetchContextRevisions(userId, contextKeys);

  const totals = computeTotals(byContext, {
    groupChannelMeta,
    mutedGroupIds,
  });
  totals.myGames = scopedGameTotals.myGames;
  totals.pastGames = scopedGameTotals.pastGames;

  return {
    ...objects,
    version: userUnreadRevision > 0 ? userUnreadRevision : Date.now(),
    clock: { userUnreadRevision },
    contextRevisions,
    totals,
    byContext,
    mutedGroupIds: [...mutedGroupIds],
    groupChannelMeta,
  };
}

export class UnreadCountQuery {
  static async getCountsByContext(userId: string): Promise<CountsByContextResult> {
    return buildCountsByContext(userId);
  }

  static async batchGameCounts(userId: string, gameIds: string[]): Promise<Record<string, number>> {
    return batchGameUnreadCounts(userId, gameIds);
  }

  static async getSnapshot(
    userId: string,
    shape: UnreadSnapshotShape = 'counts'
  ): Promise<UnreadSnapshotDto | SlimUnreadSnapshotDto> {
    if (shape === 'objects') {
      return buildObjectsSnapshot(userId);
    }
    return buildSlimSnapshot(userId);
  }

  static async getTotals(userId: string): Promise<UnreadTotalsResult> {
    const [userUnreadRevision, mutedChats, counts] = await Promise.all([
      fetchUserUnreadRevision(userId),
      ChatMuteService.getMutedChats(userId, 'GROUP'),
      buildCountsByContext(userId),
    ]);

    const mutedGroupIds = new Set(
      mutedChats
        .map((mute) => mute.contextId)
        .filter((id): id is string => typeof id === 'string' && id.length > 0)
    );

    const totals = computeTotals(counts.byContext, {
      groupChannelMeta: counts.groupChannelMeta,
      mutedGroupIds,
    });

    return {
      total: totals.all,
      userUnreadRevision,
    };
  }
}
