// @vitest-environment jsdom

import { act, useRef } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useLinkPreview } from './useLinkPreview';

const fetchLinkPreviewDetailed = vi.fn();

vi.mock('@/api/linkPreview', () => ({
  fetchLinkPreviewDetailed: (...args: unknown[]) => fetchLinkPreviewDetailed(...args),
  isRichLinkPreview: (preview: { title?: string } | null | undefined) => !!preview?.title,
}));

vi.mock('@/store/authStore', () => ({
  useAuthStore: {
    getState: () => ({ user: { id: 'viewer-1' } }),
  },
}));

function Harness() {
  const rootRef = useRef<HTMLDivElement>(null);
  const result = useLinkPreview('https://example.com/game', rootRef);
  return (
    <div
      ref={rootRef}
      data-status={result.status}
      data-preview={result.preview?.title ?? ''}
    />
  );
}

describe('useLinkPreview background refresh', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (
      globalThis as typeof globalThis & {
        IS_REACT_ACT_ENVIRONMENT: boolean;
      }
    ).IS_REACT_ACT_ENVIRONMENT = true;
    vi.useFakeTimers();
    fetchLinkPreviewDetailed.mockReset();
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    vi.useRealTimers();
  });

  it('keeps the current card rendered while mutable data refreshes', async () => {
    fetchLinkPreviewDetailed
      .mockResolvedValueOnce({
        preview: { title: 'Game', mutable: true },
        outcome: 'ready',
        retryAfterMs: null,
        snapshotToken: null,
      })
      .mockImplementationOnce(() => new Promise(() => {}));

    act(() => root.render(<Harness />));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(0);
      await Promise.resolve();
    });
    expect(container.firstElementChild?.getAttribute('data-status')).toBe('ready');

    act(() => root.unmount());
    root = createRoot(container);
    act(() => root.render(<Harness />));
    expect(container.firstElementChild?.getAttribute('data-status')).toBe('ready');
    expect(container.firstElementChild?.getAttribute('data-preview')).toBe('Game');
    expect(fetchLinkPreviewDetailed).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(20_000);
    });

    expect(container.firstElementChild?.getAttribute('data-status')).toBe('ready');
    expect(container.firstElementChild?.getAttribute('data-preview')).toBe('Game');
  });
});
