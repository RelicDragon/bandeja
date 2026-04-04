import type { ChatMessage, MessageReaction, MessageReadReceipt } from '@/api/chat';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

export type ChatSyncPatch =
  | { op: 'putMessage'; message: ChatMessage }
  | { op: 'deleteMessage'; messageId: string; deletedAt: string }
  | { op: 'reactionAdded'; reaction: MessageReaction }
  | { op: 'reactionRemoved'; messageId: string; userId: string }
  | { op: 'pollVoted'; messageId: string; poll: NonNullable<ChatMessage['poll']> }
  | { op: 'transcriptionUpdated'; messageId: string; audioTranscription: NonNullable<ChatMessage['audioTranscription']> }
  | { op: 'readBatch'; userId: string; readAt: string; messageIds: string[] }
  | { op: 'readReceipt'; receipt: { messageId: string; userId: string; readAt: string } }
  | { op: 'translationUpdated'; messageId: string; languageCode: string; translation: string }
  | { op: 'stateUpdated'; messageId: string; state: ChatMessage['state'] }
  | { op: 'pinsBroadcast'; chatType: string }
  | { op: 'devUnhandled'; eventType: string; seq: number };

export function chatSyncEventsToPatches(events: ChatSyncEventDTO[]): ChatSyncPatch[] {
  const out: ChatSyncPatch[] = [];
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown>;
    switch (ev.eventType) {
      case 'MESSAGE_CREATED': {
        const message = p.message as ChatMessage | undefined;
        if (message?.id) out.push({ op: 'putMessage', message: { ...message, syncSeq: ev.seq } });
        break;
      }
      case 'MESSAGE_UPDATED': {
        const message = p.message as ChatMessage | undefined;
        if (!message?.id) break;
        const authoritativeSeq = message.serverSyncSeq ?? message.syncSeq ?? ev.seq;
        out.push({ op: 'putMessage', message: { ...message, syncSeq: authoritativeSeq } });
        break;
      }
      case 'MESSAGE_DELETED': {
        const messageId = p.messageId as string | undefined;
        const deletedAt = (p.deletedAt as string) || new Date().toISOString();
        if (messageId) out.push({ op: 'deleteMessage', messageId, deletedAt });
        break;
      }
      case 'REACTION_ADDED': {
        const reaction = p.reaction as MessageReaction | undefined;
        if (reaction?.messageId) out.push({ op: 'reactionAdded', reaction });
        break;
      }
      case 'REACTION_REMOVED': {
        const messageId = p.messageId as string | undefined;
        const uid = p.userId as string | undefined;
        if (messageId && uid) out.push({ op: 'reactionRemoved', messageId, userId: uid });
        break;
      }
      case 'POLL_VOTED': {
        const messageId = p.messageId as string | undefined;
        const updatedPoll = p.updatedPoll as ChatMessage['poll'];
        if (messageId && updatedPoll) out.push({ op: 'pollVoted', messageId, poll: updatedPoll });
        break;
      }
      case 'MESSAGE_TRANSCRIPTION_UPDATED': {
        const messageId = p.messageId as string | undefined;
        const audioTranscription = p.audioTranscription as ChatMessage['audioTranscription'];
        if (messageId && audioTranscription) {
          out.push({ op: 'transcriptionUpdated', messageId, audioTranscription });
        }
        break;
      }
      case 'MESSAGES_READ_BATCH': {
        const userId = p.userId as string | undefined;
        const readAt = p.readAt as string | undefined;
        const messageIds = p.messageIds as string[] | undefined;
        if (userId && readAt && Array.isArray(messageIds) && messageIds.length > 0) {
          out.push({ op: 'readBatch', userId, readAt, messageIds });
        }
        break;
      }
      case 'MESSAGE_READ_RECEIPT': {
        const readReceipt = p.readReceipt as { messageId?: string; userId?: string; readAt?: string } | undefined;
        if (readReceipt?.messageId && readReceipt.userId && readReceipt.readAt) {
          out.push({
            op: 'readReceipt',
            receipt: {
              messageId: readReceipt.messageId,
              userId: readReceipt.userId,
              readAt: readReceipt.readAt,
            },
          });
        }
        break;
      }
      case 'MESSAGE_TRANSLATION_UPDATED': {
        const messageId = p.messageId as string | undefined;
        const languageCode = p.languageCode as string | undefined;
        const translation = p.translation as string | undefined;
        if (messageId && languageCode && translation != null) {
          out.push({ op: 'translationUpdated', messageId, languageCode, translation });
        }
        break;
      }
      case 'MESSAGE_STATE_UPDATED': {
        const messageId = p.messageId as string | undefined;
        const state = p.state as ChatMessage['state'] | undefined;
        if (messageId && state) out.push({ op: 'stateUpdated', messageId, state });
        break;
      }
      case 'MESSAGE_PINNED':
      case 'MESSAGE_UNPINNED': {
        const chatType = p.chatType as string | undefined;
        if (chatType) out.push({ op: 'pinsBroadcast', chatType });
        break;
      }
      case 'THREAD_LOCAL_INVALIDATE':
        break;
      default:
        out.push({ op: 'devUnhandled', eventType: ev.eventType, seq: ev.seq });
        break;
    }
  }
  return out;
}

export function mergeReactionListSync(existing: MessageReaction[], reaction: MessageReaction): MessageReaction[] {
  const others = existing.filter((r) => r.userId !== reaction.userId);
  return [...others, reaction];
}

export function mergeReadReceiptSync(
  receipts: MessageReadReceipt[],
  userId: string,
  next: MessageReadReceipt
): MessageReadReceipt[] {
  const others = receipts.filter((r) => r.userId !== userId);
  return [...others, next];
}
