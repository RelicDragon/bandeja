import type { ChatContextType } from '@/api/chat';
import type { ChatType } from '@/types';
import { buildGameChatMarkReadParams } from '@/services/chat/gameChatMarkReadParams';
import { reconcileThreadIndexOutboxForContext } from '@/services/chat/chatThreadIndex';
import {
  enterContextAndMarkRead,
  markContextReadOnUserActivity,
} from '@/services/chat/unreadCoordinator';
import { cancelAllForContext } from '@/services/chatSendService';
import {
  resolveThreadKeyFromOpen,
  type ThreadOpenOptions,
} from '@/services/chat/threadSession';

export type ChatThreadControllerPhase = 'closed' | 'opening' | 'open';

export type ChatThreadOpenContext = ThreadOpenOptions & {
  isEmbedded?: boolean;
};

export type ChatThreadControllerState = {
  phase: ChatThreadControllerPhase;
  threadKey: string | null;
  openContext: ChatThreadOpenContext | null;
  messageCount: number;
};

export type ChatThreadMarkReadInput = Parameters<typeof buildGameChatMarkReadParams>[0];

/** Thread lifecycle coordinator — open, send hooks, socket, markRead, close. */
export class ChatThreadController {
  #state: ChatThreadControllerState = {
    phase: 'closed',
    threadKey: null,
    openContext: null,
    messageCount: 0,
  };

  getState(): Readonly<ChatThreadControllerState> {
    return this.#state;
  }

  /** Record open intent when thread key becomes active. */
  open(ctx: ChatThreadOpenContext): string | null {
    const threadKey = resolveThreadKeyFromOpen(ctx);
    this.#state = {
      phase: 'opening',
      threadKey,
      openContext: ctx,
      messageCount: this.#state.messageCount,
    };
    return threadKey;
  }

  /** Called after bootstrap paint commits — thread is user-visible. */
  markOpenReady(messageCount: number): void {
    this.#state = {
      ...this.#state,
      phase: 'open',
      messageCount,
    };
  }

  syncMessageCount(count: number): void {
    this.#state = { ...this.#state, messageCount: count };
  }

  /** Mark read on enter (optimistic unread clear). */
  markReadOnEnter(input: ChatThreadMarkReadInput): void {
    const params = buildGameChatMarkReadParams(input);
    if (params) void enterContextAndMarkRead(params);
  }

  /** Mark read after user sends or scrolls to bottom. */
  markRead(input: ChatThreadMarkReadInput): void {
    const params = buildGameChatMarkReadParams(input);
    if (params) markContextReadOnUserActivity(params);
  }

  /** Mark read for inbound messages while thread is open (bypass confirmed-key skip). */
  markReadWhileViewing(input: ChatThreadMarkReadInput): void {
    const params = buildGameChatMarkReadParams(input);
    if (params) markContextReadOnUserActivity({ ...params, forceMarkReadNetwork: true });
  }

  /** Tear down: cancel in-flight sends and reconcile outbox for prior context. */
  close(): ChatThreadOpenContext | null {
    const ctx = this.#state.openContext;
    if (ctx) {
      void cancelAllForContext(ctx.contextType, ctx.contextId);
      const ct = ctx.contextType;
      if (ct === 'USER' || ct === 'GROUP' || ct === 'GAME' || ct === 'BUG') {
        void reconcileThreadIndexOutboxForContext(ct, ctx.contextId);
      }
    }
    this.#state = {
      phase: 'closed',
      threadKey: null,
      openContext: null,
      messageCount: 0,
    };
    return ctx;
  }

  /** Whether socket events should apply for this thread key. */
  acceptsThreadKey(threadKey: string | null): boolean {
    return threadKey != null && threadKey === this.#state.threadKey;
  }

  contextType(): ChatContextType | null {
    return this.#state.openContext?.contextType ?? null;
  }

  contextId(): string | null {
    return this.#state.openContext?.contextId ?? null;
  }

  chatType(): ChatType | undefined {
    return this.#state.openContext?.chatType;
  }
}
