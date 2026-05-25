import { useCallback } from 'react';
import { createId } from '@paralleldrive/cuid2';
import type { StoryLayer, StorySlide, StickerStoryLayer, Transform2D } from '../types/storyEditor.types';
import { defaultStickerTransform } from '../utils/storyTransform';

export function createStickerLayer(emoji: string): StickerStoryLayer {
  return {
    id: createId(),
    type: 'sticker',
    emoji,
    transform: defaultStickerTransform(),
  };
}

type PatchSlide = (updater: (slide: StorySlide) => StorySlide) => void;

export function useStoryEditorStickers(patchSlide: PatchSlide) {
  const addSticker = useCallback(
    (emoji: string) => {
      const layer = createStickerLayer(emoji);
      patchSlide((slide) => ({
        ...slide,
        layers: [...slide.layers, layer],
      }));
      return layer.id;
    },
    [patchSlide]
  );

  const updateStickerTransform = useCallback(
    (layerId: string, patch: Partial<Transform2D>) => {
      patchSlide((slide) => ({
        ...slide,
        layers: slide.layers.map((l) =>
          l.id === layerId && l.type === 'sticker'
            ? { ...l, transform: { ...l.transform, ...patch } }
            : l
        ),
      }));
    },
    [patchSlide]
  );

  const removeSticker = useCallback(
    (layerId: string) => {
      patchSlide((slide) => ({
        ...slide,
        layers: slide.layers.filter((l) => l.id !== layerId),
      }));
    },
    [patchSlide]
  );

  return { addSticker, updateStickerTransform, removeSticker };
}

export function filterStickerLayers(layers: StoryLayer[]): StickerStoryLayer[] {
  return layers.filter((l): l is StickerStoryLayer => l.type === 'sticker');
}
