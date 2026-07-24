import { ChatSyncEventType } from '@bandeja/chat-contract';
import type { ChatMessage, MessageReaction } from '@/api/chat';
import type { ChatSyncEventDTO } from './chatSyncEventTypes';

export type ChatSyncPatch =
  | { op: 'putMessage'; message: ChatMessage }
  | { op: 'patchMessage'; messageId: string; patch: Partial<ChatMessage>; syncSeq: number }
  | { op: 'deleteMessage'; messageId: string; deletedAt: string }
  | { op: 'reactionAdded'; reaction: MessageReaction }
  | { op: 'reactionRemoved'; messageId: string; userId: string }
  | { op: 'pollVoted'; messageId: string; poll: NonNullable<ChatMessage['poll']> }
  | { op: 'transcriptionUpdated'; messageId: string; audioTranscription: NonNullable<ChatMessage['audioTranscription']> }
  | { op: 'readBatch'; userId: string; readAt: string; messageIds: string[] }
  | { op: 'readReceipt'; receipt: { messageId: string; userId: string; readAt: string } }
  | { op: 'translationUpdated'; messageId: string; languageCode: string; translation: string }
  | { op: 'translationRemoved'; messageId: string; languageCode: string }
  | { op: 'stateUpdated'; messageId: string; state: ChatMessage['state']; syncSeq: number }
  | { op: 'pinsBroadcast'; chatType: string }
  | { op: 'devUnhandled'; eventType: string; seq: number };

export function chatSyncEventsToPatches(events: ChatSyncEventDTO[]): ChatSyncPatch[] {
  const out: ChatSyncPatch[] = [];
  for (const ev of events) {
    const p = ev.payload as Record<string, unknown>;
    switch (ev.eventType) {
      case ChatSyncEventType.MESSAGE_CREATED: {
        const message = p.message as ChatMessage | undefined;
        if (message?.id) {
          const rowSeq = message.serverSyncSeq ?? message.syncSeq ?? ev.seq;
          out.push({ op: 'putMessage', message: { ...message, syncSeq: rowSeq } });
        }
        break;
      }
      case ChatSyncEventType.MESSAGE_UPDATED: {
        const message = p.message as ChatMessage | undefined;
        if (message?.id) {
          const authoritativeSeq = message.serverSyncSeq ?? message.syncSeq ?? ev.seq;
          out.push({ op: 'putMessage', message: { ...message, syncSeq: authoritativeSeq } });
          break;
        }
        const messageId = p.messageId as string | undefined;
        const patch = p.patch as Partial<ChatMessage> | undefined;
        if (messageId && patch && typeof patch === 'object') {
          out.push({ op: 'patchMessage', messageId, patch, syncSeq: ev.seq });
        }
        break;
      }
      case ChatSyncEventType.MESSAGE_DELETED: {
        const messageId = p.messageId as string | undefined;
        const deletedAt = (p.deletedAt as string) || new Date().toISOString();
        if (messageId) out.push({ op: 'deleteMessage', messageId, deletedAt });
        break;
      }
      case ChatSyncEventType.REACTION_ADDED: {
        const reaction = p.reaction as MessageReaction | undefined;
        if (reaction?.messageId) out.push({ op: 'reactionAdded', reaction });
        break;
      }
      case ChatSyncEventType.REACTION_REMOVED: {
        const messageId = p.messageId as string | undefined;
        const uid = p.userId as string | undefined;
        if (messageId && uid) out.push({ op: 'reactionRemoved', messageId, userId: uid });
        break;
      }
      case ChatSyncEventType.POLL_VOTED: {
        const messageId = p.messageId as string | undefined;
        const updatedPoll = p.updatedPoll as ChatMessage['poll'];
        const relatedMessageIds = Array.isArray(p.relatedMessageIds)
          ? (p.relatedMessageIds as string[]).filter((id) => typeof id === 'string' && id)
          : [];
        if (updatedPoll) {
          const ids = relatedMessageIds.length
            ? relatedMessageIds
            : messageId
              ? [messageId]
              : [];
          for (const mid of ids) {
            out.push({ op: 'pollVoted', messageId: mid, poll: updatedPoll });
          }
        }
        break;
      }
      case ChatSyncEventType.MESSAGE_TRANSCRIPTION_UPDATED: {
        const messageId = p.messageId as string | undefined;
        const audioTranscription = p.audioTranscription as ChatMessage['audioTranscription'];
        const relatedMessageIds = Array.isArray(p.relatedMessageIds)
          ? (p.relatedMessageIds as string[]).filter((id) => typeof id === 'string' && id)
          : [];
        if (audioTranscription) {
          const ids = relatedMessageIds.length
            ? relatedMessageIds
            : messageId
              ? [messageId]
              : [];
          for (const mid of ids) {
            out.push({ op: 'transcriptionUpdated', messageId: mid, audioTranscription });
          }
        }
        break;
      }
      case ChatSyncEventType.MESSAGES_READ_BATCH: {
        const userId = p.userId as string | undefined;
        const readAt = p.readAt as string | undefined;
        const messageIds = p.messageIds as string[] | undefined;
        if (userId && readAt && Array.isArray(messageIds) && messageIds.length > 0) {
          out.push({ op: 'readBatch', userId, readAt, messageIds });
        }
        break;
      }
      case ChatSyncEventType.MESSAGE_READ_RECEIPT: {
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
      case ChatSyncEventType.MESSAGE_TRANSLATION_UPDATED: {
        const messageId = p.messageId as string | undefined;
        const languageCode = p.languageCode as string | undefined;
        if (!messageId || !languageCode) break;
        if (p.removed === true) {
          out.push({ op: 'translationRemoved', messageId, languageCode });
          break;
        }
        const translation = p.translation as string | undefined;
        if (translation != null) {
          out.push({ op: 'translationUpdated', messageId, languageCode, translation });
        }
        break;
      }
      case ChatSyncEventType.MESSAGE_STATE_UPDATED: {
        const messageId = p.messageId as string | undefined;
        const state = p.state as ChatMessage['state'] | undefined;
        if (messageId && state) out.push({ op: 'stateUpdated', messageId, state, syncSeq: ev.seq });
        break;
      }
      case ChatSyncEventType.MESSAGE_PINNED:
      case ChatSyncEventType.MESSAGE_UNPINNED: {
        const chatType = p.chatType as string | undefined;
        if (chatType) out.push({ op: 'pinsBroadcast', chatType });
        break;
      }
      case ChatSyncEventType.THREAD_LOCAL_INVALIDATE:
      case ChatSyncEventType.THREAD_ARCHIVED:
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

