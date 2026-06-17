import { useCallback, useRef } from 'react';

/** First scroll into a calendar day fades the separator; virtual remounts do not replay. */
export function useMessageListSeenDateSeparators(resetKey?: string) {
  const seenRef = useRef(new Set<string>());
  const prevResetRef = useRef(resetKey);

  if (resetKey !== prevResetRef.current) {
    seenRef.current = new Set();
    prevResetRef.current = resetKey;
  }

  const consumeDateSeparatorFade = useCallback((label: string | null | undefined): boolean => {
    if (!label || seenRef.current.has(label)) return false;
    seenRef.current.add(label);
    return true;
  }, []);

  return consumeDateSeparatorFade;
}
