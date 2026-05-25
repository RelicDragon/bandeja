import { useCallback, useRef, type CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { lightHaptic } from '@/utils/lightHaptic';
import type { StickerStoryLayer, Transform2D } from './types/storyEditor.types';
import { layerOverlayPositionStyle, stickerFontSizePx } from './utils/storyCompositionLayout';
import { useLayerPinchGesture } from './hooks/useLayerPinchGesture';
import { useLayerTransformHandles } from './hooks/useLayerTransformHandles';
import { StoryLayerTransformHandles } from './StoryLayerTransformHandles';

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

  const { transform } = layer;

  const applyTransform = useCallback(
    (next: Transform2D) => onTransformChange(layer.id, next),
    [layer.id, onTransformChange]
  );

  const pinchBind = useLayerPinchGesture({
    transform,
    onTransformChange: (next) => applyTransform(next),
    onTransformBegin,
    onTransformEnd,
    enabled: selected,
  });

  const { handlePointerDown, handlePointerMove, handlePointerUp } = useLayerTransformHandles({
    layerRef: rootRef,
    transform: layer.transform,
    stageScale,
    onTransformChange: applyTransform,
    onTransformBegin,
    onTransformEnd,
  });

  const transitionClass = reducedMotion ? '' : 'transition-[transform,box-shadow] duration-150';

  const layerStyle: CSSProperties = {
    ...layerOverlayPositionStyle(transform, undefined, 'auto'),
    zIndex: selected ? 50 : 10,
    fontSize: stickerFontSizePx(stageScale),
    lineHeight: 1,
  };

  return (
    <div
      ref={rootRef}
      {...(selected ? pinchBind() : {})}
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
