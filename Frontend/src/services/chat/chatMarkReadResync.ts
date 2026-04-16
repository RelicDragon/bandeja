import { chatApi, type ChatContextType } from '@/api/chat';
import { useHeaderStore } from '@/store/headerStore';
import { usePlayersStore } from '@/store/playersStore';
import { patchThreadIndexSetUnreadCount } from '@/services/chat/chatThreadIndex';
import {
  dispatchRestoreGameUnreadCount,
  dispatchRestoreGroupUnreadCount,
} from '@/services/chat/applyOptimisticMarkContextRead';
import {
  CHAT_MUTATION_FLUSH_FAILED_EVENT,
  type ChatMutationFlushFailedDetail,
} from '@/services/chat/chatMutationEvents';

function unreadCountFromBody(body: { data?: { count?: number }; count?: number } | undefined): number {
  if (!body) return 0;
  if (typeof body.data?.count === 'number') return body.data.count;
  if (typeof body.count === 'number') return body.count;
  return 0;
}

const MARK_READ_FLUSH_KIND = 'mark_read_batch';
const RESYNC_FLUSH_CONTEXTS: readonly ChatContextType[] = ['USER', 'GROUP', 'GAME'];

export function resyncAfterMarkReadFailure(contextType: ChatContextType, contextId: string | undefined) {
  if (!contextId) return;
  chatApi.invalidateUnreadCache();
  void chatApi.getUnreadCount().then((r) => {
    useHeaderStore.getState().setUnreadMessages(unreadCountFromBody(r as { data?: { count?: number }; count?: number }));
  }).catch((e) => {
    console.error('[chatMarkReadResync] getUnreadCount failed', e);
  });
  window.dispatchEvent(new CustomEvent('unread-count-invalidated'));
  window.dispatchEvent(new CustomEvent('refresh-chat-list'));
  if (contextType === 'USER') {
    void chatApi.getUserChatUnreadCount(contextId).then((r) => {
      usePlayersStore.getState().updateUnreadCount(contextId, unreadCountFromBody(r as { data?: { count?: number }; count?: number }));
    }).catch((e) => {
      console.error('[chatMarkReadResync] getUserChatUnreadCount failed', contextId, e);
    });
  }
  if (contextType === 'GAME') {
    void chatApi.getGamesUnreadCounts([contextId]).then((m) => {
      const n = m[contextId] ?? 0;
      void patchThreadIndexSetUnreadCount('GAME', contextId, n);
      dispatchRestoreGameUnreadCount(contextId, n);
    }).catch((e) => {
      console.error('[chatMarkReadResync] getGamesUnreadCounts failed', contextId, e);
    });
  }
  if (contextType === 'GROUP') {
    void chatApi.getGroupChannelUnreadCount(contextId).then((r) => {
      const n = unreadCountFromBody(r as { data?: { count?: number }; count?: number });
      void patchThreadIndexSetUnreadCount('GROUP', contextId, n);
      dispatchRestoreGroupUnreadCount(contextId, n);
    }).catch((e) => {
      console.error('[chatMarkReadResync] getGroupChannelUnreadCount failed', contextId, e);
    });
  }
}

let markReadFlushResyncInstalled = false;

export function installMarkReadFlushFailureResync(): void {
  if (typeof window === 'undefined' || markReadFlushResyncInstalled) return;
  markReadFlushResyncInstalled = true;
  window.addEventListener(CHAT_MUTATION_FLUSH_FAILED_EVENT, (ev: Event) => {
    const d = (ev as CustomEvent<ChatMutationFlushFailedDetail>).detail;
    if (!d || d.kind !== MARK_READ_FLUSH_KIND || !d.contextId) return;
    if (!RESYNC_FLUSH_CONTEXTS.includes(d.contextType as ChatContextType)) return;
    resyncAfterMarkReadFailure(d.contextType as ChatContextType, d.contextId);
  });
}
