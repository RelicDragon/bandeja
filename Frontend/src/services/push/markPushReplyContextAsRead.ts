import type { PushChatContext } from './parsePushChatContext';
import { markReadAfterSend } from '@/services/chat/markReadAfterSend';

export function markPushReplyContextAsRead(ctx: PushChatContext): void {
  markReadAfterSend(
    ctx.chatContextType as 'USER' | 'GAME' | 'GROUP' | 'BUG',
    ctx.contextId,
    ctx.groupChannelId
  );
}
