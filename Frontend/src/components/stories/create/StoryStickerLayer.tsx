import { useCallback, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { lightHaptic } from '@/utils/lightHaptic';
import type { StickerStoryLayer, Transform2D } from './types/storyEditor.types';
import { STORY_STICKER_BASE_FONT_PX } from './storySticker.constants';
import { useLayerTransformHandles } from './hooks/useLayerTransformHandles';
import { StoryLayerTransformHandles } from './StoryLayerTransformHandles';
import { transformToCss } from './utils/storyTransform';

type StoryStickerLayerProps = {
  layer: StickerStoryLayer;
  stageScale: number;
  selected: boolean;
  reducedMotion?: boolean;
  onSelect: (layerId: string) => void;
  onTransformChange: (layerId: string, patch: Partial<Transform2D>) => void;
  onDelete: (layerId: string) => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
};

export function StoryStickerLayer({
  layer,
  stageScale,
  selected,
  reducedMotion = false,
  onSelect,
  onTransformChange,
  onDelete,
  onTransformBegin,
  onTransformEnd,
}: StoryStickerLayerProps) {
  const { t } = useTranslation();
  const rootRef = useRef<HTMLDivElement>(null);

  const applyTransform = useCallback(
    (transform: Transform2D) => onTransformChange(layer.id, transform),
    [layer.id, onTransformChange]
  );

  const { handlePointerDown, handlePointerMove, handlePointerUp } = useLayerTransformHandles({
    layerRef: rootRef,
    transform: layer.transform,
    stageScale,
    onTransformChange: applyTransform,
    onTransformBegin,
    onTransformEnd,
  });

  const { transform } = layer;
  const transitionClass = reducedMotion ? '' : 'transition-[transform,box-shadow] duration-150';

  const layerStyle: CSSProperties = {
    left: 0,
    top: 0,
    zIndex: selected ? 50 : 10,
    transform: `${transformToCss(transform, stageScale)} translate(-50%, -50%)`,
    transformOrigin: 'center center',
    fontSize: STORY_STICKER_BASE_FONT_PX * stageScale,
    lineHeight: 1,
  };

  return (
    <div
      ref={rootRef}
      className={`absolute touch-none select-none ${transitionClass}`}
      style={layerStyle}
      onPointerDown={(e) => {
        if (e.button !== 0) return;
        onSelect(layer.id);
        handlePointerDown(e, 'move');
      }}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      <span
        className={`block leading-none ${selected ? 'ring-2 ring-sky-400/90 rounded-lg' : ''}`}
        role="img"
        aria-hidden
      >
        {layer.emoji}
      </span>

      {selected ? (
        <StoryLayerTransformHandles
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerUp}
          deleteLabel={t('stories.editor.deleteLayer')}
          onDelete={() => {
            lightHaptic();
            onDelete(layer.id);
          }}
        />
      ) : null}
    </div>
  );
}
