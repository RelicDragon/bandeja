import { useCallback, useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { StoryMediaAdjust } from '../types';
import { DEFAULT_MEDIA_ADJUST } from '../types';
import { STORY_FILTER_PRESETS } from '../utils/storyPhotoFilters';

type PhotoStoryAdjustSheetProps = {
  adjust: StoryMediaAdjust;
  onCommit: (adjust: StoryMediaAdjust) => void;
  disabled?: boolean;
  embedded?: boolean;
};

function SliderRow({
  label,
  value,
  onChange,
  onRelease,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  onRelease: () => void;
  disabled?: boolean;
}) {
  return (
    <label className="flex items-center gap-3 text-xs text-white/80">
      <span className="w-20 shrink-0">{label}</span>
      <input
        type="range"
        min={50}
        max={150}
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(Number(e.target.value))}
        onPointerUp={onRelease}
        onTouchEnd={onRelease}
        className="flex-1 accent-sky-400"
      />
    </label>
  );
}

export function PhotoStoryAdjustSheet({
  adjust,
  onCommit,
  disabled,
  embedded,
}: PhotoStoryAdjustSheetProps) {
  const { t } = useTranslation();
  const [local, setLocal] = useState(adjust);

  useEffect(() => {
    setLocal(adjust);
  }, [adjust]);

  const commitLocal = useCallback(() => {
    onCommit(local);
  }, [local, onCommit]);

  return (
    <div
      className={
        embedded
          ? 'px-4 py-3 space-y-3'
          : 'mx-3 mb-2 rounded-2xl border border-white/10 bg-zinc-900/95 px-4 py-3 space-y-3'
      }
    >
      <p className="text-[10px] text-white/45">{t('stories.editor.adjustPreviewHint', 'Release slider to apply')}</p>
      <SliderRow
        label={t('stories.editor.brightness')}
        value={local.brightness}
        disabled={disabled}
        onChange={(brightness) => setLocal((s) => ({ ...s, brightness }))}
        onRelease={commitLocal}
      />
      <SliderRow
        label={t('stories.editor.contrast')}
        value={local.contrast}
        disabled={disabled}
        onChange={(contrast) => setLocal((s) => ({ ...s, contrast }))}
        onRelease={commitLocal}
      />
      <SliderRow
        label={t('stories.editor.saturation')}
        value={local.saturation}
        disabled={disabled}
        onChange={(saturation) => setLocal((s) => ({ ...s, saturation }))}
        onRelease={commitLocal}
      />
      <div className="flex gap-2 overflow-x-auto scrollbar-hide pb-1">
        {STORY_FILTER_PRESETS.map((preset) => {
          const active =
            preset.id === 'none'
              ? !local.filterId && local.brightness === 100 && local.contrast === 100 && local.saturation === 100
              : local.filterId === preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              disabled={disabled}
              onClick={() => {
                const next =
                  preset.id === 'none'
                    ? { ...DEFAULT_MEDIA_ADJUST }
                    : { ...DEFAULT_MEDIA_ADJUST, ...preset.adjust };
                setLocal(next);
                onCommit(next);
              }}
              className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ${
                active ? 'bg-sky-500 text-white' : 'bg-white/10 text-white/70'
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
