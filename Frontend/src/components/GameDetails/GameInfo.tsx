import { useState } from 'react';
import { Card } from '@/components';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { GameStatusIcon } from '@/components';
import { ShareModal } from '@/components/ShareModal';
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
  Users,
  ExternalLink,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';

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
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState({ url: '', title: '', text: '' });

  const handleNavigate = () => {
    const club = game.court?.club || game.club;
    if (!club) return;

    const destinationParts = [club.city?.country, club.city?.name, club.address].filter(Boolean);
    const destination = encodeURIComponent(destinationParts.join('+'));
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleShare = async () => {
    const shareUrl = window.location.href;
    const clubName = game.court?.club?.name || game.club?.name || '';

    const shareParts = [];
    if (game.entityType !== 'GAME') {
      shareParts.push(t(`games.entityTypes.${game.entityType}`));
    }
    if (game.name) {
      shareParts.push(game.name);
    }
    if (clubName) {
      shareParts.push(clubName);
    }

    const shareTitle = shareParts.join(' - ');
    const shareText = `${shareTitle} - ${formatDate(game.startTime, 'PPP')}`;

    if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
      try {
        await navigator.share({
          title: shareTitle,
          text: shareText,
          url: shareUrl,
        });
        return;
      } catch (error) {
        if ((error as Error).name === 'AbortError') {
          return;
        }
        console.error('Error sharing:', error);
      }
    }

    if (navigator.clipboard && (window.isSecureContext || location.protocol === 'https:')) {
      try {
        await navigator.clipboard.writeText(shareUrl);
        toast.success(t('gameDetails.linkCopied'));
        return;
      } catch (error) {
        console.error('Error copying to clipboard:', error);
      }
    }

    setShareData({ url: shareUrl, title: shareTitle, text: shareText });
    setShowShareModal(true);
  };

  return (
    <Card className="relative">
      <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
        <button
          onClick={handleShare}
          className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110"
          title={t('gameDetails.shareGame')}
        >
          <ExternalLink size={24} className="text-white" />
        </button>
        <button
          onClick={handleNavigate}
          className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110"
          title={t('gameDetails.navigateToClub')}
        >
          <svg width="24" height="24" viewBox="0 0 1024 1024" version="1.1" xmlns="http://www.w3.org/2000/svg">
            <path d="M63.3 512.2a448.5 448 0 1 0 897 0 448.5 448 0 1 0-897 0Z" fill="#ffffff" />
            <path d="M416.09375 605.09375c1.21875 0.5625 2.15625 1.5 2.71875 2.71875l82.3125 175.6875c3.1875 6.84375 12.84375 7.03125 15.75 0.375l201.84375-465.75c3.5625-8.15625-4.78125-16.5-12.9375-12.9375L240.125 507.03125c-6.75 2.90625-6.5625 12.5625 0.375 15.75l175.59375 82.3125z" fill="#0284c7" />
          </svg>
        </button>
      </div>
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
            {game.hasFixedTeams && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                <Users size={14} />
                <Users size={14} />
                {t('games.fixedTeams')}
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
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareData.url}
        shareTitle={shareData.title}
        shareText={shareData.text}
      />
    </Card>
  );
};
