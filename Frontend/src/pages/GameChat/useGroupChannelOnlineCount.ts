import { useEffect, useMemo, useState } from 'react';
import { chatApi, type GroupChannel } from '@/api/chat';
import { useParticipantsOnlineCount } from '@/hooks/useParticipantsOnlineCount';

function collectParticipantIds(groupChannel: GroupChannel | null): string[] | null {
  const list = groupChannel?.participants;
  if (!list?.length) return null;
  return [...new Set(list.map((p) => p.userId).filter((id) => id.length > 0))];
}

export function useGroupChannelOnlineCount(groupChannel: GroupChannel | null, enabled: boolean) {
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
  const presenceKey = groupChannel?.id ? `group-chat-header:${groupChannel.id}` : 'group-chat-header:none';

  return useParticipantsOnlineCount(participantIds, presenceKey, enabled);
}
