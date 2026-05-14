import { useCallback, useEffect, useRef, useState } from 'react';

const HIDE_AFTER_MS = 900;

export function useScrollbarVisibleWhileScrolling() {
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [scrollbarVisible, setScrollbarVisible] = useState(false);

  useEffect(() => {
    return () => {
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, []);

  const onScroll = useCallback(() => {
    setScrollbarVisible(true);
    if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    hideTimerRef.current = setTimeout(() => {
      hideTimerRef.current = undefined;
      setScrollbarVisible(false);
    }, HIDE_AFTER_MS);
  }, []);

  const scrollbarClassName = scrollbarVisible ? 'scrollbar-auto' : 'scrollbar-hide';

  return { scrollRef, onScroll, scrollbarClassName };
}
