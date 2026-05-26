import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { ToggleSwitch } from '@/components/ToggleSwitch';
import type { PlayInSeedPair } from '@/utils/bracketCustomPlayIn.util';
import { getBracketStructureMetrics } from '@/utils/bracketStructure';
import { formatSeedOptionLabel } from '@/utils/playoffWizardSeedLabels.util';
import {
  customPlayInErrorI18nKey,
  getCustomPlayInValidation,
} from '@/utils/playoffWizardValidation.util';

interface BracketPlayInPairEditorProps {
  entrantCount: number;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  pairs: PlayInSeedPair[];
  onPairsChange: (pairs: PlayInSeedPair[]) => void;
  customByeSeedRanks?: number[];
  seedLabels?: Record<number, string>;
}

export function BracketPlayInPairEditor({
  entrantCount,
  enabled,
  onEnabledChange,
  pairs,
  onPairsChange,
  customByeSeedRanks,
  seedLabels,
}: BracketPlayInPairEditorProps) {
  const { t } = useTranslation();
  const metrics = useMemo(
    () => getBracketStructureMetrics(entrantCount, customByeSeedRanks),
    [entrantCount, customByeSeedRanks]
  );

  const validation = useMemo(
    () => getCustomPlayInValidation(entrantCount, enabled, pairs, customByeSeedRanks),
    [entrantCount, enabled, pairs, customByeSeedRanks]
  );

  if (metrics.playInGameCount <= 0) return null;

  const defaultPairs = metrics.playInMatchups.map((m) => [m.seedA, m.seedB] as PlayInSeedPair);

  const setPairSide = (matchIndex: number, side: 'A' | 'B', seed: number) => {
    const next = (pairs.length === metrics.playInGameCount ? pairs : defaultPairs).map(
      (p) => [...p] as PlayInSeedPair
    );
    const row = next[matchIndex];
    if (!row) return;
    if (side === 'A') row[0] = seed;
    else row[1] = seed;
    onPairsChange(next);
  };

  const activePairs = pairs.length === metrics.playInGameCount ? pairs : defaultPairs;
  const playInSeedOptions = Array.from(
    { length: entrantCount - metrics.byeCount },
    (_, i) => metrics.byeCount + 1 + i
  );

  return (
    <div className="space-y-2 rounded-lg border border-gray-200 dark:border-gray-700 p-3">
      <div className="flex items-center justify-between">
        <span className="text-sm font-medium text-gray-800 dark:text-gray-200 min-w-0 pr-2">
          {t('gameDetails.bracketCustomPlayInLabel')}
        </span>
        <div className="flex-shrink-0">
          <ToggleSwitch
            checked={enabled}
            onChange={(on) => {
              onEnabledChange(on);
              if (on && pairs.length !== metrics.playInGameCount) {
                onPairsChange(defaultPairs);
              }
            }}
          />
        </div>
      </div>
      {enabled && (
        <>
          <p className="text-xs text-center text-gray-500 dark:text-gray-400">
            {t('gameDetails.bracketCustomPlayInHint')}
          </p>
          {!validation.valid && (
            <p className="text-xs text-center text-amber-600 dark:text-amber-400">
              {t(customPlayInErrorI18nKey(validation.error), {
                defaultValue: 'Invalid play-in pairings',
              })}
            </p>
          )}
          <div className="space-y-2">
            {activePairs.map(([seedA, seedB], idx) => (
              <div
                key={idx}
                className="flex flex-wrap items-center justify-center gap-2 text-xs font-medium"
              >
                <span className="text-gray-500 dark:text-gray-400">
                  {t('gameDetails.bracketCustomPlayInMatch', { n: idx + 1 })}
                </span>
                <select
                  value={seedA}
                  onChange={(e) => setPairSide(idx, 'A', Number(e.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-900"
                >
                  {playInSeedOptions.map((s) => (
                    <option key={`a-${s}`} value={s}>
                      {formatSeedOptionLabel(s, seedLabels)}
                    </option>
                  ))}
                </select>
                <span className="text-indigo-600 dark:text-indigo-400">
                  {t('gameDetails.fixtureVsShort')}
                </span>
                <select
                  value={seedB}
                  onChange={(e) => setPairSide(idx, 'B', Number(e.target.value))}
                  className="rounded-md border border-gray-300 bg-white px-2 py-1 dark:border-gray-600 dark:bg-gray-900"
                >
                  {playInSeedOptions.map((s) => (
                    <option key={`b-${s}`} value={s}>
                      {formatSeedOptionLabel(s, seedLabels)}
                    </option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
