import type {
  OverlayStyleV1,
  OverlayStyleV2,
  StoryLayer,
  Transform2D,
} from '@/components/stories/create/types/storyEditor.types';

export type OverlayPositionV1 = 'top' | 'center' | 'bottom';
export type OverlayThemeV1 = 'light' | 'dark';

export type { OverlayStyleV1, OverlayStyleV2 };

export type ParsedStoryOverlay =
  | { kind: 'none' }
  | { kind: 'v1'; overlayText?: string; position: OverlayPositionV1; theme: OverlayThemeV1 }
  | { kind: 'v2'; overlayStyle: OverlayStyleV2; layers: StoryLayer[] };

export function isOverlayStyleV2(raw: unknown): raw is OverlayStyleV2 {
  return (
    typeof raw === 'object' &&
    raw !== null &&
    (raw as OverlayStyleV2).version === 2 &&
    typeof (raw as OverlayStyleV2).canvas?.width === 'number' &&
    typeof (raw as OverlayStyleV2).canvas?.height === 'number'
  );
}

export function parseStoryOverlay(
  overlayStyle: unknown,
  overlayText?: string
): ParsedStoryOverlay {
  if (isOverlayStyleV2(overlayStyle)) {
    return {
      kind: 'v2',
      overlayStyle,
      layers: overlayStyle.layers ?? [],
    };
  }
  if (!overlayText?.trim()) {
    return { kind: 'none' };
  }
  const v1 = (overlayStyle ?? {}) as OverlayStyleV1;
  return {
    kind: 'v1',
    overlayText: overlayText.trim(),
    position: v1.position ?? 'center',
    theme: v1.theme ?? 'dark',
  };
}

/** Viewer: v2 layers render live; v1 uses overlayText. Never stack legacy text on v2/baked media. */
/** Replay editor media transform/filters in the viewer (non-baked video stories). */
export function shouldUseStoryComposition(
  overlayV2: OverlayStyleV2 | null,
  isUserVideo: boolean
): boolean {
  return overlayV2 != null && !overlayV2.baked && isUserVideo;
}

export function getMediaStoryOverlayVisibility(
  overlayV2: OverlayStyleV2 | null,
  overlayText?: string
): { showV2Overlay: boolean; showLegacyOverlayText: boolean } {
  const hasV2Layers = (overlayV2?.layers?.length ?? 0) > 0;
  const showV2Overlay = overlayV2 != null && !overlayV2.baked && hasV2Layers;
  const showLegacyOverlayText = !!overlayText?.trim() && overlayV2 == null;
  return { showV2Overlay, showLegacyOverlayText };
}

export function getV1PositionClass(position: OverlayPositionV1 = 'center'): string {
  if (position === 'top') return 'top-[20%]';
  if (position === 'bottom') return 'bottom-[18%]';
  return 'top-1/2 -translate-y-1/2';
}

export function getV1TextThemeClass(theme: OverlayThemeV1 = 'dark'): string {
  return theme === 'light' ? 'text-gray-900 bg-white/85' : 'text-white bg-black/45';
}

export function layerTransformToPercentStyle(
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
