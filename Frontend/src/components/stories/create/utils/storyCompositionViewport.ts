import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  isOverlayStyleV1,
  isOverlayStyleV2,
  type OverlayStyleV1,
  type OverlayStyleV2,
  type StoryMediaAdjust,
  type Transform2D,
} from '../types/storyEditor.types';
import {
  clearCompositionCanvas,
  drawCompositionOverlays,
} from './storyCompositionDraw';
import {
  resolveCompositionMediaAdjust,
  resolveCompositionMediaTransform,
  resolveCompositionNaturalSize,
  viewportScaleFromFrameWidth,
} from './storyCompositionLayout';

export const STORY_CANVAS_ASPECT = STORY_CANVAS_WIDTH / STORY_CANVAS_HEIGHT;

export type StoryCanvasViewport = {
  frameWidth: number;
  frameHeight: number;
  offsetX: number;
  offsetY: number;
};

/** Fit 1080×1920 canvas inside stage (same letterboxing as `STORY_COMPOSITION_FRAME_CLASS`). */
export function fitStoryCanvasInStage(stageWidth: number, stageHeight: number): StoryCanvasViewport {
  if (stageWidth <= 0 || stageHeight <= 0) {
    return { frameWidth: 0, frameHeight: 0, offsetX: 0, offsetY: 0 };
  }
  const stageAspect = stageWidth / stageHeight;
  if (stageAspect > STORY_CANVAS_ASPECT) {
    const frameHeight = stageHeight;
    const frameWidth = frameHeight * STORY_CANVAS_ASPECT;
    return {
      frameWidth,
      frameHeight,
      offsetX: (stageWidth - frameWidth) / 2,
      offsetY: 0,
    };
  }
  const frameWidth = stageWidth;
  const frameHeight = frameWidth / STORY_CANVAS_ASPECT;
  return {
    frameWidth,
    frameHeight,
    offsetX: 0,
    offsetY: (stageHeight - frameHeight) / 2,
  };
}

export { viewportScaleFromFrameWidth };

export type StoryViewerPresentation = {
  overlayV2: OverlayStyleV2 | null;
  overlayV1: OverlayStyleV1 | null;
  useCompositionMedia: boolean;
  showCanvasOverlay: boolean;
  showDetachedOverlay: boolean;
  showLegacyOverlayText: boolean;
  legacyOverlayText?: string;
  v1PositionClass: string;
  v1TextThemeClass: string;
  naturalWidth: number;
  naturalHeight: number;
  mediaTransform: Transform2D;
  mediaAdjust: StoryMediaAdjust;
};

export function resolveStoryViewerPresentation(input: {
  overlayStyle: unknown;
  overlayText?: string;
  isVideo: boolean;
  displayWidth: number;
  displayHeight: number;
}): StoryViewerPresentation {
  const overlayV2 = isOverlayStyleV2(input.overlayStyle) ? input.overlayStyle : null;
  const overlayV1 = isOverlayStyleV1(input.overlayStyle) ? input.overlayStyle : null;
  const hasV2Layers = (overlayV2?.layers?.length ?? 0) > 0;
  const showCanvasOverlay = overlayV2 != null && !overlayV2.baked && hasV2Layers;
  const useCompositionMedia = overlayV2 != null && !overlayV2.baked;
  const showDetachedOverlay = false;
  const showLegacyOverlayText = !!input.overlayText?.trim() && overlayV2 == null;

  const { width: naturalWidth, height: naturalHeight } = resolveCompositionNaturalSize(
    overlayV2?.sourceWidth,
    overlayV2?.sourceHeight,
    input.displayWidth,
    input.displayHeight
  );

  return {
    overlayV2,
    overlayV1,
    useCompositionMedia,
    showCanvasOverlay,
    showDetachedOverlay,
    showLegacyOverlayText,
    legacyOverlayText: input.overlayText,
    v1PositionClass: getV1PositionClass(overlayV1?.position),
    v1TextThemeClass: getV1TextThemeClass(overlayV1?.theme),
    naturalWidth,
    naturalHeight,
    mediaTransform: resolveCompositionMediaTransform(
      overlayV2?.mediaTransform,
      naturalWidth,
      naturalHeight
    ),
    mediaAdjust: resolveCompositionMediaAdjust(overlayV2?.mediaAdjust),
  };
}

type OverlayPositionV1 = 'top' | 'center' | 'bottom';
type OverlayThemeV1 = 'light' | 'dark';

function getV1PositionClass(position: OverlayPositionV1 = 'center'): string {
  if (position === 'top') return 'top-[20%]';
  if (position === 'bottom') return 'bottom-[18%]';
  return 'top-1/2 -translate-y-1/2';
}

function getV1TextThemeClass(theme: OverlayThemeV1 = 'dark'): string {
  return theme === 'light' ? 'text-gray-900 bg-white/85' : 'text-white bg-black/45';
}

/** Paint v2 overlay layers into a display canvas at frame scale (viewer + editor preview). */
export function paintCompositionOverlaysToCanvas(
  canvas: HTMLCanvasElement,
  overlay: OverlayStyleV2,
  frameScale: number
): void {
  const frameW = STORY_CANVAS_WIDTH * frameScale;
  const frameH = STORY_CANVAS_HEIGHT * frameScale;
  if (frameW <= 0 || frameH <= 0) return;

  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1;
  const bitmapW = Math.round(frameW * dpr);
  const bitmapH = Math.round(frameH * dpr);
  if (canvas.width !== bitmapW || canvas.height !== bitmapH) {
    canvas.width = bitmapW;
    canvas.height = bitmapH;
  }

  const ctx = canvas.getContext('2d', { desynchronized: true });
  if (!ctx) return;
  ctx.setTransform(0, 0, 0, 0, 0, 0);
  clearCompositionCanvas(ctx, {
    transparentBackground: true,
    width: bitmapW,
    height: bitmapH,
  });
  ctx.setTransform(frameScale * dpr, 0, 0, frameScale * dpr, 0, 0);
  drawCompositionOverlays(ctx, overlay);
}
