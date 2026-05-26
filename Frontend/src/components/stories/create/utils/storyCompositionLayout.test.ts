import { describe, expect, it } from 'vitest';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { STORY_TEXT_BASE_CANVAS_PX } from './storyTextStyles';
import {
  layerOverlayPositionStyle,
  mediaWrapperStyle,
  resolveCompositionNaturalSize,
  stickerFontSizePx,
  textFontSizePx,
  textMaxWidthPx,
  viewportScaleFromFrameWidth,
} from './storyCompositionLayout';
describe('viewportScaleFromFrameWidth', () => {
  it('maps stage width to canvas scale', () => {
    expect(viewportScaleFromFrameWidth(540)).toBeCloseTo(0.5, 5);
    expect(viewportScaleFromFrameWidth(1080)).toBe(1);
  });
});

describe('layer overlay sizing', () => {
  it('uses percent position and single scale in transform', () => {
    const style = layerOverlayPositionStyle({
      x: 540,
      y: 960,
      scale: 2,
      rotation: 45,
    });
    expect(style.left).toBe('50%');
    expect(style.top).toBe('50%');
    expect(style.transform).toBe('translate(-50%, -50%) rotate(45deg) scale(2)');
  });

  it('scales text and sticker fonts with frame', () => {
    const scale = viewportScaleFromFrameWidth(360);
    expect(textFontSizePx(scale)).toBeCloseTo(STORY_TEXT_BASE_CANVAS_PX * scale, 5);
    expect(stickerFontSizePx(scale)).toBeCloseTo(STORY_STICKER_BASE_FONT_PX * scale, 5);
    expect(textMaxWidthPx(scale)).toBeCloseTo(280 * scale, 5);
  });
});

describe('resolveCompositionNaturalSize', () => {
  it('prefers source dimensions over display size', () => {
    expect(resolveCompositionNaturalSize(4032, 3024, 720, 1280)).toEqual({ width: 4032, height: 3024 });
  });

  it('falls back to display dimensions', () => {
    expect(resolveCompositionNaturalSize(undefined, undefined, 720, 1280)).toEqual({
      width: 720,
      height: 1280,
    });
  });
});

describe('mediaWrapperStyle', () => {
  it('centers media with cover-scale transform', () => {
    const style = mediaWrapperStyle(
      { x: 10, y: -20, scale: 1.2, rotation: 15 },
      2000,
      1500,
      0.5
    );
    expect(style.left).toBe('50%');
    expect(style.top).toBe('50%');
    expect(style.width).toBe(1000);
    expect(style.height).toBe(750);
    expect(String(style.transform)).toContain('translate(5px, -10px)');
    expect(String(style.transform)).toContain('scale(1.2)');
  });
});
