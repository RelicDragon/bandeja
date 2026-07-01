import prisma from '../../../config/database';
import { ReadReceiptService } from '../readReceipt.service';
import { UnreadCountBatchService } from '../unreadCountBatch.service';
import {
  type ContextKey,
  type GroupChannelMeta,
  toContextKey,
} from '../unreadSnapshot.service';
import { batchGameUnreadCountsForUser } from './batchGameCounts';
import type { CountsByContextResult } from './types';

async function fetchUserChatCounts(userId: string): Promise<Record<string, number>> {
  const chats = await prisma.userChat.findMany({
    where: { OR: [{ user1Id: userId }, { user2Id: userId }] },
    select: { id: true },
  });
  if (chats.length === 0) return {};
  return UnreadCountBatchService.getUnreadCountsByContext(
    'USER',
    chats.map((chat) => chat.id),
    userId
  );
}

async function fetchBugChannelIds(userId: string): Promise<string[]> {
  const groupChannels = await prisma.groupChannel.findMany({
    where: {
      isChannel: false,
      bugId: { not: null },
      bug: { status: { not: 'ARCHIVED' } },
      OR: [
        { participants: { some: { userId, hidden: false } } },
        { isPublic: true },
      ],
    },
    select: { id: true },
  });
  return groupChannels.map((channel) => channel.id);
}

async function fetchRegularGroupChannelIds(userId: string): Promise<string[]> {
  const channels = await prisma.groupChannel.findMany({
    where: {
      bugId: null,
      marketItemId: null,
      participants: { some: { userId, hidden: false } },
    },
    select: { id: true },
  });
  return channels.map((channel) => channel.id);
}

async function fetchMarketChannelIds(userId: string): Promise<string[]> {
  const channels = await prisma.groupChannel.findMany({
    where: {
      marketItemId: { not: null },
      participants: { some: { userId, hidden: false } },
    },
    select: { id: true },
  });
  return channels.map((channel) => channel.id);
}

async function fetchGroupChannelMeta(channelIds: string[]): Promise<Record<string, GroupChannelMeta>> {
  if (channelIds.length === 0) return {};

  const channels = await prisma.groupChannel.findMany({
    where: { id: { in: channelIds } },
    select: {
      id: true,
      isChannel: true,
      bugId: true,
      marketItemId: true,
      buyerId: true,
      marketItem: { select: { id: true, sellerId: true } },
    },
  });

  const meta: Record<string, GroupChannelMeta> = {};
  for (const channel of channels) {
    meta[channel.id] = {
      isChannel: channel.isChannel ?? false,
      bugId: channel.bugId ?? null,
      marketItemId: channel.marketItemId ?? channel.marketItem?.id ?? null,
      buyerId: channel.buyerId ?? null,
      sellerId: channel.marketItem?.sellerId ?? null,
    };
  }
  return meta;
}

export async function buildCountsByContext(userId: string): Promise<CountsByContextResult> {
  const [userChatMap, bugChannelIds, regularGroupIds, marketChannelIds, gameUnreadMap] =
    await Promise.all([
      fetchUserChatCounts(userId),
      fetchBugChannelIds(userId),
      fetchRegularGroupChannelIds(userId),
      fetchMarketChannelIds(userId),
      batchGameUnreadCountsForUser(userId),
    ]);

  const [bugUnreadMap, regularGroupMap, marketUnreadMap] = await Promise.all([
    bugChannelIds.length > 0
      ? ReadReceiptService.getGroupChannelsUnreadCounts(bugChannelIds, userId)
      : Promise.resolve({} as Record<string, number>),
    regularGroupIds.length > 0
      ? UnreadCountBatchService.getUnreadCountsByContext('GROUP', regularGroupIds, userId)
      : Promise.resolve({} as Record<string, number>),
    marketChannelIds.length > 0
      ? UnreadCountBatchService.getUnreadCountsByContext('GROUP', marketChannelIds, userId)
      : Promise.resolve({} as Record<string, number>),
  ]);

  const byContext: Record<ContextKey, number> = {};

  for (const [chatId, count] of Object.entries(userChatMap)) {
    if (count > 0) byContext[toContextKey('USER', chatId)] = count;
  }

  for (const [gameId, count] of Object.entries(gameUnreadMap)) {
    if (count > 0) byContext[toContextKey('GAME', gameId)] = count;
  }

  const groupUnreadChannelIds = new Set<string>();
  for (const [channelId, count] of Object.entries(bugUnreadMap)) {
    if (count > 0) {
      byContext[toContextKey('GROUP', channelId)] = count;
      groupUnreadChannelIds.add(channelId);
    }
  }
  for (const [channelId, count] of Object.entries(regularGroupMap)) {
    if (count > 0) {
      byContext[toContextKey('GROUP', channelId)] = count;
      groupUnreadChannelIds.add(channelId);
    }
  }
  for (const [channelId, count] of Object.entries(marketUnreadMap)) {
    if (count > 0) {
      byContext[toContextKey('GROUP', channelId)] = count;
      groupUnreadChannelIds.add(channelId);
    }
  }

  const groupChannelMeta = await fetchGroupChannelMeta([...groupUnreadChannelIds]);

  return { byContext, groupChannelMeta };
}
