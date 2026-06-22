import { useCallback, useEffect, useRef, type RefObject } from 'react';

export type ContainerEventUnsubscribe = () => void;

export type ThreadScrollContainerEvents = {
  subscribe: (listener: () => void) => ContainerEventUnsubscribe;
  tick: () => void;
};

/**
 * Single scroll + resize multiplexer for the thread scroll container.
 * All viewport-side scroll reactions register here — no duplicate listeners.
 */
export function useThreadScrollContainerEvents(
  containerRef: RefObject<HTMLDivElement | null>,
  active: boolean
): ThreadScrollContainerEvents {
  const listenersRef = useRef(new Set<() => void>());

  const subscribe = useCallback((listener: () => void) => {
    listenersRef.current.add(listener);
    return () => {
      listenersRef.current.delete(listener);
    };
  }, []);

  const tick = useCallback(() => {
    listenersRef.current.forEach((listener) => listener());
  }, []);

  useEffect(() => {
    if (!active) return;
    const el = containerRef.current;
    if (!el) return;

    const dispatch = () => {
      listenersRef.current.forEach((listener) => listener());
    };

    el.addEventListener('scroll', dispatch, { passive: true });
    const ro = new ResizeObserver(dispatch);
    ro.observe(el);
    dispatch();

    return () => {
      el.removeEventListener('scroll', dispatch);
      ro.disconnect();
    };
  }, [containerRef, active]);

  return { subscribe, tick };
}
