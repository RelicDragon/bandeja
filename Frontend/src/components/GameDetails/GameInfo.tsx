import { useEffect, useRef, useState } from 'react';
import { Card } from '@/components';
import { Game } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { useAuthStore } from '@/store/authStore';
import { resolveDisplaySettings, formatGameTime } from '@/utils/displayPreferences';
import { GameStatusIcon } from '@/components';
import { ShareModal } from '@/components/ShareModal';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { GameAvatar } from '@/components/GameAvatar';
import { FullscreenImageViewer } from '@/components/FullscreenImageViewer';
import { AddToCalendarModal } from '@/components';
import { getShareUrl } from '@/utils/shareUrl';
import { EditGameTextModal } from './EditGameTextModal';
import { EditGamePriceModal } from './EditGamePriceModal';
import { isCapacitor } from '@/utils/capacitor';
import { addToNativeCalendar } from '@/utils/calendar';
import { Share } from '@capacitor/share';
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
  Dumbbell,
  ChevronRight,
  Banknote,
  CalendarPlus,
} from 'lucide-react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import 'bootstrap-icons/font/bootstrap-icons.css';
import type { CalendarEventInput } from '@/utils/calendar';

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
  collapsedByDefault?: boolean;
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
  onGameUpdate,
  collapsedByDefault = false
}: GameInfoProps) => {
  const { t } = useTranslation();
  const { user } = useAuthStore();
  const displaySettings = user ? resolveDisplaySettings(user) : null;
  const showTags = game.entityType !== 'LEAGUE';
  const [showShareModal, setShowShareModal] = useState(false);
  const [shareData, setShareData] = useState({ url: '' });
  const [showFullscreenAvatar, setShowFullscreenAvatar] = useState(false);
  const [showEditGameTextModal, setShowEditGameTextModal] = useState(false);
  const [showEditGamePriceModal, setShowEditGamePriceModal] = useState(false);
  const [showAddToCalendarModal, setShowAddToCalendarModal] = useState(false);
  const [isCollapsed, setIsCollapsed] = useState(collapsedByDefault);
  const contentRef = useRef<HTMLDivElement>(null);
  const [contentHeight, setContentHeight] = useState(0);
  const prevResultsStatusRef = useRef(game.resultsStatus);

  useEffect(() => {
    const prevStatus = prevResultsStatusRef.current;
    const currentStatus = game.resultsStatus;

    // When switching from NONE to not NONE, collapse
    if (prevStatus === 'NONE' && currentStatus !== 'NONE') {
      setIsCollapsed(true);
    }
    // When reset (back to NONE), expand
    if (currentStatus === 'NONE') {
      setIsCollapsed(false);
    }

    prevResultsStatusRef.current = currentStatus;
  }, [game.resultsStatus]);

  const ownerParticipant = game.participants?.find(p => p.role === 'OWNER');
  const owner = ownerParticipant?.user;

  const calendarEvent: CalendarEventInput | null = game.timeIsSet === true
    ? (() => {
        const start = new Date(game.startTime);
        const end = game.endTime ? new Date(game.endTime) : new Date(start.getTime() + 60 * 60 * 1000);
        const club = game.court?.club || game.club;
        const clubName = club?.name || '';
        const shareUrl = getShareUrl();
        const entityTypeLabel = t(`games.entityTypes.${game.entityType}`);
        const ownerName = owner ? [owner.firstName, owner.lastName].filter(Boolean).join(' ').trim() : '';

        const titleParts: string[] = [];
        if (game.name) titleParts.push(game.name);
        if (game.entityType !== 'GAME') titleParts.push(entityTypeLabel);
        if (clubName) titleParts.push(clubName);
        const title = titleParts.join(' - ') || entityTypeLabel || t('games.entityTypes.GAME');

        const locationParts = [
          club?.name,
          (club as any)?.address,
          game.city?.name,
          game.city?.country,
        ].filter(Boolean);

        const notesParts = [
          game.name?.trim() ? game.name.trim() : null,
          entityTypeLabel,
          ownerName ? `${t('games.organizerFull')}: ${ownerName}` : null,
          game.description?.trim() ? game.description.trim() : null,
        ].filter(Boolean) as string[];

        return {
          title,
          start,
          end,
          location: locationParts.join(', '),
          description: notesParts.join('\n'),
          url: shareUrl,
        };
      })()
    : null;

  const handleNavigate = () => {
    const club = game.court?.club || game.club;
    const destinationParts = [game.city.country, game.city.name, club?.address].filter(Boolean);
    const destination = encodeURIComponent(destinationParts.join('+'));
    const url = `https://www.google.com/maps/dir/?api=1&destination=${destination}&travelmode=driving`;
    window.open(url, '_blank');
  };

  const handleShare = async () => {
    const shareUrl = getShareUrl();

    if (isCapacitor()) {
      try {
        await Share.share({
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

    if (navigator.share && (window.isSecureContext || location.protocol === 'https:')) {
      try {
        await navigator.share({
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

    setShareData({ url: shareUrl });
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
        return <Dumbbell size={48} className="text-green-500 dark:text-green-400 opacity-15 dark:opacity-15" />;
      case 'BAR':
        return <Beer size={40} className="text-yellow-500 dark:text-yellow-400 opacity-15 dark:opacity-15" />;
      default:
        return null;
    }
  };

  const getDateLabel = (date: Date | string, includeComma = true) => {
    const gameDate = typeof date === 'string' ? new Date(date) : date;
    const today = new Date();
    const tomorrow = new Date(today);
    tomorrow.setDate(today.getDate() + 1);
    const yesterday = new Date(today);
    yesterday.setDate(today.getDate() - 1);

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
      const dateFormat = daysDiff <= 7 ? 'EEEE, MMM d' : 'MMM d';
      return formatDate(gameDate, dateFormat) + (includeComma ? ',' : '');
    }
  };

  const playingParticipants = game.participants?.filter(p => p.isPlaying) ?? [];
  const shouldShowTiming = game.entityType !== 'LEAGUE_SEASON';
  const canShowEdit = game.resultsStatus === 'NONE' && game.status !== 'ARCHIVED';

  const renderName = () => {
    const titleClass = isCollapsed 
      ? 'text-sm font-semibold text-gray-900 dark:text-white mb-2 pr-20'
      : 'text-2xl font-bold text-gray-900 dark:text-white mb-2';
    const leagueNameClass = isCollapsed
      ? 'text-blue-600 dark:text-blue-400'
      : 'text-2xl font-bold text-blue-600 dark:text-blue-400 mb-2';
    const leagueSubtitleClass = isCollapsed
      ? 'text-purple-600 dark:text-purple-400'
      : 'text-xl font-semibold text-purple-600 dark:text-purple-400 mb-2';
    const groupClass = isCollapsed
      ? 'px-2 py-0.5 text-xs font-medium rounded text-white'
      : 'px-3 py-1 text-sm font-medium rounded text-white';
    const groupContainerClass = isCollapsed
      ? 'mt-1 flex items-center gap-2 flex-wrap'
      : 'text-lg font-medium mb-2 flex items-center gap-2 flex-wrap';
    const gameTypeClass = isCollapsed
      ? 'ml-2 text-xs text-gray-500 dark:text-gray-400'
      : '';

    const TitleTag = isCollapsed ? 'h3' : 'h1';

    return (
      <TitleTag
        onClick={() => !isCollapsed && canEdit && canShowEdit && setShowEditGameTextModal(true)}
        className={`${titleClass} ${
          !isCollapsed && canEdit && canShowEdit ? 'hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer transition-colors' : ''
        }`}
      >
        {game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name
          ? (
            <>
              <span className={leagueNameClass}>
                {game.parent.leagueSeason.league.name}
              </span>
              {game.parent.leagueSeason.game?.name && (
                <span className={leagueSubtitleClass}> {game.parent.leagueSeason.game.name}</span>
              )}
              {(game.leagueGroup?.name || game.leagueRound) && (
                <div className={groupContainerClass}>
                  {game.leagueGroup?.name && (
                    <span
                      className={groupClass}
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
                <span className={leagueNameClass}>{game.leagueSeason.league.name}</span>
                {game.name && (
                  <span className={leagueSubtitleClass}> {game.name}</span>
                )}
              </>
            )
            : game.name}
        {game.entityType !== 'LEAGUE' && game.entityType !== 'LEAGUE_SEASON' && game.name && game.gameType !== 'CLASSIC' && (
          <span className={gameTypeClass}>
            ({t(`games.gameTypes.${game.gameType}`)})
          </span>
        )}
        {game.entityType !== 'LEAGUE' && game.entityType !== 'LEAGUE_SEASON' && !game.name && game.gameType !== 'CLASSIC' && t(`games.gameTypes.${game.gameType}`)}
      </TitleTag>
    );
  };

  const renderTags = () => {
    if (!showTags) return null;

    const tagPadding = isCollapsed ? 'px-2 py-1' : 'px-3 py-1';
    const tagText = isCollapsed ? 'text-xs' : 'text-sm';
    const iconSize = isCollapsed ? 12 : 14;
    const gapClass = isCollapsed ? 'gap-2' : 'gap-2';
    const mbClass = isCollapsed ? 'mb-1' : 'mb-2';
    const prClass = isCollapsed ? 'pr-10' : '';

    return (
      <div className={`flex items-center ${gapClass} ${mbClass} ${prClass} flex-wrap`}>
        <GameStatusIcon status={game.status} className={!isCollapsed ? 'p-1' : ''} />
        {!game.isPublic && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1`}>
            <Lock size={iconSize} />
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
        {isOwner && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400 flex items-center gap-1`}>
            <Crown size={iconSize} className={isCollapsed ? 'hidden' : ''} />
            {isCollapsed ? t('games.owner') : t('games.organizerFull')}
          </span>
        )}
        {game.entityType !== 'GAME' && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-primary-100 text-primary-800 dark:bg-primary-900/30 dark:text-primary-400 flex items-center gap-1`}>
            {game.entityType === 'TOURNAMENT' && <Swords size={iconSize} />}
            {(game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON') && <Trophy size={iconSize} />}
            {game.entityType === 'TRAINING' && <Dumbbell size={iconSize} />}
            {game.entityType === 'BAR' && <Beer size={iconSize} />}
            {t(`games.entityTypes.${game.entityType}`)}
          </span>
        )}
        {game.gameType !== 'CLASSIC' && (
          <button
            onClick={() => !isCollapsed && canEdit && canShowEdit && setShowEditGameTextModal(true)}
            className={`${tagPadding} ${tagText} font-medium rounded bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300 ${
              !isCollapsed && canEdit && canShowEdit ? 'hover:bg-gray-200 dark:hover:bg-gray-600 cursor-pointer transition-colors' : ''
            } ${isCollapsed ? 'hidden' : ''}`}
          >
            {t(`games.gameTypes.${game.gameType}`)}
          </button>
        )}
        {isGuest && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400`}>
            {t('chat.guest')}
          </span>
        )}
        {!game.affectsRating && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400 flex items-center gap-1`}>
            <Award size={iconSize} className={isCollapsed ? '' : 'hidden'} />
            <Ban size={iconSize} />
            <span className="hidden sm:inline">{t('games.noRating')}</span>
          </span>
        )}
        {game.hasFixedTeams && (
          <span className={`${tagPadding} ${tagText} font-medium rounded bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400 flex items-center gap-1`}>
            <div className="flex items-center">
              <Users size={iconSize} />
              <Users size={iconSize} />
            </div>
            <span className="hidden sm:inline">{t('games.fixedTeams')}</span>
          </span>
        )}
      </div>
    );
  };

  const renderCollapsedSummary = () => {
    if (game.entityType === 'TRAINING') {
      const owner = game.participants?.find(p => p.role === 'OWNER');
      return (
        <>
          <div className="flex-shrink-0">
            {owner && (
              <PlayerAvatar
                player={owner.user}
                smallLayout={true}
                showName={false}
              />
            )}
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              {game.timeIsSet === false ? (
                <span className="text-gray-500 dark:text-gray-400 italic text-xs">{t('gameDetails.datetimeNotSet')}</span>
              ) : (
                <span>
                  {getDateLabel(game.startTime, false)}
                  {shouldShowTiming && (
                    <>
                      {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
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
              )}
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
                  {`${playingParticipants.length}/${game.maxParticipants}`}
                </span>
              </div>
            </div>
          </div>
        </>
      );
    }

    const avatarToShow = game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar;
    if (avatarToShow) {
      return (
        <>
          <div className="flex-shrink-0">
            <GameAvatar avatar={avatarToShow} small alt={game.name || t('gameDetails.gameAvatar')} />
          </div>
          <div className="flex flex-col gap-2 flex-1">
            <div className="flex items-center gap-1">
              <Calendar size={14} />
              {game.timeIsSet === false ? (
                <span className="text-gray-500 dark:text-gray-400 italic text-xs">{t('gameDetails.datetimeNotSet')}</span>
              ) : (
                <span>
                  {getDateLabel(game.startTime, false)}
                  {shouldShowTiming && (
                    <>
                      {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
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
              )}
            </div>
            <div className="flex items-center gap-4">
              <div className="flex items-center gap-1">
                <Users size={14} />
                <span>
                  {game.entityType === 'BAR' 
                    ? playingParticipants.length
                    : `${playingParticipants.length}/${game.maxParticipants}`}
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
      );
    }

    return (
      <>
        <div className="flex items-center gap-1">
          <Calendar size={14} />
          {game.timeIsSet === false ? (
            <span className="text-gray-500 dark:text-gray-400 italic text-xs">{t('gameDetails.datetimeNotSet')}</span>
          ) : (
            <span>
              {getDateLabel(game.startTime, false)}
              {shouldShowTiming && (
                <>
                  {` ${displaySettings ? formatGameTime(game.startTime, displaySettings) : formatDate(game.startTime, 'HH:mm')}`}
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
          )}
        </div>
        <div className="flex items-center gap-1">
          <Users size={14} />
          <span>
            {game.entityType === 'BAR' 
              ? playingParticipants.length
              : `${playingParticipants.length}/${game.maxParticipants}`}
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
    );
  };

  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;
    const updateHeight = () => {
      setContentHeight(element.scrollHeight);
    };
    updateHeight();
    const resizeObserver = new ResizeObserver(updateHeight);
    resizeObserver.observe(element);
    return () => resizeObserver.disconnect();
  }, [game]);

  return (
    <Card className={`relative transition-all duration-300 ease-in-out ${isCollapsed ? '-translate-y-0 z-[5] -mb-4' : 'translate-y-0 z-auto mb-2'} ${getEntityGradient()}`}>
      <div className="absolute right-4 z-20">
        <div className="relative flex flex-col items-end gap-2">
          <div className={`flex flex-col gap-2 transition-all duration-300 ease-in-out ${
            isCollapsed 
              ? 'translate-x-8 opacity-0 pointer-events-none max-h-0 overflow-hidden' 
              : 'translate-x-0 opacity-100 pointer-events-auto max-h-32'
          }`}>
            <button
              onClick={handleShare}
              className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110"
              title={t('gameDetails.shareGame')}
            >
              <ExternalLink size={24} className="text-white" />
            </button>
            {game.timeIsSet === true && calendarEvent && (
              <button
                onClick={async () => {
                  if (isCapacitor()) {
                    try {
                      await addToNativeCalendar(calendarEvent);
                      //toast.success(t('gameDetails.calendarEventAdded'));
                    } catch (error) {
                      toast.error(t('gameDetails.calendarError'));
                      console.error('Failed to add event to calendar:', error);
                    }
                  } else {
                    setShowAddToCalendarModal(true);
                  }
                }}
                className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110"
                title={t('gameDetails.addToCalendar')}
              >
                <CalendarPlus size={24} className="text-white" />
              </button>
            )}
            <button
              onClick={handleNavigate}
              className="p-2 rounded-lg bg-primary-600 hover:bg-primary-700 dark:bg-primary-600 dark:hover:bg-primary-700 transition-colors active:scale-110"
              title={t('gameDetails.navigateToClub')}
            >
              <MapPin size={24} className="text-white" />
            </button>
          </div>
          <button
            onClick={() => setIsCollapsed(prev => !prev)}
            className={`p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-all duration-300 ease-in-out ${
              isCollapsed ? 'absolute top-2 right-0' : 'relative'
            }`}
            title={isCollapsed ? t('common.expand') : t('common.collapse')}
          >
            <div className={`transition-transform duration-300 ${isCollapsed ? 'rotate-0' : 'rotate-90'}`}>
              <ChevronRight size={24} className="text-gray-600 dark:text-gray-300" />
            </div>
          </button>
        </div>
      </div>
      {game.entityType !== 'GAME' && (
        <div className="absolute bottom-2 right-2 z-0 pointer-events-none">
          {getEntityIcon()}
        </div>
      )}
      {isCollapsed && (
        <div className="mb-3 relative z-10">
          {renderName()}
          {renderTags()}
        </div>
      )}
      {isCollapsed && (
        <div className={`text-sm text-gray-600 dark:text-gray-400 animate-in slide-in-from-top-2 duration-300 relative z-10 -mb-1 ${game.entityType === 'TRAINING' ? 'flex gap-4' : (game.entityType === 'LEAGUE' ? game.parent?.leagueSeason?.game?.avatar : game.avatar) ? 'flex gap-4' : 'flex items-center gap-4'}`}>
          {renderCollapsedSummary()}
        </div>
      )}
      <div
        ref={contentRef}
        className="transition-[max-height,opacity] duration-300 ease-in-out overflow-hidden"
        style={{ maxHeight: isCollapsed ? 0 : contentHeight || undefined, opacity: isCollapsed ? 0 : 1 }}
      >
        {!isCollapsed && game.avatar && (
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
            {renderName()}
            {renderTags()}
          </div>
        </div>

        <div className="space-y-3 mb-0">
          <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
            <Calendar size={20} className="text-primary-600 dark:text-primary-400" />
            {game.timeIsSet === false ? (
              <span className="text-gray-500 dark:text-gray-400 italic">{t('gameDetails.datetimeNotSet')}</span>
            ) : (
              <div className="flex-1">
                {canEdit && canShowEdit ? (
                  <button
                    onClick={() => {
                      if (isEditMode) {
                        onScrollToSettings();
                      } else {
                        onOpenTimeDurationModal();
                      }
                    }}
                    className="flex flex-col text-left font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    <span>{(() => {
                      const dayOfWeek = formatDate(game.startTime, 'EEEE');
                      return dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
                    })()}</span>
                    <span>{formatDate(game.startTime, 'PPP')}</span>
                  </button>
                ) : (
                  <div className="flex flex-col">
                    <span>{(() => {
                      const dayOfWeek = formatDate(game.startTime, 'EEEE');
                      return dayOfWeek.charAt(0).toUpperCase() + dayOfWeek.slice(1);
                    })()}</span>
                    <span>{formatDate(game.startTime, 'PPP')}</span>
                  </div>
                )}
              </div>
            )}
          </div>
          {game.entityType !== 'LEAGUE_SEASON' && game.timeIsSet !== false && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
              <Clock size={20} className="text-primary-600 dark:text-primary-400" />
              <div className="flex-1">
                <div className="flex items-center gap-2">
                  {canEdit && canShowEdit ? (
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
                  {canEdit && canShowEdit ? (
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
          {((game.priceType && game.priceType !== 'NOT_KNOWN') || (canEdit && canShowEdit)) && (
            <div className="flex items-center gap-3 text-gray-700 dark:text-gray-300">
              <Banknote size={20} className="text-primary-600 dark:text-primary-400" />
              <div className="flex-1">
                {canEdit && canShowEdit ? (
                  <button
                    onClick={() => setShowEditGamePriceModal(true)}
                    className="font-medium hover:text-primary-600 dark:hover:text-primary-400 transition-colors cursor-pointer"
                  >
                    {game.priceType === 'FREE'
                      ? t('createGame.priceTypeFree')
                      : game.priceType && game.priceType !== 'NOT_KNOWN' && game.priceTotal !== undefined
                      ? `${game.priceTotal} ${game.priceCurrency || 'EUR'} (${t(`createGame.priceType${game.priceType === 'PER_PERSON' ? 'PerPerson' : game.priceType === 'PER_TEAM' ? 'PerTeam' : 'Total'}`)})`
                      : t('createGame.priceNotSet')}
                  </button>
                ) : (
                  <span>
                    {game.priceType === 'FREE'
                      ? t('createGame.priceTypeFree')
                      : game.priceType && game.priceType !== 'NOT_KNOWN' && game.priceTotal !== undefined
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
                onClick={() => canEdit && canShowEdit && setShowEditGameTextModal(true)}
                className={`text-sm text-gray-600 dark:text-gray-400 text-left whitespace-pre-line ${
                  canEdit && canShowEdit ? 'hover:text-primary-600 dark:hover:text-primary-400 cursor-pointer transition-colors' : ''
                }`}
              >
                {game.description}
              </button>
            </div>
          )}
        </div>
      </div>
      <ShareModal
        isOpen={showShareModal}
        onClose={() => setShowShareModal(false)}
        shareUrl={shareData.url}
      />
      {calendarEvent && (
        <AddToCalendarModal
          isOpen={showAddToCalendarModal}
          onClose={() => setShowAddToCalendarModal(false)}
          event={calendarEvent}
          filename={`game-${game.id}.ics`}
        />
      )}
      {showFullscreenAvatar && game.originalAvatar && (
        <FullscreenImageViewer
          imageUrl={game.originalAvatar || ''}
          onClose={() => setShowFullscreenAvatar(false)}
          isOpen={showFullscreenAvatar}
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
