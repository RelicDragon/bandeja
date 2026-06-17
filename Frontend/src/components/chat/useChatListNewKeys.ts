import { useLayoutEffect, useMemo, useReducer, useRef } from 'react';
import { chatTailEnterMarkSeenMs } from './chatListMotion';

function partitionNewKeys(
  keys: readonly string[],
  prev: readonly string[],
  seen: Set<string>
): { immediate: string[]; deferred: string[] } {
  const grew = keys.length > prev.length;
  const addedCount = keys.length - prev.length;
  const isPrepend = grew && prev.length > 0 && keys[0] !== prev[0];
  const isTailAppend =
    grew && !isPrepend && (addedCount === 1 || (prev.length > 0 && keys[0] === prev[0]));

  const immediate: string[] = [];
  const deferred: string[] = [];

  if (isPrepend) {
    const prependCount = keys.length - prev.length;
    for (let i = 0; i < prependCount; i++) {
      seen.add(keys[i]!);
    }
  }

  for (const key of keys) {
    if (seen.has(key)) continue;

    if (isTailAppend) {
      const idx = keys.indexOf(key);
      const isNewTail =
        (prev.length === 0 && addedCount === 1 && idx === 0) ||
        (prev.length > 0 && idx >= prev.length);
      if (isNewTail) {
        deferred.push(key);
        continue;
      }
    }

    immediate.push(key);
  }

  return { immediate, deferred };
}

export function useChatListNewKeys(keys: readonly string[], resetKey?: string): ReadonlySet<string> {
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
    const { immediate, deferred } = partitionNewKeys(keys, prev, seenRef.current);

    for (const key of immediate) seenRef.current.add(key);
    prevKeysRef.current = keys;

    if (immediate.length > 0) bumpSeenRevision();

    for (const key of deferred) {
      const delay = chatTailEnterMarkSeenMs(keys.indexOf(key));
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
