import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card, Button } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { GameCardTrainerBadge } from '@/components/gameCard/GameCardTrainerBadge';
import { GameCardInfoRows } from '@/components/gameCard/GameCardInfoRows';
import { GameCardHeaderTags } from '@/components/gameCard/GameCardHeaderTags';
import { Game } from '@/types';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { getGameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';
import { formatDate } from '@/utils/dateFormat';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import { getGameTimeDisplay, getClubTimezone, getDateLabelInClubTz } from '@/utils/gameTimeDisplay';
import { getGameCardEntityGradientClasses } from '@/utils/gameCardEntityTheme';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { GameSportTagRow } from '@/components/GameSportTag';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { matchFormatSummaryPart } from '@/utils/gameFormat';
import { shouldShowGameCardSportGlyph, getViewerPrimarySport } from '@/utils/findSportFilter';
import { parseGameSport } from '@/utils/gameSport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import {
  gameHasConfirmedClubBooking,
  gameHasLinkedExternalBooking,
} from '@/utils/gameHasConfirmedClubBooking';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { canViewGamePhotos } from '@shared/gamePhotos/permissions';

import { useAuthStore } from '@/store/authStore';
import { useContextUnread } from '@/hooks/useUnreadBridge';
import { UserGameNoteModal } from '@/components/GameDetails/UserGameNoteModal';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { GameCardReactions } from '@/components/GameCardReactions';
import { Users, MessageCircle, Dumbbell, Beer, Swords, Trophy, Plane, Bookmark } from 'lucide-react';
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
  /** Set on Find tab only — drives sport glyph visibility. */
  findFilterSport?: FindSportFilterValue;
}

export const GameCard = ({ 
  game, 
  user, 
  onClick,
  showChatIndicator = true, 
  showJoinButton = false, 
  onJoin,
  onNoteSaved,
  unreadCount: unreadCountProp = 0,
  findFilterSport,
}: GameCardProps) => {
  const displayUnread = useContextUnread('GAME', game.id, unreadCountProp);
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const effectiveUser = user || authUser;
  const expandedContentRef = useRef<HTMLDivElement>(null);
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showJoinConfirm, setShowJoinConfirm] = useState(false);
  const [joinAction, setJoinAction] = useState<'game' | 'queue' | null>(null);
  const [reactions, setReactions] = useState(() => game.reactions ?? []);
  const lastSyncedGameIdRef = useRef(game.id);
  useEffect(() => {
    const next = game.reactions ?? [];
    if (lastSyncedGameIdRef.current !== game.id) {
      lastSyncedGameIdRef.current = game.id;
      setReactions(next);
      return;
    }
    setReactions((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  }, [game.id, game.reactions]);

  const showPhotoPreview =
    canViewGamePhotos(game, effectiveUser ? { id: effectiveUser.id, isAdmin: effectiveUser.isAdmin } : null) &&
    (game.photosCount ?? 0) > 0 &&
    !!getGameMainPhotoId(game) &&
    !!game.mainPhoto?.thumbnailUrl;

  const mainPhotoUrl = showPhotoPreview ? game.mainPhoto?.thumbnailUrl ?? null : null;
  const showPhotoCountBadge =
    canViewGamePhotos(game, effectiveUser ? { id: effectiveUser.id, isAdmin: effectiveUser.isAdmin } : null) &&
    (game.photosCount ?? 0) > 0;

  const participants = game.participants ?? [];
  const participation = getGameParticipationState(participants, effectiveUser?.id, game);
  const isParticipant = participation.isPlaying;
  const myParticipationBadge = getGameCardMyParticipationBadge(participants, effectiveUser?.id);
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
  const showStatusIcon = game.status !== 'ANNOUNCED';
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

  const isLeagueEntity = game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON';
  const isNonGameEntity = game.entityType !== 'GAME';

  const hasOtherTags = isLeagueEntity && (
    (game.photosCount ?? 0) > 0 ||
    !game.isPublic ||
    (game.genderTeams && game.genderTeams !== 'ANY') ||
    myParticipationBadge != null ||
    game.entityType !== 'GAME' ||
    !game.affectsRating ||
    game.hasFixedTeams ||
    ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') && game.resultsStatus === 'FINAL')
  );

  const hasVisibleGameName = (game.entityType === 'LEAGUE' && game.leagueRound && game.parent?.leagueSeason?.league?.name) ||
    (game.entityType === 'LEAGUE_SEASON' && game.leagueSeason?.league?.name) ||
    game.name;

  const isLeagueComplexHeader =
    game.entityType === 'LEAGUE' &&
    Boolean(game.leagueRound && game.parent?.leagueSeason?.league?.name);

  const isLeagueSeasonHeader =
    game.entityType === 'LEAGUE_SEASON' && Boolean(game.leagueSeason?.league?.name);

  /** Title row shows `game.name`, game-type fallback, league headers, or bookmark+entity when non-GAME without name */
  const bookmarkInTitleRow = isLeagueSeasonHeader
    ? true
    : isLeagueComplexHeader
      ? isNonGameEntity
      : Boolean(game.name) ||
        (game.entityType !== 'TRAINING' && !game.name && game.gameType !== 'CLASSIC') ||
        (!game.name && isNonGameEntity);

  const shouldMoveIconsToTitle = Boolean(isLeagueEntity && hasVisibleGameName && !hasOtherTags);

  const nonLeagueShowEntityIcon = !isLeagueEntity && bookmarkInTitleRow && isNonGameEntity;
  const nonLeagueShowEntityPill = !isLeagueEntity && isNonGameEntity && !bookmarkInTitleRow;

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
  const linkedExternalBooking = gameHasLinkedExternalBooking(game);
  const showConfirmedCourtBadge = gameHasConfirmedClubBooking(game) || linkedExternalBooking;
  const infoHintText = timeDisplay.hintText || timeRangeDisplay.hintText;
  const trainerParticipant =
    game.entityType === 'TRAINING' && game.trainerId
      ? participants.find((p) => p.userId === game.trainerId) ?? null
      : null;

  const handleChatClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/games/${game.id}/chat`);
  };

  const handleCardClick = () => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/games/${game.id}`);
    }
  };

  const noteBookmarkButton =
    !userNoteDisplay && effectiveUser ? (
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
        className="flex h-[18px] w-[18px] shrink-0 items-center justify-center p-0 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-400 transition-colors cursor-pointer"
      >
        <Bookmark size={14} />
      </span>
    ) : null;


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

  const infoDateText =
    getDateLabelResolved(game.startTime) +
    (shouldShowTiming ? ` ${timeRangeDisplay.primaryText}` : '');

  const titleEntityInlineIcon =
    (isLeagueEntity ? bookmarkInTitleRow && isNonGameEntity : nonLeagueShowEntityIcon) ? (
      game.entityType === 'TOURNAMENT' ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-red-400/80 dark:border-red-500/70 bg-transparent"
          aria-hidden
        >
          <Swords size={14} className="text-red-600 dark:text-red-400" />
        </span>
      ) : game.entityType === 'LEAGUE' || game.entityType === 'LEAGUE_SEASON' ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-blue-400/80 dark:border-blue-500/70 bg-transparent"
          aria-hidden
        >
          <Trophy size={14} className="text-blue-600 dark:text-blue-400" />
        </span>
      ) : game.entityType === 'TRAINING' ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-green-400/80 dark:border-green-500/70 bg-transparent"
          aria-hidden
        >
          <Dumbbell size={14} className="text-green-600 dark:text-green-400" />
        </span>
      ) : game.entityType === 'BAR' ? (
        <span
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full border-2 border-amber-400/80 dark:border-amber-500/70 bg-transparent"
          aria-hidden
        >
          <Beer size={14} className="text-amber-700 dark:text-amber-400" />
        </span>
      ) : null
    ) : null;

  const viewerPrimarySport = getViewerPrimarySport(effectiveUser);
  const showSportTag = shouldShowGameCardSportGlyph(
    game.sport,
    viewerPrimarySport,
    findFilterSport,
  );
  const gameSport = parseGameSport(game.sport);
  const hasGameSportTags =
    showSportTag ||
    (game.entityType !== 'TRAINING' &&
      matchFormatSummaryPart(t, playersPerMatchOf(game), game.sport) != null);
  const gameSportTags = hasGameSportTags ? (
    <GameSportTagRow
      sport={gameSport}
      showSport={showSportTag}
      playersPerMatch={playersPerMatchOf(game)}
      showMatchFormat={game.entityType !== 'TRAINING'}
      className="shrink-0"
    />
  ) : null;

  const headerTagsProps = {
    game,
    showStatusIcon,
    sportTags: gameSportTags,
    showPhotoCountBadge,
    myParticipationBadge,
  };

  const showLeagueBadgeRow =
    isLeagueEntity &&
    ((!bookmarkInTitleRow && noteBookmarkButton != null) ||
      (!shouldMoveIconsToTitle && showFireIcon) ||
      (!shouldMoveIconsToTitle && showStatusIcon) ||
      (!shouldMoveIconsToTitle && hasGameSportTags) ||
      showPhotoCountBadge ||
      !game.isPublic ||
      (game.genderTeams != null && game.genderTeams !== 'ANY') ||
      myParticipationBadge != null ||
      (game.entityType !== 'GAME' && !bookmarkInTitleRow) ||
      !game.affectsRating ||
      game.hasFixedTeams ||
      ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
        game.resultsStatus === 'FINAL'));

  const nonLeagueTitle = (
    <>
      {game.name}
      {game.entityType !== 'TRAINING' && game.name && game.gameType !== 'CLASSIC' && (
        <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
          ({t(`games.gameTypes.${game.gameType}`)})
        </span>
      )}
      {game.entityType !== 'TRAINING' && !game.name && game.gameType !== 'CLASSIC' &&
        t(`games.gameTypes.${game.gameType}`)}
    </>
  );

  return (
    <SportLevelProvider sport={gameSport}>
    <>
    <Card
      className={`group hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01]
        active:scale-[0.99] transition-all duration-300 ease-out will-change-transform
        cursor-pointer relative pb-0 overflow-visible ${getGameCardEntityGradientClasses(game.entityType)}`}
      onClick={handleCardClick}
    >
      <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl" aria-hidden>
        <span className="absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 dark:via-white/[0.06] to-transparent -translate-x-[150%] group-hover:translate-x-[350%] transition-transform duration-700 ease-out" />
      </span>
      <div className="absolute top-2 right-2 z-20 flex flex-col items-end gap-1">
        <GameCardReactions
          entityType={game.entityType}
          gameId={game.id}
          reactions={reactions}
          currentUserId={effectiveUser?.id}
          onReactionsChange={setReactions}
          pickerOpens="below"
        />
        {showChatIndicator && (
          <button
            type="button"
            onClick={handleChatClick}
            className="pl-1.5 pt-1 pr-2 pb-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 hover:scale-110 active:scale-95 transition-all duration-200 relative"
          >
            <MessageCircle size={20} className="text-gray-600 dark:text-gray-400" />
            {displayUnread > 0 && (
              <>
                <span className="absolute -top-0.5 -right-0.5 w-5 h-5 rounded-full bg-red-500 opacity-40 animate-ping [animation-duration:2s]" aria-hidden />
                <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-xs rounded-full w-5 h-5 flex items-center justify-center shadow-[0_0_6px_rgba(239,68,68,0.5)]">
                  {displayUnread > 99 ? '99+' : displayUnread}
                </span>
              </>
            )}
          </button>
        )}
      </div>
      {/* Header - Always visible */}
      <div className={`relative z-10 ${isLeagueEntity && showLeagueBadgeRow ? 'mb-2' : 'mb-1'}`}>
        {isDifferentCity && game.city?.name && (
          <div className="inline-flex items-center gap-1.5 mb-2 px-1.5 py-0.5 bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/30 dark:to-amber-900/30 border border-yellow-300 dark:border-yellow-700 rounded-lg shadow-[0_0_8px_rgba(234,179,8,0.4)] dark:shadow-[0_0_8px_rgba(234,179,8,0.5)]">
            <Plane size={12} className="text-yellow-600 dark:text-yellow-400 flex-shrink-0 drop-shadow-[0_0_2px_rgba(234,179,8,0.8)]" />
            <span className="text-xs font-medium text-yellow-700 dark:text-yellow-300 whitespace-nowrap drop-shadow-[0_0_1px_rgba(234,179,8,0.6)]">{translateCity(game.city.id, game.city.name, game.city.country)}</span>
          </div>
        )}
        <>
            {isLeagueEntity ? (
              <>
                <h3 className={`text-sm font-semibold text-gray-900 dark:text-white pr-[5.5rem] sm:pr-24 flex flex-wrap items-center gap-2 ${showLeagueBadgeRow ? 'mb-1.5' : 'mb-0'}`}>
                  {bookmarkInTitleRow && noteBookmarkButton}
                  {titleEntityInlineIcon}
                  <span className="min-w-0">
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
                                  className="px-2 py-0.5 text-xs font-medium rounded-full text-white"
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
                  </span>
                  {shouldMoveIconsToTitle && showFireIcon && <AnnouncedFireIcon />}
                  {shouldMoveIconsToTitle && showStatusIcon && <GameStatusIcon status={game.status} />}
                  {shouldMoveIconsToTitle && gameSportTags}
                </h3>
                {showLeagueBadgeRow && (
                  <div className="flex items-center gap-2 pr-10 flex-wrap">
                    {!bookmarkInTitleRow && noteBookmarkButton}
                    {!shouldMoveIconsToTitle && showFireIcon && <AnnouncedFireIcon />}
                    <GameCardHeaderTags
                      {...headerTagsProps}
                      skipStatus={shouldMoveIconsToTitle}
                      showEntityTypePill={game.entityType !== 'GAME' && !bookmarkInTitleRow}
                    />
                  </div>
                )}
              </>
            ) : (
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white pr-[5.5rem] sm:pr-24 flex flex-wrap items-center gap-2 mb-0">
                {showFireIcon && <AnnouncedFireIcon />}
                {noteBookmarkButton}
                <span className="min-w-0">{nonLeagueTitle}</span>
                {showStatusIcon && <GameStatusIcon status={game.status} />}
                {titleEntityInlineIcon}
                <GameCardHeaderTags
                  {...headerTagsProps}
                  skipStatus
                  showEntityTypePill={nonLeagueShowEntityPill}
                />
              </h3>
            )}

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
      </div>

      {/* Content */}
      <div ref={expandedContentRef} className="relative z-10">
        {mainPhotoUrl ? (
          <div className="flex gap-4 mb-2 items-center">
            {trainerParticipant && <GameCardTrainerBadge trainer={trainerParticipant} />}
            <div className="flex-shrink-0">
              <div className="w-24 h-24 rounded-xl overflow-hidden ring-2 ring-gray-200 dark:ring-gray-700 shadow-sm transition-shadow duration-300 group-hover:shadow-md">
                <img
                  src={mainPhotoUrl}
                  alt="Main photo"
                  className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-110"
                  loading="lazy"
                />
              </div>
            </div>
            {game.entityType !== 'LEAGUE_SEASON' && (
              <GameCardInfoRows
                game={game}
                participants={participants}
                dateText={infoDateText}
                hintText={infoHintText}
                showConfirmedCourtBadge={showConfirmedCourtBadge}
                linkedExternalBooking={linkedExternalBooking}
                className="flex flex-col gap-2 flex-1 text-sm text-gray-600 dark:text-gray-400 justify-center min-h-0"
              />
            )}
          </div>
        ) : (
          <div className={`text-sm text-gray-600 dark:text-gray-400 ${game.entityType === 'TRAINING' ? 'flex gap-4 -mt-1 items-center' : ''}`}>
            {trainerParticipant && <GameCardTrainerBadge trainer={trainerParticipant} />}
            {game.entityType !== 'LEAGUE_SEASON' && (
              <GameCardInfoRows
                game={game}
                participants={participants}
                dateText={infoDateText}
                hintText={infoHintText}
                showConfirmedCourtBadge={showConfirmedCourtBadge}
                linkedExternalBooking={linkedExternalBooking}
                className="space-y-2 flex-1"
              />
            )}
          </div>
        )}
        {game.entityType !== 'LEAGUE_SEASON' && (
        <div className={`space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ${game.entityType === 'TRAINING' && participants.filter(p => p.status === 'PLAYING').length >= 1 ? 'pt-1.5 mt-1.5 border-t border-gray-200 dark:border-gray-700' : ''}`}>
          <div className="flex items-center gap-2 min-h-0">
            <div className="relative -mx-0 flex-1 w-full min-w-0">
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
          <div className="mt-1 mb-0">
            {hasUnoccupiedSlots ? (
              <Button
                onClick={(e) => {
                  e.stopPropagation();
                  setJoinAction('game');
                  setShowJoinConfirm(true);
                }}
                className="w-full bg-gradient-to-r from-primary-500 to-primary-600 hover:from-primary-600 hover:to-primary-700 shadow-md shadow-primary-500/25 hover:shadow-lg hover:shadow-primary-500/35 transition-all duration-300"
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
                className="w-full bg-gradient-to-r from-sky-500 to-primary-600 hover:from-sky-600 hover:to-primary-700 shadow-md shadow-primary-500/25 hover:shadow-lg hover:shadow-primary-500/35 transition-all duration-300"
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
    </SportLevelProvider>
  );
};
