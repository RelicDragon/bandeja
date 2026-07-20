// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest';
import {
  BANDEJA_STICKER_FAVORITES_CHANGED,
  emitStickerFavoritesChanged,
  subscribeStickerFavoritesChanged,
} from './stickerFavoritesEvents';

describe('sticker favorites events', () => {
  it('delivers emitted changes to subscribers', () => {
    const handler = vi.fn();
    const unsubscribe = subscribeStickerFavoritesChanged(handler);
    emitStickerFavoritesChanged({ userId: 'u1' });
    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ userId: 'u1' });
    unsubscribe();
    emitStickerFavoritesChanged({ userId: 'u1' });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('uses a stable event name', () => {
    expect(BANDEJA_STICKER_FAVORITES_CHANGED).toBe('bandeja:sticker-favorites-changed');
  });
});
