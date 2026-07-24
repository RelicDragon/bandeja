import { describe, expect, it } from 'vitest';
import { resolveChatImageDisplayUrl, resolveChatImageFullscreenUrl } from './utils';

describe('resolveChatImageDisplayUrl', () => {
  it('uses animated GIF normally and its static thumbnail for reduced motion', () => {
    const gif = 'https://cdn.example.com/chat/animated.gif';
    const thumbnail = 'https://cdn.example.com/chat/animated_thumb.jpg';

    expect(resolveChatImageDisplayUrl(gif, thumbnail)).toBe(gif);
    expect(resolveChatImageDisplayUrl(gif, thumbnail, true)).toBe(thumbnail);
  });
});

describe('resolveChatImageFullscreenUrl', () => {
  it('always prefers the original photo URL over the grid thumbnail', () => {
    const original = 'https://cdn.example.com/uploads/chat/originals/a.jpg';
    const thumbnail = 'https://cdn.example.com/uploads/chat/thumbnails/a_thumb.jpg';

    expect(resolveChatImageFullscreenUrl(original, thumbnail)).toBe(original);
    expect(resolveChatImageFullscreenUrl(original, thumbnail, true)).toBe(original);
  });

  it('uses the static GIF thumbnail only when reduce motion is on', () => {
    const gif = 'https://cdn.example.com/chat/animated.gif';
    const thumbnail = 'https://cdn.example.com/chat/animated_thumb.jpg';

    expect(resolveChatImageFullscreenUrl(gif, thumbnail)).toBe(gif);
    expect(resolveChatImageFullscreenUrl(gif, thumbnail, true)).toBe(thumbnail);
  });
});
