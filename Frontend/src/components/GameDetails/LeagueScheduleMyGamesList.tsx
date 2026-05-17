import { useEffect, useMemo, useState } from 'react';
import type { TFunction } from 'i18next';
import type { LeagueRound } from '@/api/leagues';
import type { Game } from '@/types';
import { resultsApi, type RoundData } from '@/api/results';
import { LeagueGameCard } from './LeagueGameCard';
import { userIsOnLeagueScheduleGame } from '@/utils/leagueScheduleUserGames';
import { useDesktop } from '@/hooks/useDesktop';
interface LeagueScheduleMyGamesListProps {
  filteredRounds: LeagueRound[];
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
  const [gameResultsMap, setGameResultsMap] = useState<Map<string, RoundData[] | null>>(new Map());

  const entries = useMemo(() => {
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
      return a.game.startTime.localeCompare(b.game.startTime);
    });
    return out;
  }, [filteredRounds, userId]);

  useEffect(() => {
    if (entries.length === 0) {
      setGameResultsMap(new Map());
      return;
    }
    const run = async () => {
      const resultsMap = new Map<string, RoundData[] | null>();
      for (const { game } of entries) {
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
      setGameResultsMap(resultsMap);
    };
    run();
  }, [entries]);

  if (!userId) {
    return (
      <p className="rounded-lg border border-gray-200/80 bg-gray-50/90 px-3 py-2 text-sm text-gray-600 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-300">
        {t('gameDetails.scheduleMyGamesSignIn')}
      </p>
    );
  }

  if (entries.length === 0) {
    return (
      <p className="rounded-lg border border-dashed border-gray-200 dark:border-gray-700 px-3 py-8 text-center text-sm text-gray-500 dark:text-gray-400">
        {t('gameDetails.scheduleMyGamesEmpty')}
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {entries.map(({ round, game }) => {
        const canEditGames = canEdit && game.resultsStatus === 'NONE';
        const roundLabel = `${t('gameDetails.round')} ${round.orderIndex + 1}`;
        const metaLine = game.leagueGroup?.name ? `${game.leagueGroup.name} · ${roundLabel}` : roundLabel;
        return (
          <div key={game.id} className="space-y-1">
            <p className="text-[11px] font-medium text-gray-500 dark:text-gray-400">{metaLine}</p>
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
              showLeagueGroupSideAccent={false}
              allRounds={gameResultsMap.get(game.id) ?? null}
            />
          </div>
        );
      })}
    </div>
  );
}
