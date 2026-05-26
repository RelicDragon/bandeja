import { createId } from '@paralleldrive/cuid2';
import { defaultStickerTransform } from './transform';
import type { StickerNode } from '../types';

export function createStickerLayer(emoji: string): StickerNode {
  return {
    id: createId(),
    type: 'sticker',
    emoji,
    transform: defaultStickerTransform(),
  };
}
