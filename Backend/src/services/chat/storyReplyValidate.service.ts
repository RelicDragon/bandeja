import { StorySourceType, type Prisma } from '@prisma/client';
import { resolveVisibleSegment } from '../storyEngagement/storyEngagement.permissions';
import { validateStoryReplyForUserChat } from './storyReplySanitize';

export async function validateStoryReplyForUserChatMessage(
  raw: unknown,
  senderId: string,
  userChat: { user1Id: string; user2Id: string }
): Promise<Prisma.JsonObject> {
  const sanitized = validateStoryReplyForUserChat(raw, senderId, userChat);
  await resolveVisibleSegment(senderId, {
    sourceType: sanitized.sourceType as StorySourceType,
    sourceId: sanitized.sourceId as string,
    ownerUserId: sanitized.ownerUserId as string,
  });
  return sanitized;
}
