import type { Prisma } from '@prisma/client';
import prisma from '../../config/database';
import { getChatNotifier } from './chatNotifier';
import { bumpUserRevisionOnly } from './unreadAuthority/revisionClocks';

export type UnreadInvalidateReason = 'auto_read' | 'repair' | 'mark_all_read';

export type UnreadInvalidatePayload = {
  userUnreadRevision: number;
  reason: UnreadInvalidateReason;
};

type BulkInvalidateDeps = {
  transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  emitInvalidation: (userId: string, payload: UnreadInvalidatePayload) => Promise<void>;
  isUserOnline: (userId: string) => boolean;
};

let depsOverride: Partial<BulkInvalidateDeps> | undefined;

export function setUnreadBulkInvalidateDepsForTests(deps: Partial<BulkInvalidateDeps> | undefined): void {
  depsOverride = deps;
}

function resolveDeps(): BulkInvalidateDeps {
  const notifier = getChatNotifier();
  return {
    transaction: (fn) => prisma.$transaction(fn),
    emitInvalidation: async (userId, payload) => {
      await notifier.emitUnreadInvalidate(userId, payload);
    },
    isUserOnline: (userId) => notifier.isUserOnline(userId),
    ...depsOverride,
  };
}

export async function bumpUserRevisionsAndEmitInvalidation(
  userIds: Iterable<string>,
  reason: UnreadInvalidateReason
): Promise<Map<string, number>> {
  const uniqueUserIds = [...new Set([...userIds].filter((id) => id.length > 0))];
  if (uniqueUserIds.length === 0) return new Map();

  const deps = resolveDeps();
  const revisions = new Map<string, number>();

  await deps.transaction(async (tx) => {
    for (const userId of uniqueUserIds) {
      revisions.set(userId, await bumpUserRevisionOnly(tx, userId));
    }
  });

  for (const [userId, userUnreadRevision] of revisions) {
    if (!deps.isUserOnline(userId)) continue;
    await deps.emitInvalidation(userId, { userUnreadRevision, reason });
  }

  return revisions;
}
