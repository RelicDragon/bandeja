// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import type { FullscreenMediaItem } from './chatMediaGallery';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, options?: { defaultValue?: string }) => options?.defaultValue ?? key,
  }),
}));

vi.mock('@/hooks/useBackButtonModal', () => ({
  useBackButtonModal: () => undefined,
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => true,
}));

vi.mock('@/hooks/useChatMediaDownload', () => ({
  useChatMediaDownload: () => ({ state: 'idle', progress: 0 }),
}));

vi.mock('@/hooks/useChatVideoPlaybackUrl', () => ({
  useChatVideoPlaybackUrl: (src: string) => src,
}));

vi.mock('@/components/fullscreenImageViewer/FullscreenImageZoom', async () => {
  const React = await import('react');
  type MockZoomProps = {
    src: string;
    alt?: string;
    onLoad?: () => void;
    onHorizontalSwipeStart?: () => void;
    onHorizontalSwipeMove?: (offsetX: number) => void;
    onHorizontalSwipeEnd?: (offsetX: number, velocityX: number) => void;
  };
  return {
    FullscreenImageZoom: React.forwardRef(function MockFullscreenImageZoom(
      props: MockZoomProps,
      ref: React.ForwardedRef<{ resetTransform: () => void; isZoomed: () => boolean }>,
    ) {
      React.useImperativeHandle(ref, () => ({
        resetTransform: () => undefined,
        isZoomed: () => false,
      }));
      React.useEffect(() => props.onLoad?.(), [props]);
      const swipe = (offsetX: number) => {
        props.onHorizontalSwipeStart?.();
        props.onHorizontalSwipeMove?.(offsetX);
        props.onHorizontalSwipeEnd?.(offsetX, 0);
      };
      return (
        <div data-fullscreen-image-zoom="">
          <img src={props.src} alt={props.alt} data-fullscreen-current-image="" />
          <button type="button" data-testid="mock-swipe-left" onClick={() => swipe(-100)} />
          <button type="button" data-testid="mock-swipe-right" onClick={() => swipe(100)} />
          <button type="button" data-testid="mock-short-swipe" onClick={() => swipe(-20)} />
        </div>
      );
    }),
  };
});

vi.mock('@/services/chat/chatMediaDownloadManager', () => ({
  ensureChatMediaDownloaded: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('@/components/audio/audioWaveformUtils', () => ({
  resolveChatMediaUrl: (src: string) => src,
}));

vi.mock('@/store/videoPlaybackStore', () => {
  const state = {
    activeMessageId: null,
    setActive: vi.fn(),
    clearIfActive: vi.fn(),
  };
  return {
    useVideoPlaybackStore: (selector: (value: typeof state) => unknown) => selector(state),
  };
});

const items: FullscreenMediaItem[] = [
  {
    id: 'first:media:0',
    messageId: 'first',
    mediaIndex: 0,
    kind: 'image',
    originalUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
    previewUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
  },
  {
    id: 'second:media:0',
    messageId: 'second',
    mediaIndex: 0,
    kind: 'video',
    originalUrl: 'data:video/mp4;base64,',
    previewUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>',
  },
  {
    id: 'third:media:0',
    messageId: 'third',
    mediaIndex: 0,
    kind: 'image',
    originalUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>#third',
    previewUrl: 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>#third',
  },
];

function click(element: Element): void {
  element.dispatchEvent(new MouseEvent('click', { bubbles: true }));
}

describe('FullscreenImageViewer chat gallery navigation', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    (globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    document.body.innerHTML = '';
    vi.clearAllMocks();
  });

  it('moves naturally across image and video items with buttons and keyboard', () => {
    const onActiveMediaChange = vi.fn();
    const onClose = vi.fn();

    act(() => {
      root.render(
        <FullscreenImageViewer
          imageUrl={items[0].originalUrl}
          mediaItems={items}
          initialMediaId={items[0].id}
          onActiveMediaChange={onActiveMediaChange}
          onClose={onClose}
          usePortaledOverlay
          enableTransform={false}
        />,
      );
    });

    expect(document.querySelector('[data-testid="fullscreen-media-counter"]')?.textContent)
      .toBe('1 / 3');
    expect(document.querySelector('[data-testid="fullscreen-media-image"]')).not.toBeNull();

    act(() => click(document.querySelector('[data-testid="fullscreen-media-next"]')!));
    expect(onActiveMediaChange).toHaveBeenLastCalledWith(items[1].id);
    expect(document.querySelector('[data-testid="fullscreen-media-video"]')).not.toBeNull();
    expect(document.querySelector('[data-testid="fullscreen-media-counter"]')?.textContent)
      .toBe('2 / 3');

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    });
    expect(onActiveMediaChange).toHaveBeenLastCalledWith(items[2].id);
    expect(document.querySelector('[data-testid="fullscreen-media-counter"]')?.textContent)
      .toBe('3 / 3');

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft', bubbles: true }));
    });
    expect(onActiveMediaChange).toHaveBeenLastCalledWith(items[1].id);

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('uses a media tap to hide and restore distraction-free controls', () => {
    act(() => {
      root.render(
        <FullscreenImageViewer
          imageUrl={items[0].originalUrl}
          mediaItems={items}
          initialMediaId={items[0].id}
          onClose={vi.fn()}
          usePortaledOverlay
          enableTransform={false}
        />,
      );
    });

    const mediaButton = document.querySelector('[data-testid="fullscreen-media-image"] button')!;
    const chrome = document.querySelector('[data-testid="fullscreen-media-counter"]')?.parentElement
      ?.parentElement?.parentElement;
    expect(chrome?.getAttribute('aria-hidden')).toBe('false');

    act(() => click(mediaButton));
    expect(chrome?.getAttribute('aria-hidden')).toBe('true');
    expect(chrome?.hasAttribute('inert')).toBe(true);

    act(() => click(mediaButton));
    expect(chrome?.getAttribute('aria-hidden')).toBe('false');
    expect(chrome?.hasAttribute('inert')).toBe(false);
  });

  it('changes media after a committed left or right swipe, but not a short drag', () => {
    const onActiveMediaChange = vi.fn();

    act(() => {
      root.render(
        <FullscreenImageViewer
          imageUrl={items[0].originalUrl}
          mediaItems={items}
          initialMediaId={items[0].id}
          onActiveMediaChange={onActiveMediaChange}
          onClose={vi.fn()}
          usePortaledOverlay
        />,
      );
    });

    act(() => click(document.querySelector('[data-testid="mock-short-swipe"]')!));
    expect(onActiveMediaChange).not.toHaveBeenCalled();

    act(() => click(document.querySelector('[data-testid="mock-swipe-left"]')!));
    expect(onActiveMediaChange).toHaveBeenLastCalledWith(items[1].id);

    onActiveMediaChange.mockClear();
    act(() => {
      root.render(
        <FullscreenImageViewer
          key="start-from-third"
          imageUrl={items[2].originalUrl}
          mediaItems={items}
          initialMediaId={items[2].id}
          onActiveMediaChange={onActiveMediaChange}
          onClose={vi.fn()}
          usePortaledOverlay
        />,
      );
    });
    act(() => click(document.querySelector('[data-testid="mock-swipe-right"]')!));
    expect(onActiveMediaChange).toHaveBeenLastCalledWith(items[1].id);
  });

  it('loads older chat pages until it finds the previous media, then opens it', () => {
    const onRequestMoreItemsBefore = vi.fn();
    const onActiveMediaChange = vi.fn();
    const current = items[2];
    const older = items[0];

    const render = (
      mediaItems: FullscreenMediaItem[],
      isLoadingMoreItems: boolean,
      sourceItemCount: number,
    ) => {
      root.render(
        <FullscreenImageViewer
          imageUrl={current.originalUrl}
          mediaItems={mediaItems}
          initialMediaId={current.id}
          onActiveMediaChange={onActiveMediaChange}
          hasMoreItemsBefore
          isLoadingMoreItems={isLoadingMoreItems}
          onRequestMoreItemsBefore={onRequestMoreItemsBefore}
          sourceItemCount={sourceItemCount}
          onClose={vi.fn()}
          usePortaledOverlay
          enableTransform={false}
        />,
      );
    };

    act(() => render([current], false, 20));
    act(() => click(document.querySelector('[data-testid="fullscreen-media-previous"]')!));
    expect(onRequestMoreItemsBefore).toHaveBeenCalledTimes(1);

    act(() => render([current], true, 20));
    act(() => render([older, current], false, 40));

    expect(onActiveMediaChange).toHaveBeenLastCalledWith(older.id);
    expect(document.querySelector('[data-testid="fullscreen-media-counter"]')?.textContent)
      .toBe('1 / 2');
  });

  it('shows a retry action when active media fails and remounts it on retry', () => {
    act(() => {
      root.render(
        <FullscreenImageViewer
          imageUrl={items[1].originalUrl}
          mediaItems={items}
          initialMediaId={items[1].id}
          onClose={vi.fn()}
          usePortaledOverlay
        />,
      );
    });

    const firstVideo = document.querySelector('video')!;
    act(() => firstVideo.dispatchEvent(new Event('error')));
    const retry = Array.from(document.querySelectorAll('button')).find(
      (button) => button.textContent === 'Retry',
    );
    expect(retry).toBeDefined();

    act(() => click(retry!));
    expect(document.querySelector('video')).not.toBe(firstVideo);
    expect(Array.from(document.querySelectorAll('button')).some(
      (button) => button.textContent === 'Retry',
    )).toBe(false);
  });
});
