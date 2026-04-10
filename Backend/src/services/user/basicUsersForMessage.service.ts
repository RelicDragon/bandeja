import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { USER_SELECT_FIELDS } from '../../utils/constants';
import { MessageService } from '../chat/message.service';
import {
  getAllowedSetFromCache,
  invalidateBasicUsersAllowedCacheForMessage,
  setAllowedSetCache,
} from './basicUsersForMessageAllowedCache';

export const MAX_BASIC_USERS_IDS_PER_REQUEST = 300;

async function loadUsersForFilteredIds(filtered: string[]) {
  if (filtered.length === 0) {
    return [];
  }
  return prisma.user.findMany({
    where: { id: { in: filtered } },
    select: USER_SELECT_FIELDS,
    orderBy: [{ firstName: 'asc' }, { lastName: 'asc' }],
  });
}

function filterRequestedToAllowed(requestedIds: string[], allowed: Set<string>) {
  return [...new Set(requestedIds.filter((id) => allowed.has(id)))]
    .sort()
    .slice(0, MAX_BASIC_USERS_IDS_PER_REQUEST);
}

export async function getBasicUsersForMessage(params: {
  messageId: string;
  requestedIds: string[];
  viewerUserId: string;
}) {
  const { messageId, requestedIds, viewerUserId } = params;

  const cachedAllowed = getAllowedSetFromCache(messageId, viewerUserId);
  if (cachedAllowed) {
    const alive = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { deletedAt: true },
    });
    if (!alive || alive.deletedAt) {
      invalidateBasicUsersAllowedCacheForMessage(messageId);
    } else {
      const filtered = filterRequestedToAllowed(requestedIds, cachedAllowed);
      return loadUsersForFilteredIds(filtered);
    }
  }

  const message = await prisma.chatMessage.findUnique({
    where: { id: messageId },
    select: {
      deletedAt: true,
      chatContextType: true,
      contextId: true,
      chatType: true,
      senderId: true,
      readReceipts: { select: { userId: true } },
      reactions: { select: { userId: true } },
    },
  });

  if (!message || message.deletedAt) {
    throw new ApiError(404, 'Message not found');
  }

  await MessageService.validateMessageAccess(message, viewerUserId);

  const allowed = new Set<string>();
  if (message.senderId) allowed.add(message.senderId);
  for (const r of message.readReceipts) allowed.add(r.userId);
  for (const r of message.reactions) allowed.add(r.userId);

  setAllowedSetCache(messageId, viewerUserId, allowed);

  const filtered = filterRequestedToAllowed(requestedIds, allowed);
  return loadUsersForFilteredIds(filtered);
}
