import { describe, expect, it } from 'vitest';
import {
  resolveStickerDisplayUrl,
  resolveStickerMotionMode,
  nextStickerUrlAfterImgError,
} from './resolveStickerDisplayUrl';

const STATIC = 'https://cdn.example/stickers/ball.webp';
const ANIMATED = 'https://cdn.example/stickers/ball.anim.webp';

describe('resolveStickerDisplayUrl', () => {
  it('returns null when both missing', () => {
    expect(resolveStickerDisplayUrl({ reduceMotion: false })).toBeNull();
    expect(resolveStickerDisplayUrl({ reduceMotion: true })).toBeNull();
  });

  it('static-only works with motion on or off', () => {
    expect(
      resolveStickerDisplayUrl({ staticUrl: STATIC, animatedUrl: null, reduceMotion: false })
    ).toBe(STATIC);
    expect(
      resolveStickerDisplayUrl({ staticUrl: STATIC, animatedUrl: null, reduceMotion: true })
    ).toBe(STATIC);
  });

  it('prefers animated when motion allowed', () => {
    expect(
      resolveStickerDisplayUrl({
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
        reduceMotion: false,
      })
    ).toBe(ANIMATED);
  });

  it('forces static under reduced motion even when animated exists', () => {
    expect(
      resolveStickerDisplayUrl({
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
        reduceMotion: true,
      })
    ).toBe(STATIC);
  });

  it('falls back to animated when static missing and motion allowed', () => {
    expect(
      resolveStickerDisplayUrl({
        staticUrl: null,
        animatedUrl: ANIMATED,
        reduceMotion: false,
      })
    ).toBe(ANIMATED);
  });

  it('returns null under reduced motion when only animated exists', () => {
    expect(
      resolveStickerDisplayUrl({
        staticUrl: null,
        animatedUrl: ANIMATED,
        reduceMotion: true,
      })
    ).toBeNull();
  });

  it('trims whitespace', () => {
    expect(
      resolveStickerDisplayUrl({
        staticUrl: `  ${STATIC}  `,
        animatedUrl: ` ${ANIMATED} `,
        reduceMotion: false,
      })
    ).toBe(ANIMATED);
  });
});

describe('resolveStickerMotionMode', () => {
  it('reports animated vs static correctly', () => {
    expect(
      resolveStickerMotionMode({
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
        reduceMotion: false,
      })
    ).toBe('animated');
    expect(
      resolveStickerMotionMode({
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
        reduceMotion: true,
      })
    ).toBe('static');
    expect(
      resolveStickerMotionMode({
        staticUrl: STATIC,
        animatedUrl: null,
        reduceMotion: false,
      })
    ).toBe('static');
    expect(resolveStickerMotionMode({ reduceMotion: false })).toBe('none');
  });
});

describe('nextStickerUrlAfterImgError', () => {
  it('falls back from animated to static', () => {
    expect(
      nextStickerUrlAfterImgError({
        failedUrl: ANIMATED,
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
      })
    ).toBe(STATIC);
  });

  it('returns null when static already failed or missing', () => {
    expect(
      nextStickerUrlAfterImgError({
        failedUrl: STATIC,
        staticUrl: STATIC,
        animatedUrl: ANIMATED,
      })
    ).toBeNull();
    expect(
      nextStickerUrlAfterImgError({
        failedUrl: ANIMATED,
        staticUrl: null,
        animatedUrl: ANIMATED,
      })
    ).toBeNull();
  });
});
