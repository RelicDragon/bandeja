import { useTranslation } from 'react-i18next';
import { SlidersHorizontal } from 'lucide-react';
import { GameSetupParams, ScoringPreset } from '@/types';
import { FormatOptionCard } from './FormatOptionCard';

export interface GameFormatCustomScoringSectionProps {
  scoringPreset: ScoringPreset;
  overrides: Partial<GameSetupParams>;
  onOverridesChange: (patch: Partial<GameSetupParams>) => void;
  onPickCustomScoring: () => void;
  onSelectAdvance?: () => void;
  /** Shown above the card when picking from the classic “Sets” step. */
  fromClassicHint?: boolean;
}

export const GameFormatCustomScoringSection = ({
  scoringPreset,
  overrides,
  onOverridesChange,
  onPickCustomScoring,
  onSelectAdvance,
  fromClassicHint,
}: GameFormatCustomScoringSectionProps) => {
  const { t } = useTranslation();
  const customSets = overrides.fixedNumberOfSets ?? 3;
  const customPointsCap = overrides.maxTotalPointsPerSet ?? 21;

  const patchCustomSets = (raw: string) => {
    if (raw === '') return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 99) onOverridesChange({ fixedNumberOfSets: n });
  };

  const patchCustomPointsCap = (raw: string) => {
    if (raw === '') return;
    const n = parseInt(raw, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 999) onOverridesChange({ maxTotalPointsPerSet: n });
  };

  return (
    <div className="space-y-2.5">
      {fromClassicHint ? (
        <p className="text-[11px] leading-snug text-gray-500 dark:text-gray-400 px-1 m-0">
          {t('gameFormat.customScoring.fromClassicHint')}
        </p>
      ) : null}
      <FormatOptionCard
        icon={SlidersHorizontal}
        title={t('gameFormat.scoring.CUSTOM_SCORING.title')}
        subtitle={t('gameFormat.scoring.CUSTOM_SCORING.subtitle')}
        hint={t('gameFormat.scoring.CUSTOM_SCORING.hint')}
        badge={t('gameFormat.customScoring.badge')}
        selected={scoringPreset === 'CUSTOM_SCORING'}
        onClick={() => {
          onPickCustomScoring();
          onSelectAdvance?.();
        }}
      />
      {scoringPreset === 'CUSTOM_SCORING' && (
        <div className="p-3 rounded-xl bg-amber-50/80 dark:bg-amber-950/25 border border-amber-200/80 dark:border-amber-800/60 space-y-3">
          <p className="text-[11px] leading-snug text-amber-900/90 dark:text-amber-200/90 m-0">
            {t('gameFormat.customScoring.ratingNote')}
          </p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                {t('gameFormat.customScoring.setsLabel')}
              </label>
              <input
                type="number"
                min={1}
                max={99}
                value={customSets}
                onChange={(e) => patchCustomSets(e.target.value)}
                className="w-full px-2.5 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:border-primary-500 text-gray-900 dark:text-white outline-none"
              />
            </div>
            <div>
              <label className="block text-[11px] font-semibold text-gray-600 dark:text-gray-400 mb-1">
                {t('gameFormat.customScoring.ballsPerSetLabel')}
              </label>
              <input
                type="number"
                min={1}
                max={999}
                value={customPointsCap}
                onChange={(e) => patchCustomPointsCap(e.target.value)}
                className="w-full px-2.5 py-2 text-sm rounded-lg bg-white dark:bg-gray-900 border-2 border-gray-200 dark:border-gray-700 focus:border-primary-500 text-gray-900 dark:text-white outline-none"
              />
            </div>
          </div>
          <p className="text-[10px] text-gray-500 dark:text-gray-400 m-0">{t('gameFormat.customScoring.helper')}</p>
        </div>
      )}
    </div>
  );
};
