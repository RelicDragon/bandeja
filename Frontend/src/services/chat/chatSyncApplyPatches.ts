import type { ChatContextType, ChatMessage, MessageReadReceipt } from '@/api/chat';
import { translationIsRedundantOfSource } from '@/utils/translationRedundant';
import { isMessageTranslationPending as isTranslationPending } from '@bandeja/chat-contract';
import { BANDEJA_CHAT_PINS_UPDATED } from '@/utils/chatPinsEvents';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import type { ChatSyncPatch } from './chatSyncEventsToPatches';
import { mergeReactionListSync } from './chatSyncEventsToPatches';
import { mergeReadReceipts } from './mergeReadReceipts';
import { rowFromMessage } from './chatSyncRowUtils';
import { putChatLocalRowsWithSearchTokens } from './chatLocalApplyWrite';
import { preferDeletedAt, tombstoneLocalRow } from './chatLocalMessageTombstone';
import {
  pendingReceiptsToMessageReadReceipts,
  stashPendingThreadReadReceipt,
  takePendingThreadReadReceipts,
} from './pendingThreadReadReceipts';
import { upsertPeerReadCursor } from './peerReadCursorStore';
import { useAuthStore } from '@/store/authStore';

export type ChatSyncPatchApplySideEffects = {
  putMessagesForMedia: ChatMessage[];
  /** Compact MESSAGE_UPDATED with no Dexie row: caller may GET message and persist. */
  patchMessageFallbacks: { messageId: string; syncSeq: number }[];
  persistedMessages: ChatMessage[];
};

export async function applyChatSyncPatchesInSlice(
  patches: ChatSyncPatch[],
  contextType: ChatContextType,
  contextId: string
): Promise<ChatSyncPatchApplySideEffects> {
  const putMessagesForMedia: ChatMessage[] = [];
  const patchFallbackById = new Map<string, number>();

  const cache = new Map<string, ChatLocalRow>();
  const dirty = new Set<string>();

  async function ensureRow(id: string): Promise<ChatLocalRow | undefined> {
    if (cache.has(id)) return cache.get(id);
    const r = await chatLocalDb.messages.get(id);
    if (r) cache.set(id, r);
    return r;
  }

  function writeRow(r: ChatLocalRow) {
    cache.set(r.id, r);
    dirty.add(r.id);
  }

  for (const p of patches) {
    switch (p.op) {
      case 'putMessage': {
        const existing = await ensureRow(p.message.id);
        const pending = takePendingThreadReadReceipts(contextType, contextId, p.message.id);
        const withPending =
          pending.length > 0
            ? {
                ...p.message,
                readReceipts: mergeReadReceipts(
                  p.message.readReceipts ?? [],
                  pendingReceiptsToMessageReadReceipts(p.message.id, pending)
                ),
              }
            : p.message;
        const merged = existing
          ? {
              ...existing.payload,
              ...withPending,
              deletedAt: preferDeletedAt(existing.payload.deletedAt, withPending.deletedAt),
              readReceipts: mergeReadReceipts(
                existing.payload.readReceipts ?? [],
                withPending.readReceipts ?? []
              ),
            }
          : withPending;
        writeRow(rowFromMessage(merged));
        putMessagesForMedia.push(merged);
        break;
      }
      case 'patchMessage': {
        const r = await ensureRow(p.messageId);
        if (!r) {
          const prev = patchFallbackById.get(p.messageId) ?? 0;
          if (p.syncSeq >= prev) patchFallbackById.set(p.messageId, p.syncSeq);
          break;
        }
        const merged = {
          ...r.payload,
          ...p.patch,
          deletedAt: preferDeletedAt(r.payload.deletedAt, p.patch.deletedAt),
          syncSeq: p.syncSeq,
          serverSyncSeq: p.syncSeq,
        } as ChatMessage;
        writeRow(rowFromMessage(merged));
        putMessagesForMedia.push(merged);
        break;
      }
      case 'deleteMessage': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        writeRow(tombstoneLocalRow(r, p.deletedAt));
        break;
      }
      case 'reactionAdded': {
        const r = await ensureRow(p.reaction.messageId);
        if (!r) break;
        const reactions = mergeReactionListSync(r.payload.reactions ?? [], p.reaction);
        writeRow({
          ...r,
          payload: { ...r.payload, reactions },
        });
        break;
      }
      case 'reactionRemoved': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        const reactions = (r.payload.reactions ?? []).filter((x) => x.userId !== p.userId);
        writeRow({
          ...r,
          payload: { ...r.payload, reactions },
        });
        break;
      }
      case 'pollVoted': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        writeRow({
          ...r,
          payload: { ...r.payload, poll: p.poll },
        });
        break;
      }
      case 'transcriptionUpdated': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        writeRow({
          ...r,
          payload: { ...r.payload, audioTranscription: p.audioTranscription },
        });
        break;
      }
      case 'readBatch': {
        for (const mid of p.messageIds) {
          const r = await ensureRow(mid);
          if (!r) {
            stashPendingThreadReadReceipt(contextType, contextId, mid, p.userId, p.readAt);
            continue;
          }
          const receipts = r.payload.readReceipts ?? [];
          const next: MessageReadReceipt = {
            id: `batch-${mid}-${p.userId}`,
            messageId: mid,
            userId: p.userId,
            readAt: p.readAt,
          };
          const merged = mergeReadReceipts(receipts, next);
          writeRow({
            ...r,
            payload: { ...r.payload, readReceipts: merged },
          });
        }
        break;
      }
      case 'readReceipt': {
        const { messageId, userId, readAt } = p.receipt;
        const r = await ensureRow(messageId);
        if (!r) {
          stashPendingThreadReadReceipt(contextType, contextId, messageId, userId, readAt);
          break;
        }
        const receipts = r.payload.readReceipts ?? [];
        const next: MessageReadReceipt = {
          id: `sync-${messageId}-${userId}`,
          messageId,
          userId,
          readAt,
        };
        const merged = mergeReadReceipts(receipts, next);
        writeRow({
          ...r,
          payload: { ...r.payload, readReceipts: merged },
        });
        break;
      }
      case 'readCursorUpdate': {
        const viewerId = useAuthStore.getState().user?.id;
        if (viewerId && p.cursor.userId === viewerId) break;
        upsertPeerReadCursor(p.cursor);
        break;
      }
      case 'translationUpdated': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        const sourceText =
          (r.payload.content?.trim() || '') ||
          (r.payload.audioTranscription?.transcription?.trim() || '');
        if (
          !isTranslationPending(p.translation) &&
          sourceText &&
          translationIsRedundantOfSource(sourceText, p.translation)
        ) {
          const translations = (r.payload.translations ?? []).filter(
            (t) => t.languageCode.toLowerCase() !== p.languageCode.toLowerCase()
          );
          const primary =
            r.payload.translation?.languageCode.toLowerCase() === p.languageCode.toLowerCase()
              ? undefined
              : r.payload.translation;
          writeRow({ ...r, payload: { ...r.payload, translations, translation: primary } });
          break;
        }
        const translations = [...(r.payload.translations ?? [])];
        const idx = translations.findIndex((t) => t.languageCode === p.languageCode);
        if (idx >= 0) translations[idx] = { languageCode: p.languageCode, translation: p.translation };
        else translations.push({ languageCode: p.languageCode, translation: p.translation });
        const primary =
          r.payload.translation?.languageCode === p.languageCode
            ? { languageCode: p.languageCode, translation: p.translation }
            : r.payload.translation;
        writeRow({
          ...r,
          payload: { ...r.payload, translations, translation: primary },
        });
        break;
      }
      case 'translationRemoved': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        const translations = (r.payload.translations ?? []).filter(
          (t) => t.languageCode.toLowerCase() !== p.languageCode.toLowerCase()
        );
        const primary =
          r.payload.translation?.languageCode.toLowerCase() === p.languageCode.toLowerCase()
            ? undefined
            : r.payload.translation;
        writeRow({
          ...r,
          payload: { ...r.payload, translations, translation: primary },
        });
        break;
      }
      case 'stateUpdated': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        writeRow(
          rowFromMessage({
            ...r.payload,
            state: p.state,
            syncSeq: p.syncSeq,
            serverSyncSeq: p.syncSeq,
          })
        );
        break;
      }
      case 'pinsBroadcast':
        if (typeof window !== 'undefined') {
          window.dispatchEvent(
            new CustomEvent(BANDEJA_CHAT_PINS_UPDATED, {
              detail: { contextType, contextId, chatType: p.chatType },
            })
          );
        }
        break;
      case 'devUnhandled':
        if (import.meta.env.DEV) {
          console.warn('[chatLocalApply] unhandled sync eventType', p.eventType, p.seq);
        }
        break;
    }
  }

  const outRows = [...dirty].map((id) => cache.get(id)).filter((r): r is ChatLocalRow => r != null);
  if (outRows.length) await putChatLocalRowsWithSearchTokens(outRows);

  const patchMessageFallbacks = [...patchFallbackById.entries()].map(([messageId, syncSeq]) => ({
    messageId,
    syncSeq,
  }));

  return {
    putMessagesForMedia,
    patchMessageFallbacks,
    persistedMessages: outRows.map((row) => row.payload),
  };
}
