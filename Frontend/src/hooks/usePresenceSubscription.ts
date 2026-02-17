import { useEffect, useMemo, useRef } from 'react';
import { usePresenceWantedStore } from '@/store/presenceWantedStore';

function trimIds(ids: string[]): string[] {
  return [...new Set(ids)].filter((id): id is string => typeof id === 'string' && id.length > 0);
}

export function usePresenceSubscription(key: string, userIds: string[]) {
  const setWanted = usePresenceWantedStore((s) => s.setWanted);
  const clearWanted = usePresenceWantedStore((s) => s.clearWanted);
  const trimmed = useMemo(() => trimIds(userIds), [userIds]);
  const keyStr = useMemo(() => trimmed.slice().sort().join(','), [trimmed]);
  const trimmedRef = useRef(trimmed);
  trimmedRef.current = trimmed;

  useEffect(() => {
    setWanted(key, trimmedRef.current);
    return () => clearWanted(key);
  }, [key, keyStr, setWanted, clearWanted]);
}
