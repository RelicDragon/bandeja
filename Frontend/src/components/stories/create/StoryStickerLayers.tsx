import type { StoryLayer } from './types/storyEditor.types';
import { isStickerLayer } from './types/storyEditor.types';
import { StoryStickerLayer } from './StoryStickerLayer';
import type { Transform2D } from './types/storyEditor.types';
import { lightHaptic } from '@/utils/lightHaptic';

type StoryStickerLayersProps = {
  layers: StoryLayer[];
  stageScale: number;
  selectedLayerId: string | null;
  reducedMotion?: boolean;
  onSelectLayer: (layerId: string | null) => void;
  onStickerTransformChange: (layerId: string, patch: Partial<Transform2D>) => void;
  onDeleteLayer: (layerId: string) => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
};

export function StoryStickerLayers({
  layers,
  stageScale,
  selectedLayerId,
  reducedMotion,
  onSelectLayer,
  onStickerTransformChange,
  onDeleteLayer,
  onTransformBegin,
  onTransformEnd,
}: StoryStickerLayersProps) {
  return (
    <>
      {layers.filter(isStickerLayer).map((layer) => (
        <StoryStickerLayer
          key={layer.id}
          layer={layer}
          stageScale={stageScale}
          selected={selectedLayerId === layer.id}
          reducedMotion={reducedMotion}
          onSelect={(id) => {
            lightHaptic();
            onSelectLayer(id);
          }}
          onTransformChange={onStickerTransformChange}
          onDelete={onDeleteLayer}
          onTransformBegin={onTransformBegin}
          onTransformEnd={onTransformEnd}
        />
      ))}
    </>
  );
}
