import { useEffect, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { usePresenceWantedStore } from '@/store/presenceWantedStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api';

const SUBSCRIBE_DEBOUNCE_MS = 400;

/** Stable fingerprint for a presence id set. Empty set is `'∅'`, not `''`. */
export function presenceIdsKey(ids: string[]): string {
  if (ids.length === 0) return '∅';
  return ids.slice().sort().join(',');
}

/**
 * Pushes merged presence wants to the socket.
 * Must not subscribe to `wantedByKey` via React state — avatar/chat mounts update
 * that map often and would re-render App (and the global player card sheet).
 */
export function usePresenceSubscriptionManager() {
  const initialized = useSocketEventsStore((s) => s.initialized);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const showOnlineStatus = useAuthStore((s) => s.user?.showOnlineStatus !== false);
  const prevKeyRef = useRef<string | null>(null);
  const currentUserIdRef = useRef(currentUserId);
  const showOnlineStatusRef = useRef(showOnlineStatus);
  currentUserIdRef.current = currentUserId;
  showOnlineStatusRef.current = showOnlineStatus;

  useEffect(() => {
    if (!showOnlineStatus) {
      usePresenceStore.getState().clearPresence();
    }
  }, [showOnlineStatus]);

  useEffect(() => {
    if (!initialized) return;

    let debounceTimer: ReturnType<typeof setTimeout> | undefined;

    const pushSubscription = () => {
      clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        if (!socketService.getConnectionStatus()) return;
        const uid = currentUserIdRef.current;
        const next = usePresenceWantedStore.getState().getMergedWantedIds(uid);
        const key = presenceIdsKey(next);
        if (key === prevKeyRef.current) return;
        prevKeyRef.current = key;
        socketService.subscribePresence(next);
      }, SUBSCRIBE_DEBOUNCE_MS);
    };

    const uid = currentUserIdRef.current;
    const merged = usePresenceWantedStore.getState().getMergedWantedIds(uid);
    const key = presenceIdsKey(merged);
    if (prevKeyRef.current === null) {
      prevKeyRef.current = key;
      if (socketService.getConnectionStatus()) {
        socketService.subscribePresence(merged);
        if (showOnlineStatusRef.current && uid) {
          usePresenceStore.getState().setPresenceInitial({ [uid]: true });
        }
      }
    }

    pushSubscription();
    const unsubWanted = usePresenceWantedStore.subscribe(() => pushSubscription());

    return () => {
      clearTimeout(debounceTimer);
      unsubWanted();
    };
  }, [initialized, currentUserId]);

  useEffect(() => {
    if (!initialized) return;
    const onConnect = () => {
      const uid = currentUserIdRef.current;
      const show = showOnlineStatusRef.current;
      const ids = usePresenceWantedStore.getState().getMergedWantedIds(uid ?? undefined);
      prevKeyRef.current = presenceIdsKey(ids);
      if (show && uid) usePresenceStore.getState().setPresenceInitial({ [uid]: true });
      if (!show) usePresenceStore.getState().clearPresence();
      if (ids.length > 0) socketService.subscribePresence(ids);
      if (show && ids.length > 0) {
        usersApi.getPresence(ids).then((data) => {
          if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
        }).catch(() => {});
      }
    };
    socketService.on('reconnect', onConnect);
    socketService.on('connect', onConnect);
    return () => {
      socketService.off('reconnect', onConnect);
      socketService.off('connect', onConnect);
    };
  }, [initialized]);
}
