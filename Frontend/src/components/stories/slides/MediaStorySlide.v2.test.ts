import { describe, expect, it } from 'vitest';
import {
  getMediaStoryOverlayVisibility,
  getV1PositionClass,
  getV1TextThemeClass,
  isOverlayStyleV2,
  layerTransformToPercentStyle,
  parseStoryOverlay,
} from './mediaStoryOverlay';

describe('isOverlayStyleV2', () => {
  it('detects v2 overlay with canvas dimensions', () => {
    expect(
      isOverlayStyleV2({
        version: 2,
        canvas: { width: 1080, height: 1920 },
        layers: [],
      })
    ).toBe(true);
  });

  it('rejects v1 position/theme shape', () => {
    expect(isOverlayStyleV2({ position: 'top', theme: 'light' })).toBe(false);
    expect(isOverlayStyleV2(null)).toBe(false);
    expect(isOverlayStyleV2({ version: 2 })).toBe(false);
  });
});

describe('parseStoryOverlay', () => {
  it('returns none when no text and not v2', () => {
    expect(parseStoryOverlay(undefined)).toEqual({ kind: 'none' });
    expect(parseStoryOverlay({ position: 'top' }, '   ')).toEqual({ kind: 'none' });
  });

  it('parses v1 overlay with defaults', () => {
    expect(parseStoryOverlay(undefined, 'Hello')).toEqual({
      kind: 'v1',
      overlayText: 'Hello',
      position: 'center',
      theme: 'dark',
    });
    expect(parseStoryOverlay({ position: 'bottom', theme: 'light' }, 'Hi')).toEqual({
      kind: 'v1',
      overlayText: 'Hi',
      position: 'bottom',
      theme: 'light',
    });
  });

  it('parses v2 overlay and ignores legacy overlayText for structure', () => {
    const v2 = {
      version: 2 as const,
      canvas: { width: 1080, height: 1920 },
      layers: [
        {
          id: 't1',
          type: 'text' as const,
          text: 'Layer',
          transform: { x: 540, y: 960, scale: 1, rotation: 0 },
        },
      ],
    };
    const parsed = parseStoryOverlay(v2, 'ignored');
    expect(parsed.kind).toBe('v2');
    if (parsed.kind === 'v2') {
      expect(parsed.layers).toHaveLength(1);
      expect(parsed.overlayStyle.version).toBe(2);
    }
  });
});

describe('getMediaStoryOverlayVisibility', () => {
  it('shows live v2 layers for video, not legacy text', () => {
    const v2 = {
      version: 2 as const,
      canvas: { width: 1080, height: 1920 },
      layers: [
        {
          id: 't1',
          type: 'text' as const,
          text: 'Hi',
          transform: { x: 540, y: 960, scale: 1, rotation: 0 },
        },
      ],
    };
    expect(getMediaStoryOverlayVisibility(v2, 'Hi')).toEqual({
      showV2Overlay: true,
      showLegacyOverlayText: false,
    });
  });

  it('hides legacy text when v2 is baked into the image', () => {
    const v2 = {
      version: 2 as const,
      canvas: { width: 1080, height: 1920 },
      baked: true,
      layers: [
        {
          id: 't1',
          type: 'text' as const,
          text: 'Baked',
          transform: { x: 540, y: 960, scale: 1, rotation: 0 },
        },
      ],
    };
    expect(getMediaStoryOverlayVisibility(v2, 'Baked')).toEqual({
      showV2Overlay: false,
      showLegacyOverlayText: false,
    });
  });

  it('shows legacy v1 text only without v2 overlay', () => {
    expect(getMediaStoryOverlayVisibility(null, 'Hello')).toEqual({
      showV2Overlay: false,
      showLegacyOverlayText: true,
    });
  });
});

describe('getV1PositionClass / getV1TextThemeClass', () => {
  it('maps v1 position to tailwind classes', () => {
    expect(getV1PositionClass('top')).toBe('top-[20%]');
    expect(getV1PositionClass('bottom')).toBe('bottom-[18%]');
    expect(getV1PositionClass('center')).toBe('top-1/2 -translate-y-1/2');
  });

  it('maps v1 theme to text/background classes', () => {
    expect(getV1TextThemeClass('light')).toBe('text-gray-900 bg-white/85');
    expect(getV1TextThemeClass('dark')).toBe('text-white bg-black/45');
  });
});

describe('layerTransformToPercentStyle', () => {
  it('converts canvas-space transform to percent positioning', () => {
    expect(
      layerTransformToPercentStyle(
        { x: 540, y: 960, scale: 1.5, rotation: 90 },
        { width: 1080, height: 1920 }
      )
    ).toEqual({
      left: '50%',
      top: '50%',
      transform: 'translate(-50%, -50%) rotate(90deg) scale(1.5)',
    });
  });
});
