import { useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import {
  CHAT_TAIL_ENTER_MARK_SEEN_MS_MAX,
  chatTailEnterMarkSeenMs,
} from '@/components/chat/chatListMotion';
import { partitionMessageListNewKeys } from './partitionMessageListNewKeys';

export const TAIL_ENTER_MARK_SEEN_MS = CHAT_TAIL_ENTER_MARK_SEEN_MS_MAX;

/** Tracks message row keys seen in the current thread; tail appends animate before being marked seen. */
export function useMessageListNewKeys(
  keys: readonly string[],
  resetKey?: string
): ReadonlySet<string> {
  const seenRef = useRef(new Set<string>());
  const prevResetRef = useRef(resetKey);
  const prevKeysRef = useRef<readonly string[]>([]);
  const deferTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const [seenRevision, bumpSeenRevision] = useReducer((n: number) => n + 1, 0);

  if (resetKey !== prevResetRef.current) {
    for (const t of deferTimersRef.current) clearTimeout(t);
    deferTimersRef.current = [];
    seenRef.current = new Set();
    prevResetRef.current = resetKey;
    prevKeysRef.current = [];
  }

  const newKeys = useMemo(() => {
    void seenRevision;
    const next = new Set<string>();
    for (const key of keys) {
      if (!seenRef.current.has(key)) next.add(key);
    }
    return next;
  }, [keys, seenRevision]);

  useLayoutEffect(() => {
    const prev = prevKeysRef.current;
    const { immediate, deferred } = partitionMessageListNewKeys(keys, prev, seenRef.current);

    for (const key of immediate) seenRef.current.add(key);
    prevKeysRef.current = keys;

    if (immediate.length > 0) bumpSeenRevision();

    for (const key of deferred) {
      const staggerIndex = keys.indexOf(key);
      const delay = chatTailEnterMarkSeenMs(staggerIndex);
      const timer = setTimeout(() => {
        deferTimersRef.current = deferTimersRef.current.filter((t) => t !== timer);
        if (!seenRef.current.has(key)) {
          seenRef.current.add(key);
          bumpSeenRevision();
        }
      }, delay);
      deferTimersRef.current.push(timer);
    }

    return () => {
      for (const t of deferTimersRef.current) clearTimeout(t);
      deferTimersRef.current = [];
    };
  }, [keys]);

  return newKeys;
}
