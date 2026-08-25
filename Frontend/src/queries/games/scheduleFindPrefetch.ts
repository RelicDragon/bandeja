const FIND_PREFETCH_IDLE_TIMEOUT_MS = 1_500;

export function findPrefetchIsReady(input: {
  viewMode: 'calendar' | 'list';
  calendarPageReady: boolean;
  calendarIsPlaceholder: boolean;
  calendarFetching: boolean;
  calendarContinuing: boolean;
  selectedDayReady: boolean;
  upcomingLoading: boolean;
  upcomingFetching: boolean;
}): boolean {
  return input.viewMode === 'calendar'
    ? input.calendarPageReady &&
      !input.calendarIsPlaceholder &&
      !input.calendarFetching &&
      !input.calendarContinuing &&
      input.selectedDayReady
    : !input.upcomingLoading && !input.upcomingFetching;
}

/**
 * Keep speculative Find requests behind the visible month/day paint. The
 * returned cleanup prevents a stale render from launching its prefetch batch.
 */
export function scheduleFindPrefetch(run: () => void): () => void {
  let cancelled = false;
  const guardedRun = () => {
    if (!cancelled) run();
  };

  if (typeof requestIdleCallback !== 'undefined') {
    const idleId = requestIdleCallback(guardedRun, {
      timeout: FIND_PREFETCH_IDLE_TIMEOUT_MS,
    });
    return () => {
      cancelled = true;
      if (typeof cancelIdleCallback !== 'undefined') {
        cancelIdleCallback(idleId);
      }
    };
  }

  const timerId = setTimeout(guardedRun, FIND_PREFETCH_IDLE_TIMEOUT_MS);
  return () => {
    cancelled = true;
    clearTimeout(timerId);
  };
}
