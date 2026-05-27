import type { MediaNode, StickerNode, StoryDocument } from '../types';
import { drawTextNode } from './canvasText';
import { getMediaNode, getOverlayNodes } from './document';
import { renderStickerBitmap } from './renderStickerBitmap';
import { STORY_CANVAS_HEIGHT, STORY_CANVAS_WIDTH } from './transform';
import { mediaAdjustToCanvasFilter } from './storyPhotoFilters';

function drawMedia(
  ctx: CanvasRenderingContext2D,
  img: HTMLImageElement | ImageBitmap,
  media: MediaNode
): void {
  const { transform: t } = media;
  const mediaW = media.source.naturalWidth ?? ('naturalWidth' in img ? img.naturalWidth : img.width);
  const mediaH = media.source.naturalHeight ?? ('naturalHeight' in img ? img.naturalHeight : img.height);

  ctx.save();
  ctx.filter = mediaAdjustToCanvasFilter(media.adjust);
  ctx.translate(STORY_CANVAS_WIDTH / 2 + t.x, STORY_CANVAS_HEIGHT / 2 + t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(img, -mediaW / 2, -mediaH / 2, mediaW, mediaH);
  ctx.restore();
  ctx.filter = 'none';
}

/** Same center-anchored bitmap path as PhotoStoryKonvaSticker. */
function drawSticker(ctx: CanvasRenderingContext2D, node: StickerNode): void {
  const { transform: t } = node;
  const bitmap = renderStickerBitmap(node.emoji);
  const halfW = bitmap.width / 2;
  const halfH = bitmap.height / 2;
  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);
  ctx.drawImage(bitmap.image, -halfW, -halfH, bitmap.width, bitmap.height);
  ctx.restore();
}

export function renderDocument(
  ctx: CanvasRenderingContext2D,
  doc: StoryDocument,
  mediaImage: HTMLImageElement | ImageBitmap
): void {
  ctx.fillStyle = '#000000';
  ctx.fillRect(0, 0, STORY_CANVAS_WIDTH, STORY_CANVAS_HEIGHT);

  const media = getMediaNode(doc);
  if (media) drawMedia(ctx, mediaImage, media);

  for (const node of getOverlayNodes(doc)) {
    if (node.type === 'text') drawTextNode(ctx, node);
    else if (node.type === 'sticker') drawSticker(ctx, node);
  }
}
