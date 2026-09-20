import { memo } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { GameCardDateTile } from '@/components/gameCard/GameCardDateTile';
import type { EntityType } from '@/types';
import type { PairRecentGame } from '@/api/pairs';

export interface PairRecentGameCardProps {
  game: PairRecentGame;
}

/**
 * A compact `GameCard` for the pair sheet's "Recent together" list: the house
 * date tile on the inline-start edge, the title and club, and a result chip.
 *
 * The chip says "Win" / "Loss" in words as well as colour, so the outcome
 * survives a colour-blind reader and a screen reader alike.
 */
export const PairRecentGameCard = memo(({ game }: PairRecentGameCardProps) => {
  const { t, i18n } = useTranslation();
  const navigate = useNavigate();

  return (
    <button
      type="button"
      onClick={() => navigate(`/games/${game.id}`)}
      data-testid="pair-recent-game"
      className="flex min-h-[3.5rem] w-full items-center gap-3 rounded-xl border border-gray-200 bg-white px-2.5 py-2 text-start transition-colors hover:bg-gray-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-800 dark:hover:bg-gray-700/60"
    >
      <GameCardDateTile
        date={game.startTime}
        timezone={null}
        locale={i18n.language}
        entityType={game.entityType as EntityType}
      />
      <span className="flex min-w-0 flex-1 flex-col">
        <span className="truncate text-sm font-medium text-gray-900 dark:text-white">
          {game.name || t('pairs.recent.untitled')}
        </span>
        {game.clubName ? (
          <span className="truncate text-xs text-gray-500 dark:text-gray-400">{game.clubName}</span>
        ) : null}
      </span>
      <span
        className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${
          game.won
            ? 'bg-green-100 text-green-700 dark:bg-green-500/20 dark:text-green-300'
            : 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-300'
        }`}
      >
        {game.won ? t('pairs.result.win') : t('pairs.result.loss')}
      </span>
    </button>
  );
});

PairRecentGameCard.displayName = 'PairRecentGameCard';
