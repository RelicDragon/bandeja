import { StorySourceType } from '@prisma/client';
import prisma from '../../config/database';
import notificationService from '../notification.service';
import { formatUserName } from '../shared/notification-base';
import { NotificationType } from '../../types/notifications.types';

type ThrottleEntry = { sentAt: number; count: number };

const likeThrottle = new Map<string, ThrottleEntry>();
const commentThrottle = new Map<string, ThrottleEntry>();
const replyThrottle = new Map<string, ThrottleEntry>();

function shouldThrottle(
  map: Map<string, ThrottleEntry>,
  key: string,
  windowMs: number
): boolean {
  const now = Date.now();
  const entry = map.get(key);
  if (!entry || now - entry.sentAt >= windowMs) {
    map.set(key, { sentAt: now, count: 1 });
    return false;
  }
  entry.count += 1;
  return true;
}

async function loadActorName(actorId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: actorId },
    select: { firstName: true, lastName: true },
  });
  return user ? formatUserName(user) : 'Someone';
}

async function sendPush(
  recipientId: string,
  type: NotificationType,
  title: string,
  body: string,
  data: Record<string, string>
): Promise<void> {
  await notificationService.sendNotification({
    userId: recipientId,
    type,
    payload: { type, title, body, data, sound: 'default' },
    preferPush: true,
  });
}

export async function notifyStoryLiked(opts: {
  actorId: string;
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
  likeCount: number;
}): Promise<void> {
  const { actorId, ownerUserId, sourceType, sourceId, likeCount } = opts;
  if (actorId === ownerUserId) return;

  const dayKey = `${ownerUserId}:${sourceType}:${sourceId}:${actorId}`;
  if (shouldThrottle(likeThrottle, dayKey, 24 * 60 * 60 * 1000)) return;

  const hourKey = `${ownerUserId}:${sourceType}:${sourceId}:hour`;
  const hourEntry = likeThrottle.get(hourKey);
  const now = Date.now();
  if (!hourEntry || now - hourEntry.sentAt >= 60 * 60 * 1000) {
    likeThrottle.set(hourKey, { sentAt: now, count: 1 });
  } else {
    hourEntry.count += 1;
    if (hourEntry.count > 3) {
      await sendPush(
        ownerUserId,
        NotificationType.USER_CHAT,
        'Your story',
        `${hourEntry.count} people liked your story`,
        { sourceType, sourceId, ownerUserId }
      );
      likeThrottle.delete(hourKey);
      return;
    }
  }

  const actorName = await loadActorName(actorId);
  await sendPush(
    ownerUserId,
    NotificationType.USER_CHAT,
    actorName,
    likeCount > 1 ? `${actorName} liked your story` : `${actorName} liked your story`,
    { sourceType, sourceId, ownerUserId, userId: actorId }
  );
}

export async function notifyStoryComment(opts: {
  actorId: string;
  ownerUserId: string;
  sourceType: StorySourceType;
  sourceId: string;
}): Promise<void> {
  const { actorId, ownerUserId, sourceType, sourceId } = opts;
  if (actorId === ownerUserId) return;

  const key = `${ownerUserId}:${sourceType}:${sourceId}:${actorId}:comment`;
  if (shouldThrottle(commentThrottle, key, 5 * 60 * 1000)) return;

  const actorName = await loadActorName(actorId);
  await sendPush(
    ownerUserId,
    NotificationType.USER_CHAT,
    actorName,
    `${actorName} commented on your story`,
    { sourceType, sourceId, ownerUserId, userId: actorId }
  );
}

export async function notifyStoryCommentReply(opts: {
  actorId: string;
  ownerUserId: string;
  parentAuthorId: string;
  sourceType: StorySourceType;
  sourceId: string;
  threadRootId: string;
}): Promise<void> {
  const { actorId, ownerUserId, parentAuthorId, sourceType, sourceId, threadRootId } = opts;
  const key = `${threadRootId}:${actorId}:reply`;
  if (shouldThrottle(replyThrottle, key, 5 * 60 * 1000)) return;

  const actorName = await loadActorName(actorId);
  const recipients = new Set<string>();
  if (parentAuthorId !== actorId) recipients.add(parentAuthorId);
  if (ownerUserId !== actorId && ownerUserId !== parentAuthorId) recipients.add(ownerUserId);

  for (const recipientId of recipients) {
    await sendPush(
      recipientId,
      NotificationType.USER_CHAT,
      actorName,
      `${actorName} replied to a comment`,
      { sourceType, sourceId, ownerUserId, userId: actorId, commentId: threadRootId }
    );
  }
}
