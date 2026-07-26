import type { StoryDocument } from '../types';
import { getMediaNode, getOverlayNodes } from './document';

/** Stable content fingerprint for publish skip / re-publish decisions (no File blobs). */
export function storyDocumentContentHash(doc: StoryDocument, caption?: string): string {
  const media = getMediaNode(doc);
  const overlays = getOverlayNodes(doc).map((node) => {
    if (node.type === 'text') {
      return {
        type: 'text' as const,
        id: node.id,
        text: node.text,
        transform: node.transform,
        style: node.style,
      };
    }
    return {
      type: 'sticker' as const,
      id: node.id,
      emoji: node.emoji,
      transform: node.transform,
    };
  });

  return JSON.stringify({
    caption: caption?.trim() ?? '',
    previewUrl: media?.source.previewUrl ?? '',
    // Omit naturalWidth/Height — filled async after load; must not invalidate hash.
    transform: media?.transform ?? null,
    adjust: media?.adjust ?? null,
    overlays,
  });
}
