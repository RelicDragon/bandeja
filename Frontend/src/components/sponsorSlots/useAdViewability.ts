import { useEffect, useRef } from 'react';

type UseAdViewabilityOptions = {
  enabled: boolean;
  threshold?: number;
  minVisibleMs?: number;
  onViewable: () => void;
};

export function useAdViewability({
  enabled,
  threshold = 0.5,
  minVisibleMs = 1000,
  onViewable,
}: UseAdViewabilityOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const firedRef = useRef(false);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onViewableRef = useRef(onViewable);

  useEffect(() => {
    onViewableRef.current = onViewable;
  }, [onViewable]);

  useEffect(() => {
    firedRef.current = false;
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled || firedRef.current) return;
    const node = rootRef.current;
    if (!node) return;

    const clearTimer = () => {
      if (timerRef.current) {
        clearTimeout(timerRef.current);
        timerRef.current = null;
      }
    };

    const observer = new IntersectionObserver(
      (entries) => {
        const entry = entries[0];
        if (!entry) return;
        if (entry.intersectionRatio >= threshold) {
          if (!timerRef.current && !firedRef.current) {
            timerRef.current = setTimeout(() => {
              if (firedRef.current) return;
              firedRef.current = true;
              onViewableRef.current();
            }, minVisibleMs);
          }
        } else {
          clearTimer();
        }
      },
      { threshold: [0, threshold, 1] },
    );

    observer.observe(node);
    return () => {
      clearTimer();
      observer.disconnect();
    };
  }, [enabled, minVisibleMs, threshold]);

  return rootRef;
}
