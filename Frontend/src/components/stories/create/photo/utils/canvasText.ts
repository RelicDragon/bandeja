import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import type { TextAlignment, TextNode, TextStylePresetId } from '../types';

export { PHOTO_TEXT_FONT_PX as TEXT_FONT_PX };

type TextMeasureCtx = Pick<CanvasRenderingContext2D, 'measureText'>;

export type CanvasTextLine = { text: string; width: number };

export type CanvasTextLayout = {
  lines: CanvasTextLine[];
  width: number;
  height: number;
  lineHeight: number;
};

function canvasTextLineHeight(fontSize: number): number {
  return fontSize * 1.25;
}

function wrapParagraph(ctx: TextMeasureCtx, paragraph: string, maxWidth: number): CanvasTextLine[] {
  if (!paragraph) return [{ text: '', width: 0 }];
  const words = paragraph.split(/\s+/);
  const lines: CanvasTextLine[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !current) current = candidate;
    else {
      lines.push({ text: current, width: ctx.measureText(current).width });
      current = word;
    }
  }
  if (current) lines.push({ text: current, width: ctx.measureText(current).width });
  return lines.length > 0 ? lines : [{ text: '', width: 0 }];
}

export function measureTextNodeLayout(
  text: string,
  maxWidth = PHOTO_TEXT_MAX_WIDTH_PX
): CanvasTextLayout {
  const measureCanvas = document.createElement('canvas');
  const ctx = measureCanvas.getContext('2d');
  const displayText = text.trim() ? text : ' ';
  if (!ctx) {
    const lineHeight = PHOTO_TEXT_FONT_PX * 1.25;
    return { lines: [{ text: '', width: 0 }], width: 0, height: lineHeight, lineHeight };
  }
  ctx.font = `bold ${PHOTO_TEXT_FONT_PX}px system-ui, -apple-system, sans-serif`;
  return layoutCanvasText(ctx, displayText, PHOTO_TEXT_FONT_PX, maxWidth);
}

/** Local bounds (pre-transform scale) matching drawTextNode padding. */
export function textNodeLocalBounds(
  layout: CanvasTextLayout,
  presetId: TextStylePresetId,
  fontSize = PHOTO_TEXT_FONT_PX
): { width: number; height: number } {
  if (presetId === 'blackBox') {
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.35;
    return { width: layout.width + padX * 2, height: layout.height + padY * 2 };
  }
  if (presetId === 'neon') {
    const pad = Math.ceil(fontSize * 0.35) + 6;
    return { width: layout.width + pad * 2, height: layout.height + pad * 2 };
  }
  if (presetId === 'outline') {
    const stroke = Math.max(2, fontSize * 0.04);
    const pad = stroke + 4;
    return { width: layout.width + pad * 2, height: layout.height + pad * 2 };
  }
  if (presetId === 'gradient') {
    const pad = 8;
    return { width: layout.width + pad * 2, height: layout.height + pad * 2 };
  }
  const padX = 10;
  const padY = Math.ceil(fontSize * 0.06) + Math.ceil(fontSize * 0.15) + 6;
  return { width: layout.width + padX * 2, height: layout.height + padY * 2 };
}

export function layoutCanvasText(
  ctx: TextMeasureCtx,
  text: string,
  fontSize: number,
  maxWidth = PHOTO_TEXT_MAX_WIDTH_PX
): CanvasTextLayout {
  const lineHeight = canvasTextLineHeight(fontSize);
  const lines: CanvasTextLine[] = [];
  for (const paragraph of text.split('\n')) {
    lines.push(...wrapParagraph(ctx, paragraph, maxWidth));
  }
  if (lines.length === 0) lines.push({ text: '', width: 0 });
  const width = Math.min(maxWidth, Math.max(0, ...lines.map((l) => l.width)));
  return { lines, width, height: lineHeight * lines.length, lineHeight };
}

export function applyCanvasTextStyle(
  ctx: CanvasRenderingContext2D,
  presetId: TextStylePresetId,
  fontSize: number,
  align: TextAlignment
): void {
  ctx.font = `bold ${fontSize}px system-ui, -apple-system, sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  switch (presetId) {
    case 'outline':
      ctx.fillStyle = '#ffffff';
      ctx.strokeStyle = 'rgba(0,0,0,0.85)';
      ctx.lineWidth = Math.max(2, fontSize * 0.04);
      break;
    case 'neon':
      ctx.fillStyle = '#67e8f9';
      ctx.shadowColor = 'rgba(34,211,238,0.95)';
      ctx.shadowBlur = fontSize * 0.35;
      break;
    default:
      ctx.fillStyle = '#ffffff';
      ctx.shadowColor = 'rgba(0,0,0,0.55)';
      ctx.shadowBlur = fontSize * 0.15;
      ctx.shadowOffsetY = fontSize * 0.06;
      break;
  }
}

function drawTextLine(
  ctx: CanvasRenderingContext2D,
  line: string,
  presetId: TextStylePresetId,
  fontSize: number,
  align: TextAlignment,
  x: number,
  y: number
): void {
  if (!line) return;
  applyCanvasTextStyle(ctx, presetId, fontSize, align);
  const metrics = ctx.measureText(line);
  const drawX =
    align === 'left' ? x - metrics.width / 2 : align === 'right' ? x + metrics.width / 2 : x;

  if (presetId === 'gradient') {
    const halfW = Math.max(metrics.width / 2, fontSize);
    const grad = ctx.createLinearGradient(drawX - halfW, y, drawX + halfW, y);
    grad.addColorStop(0, '#ec4899');
    grad.addColorStop(0.5, '#a855f7');
    grad.addColorStop(1, '#38bdf8');
    ctx.fillStyle = grad;
    ctx.fillText(line, drawX, y);
  } else if (presetId === 'outline') {
    ctx.strokeText(line, drawX, y);
    ctx.fillText(line, drawX, y);
  } else {
    ctx.fillText(line, drawX, y);
  }
  ctx.shadowColor = 'transparent';
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;
}

export function drawTextNode(ctx: CanvasRenderingContext2D, node: TextNode): void {
  if (!node.text.trim() && !node.text.includes('\n')) return;
  const { transform: t, style } = node;
  const fontSize = PHOTO_TEXT_FONT_PX;

  ctx.save();
  ctx.translate(t.x, t.y);
  ctx.rotate((t.rotation * Math.PI) / 180);
  ctx.scale(t.scale, t.scale);

  applyCanvasTextStyle(ctx, style.id, fontSize, style.align);
  const layout = layoutCanvasText(ctx, node.text, fontSize);
  const startY = -layout.height / 2 + layout.lineHeight / 2;

  if (style.id === 'blackBox' && layout.lines.some((l) => l.text)) {
    const padX = fontSize * 0.45;
    const padY = fontSize * 0.35;
    const boxW = layout.width + padX * 2;
    const boxH = layout.height + padY * 2;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, 12);
    ctx.fill();
  }

  layout.lines.forEach((line, i) => {
    const y = startY + i * layout.lineHeight;
    let x = 0;
    if (style.align === 'left') x = -layout.width / 2 + line.width / 2;
    else if (style.align === 'right') x = layout.width / 2 - line.width / 2;
    drawTextLine(ctx, line.text, style.id, fontSize, style.align, x, y);
  });

  ctx.restore();
}
