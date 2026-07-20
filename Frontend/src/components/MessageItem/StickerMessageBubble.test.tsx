import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { StickerMessageBubble } from './StickerMessageBubble';

vi.mock('@/hooks/useChatMediaAsset', () => ({
  useChatMediaAsset: () => ({
    asset: null,
    recordDimensions: vi.fn(),
  }),
}));

vi.mock('@/hooks/useStickerAsset', () => ({
  useStickerAsset: () => ({
    displayUrl: 'https://cdn.example/sticker.webp',
    staticUrl: 'https://cdn.example/sticker.webp',
    animatedUrl: null,
    loading: false,
    missing: false,
    sticker: null,
  }),
}));

vi.mock('@/hooks/usePrefersReducedMotion', () => ({
  usePrefersReducedMotion: () => false,
}));

vi.mock('@/hooks/useVisibleRef', () => ({
  useVisibleRef: () => ({
    setNode: vi.fn(),
    visible: true,
  }),
}));

describe('StickerMessageBubble', () => {
  it('keeps a fixed canvas and renders the source while the media cache is cold', () => {
    const html = renderToStaticMarkup(
      <StickerMessageBubble message={{ stickerId: 'sticker-1', stickerEmoji: '🎉' }} />
    );

    expect(html).toContain('class="flex h-40 w-40');
    expect(html).toContain('src="https://cdn.example/sticker.webp"');
  });

  it('renders a non-clickable bubble when no tap handler is supplied', () => {
    const html = renderToStaticMarkup(
      <StickerMessageBubble message={{ stickerId: 'sticker-1', stickerEmoji: '🎉' }} />
    );
    expect(html).toContain('<button');
    expect(html).toContain('cursor-default');
  });

  it('renders a clickable button when an onStickerClick handler is supplied', () => {
    const html = renderToStaticMarkup(
      <StickerMessageBubble
        message={{ stickerId: 'sticker-1', stickerEmoji: '🎉' }}
        onStickerClick={() => undefined}
      />
    );
    expect(html).toContain('<button');
    expect(html).toContain('cursor-pointer');
  });
});
