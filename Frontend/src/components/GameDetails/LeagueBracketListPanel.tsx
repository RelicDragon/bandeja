import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Card, SegmentedSwitch } from '@/components';
import type { BracketPlayoffGroupDto } from '@/api/leagues';
import type { Game } from '@/types';
import { LeagueGameCard } from './LeagueGameCard';
import { collectBracketScheduleGames } from '@/utils/bracketScheduleListSort.util';
import { translateBracketRoundLabel } from '@/utils/bracketRoundDisplay.util';
import { isPlayInPhaseComplete } from '@/utils/leagueBracketOutcome';

export type BracketListFilter = 'ALL' | 'PLAY_IN' | 'KNOCKOUT';

interface LeagueBracketListPanelProps {
  group: BracketPlayoffGroupDto | null;
  crossGroupBracket?: boolean;
  groupFilterActive?: boolean;
  loading?: boolean;
  error?: boolean;
  onRetry?: () => void;
  onOpenTreeView?: () => void;
  onOpenGame?: (game: Game) => void;
  onEditGame?: (game: Game) => void;
}

function BracketListLoadingSkeleton() {
  return (
    <div className="space-y-3" aria-hidden>
      {[0, 1, 2].map((i) => (
        <div
          key={i}
          className="h-24 animate-pulse rounded-xl bg-gray-100 dark:bg-gray-800/80"
        />
      ))}
    </div>
  );
}

export function LeagueBracketListPanel({
  group,
  crossGroupBracket = false,
  groupFilterActive = false,
  loading = false,
  error = false,
  onRetry,
  onOpenTreeView,
  onOpenGame,
  onEditGame,
}: LeagueBracketListPanelProps) {
  const { t } = useTranslation();
  const [filter, setFilter] = useState<BracketListFilter>('ALL');

  const showPhaseFilters = useMemo(
    () => !!group && group.playInGameCount > 0 && !isPlayInPhaseComplete(group),
    [group]
  );

  useEffect(() => {
    if (showPhaseFilters) {
      setFilter((prev) => (prev === 'KNOCKOUT' ? 'KNOCKOUT' : 'PLAY_IN'));
    } else {
      setFilter('ALL');
    }
  }, [showPhaseFilters, group?.leagueGroupId]);

  const games = useMemo(() => {
    if (!group?.slots) return [];
    return collectBracketScheduleGames(group.slots);
  }, [group?.slots]);

  const filtered = useMemo(() => {
    if (filter === 'PLAY_IN') return games.filter((g) => g.kind === 'PLAY_IN');
    if (filter === 'KNOCKOUT') return games.filter((g) => g.kind === 'MAIN');
    return games;
  }, [games, filter]);

  if (loading) {
    return <BracketListLoadingSkeleton />;
  }

  if (error) {
    return (
      <Card className="space-y-3 py-8 text-center">
        <p className="text-sm text-gray-600 dark:text-gray-400">{t('gameDetails.bracketLoadError')}</p>
        <p className="text-xs text-gray-500 dark:text-gray-500">{t('gameDetails.bracketLoadErrorHint')}</p>
        {onRetry ? (
          <button
            type="button"
            onClick={onRetry}
            className="inline-flex items-center justify-center rounded-lg bg-primary-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-primary-700"
          >
            {t('common.retry')}
          </button>
        ) : null}
      </Card>
    );
  }

  if (!group) {
    return (
      <div className="space-y-2 py-8 text-center">
        <p className="text-sm text-gray-500 dark:text-gray-400">{t('gameDetails.bracketEmpty')}</p>
        {onOpenTreeView ? (
          <button
            type="button"
            onClick={onOpenTreeView}
            className="text-xs font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            {t('gameDetails.bracketTreeFallbackLink')}
          </button>
        ) : null}
      </div>
    );
  }

  const showSeasonPlayoffHeader = crossGroupBracket && groupFilterActive;

  return (
    <div className="space-y-4" role="region" aria-label={t('gameDetails.bracketListRegionLabel')}>
      {onOpenTreeView ? (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">
          {t('gameDetails.bracketTreeFallbackHint')}{' '}
          <button
            type="button"
            onClick={onOpenTreeView}
            className="font-semibold text-primary-700 underline-offset-2 hover:underline dark:text-primary-300"
          >
            {t('gameDetails.bracketTreeFallbackLink')}
          </button>
        </p>
      ) : null}
      {showSeasonPlayoffHeader && (
        <div className="inline-flex w-full items-center justify-center gap-2 rounded-lg border-2 border-indigo-300 bg-indigo-50/80 px-4 py-2 text-center text-sm font-semibold text-indigo-900 shadow-sm dark:border-indigo-700 dark:bg-indigo-950/40 dark:text-indigo-100">
          <span className="h-2 w-2 rounded-full bg-indigo-500" />
          {t('gameDetails.bracketSeasonPlayoff')}
        </div>
      )}
      {showPhaseFilters ? (
        <div className="flex justify-center">
          <SegmentedSwitch
            tabs={[
              { id: 'PLAY_IN' as const, label: t('gameDetails.bracketListPlayIn') },
              { id: 'KNOCKOUT' as const, label: t('gameDetails.bracketListKnockout') },
            ]}
            activeId={filter === 'KNOCKOUT' ? 'KNOCKOUT' : 'PLAY_IN'}
            onChange={(id) => setFilter(id as BracketListFilter)}
            showOnlyActiveTabText={false}
            layoutId="bracket-list-filter"
            className="w-fit"
            ariaLabel={t('gameDetails.bracketListFilterTabs')}
          />
        </div>
      ) : games.length > 0 ? (
        <p className="text-center text-xs text-gray-500 dark:text-gray-400">{t('gameDetails.bracketListAll')}</p>
      ) : null}
      {filtered.length === 0 ? (
        <p className="py-6 text-center text-sm text-gray-500 dark:text-gray-400">
          {filter === 'KNOCKOUT' && showPhaseFilters
            ? t('gameDetails.bracketListKnockoutGateEmpty')
            : filter === 'PLAY_IN'
              ? t('gameDetails.bracketListPlayInEmpty')
              : t('gameDetails.bracketListEmpty')}
        </p>
      ) : (
        <div className="space-y-3">
          {filtered.map(({ game, kind, roundIndex, roundLabel }) => (
            <LeagueGameCard
              key={game.id}
              game={game}
              onOpen={onOpenGame ? () => onOpenGame(game) : undefined}
              onEdit={onEditGame ? () => onEditGame(game) : undefined}
              showGroupTag={false}
              bracketRoundBadge={
                roundLabel
                  ? translateBracketRoundLabel(roundLabel, t)
                  : kind === 'PLAY_IN'
                    ? t('gameDetails.bracketColumnPlayIn')
                    : t('gameDetails.bracketColumnMainRound', { round: roundIndex + 1 })
              }
              seasonPlayoffBadge={crossGroupBracket}
            />
          ))}
        </div>
      )}
    </div>
  );
}
