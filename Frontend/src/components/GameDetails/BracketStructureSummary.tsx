import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { getBracketStructureMetrics, type BracketMainRoundLabelKey } from '@/utils/bracketStructure';
import { byeCountForEntrants } from '@/utils/customByeSeedRanks.util';
import { formatByeRangeForSummary } from '@/utils/playoffWizardValidation.util';

interface BracketStructureSummaryProps {
  entrantCount: number;
  customByeSeedRanks?: number[];
  className?: string;
}

function mainRoundLabel(
  t: (key: string, opts?: Record<string, unknown>) => string,
  key: BracketMainRoundLabelKey
): string {
  const map: Record<BracketMainRoundLabelKey, string> = {
    final: t('gameDetails.bracketRoundFinal', { defaultValue: 'final' }),
    semifinals: t('gameDetails.bracketRoundSemifinals', { defaultValue: 'semifinals' }),
    quarterfinals: t('gameDetails.bracketRoundQuarterfinals', { defaultValue: 'quarterfinals' }),
    roundOf16: t('gameDetails.bracketRoundOf16', { defaultValue: 'round of 16' }),
    roundOf32: t('gameDetails.bracketRoundOf32', { defaultValue: 'round of 32' }),
  };
  return map[key];
}

export const BracketStructureSummary = ({
  entrantCount,
  customByeSeedRanks,
  className = '',
}: BracketStructureSummaryProps) => {
  const { t } = useTranslation();
  const metrics = useMemo(() => {
    try {
      const customByes =
        customByeSeedRanks?.length === byeCountForEntrants(entrantCount)
          ? customByeSeedRanks
          : undefined;
      return getBracketStructureMetrics(entrantCount, customByes);
    } catch {
      return null;
    }
  }, [entrantCount, customByeSeedRanks]);

  if (!metrics || entrantCount < 2) return null;

  const mainLabel = mainRoundLabel(t, metrics.firstMainRoundLabelKey);
  const byeRange =
    metrics.byeCount === 0 ? null : formatByeRangeForSummary(metrics.byeSeeds);

  let body: string;
  if (metrics.playInGameCount === 0 && metrics.byeCount === 0) {
    body = t('gameDetails.bracketSummaryPowerOfTwo', {
      defaultValue: '{{count}} teams → {{round}} (no play-in)',
      count: entrantCount,
      round: mainLabel,
    });
  } else if (metrics.playInGameCount === 0) {
    body = t('gameDetails.bracketSummaryByesOnly', {
      defaultValue: '{{count}} teams → {{byeCount}} byes ({{byeRange}}), then {{round}}',
      count: entrantCount,
      byeCount: metrics.byeCount,
      byeRange,
      round: mainLabel,
    });
  } else {
    body = t('gameDetails.bracketSummaryFull', {
      defaultValue:
        '{{count}} teams → {{byeCount}} bye ({{byeRange}}), {{playInCount}} play-in games, then {{round}}',
      count: entrantCount,
      byeCount: metrics.byeCount,
      byeRange: byeRange ?? '',
      playInCount: metrics.playInGameCount,
      round: mainLabel,
    });
  }

  return (
    <p
      className={`text-sm text-center text-gray-700 dark:text-gray-300 rounded-lg border border-primary-200/60 dark:border-primary-800/50 bg-primary-50/40 dark:bg-primary-950/30 px-3 py-2 ${className}`.trim()}
    >
      {body}
    </p>
  );
};
