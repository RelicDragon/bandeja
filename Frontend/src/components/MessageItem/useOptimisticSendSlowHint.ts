import { useEffect, useState } from 'react';

const SLOW_SEND_HINT_MS = 8_000;

export function useOptimisticSendSlowHint(isSending: boolean, createdAt: string | undefined): boolean {
  const [slow, setSlow] = useState(false);

  useEffect(() => {
    if (!isSending) {
      setSlow(false);
      return;
    }
    const started = createdAt ? new Date(createdAt).getTime() : Date.now();
    const delay = Math.max(0, SLOW_SEND_HINT_MS - (Date.now() - started));
    if (delay === 0) {
      setSlow(true);
      return;
    }
    const id = setTimeout(() => setSlow(true), delay);
    return () => clearTimeout(id);
  }, [isSending, createdAt]);

  return slow;
}
