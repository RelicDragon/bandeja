import type { OverlayStyleV1, OverlayStyleV2 } from '@/components/stories/create/types/storyEditor.types';
import { resolveStoryViewerPresentation } from '@/components/stories/create/utils/storyCompositionViewport';

export type { OverlayStyleV1, OverlayStyleV2 };

/** Viewer: replay media transform/filters for non-baked video stories. */
export function shouldUseStoryComposition(
  overlayV2: OverlayStyleV2 | null,
  isUserVideo: boolean
): boolean {
  return resolveStoryViewerPresentation({
    overlayStyle: overlayV2,
    isVideo: isUserVideo,
    displayWidth: 1080,
    displayHeight: 1920,
  }).useCompositionMedia;
}

export function getMediaStoryOverlayVisibility(
  overlayV2: OverlayStyleV2 | null,
  overlayText?: string
): { showV2Overlay: boolean; showLegacyOverlayText: boolean } {
  const presentation = resolveStoryViewerPresentation({
    overlayStyle: overlayV2,
    overlayText,
    isVideo: false,
    displayWidth: 1080,
    displayHeight: 1920,
  });
  return {
    showV2Overlay: presentation.showCanvasOverlay,
    showLegacyOverlayText: presentation.showLegacyOverlayText,
  };
}

export function getV1PositionClass(position: 'top' | 'center' | 'bottom' = 'center'): string {
  return resolveStoryViewerPresentation({
    overlayStyle: { position },
    displayWidth: 1080,
    displayHeight: 1920,
    isVideo: false,
  }).v1PositionClass;
}

export function getV1TextThemeClass(theme: 'light' | 'dark' = 'dark'): string {
  return resolveStoryViewerPresentation({
    overlayStyle: { theme },
    displayWidth: 1080,
    displayHeight: 1920,
    isVideo: false,
  }).v1TextThemeClass;
}
