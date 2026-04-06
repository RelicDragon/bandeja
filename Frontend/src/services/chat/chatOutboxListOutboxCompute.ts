import type { ChatContextType, OptimisticMessagePayload } from '@/api/chat';
import type { ChatListOutbox } from '@/utils/chatListSort';
import { chatLocalDb } from './chatLocalDb';

function outboxPreviewFromPayload(payload: OptimisticMessagePayload): {
  preview?: string;
  previewKind?: 'text' | 'voice' | 'media';
} {
  const text = (payload.content || '').trim();
  if (text) return { preview: text.slice(0, 80), previewKind: 'text' };
  if (payload.messageType === 'VOICE') return { previewKind: 'voice' };
  if (payload.messageType === 'IMAGE' || (payload.mediaUrls?.length ?? 0) > 0) return { previewKind: 'media' };
  return {};
}

export async function computeListOutboxForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<ChatListOutbox | null> {
  const rows = await chatLocalDb.outbox
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  rows.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  if (rows.length === 0) return null;
  const state = rows.some((r) => r.status === 'failed')
    ? ('failed' as const)
    : rows.some((r) => r.status === 'sending')
      ? ('sending' as const)
      : ('queued' as const);
  const last = rows[rows.length - 1]!;
  const meta = outboxPreviewFromPayload(last.payload);
  return { state, ...meta };
}
