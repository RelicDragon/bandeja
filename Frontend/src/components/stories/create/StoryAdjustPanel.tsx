import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import Slider from 'rc-slider';
import { STORY_FILTER_PRESETS } from './utils/storyAdjustFilters';
import type { StoryMediaAdjust } from './types/storyEditor.types';
import { DEFAULT_MEDIA_ADJUST } from './types/storyEditor.types';

type StoryAdjustPanelProps = {
  adjust: StoryMediaAdjust;
  onLiveChange: (adjust: StoryMediaAdjust) => void;
  onCommit: (adjust: StoryMediaAdjust) => void;
  disabled?: boolean;
};

function SliderRow({
  label,
  value,
  onLiveChange,
  onCommit,
  disabled = false,
}: {
  label: string;
  value: number;
  onLiveChange: (v: number) => void;
  onCommit: (v: number) => void;
  disabled?: boolean;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs text-white/80">
        <span>{label}</span>
        <span>{value}</span>
      </div>
      <Slider
        min={0}
        max={200}
        value={value}
        disabled={disabled}
        onChange={(v) => onLiveChange(v as number)}
        onChangeComplete={(v) => onCommit(v as number)}
      />
    </div>
  );
}

export function StoryAdjustPanel({ adjust, onLiveChange, onCommit, disabled = false }: StoryAdjustPanelProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(adjust);

  useEffect(() => {
    setLocal(adjust);
  }, [adjust]);

  const patchLive = (partial: Partial<StoryMediaAdjust>) => {
    const next = { ...local, ...partial };
    setLocal(next);
    onLiveChange(next);
  };

  const patchCommit = (partial: Partial<StoryMediaAdjust>) => {
    const next = { ...local, ...partial };
    setLocal(next);
    onCommit(next);
  };

  return (
    <div className="px-4 py-3 space-y-3">
      <SliderRow
        label={t('stories.editor.brightness')}
        value={local.brightness}
        disabled={disabled}
        onLiveChange={(brightness) => patchLive({ brightness })}
        onCommit={(brightness) => patchCommit({ brightness })}
      />
      <SliderRow
        label={t('stories.editor.contrast')}
        value={local.contrast}
        disabled={disabled}
        onLiveChange={(contrast) => patchLive({ contrast })}
        onCommit={(contrast) => patchCommit({ contrast })}
      />
      <SliderRow
        label={t('stories.editor.saturation')}
        value={local.saturation}
        disabled={disabled}
        onLiveChange={(saturation) => patchLive({ saturation })}
        onCommit={(saturation) => patchCommit({ saturation })}
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {STORY_FILTER_PRESETS.map((preset) => {
          const active =
            preset.id === 'none'
              ? !local.filterId &&
                local.brightness === DEFAULT_MEDIA_ADJUST.brightness &&
                local.contrast === DEFAULT_MEDIA_ADJUST.contrast &&
                local.saturation === DEFAULT_MEDIA_ADJUST.saturation
              : local.filterId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next = {
                  brightness: preset.adjust.brightness ?? DEFAULT_MEDIA_ADJUST.brightness,
                  contrast: preset.adjust.contrast ?? DEFAULT_MEDIA_ADJUST.contrast,
                  saturation: preset.adjust.saturation ?? DEFAULT_MEDIA_ADJUST.saturation,
                  filterId: preset.adjust.filterId,
                };
                setLocal(next);
                onLiveChange(next);
                onCommit(next);
              }}
              className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-medium ${
                active ? 'bg-white text-black' : 'bg-white/15 text-white'
              }`}
            >
              {t(preset.labelKey)}
            </button>
          );
        })}
      </div>
    </div>
  );
}
