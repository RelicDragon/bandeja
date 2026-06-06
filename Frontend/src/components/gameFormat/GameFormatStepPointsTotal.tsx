import { useTranslation } from 'react-i18next';
import { Medal } from 'lucide-react';
import { ScoringPreset } from '@/types';
import { tGameFormatStepHint, tScoringPresetField } from '@/utils/gameFormat';
import { isPointsPreset, isRallyMatchPreset, listRallyMatchPresets } from '@/utils/gameFormat/scoringCompatibility';
import { GameFormatTimedDuration } from './GameFormatTimedDuration';
import { FormatOptionCard } from './FormatOptionCard';
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
  { cap: 15, preset: 'POINTS_15' },
  { cap: 16, preset: 'POINTS_16', recommended: true },
  { cap: 21, preset: 'POINTS_21' },
  { cap: 24, preset: 'POINTS_24' },
  { cap: 32, preset: 'POINTS_32' },
];

const RALLY_MATCH_RECOMMENDED = new Set<ScoringPreset>(['BEST_OF_3_21', 'BEST_OF_3_11']);

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
  onSelectAdvance,
}: GameFormatStepPointsTotalProps) => {
  const { t } = useTranslation();
  const visibleRally = listRallyMatchPresets(allowedPresets);
  const visiblePointCaps = (
    allowedPresets && allowedPresets.length > 0
      ? POINT_CAP_PRESETS.filter((item) => allowedPresets.includes(item.preset))
      : POINT_CAP_PRESETS
  ).filter((item) => isPointsPreset(item.preset));

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
  const rallySelected = isRallyMatchPreset(scoringPreset);

  return (
    <div className="space-y-3">
      <div className="rounded-xl bg-gray-50 dark:bg-gray-800/50 border border-gray-200 dark:border-gray-700 p-3 space-y-4">
        <div>
          <div className="text-sm font-medium text-gray-900 dark:text-white">{t('gameFormat.steps.pointsTotal')}</div>
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 m-0 leading-snug">
            {tGameFormatStepHint(t, 'pointsTotal', sport)}
          </p>
        </div>

        {visibleRally.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-0.5">
              {t('gameFormat.rallyMatch.sectionTitle')}
            </div>
            <div className="space-y-2">
              {visibleRally.map((preset) => {
                const recommended = RALLY_MATCH_RECOMMENDED.has(preset);
                const tier = resolvePresetTierForSport(sport, preset);
                const tierLabel = tier ? presetTierBadgeLabel(tier, t) : null;
                const badgeLabel =
                  recommended && tierLabel
                    ? `${t('gameFormat.recommended')} · ${tierLabel}`
                    : recommended
                      ? t('gameFormat.recommended')
                      : tierLabel ?? undefined;
                return (
                  <div key={preset} className="relative">
                    {tier && tierLabel ? (
                      <span
                        className={`pointer-events-none absolute right-2 top-2 z-10 rounded-full px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-wide ${presetTierBadgeClass(tier)}`}
                      >
                        {tierLabel}
                      </span>
                    ) : null}
                    <FormatOptionCard
                      icon={Medal}
                      title={tScoringPresetField(t, preset, 'title', sport)}
                      subtitle={tScoringPresetField(t, preset, 'subtitle', sport)}
                      hint={tScoringPresetField(t, preset, 'hint', sport) || undefined}
                      badge={badgeLabel}
                      selected={!customActive && scoringPreset === preset}
                      onClick={() => {
                        onCustomPointsChange(null);
                        onPresetChange(preset);
                        onSelectAdvance?.();
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        {visiblePointCaps.length > 0 ? (
          <div className="space-y-2">
            <div className="text-xs font-semibold uppercase tracking-wide text-gray-500 dark:text-gray-400 px-0.5">
              {t('gameFormat.ballBudget.sectionTitle')}
            </div>
            <div className={`grid gap-2 ${visiblePointCaps.length > 4 ? 'grid-cols-3' : 'grid-cols-4'}`}>
              {visiblePointCaps.map(({ cap, preset, recommended }) => {
                const selected = !customActive && !rallySelected && scoringPreset === preset;
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
        ) : null}
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
