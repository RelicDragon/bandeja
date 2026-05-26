export const STORY_CANVAS_WIDTH = 1080;
export const STORY_CANVAS_HEIGHT = 1920;

export type Transform2D = { x: number; y: number; scale: number; rotation: number };

export type TextAlignment = 'left' | 'center' | 'right';

export type TextStylePresetId = 'classic' | 'blackBox' | 'gradient' | 'outline' | 'neon';

export type TextStylePreset = {
  id: TextStylePresetId;
  align: TextAlignment;
};

export type StoryMediaAdjust = {
  brightness: number;
  contrast: number;
  saturation: number;
  filterId?: string;
};

export const DEFAULT_MEDIA_ADJUST: StoryMediaAdjust = {
  brightness: 100,
  contrast: 100,
  saturation: 100,
};

export const DEFAULT_TRANSFORM: Transform2D = { x: 0, y: 0, scale: 1, rotation: 0 };

export type MediaNode = {
  id: string;
  type: 'media';
  mediaType: 'IMAGE';
  source: {
    file: File;
    previewUrl: string;
    naturalWidth?: number;
    naturalHeight?: number;
  };
  transform: Transform2D;
  adjust: StoryMediaAdjust;
};

export type TextNode = {
  id: string;
  type: 'text';
  text: string;
  transform: Transform2D;
  style: TextStylePreset;
};

export type StickerNode = {
  id: string;
  type: 'sticker';
  emoji: string;
  transform: Transform2D;
};

export type GroupNode = {
  id: string;
  type: 'group';
  childIds: string[];
  transform: Transform2D;
};

export type StoryNode = MediaNode | TextNode | StickerNode | GroupNode;

export type StoryDocument = {
  version: 3;
  canvas: { width: typeof STORY_CANVAS_WIDTH; height: typeof STORY_CANVAS_HEIGHT };
  nodes: StoryNode[];
  backgroundId: string;
};

export type StorySession = {
  segments: StoryDocument[];
  caption?: string;
};

export type StoryPhotoTool = 'text' | 'sticker' | 'adjust' | 'crop' | null;

export type StoryPhotoMode = 'IDLE' | 'LAYER_SELECTED' | 'TOOL_ACTIVE' | 'EDITING_TEXT' | 'CROP';

export type StoryMediaFile = {
  file: File;
  mediaType: 'IMAGE';
};

export const STORY_MAX_IMAGE_BYTES = 10 * 1024 * 1024;

export type TextStoryLayer = TextNode & { type: 'text' };
export type StickerStoryLayer = StickerNode & { type: 'sticker' };
export type StoryLayer = TextStoryLayer | StickerStoryLayer;

export function isTextNode(node: StoryNode): node is TextNode {
  return node.type === 'text';
}

export function isStickerNode(node: StoryNode): node is StickerNode {
  return node.type === 'sticker';
}

export function isMediaNode(node: StoryNode): node is MediaNode {
  return node.type === 'media';
}
