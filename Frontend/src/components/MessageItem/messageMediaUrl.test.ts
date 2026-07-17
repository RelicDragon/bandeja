import { describe, expect, it } from 'vitest';
import { resolveChatImageDisplayUrl } from './utils';

describe('resolveChatImageDisplayUrl', () => {
  it('uses animated GIF normally and its static thumbnail for reduced motion', () => {
    const gif = 'https://cdn.example.com/chat/animated.gif';
    const thumbnail = 'https://cdn.example.com/chat/animated_thumb.jpg';

    expect(resolveChatImageDisplayUrl(gif, thumbnail)).toBe(gif);
    expect(resolveChatImageDisplayUrl(gif, thumbnail, true)).toBe(thumbnail);
  });
});
