import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { Percent, Swords, Zap } from 'lucide-react';
import { StatTile } from '@/components/ui/StatTile';
import { StatTileRow } from '@/components/ui/StatTileRow';
import { isPositiveChemistry, usePairFormatters } from './pairFormat';

export interface PairStatTilesProps {
  games: number;
  /** 0–100. */
  winRate: number;
  /** Percentage points, or `null` when there is no solo baseline to compare. */
  chemistry: number | null;
  className?: string;
}

/**
 * Games · Win rate · Chemistry. Shared by the pair sheet and the top of
 * `/user-team/:id`, so a pair reads the same numbers wherever it is opened.
 *
 * Unknown chemistry shows an em dash with a hint, never a `0` that would claim
 * the pair is exactly average.
 */
export const PairStatTiles = memo(
  ({ games, winRate, chemistry, className = '' }: PairStatTilesProps) => {
    const { t } = useTranslation();
    const formatters = usePairFormatters();

    return (
      <StatTileRow className={className}>
        <StatTile
          label={t('pairs.stats.games')}
          value={formatters.count(games)}
          icon={Swords}
        />
        <StatTile
          label={t('pairs.stats.winRate')}
          value={formatters.percent(winRate)}
          icon={Percent}
          tone="primary"
        />
        <StatTile
          label={t('pairs.stats.chemistry')}
          value={chemistry === null ? '—' : formatters.signed(chemistry)}
          hint={chemistry === null ? t('pairs.stats.chemistryUnknown') : undefined}
          icon={Zap}
          tone={isPositiveChemistry(chemistry) ? 'success' : 'neutral'}
        />
      </StatTileRow>
    );
  },
);

PairStatTiles.displayName = 'PairStatTiles';
