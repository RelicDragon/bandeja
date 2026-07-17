import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import type { ChatMessage } from '@/api/chat';
import { ThreadScrollViewport } from './ThreadScrollViewport';
import type { ThreadScrollViewportInput } from './threadScrollViewportTypes';

const mockViewport = {
  containerRef: { current: null },
  innerListRef: { current: null },
  topLoadSentinelRef: { current: null },
  settlingRefs: { layoutSettlingRef: { current: false }, isInitialLoadRef: { current: false } },
  renderContext: {
    virtualItems: [],
    rowCount: 1,
    totalHeight: 0,
    measureElement: () => {},
    rowStyles: new Map(),
    heightTransition: { duration: 0 },
    rowLayoutTransitionEnabled: false,
    eagerMediaMessageIds: new Set<string>(),
  },
  imperativeHandle: { scrollToMessageById: () => {}, scrollToBottomAlign: () => {}, scrollToBottomSmooth: () => {} },
};

const useThreadScrollViewport = vi.fn((_input: ThreadScrollViewportInput) => mockViewport);

vi.mock('./useThreadScrollViewport', () => ({
  useThreadScrollViewport: (input: ThreadScrollViewportInput) => useThreadScrollViewport(input),
}));

vi.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: { children?: React.ReactNode }) => <div {...props}>{children}</div>,
  },
}));

const message = { id: 'm1', content: 'hi', createdAt: '2026-01-01T00:00:00.000Z' } as ChatMessage;

const baseInput = {
  messages: [message],
  threadScrollKey: 'GROUP:g1',
  threadLayoutSettling: false,
  reduceMotion: true,
  hasMoreMessages: true,
  isLoadingMore: true,
  onLoadMore: () => {},
  isSwitchingChatType: true,
};

describe('ThreadScrollViewport', () => {
  it('forwards pagination props to useThreadScrollViewport', () => {
    renderToStaticMarkup(
      <ThreadScrollViewport {...baseInput}>{() => null}</ThreadScrollViewport>
    );
    expect(useThreadScrollViewport).toHaveBeenCalledWith(
      expect.objectContaining({
        hasMoreMessages: true,
        isLoadingMore: true,
        isSwitchingChatType: true,
        onLoadMore: baseInput.onLoadMore,
      })
    );
  });

  it('renders load-more spinner when hook receives loading + hasMore', () => {
    const html = renderToStaticMarkup(
      <ThreadScrollViewport {...baseInput}>{() => null}</ThreadScrollViewport>
    );
    expect(html).toMatch(/animate-spin/);
  });

  it('disables native anchoring because the virtual list owns scroll compensation', () => {
    const html = renderToStaticMarkup(
      <ThreadScrollViewport {...baseInput}>{() => null}</ThreadScrollViewport>
    );
    expect(html).toContain('overflow-anchor:none');
  });
});
