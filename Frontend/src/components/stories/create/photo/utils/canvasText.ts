import { PHOTO_TEXT_FONT_PX, PHOTO_TEXT_MAX_WIDTH_PX } from '../constants';
import type { TextAlignment, TextNode, TextStylePresetId } from '../types';
import {
  TEXT_BLACK_BOX_BG,
  TEXT_BLACK_BOX_PAD_X_RATIO,
  TEXT_BLACK_BOX_PAD_Y_RATIO,
  TEXT_BLACK_BOX_RADIUS_RATIO,
  TEXT_CLASSIC_FILL,
  TEXT_CLASSIC_SHADOW_BLUR_RATIO,
  TEXT_CLASSIC_SHADOW_COLOR,
  TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO,
  TEXT_GRADIENT_STOPS,
  TEXT_NEON_FILL,
  TEXT_NEON_SHADOW_BLUR_RATIO,
  TEXT_NEON_SHADOW_COLOR,
  TEXT_OUTLINE_FILL,
  TEXT_OUTLINE_STROKE_COLOR,
  canvasFont,
  outlineStrokeWidthPx,
} from './textStyleMetrics';

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

type IntlSegmenter = new (
  loc?: string,
  opts?: { granularity?: string }
) => { segment: (s: string) => Iterable<{ segment: string }> };

function splitGraphemesFallback(word: string): string[] {
  const out: string[] = [];
  for (let i = 0; i < word.length; ) {
    const code = word.charCodeAt(i);
    if (code >= 0xd800 && code <= 0xdbff && i + 1 < word.length) {
      const next = word.charCodeAt(i + 1);
      if (next >= 0xdc00 && next <= 0xdfff) {
        out.push(word.slice(i, i + 2));
        i += 2;
        continue;
      }
    }
    out.push(word[i]!);
    i += 1;
  }
  return out;
}

function splitGraphemes(word: string): string[] {
  const Segmenter = (Intl as unknown as { Segmenter?: IntlSegmenter }).Segmenter;
  if (typeof Segmenter === 'function') {
    return Array.from(new Segmenter(undefined, { granularity: 'grapheme' }).segment(word), (s) => s.segment);
  }
  return splitGraphemesFallback(word);
}

/** Greedy grapheme fill — same break points as CSS `overflow-wrap: break-word` in the edit overlay. */
function breakLongWord(ctx: TextMeasureCtx, word: string, maxWidth: number): string[] {
  const chunks: string[] = [];
  let current = '';
  for (const grapheme of splitGraphemes(word)) {
    const candidate = current + grapheme;
    if (!current || ctx.measureText(candidate).width <= maxWidth) current = candidate;
    else {
      chunks.push(current);
      current = grapheme;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

function wrapParagraph(ctx: TextMeasureCtx, paragraph: string, maxWidth: number): CanvasTextLine[] {
  if (!paragraph) return [{ text: '', width: 0 }];
  const words = paragraph.split(/\s+/);
  const lines: CanvasTextLine[] = [];
  let current = '';
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth) {
      current = candidate;
      continue;
    }
    if (current) {
      lines.push({ text: current, width: ctx.measureText(current).width });
      current = '';
    }
    if (ctx.measureText(word).width <= maxWidth) {
      current = word;
      continue;
    }
    const chunks = breakLongWord(ctx, word, maxWidth);
    current = chunks.pop() ?? '';
    for (const chunk of chunks) {
      lines.push({ text: chunk, width: ctx.measureText(chunk).width });
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
  ctx.font = canvasFont(PHOTO_TEXT_FONT_PX);
  return layoutCanvasText(ctx, displayText, PHOTO_TEXT_FONT_PX, maxWidth);
}

/** Local bounds (pre-transform scale) matching drawTextNode padding. */
export function textNodeLocalBounds(
  layout: CanvasTextLayout,
  presetId: TextStylePresetId,
  fontSize = PHOTO_TEXT_FONT_PX
): { width: number; height: number } {
  if (presetId === 'blackBox') {
    const padX = fontSize * TEXT_BLACK_BOX_PAD_X_RATIO;
    const padY = fontSize * TEXT_BLACK_BOX_PAD_Y_RATIO;
    return { width: layout.width + padX * 2, height: layout.height + padY * 2 };
  }
  if (presetId === 'neon') {
    const pad = Math.ceil(fontSize * TEXT_NEON_SHADOW_BLUR_RATIO) + 6;
    return { width: layout.width + pad * 2, height: layout.height + pad * 2 };
  }
  if (presetId === 'outline') {
    const stroke = outlineStrokeWidthPx(fontSize);
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
  ctx.font = canvasFont(fontSize);
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  switch (presetId) {
    case 'outline':
      ctx.fillStyle = TEXT_OUTLINE_FILL;
      ctx.strokeStyle = TEXT_OUTLINE_STROKE_COLOR;
      ctx.lineWidth = outlineStrokeWidthPx(fontSize);
      break;
    case 'neon':
      ctx.fillStyle = TEXT_NEON_FILL;
      ctx.shadowColor = TEXT_NEON_SHADOW_COLOR;
      ctx.shadowBlur = fontSize * TEXT_NEON_SHADOW_BLUR_RATIO;
      break;
    default:
      ctx.fillStyle = TEXT_CLASSIC_FILL;
      ctx.shadowColor = TEXT_CLASSIC_SHADOW_COLOR;
      ctx.shadowBlur = fontSize * TEXT_CLASSIC_SHADOW_BLUR_RATIO;
      ctx.shadowOffsetY = fontSize * TEXT_CLASSIC_SHADOW_OFFSET_Y_RATIO;
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
    grad.addColorStop(0, TEXT_GRADIENT_STOPS[0]);
    grad.addColorStop(0.5, TEXT_GRADIENT_STOPS[1]);
    grad.addColorStop(1, TEXT_GRADIENT_STOPS[2]);
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
    const padX = fontSize * TEXT_BLACK_BOX_PAD_X_RATIO;
    const padY = fontSize * TEXT_BLACK_BOX_PAD_Y_RATIO;
    const boxW = layout.width + padX * 2;
    const boxH = layout.height + padY * 2;
    ctx.fillStyle = TEXT_BLACK_BOX_BG;
    ctx.beginPath();
    ctx.roundRect(-boxW / 2, -boxH / 2, boxW, boxH, fontSize * TEXT_BLACK_BOX_RADIUS_RATIO);
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
