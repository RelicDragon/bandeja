import type { StoryLayer, TextStoryLayer } from './types/storyEditor.types';
import { isTextLayer } from './types/storyEditor.types';
import { StoryTextLayer } from './StoryTextLayer';
import { lightHaptic } from '@/utils/lightHaptic';

type StoryTextLayersProps = {
  layers: StoryLayer[];
  stageScale: number;
  selectedLayerId: string | null;
  editingLayerId: string | null;
  onSelectLayer: (layerId: string | null) => void;
  onUpdateLayer: (layerId: string, patch: Partial<Pick<TextStoryLayer, 'text' | 'transform' | 'style'>>) => void;
  onEditStart: (layerId: string) => void;
  onEditEnd: () => void;
  onDeleteLayer: (layerId: string) => void;
  onTransformBegin?: () => void;
  onTransformEnd?: () => void;
};

export function StoryTextLayers({
  layers,
  stageScale,
  selectedLayerId,
  editingLayerId,
  onSelectLayer,
  onUpdateLayer,
  onEditStart,
  onEditEnd,
  onDeleteLayer,
  onTransformBegin,
  onTransformEnd,
}: StoryTextLayersProps) {
  return (
    <>
      {layers.filter(isTextLayer).map((layer) => (
        <StoryTextLayer
          key={layer.id}
          layer={layer}
          stageScale={stageScale}
          selected={selectedLayerId === layer.id}
          editing={editingLayerId === layer.id}
          onSelect={() => {
            lightHaptic();
            onSelectLayer(layer.id);
          }}
          onUpdate={(patch) => onUpdateLayer(layer.id, patch)}
          onEditStart={() => onEditStart(layer.id)}
          onEditEnd={onEditEnd}
          onDelete={() => onDeleteLayer(layer.id)}
          onTransformBegin={onTransformBegin}
          onTransformEnd={onTransformEnd}
        />
      ))}
    </>
  );
}
