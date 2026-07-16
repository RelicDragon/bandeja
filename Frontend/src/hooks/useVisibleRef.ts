import { useEffect, useState } from 'react';

/**
 * Tracks whether `node` intersects the viewport (with a small rootMargin).
 * Defaults to `true` until the first observer callback so preferred assets paint immediately.
 */
export function useVisibleRef(options?: {
  rootMargin?: string;
  threshold?: number;
}): {
  setNode: (node: Element | null) => void;
  visible: boolean;
} {
  const [node, setNode] = useState<Element | null>(null);
  const [visible, setVisible] = useState(true);
  const rootMargin = options?.rootMargin ?? '80px 0px';
  const threshold = options?.threshold ?? 0;

  useEffect(() => {
    if (!node || typeof IntersectionObserver === 'undefined') {
      setVisible(true);
      return;
    }

    // Assume visible until the first callback — avoids a static flash on remount.
    setVisible(true);

    const observer = new IntersectionObserver(
      (entries) => {
        setVisible(entries.some((e) => e.isIntersecting));
      },
      { root: null, rootMargin, threshold }
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [node, rootMargin, threshold]);

  return { setNode, visible };
}
