import type { CSSProperties } from 'react';
import {
  DEFAULT_MEDIA_ADJUST,
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type StoryMediaAdjust,
  type Transform2D,
} from '../types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '../storySticker.constants';
import { mediaAdjustToCssFilter } from './storyAdjustFilters';
import { STORY_TEXT_BASE_CANVAS_PX } from './storyTextStyles';
import { defaultMediaTransform, transformToCss } from './storyTransform';
function layerTransformToPercentStyle(
  transform: Transform2D,
  canvas: { width: number; height: number }
): { left: string; top: string; transform: string } {
  const leftPct = (transform.x / canvas.width) * 100;
  const topPct = (transform.y / canvas.height) * 100;
  return {
    left: `${leftPct}%`,
    top: `${topPct}%`,
    transform: `translate(-50%, -50%) rotate(${transform.rotation}deg) scale(${transform.scale})`,
  };
}

export const STORY_COMPOSITION_FRAME_CLASS =
  'relative aspect-[9/16] h-full max-h-full w-auto max-w-full overflow-hidden bg-black';

/** Editor stage width → canvas scale (same as stageScaleFromWidth). */
export function viewportScaleFromFrameWidth(frameWidth: number): number {
  return frameWidth / STORY_CANVAS_WIDTH;
}

export const STORY_TEXT_MAX_WIDTH_CANVAS_PX = 280;

export function textMaxWidthPx(frameScale: number): number {
  return STORY_TEXT_MAX_WIDTH_CANVAS_PX * frameScale;
}

export function textFontSizePx(frameScale: number): number {
  return STORY_TEXT_BASE_CANVAS_PX * frameScale;
}

export function stickerFontSizePx(frameScale: number): number {
  return STORY_STICKER_BASE_FONT_PX * frameScale;
}

export function layerOverlayPositionStyle(
  transform: Transform2D,
  canvas: { width: number; height: number } = {
    width: STORY_CANVAS_WIDTH,
    height: STORY_CANVAS_HEIGHT,
  },
  pointerEvents: CSSProperties['pointerEvents'] = 'none'
): Pick<CSSProperties, 'position' | 'left' | 'top' | 'transform' | 'transformOrigin' | 'pointerEvents'> {
  const pct = layerTransformToPercentStyle(transform, canvas);
  return {
    position: 'absolute',
    left: pct.left,
    top: pct.top,
    transform: pct.transform,
    transformOrigin: 'center center',
    pointerEvents,
  };
}

export function mediaWrapperStyle(
  mediaTransform: Transform2D,
  naturalWidth: number,
  naturalHeight: number,
  frameScale: number,
  mediaAdjust: StoryMediaAdjust = DEFAULT_MEDIA_ADJUST
): CSSProperties {
  const mediaW = naturalWidth > 0 ? naturalWidth : STORY_CANVAS_WIDTH;
  const mediaH = naturalHeight > 0 ? naturalHeight : STORY_CANVAS_HEIGHT;
  return {
    position: 'absolute',
    left: '50%',
    top: '50%',
    width: mediaW * frameScale,
    height: mediaH * frameScale,
    transform: `${transformToCss(mediaTransform, frameScale)} translate(-50%, -50%)`,
    transformOrigin: 'center center',
    filter: mediaAdjustToCssFilter(mediaAdjust),
  };
}

export function resolveCompositionMediaTransform(
  mediaTransform: Transform2D | undefined,
  naturalWidth: number,
  naturalHeight: number
): Transform2D {
  if (mediaTransform) return mediaTransform;
  return defaultMediaTransform(naturalWidth, naturalHeight);
}

export function resolveCompositionMediaAdjust(
  mediaAdjust: StoryMediaAdjust | undefined
): StoryMediaAdjust {
  return mediaAdjust ?? DEFAULT_MEDIA_ADJUST;
}

/** Natural size for layout; fall back to stored display size. */
export function resolveCompositionNaturalSize(
  sourceWidth: number | undefined,
  sourceHeight: number | undefined,
  displayWidth: number,
  displayHeight: number
): { width: number; height: number } {
  if (sourceWidth != null && sourceHeight != null && sourceWidth > 0 && sourceHeight > 0) {
    return { width: sourceWidth, height: sourceHeight };
  }
  return {
    width: displayWidth > 0 ? displayWidth : STORY_CANVAS_WIDTH,
    height: displayHeight > 0 ? displayHeight : STORY_CANVAS_HEIGHT,
  };
}
