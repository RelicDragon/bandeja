import type { ChatContextType, ChatMessage, MessageReadReceipt } from '@/api/chat';
import { BANDEJA_CHAT_PINS_UPDATED } from '@/utils/chatPinsEvents';
import { chatLocalDb, type ChatLocalRow } from './chatLocalDb';
import type { ChatSyncPatch } from './chatSyncEventsToPatches';
import { mergeReactionListSync, mergeReadReceiptSync } from './chatSyncEventsToPatches';
import { rowFromMessage } from './chatSyncRowUtils';
import { putChatLocalRowsWithSearchTokens } from './chatLocalApplyWrite';

export type ChatSyncPatchApplySideEffects = {
  putMessagesForMedia: ChatMessage[];
  /** Compact MESSAGE_UPDATED with no Dexie row: caller may GET message and persist. */
  patchMessageFallbacks: { messageId: string; syncSeq: number }[];
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
      case 'putMessage':
        writeRow(rowFromMessage(p.message));
        putMessagesForMedia.push(p.message);
        break;
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
        const iso = p.deletedAt;
        writeRow({
          ...r,
          deletedAt: new Date(iso).getTime(),
          payload: { ...r.payload, deletedAt: iso },
        });
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
          if (!r) continue;
          const receipts = r.payload.readReceipts ?? [];
          const next: MessageReadReceipt = {
            id: `batch-${mid}-${p.userId}`,
            messageId: mid,
            userId: p.userId,
            readAt: p.readAt,
          };
          const merged = mergeReadReceiptSync(receipts, p.userId, next);
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
        if (!r) break;
        const receipts = r.payload.readReceipts ?? [];
        const next: MessageReadReceipt = {
          id: `sync-${messageId}-${userId}`,
          messageId,
          userId,
          readAt,
        };
        const merged = mergeReadReceiptSync(receipts, userId, next);
        writeRow({
          ...r,
          payload: { ...r.payload, readReceipts: merged },
        });
        break;
      }
      case 'translationUpdated': {
        const r = await ensureRow(p.messageId);
        if (!r) break;
        const translations = [...(r.payload.translations ?? [])];
        const idx = translations.findIndex((t) => t.languageCode === p.languageCode);
        if (idx >= 0) translations[idx] = { languageCode: p.languageCode, translation: p.translation };
        else translations.push({ languageCode: p.languageCode, translation: p.translation });
        writeRow({
          ...r,
          payload: { ...r.payload, translations },
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

  return { putMessagesForMedia, patchMessageFallbacks };
}
