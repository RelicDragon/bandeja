import { useTranslation } from 'react-i18next';
import { ScoringPreset } from '@/types';
import { tBestOfMatchLabel, tGameFormatStepHint, tScoringPresetField } from '@/utils/gameFormat';
import { GameFormatTimedDuration } from './GameFormatTimedDuration';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import { presetTierBadgeClass, presetTierBadgeLabel, resolvePresetTierForSport } from '@/utils/presetTierUi';

interface GameFormatStepPointsTotalProps {
  scoringPreset: ScoringPreset;
  allowedPresets?: ScoringPreset[];
  sport?: string | null;
  matchTimerEnabled: boolean;
  matchTimedCapMinutes: number;
  customPointsTotal: number | null;
  onPresetChange: (preset: ScoringPreset) => void;
  onMatchTimerEnabledChange: (v: boolean) => void;
  onTimedCapMinutesChange: (n: number) => void;
  onCustomPointsChange: (n: number | null) => void;
  onSelectAdvance?: () => void;
}

const POINT_CAP_PRESETS: { cap: number; preset: ScoringPreset; recommended?: boolean }[] = [
  { cap: 11, preset: 'POINTS_11' },
  { cap: 16, preset: 'POINTS_16', recommended: true },
  { cap: 21, preset: 'POINTS_21' },
  { cap: 24, preset: 'POINTS_24' },
  { cap: 32, preset: 'POINTS_32' },
];

const MATCH_BEST_OF_PRESETS: { preset: ScoringPreset; sets: number; pointsCap: number; recommended?: boolean }[] = [
  { preset: 'BEST_OF_3_11', sets: 3, pointsCap: 11, recommended: true },
  { preset: 'BEST_OF_5_11', sets: 5, pointsCap: 11 },
  { preset: 'BEST_OF_3_21', sets: 3, pointsCap: 21, recommended: true },
];

export const GameFormatStepPointsTotal = ({
  scoringPreset,
  allowedPresets,
  sport,
  matchTimerEnabled,
  matchTimedCapMinutes,
  customPointsTotal,
  onPresetChange,
  onMatchTimerEnabledChange,
  onTimedCapMinutesChange,
  onCustomPointsChange,
}: GameFormatStepPointsTotalProps) => {
  const { t } = useTranslation();
  const visiblePointCaps =
    allowedPresets && allowedPresets.length > 0
      ? POINT_CAP_PRESETS.filter((item) => allowedPresets.includes(item.preset))
      : POINT_CAP_PRESETS;
  const visibleBestOf =
    allowedPresets && allowedPresets.length > 0
      ? MATCH_BEST_OF_PRESETS.filter((item) => allowedPresets.includes(item.preset))
      : MATCH_BEST_OF_PRESETS;

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

  const customActive = customPointsTotal != null;

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3 space-y-3">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.steps.pointsTotal')}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 m-0 leading-snug">
            {tGameFormatStepHint(t, 'pointsTotal', sport)}
          </p>
        </div>

        <div className="grid grid-cols-4 gap-2">
          {visiblePointCaps.map(({ cap, preset, recommended }) => {
            const selected = !customActive && scoringPreset === preset;
            return (
              <button
                key={preset}
                type="button"
                onClick={() => {
                  onCustomPointsChange(null);
                  onPresetChange(preset);
                }}
                title={tScoringPresetField(t, preset, 'title', sport)}
                aria-label={tScoringPresetField(t, preset, 'title', sport)}
                className={`relative rounded-lg py-2.5 text-sm font-bold tabular-nums transition-all ${
                  selected
                    ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25'
                    : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 hover:border-primary-400 dark:hover:border-primary-600'
                }`}
              >
                {cap}
                {(() => {
                  const tier = resolvePresetTierForSport(sport, preset);
                  const tierLabel = tier ? presetTierBadgeLabel(tier, t) : null;
                  if (!tier || !tierLabel) return null;
                  return (
                    <span
                      className={`absolute bottom-1 left-1 rounded px-1 py-0.5 text-[8px] font-bold uppercase tracking-wide ${presetTierBadgeClass(tier)}`}
                    >
                      {tierLabel}
                    </span>
                  );
                })()}
                {recommended && (
                  <span
                    className={`absolute top-1 right-1 w-1.5 h-1.5 rounded-full ${
                      selected ? 'bg-white' : 'bg-primary-500'
                    } ring-2 ring-white dark:ring-gray-900`}
                    aria-hidden
                  />
                )}
              </button>
            );
          })}
        </div>

        {visibleBestOf.length > 0 ? (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-600 dark:text-gray-400 m-0">
              {tBestOfMatchLabel(t, sport)}
            </p>
            <div className="grid grid-cols-2 gap-2">
              {visibleBestOf.map(({ preset, sets, pointsCap, recommended }) => {
                const selected = !customActive && scoringPreset === preset;
                return (
                  <button
                    key={preset}
                    type="button"
                    aria-label={tScoringPresetField(t, preset, 'title', sport)}
                    onClick={() => {
                      onCustomPointsChange(null);
                      onPresetChange(preset);
                    }}
                    className={`rounded-lg py-2.5 text-sm font-semibold transition-all ${
                      selected
                        ? 'bg-gradient-to-br from-primary-500 to-primary-600 text-white shadow-md shadow-primary-500/25'
                        : 'bg-white dark:bg-gray-900 text-gray-800 dark:text-gray-100 border border-gray-200 dark:border-gray-600 hover:border-primary-400'
                    }`}
                  >
                    {t('gameFormat.bestOfMatch.optionTo', { sets, cap: pointsCap })}
                    {recommended ? ` · ${t('gameFormat.recommended')}` : ''}
                    {(() => {
                      const tier = resolvePresetTierForSport(sport, preset);
                      const tierLabel = tier ? presetTierBadgeLabel(tier, t) : null;
                      if (!tier || !tierLabel) return null;
                      return (
                        <span
                          className={`ml-1 rounded px-1 py-0.5 text-[9px] font-bold uppercase tracking-wide ${presetTierBadgeClass(tier)}`}
                        >
                          {tierLabel}
                        </span>
                      );
                    })()}
                  </button>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          className={`rounded-lg border-2 border-dashed p-2.5 transition-colors ${
            customActive
              ? 'border-primary-500 bg-primary-50/80 dark:bg-primary-500/10'
              : 'border-gray-200 dark:border-gray-600 bg-white/60 dark:bg-gray-900/40'
          }`}
        >
          <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1">
            {t('gameFormat.customPoints.label')}
          </label>
          <input
            type="number"
            min={1}
            max={999}
            value={customPointsTotal ?? ''}
            onChange={handleCustomInput}
            placeholder={t('gameFormat.customPoints.placeholder')}
            className="w-full px-2.5 py-1.5 text-sm rounded-md bg-white dark:bg-gray-900 border border-gray-200 dark:border-gray-600 focus:border-primary-500 focus:ring-1 focus:ring-primary-500 text-gray-900 dark:text-white placeholder-gray-400 outline-none"
          />
        </div>
      </div>

      <div className="p-3 rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <div className="min-w-0 pr-3">
            <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.timedMatch.title')}</div>
            <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">{t('gameFormat.timedMatch.description')}</div>
          </div>
          <ToggleSwitch checked={matchTimerEnabled} onChange={onMatchTimerEnabledChange} />
        </div>
        {matchTimerEnabled && (
          <GameFormatTimedDuration minutes={matchTimedCapMinutes} onChange={onTimedCapMinutesChange} />
        )}
      </div>
    </div>
  );
};
