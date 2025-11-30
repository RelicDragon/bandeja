import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { GameAvatar } from '@/components/GameAvatar';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { getGameResultStatus } from '@/utils/gameResults';
import { useNavigationStore } from '@/store/navigationStore';
import { Calendar, MapPin, Users, MessageCircle, ChevronRight, GraduationCap, Beer, Ban, Award, Lock, Swords, Trophy, Camera } from 'lucide-react';
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
  isInitiallyCollapsed = true,
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
  const carouselRef = useRef<HTMLDivElement>(null);
  const [showLeftFade, setShowLeftFade] = useState(false);
  const [showRightFade, setShowRightFade] = useState(false);
  const [isScrolling, setIsScrolling] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isPressed, setIsPressed] = useState(false);
  const scrollTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pressTimeoutRef = useRef<NodeJS.Timeout | null>(null);

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

  const checkScrollPosition = () => {
    const container = carouselRef.current;
    if (!container) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = container;
    setShowLeftFade(scrollLeft > 0);
    setShowRightFade(scrollLeft < scrollWidth - clientWidth - 1);
  };

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    
    checkMobile();
    window.addEventListener('resize', checkMobile);
    
    return () => {
      window.removeEventListener('resize', checkMobile);
    };
  }, []);

  useEffect(() => {
    const container = carouselRef.current;
    if (!container) return;

    checkScrollPosition();
    
    const handleScroll = () => {
      checkScrollPosition();
      
      if (isMobile) {
        setIsScrolling(true);
        
        if (scrollTimeoutRef.current) {
          clearTimeout(scrollTimeoutRef.current);
        }
        
        scrollTimeoutRef.current = setTimeout(() => {
          setIsScrolling(false);
        }, 500);
      }
    };
    
    container.addEventListener('scroll', handleScroll);
    
    const resizeObserver = new ResizeObserver(() => {
      checkScrollPosition();
    });
    resizeObserver.observe(container);
    
    return () => {
      container.removeEventListener('scroll', handleScroll);
      resizeObserver.disconnect();
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
      if (pressTimeoutRef.current) {
        clearTimeout(pressTimeoutRef.current);
      }
    };
  }, [game.participants, isCollapsed, isMobile]);

  const isParticipant = game.participants.some(p => p.userId === user?.id && p.isPlaying);
  const hasPendingInvite = game.invites?.some(invite => invite.receiverId === user?.id);
  const isGuest = game.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN');
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game.isPublic;
  const resultStatus = getGameResultStatus(game, user);
  const isLeagueSeasonGame = game.entityType === 'LEAGUE_SEASON';
  const shouldShowTiming = !isLeagueSeasonGame;

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

  const handlePressStart = () => {
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
    }
    pressTimeoutRef.current = setTimeout(() => {
      setIsPressed(true);
    }, 300);
  };

  const handlePressEnd = () => {
    if (pressTimeoutRef.current) {
      clearTimeout(pressTimeoutRef.current);
      pressTimeoutRef.current = null;
    }
    setIsPressed(false);
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
      return formatDate(gameDate, 'MMM d') + (includeComma ? ',' : '');
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

  const getFadeGradient = (direction: 'left' | 'right') => {
    const isLeft = direction === 'left';
    switch (game.entityType) {
      case 'TOURNAMENT':
        return isLeft 
          ? 'bg-gradient-to-r from-red-50/60 via-red-50/60 to-transparent dark:from-red-950/25 dark:via-red-950/25'
          : 'bg-gradient-to-l from-red-50/60 via-red-50/60 to-transparent dark:from-red-950/25 dark:via-red-950/25';
      case 'LEAGUE':
      case 'LEAGUE_SEASON':
        return isLeft
          ? 'bg-gradient-to-r from-blue-50/60 via-blue-50/60 to-transparent dark:from-blue-950/25 dark:via-blue-950/25'
          : 'bg-gradient-to-l from-blue-50/60 via-blue-50/60 to-transparent dark:from-blue-950/25 dark:via-blue-950/25';
      case 'TRAINING':
        return isLeft
          ? 'bg-gradient-to-r from-green-50/60 via-green-50/60 to-transparent dark:from-green-950/25 dark:via-green-950/25'
          : 'bg-gradient-to-l from-green-50/60 via-green-50/60 to-transparent dark:from-green-950/25 dark:via-green-950/25';
      case 'BAR':
        return isLeft
          ? 'bg-gradient-to-r from-yellow-50/60 via-yellow-50/60 to-transparent dark:from-yellow-950/25 dark:via-yellow-950/25'
          : 'bg-gradient-to-l from-yellow-50/60 via-yellow-50/60 to-transparent dark:from-yellow-950/25 dark:via-yellow-950/25';
      default:
        return isLeft
          ? 'bg-gradient-to-r from-white via-white/80 to-transparent dark:from-gray-900 dark:via-gray-900/80'
          : 'bg-gradient-to-l from-white via-white/80 to-transparent dark:from-gray-900 dark:via-gray-900/80';
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
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 pr-20">
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
        </h3>
        <div className="flex items-center gap-2 mb-1">
          <GameStatusIcon status={game.status} />
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
        <div className="absolute -top-1 -right-1 flex items-center gap-0 z-20">
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
        <div className={`text-sm text-gray-600 dark:text-gray-400 animate-in slide-in-from-top-2 duration-300 relative z-10 ${game.entityType === 'TRAINING' ? 'flex gap-4' : (game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar) ? 'flex gap-4' : 'flex items-center gap-4'}`}>
          {game.entityType === 'TRAINING' ? (
            <>
              <div className="flex-shrink-0">
                {(() => {
                  const owner = game.participants.find(p => p.role === 'OWNER');
                  return owner ? (
                    <PlayerAvatar
                      player={{
                        id: owner.userId,
                        firstName: owner.user.firstName,
                        lastName: owner.user.lastName,
                        avatar: owner.user.avatar,
                        level: owner.user.level,
                        gender: owner.user.gender,
                      }}
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
                        {` ${formatDate(game.startTime, 'HH:mm')}`}
                        {`, ${(() => {
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
                        {` ${formatDate(game.startTime, 'HH:mm')}`}
                        {game.entityType !== 'BAR' ? `, ${(() => {
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
                  <div className="flex items-center gap-1">
                    <Users size={14} />
                    <span>
                      {game.entityType === 'BAR' 
                        ? game.participants.filter(p => p.isPlaying).length
                        : `${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`
                      }
                    </span>
                  </div>
                  {(game.court?.club || game.club) && (
                    <div className="flex items-center gap-1">
                      <MapPin size={14} />
                      <span className="truncate max-w-32">
                        {game.court?.club?.name || game.club?.name}
                      </span>
                    </div>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="flex items-center gap-1">
                {showDate && <Calendar size={14} />}
                <span>
                  {showDate && getDateLabel(game.startTime, false)}
                  {shouldShowTiming && (
                    <>
                      {` ${formatDate(game.startTime, 'HH:mm')}`}
                      {game.entityType !== 'BAR' ? `, ${(() => {
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
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>
                  {game.entityType === 'BAR' 
                    ? game.participants.filter(p => p.isPlaying).length
                    : `${game.participants.filter(p => p.isPlaying).length}/${game.maxParticipants}`
                  }
                </span>
              </div>
              {(game.court?.club || game.club) && (
                <div className="flex items-center gap-1">
                  <MapPin size={14} />
                  <span className="truncate max-w-32">
                    {game.court?.club?.name || game.club?.name}
                  </span>
                </div>
              )}
            </>
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
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2">
              <Calendar size={16} />
              <span>
                {getDateLabel(game.startTime)}
                {shouldShowTiming && (
                  <>
                    {` ${formatDate(game.startTime, 'HH:mm')}`}
                    {game.entityType !== 'BAR' ? ` - ${formatDate(game.endTime, 'HH:mm')}` : ''}
                  </>
                )}
              </span>
            </div>
          {(game.court?.club || game.club) && (
            <div className="flex items-center gap-2">
              <MapPin size={16} />
              <span>{game.court?.club?.name || game.club?.name}</span>
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
            <div className="flex items-center gap-2">
              <div className="relative -mx-0 flex-1 w-full">
                <div 
                  ref={carouselRef}
                  className="flex gap-4 overflow-x-auto scrollbar-hide scroll-smooth flex-nowrap px-2 py-2"
                  onMouseDown={handlePressStart}
                  onMouseUp={handlePressEnd}
                  onMouseLeave={handlePressEnd}
                  onTouchStart={handlePressStart}
                  onTouchEnd={handlePressEnd}
                  onTouchCancel={handlePressEnd}
                >
                  {game.participants.filter(p => p.isPlaying).map((participant) => {
                    const showName = (isMobile && isScrolling) || isPressed;
                    return (
                      <div key={participant.userId} className="flex-shrink-0">
                        <PlayerAvatar
                          player={{
                            id: participant.userId,
                            firstName: participant.user.firstName,
                            lastName: participant.user.lastName,
                            avatar: participant.user.avatar,
                            level: participant.user.level,
                            gender: participant.user.gender,
                          }}
                          smallLayout={true}
                          showName={showName}
                          role={participant.role as 'OWNER' | 'ADMIN' | 'PLAYER'}
                        />
                      </div>
                    );
                  })}
                </div>
                {showLeftFade && (
                  <div className={`absolute -left-1 top-0 bottom-0 w-8 ${getFadeGradient('left')} pointer-events-none z-10`} />
                )}
                {showRightFade && (
                  <div className={`absolute -right-1 top-0 bottom-0 w-8 ${getFadeGradient('right')} pointer-events-none z-10`} />
                )}
              </div>
            </div>
        </div>

        {(game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') && resultStatus && (
          <div className={`mt-3 pt-3 border-t border-gray-200 dark:border-gray-700 ${
            game.entityType !== 'GAME' ? 'pr-10' : ''}`}>
            <div className={`text-sm px-3 py-2 rounded-lg ${
              resultStatus.message === 'games.results.problems.accessDenied'
                ? 'bg-red-50 dark:bg-red-900/20 text-red-800 dark:text-red-200 border border-red-200 dark:border-red-800'
                : resultStatus.canModify
                  ? 'bg-blue-50 dark:bg-blue-900/20 text-blue-800 dark:text-blue-200 border border-blue-200 dark:border-blue-800'
                  : 'bg-gray-50 dark:bg-gray-800/50 text-gray-600 dark:text-gray-400'
            }`}>
              {resultStatus.message.split(' • ').map(key => t(key)).join(' • ')}
            </div>
          </div>
        )}

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
