import { ArrowUpRight, CalendarDays, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import type { PerformanceRelationshipGame } from '@/api/users';
import { getGameLocation } from '@/components/profileInsights/relationshipDisplay';
import { formatDate } from '@/utils/dateFormat';
import { buildUrl } from '@/utils/urlSchema';

interface RelationshipGameListProps {
  games: PerformanceRelationshipGame[];
  onOpenGame?: () => void;
}

export function RelationshipGameList({ games, onOpenGame }: RelationshipGameListProps) {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const openRelationshipGame = (game: PerformanceRelationshipGame) => {
    onOpenGame?.();
    navigate(buildUrl('game', { id: game.id }));
  };

  const getRelationshipGameTitle = (game: PerformanceRelationshipGame) => {
    if (game.name?.trim()) return game.name.trim();
    const gameType = t(`games.gameTypes.${game.gameType}`, { defaultValue: game.gameType });
    const entityType = t(`games.entityTypes.${game.entityType}`, { defaultValue: game.entityType });
    return game.gameType === 'CLASSIC' ? entityType : gameType;
  };

  if (games.length === 0) {
    return (
      <div className="rounded-lg bg-white/70 px-3 py-4 text-center text-sm text-gray-500 dark:bg-gray-800/40 dark:text-gray-400">
        {t('profile.noSharedGames', { defaultValue: 'No shared finished games yet' })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {games.map((game) => {
        const location = getGameLocation(game);
        return (
          <button
            key={game.id}
            type="button"
            className="group flex w-full items-center gap-3 rounded-xl border border-gray-200/70 bg-white/85 px-3 py-2.5 text-start shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-primary-200 hover:bg-primary-50/70 hover:shadow-md focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700/70 dark:bg-gray-800/70 dark:hover:border-primary-800 dark:hover:bg-primary-950/25"
            onClick={() => openRelationshipGame(game)}
          >
            <div className="flex h-11 w-14 shrink-0 flex-col items-center justify-center rounded-lg bg-gray-100 text-[10px] font-semibold uppercase tracking-wide text-gray-500 dark:bg-gray-700/80 dark:text-gray-300">
              <CalendarDays size={14} className="mb-0.5" aria-hidden />
              <span>{formatDate(game.startTime, 'MMM d')}</span>
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-semibold text-gray-900 dark:text-white">
                {getRelationshipGameTitle(game)}
              </div>
              <div className="mt-0.5 flex min-w-0 items-center gap-1 text-xs text-gray-500 dark:text-gray-400">
                <MapPin size={12} className="shrink-0" aria-hidden />
                <span className="truncate">{location || t(`games.entityTypes.${game.entityType}`, { defaultValue: game.entityType })}</span>
              </div>
              <div className="mt-1 flex flex-wrap gap-1">
                <span className="rounded-full bg-blue-50 px-1.5 py-0.5 text-[10px] font-semibold text-blue-700 dark:bg-blue-950/40 dark:text-blue-300">
                  {t('games.resultsAvailable')}
                </span>
                <span className={`rounded-full px-1.5 py-0.5 text-[10px] font-semibold ${
                  game.affectsRating
                    ? 'bg-green-50 text-green-700 dark:bg-green-950/40 dark:text-green-300'
                    : 'bg-gray-100 text-gray-600 dark:bg-gray-700/70 dark:text-gray-300'
                }`}
                >
                  {game.affectsRating ? t('games.Rating') : t('games.noRating')}
                </span>
              </div>
            </div>
            <ArrowUpRight size={17} className="shrink-0 text-gray-400 transition-colors group-hover:text-primary-600 dark:group-hover:text-primary-300" aria-hidden />
          </button>
        );
      })}
    </div>
  );
}
