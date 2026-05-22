const IDLE_TIMEOUT_MS = 120;

export function scheduleChatOpenIdle(fn: () => void): void {
  const run = () => {
    try {
      fn();
    } catch {
      /* ignore */
    }
  };
  if (typeof requestIdleCallback !== 'undefined') {
    requestIdleCallback(run, { timeout: IDLE_TIMEOUT_MS });
  } else {
    setTimeout(run, IDLE_TIMEOUT_MS);
  }
}

/** Run after first paint (two animation frames). */
export function scheduleAfterThreadPaint(fn: () => void): void {
  requestAnimationFrame(() => {
    requestAnimationFrame(fn);
  });
}
