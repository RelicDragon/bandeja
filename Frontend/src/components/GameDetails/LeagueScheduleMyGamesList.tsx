import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { TFunction } from 'i18next';
import type { LeagueGroup, LeagueRound } from '@/api/leagues';
import type { Game } from '@/types';
import { resultsApi, type RoundData } from '@/api/results';
import { Select } from '@/components/Select';
import { LeagueGameCard } from './LeagueGameCard';
import { GroupFilterDropdown } from './GroupFilterDropdown';
import { userIsOnLeagueScheduleGame } from '@/utils/leagueScheduleUserGames';
import { distinctLeagueGroupIdsForUser } from '@/utils/leagueScheduleUserGroups';
import {
  gameMatchesLeagueScheduleMyStatus,
  type LeagueScheduleMyGameStatusFilter,
} from '@/utils/leagueScheduleMyGameStatus';
import { useDesktop } from '@/hooks/useDesktop';
import { buildLeagueHomeGameBracketPath, isBracketLeagueGame } from '@/utils/leagueHomeBracket.util';

const ALL_GROUP_ID = 'ALL';

interface LeagueScheduleMyGamesListProps {
  filteredRounds: LeagueRound[];
  groups: LeagueGroup[];
  userId: string | undefined;
  canEdit: boolean;
  selectedGameChatId?: string | null;
  onChatGameSelect?: (gameId: string) => void;
  onEditGame: (game: Game) => void;
  onOpenGame: (game: Game) => void;
  onDeleteGame?: () => void;
  onNoteSaved?: () => void;
  t: TFunction;
}

export function LeagueScheduleMyGamesList({
  filteredRounds,
  groups,
  userId,
  canEdit,
  selectedGameChatId,
  onChatGameSelect,
  onEditGame,
  onOpenGame,
  onDeleteGame,
  onNoteSaved,
  t,
}: LeagueScheduleMyGamesListProps) {
  const isDesktop = useDesktop();
  const navigate = useNavigate();
  const [gameResultsMap, setGameResultsMap] = useState<Map<string, RoundData[] | null>>(new Map());
  const [selectedGroupId, setSelectedGroupId] = useState(ALL_GROUP_ID);
  const [statusFilter, setStatusFilter] = useState<LeagueScheduleMyGameStatusFilter>('ALL');

  const allEntries = useMemo(() => {
    const out: { round: LeagueRound; game: Game }[] = [];
    for (const round of filteredRounds) {
      for (const game of round.games) {
        if (userIsOnLeagueScheduleGame(game, userId)) {
          out.push({ round, game });
        }
      }
    }
    out.sort((a, b) => {
      const ro = a.round.orderIndex - b.round.orderIndex;
      if (ro !== 0) return ro;
      return (a.game.startTime ?? '').localeCompare(b.game.startTime ?? '');
    });
    return out;
  }, [filteredRounds, userId]);

  const userGroupIds = useMemo(
    () => distinctLeagueGroupIdsForUser(
      allEntries.map((e) => e.game),
      userId,
    ),
    [allEntries, userId],
  );

  const showGroupFilter = userGroupIds.length > 1;

  const userGroupOptions = useMemo(() => {
    const byId = new Map(groups.map((g) => [g.id, g]));
    return userGroupIds.map((id) => {
      const fromSeason = byId.get(id);
      const fromGame = allEntries.find(
        (e) => (e.game.leagueGroupId ?? e.game.leagueGroup?.id) === id,
      )?.game.leagueGroup;
      const color = fromSeason?.color ?? fromGame?.color;
      return {
        id,
        name: fromSeason?.name ?? fromGame?.name ?? id,
        color: color ?? undefined,
      };
    });
  }, [allEntries, groups, userGroupIds]);

  useEffect(() => {
    if (!showGroupFilter) {
      setSelectedGroupId((prev) => (prev === ALL_GROUP_ID ? prev : ALL_GROUP_ID));
      return;
    }
    if (selectedGroupId !== ALL_GROUP_ID && !userGroupIds.includes(selectedGroupId)) {
      setSelectedGroupId(ALL_GROUP_ID);
    }
  }, [selectedGroupId, showGroupFilter, userGroupIds]);

  const entries = useMemo(() => {
    return allEntries.filter(({ game }) => {
      if (!gameMatchesLeagueScheduleMyStatus(game, statusFilter)) return false;
      if (!showGroupFilter || selectedGroupId === ALL_GROUP_ID) return true;
      const groupId = game.leagueGroupId ?? game.leagueGroup?.id;
      return groupId === selectedGroupId;
    });
  }, [allEntries, selectedGroupId, showGroupFilter, statusFilter]);

  const showGroupBookmark = showGroupFilter;

  const statusOptions = useMemo(
    () => [
      { value: 'ALL', label: t('gameDetails.scheduleMyStatusAll', { defaultValue: 'All' }) },
      {
        value: 'NOT_SCHEDULED',
        label: t('gameDetails.fixtureCellNotScheduled'),
      },
      {
        value: 'SCHEDULED',
        label: t('gameDetails.fixtureCellScheduled'),
      },
      {
        value: 'PLAYED',
        label: t('gameDetails.fixtureCellPlayed'),
      },
    ],
    [t],
  );

  useEffect(() => {
    if (entries.length === 0) {
      setGameResultsMap(new Map());
      return;
    }
    let cancelled = false;
    const run = async () => {
      const resultsMap = new Map<string, RoundData[] | null>();
      for (const { game } of entries) {
        if (cancelled) return;
        if (game.resultsStatus !== 'NONE') {
          try {
            const response = await resultsApi.getGameResults(game.id);
            const rounds = response.data?.rounds || [];
            resultsMap.set(game.id, rounds.length > 0 ? rounds : null);
          } catch {
            resultsMap.set(game.id, null);
          }
        } else {
          resultsMap.set(game.id, null);
        }
      }
      if (!cancelled) setGameResultsMap(resultsMap);
    };
    run();
    return () => {
      cancelled = true;
    };
  }, [entries]);

  if (!userId) {
    return (
      <p className="rounded-lg border border-gray-200/80 bg-gray-50/90 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
        {t('gameDetails.scheduleMyGamesSignIn')}
      </p>
    );
  }

  const filters = (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
      {showGroupFilter && (
        <div className="min-w-0 flex-1">
          <GroupFilterDropdown
            selectedGroupId={selectedGroupId}
            groups={userGroupOptions}
            allGroupsLabel={t('gameDetails.allGroups') || 'All groups'}
            onSelect={setSelectedGroupId}
            allGroupId={ALL_GROUP_ID}
            showGroupProgressCounts={false}
          />
        </div>
      )}
      <div className={`min-w-0 ${showGroupFilter ? 'sm:w-48 sm:shrink-0' : 'w-full sm:max-w-xs'}`}>
        <Select
          options={statusOptions}
          value={statusFilter}
          onChange={(value) => setStatusFilter(value as LeagueScheduleMyGameStatusFilter)}
        />
      </div>
    </div>
  );

  if (allEntries.length === 0) {
    return (
      <div className="space-y-3">
        {filters}
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('gameDetails.scheduleMyGamesEmpty')}
        </p>
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className="space-y-3">
        {filters}
        <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
          {t('gameDetails.scheduleMyGamesEmptyFiltered', {
            defaultValue: 'No games match these filters.',
          })}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {filters}
      <div className="space-y-4">
        {entries.map(({ round, game }) => {
          const canEditGames = canEdit && game.resultsStatus === 'NONE';
          const roundLabel = `${t('gameDetails.round')} ${round.orderIndex + 1}`;
          const bracketPath = buildLeagueHomeGameBracketPath(game);
          const metaParts = [game.leagueGroup?.name, roundLabel].filter(Boolean);
          const metaLine = metaParts.join(' · ');
          return (
            <div key={game.id} className="space-y-1">
              <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
                <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{metaLine}</p>
                {isBracketLeagueGame(game) && bracketPath && (
                  <button
                    type="button"
                    onClick={() => navigate(bracketPath)}
                    className="text-[11px] font-semibold text-indigo-600 underline-offset-2 hover:underline dark:text-indigo-400"
                  >
                    {t('gameDetails.scheduleMyGamesViewBracket', { defaultValue: 'View in bracket' })}
                  </button>
                )}
              </div>
              <LeagueGameCard
                game={game}
                onEdit={canEditGames ? () => onEditGame(game) : undefined}
                onOpen={() => onOpenGame(game)}
                onChat={onChatGameSelect}
                selectedForChat={isDesktop && selectedGameChatId === game.id}
                isDesktop={isDesktop}
                onDelete={
                  canEditGames && onDeleteGame
                    ? onDeleteGame
                    : undefined
                }
                onNoteSaved={onNoteSaved}
                showGroupTag={false}
                showGroupBookmark={showGroupBookmark && !!game.leagueGroup}
                showLeagueGroupSideAccent={false}
                allRounds={gameResultsMap.get(game.id) ?? null}
              />
            </div>
          );
        })}
      </div>
    </div>
  );
}
