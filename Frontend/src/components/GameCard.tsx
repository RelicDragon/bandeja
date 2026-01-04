import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { GameAvatar } from '@/components/GameAvatar';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { useNavigationStore } from '@/store/navigationStore';
import { chatApi } from '@/api/chat';
import { Calendar, MapPin, Users, MessageCircle, ChevronRight, GraduationCap, Beer, Ban, Award, Lock, Swords, Trophy, Camera, Star } from 'lucide-react';
import 'bootstrap-icons/font/bootstrap-icons.css';

interface GameCardProps {
  game: Game;
  user: any;
  onClick?: () => void;
  showChatIndicator?: boolean;
  showJoinButton?: boolean;
  onJoin?: (gameId: string, e: React.MouseEvent) => void;
  isInitiallyCollapsed?: boolean;
  showDate?: boolean;
  unreadCount?: number;
  forceCollapsed?: boolean;
}

export const GameCard = ({ 
  game, 
  user, 
  onClick,
  showChatIndicator = true, 
  showJoinButton = false, 
  onJoin,
  isInitiallyCollapsed = false,
  showDate = true,
  unreadCount = 0,
  forceCollapsed
}: GameCardProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { setCurrentPage, setIsAnimating } = useNavigationStore();
  const [isCollapsed, setIsCollapsed] = useState(isInitiallyCollapsed);
  const [isCollapsing, setIsCollapsing] = useState(false);
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const previousForceCollapsedRef = useRef<boolean | undefined>(undefined);
  const [mainPhotoUrl, setMainPhotoUrl] = useState<string | null>(null);

  useEffect(() => {
    const previousForceCollapsed = previousForceCollapsedRef.current;
    previousForceCollapsedRef.current = forceCollapsed;
    
    if (forceCollapsed !== undefined && previousForceCollapsed !== forceCollapsed && forceCollapsed !== isCollapsed && !isCollapsing) {
      setIsCollapsing(true);
      setIsCollapsed(forceCollapsed);
      
      setTimeout(() => {
        setIsCollapsing(false);
      }, 300);
    }
  }, [forceCollapsed, isCollapsed, isCollapsing]);


  useEffect(() => {
    const loadMainPhoto = async () => {
      if (!game.mainPhotoId || !game.id || game.status === 'ANNOUNCED') {
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
      } catch (error) {
        console.error('Failed to load main photo:', error);
        setMainPhotoUrl(null);
      }
    };

    loadMainPhoto();
  }, [game.mainPhotoId, game.id, game.status]);

  const isParticipant = game.participants.some(p => p.userId === user?.id && p.isPlaying);
  const isUserParticipant = game.participants.some(p => p.userId === user?.id);
  const hasPendingInvite = game.invites?.some(invite => invite.receiverId === user?.id);
  const isGuest = game.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN');
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game.isPublic;
  const isLeagueSeasonGame = game.entityType === 'LEAGUE_SEASON';
  const shouldShowTiming = !isLeagueSeasonGame;
  const displaySettings = user ? resolveDisplaySettings(user) : null;

  const hasOtherTags = (game.photosCount ?? 0) > 0 ||
    !game.isPublic ||
    (game.genderTeams && game.genderTeams !== 'ANY') ||
    game.participants.some(p => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)) ||
    game.entityType !== 'GAME' ||
    isGuest ||
    !game.affectsRating ||
    game.hasFixedTeams ||
    ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') && game.resultsStatus === 'FINAL');

  const hasVisibleGameName = (game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name) ||
    (game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name) ||
    game.name;

  const shouldMoveIconsToTitle = hasVisibleGameName && !hasOtherTags;

  const handleChatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigate(`/games/${game.id}/chat`);
  };

  const handleToggleCollapse = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isCollapsing) return;
    
    setIsCollapsing(true);
    setIsCollapsed(!isCollapsed);
    
    setTimeout(() => {
      setIsCollapsing(false);
    }, 300);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      setIsAnimating(true);
      setCurrentPage('gameDetails');
      navigate(`/games/${game.id}`);
      setTimeout(() => setIsAnimating(false), 300);
    }
  };


  const getDateLabel = (date: Date | string, includeComma = true) => {
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
      case 'LEAGUE_SEASON':
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
    <Card
      className={`hover:shadow-md hover:scale-[1.02] active:scale-[1.05] transition-all duration-300 ease-in-out cursor-pointer relative ${getEntityGradient()}`}
      onClick={handleCardClick}
    >
      {game.entityType !== 'GAME' && (
        <div className="absolute bottom-2 right-2 z-0 pointer-events-none">
          {getEntityIcon()}
        </div>
      )}
      {/* Header - Always visible */}
      <div className="mb-3 relative z-10">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 pr-20 flex items-center gap-2">
          {shouldMoveIconsToTitle && (
            <>
              {isUserParticipant && (
                <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-yellow-500 dark:bg-yellow-600 text-white flex-shrink-0">
                  <Star 
                    size={12} 
                    className="text-white"
                    fill="currentColor"
                  />
                </span>
              )}
              <GameStatusIcon status={game.status} />
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
          {!shouldMoveIconsToTitle && isUserParticipant && (
            <span className="flex items-center justify-center w-[18px] h-[18px] rounded-full bg-yellow-500 dark:bg-yellow-600 text-white">
              <Star 
                size={12} 
                className="text-white"
                fill="currentColor"
              />
            </span>
          )}
          {!shouldMoveIconsToTitle && <GameStatusIcon status={game.status} />}
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
          {game.participants.some(
            (p) => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)
          ) && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400">
              {t('games.owner')}
            </span>
          )}
          {game.entityType !== 'GAME' && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
              {game.entityType === 'TOURNAMENT' && <Swords size={12} />}
              {(game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') && <Trophy size={12} />}
              {game.entityType === 'TRAINING' && <GraduationCap size={12} />}
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
        <div className="absolute -top-2 -right-3 flex items-center gap-0 z-20">
          {canAccessChat && showChatIndicator && (
            <button
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
          <button
            onClick={handleToggleCollapse}
            className="pl-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-all duration-200"
          >
            <div className={`transition-transform duration-300 ease-in-out ${
              isCollapsed ? 'rotate-0' : 'rotate-90'
            }`}>
              <ChevronRight size={20} className="text-gray-600 dark:text-gray-400" />
            </div>
          </button>
        </div>
      </div>

      {/* Collapsed view - Single row */}
      {isCollapsed && (
        <div className={`text-sm text-gray-600 dark:text-gray-400 animate-in slide-in-from-top-2 duration-300 relative z-10 ${game.entityType === 'TRAINING' ? 'flex gap-4' : (game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar) ? 'flex gap-4' : mainPhotoUrl ? 'flex gap-4' : 'flex items-center gap-4'}`}>
          {game.entityType === 'TRAINING' ? (
            <>
              <div className="flex-shrink-0">
                {(() => {
                  const owner = game.participants.find(p => p.role === 'OWNER');
                  return owner ? (
                    <PlayerAvatar
                      player={owner.user}
                      smallLayout={true}
                      showName={false}
                    />
                  ) : null;
                })()}
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-1">
                  {showDate && <Calendar size={14} />}
                  <span>
                    {showDate && getDateLabel(game.startTime, false)}
                    {shouldShowTiming && (
                      <>
                        {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                        {` • ${(() => {
                          const durationHours = (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60);
                          if (durationHours === Math.floor(durationHours)) {
                            return `${durationHours}${t('common.h')}`;
                          } else {
                            const hours = Math.floor(durationHours);
                            const minutes = Math.round((durationHours % 1) * 60);
                            return minutes > 0 ? `${hours}${t('common.h')}${minutes}${t('common.m')}` : `${hours}${t('common.h')}`;
                          }
                        })()}`}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {(game.court?.club || game.club) && (
                    <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      <span className="truncate max-w-32">
                        {game.court?.club?.name || game.club?.name}
                        {game.court?.name && ` • ${game.court.name}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users size={14} />
                    <span>
                      {`${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`}
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar) ? (
            <>
              <div className="flex-shrink-0">
                <GameAvatar avatar={game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar} small alt={game.name || t('gameDetails.gameAvatar')} />
              </div>
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-1">
                  {showDate && <Calendar size={14} />}
                  <span>
                    {showDate && getDateLabel(game.startTime, false)}
                    {shouldShowTiming && (
                      <>
                        {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                        {game.entityType !== 'BAR' ? ` • ${(() => {
                          const durationHours = (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60);
                          if (durationHours === Math.floor(durationHours)) {
                            return `${durationHours}${t('common.h')}`;
                          } else {
                            const hours = Math.floor(durationHours);
                            const minutes = Math.round((durationHours % 1) * 60);
                            return minutes > 0 ? `${hours}${t('common.h')}${minutes}${t('common.m')}` : `${hours}${t('common.h')}`;
                          }
                        })()}` : ''}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {(game.court?.club || game.club) && (
                    <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      <span className="truncate max-w-32">
                        {game.court?.club?.name || game.club?.name}
                        {game.court?.name && ` • ${game.court.name}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users size={14} />
                    <span>
                      {game.entityType === 'BAR' 
                        ? game.participants.filter(p => p.isPlaying).length
                        : `${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`
                      }
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : mainPhotoUrl ? (
            <>
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
              <div className="flex flex-col gap-2 flex-1">
                <div className="flex items-center gap-1">
                  {showDate && <Calendar size={14} />}
                  <span>
                    {showDate && getDateLabel(game.startTime, false)}
                    {shouldShowTiming && (
                      <>
                        {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                        {game.entityType !== 'BAR' ? ` • ${(() => {
                          const durationHours = (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60);
                          if (durationHours === Math.floor(durationHours)) {
                            return `${durationHours}${t('common.h')}`;
                          } else {
                            const hours = Math.floor(durationHours);
                            const minutes = Math.round((durationHours % 1) * 60);
                            return minutes > 0 ? `${hours}${t('common.h')}${minutes}${t('common.m')}` : `${hours}${t('common.h')}`;
                          }
                        })()}` : ''}
                      </>
                    )}
                  </span>
                </div>
                <div className="flex items-center gap-4">
                  {(game.court?.club || game.club) && (
                    <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      <span className="truncate max-w-32">
                        {game.court?.club?.name || game.club?.name}
                        {game.court?.name && ` • ${game.court.name}`}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center gap-1">
                    <Users size={14} />
                    <span>
                      {game.entityType === 'BAR' 
                        ? game.participants.filter(p => p.isPlaying).length
                        : `${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`
                      }
                    </span>
                  </div>
                </div>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-2 flex-1">
              <div className="flex items-center gap-1">
                {showDate && <Calendar size={14} />}
                <span>
                  {showDate && getDateLabel(game.startTime, false)}
                  {shouldShowTiming && (
                    <>
                      {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                      {game.entityType !== 'BAR' ? ` • ${(() => {
                        const durationHours = (new Date(game.endTime).getTime() - new Date(game.startTime).getTime()) / (1000 * 60 * 60);
                        if (durationHours === Math.floor(durationHours)) {
                          return `${durationHours}${t('common.h')}`;
                        } else {
                          const hours = Math.floor(durationHours);
                          const minutes = Math.round((durationHours % 1) * 60);
                          return minutes > 0 ? `${hours}${t('common.h')}${minutes}${t('common.m')}` : `${hours}${t('common.h')}`;
                        }
                      })()}` : ''}
                    </>
                  )}
                </span>
              </div>
              <div className="flex items-center gap-4">
                {(game.court?.club || game.club) && (
                  <div className="flex items-center gap-1">
                    <MapPin size={14} />
                    <span className="truncate max-w-32">
                      {game.court?.club?.name || game.club?.name}
                      {game.court?.name && ` • ${game.court.name}`}
                    </span>
                  </div>
                )}
                <div className="flex items-center gap-1">
                  <Users size={14} />
                  <span>
                    {game.entityType === 'BAR' 
                      ? game.participants.filter(p => p.isPlaying).length
                      : `${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`
                    }
                  </span>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Expanded content */}
      <div 
        ref={expandedContentRef}
        className={`transition-all duration-300 ease-in-out relative z-10 ${
          isCollapsed 
            ? 'max-h-0 opacity-0 overflow-hidden' 
            : 'opacity-100'
        }`}
      >
        {mainPhotoUrl ? (
          <div className="flex gap-4 mb-3">
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
            <div className="flex flex-col gap-2 flex-1 text-sm text-gray-600 dark:text-gray-400">
              <div className="flex items-center gap-2">
                <Calendar size={16} />
                <span>
                  {getDateLabel(game.startTime)}
                  {shouldShowTiming && (
                    <>
                      {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                      {game.entityType !== 'BAR' ? ` • ${displaySettings ? formatGameTime(game.endTime, displaySettings) : formatDate(game.endTime, 'HH:mm')}` : ''}
                    </>
                  )}
                </span>
              </div>
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
                      <span>{game.participants.filter(p => p.isPlaying).length}</span>
                    </>
                  )}
                </div>
              )}
              {game.entityType !== 'BAR' && (
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>
                    {`${game.participants.filter(p => p.isPlaying).length} / ${game.maxParticipants}`}
                  </span>
                  {game.minLevel !== undefined && game.maxLevel !== undefined && (
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
              )}
            </div>
          </div>
        ) : (
          <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>
                {getDateLabel(game.startTime)}
                {shouldShowTiming && (
                  <>
                    {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
                    {game.entityType !== 'BAR' ? ` • ${displaySettings ? formatGameTime(game.endTime, displaySettings) : formatDate(game.endTime, 'HH:mm')}` : ''}
                  </>
                )}
              </span>
            </div>
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
                    <span>{game.participants.filter(p => p.isPlaying).length}</span>
                  </>
                )}
              </div>
            )}
            {game.entityType !== 'BAR' && (
              <div className="flex items-center gap-2">
                <Users size={16} />
                <span>
                  {`${game.participants.filter(p => p.isPlaying).length} / ${game.maxParticipants}`}
                </span>
                {game.minLevel !== undefined && game.maxLevel !== undefined && (
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
            )}
          </div>
        )}
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <div className="relative -mx-0 flex-1 w-full">
              <PlayersCarousel
                participants={game.participants.filter(p => p.isPlaying)}
                userId={user?.id}
                shouldShowCrowns={true}
                autoHideNames={true}
              />
            </div>
          </div>
        </div>

        {showJoinButton && onJoin && (
          <div className="mt-4">
            <Button
              onClick={(e) => onJoin(game.id, e)}
              className="w-full"
              size="sm"
            >
              {t('games.join')}
            </Button>
          </div>
        )}
      </div>
    </Card>
  );
};
