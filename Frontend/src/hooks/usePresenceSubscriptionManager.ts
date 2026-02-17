import { useEffect, useRef } from 'react';
import { socketService } from '@/services/socketService';
import { useSocketEventsStore } from '@/store/socketEventsStore';
import { usePresenceWantedStore } from '@/store/presenceWantedStore';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';
import { usersApi } from '@/api';

const SUBSCRIBE_DEBOUNCE_MS = 400;

function keyOf(ids: string[]) {
  return ids.slice().sort().join(',');
}

export function usePresenceSubscriptionManager() {
  const initialized = useSocketEventsStore((s) => s.initialized);
  const wantedByKey = usePresenceWantedStore((s) => s.wantedByKey);
  const getMergedWantedIds = usePresenceWantedStore((s) => s.getMergedWantedIds);
  const currentUserId = useAuthStore((s) => s.user?.id ?? null);
  const prevKeyRef = useRef<string>('');
  const idsRef = useRef<string[]>([]);
  const firstConnectRef = useRef(true);
  const currentUserIdRef = useRef(currentUserId);
  currentUserIdRef.current = currentUserId;

  useEffect(() => {
    if (!initialized) return;
    const merged = getMergedWantedIds(currentUserId);
    idsRef.current = merged;
    const key = keyOf(merged);
    const run = () => {
      if (!socketService.getConnectionStatus()) return;
      const uid = currentUserIdRef.current;
      const next = usePresenceWantedStore.getState().getMergedWantedIds(uid);
      idsRef.current = next;
      prevKeyRef.current = keyOf(next);
      socketService.subscribePresence(next);
    };
    const isFirst = prevKeyRef.current === '';
    if (isFirst) {
      prevKeyRef.current = key;
      if (socketService.getConnectionStatus()) {
        socketService.subscribePresence(merged);
        if (currentUserId) usePresenceStore.getState().setPresenceInitial({ [currentUserId]: true });
      }
    }
    const t = setTimeout(run, SUBSCRIBE_DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [initialized, wantedByKey, currentUserId, getMergedWantedIds]);

  useEffect(() => {
    if (!initialized) return;
    const onConnect = () => {
      const uid = currentUserIdRef.current;
      const ids = usePresenceWantedStore.getState().getMergedWantedIds(uid ?? undefined);
      idsRef.current = ids;
      if (uid) usePresenceStore.getState().setPresenceInitial({ [uid]: true });
      if (ids.length > 0) socketService.subscribePresence(ids);
      const isReconnect = !firstConnectRef.current;
      firstConnectRef.current = false;
      if (isReconnect && ids.length > 0) {
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
