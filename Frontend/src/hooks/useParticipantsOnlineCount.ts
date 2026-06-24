import { useEffect } from 'react';
import { usersApi } from '@/api/users';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';

export function useParticipantsOnlineCount(
  participantIds: string[],
  presenceKey: string,
  enabled: boolean,
): number | null {
  const showOnlineStatus = useAuthStore((s) => s.user?.showOnlineStatus !== false);
  const participantIdsKey = participantIds.join(',');

  usePresenceSubscription(
    showOnlineStatus && enabled ? presenceKey : `${presenceKey}:off`,
    showOnlineStatus && enabled ? participantIds : [],
  );

  useEffect(() => {
    if (!showOnlineStatus || !enabled || participantIds.length === 0) return;
    usersApi.getPresence(participantIds).then((data) => {
      if (Object.keys(data).length > 0) usePresenceStore.getState().setPresenceInitial(data);
    }).catch(() => {});
  }, [showOnlineStatus, enabled, participantIdsKey, participantIds]);

  return usePresenceStore((s) => {
    if (!showOnlineStatus || !enabled || participantIds.length === 0) return null;
    return participantIds.reduce((count, id) => count + (s.isOnline(id) ? 1 : 0), 0);
  });
}
