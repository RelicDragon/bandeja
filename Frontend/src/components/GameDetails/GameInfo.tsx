import { useState } from 'react';
import { Card } from '@/components';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { GameStatusIcon } from '@/components';
import { ShareModal } from '@/components/ShareModal';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { GameAvatar } from '@/components/GameAvatar';
import { UrlConstructor } from '@/utils/urlConstructor';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { EditGameTextModal } from './EditGameTextModal';
import { EditGamePriceModal } from './EditGamePriceModal';
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
  Award,
  Lock,
  Swords,
  Trophy,
  GraduationCap,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface GameInfoProps {
  game: Game;
  isOwner: boolean;
  isGuest: boolean;
  courts: any[];
  canEdit: boolean;
  isEditMode: boolean;
  onToggleFavorite: () => void;
  onEditCourt: () => void;
  onOpenLocationModal: () => void;
  onOpenTimeDurationModal: () => void;
  onScrollToSettings: () => void;
  onGameUpdate?: (game: Game) => void;
}

export const GameInfo = ({
  game,
  isOwner,
  isGuest,
  courts,
  canEdit,
  isEditMode,
  onToggleFavorite,
  onEditCourt,
  onOpenLocationModal,
  onOpenTimeDurationModal,
  onScrollToSettings,
  onGameUpdate
}: GameInfoProps) => {
  const { t } = useTranslation();
  const showTags = game.entityType !== 'LEAGUE';
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState({ url: '', title: '', text: '' });
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showEditGameTextModal, setShowEditGameTextModal] = useState(false);
  const [showEditGamePriceModal, setShowEditGamePriceModal] = useState(false);

  const ownerParticipant = game.participants?.find(p => p.role === 'OWNER');
  const owner = ownerParticipant?.user;

  const handleNavigate = () => {
    const club = game.court?.club || game.club;
    const destinationParts = [game.city.country, game.city.name, club?.address].filter(Boolean);
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

  const getEntityGradient = () => {
    switch (game.entityType) {
      case 'TOURNAMENT':
        return 'bg-gradient-to-br from-red-50/60 via-orange-50/40 to-red-50/60 dark:from-red-950/25 dark:via-orange-950/15 dark:to-red-950/25 border-l-2 border-red-300 dark:border-red-800 shadow-[0_0_8px_rgba(239,68,68,0.15)] dark:shadow-[0_0_8px_rgba(239,68,68,0.2)]';
      case 'LEAGUE':
        return 'bg-gradient-to-br from-blue-50/60 via-purple-50/40 to-blue-50/60 dark:from-blue-950/25 dark:via-purple-950/15 dark:to-blue-950/25 border-l-2 border-blue-300 dark:border-blue-800 shadow-[0_0_8px_rgba(59,130,246,0.15)] dark:shadow-[0_0_8px_rgba(59,130,246,0.2)]';
      case 'TRAINING':
        return 'bg-gradient-to-br from-green-50/60 via-teal-50/40 to-green-50/60 dark:from-green-950/25 dark:via-teal-950/15 dark:to-green-950/25 border-l-2 border-green-300 dark:border-green-800 shadow-[0_0_8px_rgba(34,197,94,0.15)] dark:shadow-[0_0_8px_rgba(34,197,94,0.2)]';
      case 'BAR':
        return 'bg-gradient-to-br from-yellow-50/60 via-amber-50/40 to-yellow-50/60 dark:from-yellow-950/25 dark:via-amber-950/15 dark:to-yellow-950/25 border-l-2 border-yellow-300 dark:border-yellow-800 shadow-[0_0_8px_rgba(234,179,8,0.15)] dark:shadow-[0_0_8px_rgba(234,179,8,0.2)]';
      default:
        return '';
    }
  };

  const getEntityIcon = () => {
    if (game.entityType === 'GAME') return null;
    
    switch (game.entityType) {
      case 'TOURNAMENT':
        return <Swords size={40} className="text-red-500 dark:text-red-400 opacity-15 dark:opacity-15" />;
      case 'LEAGUE':
        return <Trophy size={40} className="text-blue-500 dark:text-blue-400 opacity-15 dark:opacity-15" />;
      case 'TRAINING':
        return <GraduationCap size={48} className="text-green-500 dark:text-green-400 opacity-15 dark:opacity-15" />;
      case 'BAR':
        return <Beer size={40} className="text-yellow-500 dark:text-yellow-400 opacity-15 dark:opacity-15" />;
      default:
        return null;
    }
  };

  return (
    <Card className={`relative ${getEntityGradient()}`}>
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
          <MapPin size={24} className="text-white" />
        </button>
      </div>
      {game.entityType !== 'GAME' && (
        <div className="absolute bottom-2 right-2 z-0 pointer-events-none">
          {getEntityIcon()}
        </div>
      )}
      {game.avatar && (
        <div className="mb-4 flex justify-center">
          <div className="relative">
            <button
              onClick={() => setShowFullscreenAvatar(true)}
              className="relative transition-all duration-200 hover:opacity-90 cursor-pointer"
            >
              <GameAvatar avatar={game.avatar} extralarge={true} alt={game.name || t('gameDetails.gameAvatar')} />
            </button>
          </div>
        </div>
      )}
      <div className="flex items-start justify-between mb-4">
        <div className="pr-20 flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-2 flex-wrap">
            <GameStatusIcon status={game.status} className="p-1" />
            {showTags && !game.isPublic && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                <Lock size={14} />
                {t('games.private')}
              </span>
            )}
            {showTags && game.genderTeams && game.genderTeams !== 'ANY' && (
              <div className="flex items-center gap-1">
                {game.genderTeams === 'MIX_PAIRS' ? (
                  <div className="h-6 px-2 rounded-full bg-gradient-to-r from-blue-500 to-pink-500 dark:from-blue-600 dark:to-pink-600 flex items-center justify-center gap-1">
                    <i className="bi bi-gender-male text-white text-[10px]"></i>
                    <i className="bi bi-gender-female -ml-1 text-white text-[10px]"></i>
                  </div>
                ) : (
                  <div className={`w-4 h-4 rounded-full flex items-center justify-center ${
                    game.genderTeams === 'MEN' 
                      ? 'bg-blue-500 dark:bg-blue-600' 
                      : 'bg-pink-500 dark:bg-pink-600'
                  }`}>
                    <i className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-[10px]`}></i>
                  </div>
                )}
              </div>
            )}
            {showTags && isOwner && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1">
                <Crown size={14} />
                {t('games.organizerFull')}
              </span>
            )}
            {showTags && game.entityType !== 'GAME' && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
                {game.entityType === 'TOURNAMENT' && <Swords size={14} />}
                {game.entityType === 'LEAGUE_SEASON' && <Trophy size={14} />}
                {game.entityType === 'TRAINING' && <GraduationCap size={14} />}
                {game.entityType === 'BAR' && <Beer size={14} />}
                {t(`games.entityTypes.${game.entityType}`)}
              </span>
            )}
            {showTags && game.gameType !== 'CLASSIC' && (
              <button
                onClick={() => canEdit && setShowEditGameTextModal(true)}
                className={`px-3 py-1 text-sm font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 ${
                  canEdit ? 'hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors' : ''
                }`}
              >
                {t(`games.gameTypes.${game.gameType}`)}
              </button>
            )}
            {showTags && isGuest && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
                {t('chat.guest')}
              </span>
            )}
            {showTags && !game.affectsRating && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
                <Ban size={14} />
                {t('games.noRating')}
              </span>
            )}
            {showTags && game.hasFixedTeams && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
                <div className="flex items-center">
                  <Users size={14} />
                  <Users size={14} />
                </div>
                {t('games.fixedTeams')}
              </span>
            )}
            {showTags && (game.status === 'STARTED' || game.status === 'FINISHED') && game.resultsStatus === 'FINAL' && (
              <span className="px-3 py-1 text-sm font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
                <Award size={14} />
                {t('games.resultsAvailable')}
              </span>
            )}
          </div>
          {game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name ? (
            <>
              <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {game.parent.leagueSeason.league.name}
              </h1>
              {game.parent.leagueSeason.game?.name && (
                <p className="text-2xl font-semibold text-purple-600 dark:text-purple-400 mt-2">
                  {game.parent.leagueSeason.game.name}
                </p>
              )}
              <p className="text-xl font-medium mt-2 flex items-center gap-2 flex-wrap">
                {game.leagueGroup?.name && (
                  <span 
                    className="px-3 py-1 text-sm font-medium rounded text-white"
                    style={{ backgroundColor: game.leagueGroup.color || '#6b7280' }}
                  >
                    {game.leagueGroup.name}
                  </span>
                )}
                <span className="text-gray-600 dark:text-gray-400">{t('gameDetails.round')} {game.leagueRound.orderIndex + 1}</span>
              </p>
            </>
          ) : game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name ? (
            <>
              <h1 className="text-3xl font-bold text-blue-600 dark:text-blue-400">
                {game.leagueSeason.league.name}
              </h1>
              {game.name && game.name.trim() !== '' && (
                <button
                  onClick={() => canEdit && setShowEditGameTextModal(true)}
                  className={`text-2xl font-semibold text-purple-600 dark:text-purple-400 mt-2 ${
                    canEdit ? 'hover:text-purple-700 dark:hover:text-purple-300 cursor-pointer transition-colors' : ''
                  }`}
                >
                  {game.name}
                </button>
              )}
            </>
          ) : (
            <>
              <h1 
                onClick={() => canEdit && setShowEditGameTextModal(true)}
                className={`text-3xl font-bold text-gray-900 dark:text-white ${
                  canEdit ? 'hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer transition-colors' : ''
                }`}
              >
                {game.name && game.name.trim() !== '' ? game.name : t(`games.gameTypes.${game.gameType}`)}
              </h1>
            </>
          )}
        </div>
      </div>

      <div className="space-y-3 mb-0">
        <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
          <Calendar size={20} className="text-primary-600 dark:text-primary-400" />
          <span>{formatDate(game.startTime, 'PPP')}</span>
        </div>
        {game.entityType !== 'LEAGUE_SEASON' && (
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <Clock size={20} className="text-primary-600 dark:text-primary-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        onScrollToSettings();
                      } else {
                        onOpenTimeDurationModal();
                      }
                    }}
                    className="font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    {game.entityType === 'BAR' 
                      ? formatDate(game.startTime, 'p')
                      : `${formatDate(game.startTime, 'p')} - ${formatDate(game.endTime, 'p')}`
                    }
                  </button>
                ) : (
                  <span>
                    {game.entityType === 'BAR' 
                      ? formatDate(game.startTime, 'p')
                      : `${formatDate(game.startTime, 'p')} - ${formatDate(game.endTime, 'p')}`
                    }
                  </span>
                )}
              </div>
            </div>
          </div>
        )}
        {(game.court?.club || game.club) && (
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <MapPin size={20} className="text-primary-600 dark:text-primary-400" />
            <div className="flex-1">
              <div className="flex items-center gap-2">
                {canEdit ? (
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        onScrollToSettings();
                      } else {
                        onOpenLocationModal();
                      }
                    }}
                    className="font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    {game.court?.club?.name || game.club?.name}
                  </button>
                ) : (
                  <p className="font-medium">{game.court?.club?.name || game.club?.name}</p>
                )}
                <button
                  onClick={onToggleFavorite}
                  className="p-2 pb-0 pt-0 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
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
            </div>
          </div>
        )}
        {!isOwner && owner && (
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <Crown size={20} className="text-primary-600 dark:text-primary-400" />
            <PlayerAvatar
              player={owner}
              extrasmall={true}
              showName={false}
            />
            <span className="text-sm">
              {[owner.firstName, owner.lastName].filter(name => name && name.trim()).join(' ')}
            </span>
          </div>
        )}
        
        {/* Game Price */}
        {((game.priceType && game.priceType !== 'NOT_KNOWN') || canEdit) && (
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <span className="text-primary-600 dark:text-primary-400" style={{ fontSize: '20px', lineHeight: '20px', width: '20px', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>€</span>
            <div className="flex-1">
              {canEdit ? (
                <button
                  onClick={() => setShowEditGamePriceModal(true)}
                  className="font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                >
                  {game.priceType && game.priceType !== 'NOT_KNOWN' && game.priceTotal !== undefined
                    ? `${game.priceTotal} ${game.priceCurrency || 'EUR'} (${t(`createGame.priceType${game.priceType === 'PER_PERSON' ? 'PerPerson' : game.priceType === 'PER_TEAM' ? 'PerTeam' : 'Total'}`)})`
                    : t('createGame.priceNotSet')}
                </button>
              ) : (
                <span>
                  {game.priceType && game.priceType !== 'NOT_KNOWN' && game.priceTotal !== undefined
                    ? `${game.priceTotal} ${game.priceCurrency || 'EUR'} (${t(`createGame.priceType${game.priceType === 'PER_PERSON' ? 'PerPerson' : game.priceType === 'PER_TEAM' ? 'PerTeam' : 'Total'}`)})`
                    : ''}
                </span>
              )}
            </div>
          </div>
        )}
        
        {/* Game Description/Comments */}
        {game.description && game.description.trim() !== '' && (
          <div className="flex items-start gap-3 text-gray-700 dark:text-gray-300">
            <MessageCircle size={20} className="text-primary-600 dark:text-primary-400 mt-0.5 flex-shrink-0" />
            <button
              onClick={() => canEdit && setShowEditGameTextModal(true)}
              className={`text-gray-600 dark:text-gray-400 text-left ${
                canEdit ? 'hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer transition-colors' : ''
              }`}
            >
              {game.description}
            </button>
          </div>
        )}
      </div>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareData.url}
        shareText={shareData.text}
      />
      {showFullscreenAvatar && game.originalAvatar && (
        <FullscreenImageViewer
          imageUrl={UrlConstructor.constructImageUrl(game.originalAvatar)}
          onClose={() => setShowFullscreenAvatar(false)}
        />
      )}
      <EditGameTextModal
        isOpen={showEditGameTextModal}
        onClose={() => setShowEditGameTextModal(false)}
        game={game}
        onGameUpdate={onGameUpdate}
      />
      <EditGamePriceModal
        isOpen={showEditGamePriceModal}
        onClose={() => setShowEditGamePriceModal(false)}
        game={game}
        onGameUpdate={onGameUpdate}
      />
    </Card>
  );
};
