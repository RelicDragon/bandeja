import type { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { AUTO_READ_NOTIFY_MAX_PAIRS } from '../unreadAutoReadNotify.service';
import { getChatNotifier } from '../chatNotifier';
import type { ContextKey, SnapshotContextType } from '../unreadSnapshot.service';
import { bumpContextRevisionOnly, bumpUserRevisionOnly } from './revisionClocks';
import type { UnreadAuthorityEnvelope } from './types';

export const MARK_ALL_READ_CHUNK_SIZE = 50;

export type MarkAllReadContext = {
  contextKey: ContextKey;
  contextType: SnapshotContextType;
  contextId: string;
};

export type RecordMarkAllReadParams = {
  userId: string;
  contexts: MarkAllReadContext[];
  performMarkRead: (ctx: MarkAllReadContext) => Promise<void>;
  emitSocket?: boolean;
};

export type RecordMarkAllReadResult = {
  userUnreadRevision: number;
  contextRevisions: Record<ContextKey, number>;
  envelopes: UnreadAuthorityEnvelope[];
  usedInvalidation: boolean;
};

type MarkAllReadDeps = {
  transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  emitEnvelope: (userId: string, envelope: UnreadAuthorityEnvelope) => Promise<void>;
  emitInvalidation: (
    userId: string,
    payload: { userUnreadRevision: number; reason: 'mark_all_read' }
  ) => Promise<void>;
};

let depsOverride: Partial<MarkAllReadDeps> | undefined;

export function setMarkAllReadDepsForTests(deps: Partial<MarkAllReadDeps> | undefined): void {
  depsOverride = deps;
}

function resolveDeps(): MarkAllReadDeps {
  return {
    transaction: (fn) => prisma.$transaction(fn),
    emitEnvelope: async (userId, envelope) => {
      await getChatNotifier().emitUnreadAuthorityEnvelope(userId, envelope);
    },
    emitInvalidation: async (userId, payload) => {
      await getChatNotifier().emitUnreadInvalidate(userId, payload);
    },
    ...depsOverride,
  };
}

export class MarkAllReadService {
  static async recordMarkAllRead(
    params: RecordMarkAllReadParams
  ): Promise<RecordMarkAllReadResult> {
    const deps = resolveDeps();
    const shouldEmit = params.emitSocket !== false;
    const contexts = params.contexts.filter((ctx) => ctx.contextKey && ctx.contextId);

    if (contexts.length === 0) {
      const userUnreadRevision = await deps.transaction(async (tx) => {
        const existing = await tx.userUnreadState.findUnique({
          where: { userId: params.userId },
          select: { unreadRevision: true },
        });
        return existing?.unreadRevision ?? 0;
      });
      return {
        userUnreadRevision,
        contextRevisions: {},
        envelopes: [],
        usedInvalidation: false,
      };
    }

    for (let i = 0; i < contexts.length; i += MARK_ALL_READ_CHUNK_SIZE) {
      const chunk = contexts.slice(i, i + MARK_ALL_READ_CHUNK_SIZE);
      for (const ctx of chunk) {
        await params.performMarkRead(ctx);
      }
    }

    const { userUnreadRevision, contextRevisions } = await deps.transaction(async (tx) => {
      const revisions: Record<ContextKey, number> = {};
      for (const ctx of contexts) {
        revisions[ctx.contextKey] = await bumpContextRevisionOnly(tx, {
          userId: params.userId,
          contextKey: ctx.contextKey,
          contextType: ctx.contextType,
          contextId: ctx.contextId,
        });
      }
      const userRevision = await bumpUserRevisionOnly(tx, params.userId);
      return { userUnreadRevision: userRevision, contextRevisions: revisions };
    });

    const envelopes: UnreadAuthorityEnvelope[] = contexts.map((ctx) => ({
      contextKey: ctx.contextKey,
      contextType: ctx.contextType,
      contextId: ctx.contextId,
      unreadCount: 0,
      clock: {
        userUnreadRevision,
        userContextUnreadRevision: contextRevisions[ctx.contextKey],
      },
      reason: 'mark_all_read' as const,
    }));

    const usedInvalidation = contexts.length > AUTO_READ_NOTIFY_MAX_PAIRS;

    if (shouldEmit) {
      if (usedInvalidation) {
        await deps.emitInvalidation(params.userId, {
          userUnreadRevision,
          reason: 'mark_all_read',
        });
      } else {
        for (const envelope of envelopes) {
          await deps.emitEnvelope(params.userId, envelope);
        }
      }
    }

    return {
      userUnreadRevision,
      contextRevisions,
      envelopes,
      usedInvalidation,
    };
  }
}
