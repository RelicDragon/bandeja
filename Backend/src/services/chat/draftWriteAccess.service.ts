import { ChatContextType } from '@prisma/client';
import { ApiError } from '../../utils/ApiError';
import { MessageService } from './message.service';
import { GameChatViewerAccessService } from './gameChatViewerAccess.service';

export async function assertDraftWriteAccess(
  userId: string,
  chatContextType: ChatContextType,
  contextId: string
): Promise<void> {
  try {
    if (chatContextType === 'GAME') {
      await GameChatViewerAccessService.assertWritable(contextId, userId);
      return;
    }
    if (chatContextType === 'USER') {
      await MessageService.validateUserChatAccess(contextId, userId);
      return;
    }
    if (chatContextType === 'GROUP') {
      await MessageService.validateGroupChannelAccess(contextId, userId);
      return;
    }
    if (chatContextType === 'BUG') {
      await MessageService.validateBugAccess(contextId, userId);
    }
  } catch (error) {
    if (error instanceof ApiError && error.statusCode === 403 && error.data?.code === 'chat.threadArchived') {
      throw error;
    }
    throw new ApiError(403, 'Access denied to this context');
  }
}

export async function assertDraftDeleteAccess(
  userId: string,
  chatContextType: ChatContextType,
  contextId: string
): Promise<void> {
  if (chatContextType !== 'GAME') {
    return;
  }

  const access = await GameChatViewerAccessService.resolve(contextId, userId);
  if (!access || access.lifecycle === 'active') {
    return;
  }
  if (!access.isParticipant) {
    throw new ApiError(403, 'Access denied to this context');
  }
  throw new ApiError(403, 'This chat is archived', true, { code: 'chat.threadArchived' });
}
