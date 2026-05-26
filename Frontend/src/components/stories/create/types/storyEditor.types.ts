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

export type StorySlide = {
  id: string;
  media: StorySlideMedia;
  mediaTransform: Transform2D;
  mediaAdjust: StoryMediaAdjust;
  layers: StoryLayer[];
};

export type StoryMediaFile = {
  file: File;
  mediaType: 'IMAGE' | 'VIDEO';
};

export const STORY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export const DEFAULT_TRANSFORM: Transform2D = { x: 0, y: 0, scale: 1, rotation: 0 };

export type StoryEditorTool = 'text' | 'sticker' | 'adjust' | 'crop' | null;

export type StoryEditorMode =
  | 'IDLE'
  | 'LAYER_SELECTED'
  | 'TOOL_ACTIVE'
  | 'EDITING_TEXT'
  | 'CROP';

export type EditorTool = 'none' | 'text' | 'adjust' | 'crop';

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
  };
}

export function isTextLayer(layer: StoryLayer): layer is TextStoryLayer {
  return layer.type === 'text';
}

export function isStickerLayer(layer: StoryLayer): layer is StickerStoryLayer {
  return layer.type === 'sticker';
}

