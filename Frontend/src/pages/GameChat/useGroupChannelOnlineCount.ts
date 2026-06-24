import { useEffect, useMemo, useState } from 'react';
import { chatApi, type GroupChannel } from '@/api/chat';
import { usersApi } from '@/api/users';
import { usePresenceSubscription } from '@/hooks/usePresenceSubscription';
import { usePresenceStore } from '@/store/presenceStore';
import { useAuthStore } from '@/store/authStore';

function collectParticipantIds(groupChannel: GroupChannel | null): string[] | null {
  const list = groupChannel?.participants;
  if (!list?.length) return null;
  return [...new Set(list.map((p) => p.userId).filter((id) => id.length > 0))];
}

export function useGroupChannelOnlineCount(groupChannel: GroupChannel | null, enabled: boolean) {
  const showOnlineStatus = useAuthStore((s) => s.user?.showOnlineStatus !== false);
  const embeddedIds = useMemo(() => collectParticipantIds(groupChannel), [groupChannel]);
  const [fetchedIds, setFetchedIds] = useState<string[]>([]);

  useEffect(() => {
    if (!enabled || !groupChannel?.id) {
      setFetchedIds([]);
      return;
    }
    if (embeddedIds?.length) {
      setFetchedIds([]);
      return;
    }
    let cancelled = false;
    chatApi.getGroupChannelParticipants(groupChannel.id).then((rows) => {
      if (cancelled) return;
      setFetchedIds([...new Set(rows.map((p) => p.userId).filter((id) => id.length > 0))]);
    }).catch(() => {
      if (!cancelled) setFetchedIds([]);
    });
    return () => {
      cancelled = true;
    };
  }, [enabled, groupChannel?.id, embeddedIds]);

  const participantIds = embeddedIds?.length ? embeddedIds : fetchedIds;
  const participantIdsKey = participantIds.join(',');
  const presenceKey = groupChannel?.id ? `group-chat-header:${groupChannel.id}` : 'group-chat-header:none';

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

  const onlineCount = usePresenceStore((s) => {
    if (!showOnlineStatus || !enabled || participantIds.length === 0) return null;
    return participantIds.reduce((count, id) => count + (s.isOnline(id) ? 1 : 0), 0);
  });

  return onlineCount;
}
