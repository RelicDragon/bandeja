import { runUnreadSnapshotSideEffects } from '@/services/chat/unreadSnapshotSideEffects';
import type { SnapshotContextType } from '@/services/chat/unreadSnapshot';
import { setAppIconBadgeCountNative } from '@/services/authBridge';
import { isCapacitor } from '@/utils/capacitor';
import type { UnreadEffect } from '@/services/chat/unreadProjection';
import { useUnreadStore } from '@/store/unreadStore';

function dispatchViewingClearUnread(contextType: SnapshotContextType, contextId: string): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(
    new CustomEvent('chat-viewing-clear-unread', {
      detail: { contextType, contextId },
    })
  );
}

export function runUnreadProjectionEffects(effects: readonly UnreadEffect[]): void {
  for (const effect of effects) {
    switch (effect.type) {
      case 'snapshotSideEffects':
        runUnreadSnapshotSideEffects(effect.dto);
        break;
      case 'viewingClearUnread':
        dispatchViewingClearUnread(effect.contextType, effect.contextId);
        break;
      case 'syncNativeBadge':
        if (isCapacitor()) {
          void setAppIconBadgeCountNative(effect.count);
        }
        break;
      case 'fetchSnapshotRepair':
        void useUnreadStore.getState().refreshAll();
        break;
      default: {
        const _exhaustive: never = effect;
        return _exhaustive;
      }
    }
  }
}
