export const STORY_CANVAS_WIDTH = 1080;
export const STORY_CANVAS_HEIGHT = 1920;

export type Transform2D = { x: number; y: number; scale: number; rotation: number };

export type TextAlignment = 'left' | 'center' | 'right';

export type TextStylePresetId = 'classic' | 'blackBox' | 'gradient' | 'outline' | 'neon';

export type TextStylePreset = {
  id: TextStylePresetId;
  align: TextAlignment;
};

export type TextStoryLayer = {
  id: string;
  type: 'text';
  text: string;
  transform: Transform2D;
  style: TextStylePreset;
};

export type StickerStoryLayer = {
  id: string;
  type: 'sticker';
  emoji: string;
  transform: Transform2D;
};

export type StoryLayer = TextStoryLayer | StickerStoryLayer;

export type OverlayStyleV1 = {
  position?: 'top' | 'center' | 'bottom';
  theme?: 'light' | 'dark';
};

export type OverlayStyleV2 = {
  version: 2;
  canvas: { width: 1080; height: 1920 };
  /** Pixel size of source media when mediaTransform was authored (editor / export). */
  sourceWidth?: number;
  sourceHeight?: number;
  mediaTransform?: Transform2D;
  mediaAdjust?: StoryMediaAdjust;
  layers?: StoryLayer[];
  baked?: boolean;
};

export type StoryMediaAdjust = {
  brightness: number;
  contrast: number;
  saturation: number;
  filterId?: string;
};

export type MediaAdjust = StoryMediaAdjust;

export const DEFAULT_MEDIA_ADJUST: StoryMediaAdjust = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

export type StorySlideMedia = {
  file: File;
  type: 'IMAGE' | 'VIDEO';
  previewUrl: string;
  naturalWidth?: number;
  naturalHeight?: number;
};

export type VideoTrimRange = {
  startMs: number;
  endMs: number;
};

export type StorySlide = {
  id: string;
  media: StorySlideMedia;
  mediaTransform: Transform2D;
  mediaAdjust: StoryMediaAdjust;
  layers: StoryLayer[];
  videoTrim?: VideoTrimRange;
};

export type StoryMediaFile = {
  file: File;
  mediaType: 'IMAGE' | 'VIDEO';
};

export const STORY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_TRANSFORM: Transform2D = { x: 0, y: 0, scale: 1, rotation: 0 };

export type StoryEditorTool = 'text' | 'sticker' | 'adjust' | 'crop' | 'trim' | null;

export type StoryEditorMode =
  | 'IDLE'
  | 'LAYER_SELECTED'
  | 'TOOL_ACTIVE'
  | 'EDITING_TEXT'
  | 'CROP'
  | 'TRIM';

export type EditorTool = 'none' | 'text' | 'adjust' | 'crop' | 'trim';

/** Shallow clone for gesture live ref (keeps File on media; copies transforms/layers). */
export function cloneSlideForLive(slide: StorySlide): StorySlide {
  return {
    ...slide,
    mediaTransform: { ...slide.mediaTransform },
    mediaAdjust: { ...slide.mediaAdjust },
    layers: slide.layers.map((layer) =>
      layer.type === 'text'
        ? { ...layer, transform: { ...layer.transform }, style: { ...layer.style } }
        : { ...layer, transform: { ...layer.transform } }
    ),
    ...(slide.videoTrim != null ? { videoTrim: { ...slide.videoTrim } } : {}),
  };
}

export function isTextLayer(layer: StoryLayer): layer is TextStoryLayer {
  return layer.type === 'text';
}

export function isStickerLayer(layer: StoryLayer): layer is StickerStoryLayer {
  return layer.type === 'sticker';
}

export function buildOverlayStyleV2(slide: StorySlide): OverlayStyleV2 {
  const hasAdjust =
    slide.mediaAdjust.brightness !== 100 ||
    slide.mediaAdjust.contrast !== 100 ||
    slide.mediaAdjust.saturation !== 100 ||
    !!slide.mediaAdjust.filterId;
  const nw = slide.media.naturalWidth;
  const nh = slide.media.naturalHeight;
  return {
    version: 2,
    canvas: { width: STORY_CANVAS_WIDTH, height: STORY_CANVAS_HEIGHT },
    ...(nw != null && nh != null && nw > 0 && nh > 0
      ? { sourceWidth: nw, sourceHeight: nh }
      : {}),
    mediaTransform: slide.mediaTransform,
    mediaAdjust: hasAdjust ? slide.mediaAdjust : undefined,
    layers: slide.layers.length > 0 ? slide.layers : undefined,
  };
}

export function isOverlayStyleV2(style: unknown): style is OverlayStyleV2 {
  return typeof style === 'object' && style !== null && (style as OverlayStyleV2).version === 2;
}

export function isOverlayStyleV1(style: unknown): style is OverlayStyleV1 {
  return typeof style === 'object' && style !== null && !('version' in style);
}
