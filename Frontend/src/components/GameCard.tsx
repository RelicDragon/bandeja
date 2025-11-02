import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { getGameResultStatus } from '@/utils/gameResults';
import { useNavigationStore } from '@/store/navigationStore';
import { Calendar, MapPin, Users, MessageCircle, ChevronRight, GraduationCap, Beer, Ban, Award } from 'lucide-react';

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

  const isParticipant = game.participants.some(p => p.userId === user?.id && p.isPlaying);
  const hasPendingInvite = game.invites?.some(invite => invite.receiverId === user?.id);
  const isGuest = game.participants.some(p => p.userId === user?.id && !p.isPlaying && p.role !== 'OWNER' && p.role !== 'ADMIN');
  const canAccessChat = isParticipant || hasPendingInvite || isGuest || game.isPublic;
  const resultStatus = getGameResultStatus(game, user);

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
      return formatDate(gameDate, 'MMM d') + (includeComma ? ',' : '');
    }
  };

  return (
    <Card
      className="hover:shadow-md hover:scale-[1.02] active:scale-[1.05] transition-all duration-300 ease-in-out cursor-pointer overflow-hidden"
      onClick={handleCardClick}
    >
      {/* Header - Always visible */}
      <div className="mb-3 relative">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2 pr-20">
          {game.name}
          {game.name && game.gameType !== 'CLASSIC' && (
            <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
              ({t(`games.gameTypes.${game.gameType}`)})
            </span>
          )}
          {!game.name && game.gameType !== 'CLASSIC' && t(`games.gameTypes.${game.gameType}`)}
        </h3>
        <div className="flex items-center gap-2 mb-1">
          <GameStatusIcon status={game.status} />
          {game.participants.some(
            (p) => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)
          ) && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">
              {t('games.owner')}
            </span>
          )}
          {game.entityType !== 'GAME' && (
            <span className="px-2 py-1 text-xs font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1">
              {game.entityType === 'BAR' && <Beer size={12} />}
              {game.entityType === 'TRAINING' && <GraduationCap size={12} />}
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
              <Users size={12} />
              <Users size={12} />
              <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
            </span>
          )}
        </div>
        <div className="absolute top-0 right-0 flex items-center gap-0">
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
        <div className="flex items-center gap-4 text-sm text-gray-600 dark:text-gray-400 animate-in slide-in-from-top-2 duration-300">
          <div className="flex items-center gap-1">
            {showDate && <Calendar size={14} />}
            <span>
              {showDate && `${getDateLabel(game.startTime, false)} `}
              {formatDate(game.startTime, 'HH:mm')}
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
        </div>
      )}

      {/* Expanded content */}
      <div 
        ref={expandedContentRef}
        className={`transition-all duration-300 ease-in-out ${
          isCollapsed 
            ? 'max-h-0 opacity-0 overflow-hidden' 
            : 'max-h-96 opacity-100'
        }`}
      >
        <div className="space-y-2 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center gap-2">
            <Calendar size={16} />
            <span>
              {getDateLabel(game.startTime)} {formatDate(game.startTime, 'HH:mm')}
              {game.entityType !== 'BAR' ? ` - ${formatDate(game.endTime, 'HH:mm')}` : ''}
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
            <div className="flex gap-2">
              {game.participants.filter(p => p.isPlaying).map((participant) => (
                <PlayerAvatar
                  key={participant.userId}
                  player={{
                    id: participant.userId,
                    firstName: participant.user.firstName,
                    lastName: participant.user.lastName,
                    avatar: participant.user.avatar,
                    level: participant.user.level,
                    gender: participant.user.gender,
                  }}
                  smallLayout={true}
                  showName={false}
                  role={participant.role as 'OWNER' | 'ADMIN' | 'PLAYER'}
                />
              ))}
            </div>
          </div>
        </div>

        {(game.status === 'STARTED' || game.status === 'FINISHED') && resultStatus && (
          <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
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
