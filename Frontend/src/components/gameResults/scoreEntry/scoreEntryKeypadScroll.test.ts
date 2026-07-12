import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { scheduleScrollToRevealBottom, scrollToRevealBottom } from './scoreEntryKeypadScroll';

describe('scoreEntryKeypadScroll', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.stubGlobal('requestAnimationFrame', (cb: FrameRequestCallback) => {
      cb(0);
      return 1;
    });
    vi.stubGlobal('cancelAnimationFrame', vi.fn());
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('scrolls when target bottom extends below container viewport', () => {
    const container = {
      getBoundingClientRect: () => ({ bottom: 400, top: 100 }),
      scrollBy: vi.fn(),
    } as unknown as HTMLElement;
    const target = {
      getBoundingClientRect: () => ({ bottom: 520, top: 300 }),
    } as unknown as HTMLElement;

    expect(scrollToRevealBottom(container, target, 16, 'auto')).toBe(true);
    expect(container.scrollBy).toHaveBeenCalledWith({ top: 136, behavior: 'auto' });
  });

  it('does not scroll when target already fits', () => {
    const container = {
      getBoundingClientRect: () => ({ bottom: 500, top: 100 }),
      scrollBy: vi.fn(),
    } as unknown as HTMLElement;
    const target = {
      getBoundingClientRect: () => ({ bottom: 480, top: 300 }),
    } as unknown as HTMLElement;

    expect(scrollToRevealBottom(container, target, 16, 'auto')).toBe(false);
    expect(container.scrollBy).not.toHaveBeenCalled();
  });

  it('schedules follow-up scroll passes after animation', () => {
    const container = {
      getBoundingClientRect: () => ({ bottom: 400, top: 100 }),
      scrollBy: vi.fn(),
    } as unknown as HTMLElement;
    const target = {
      getBoundingClientRect: () => ({ bottom: 520, top: 300 }),
    } as unknown as HTMLElement;

    const cancel = scheduleScrollToRevealBottom(container, target);
    expect(container.scrollBy).toHaveBeenCalledTimes(2);
    vi.advanceTimersByTime(240);
    expect(container.scrollBy).toHaveBeenCalledTimes(3);
    vi.advanceTimersByTime(180);
    expect(container.scrollBy).toHaveBeenCalledTimes(4);
    cancel();
  });
});
