import { describe, expect, it } from 'vitest';
import { PHOTO_TEXT_FONT_PX } from '../constants';
import {
  TEXT_CLASSIC_SHADOW_BLUR_RATIO,
  TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO,
  TEXT_NEON_SHADOW_BLUR_RATIO,
  classicTextShadowCss,
  neonTextShadowCss,
  outlineStrokeWidthPx,
} from './textStyleMetrics';

describe('textStyleMetrics', () => {
  it('outline stroke matches canvas minimum', () => {
    expect(outlineStrokeWidthPx(10)).toBe(2);
    expect(outlineStrokeWidthPx(100)).toBe(4);
  });

  it('classic shadow CSS uses same em ratios as canvas', () => {
    expect(classicTextShadowCss()).toBe(
      `0 ${TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO}em ${TEXT_CLASSIC_SHADOW_BLUR_RATIO}em rgba(0,0,0,0.55)`
    );
  });

  it('neon shadow CSS uses same blur ratio as canvas', () => {
    expect(neonTextShadowCss()).toBe(`0 0 ${TEXT_NEON_SHADOW_BLUR_RATIO}em rgba(34,211,238,0.95)`);
    expect(TEXT_NEON_SHADOW_BLUR_RATIO).toBeCloseTo(0.35, 5);
    expect(TEXT_CLASSIC_SHADOW_BLUR_RATIO).toBeCloseTo(0.15, 5);
    expect(TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO).toBeCloseTo(0.06, 5);
    expect(PHOTO_TEXT_FONT_PX).toBe(60);
  });
});
