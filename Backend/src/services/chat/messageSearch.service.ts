import { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { normalizeForSearch } from '../../utils/messageSearchContent';
import { MessageService } from './message.service';
import { USER_SELECT_FIELDS } from '../../utils/constants';

const BATCH_MULTIPLIER = 3;
const BUGS_LIMIT = 10;

export interface SearchResult {
  message: any;
  context: any;
  relevanceScore?: number;
}

export interface SearchMessagesResult {
  messages: SearchResult[];
  gameMessages: SearchResult[];
  channelMessages: SearchResult[];
  bugMessages: SearchResult[];
  marketMessages: SearchResult[];
  messagesPagination: { page: number; limit: number; hasMore: boolean };
  gamePagination: { page: number; limit: number; hasMore: boolean };
  channelPagination: { page: number; limit: number; hasMore: boolean };
  bugsPagination: { page: number; limit: number; hasMore: boolean };
  marketPagination: { page: number; limit: number; hasMore: boolean };
}

type SectionFilter = 'messages' | 'games' | 'channels' | 'bugs' | 'market';

function buildSectionCondition(filter: SectionFilter): Prisma.Sql {
  if (filter === 'bugs') {
    return Prisma.sql`AND m."chatContextType" = 'GROUP' AND EXISTS (SELECT 1 FROM "GroupChannel" gc WHERE gc.id = m."contextId" AND gc."bugId" IS NOT NULL)`;
  }
  if (filter === 'channels') {
    return Prisma.sql`AND m."chatContextType" = 'GROUP' AND EXISTS (SELECT 1 FROM "GroupChannel" gc WHERE gc.id = m."contextId" AND gc."isChannel" = true AND gc."bugId" IS NULL AND gc."marketItemId" IS NULL)`;
  }
  if (filter === 'market') {
    return Prisma.sql`AND m."chatContextType" = 'GROUP' AND EXISTS (SELECT 1 FROM "GroupChannel" gc WHERE gc.id = m."contextId" AND gc."marketItemId" IS NOT NULL)`;
  }
  if (filter === 'games') {
    return Prisma.sql`AND m."chatContextType" = 'GAME'`;
  }
  return Prisma.sql`AND m."chatContextType" IN ('USER', 'GROUP') AND NOT EXISTS (SELECT 1 FROM "GroupChannel" gc WHERE gc.id = m."contextId" AND gc."isChannel" = true)`;
}

async function searchSection(
  userId: string,
  normalizedQuery: string,
  filter: SectionFilter,
  page: number,
  limit: number,
  accessCache: Map<string, boolean>,
  channelCache: Map<string, boolean>
): Promise<{ results: SearchResult[]; hasMore: boolean }> {
  const sectionCondition = buildSectionCondition(filter);
  const skipCount = (page - 1) * limit;
  const fetchSize = limit * BATCH_MULTIPLIER;
  const results: SearchResult[] = [];
  let offset = 0;
  let skipped = 0;

  const baseCondition = Prisma.sql`
    WHERE m."contentSearchable" IS NOT NULL AND m."contentSearchable" != ''
      AND m."contentSearchable" %> ${normalizedQuery}
      AND NOT (
        m."chatContextType" = 'GAME'
        AND EXISTS (
          SELECT 1 FROM "Game" g
          WHERE g.id = m."contextId"
            AND g."isPublic" = false
            AND NOT EXISTS (SELECT 1 FROM "GameParticipant" gp WHERE gp."gameId" = g.id AND gp."userId" = ${userId})
            AND (g."parentId" IS NULL OR NOT EXISTS (
              SELECT 1 FROM "GameParticipant" gp2
              WHERE gp2."gameId" = g."parentId" AND gp2."userId" = ${userId}
                AND gp2.role IN ('OWNER', 'ADMIN', 'PARTICIPANT')
            ))
        )
      )
      ${sectionCondition}
  `;

  while (results.length < limit) {
    const batch = await prisma.$queryRaw<
      Array<{ id: string; relevanceScore: number; createdAt: Date }>
    >(Prisma.sql`
      SELECT m.id, word_similarity(m."contentSearchable", ${normalizedQuery}) as "relevanceScore", m."createdAt"
      FROM "ChatMessage" m
      ${baseCondition}
      ORDER BY word_similarity(m."contentSearchable", ${normalizedQuery}) DESC, m."createdAt" DESC
      LIMIT ${fetchSize} OFFSET ${offset}
    `);

    if (batch.length === 0) break;

    const messageIds = batch.map((r) => r.id);
    const messages = await prisma.chatMessage.findMany({
      where: { id: { in: messageIds } },
      include: MessageService.getMessageInclude()
    });
    const messageMap = new Map(messages.map((m) => [m.id, m]));
    const scoreMap = new Map(batch.map((r) => [r.id, r.relevanceScore]));

    for (const row of batch) {
      if (results.length >= limit) break;
      const message = messageMap.get(row.id);
      if (!message) continue;

      const cacheKey = `${message.chatContextType}:${message.contextId}:${message.chatType ?? ''}`;
      let hasAccess = accessCache.get(cacheKey);
      if (hasAccess === undefined) {
        if (message.chatContextType === 'GROUP') {
          let isChannel = channelCache.get(message.contextId);
          if (isChannel === undefined) {
            const gc = await prisma.groupChannel.findUnique({
              where: { id: message.contextId },
              select: { isChannel: true }
            });
            isChannel = gc?.isChannel ?? false;
            channelCache.set(message.contextId, isChannel);
          }
          if (isChannel) {
            hasAccess = true;
          } else {
            try {
              await MessageService.validateMessageAccess(message, userId, false);
              hasAccess = true;
            } catch {
              hasAccess = false;
            }
          }
        } else {
          try {
            await MessageService.validateMessageAccess(message, userId, false);
            hasAccess = true;
          } catch {
            hasAccess = false;
          }
        }
        accessCache.set(cacheKey, hasAccess);
      }
      if (!hasAccess) continue;

      if (skipped < skipCount) {
        skipped++;
        continue;
      }

      results.push({
        message,
        context: null,
        relevanceScore: scoreMap.get(row.id)
      });
    }

    if (batch.length < fetchSize) break;
    offset += batch.length;
  }

  return { results, hasMore: results.length === limit };
}

async function loadContextsAndEnrich(
  results: SearchResult[],
  userId: string
): Promise<SearchResult[]> {
  const contextKeys = new Map<string, { type: string; id: string }>();
  for (const r of results) {
    const key = `${r.message.chatContextType}:${r.message.contextId}`;
    if (!contextKeys.has(key)) {
      contextKeys.set(key, { type: r.message.chatContextType, id: r.message.contextId });
    }
    if (r.message.chatContextType === 'GAME' && (r.message as any).gameId && (r.message as any).gameId !== r.message.contextId) {
      const gameKey = `GAME:${(r.message as any).gameId}`;
      if (!contextKeys.has(gameKey)) {
        contextKeys.set(gameKey, { type: 'GAME', id: (r.message as any).gameId });
      }
    }
  }

  const contextMap = await MessageSearchService.loadContexts(
    Array.from(contextKeys.values()),
    userId
  );

  for (const r of results) {
    const key = `${r.message.chatContextType}:${r.message.contextId}`;
    let ctx = contextMap.get(key) ?? null;
    if (r.message.chatContextType === 'GAME' && !ctx && (r.message as any).gameId) {
      ctx = contextMap.get(`GAME:${(r.message as any).gameId}`) ?? null;
    }
    r.context = ctx;
    if (r.message.chatContextType === 'GAME' && ctx) {
      const et = (ctx as { entityType?: string }).entityType;
      (r as any).gameEntityType = et ?? 'GAME';
    }
  }

  return results.map((r) => {
    const item: any = {
      message: r.message,
      context: r.context,
      relevanceScore: r.relevanceScore
    };
    if (r.message.chatContextType === 'GAME') {
      const et = (r as any).gameEntityType ?? (r.context as { entityType?: string } | null)?.entityType;
      const etStr = et != null ? String(et) : null;
      if (etStr) {
        item.gameEntityType = etStr;
        item.message = { ...r.message, gameEntityType: etStr };
      }
    }
    return item;
  });
}

export class MessageSearchService {
  static async search(
    userId: string,
    query: string,
    options: {
      section?: 'messages' | 'games' | 'channels' | 'bugs' | 'market';
      messagesPage?: number;
      messagesLimit?: number;
      gamePage?: number;
      gameLimit?: number;
      bugsPage?: number;
      channelPage?: number;
      channelLimit?: number;
      marketPage?: number;
      marketLimit?: number;
    } = {}
  ): Promise<SearchMessagesResult> {
    const section = options.section;
    const messagesPage = Math.max(1, options.messagesPage ?? 1);
    const messagesLimit = Math.min(50, Math.max(1, options.messagesLimit ?? 20));
    const gamePage = Math.max(1, options.gamePage ?? 1);
    const gameLimit = Math.min(50, Math.max(1, options.gameLimit ?? 20));
    const bugsPage = Math.max(1, options.bugsPage ?? 1);
    const channelPage = Math.max(1, options.channelPage ?? 1);
    const channelLimit = Math.min(50, Math.max(1, options.channelLimit ?? 20));
    const marketPage = Math.max(1, options.marketPage ?? 1);
    const marketLimit = Math.min(50, Math.max(1, options.marketLimit ?? 20));

    const emptyResult = (): SearchMessagesResult => ({
      messages: [],
      gameMessages: [],
      channelMessages: [],
      bugMessages: [],
      marketMessages: [],
      messagesPagination: { page: messagesPage, limit: messagesLimit, hasMore: false },
      gamePagination: { page: gamePage, limit: gameLimit, hasMore: false },
      channelPagination: { page: channelPage, limit: channelLimit, hasMore: false },
      bugsPagination: { page: bugsPage, limit: BUGS_LIMIT, hasMore: false },
      marketPagination: { page: marketPage, limit: marketLimit, hasMore: false }
    });

    const normalizedQuery = normalizeForSearch(query);
    if (!normalizedQuery) return emptyResult();

    const accessCache = new Map<string, boolean>();
    const channelCache = new Map<string, boolean>();

    const runSection = async (s: SectionFilter, page: number, limit: number) => {
      const { results, hasMore } = await searchSection(userId, normalizedQuery, s, page, limit, accessCache, channelCache);
      return { items: await loadContextsAndEnrich(results, userId), hasMore };
    };

    if (section === 'messages') {
      const { items, hasMore } = await runSection('messages', messagesPage, messagesLimit);
      return {
        ...emptyResult(),
        messages: items,
        messagesPagination: { page: messagesPage, limit: messagesLimit, hasMore }
      };
    }
    if (section === 'games') {
      const { items, hasMore } = await runSection('games', gamePage, gameLimit);
      return {
        ...emptyResult(),
        gameMessages: items,
        gamePagination: { page: gamePage, limit: gameLimit, hasMore }
      };
    }
    if (section === 'channels') {
      const { items, hasMore } = await runSection('channels', channelPage, channelLimit);
      return {
        ...emptyResult(),
        channelMessages: items,
        channelPagination: { page: channelPage, limit: channelLimit, hasMore }
      };
    }
    if (section === 'bugs') {
      const { items, hasMore } = await runSection('bugs', bugsPage, BUGS_LIMIT);
      return {
        ...emptyResult(),
        bugMessages: items,
        bugsPagination: { page: bugsPage, limit: BUGS_LIMIT, hasMore }
      };
    }
    if (section === 'market') {
      const { items, hasMore } = await runSection('market', marketPage, marketLimit);
      return {
        ...emptyResult(),
        marketMessages: items,
        marketPagination: { page: marketPage, limit: marketLimit, hasMore }
      };
    }

    const [messagesResult, gameResult, channelResult, bugsResult, marketResult] = await Promise.all([
      searchSection(userId, normalizedQuery, 'messages', 1, messagesLimit, accessCache, channelCache),
      searchSection(userId, normalizedQuery, 'games', 1, gameLimit, accessCache, channelCache),
      searchSection(userId, normalizedQuery, 'channels', 1, channelLimit, accessCache, channelCache),
      searchSection(userId, normalizedQuery, 'bugs', 1, BUGS_LIMIT, accessCache, channelCache),
      searchSection(userId, normalizedQuery, 'market', 1, marketLimit, accessCache, channelCache)
    ]);

    const [messages, gameMessages, channelMessages, bugMessages, marketMessages] = await Promise.all([
      loadContextsAndEnrich(messagesResult.results, userId),
      loadContextsAndEnrich(gameResult.results, userId),
      loadContextsAndEnrich(channelResult.results, userId),
      loadContextsAndEnrich(bugsResult.results, userId),
      loadContextsAndEnrich(marketResult.results, userId)
    ]);

    return {
      messages,
      gameMessages,
      channelMessages,
      bugMessages,
      marketMessages,
      messagesPagination: { page: 1, limit: messagesLimit, hasMore: messagesResult.hasMore },
      gamePagination: { page: 1, limit: gameLimit, hasMore: gameResult.hasMore },
      channelPagination: { page: 1, limit: channelLimit, hasMore: channelResult.hasMore },
      bugsPagination: { page: 1, limit: BUGS_LIMIT, hasMore: bugsResult.hasMore },
      marketPagination: { page: 1, limit: marketLimit, hasMore: marketResult.hasMore }
    };
  }

  static async loadContexts(
    keys: Array<{ type: string; id: string }>,
    _userId: string
  ): Promise<Map<string, any>> {
    const result = new Map<string, any>();
    const byType = { GAME: [] as string[], USER: [] as string[], BUG: [] as string[], GROUP: [] as string[] };
    for (const k of keys) {
      if (byType[k.type as keyof typeof byType]) {
        byType[k.type as keyof typeof byType].push(k.id);
      }
    }

    if (byType.GAME.length > 0) {
      const games = await prisma.game.findMany({
        where: { id: { in: byType.GAME } },
        select: {
          id: true,
          name: true,
          entityType: true,
          status: true,
          startTime: true,
          endTime: true,
          timeIsSet: true,
          club: { select: { name: true } },
          court: { select: { name: true } },
          city: { select: { name: true } },
          participants: {
            take: 4,
            select: { user: { select: USER_SELECT_FIELDS } }
          }
        }
      });
      for (const g of games) {
        result.set(`GAME:${g.id}`, {
          id: g.id,
          name: g.name,
          entityType: String(g.entityType),
          status: g.status,
          startTime: g.startTime,
          endTime: g.endTime,
          timeIsSet: g.timeIsSet,
          club: g.club,
          court: g.court,
          city: g.city,
          participants: g.participants
        });
      }
    }

    if (byType.USER.length > 0) {
      const userChats = await prisma.userChat.findMany({
        where: { id: { in: byType.USER } },
        include: {
          user1: { select: USER_SELECT_FIELDS },
          user2: { select: USER_SELECT_FIELDS }
        }
      });
      for (const uc of userChats) {
        result.set(`USER:${uc.id}`, uc);
      }
    }

    if (byType.GROUP.length > 0) {
      const groups = await prisma.groupChannel.findMany({
        where: { id: { in: byType.GROUP } },
        include: { bug: { include: { sender: { select: USER_SELECT_FIELDS } } } }
      });
      for (const gc of groups) {
        result.set(`GROUP:${gc.id}`, {
          id: gc.id,
          name: gc.name,
          avatar: gc.avatar,
          isChannel: gc.isChannel,
          isPublic: gc.isPublic,
          bug: gc.bug,
          marketItemId: gc.marketItemId
        });
      }
    }

    return result;
  }
}
