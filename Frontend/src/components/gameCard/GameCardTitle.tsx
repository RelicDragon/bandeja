import { useTranslation } from 'react-i18next';
import type { Game } from '@/types';

/**
 * Unified card title for every entity type:
 * - LEAGUE round games: league name + season name, with group/round chips below
 * - LEAGUE_SEASON: league name + season name
 * - everything else: game name (with game-type hint) or a sensible fallback
 */
export function GameCardTitle({ game }: { game: Game }) {
  const { t } = useTranslation();

  const parentSeason = game.parent?.leagueSeason;
  const isLeagueRound =
    game.entityType === 'LEAGUE' && Boolean(game.leagueRound && parentSeason?.league?.name);
  const seasonLeagueName = game.leagueSeason?.league?.name;
  const isLeagueSeason = game.entityType === 'LEAGUE_SEASON' && Boolean(seasonLeagueName);

  if (isLeagueRound && parentSeason) {
    return (
      <span className="min-w-0">
        <span className="text-blue-600 dark:text-blue-400">{parentSeason.league?.name}</span>
        {parentSeason.game?.name && (
          <span className="text-purple-600 dark:text-purple-400"> {parentSeason.game.name}</span>
        )}
        {(game.leagueGroup?.name || game.leagueRound) && (
          <span className="mt-1 flex flex-wrap items-center gap-1.5">
            {game.leagueGroup?.name && (
              <span
                className="rounded-full px-2 py-0.5 text-[11px] font-medium leading-none text-white"
                style={{ backgroundColor: game.leagueGroup.color || '#6b7280' }}
              >
                {game.leagueGroup.name}
              </span>
            )}
            {game.leagueRound && (
              <span className="text-xs font-normal text-gray-600 dark:text-gray-400">
                {t('gameDetails.round')} {game.leagueRound.orderIndex + 1}
              </span>
            )}
          </span>
        )}
      </span>
    );
  }

  if (isLeagueSeason) {
    return (
      <span className="min-w-0">
        <span className="text-blue-600 dark:text-blue-400">{seasonLeagueName}</span>
        {game.name && <span className="text-purple-600 dark:text-purple-400"> {game.name}</span>}
      </span>
    );
  }

  const gameTypeLabel =
    game.entityType !== 'TRAINING' && game.gameType !== 'CLASSIC'
      ? t(`games.gameTypes.${game.gameType}`)
      : null;

  if (game.name) {
    return (
      <span className="min-w-0">
        {game.name}
        {gameTypeLabel && (
          <span className="ml-1.5 text-xs font-normal text-gray-500 dark:text-gray-400">
            ({gameTypeLabel})
          </span>
        )}
      </span>
    );
  }

  if (gameTypeLabel) {
    return <span className="min-w-0">{gameTypeLabel}</span>;
  }

  if (game.entityType !== 'GAME') {
    return <span className="min-w-0">{t(`games.entityTypes.${game.entityType}`)}</span>;
  }

  return null;
}
