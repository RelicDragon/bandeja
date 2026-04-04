import type { ChatContextType } from '@/api/chat';
import { chatLocalDb, type ChatMutationQueueRow } from './chatLocalDb';

function newId(): string {
  return typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

export function newClientMutationId(): string {
  return newId();
}

export async function putMutationRow(row: ChatMutationQueueRow): Promise<void> {
  await chatLocalDb.mutationQueue.put(row);
}

export async function deleteMutationRow(id: string): Promise<void> {
  await chatLocalDb.mutationQueue.delete(id);
}

export async function updateMutationRow(
  id: string,
  patch: Partial<Pick<ChatMutationQueueRow, 'status' | 'attempts' | 'lastError' | 'nextRetryAt'>>
): Promise<void> {
  const row = await chatLocalDb.mutationQueue.get(id);
  if (!row) return;
  await chatLocalDb.mutationQueue.put({ ...row, ...patch });
}

export async function listMutationsForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<ChatMutationQueueRow[]> {
  const rows = await chatLocalDb.mutationQueue
    .where('[contextType+contextId]')
    .equals([contextType, contextId])
    .toArray();
  rows.sort((a, b) => a.createdAt - b.createdAt);
  return rows;
}

export async function countFailedMutationsForContext(
  contextType: ChatContextType,
  contextId: string
): Promise<number> {
  const rows = await listMutationsForContext(contextType, contextId);
  return rows.filter((r) => r.status === 'failed').length;
}

export async function pruneMutationsForMessageBeforeDelete(messageId: string): Promise<void> {
  const rows = await chatLocalDb.mutationQueue.toArray();
  const drop = rows.filter(
    (r) =>
      r.messageId === messageId &&
      (r.kind === 'edit' || r.kind === 'reaction_add' || r.kind === 'reaction_remove' || r.kind === 'pin' || r.kind === 'unpin')
  );
  await Promise.all(drop.map((r) => chatLocalDb.mutationQueue.delete(r.id)));
}
