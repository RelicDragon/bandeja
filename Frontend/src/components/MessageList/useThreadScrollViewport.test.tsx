// @vitest-environment jsdom
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Virtualizer } from '@tanstack/react-virtual';
import type { ChatMessage } from '@/api/chat';
import { useThreadScrollViewport } from './useThreadScrollViewport';
import type { ThreadScrollViewportInput } from './threadScrollViewportTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = vi.hoisted(() => ({
  virtualizer: null as Virtualizer<HTMLDivElement, Element> | null,
  save: vi.fn(),
  recordMeasured: vi.fn(),
}));

// Keep the real virtualizer and viewport hooks; supply browser geometry in jsdom.
vi.mock('@tanstack/react-virtual', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-virtual')>();
  return {
    ...actual,
    useVirtualizer: (options: Parameters<typeof actual.useVirtualizer<HTMLDivElement, Element>>[0]) => {
      const virtualizer = actual.useVirtualizer<HTMLDivElement, Element>({
        ...options,
        observeElementRect: (_instance, callback) => { callback({ width: 400, height: 400 }); },
        observeElementOffset: (instance, callback) => {
          const el = instance.scrollElement!;
          const listener = () => callback(el.scrollTop, false);
          listener();
          el.addEventListener('scroll', listener);
          return () => el.removeEventListener('scroll', listener);
        },
        scrollToFn: (offset, { adjustments = 0 }, instance) => {
          if (instance.scrollElement) instance.scrollElement.scrollTop = offset + adjustments;
        },
      });
      state.virtualizer = virtualizer;
      return virtualizer;
    },
  };
});
vi.mock('@/services/chat/rowHeightCache', () => ({
  END_SPACER_PX: 16,
  registerRowHeightBump: vi.fn(),
  rowHeightCacheEstimate: () => 100,
  rowHeightCacheHasDateSeparator: () => false,
  rowHeightCacheRecordMeasured: state.recordMeasured,
  rowHeightCachePreloadTail: vi.fn(),
  rowHeightCacheSeedTailHeuristics: () => false,
}));
vi.mock('@/services/chat/chatThreadScroll', () => ({
  scheduleThreadScrollSave: state.save,
  flushThreadScrollSave: vi.fn(),
}));

const messages = Array.from({ length: 100 }, (_, index) => ({
  id: `m${index}`, content: `Message ${index}`, createdAt: '2026-01-01T00:00:00Z',
} as ChatMessage));

function Harness({ input = {} }: { input?: Partial<ThreadScrollViewportInput> }) {
  const viewport = useThreadScrollViewport({
    messages, threadScrollKey: 'USER:test', threadLayoutSettling: false, reduceMotion: true, ...input,
  });
  return <div ref={viewport.containerRef}><div ref={viewport.innerListRef} /></div>;
}

let root: Root;
let host: HTMLDivElement;
let container: HTMLDivElement;
beforeEach(() => {
  vi.useFakeTimers();
  state.recordMeasured.mockClear();
  state.save.mockClear();
  vi.stubGlobal('ResizeObserver', class { observe() {} unobserve() {} disconnect() {} });
  vi.spyOn(HTMLElement.prototype, 'clientHeight', 'get').mockReturnValue(400);
  vi.spyOn(HTMLElement.prototype, 'scrollHeight', 'get').mockImplementation(() => state.virtualizer?.getTotalSize() ?? 10016);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  act(() => root.render(<Harness />));
  container = host.firstElementChild as HTMLDivElement;
  act(() => {
    container.scrollTop = 5000;
    container.dispatchEvent(new Event('scroll'));
  });
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

describe('thread viewport resize stability', () => {
  it('does not persist unmeasured virtual estimates as DOM measurements', () => {
    expect(state.recordMeasured).not.toHaveBeenCalled();
  });

  it('reuses the full measurement table on ordinary scrolling', () => {
    const measurements = state.virtualizer!.measurementsCache;
    act(() => {
      container.scrollTop = 5100;
      container.dispatchEvent(new Event('scroll'));
    });
    expect(state.virtualizer!.measurementsCache).toBe(measurements);
  });

  it('keeps the visible message at the same pixel when a row above it grows', () => {
    const virtualizer = state.virtualizer!;
    const before = virtualizer.measurementsCache[50].start - container.scrollTop;
    act(() => virtualizer.resizeItem(20, 160));
    expect(virtualizer.measurementsCache[50].start - container.scrollTop).toBe(before);
    expect(container.scrollTop).toBe(5060);
  });

  it('keeps the visible message at the same pixel when a row above it shrinks', () => {
    const virtualizer = state.virtualizer!;
    const before = virtualizer.measurementsCache[50].start - container.scrollTop;
    act(() => virtualizer.resizeItem(20, 60));
    expect(virtualizer.measurementsCache[50].start - container.scrollTop).toBe(before);
  });

  it('does not move the viewport for a row changing below it', () => {
    act(() => state.virtualizer!.resizeItem(80, 160));
    expect(container.scrollTop).toBe(5000);
  });
});


describe('thread open stability', () => {
  it('positions the tail before the first paint while cache layout is settling', () => {
    act(() => root.render(<Harness input={{ threadScrollKey: 'USER:other', initialScroll: { atBottom: true }, threadLayoutSettling: true }} />));
    expect(container.scrollTop).toBe(container.scrollHeight - container.clientHeight);
  });

  it('does not let a previous thread bottom pin move a newly opened history anchor', () => {
    act(() => root.render(<Harness input={{ threadScrollKey: 'USER:bottom', initialScroll: { atBottom: true }, threadLayoutSettling: true }} />));
    act(() => root.render(<Harness input={{ threadScrollKey: 'USER:anchor', initialScroll: { anchorMessageId: 'm50' }, threadLayoutSettling: false }} />));
    const anchorTop = container.scrollTop;
    act(() => vi.advanceTimersByTime(64));
    expect(container.scrollTop).toBe(anchorTop);
  });
});


describe('user control during open', () => {
  it('cancels pending pins when the user wheels into history during settling', () => {
    act(() => root.render(<Harness input={{ threadScrollKey: 'USER:wheel', initialScroll: { atBottom: true }, threadLayoutSettling: true }} />));
    act(() => {
      container.dispatchEvent(new WheelEvent('wheel', { deltaY: -300 }));
      container.scrollTop = 5000;
      container.dispatchEvent(new Event('scroll'));
      vi.advanceTimersByTime(64);
    });
    expect(container.scrollTop).toBe(5000);
  });
});


describe('history restoration', () => {
  it('saves the visible row and its pixel offset, excluding overscan rows', () => {
    act(() => root.render(<Harness input={{ initialScroll: { anchorMessageId: 'm50' } }} />));
    act(() => {
      container.scrollTop = 5050;
      container.dispatchEvent(new Event('scroll'));
    });
    expect(state.save).toHaveBeenLastCalledWith('USER:test', {
      atBottom: false, anchorMessageId: 'm50', anchorOffsetPx: -50,
    });
  });

  it('restores the same pixel within a partially visible message', () => {
    act(() => root.render(<Harness input={{ initialScroll: { anchorMessageId: 'm50', anchorOffsetPx: -50 } }} />));
    expect(container.scrollTop).toBe(5050);
  });
});


describe('older page measurement', () => {
  it('preserves the reading position when prepended rows finish measuring next frame', () => {
    act(() => root.render(<Harness input={{ isLoadingMore: true }} />));
    const older = messages.slice(0, 20).map((m) => ({ ...m, id: `older-${m.id}` }));
    act(() => root.render(<Harness input={{ messages: [...older, ...messages], isLoadingMore: false }} />));
    act(() => container.dispatchEvent(new Event('scroll')));
    const virtualizer = state.virtualizer!;
    const before = virtualizer.measurementsCache[70].start - container.scrollTop;
    act(() => virtualizer.resizeItem(0, 160));
    act(() => vi.advanceTimersByTime(32));
    expect(virtualizer.measurementsCache[70].start - container.scrollTop).toBe(before);
  });
});
