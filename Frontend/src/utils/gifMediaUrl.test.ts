import { describe, expect, it } from 'vitest';
import { looksLikeGifMediaUrl } from './gifMediaUrl';

describe('looksLikeGifMediaUrl', () => {
  it('detects .gif extensions', () => {
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/giphy-abc.gif')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/photo.jpg')).toBe(false);
  });

  it('detects gif before query strings / transform params', () => {
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/giphy-abc.gif?w=200')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/anim.gif.v1')).toBe(true);
  });

  it('detects re-hosted provider stems (animated webp/png)', () => {
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/giphy.webp')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/giphy.png')).toBe(true);
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/regular.webp')).toBe(false);
  });

  it('detects gif-provider hosts', () => {
    expect(looksLikeGifMediaUrl('https://media.giphy.com/media/abc/giphy.gif')).toBe(true);
    expect(looksLikeGifMediaUrl('https://media1.tenor.com/m/abc/aaa.gif')).toBe(true);
  });

  it('returns false for empty / non-url / non-gif', () => {
    expect(looksLikeGifMediaUrl('')).toBe(false);
    expect(looksLikeGifMediaUrl(null)).toBe(false);
    expect(looksLikeGifMediaUrl(undefined)).toBe(false);
    expect(looksLikeGifMediaUrl('https://cdn.example/chat/photo.png')).toBe(false);
  });
});
