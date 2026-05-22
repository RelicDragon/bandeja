import { useTranslation } from 'react-i18next';
import { Medal, Award, Flag, Target } from 'lucide-react';
import { ScoringPreset } from '@/types';
import { tGameFormatStepHint, tScoringPresetField } from '@/utils/gameFormat';
import { FormatOptionCard } from './FormatOptionCard';
import { GameFormatTimedDuration } from './GameFormatTimedDuration';
import { ToggleSwitch } from '@/components/ToggleSwitch';

interface GameFormatStepSetStructureProps {
  scoringPreset: ScoringPreset;
  allowedPresets?: ScoringPreset[];
  sport?: string | null;
  hasGoldenPoint: boolean;
  matchTimerEnabled: boolean;
  matchTimedCapMinutes: number;
  onPresetChange: (preset: ScoringPreset) => void;
  onGoldenPointChange: (v: boolean) => void;
  onMatchTimerEnabledChange: (v: boolean) => void;
  onTimedCapMinutesChange: (n: number) => void;
  onSelectAdvance?: () => void;
}

const CLASSIC_PRESETS: { value: ScoringPreset; icon: typeof Medal; recommended?: boolean }[] = [
  { value: 'CLASSIC_BEST_OF_3', icon: Medal, recommended: true },
  { value: 'CLASSIC_SUPER_TIEBREAK', icon: Flag },
  { value: 'CLASSIC_BEST_OF_5', icon: Award },
  { value: 'CLASSIC_SHORT_SET', icon: Target },
  { value: 'CLASSIC_PRO_SET', icon: Target },
  { value: 'CLASSIC_SINGLE_SET', icon: Target },
];

export const GameFormatStepSetStructure = ({
  scoringPreset,
  allowedPresets,
  sport,
  hasGoldenPoint,
  matchTimerEnabled,
  matchTimedCapMinutes,
  onPresetChange,
  onGoldenPointChange,
  onMatchTimerEnabledChange,
  onTimedCapMinutesChange,
  onSelectAdvance,
}: GameFormatStepSetStructureProps) => {
  const { t } = useTranslation();
  const visiblePresets =
    allowedPresets && allowedPresets.length > 0
      ? CLASSIC_PRESETS.filter((preset) => allowedPresets.includes(preset.value))
      : CLASSIC_PRESETS;

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">
        {tGameFormatStepHint(t, 'setStructure', sport)}
      </p>
      <div className="space-y-2.5">
        {visiblePresets.map((p) => (
          <FormatOptionCard
            key={p.value}
            icon={p.icon}
            title={tScoringPresetField(t, p.value, 'title', sport)}
            subtitle={tScoringPresetField(t, p.value, 'subtitle', sport)}
            hint={tScoringPresetField(t, p.value, 'hint', sport) || undefined}
            badge={p.recommended ? t('gameFormat.recommended') : undefined}
            selected={scoringPreset === p.value}
            onClick={() => {
              onPresetChange(p.value);
              onSelectAdvance?.();
            }}
          />
        ))}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.timedMatch.title')}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('gameFormat.timedMatch.descriptionClassic')}</div>
          </div>
          <ToggleSwitch checked={matchTimerEnabled} onChange={onMatchTimerEnabledChange} />
        </div>
        {matchTimerEnabled && (
          <GameFormatTimedDuration
            minutes={matchTimedCapMinutes}
            onChange={onTimedCapMinutesChange}
            onSelectAdvance={onSelectAdvance}
          />
        )}
      </div>

      <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.goldenPoint.title')}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('gameFormat.goldenPoint.description')}</div>
          </div>
          <ToggleSwitch checked={hasGoldenPoint} onChange={onGoldenPointChange} />
        </div>
      </div>
    </div>
  );
};
