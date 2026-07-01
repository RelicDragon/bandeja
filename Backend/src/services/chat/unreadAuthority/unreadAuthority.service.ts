import type { Prisma } from '@prisma/client';
import prisma from '../../../config/database';
import { getChatNotifier } from '../chatNotifier';
import { ReadReceiptService } from '../readReceipt.service';
import { bumpUnreadRevisions } from './revisionClocks';
import type {
  RecordContextChangedParams,
  UnreadAuthorityEnvelope,
  UnreadCountAdapter,
} from './types';

const defaultCountAdapter: UnreadCountAdapter = async (contextType, contextId, userId) =>
  ReadReceiptService.getUnreadCountForContext(contextType, contextId, userId);

type UnreadAuthorityDeps = {
  transaction: <T>(fn: (tx: Prisma.TransactionClient) => Promise<T>) => Promise<T>;
  countAdapter: UnreadCountAdapter;
  emitEnvelope: (userId: string, envelope: UnreadAuthorityEnvelope) => Promise<void>;
};

let depsOverride: Partial<UnreadAuthorityDeps> | undefined;

export function setUnreadAuthorityDepsForTests(deps: Partial<UnreadAuthorityDeps> | undefined): void {
  depsOverride = deps;
}

function resolveDeps(): UnreadAuthorityDeps {
  return {
    transaction: (fn) => prisma.$transaction(fn),
    countAdapter: defaultCountAdapter,
    emitEnvelope: async (userId, envelope) => {
      await getChatNotifier().emitUnreadAuthorityEnvelope(userId, envelope);
    },
    ...depsOverride,
  };
}

export class UnreadAuthorityService {
  static async recordContextChanged(
    params: RecordContextChangedParams
  ): Promise<UnreadAuthorityEnvelope> {
    const deps = resolveDeps();
    const countAdapter = params.countAdapter ?? deps.countAdapter;
    const shouldEmit = params.emitSocket !== false;

    const envelope = await deps.transaction(async (tx) => {
      if (params.performReadWrite) {
        await params.performReadWrite(tx);
      }

      const clock = await bumpUnreadRevisions(tx, {
        userId: params.userId,
        contextKey: params.contextKey,
        contextType: params.contextType,
        contextId: params.contextId,
      });

      const unreadCount = await countAdapter(
        params.contextType,
        params.contextId,
        params.userId,
        tx
      );

      const built: UnreadAuthorityEnvelope = {
        contextKey: params.contextKey,
        contextType: params.contextType,
        contextId: params.contextId,
        unreadCount,
        clock,
        reason: params.reason,
        ...(params.clientOpId ? { clientOpId: params.clientOpId } : {}),
        ...(params.lastMessage ? { lastMessage: params.lastMessage } : {}),
        ...(params.groupChannelMeta ? { groupChannelMeta: params.groupChannelMeta } : {}),
      };

      return built;
    });

    if (shouldEmit) {
      await deps.emitEnvelope(params.userId, envelope);
    }

    return envelope;
  }
}
