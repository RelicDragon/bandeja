import type { CSSProperties } from 'react';
import { fitStoryCanvasInStage, type StoryCanvasViewport } from './storyCompositionViewport';

/** Outer stage fills the available area; the 9:16 frame is sized in JS (not CSS aspect-ratio). */
export const STORY_COMPOSITION_STAGE_CLASS =
  'relative h-full w-full overflow-hidden bg-black';

/**
 * CSS `aspect-[9/16] h-full max-w-full` stretches taller than 9:16 on phones
 * (height stays 100% while width clamps). Always size the frame from
 * `fitStoryCanvasInStage` so editor and viewer stay WYSIWYG.
 *
 * No border-radius on the frame itself — that would clip pixels vs the sharp
 * 1080×1920 export. Letterbox polish uses an outer shadow only.
 */
export function storyCompositionFrameStyle(
  viewport: StoryCanvasViewport,
  options?: { polished?: boolean }
): CSSProperties {
  const { frameWidth, frameHeight, offsetX, offsetY } = viewport;
  if (frameWidth <= 0 || frameHeight <= 0) {
    return {
      position: 'absolute',
      left: 0,
      top: 0,
      width: 0,
      height: 0,
      overflow: 'hidden',
      backgroundColor: '#000',
    };
  }
  const letterboxed = offsetX > 0.5 || offsetY > 0.5;
  const polished = options?.polished !== false && letterboxed;
  return {
    position: 'absolute',
    left: offsetX,
    top: offsetY,
    width: frameWidth,
    height: frameHeight,
    overflow: 'hidden',
    backgroundColor: '#000',
    borderRadius: 0,
    ...(polished
      ? {
          boxShadow: '0 0 0 1px rgba(255,255,255,0.1), 0 16px 48px rgba(0,0,0,0.55)',
        }
      : null),
  };
}

export function measureStoryCompositionFrame(
  stageWidth: number,
  stageHeight: number
): StoryCanvasViewport {
  return fitStoryCanvasInStage(stageWidth, stageHeight);
}
