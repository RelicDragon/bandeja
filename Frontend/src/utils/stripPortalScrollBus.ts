const listeners = new Set<() => void>();
let rafId = 0;

function flush(): void {
  rafId = 0;
  for (const fn of listeners) {
    fn();
  }
}

function schedule(): void {
  if (rafId !== 0) return;
  rafId = requestAnimationFrame(flush);
}

export function subscribeStripPortalScroll(fn: () => void): () => void {
  listeners.add(fn);
  if (listeners.size === 1) {
    window.addEventListener('scroll', schedule, true);
    window.addEventListener('resize', schedule);
  }
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) {
      window.removeEventListener('scroll', schedule, true);
      window.removeEventListener('resize', schedule);
      if (rafId !== 0) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }
  };
}
