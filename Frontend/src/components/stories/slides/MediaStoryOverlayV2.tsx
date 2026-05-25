import type { CSSProperties } from 'react';
import {
  STORY_CANVAS_HEIGHT,
  STORY_CANVAS_WIDTH,
  type OverlayStyleV2,
  type StoryLayer,
  type TextStoryLayer,
} from '@/components/stories/create/types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from '@/components/stories/create/storySticker.constants';
import { getTextStyleRender } from '@/components/stories/create/utils/storyTextStyles';

type MediaStoryOverlayV2Props = {
  overlayStyle: OverlayStyleV2;
};

function layerPositionStyle(layer: StoryLayer): CSSProperties {
  const { transform: t } = layer;
  return {
    position: 'absolute',
    left: `${(t.x / STORY_CANVAS_WIDTH) * 100}%`,
    top: `${(t.y / STORY_CANVAS_HEIGHT) * 100}%`,
    transform: `translate(-50%, -50%) rotate(${t.rotation}deg) scale(${t.scale})`,
    transformOrigin: 'center center',
    pointerEvents: 'none',
  };
}

function ViewerTextLayer({ layer }: { layer: TextStoryLayer }) {
  if (!layer.text.trim()) return null;
  const styleRender = getTextStyleRender(layer.style.id, layer.style.align);
  return (
    <div style={layerPositionStyle(layer)} className="max-w-[85%]">
      <p className={`whitespace-pre-wrap break-words ${styleRender.className}`} style={styleRender.style}>
        {layer.text}
      </p>
    </div>
  );
}

function ViewerStickerLayer({ layer }: { layer: Extract<StoryLayer, { type: 'sticker' }> }) {
  return (
    <div
      style={{
        ...layerPositionStyle(layer),
        fontSize: STORY_STICKER_BASE_FONT_PX * layer.transform.scale,
        lineHeight: 1,
      }}
      aria-hidden
    >
      {layer.emoji}
    </div>
  );
}

export function MediaStoryOverlayV2({ overlayStyle }: MediaStoryOverlayV2Props) {
  const layers = overlayStyle.layers ?? [];
  if (layers.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center">
      <div className="relative aspect-[9/16] h-full max-h-full w-auto max-w-full">
        {layers.map((layer) =>
          layer.type === 'text' ? (
            <ViewerTextLayer key={layer.id} layer={layer} />
          ) : (
            <ViewerStickerLayer key={layer.id} layer={layer} />
          )
        )}
      </div>
    </div>
  );
}
