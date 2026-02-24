import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TrainerRatingBadge } from '@/components/TrainerRatingBadge';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { Game } from '@/types';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay, getClubTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';

import { useAuthStore } from '@/store/authStore';
import { chatApi } from '@/api/chat';
import { UserGameNoteModal } from '@/components/GameDetails/UserGameNoteModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { Calendar, MapPin, Users, MessageCircle, Dumbbell, Beer, Ban, Award, Lock, Swords, Trophy, Camera, Star, Plane, Bookmark } from 'lucide-react';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface GameCardProps {
  game: Game;
  user: any;
  onClick?: () => void;
  showChatIndicator?: boolean;
  showJoinButton?: boolean;
  onJoin?: (gameId: string, e: React.MouseEvent) => void;
  onNoteSaved?: (gameId: string) => void;
  unreadCount?: number;
}

export const GameCard = ({ 
  game, 
  user, 
  onClick,
  showChatIndicator = true, 
  showJoinButton = false, 
  onJoin,
  onNoteSaved,
  unreadCount = 0,
}: GameCardProps) => {
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const effectiveUser = user || authUser;
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const [mainPhotoUrl, setMainPhotoUrl] = useState<string | null>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [joinAction, setJoinAction] = useState<'game' | 'queue' | null>(null);

  useEffect(() => {
    const loadMainPhoto = async () => {
      if (!game.mainPhotoId || !game.id || game.status === 'ANNOUNCED' || !user) {
        setMainPhotoUrl(null);
        return;
      }

      try {
        const messages = await chatApi.getGameMessages(game.id, 1, 50, 'PHOTOS');
        const mainPhotoMessage = messages.find(msg => msg.id === game.mainPhotoId);

        if (mainPhotoMessage && mainPhotoMessage.mediaUrls && mainPhotoMessage.mediaUrls.length > 0) {
          const thumbnailUrl = mainPhotoMessage.thumbnailUrls && mainPhotoMessage.thumbnailUrls[0]
            ? mainPhotoMessage.thumbnailUrls[0]
            : mainPhotoMessage.mediaUrls[0];
          setMainPhotoUrl(thumbnailUrl || '');
        } else {
          setMainPhotoUrl(null);
        }
      } catch (error: any) {
        // Silently handle 401 errors (unauthorized) - expected when user is not authenticated
        if (error?.response?.status !== 401) {
          console.error('Failed to load main photo:', error);
        }
        setMainPhotoUrl(null);
      }
    };

    loadMainPhoto();
  }, [game.mainPhotoId, game.id, game.status, user]);

  const participants = game.participants ?? [];
  const participation = getGameParticipationState(participants, effectiveUser?.id, game);
  const isParticipant = participation.isPlaying;
  const isUserParticipant = participation.isParticipant;
  const isGuest = participation.isGuest || (!participation.isPlaying && !participation.isAdminOrOwner);
  const canAccessChat = true;
  const isLeagueSeasonGame = game.entityType === 'LEAGUE_SEASON';
  const shouldShowTiming = !isLeagueSeasonGame;
  const displaySettings = effectiveUser ? resolveDisplaySettings(effectiveUser) : resolveDisplaySettings(null);

  const hasUnoccupiedSlots = !participation.isFull;
  const owner = participants.find((p) => p.role === 'OWNER');
  const ownerIsPremium = owner?.user?.isPremium === true;
  const showFireIcon =
    ownerIsPremium &&
    game.status === 'ANNOUNCED' &&
    ((['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE_SEASON'].includes(game.entityType) && hasUnoccupiedSlots) ||
      game.entityType === 'BAR');
  const hasMyInvites = participation.hasPendingInvite;
  const isInJoinQueue = participation.isInJoinQueue;

  const userNoteDisplay = game.userNote ?? null;
  const joinQueueCount = participants.filter(p => p.status === 'IN_QUEUE').length;
  const showJoinQueueHint =
    joinQueueCount > 0 &&
    participation.isAdminOrOwner;
  const handleNoteSaved = useCallback(() => {
    onNoteSaved?.(game.id);
  }, [game.id, onNoteSaved]);

  const hasOtherTags = (game.photosCount ?? 0) > 0 ||
    !game.isPublic ||
    (game.genderTeams && game.genderTeams !== 'ANY') ||
    participants.some(p => p.userId === effectiveUser?.id && ['OWNER', 'ADMIN'].includes(p.role)) ||
    game.entityType !== 'GAME' ||
    isGuest ||
    !game.affectsRating ||
    game.hasFixedTeams ||
    ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') && game.resultsStatus === 'FINAL');

  const hasVisibleGameName = (game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name) ||
    (game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name) ||
    game.name;

  const shouldMoveIconsToTitle = hasVisibleGameName && !hasOtherTags;
  const userCityId = effectiveUser?.currentCity?.id || effectiveUser?.currentCityId;
  const gameCityId = game.city?.id;
  const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
  const clubTz = getClubTimezone(game);
  const getDateLabelResolved = (date: Date | string, includeComma = true) =>
    clubTz
      ? getDateLabelInClubTz(date, clubTz, displaySettings, t) + (includeComma ? '•' : '')
      : getDateLabelFallback(date, includeComma);
  const getTimeDisplay = (kind: 'time' | 'timeRange') =>
    getGameTimeDisplay({
      game,
      displaySettings,
      startTime: game.startTime,
      endTime: game.entityType !== 'BAR' ? game.endTime : undefined,
      kind,
      t,
    });
  const timeDisplay = getTimeDisplay('time');
  const timeRangeDisplay = getTimeDisplay('timeRange');

  const handleChatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    const participant = game.participants?.find((p) => p.userId === effectiveUser?.id);
    const state = participant?.status === 'PLAYING' ? { initialChatType: 'PRIVATE' as const } : undefined;
    navigate(`/games/${game.id}/chat`, { state });
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/games/${game.id}`);
    }
  };


  const getDateLabelFallback = (date: Date | string, includeComma = true) => {
    const gameDate = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

    // Reset time to compare only dates
    const gameDateOnly = new Date(gameDate.getFullYear(), gameDate.getMonth(), gameDate.getDate());
    const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());
    const tomorrowOnly = new Date(tomorrow.getFullYear(), tomorrow.getMonth(), tomorrow.getDate());
    const yesterdayOnly = new Date(yesterday.getFullYear(), yesterday.getMonth(), yesterday.getDate());

    if (gameDateOnly.getTime() === todayOnly.getTime()) {
      return t('createGame.today');
    } else if (gameDateOnly.getTime() === tomorrowOnly.getTime()) {
      return t('createGame.tomorrow');
    } else if (gameDateOnly.getTime() === yesterdayOnly.getTime()) {
      return t('createGame.yesterday');
    } else {
      const daysDiff = Math.abs(Math.round((gameDateOnly.getTime() - todayOnly.getTime()) / (1000 * 60 * 60 * 24)));
      const dateFormat = daysDiff <= 7 ? 'EEEE • MMM d ' : 'MMM d ';
      return formatDate(gameDate, dateFormat) + (includeComma ? '•' : '');
    }
  };

  const getEntityGradient = () => {
    switch (game.entityType) {
      case 'TOURNAMENT':
        return 'bg-gradient-to-br from-red-50/60 via-orange-50/40 to-red-50/60 dark:from-red-950/25 dark:via-orange-950/15 dark:to-red-950/25 border-l-2 border-red-300 dark:border-red-800 shadow-[0_0_8px_rgba(239,68,68,0.15)] dark:shadow-[0_0_8px_rgba(239,68,68,0.2)]';
      case 'LEAGUE':
      case 'LEAGUE_SEASON':
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
      case 'LEAGUE_SEASON':
        return <Trophy size={40} className="text-blue-500 dark:text-blue-400 opacity-15 dark:opacity-15" />;
      case 'TRAINING':
        return <Dumbbell size={48} className="text-green-500 dark:text-green-400 opacity-15 dark:opacity-15" />;
      case 'BAR':
        return <Beer size={40} className="text-yellow-500 dark:text-yellow-400 opacity-15 dark:opacity-15" />;
      default:
        return null;
    }
  };

  return (
    <>
    <Card
      className={`hover:shadow-md hover:scale-[1.02] 
        active:scale-[1.05] transition-all duration-300 ease-in-out 
        cursor-pointer relative pb-0 ${getEntityGradient()}`}
      onClick={handleCardClick}
    >
      {game.entityType !== 'GAME' && (
        <div className="absolute top-10 right-2 z-0 pointer-events-none">
          {getEntityIcon()}
        </div>
      )}
      {/* Header - Always visible */}
      <div className="mb-3 relative z-10">
        {isDifferentCity && game.city?.name && (
          <div className="inline-flex items-center gap-1.5 mb-2 px-1.5 py-0.5 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg shadow-[0_0_8px_rgba(234,179,8,0.4)] dark:shadow-[0_0_8px_rgba(234,179,8,0.5)]">
            <Plane size={12} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 drop-shadow-[0_0_2px_rgba(234,179,8,0.8)]" />
            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300 whitespace-nowrap drop-shadow-[0_0_1px_rgba(234,179,8,0.6)]">{translateCity(game.city.id, game.city.name, game.city.country)}</span>
          </div>
        )}
        <>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 pr-20 flex items-center gap-2">
              {shouldMoveIconsToTitle && (
                <>
                  {showFireIcon && <AnnouncedFireIcon />}
                  {isUserParticipant && (
                    <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-yellow-500 dark:bg-yellow-600 text-white flex-shrink-0">
                      <Star 
                        size={12} 
                        className="text-white"
                        fill="currentColor"
                      />
                    </span>
                  )}
                  {!showFireIcon && <GameStatusIcon status={game.status} />}
                </>
              )}
              <span>
                {game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name
                  ? (
                    <>
                      <span className="text-blue-600 dark:text-blue-400">
                        {game.parent.leagueSeason.league.name}
                      </span>
                      {game.parent.leagueSeason.game?.name && (
                        <span className="text-purple-600 dark:text-purple-400"> {game.parent.leagueSeason.game.name}</span>
                      )}
                      {(game.leagueGroup?.name || game.leagueRound) && (
                        <div className="mt-1 flex items-center gap-2 flex-wrap">
                          {game.leagueGroup?.name && (
                            <span
                              className="px-2 py-0.5 text-xs font-medium rounded text-white"
                              style={{ backgroundColor: game.leagueGroup.color || '#6b7280' }}
                            >
                              {game.leagueGroup.name}
                            </span>
                          )}
                          {game.leagueRound && (
                            <span className="text-gray-600 dark:text-gray-400">
                              {t('gameDetails.round')} {game.leagueRound.orderIndex + 1}
                            </span>
                          )}
                        </div>
                      )}
                    </>
                  )
                  : game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name
                    ? (
                      <>
                        <span className="text-blue-600 dark:text-blue-400">{game.leagueSeason.league.name}</span>
                        {game.name && (
                          <span className="text-purple-600 dark:text-purple-400"> {game.name}</span>
                        )}
                      </>
                    )
                    : game.name}
                {game.entityType !== 'LEAGUE' && game.entityType !== 'LEAGUE_SEASON' && game.name && game.gameType !== 'CLASSIC' && (
                  <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                    ({t(`games.gameTypes.${game.gameType}`)})
                  </span>
                )}
                {game.entityType !== 'LEAGUE' && game.entityType !== 'LEAGUE_SEASON' && !game.name && game.gameType !== 'CLASSIC' && t(`games.gameTypes.${game.gameType}`)}
              </span>
            </h3>
            <div className="flex items-center gap-2 mb-1 pr-10 flex-wrap">
          {!shouldMoveIconsToTitle && showFireIcon && <AnnouncedFireIcon />}
          {!shouldMoveIconsToTitle && isUserParticipant && (
            <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-yellow-500 dark:bg-yellow-600 text-white">
              <Star 
                size={12} 
                className="text-white"
                fill="currentColor"
              />
            </span>
          )}
          {!shouldMoveIconsToTitle && !showFireIcon && <GameStatusIcon status={game.status} />}
          {!userNoteDisplay && effectiveUser && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
                setShowNoteModal(true);
              }}
              onPointerDown={(e) => {
                e.stopPropagation();
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
              }}
              className="p-1 text-gray-400 dark:text-gray-500 flex items-center hover:text-gray-600 dark:hover:text-gray-400 transition-colors cursor-pointer"
            >
              <Bookmark size={16} />
            </span>
          )}
          {(game.photosCount ?? 0) > 0 && (
            <button
              onClick={(e) => {
                e.stopPropagation();
                navigate(`/games/${game.id}/chat`, { state: { initialChatType: 'PHOTOS' } });
              }}
              className="px-3 py-1.5 text-sm font-semibold rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1.5 shadow-[0_0_8px_rgba(168,85,247,0.4)] dark:shadow-[0_0_8px_rgba(168,85,247,0.5)] hover:bg-purple-200 dark:hover:bg-purple-900/50 hover:shadow-[0_0_12px_rgba(168,85,247,0.6)] dark:hover:shadow-[0_0_12px_rgba(168,85,247,0.7)] hover:scale-105 active:scale-95 transition-all duration-200 cursor-pointer"
            >
              <Camera size={16} />
              {game.photosCount}
            </button>
          )}
          {!game.isPublic && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
              <Lock size={12} />
              <span className="hidden sm:inline">{t('games.private')}</span>
            </span>
          )}
          {game.genderTeams && game.genderTeams !== 'ANY' && (
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
                  <i className={`bi ${game.genderTeams === 'MEN' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-xs`}></i>
                </div>
              )}
            </div>
          )}
          {participants.some(
            (p) => p.userId === effectiveUser?.id && ['OWNER', 'ADMIN'].includes(p.role)
          ) && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              {t('games.owner')}
            </span>
          )}
          {game.entityType !== 'GAME' && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
              {game.entityType === 'TOURNAMENT' && <Swords size={12} />}
              {(game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') && <Trophy size={12} />}
              {game.entityType === 'TRAINING' && <Dumbbell size={12} />}
              {game.entityType === 'BAR' && <Beer size={12} />}
              {t(`games.entityTypes.${game.entityType}`)}
            </span>
          )}
          {isGuest && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400">
              {t('chat.guest')}
            </span>
          )}
          {!game.affectsRating && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1">
              <Award size={12} />
              <Ban size={12} />
              <span className="hidden sm:inline">{t('games.noRating')}</span>
            </span>
          )}
          {game.hasFixedTeams && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1">
              <div className="flex items-center">
                <Users size={12} />
                <Users size={12} />
              </div>
              <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
            </span>
          )}
          {(game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') && game.resultsStatus === 'FINAL' && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400 flex items-center gap-1">
              <Award size={12} />
              {t('games.resultsAvailable')}
            </span>
          )}
            </div>

            {showJoinQueueHint && (
              <div className="mt-3">
                <div className="bg-sky-50/50 dark:bg-sky-900/10 border border-sky-200 dark:border-sky-800/30 rounded-lg p-2">
                  <div className="flex items-start gap-1.5">
                    <Users size={12} className="text-sky-500 dark:text-sky-500/80 flex-shrink-0 mt-0.5" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words flex-1">
                      {t('games.youHaveUserWaitingInJoinQueue')}
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Notes Section */}
            {userNoteDisplay && effectiveUser && (
              <div className="mt-3">
                <div
                  role="button"
                  tabIndex={0}
                  onClick={(e) => {
                    e.stopPropagation();
                    e.preventDefault();
                    setShowNoteModal(true);
                  }}
                  onPointerDown={(e) => e.stopPropagation()}
                  onMouseDown={(e) => e.stopPropagation()}
                  className="bg-yellow-50/50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800/30 rounded-lg p-2 cursor-pointer hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                >
                  <div className="flex items-start gap-1.5">
                    <Bookmark size={12} className="text-yellow-500 dark:text-yellow-500/80 flex-shrink-0 mt-0.5" fill="currentColor" />
                    <p className="text-xs text-gray-700 dark:text-gray-300 whitespace-pre-wrap break-words flex-1">
                      {userNoteDisplay}
                    </p>
                  </div>
                </div>
              </div>
            )}
          </>
        <div className="absolute -top-2 -right-3 flex items-center gap-0 z-20">
          {canAccessChat && showChatIndicator && (
            <button
              type="button"
              onClick={handleChatClick}
              className="pl-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors relative"
            >
              <MessageCircle size={20} className="text-gray-600 dark:text-gray-400" />
              {unreadCount > 0 && (
                <span className="absolute top-0 right-0 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center">
                  {unreadCount > 99 ? '99+' : unreadCount}
                </span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div ref={expandedContentRef} className="relative z-10">
        {mainPhotoUrl ? (
          <div className="flex gap-4 mb-3">
            {game.entityType === 'TRAINING' && (() => {
              const trainer = game.trainerId ? participants.find(p => p.userId === game.trainerId) : null;
              return trainer ? (
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5 p-2 border-2 border-green-300 dark:border-green-700 rounded-lg bg-green-50/30 dark:bg-green-900/10">
                  <span className="text-[10px] font-medium text-green-600 dark:text-green-400">{t('playerCard.isTrainer')}</span>
                  <PlayerAvatar player={trainer.user} extrasmall={true} showName={true} />
                  <TrainerRatingBadge trainer={trainer.user} size="sm" showReviewCount={false} />
                </div>
              ) : null;
            })()}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-lg overflow-hidden border-2 border-gray-200 dark:border-gray-700">
                <img
                  src={mainPhotoUrl}
                  alt="Main photo"
                  className="w-full h-full object-cover"
                  loading="lazy"
                />
              </div>
            </div>
            {game.entityType !== 'LEAGUE_SEASON' && (
            <div className="flex flex-col gap-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                {game.timeIsSet === false ? (
                  <span className="text-gray-500 dark:text-gray-400 italic text-xs">{t('gameDetails.datetimeNotSet')}</span>
                ) : (
                  <span>
                    {getDateLabelResolved(game.startTime)}
                    {shouldShowTiming && (
                      <>
                        {` ${timeRangeDisplay.primaryText}`}
                      </>
                    )}
                  </span>
                )}
              </div>
              {(timeDisplay.hintText || timeRangeDisplay.hintText) && (
                <div className="flex items-center gap-1.5 opacity-75">
                  <Plane size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                  <span className="text-xs text-gray-500 dark:text-gray-400">{timeDisplay.hintText || timeRangeDisplay.hintText}</span>
                </div>
              )}
              {(game.court?.club || game.club) && (
                <div className="flex items-center gap-2">
                  <MapPin size={16} />
                  <span>
                    {game.court?.club?.name || game.club?.name}
                    {game.court?.name && ` • ${game.court.name}`}
                  </span>
                  {game.entityType === 'BAR' && (
                    <>
                      <span className="text-gray-400 dark:text-gray-500">•</span>
                      <Users size={16} />
                      <span>{participants.filter(p => p.status === 'PLAYING').length}</span>
                    </>
                  )}
                </div>
              )}
              {game.entityType !== 'BAR' && (
                <>
                  <div className="flex items-center gap-2">
                    <Users size={16} />
                    <span>
                      {`${participants.filter(p => p.status === 'PLAYING').length} / ${game.maxParticipants}`}
                    </span>
                    {!game.trainerId && game.minLevel !== undefined && game.maxLevel !== undefined && (
                      <>
                        <span className="text-gray-400 dark:text-gray-500">•</span>
                        <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                          {t('games.level')}:
                        </span>
                        <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                          {game.minLevel.toFixed(1)}-{game.maxLevel.toFixed(1)}
                        </span>
                      </>
                    )}
                  </div>
                  {game.trainerId && game.minLevel !== undefined && game.maxLevel !== undefined && (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('games.level')}:
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {game.minLevel.toFixed(1)}-{game.maxLevel.toFixed(1)}
                      </span>
                    </div>
                  )}
                </>
              )}
            </div>
            )}
          </div>
        ) : (
          <div className={`text-sm text-gray-600 dark:text-gray-400 ${game.entityType === 'TRAINING' ? 'flex gap-4 -mt-1' : ''}`}>
            {game.entityType === 'TRAINING' && (() => {
              const trainer = game.trainerId ? participants.find(p => p.userId === game.trainerId) : null;
              return trainer ? (
                <div className="flex-shrink-0 flex flex-col items-center gap-0.5 p-2 border-2 border-green-300 dark:border-green-700 rounded-lg bg-green-50/30 dark:bg-green-900/10">
                  <span className="text-[10px] font-medium text-green-600 dark:text-green-400">{t('playerCard.isTrainer')}</span>
                  <PlayerAvatar player={trainer.user} extrasmall={true} showName={true} />
                  <TrainerRatingBadge trainer={trainer.user} size="sm" showReviewCount={false} />
                </div>
              ) : null;
            })()}
            {game.entityType !== 'LEAGUE_SEASON' && (
            <div className="space-y-2 flex-1">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              {game.timeIsSet === false ? (
                <span className="text-gray-500 dark:text-gray-400 italic text-xs">{t('gameDetails.datetimeNotSet')}</span>
              ) : (
                <span>
                  {getDateLabelResolved(game.startTime)}
                  {shouldShowTiming && (
                    <>
                      {` ${timeRangeDisplay.primaryText}`}
                    </>
                  )}
                </span>
              )}
            </div>
            {(timeDisplay.hintText || timeRangeDisplay.hintText) && (
              <div className="flex items-center gap-1.5 opacity-75">
                <Plane size={16} className="text-gray-500 dark:text-gray-400 flex-shrink-0" />
                <span className="text-xs text-gray-500 dark:text-gray-400">{timeDisplay.hintText || timeRangeDisplay.hintText}</span>
              </div>
            )}
            {(game.court?.club || game.club) && (
              <div className="flex items-center gap-2">
                <MapPin size={16} />
                <span>
                  {game.court?.club?.name || game.club?.name}
                  {game.court?.name && ` • ${game.court.name}`}
                </span>
                {game.entityType === 'BAR' && (
                  <>
                    <span className="text-gray-400 dark:text-gray-500">•</span>
                    <Users size={16} />
                    <span>{participants.filter(p => p.status === 'PLAYING').length}</span>
                  </>
                )}
              </div>
            )}
            {game.entityType !== 'BAR' && (
              <>
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>
                    {`${participants.filter(p => p.status === 'PLAYING').length} / ${game.maxParticipants}`}
                  </span>
                  {!game.trainerId && game.minLevel !== undefined && game.maxLevel !== undefined && (
                    <>
                      <span className="text-gray-400 dark:text-gray-500">•</span>
                      <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                        {t('games.level')}:
                      </span>
                      <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                        {game.minLevel.toFixed(1)}-{game.maxLevel.toFixed(1)}
                      </span>
                    </>
                  )}
                </div>
                {game.trainerId && game.minLevel !== undefined && game.maxLevel !== undefined && (
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
                      {t('games.level')}:
                    </span>
                    <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
                      {game.minLevel.toFixed(1)}-{game.maxLevel.toFixed(1)}
                    </span>
                  </div>
                )}
              </>
            )}
            </div>
            )}
          </div>
        )}
        {game.entityType !== 'LEAGUE_SEASON' && (
        <div className={`space-y-2 text-sm text-gray-600 dark:text-gray-400 ${game.entityType === 'TRAINING' && participants.filter(p => p.status === 'PLAYING').length >= 1 ? 'pt-2 mt-2 border-t border-gray-200 dark:border-gray-700' : ''}`}>
          <div className="flex items-center gap-2">
            <div className="relative -mx-0 flex-1 w-full">
              <PlayersCarousel
                participants={participants.filter(p => p.status === 'PLAYING')}
                userId={effectiveUser?.id}
                shouldShowCrowns={true}
                autoHideNames={true}
              />
            </div>
          </div>
        </div>
        )}

        {showJoinButton && onJoin && game.status !== 'ARCHIVED' && game.status !== 'FINISHED' && game.resultsStatus === 'NONE' && game.entityType !== 'LEAGUE' && !isParticipant && !hasMyInvites && !isInJoinQueue && (
          <div className="mt-0 mb-4">
            {hasUnoccupiedSlots ? (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinAction('game');
                  setShowJoinConfirm(true);
                }}
                className="w-full"
                size="sm"
              >
                {t('createGame.addMeToGame')}
              </Button>
            ) : (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinAction('queue');
                  setShowJoinConfirm(true);
                }}
                className="w-full"
                size="sm"
              >
                {t('games.joinTheQueue')}
              </Button>
            )}
          </div>
        )}
      </div>
    </Card>
      {showNoteModal && effectiveUser && (
        <UserGameNoteModal
          isOpen={showNoteModal}
          onClose={() => setShowNoteModal(false)}
          gameId={game.id}
          initialContent={userNoteDisplay}
          onSaved={handleNoteSaved}
        />
      )}
      {showJoinConfirm && joinAction && (
        <ConfirmationModal
          isOpen={showJoinConfirm}
          onClose={() => { setShowJoinConfirm(false); setJoinAction(null); }}
          onConfirm={() => {
            const noopEvent = { stopPropagation: () => {}, preventDefault: () => {} } as React.MouseEvent;
            onJoin?.(game.id, noopEvent);
            setShowJoinConfirm(false);
            setJoinAction(null);
          }}
          title={joinAction === 'game' ? t('games.confirmJoinTitle') : t('games.confirmJoinQueueTitle')}
          message={joinAction === 'game' ? t('games.confirmJoinMessage') : t('games.confirmJoinQueueMessage')}
        />
      )}
    </>
  );
};
