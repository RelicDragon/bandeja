import { STORY_TEXT_MAX_WIDTH_CANVAS_PX } from './storyCompositionLayout';

export type TextMeasureCtx = Pick<CanvasRenderingContext2D, 'measureText'>;

export type CanvasTextLine = {
  text: string;
  width: number;
};

export type CanvasTextLayout = {
  lines: CanvasTextLine[];
  width: number;
  height: number;
  lineHeight: number;
};

export function canvasTextLineHeight(fontSize: number): number {
  return fontSize * 1.25;
}

function wrapParagraph(
  ctx: TextMeasureCtx,
  paragraph: string,
  maxWidth: number
): CanvasTextLine[] {
  if (!paragraph) return [{ text: '', width: 0 }];

  const words = paragraph.split(/\s+/);
  const lines: CanvasTextLine[] = [];
  let current = '';

  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    const width = ctx.measureText(candidate).width;
    if (width <= maxWidth || !current) {
      current = candidate;
      continue;
    }
    lines.push({ text: current, width: ctx.measureText(current).width });
    current = word;
  }

  if (current) {
    lines.push({ text: current, width: ctx.measureText(current).width });
  }

  return lines.length > 0 ? lines : [{ text: '', width: 0 }];
}

export function layoutCanvasText(
  ctx: TextMeasureCtx,
  text: string,
  fontSize: number,
  maxWidth: number = STORY_TEXT_MAX_WIDTH_CANVAS_PX
): CanvasTextLayout {
  const lineHeight = canvasTextLineHeight(fontSize);
  const paragraphs = text.split('\n');
  const lines: CanvasTextLine[] = [];

  for (const paragraph of paragraphs) {
    lines.push(...wrapParagraph(ctx, paragraph, maxWidth));
  }

  if (lines.length === 0) {
    lines.push({ text: '', width: 0 });
  }

  const width = Math.min(maxWidth, Math.max(0, ...lines.map((l) => l.width)));
  const height = lineHeight * lines.length;

  return { lines, width, height, lineHeight };
}
