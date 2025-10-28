import { Card } from '@/components';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { GameStatusIcon } from '@/components';
import {
  Calendar,
  MapPin,
  Clock,
  MessageCircle,
  Edit3,
  Star,
  Beer,
  Crown,
  Ban,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GameInfoProps {
  game: Game;
  isOwner: boolean;
  isGuest: boolean;
  courts: any[];
  onToggleFavorite: () => void;
  onEditCourt: () => void;
}

export const GameInfo = ({ 
  game, 
  isOwner, 
  isGuest, 
  courts, 
  onToggleFavorite, 
  onEditCourt 
}: GameInfoProps) => {
  const { t } = useTranslation();

  return (
    <Card>
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <GameStatusIcon status={game.status} className="p-1" />
            {isOwner && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                <Crown size={14} />
                {t('games.organizerFull')}
              </span>
            )}
            {game.entityType !== 'GAME' && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
                {game.entityType === 'BAR' && <Beer size={14} />}
                {t(`games.entityTypes.${game.entityType}`)}
              </span>
            )}
            {game.gameType !== 'CLASSIC' && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300">
                {t(`games.gameTypes.${game.gameType}`)}
              </span>
            )}
            {isGuest && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {t('chat.guest')}
              </span>
            )}
            {!game.affectsRating && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                <Ban size={14} />
                {t('games.noRating')}
              </span>
            )}
          </div>
          {game.name && game.name.trim() !== '' && game.gameType !== 'CLASSIC' && (
            <p className="text-gray-700 dark:text-gray-300 mb-2">
              {game.name}
            </p>
          )}
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            {game.gameType === 'CLASSIC' ? game.name : (game.name || t(`games.gameTypes.${game.gameType}`))}
          </h1>
        </div>
      </div>

      <div className="space-y-3 mb-6">
        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
          <Calendar size={20} className="text-primary-600 dark:text-primary-400" />
          <span>{formatDate(game.startTime, 'PPP')}</span>
        </div>
        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
          <Clock size={20} className="text-primary-600 dark:text-primary-400" />
          <span>
            {game.entityType === 'BAR' 
              ? formatDate(game.startTime, 'p')
              : `${formatDate(game.startTime, 'p')} - ${formatDate(game.endTime, 'p')}`
            }
          </span>
        </div>
        {(game.court?.club || game.club) && (
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <MapPin size={20} className="text-primary-600 dark:text-primary-400" />
            <div className="flex-1">
              <p className="font-medium">{game.court?.club?.name || game.club?.name}</p>
              {game.court && !(game.entityType === 'BAR' && courts.length === 1) && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {game.court.name}
                </p>
              )}
              {!game.court && game.club && (
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('createGame.notBookedYet')}
                </p>
              )}
              {/* Show booking status */}
              {game.court && (
                <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
                  {game.hasBookedCourt 
                    ? (game.entityType === 'BAR' ? t('createGame.hasBookedHall') : t('createGame.hasBookedCourt'))
                    : t('createGame.notBookedYet')
                  }
                </p>
              )}
            </div>
            <div className="flex items-center gap-2">
              {game.entityType === 'BAR' && isOwner && courts.length > 1 && (
                <button
                  onClick={onEditCourt}
                  className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                  title={t('gameDetails.editHall')}
                >
                  <Edit3 size={20} className="text-gray-400 hover:text-primary-600" />
                </button>
              )}
              <button
                onClick={onToggleFavorite}
                className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
                title={game.isClubFavorite ? t('favorites.removeFromFavorites') : t('favorites.addToFavorites')}
              >
                <Star 
                  size={20} 
                  className={game.isClubFavorite 
                    ? 'text-yellow-500 fill-yellow-500' 
                    : 'text-gray-400 hover:text-yellow-500'
                  } 
                />
              </button>
            </div>
          </div>
        )}
        
        {/* Game Description/Comments */}
        {game.description && game.description.trim() !== '' && (
          <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
            <MessageCircle size={20} className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
            <p className="text-gray-600 dark:text-gray-400">{game.description}</p>
          </div>
        )}
      </div>
    </Card>
  );
};
