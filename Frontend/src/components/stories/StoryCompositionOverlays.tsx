import type { CSSProperties } from 'react';
import type { OverlayStyleV2, StoryLayer, TextStoryLayer } from '@/components/stories/create/types/storyEditor.types';
import {
  layerOverlayPositionStyle,
  stickerFontSizePx,
  textFontSizePx,
  textMaxWidthPx,
} from '@/components/stories/create/utils/storyCompositionLayout';
import { getTextStyleRender } from '@/components/stories/create/utils/storyTextStyles';

type StoryCompositionOverlaysProps = {
  overlayStyle: OverlayStyleV2;
  frameScale: number;
};

function CompositionTextLayer({
  layer,
  frameScale,
  canvas,
}: {
  layer: TextStoryLayer;
  frameScale: number;
  canvas: { width: number; height: number };
}) {
  if (!layer.text.trim()) return null;
  const styleRender = getTextStyleRender(layer.style.id, layer.style.align, textFontSizePx(frameScale));
  const maxWidth = textMaxWidthPx(frameScale);
  return (
    <div style={layerOverlayPositionStyle(layer.transform, canvas)}>
      <p
        className={`whitespace-pre-wrap break-words ${styleRender.className}`}
        style={{ ...styleRender.style, maxWidth }}
      >
        {layer.text}
      </p>
    </div>
  );
}

function CompositionStickerLayer({
  layer,
  frameScale,
}: {
  layer: Extract<StoryLayer, { type: 'sticker' }>;
  frameScale: number;
}) {
  const style: CSSProperties = {
    ...layerOverlayPositionStyle(layer.transform),
    fontSize: stickerFontSizePx(frameScale),
    lineHeight: 1,
  };
  return (
    <div style={style} aria-hidden>
      {layer.emoji}
    </div>
  );
}

export function StoryCompositionOverlays({ overlayStyle, frameScale }: StoryCompositionOverlaysProps) {
  const layers = overlayStyle.layers ?? [];
  if (layers.length === 0) return null;

  const canvas = overlayStyle.canvas;

  return (
    <>
      {layers.map((layer) =>
        layer.type === 'text' ? (
          <CompositionTextLayer key={layer.id} layer={layer} frameScale={frameScale} canvas={canvas} />
        ) : (
          <CompositionStickerLayer key={layer.id} layer={layer} frameScale={frameScale} />
        )
      )}
    </>
  );
}
