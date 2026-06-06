import { useTranslation } from 'react-i18next';
import type { ScoringPreset } from '@/types';
import { tScoringPresetField } from '@/utils/gameFormat';
import { CreateTemplateInlinePanel } from './CreateTemplateInlinePanel';

const POINT_CAP_PRESETS: { cap: number; preset: ScoringPreset }[] = [
  { cap: 11, preset: 'POINTS_11' },
  { cap: 15, preset: 'POINTS_15' },
  { cap: 16, preset: 'POINTS_16' },
  { cap: 21, preset: 'POINTS_21' },
  { cap: 24, preset: 'POINTS_24' },
  { cap: 32, preset: 'POINTS_32' },
];

type Props = {
  scoringPreset: ScoringPreset;
  allowedPresets: ScoringPreset[];
  sport: string;
  onPresetChange: (preset: ScoringPreset) => void;
};

export function CreateTemplatePointsPicker({
  scoringPreset,
  allowedPresets,
  sport,
  onPresetChange,
}: Props) {
  const { t } = useTranslation();
  const visible = POINT_CAP_PRESETS.filter((item) => allowedPresets.includes(item.preset));

  return (
    <CreateTemplateInlinePanel
      aria-label={t('gameFormat.steps.pointsTotal')}
      sectionLabel={t('gameFormat.steps.pointsTotal')}
    >
      <div className="grid grid-cols-5 gap-1.5">
        {visible.map(({ cap, preset }) => {
          const selected = scoringPreset === preset;
          return (
            <button
              key={preset}
              type="button"
              onClick={() => onPresetChange(preset)}
              title={tScoringPresetField(t, preset, 'title', sport)}
              aria-label={tScoringPresetField(t, preset, 'title', sport)}
              aria-pressed={selected}
              className={`rounded-lg py-2 text-sm font-bold tabular-nums transition-all ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'bg-white text-gray-800 border border-gray-200 hover:border-primary-400 dark:bg-gray-900 dark:text-gray-100 dark:border-gray-600'
              }`}
            >
              {cap}
            </button>
          );
        })}
      </div>
    </CreateTemplateInlinePanel>
  );
}

type TimedProps = {
  minutes: number;
  options: readonly number[];
  onChange: (minutes: number) => void;
};

export function CreateTemplateTimedPicker({ minutes, options, onChange }: TimedProps) {
  const { t } = useTranslation();

  return (
    <CreateTemplateInlinePanel
      aria-label={t('gameFormat.timedMatch.durationTitle')}
      sectionLabel={t('gameFormat.timedMatch.durationTitle')}
    >
      <div className="flex gap-1.5 p-1 bg-gray-100 dark:bg-gray-800 rounded-lg">
        {options.map((m) => {
          const selected = minutes === m;
          return (
            <button
              key={m}
              type="button"
              onClick={() => onChange(m)}
              aria-pressed={selected}
              className={`flex-1 min-h-9 rounded-md text-sm font-semibold transition-all ${
                selected
                  ? 'bg-primary-500 text-white shadow-sm'
                  : 'text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
              }`}
            >
              {t('gameFormat.timedMatch.presetMinutes', { minutes: m })}
            </button>
          );
        })}
      </div>
    </CreateTemplateInlinePanel>
  );
}
