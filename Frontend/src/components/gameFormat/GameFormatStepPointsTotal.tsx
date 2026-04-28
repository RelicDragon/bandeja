import { useTranslation } from 'react-i18next';
import { Target } from 'lucide-react';
import { ScoringPreset } from '@/types';
import { FormatOptionCard } from './FormatOptionCard';
import { GameFormatTimedDuration } from './GameFormatTimedDuration';
import { ToggleSwitch } from '@/components/ToggleSwitch';

interface GameFormatStepPointsTotalProps {
  scoringPreset: ScoringPreset;
  matchTimerEnabled: boolean;
  matchTimedCapMinutes: number;
  customPointsTotal: number | null;
  onPresetChange: (preset: ScoringPreset) => void;
  onMatchTimerEnabledChange: (v: boolean) => void;
  onTimedCapMinutesChange: (n: number) => void;
  onCustomPointsChange: (n: number | null) => void;
  onSelectAdvance?: () => void;
}

const POINTS_PRESETS: { value: ScoringPreset; recommended?: boolean }[] = [
  { value: 'POINTS_16', recommended: true },
  { value: 'POINTS_21' },
  { value: 'POINTS_24' },
  { value: 'POINTS_32' },
];

export const GameFormatStepPointsTotal = ({
  scoringPreset,
  matchTimerEnabled,
  matchTimedCapMinutes,
  customPointsTotal,
  onPresetChange,
  onMatchTimerEnabledChange,
  onTimedCapMinutesChange,
  onCustomPointsChange,
  onSelectAdvance,
}: GameFormatStepPointsTotalProps) => {
  const { t } = useTranslation();

  const activePreset = customPointsTotal != null ? null : scoringPreset;

  const handleCustomInput = (e: React.ChangeEvent<HTMLInputElement>) => {
    const raw = e.target.value;
    if (raw === '') {
      onCustomPointsChange(null);
      return;
    }
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n > 0 && n <= 999) {
      onCustomPointsChange(n);
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-xs text-gray-500 dark:text-gray-400 px-1">{t('gameFormat.stepPointsTotalHint')}</p>

      <div className="space-y-2.5">
        {POINTS_PRESETS.map((p) => (
          <FormatOptionCard
            key={p.value}
            icon={Target}
            title={t(`gameFormat.scoring.${p.value}.title`)}
            subtitle={t(`gameFormat.scoring.${p.value}.subtitle`)}
            hint={t(`gameFormat.scoring.${p.value}.hint`, { defaultValue: '' }) || undefined}
            badge={p.recommended ? t('gameFormat.recommended') : undefined}
            selected={activePreset === p.value}
            onClick={() => {
              onCustomPointsChange(null);
              onPresetChange(p.value);
              onSelectAdvance?.();
            }}
          />
        ))}

        <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border-2 border-dashed border-gray-200 dark:border-gray-700">
          <div className="text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
            {t('gameFormat.customPoints.label')}
          </div>
          <input
            type="number"
            min={1}
            max={999}
            value={customPointsTotal ?? ''}
            onChange={handleCustomInput}
            placeholder={t('gameFormat.customPoints.placeholder')}
            className="w-full px-3 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:border-primary-500 text-gray-900 dark:text-white placeholder-gray-400 transition-all outline-none"
          />
        </div>
      </div>

      <div className="mt-4 p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.timedMatch.title')}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('gameFormat.timedMatch.description')}</div>
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
    </div>
  );
};
