import { afterEach, describe, expect, it, vi } from 'vitest';
import { findPrefetchIsReady, scheduleFindPrefetch } from './scheduleFindPrefetch';

describe('scheduleFindPrefetch', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('waits for browser idle time and can be cancelled', () => {
    const callbacks: Array<() => void> = [];
    const cancelIdleCallback = vi.fn();
    vi.stubGlobal('requestIdleCallback', vi.fn((callback: () => void) => {
      callbacks.push(callback);
      return 17;
    }));
    vi.stubGlobal('cancelIdleCallback', cancelIdleCallback);
    const run = vi.fn();

    const cancel = scheduleFindPrefetch(run);
    expect(run).not.toHaveBeenCalled();
    cancel();
    callbacks[0]?.();

    expect(cancelIdleCallback).toHaveBeenCalledWith(17);
    expect(run).not.toHaveBeenCalled();
  });

  it('uses a cancellable timer when idle callbacks are unavailable', () => {
    vi.useFakeTimers();
    vi.stubGlobal('requestIdleCallback', undefined);
    const run = vi.fn();

    const cancel = scheduleFindPrefetch(run);
    vi.advanceTimersByTime(1_500);
    expect(run).toHaveBeenCalledOnce();

    cancel();
  });

  it('keeps speculative requests behind visible calendar data', () => {
    expect(findPrefetchIsReady({
      viewMode: 'calendar',
      calendarPageReady: true,
      calendarIsPlaceholder: false,
      calendarFetching: false,
      calendarContinuing: false,
      selectedDayReady: false,
      upcomingLoading: false,
      upcomingFetching: false,
    })).toBe(false);
    expect(findPrefetchIsReady({
      viewMode: 'calendar',
      calendarPageReady: true,
      calendarIsPlaceholder: false,
      calendarFetching: true,
      calendarContinuing: false,
      selectedDayReady: true,
      upcomingLoading: false,
      upcomingFetching: false,
    })).toBe(false);
    expect(findPrefetchIsReady({
      viewMode: 'calendar',
      calendarPageReady: true,
      calendarIsPlaceholder: false,
      calendarFetching: false,
      calendarContinuing: true,
      selectedDayReady: true,
      upcomingLoading: false,
      upcomingFetching: false,
    })).toBe(false);
    expect(findPrefetchIsReady({
      viewMode: 'calendar',
      calendarPageReady: true,
      calendarIsPlaceholder: false,
      calendarFetching: false,
      calendarContinuing: false,
      selectedDayReady: true,
      upcomingLoading: true,
      upcomingFetching: true,
    })).toBe(true);
  });

  it('keeps speculative requests behind a visible list refresh', () => {
    expect(findPrefetchIsReady({
      viewMode: 'list',
      calendarPageReady: true,
      calendarIsPlaceholder: false,
      calendarFetching: false,
      calendarContinuing: false,
      selectedDayReady: true,
      upcomingLoading: false,
      upcomingFetching: true,
    })).toBe(false);
    expect(findPrefetchIsReady({
      viewMode: 'list',
      calendarPageReady: false,
      calendarIsPlaceholder: true,
      calendarFetching: false,
      calendarContinuing: false,
      selectedDayReady: false,
      upcomingLoading: false,
      upcomingFetching: false,
    })).toBe(true);
  });
});
