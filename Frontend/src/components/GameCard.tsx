import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { GameStatusIcon } from '@/components/GameStatusIcon';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { GameCardTrainerBadge } from '@/components/gameCard/GameCardTrainerBadge';
import { GameCardInfoRows } from '@/components/gameCard/GameCardInfoRows';
import { GameCardHeaderTags } from '@/components/gameCard/GameCardHeaderTags';
import { GameCardEntityIcon } from '@/components/gameCard/GameCardEntityIcon';
import { GameCardTitle } from '@/components/gameCard/GameCardTitle';
import { gameCardHasVisibleTitle } from '@/utils/gameCardVisibleTitle';
import { GameCardRightRail } from '@/components/gameCard/GameCardRightRail';
import { GameCardPlayersPhoto } from '@/components/gameCard/GameCardPlayersPhoto';
import { GameCardUserNote } from '@/components/gameCard/GameCardUserNote';
import { GameCardJoinButton } from '@/components/gameCard/GameCardJoinButton';
import { Game } from '@/types';
import { getGameParticipationState } from '@/utils/gameParticipationState';
import { getGameCardMyParticipationBadge } from '@/utils/gameCardMyParticipationBadge';
import { resolveDisplaySettings } from '@/utils/displayPreferences';
import {
  getGameTimeDisplay,
  getClubTimezone,
  getUserTimezone,
  getRelativeDayLabel,
} from '@/utils/gameTimeDisplay';
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
  isExternallyFullyBookedGame,
  resolveGameBookingBadgeKind,
} from '@/utils/gameHasConfirmedClubBooking';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { canViewGamePhotos } from '@shared/gamePhotos/permissions';
import { gameCardReactionsEqual } from '@/utils/gameCardReactionsEqual';
import {
  getPlayingParticipants,
  playingParticipantsKey,
} from '@/utils/gameCardParticipants';
import {
  gameCardOutcomesKey,
  hasOutcomeStandings,
  orderPlayingParticipantsByStandings,
} from '@/utils/gameCardStandings';
import { resolveStandingMedalMode } from '@/utils/gameCardStandingPlace';
import { gameCardPropsEqual } from '@/utils/gameCardPropsEqual';

import { useAuthStore } from '@/store/authStore';
import { useContextUnread } from '@/hooks/useUnreadBridge';
import { UserGameNoteModal } from '@/components/GameDetails/UserGameNoteModal';
import { GameWeatherDialog } from '@/components/weather/GameWeatherDialog';
import { Plane } from 'lucide-react';
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

export const GameCard = memo(function GameCard({
  game,
  user,
  onClick,
  showChatIndicator = true,
  showJoinButton = false,
  onJoin,
  onNoteSaved,
  unreadCount: unreadCountProp = 0,
  findFilterSport,
}: GameCardProps) {
  const displayUnread = useContextUnread('GAME', game.id, unreadCountProp);
  const { t } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const effectiveUser = user || authUser;
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [reactions, setReactions] = useState(() => game.reactions ?? []);
  const lastSyncedGameIdRef = useRef(game.id);
  useEffect(() => {
    const next = game.reactions ?? [];
    if (lastSyncedGameIdRef.current !== game.id) {
      lastSyncedGameIdRef.current = game.id;
      setReactions(next);
      return;
    }
    setReactions((prev) => (gameCardReactionsEqual(prev, next) ? prev : next));
  }, [game.id, game.reactions]);

  const showPhotoPreview =
    canViewGamePhotos(game, effectiveUser ? { id: effectiveUser.id, isAdmin: effectiveUser.isAdmin } : null) &&
    (game.photosCount ?? 0) > 0 &&
    !!getGameMainPhotoId(game) &&
    !!game.mainPhoto?.thumbnailUrl;

  const mainPhotoUrl = showPhotoPreview ? game.mainPhoto?.thumbnailUrl ?? null : null;

  const participants = game.participants ?? [];
  const playingSig = playingParticipantsKey(participants);
  const outcomesKey = gameCardOutcomesKey(game.outcomes);
  const showStandingPlaces = hasOutcomeStandings(game.resultsStatus, game.outcomes);
  const standingCacheKey = `${playingSig}\u0001${showStandingPlaces ? outcomesKey : ''}`;
  const playingCacheRef = useRef({
    sig: '',
    list: [] as typeof participants,
    placeByUserId: {} as Record<string, number>,
  });
  if (playingCacheRef.current.sig !== standingCacheKey) {
    const playing = getPlayingParticipants(participants);
    if (showStandingPlaces) {
      const ordered = orderPlayingParticipantsByStandings(playing, game.outcomes);
      playingCacheRef.current = {
        sig: standingCacheKey,
        list: ordered.participants,
        placeByUserId: ordered.placeByUserId,
      };
    } else {
      playingCacheRef.current = {
        sig: standingCacheKey,
        list: playing,
        placeByUserId: {},
      };
    }
  }
  const playingParticipants = playingCacheRef.current.list;
  const standingPlaceByUserId = showStandingPlaces
    ? playingCacheRef.current.placeByUserId
    : undefined;
  const standingMedalMode = resolveStandingMedalMode(game.entityType);

  const participation = getGameParticipationState(participants, effectiveUser?.id, game);
  const isParticipant = participation.isPlaying;
  const myParticipationBadge = getGameCardMyParticipationBadge(participants, effectiveUser?.id);
  const isLeagueSeasonGame = game.entityType === 'LEAGUE_SEASON';
  const shouldShowTiming = !isLeagueSeasonGame;
  const displayPrefsKey = effectiveUser
    ? `${effectiveUser.id ?? ''}:${effectiveUser.language ?? ''}:${effectiveUser.timeFormat ?? ''}:${effectiveUser.weekStart ?? ''}`
    : 'guest';
  const displayCacheRef = useRef({
    key: '',
    value: resolveDisplaySettings(null),
  });
  if (displayCacheRef.current.key !== displayPrefsKey) {
    displayCacheRef.current = {
      key: displayPrefsKey,
      value: resolveDisplaySettings(effectiveUser),
    };
  }
  const displaySettings = displayCacheRef.current.value;

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
  const joinQueueCount = participants.filter((p) => p.status === 'IN_QUEUE').length;
  const showJoinQueueHint = joinQueueCount > 0 && participation.isAdminOrOwner;
  const handleNoteSaved = useCallback(() => {
    onNoteSaved?.(game.id);
  }, [game.id, onNoteSaved]);

  const userCityId = effectiveUser?.currentCity?.id || effectiveUser?.currentCityId;
  const gameCityId = game.city?.id;
  const isDifferentCity = Boolean(gameCityId && userCityId && gameCityId !== userCityId);
  const clubTz = getClubTimezone(game);

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
  const bookingBadgeKind = resolveGameBookingBadgeKind(game);
  const showConfirmedCourtBadge = bookingBadgeKind !== 'none';
  const linkedExternalBooking = isExternallyFullyBookedGame(game);
  const infoHintText = timeDisplay.hintText || timeRangeDisplay.hintText;
  const infoTimeText = shouldShowTiming ? timeRangeDisplay.primaryText : null;
  const infoDayLabel =
    game.timeIsSet !== false
      ? getRelativeDayLabel(game.startTime, clubTz ?? getUserTimezone(), t)
      : null;

  const trainerParticipant =
    game.entityType === 'TRAINING' && game.trainerId
      ? participants.find((p) => p.userId === game.trainerId) ?? null
      : null;

  const gameId = game.id;

  const handleChatClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    e.preventDefault();
    navigate(`/games/${gameId}/chat`);
  }, [gameId, navigate]);

  const handleWeatherClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setShowWeatherModal(true);
  }, []);

  const handleCloseWeatherModal = useCallback(() => {
    setShowWeatherModal(false);
  }, []);

  const weatherSummary = game.weatherSummary ?? null;
  // Weather chip shows for every entity type except LEAGUE_SEASON,
  // regardless of participation (so it appears in Find too).
  const showWeatherChip = !isLeagueSeasonGame && Boolean(weatherSummary);
  const railWeatherSummary = showWeatherChip ? weatherSummary : null;

  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/games/${gameId}`);
    }
  }, [gameId, navigate, onClick]);

  const openNoteModal = useCallback(() => setShowNoteModal(true), []);
  const closeNoteModal = useCallback(() => setShowNoteModal(false), []);

  const viewerPrimarySport = getViewerPrimarySport(effectiveUser);
  const showSportTag = shouldShowGameCardSportGlyph(game.sport, viewerPrimarySport, findFilterSport);
  const gameSport = parseGameSport(game.sport);
  const playersPerMatch = playersPerMatchOf(game);
  const hasGameSportTags =
    showSportTag ||
    (game.entityType !== 'TRAINING' && matchFormatSummaryPart(t, playersPerMatch, game.sport) != null);
  const gameSportTags = useMemo(() => {
    if (!hasGameSportTags) return null;
    return (
      <GameSportTagRow
        sport={gameSport}
        showSport={showSportTag}
        playersPerMatch={playersPerMatch}
        showMatchFormat={game.entityType !== 'TRAINING'}
        className="shrink-0"
      />
    );
  }, [hasGameSportTags, gameSport, showSportTag, playersPerMatch, game.entityType]);

  const isJoinButtonVisible =
    showJoinButton &&
    onJoin &&
    game.status !== 'ARCHIVED' &&
    game.status !== 'FINISHED' &&
    game.resultsStatus === 'NONE' &&
    game.entityType !== 'LEAGUE' &&
    !isParticipant &&
    !hasMyInvites &&
    !isInJoinQueue;

  const hasVisibleTitle = gameCardHasVisibleTitle(game);
  const showNoteBookmark = !userNoteDisplay && Boolean(effectiveUser);
  const showPlayersCarousel = !isLeagueSeasonGame || Boolean(mainPhotoUrl);
  const carouselAutoHideNames = effectiveUser?.alwaysShowUserNames === false;

  const hasTagRow =
    hasGameSportTags ||
    myParticipationBadge != null ||
    !game.isPublic ||
    (game.genderTeams != null && game.genderTeams !== 'ANY') ||
    !game.affectsRating ||
    game.hasFixedTeams ||
    ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
      game.resultsStatus === 'FINAL');

  return (
    <SportLevelProvider sport={gameSport}>
      <Card
        className={`group hover:shadow-lg hover:-translate-y-0.5 hover:scale-[1.01]
          active:scale-[0.99] transition-all duration-300 ease-out will-change-transform
          cursor-pointer relative ${isJoinButtonVisible ? 'pb-2' : 'pb-0'} overflow-visible ${getGameCardEntityGradientClasses(game.entityType)}`}
        onClick={handleCardClick}
      >
        <span className="pointer-events-none absolute inset-0 z-0 overflow-hidden rounded-xl" aria-hidden>
          <span className="absolute inset-y-0 left-0 w-1/2 -skew-x-12 bg-gradient-to-r from-transparent via-white/25 dark:via-white/[0.06] to-transparent -translate-x-[150%] group-hover:translate-x-[350%] transition-transform duration-700 ease-out" />
        </span>

        {/* Two-column region: main info left, action rail + photo right */}
        <div className="relative z-10 flex items-stretch gap-2">
          <div className="min-w-0 flex-1">
            {isDifferentCity && game.city?.name && (
              <div className="mb-2 inline-flex items-center gap-1.5 rounded-lg border border-yellow-300 bg-gradient-to-r from-yellow-50 to-amber-50 px-1.5 py-0.5 shadow-[0_0_8px_rgba(234,179,8,0.4)] dark:border-yellow-700 dark:from-yellow-900/30 dark:to-amber-900/30 dark:shadow-[0_0_8px_rgba(234,179,8,0.5)]">
                <Plane size={12} className="flex-shrink-0 text-yellow-600 drop-shadow-[0_0_2px_rgba(234,179,8,0.8)] dark:text-yellow-400" />
                <span className="whitespace-nowrap text-xs font-medium text-yellow-700 drop-shadow-[0_0_1px_rgba(234,179,8,0.6)] dark:text-yellow-300">
                  {translateCity(game.city.id, game.city.name, game.city.country)}
                </span>
              </div>
            )}

            {/* Title row: fire + entity icon + title + status.
                Skipped entirely for unnamed games — its icons then join the tag row. */}
            {hasVisibleTitle && (
              <div className="flex items-start gap-2">
                {showFireIcon && (
                  <span className="flex h-6 shrink-0 items-center">
                    <AnnouncedFireIcon />
                  </span>
                )}
                {game.entityType !== 'GAME' && <GameCardEntityIcon entityType={game.entityType} />}
                <h3 className="min-w-0 flex-1 text-sm font-semibold leading-6 text-gray-900 dark:text-white">
                  <GameCardTitle game={game} />
                </h3>
                {showStatusIcon && (
                  <span className="flex h-6 shrink-0 items-center">
                    <GameStatusIcon status={game.status} />
                  </span>
                )}
              </div>
            )}

            {/* Unified tag row */}
            {(hasTagRow || (!hasVisibleTitle && (showFireIcon || showStatusIcon))) && (
              <div className={`flex flex-wrap items-center gap-1.5 ${hasVisibleTitle ? 'mt-1.5' : ''}`}>
                {!hasVisibleTitle && showFireIcon && (
                  <span className="flex h-6 shrink-0 items-center">
                    <AnnouncedFireIcon />
                  </span>
                )}
                {!hasVisibleTitle && showStatusIcon && (
                  <span className="flex h-6 shrink-0 items-center">
                    <GameStatusIcon status={game.status} />
                  </span>
                )}
                <GameCardHeaderTags
                  game={game}
                  sportTags={gameSportTags}
                  myParticipationBadge={myParticipationBadge}
                />
              </div>
            )}

            <GameCardUserNote
              note={userNoteDisplay && effectiveUser ? userNoteDisplay : null}
              showQueueHint={showJoinQueueHint}
              onOpenNote={openNoteModal}
            />

            {trainerParticipant ? (
              <GameCardTrainerBadge trainer={trainerParticipant} className="mt-2" />
            ) : null}
            {!isLeagueSeasonGame && (
              <GameCardInfoRows
                game={game}
                dayLabel={infoDayLabel}
                timeText={infoTimeText}
                hintText={infoHintText}
                timezone={clubTz}
                locale={displaySettings.locale}
                playingCount={playingParticipants.length}
                className="mt-2"
              />
            )}
          </div>

          <GameCardRightRail
            entityType={game.entityType}
            gameId={gameId}
            reactions={reactions}
            onReactionsChange={setReactions}
            currentUserId={effectiveUser?.id}
            weatherSummary={railWeatherSummary}
            onWeatherClick={handleWeatherClick}
            locale={displaySettings.locale}
            showBookedTag={showConfirmedCourtBadge}
            linkedExternalBooking={linkedExternalBooking}
            showNoteBookmark={showNoteBookmark}
            onNoteClick={openNoteModal}
            showChat={showChatIndicator}
            unreadCount={displayUnread}
            onChatClick={handleChatClick}
          />
        </div>

        {/* Full-width bottom region: players + join CTA */}
        <div className="relative z-10 pb-2 pt-1">
          {showPlayersCarousel && (
            <div
              className={`space-y-1.5 text-sm text-gray-600 dark:text-gray-400 ${
                !isLeagueSeasonGame &&
                game.entityType === 'TRAINING' &&
                playingParticipants.length >= 1
                  ? 'mt-1.5 border-t border-gray-200 pt-1.5 dark:border-gray-700'
                  : ''
              }`}
            >
              <div className="flex items-start gap-2.5">
                {mainPhotoUrl ? <GameCardPlayersPhoto url={mainPhotoUrl} /> : null}
                {!isLeagueSeasonGame ? (
                  <div className="relative min-w-0 flex-1">
                    <PlayersCarousel
                      participants={playingParticipants}
                      userId={effectiveUser?.id}
                      shouldShowCrowns={true}
                      autoHideNames={carouselAutoHideNames}
                      placeByUserId={standingPlaceByUserId}
                      standingMedalMode={standingMedalMode}
                    />
                  </div>
                ) : null}
              </div>
            </div>
          )}

          {isJoinButtonVisible && (
            <GameCardJoinButton gameId={game.id} hasFreeSlots={hasUnoccupiedSlots} onJoin={onJoin} />
          )}
        </div>
      </Card>
      {showNoteModal && effectiveUser && (
        <UserGameNoteModal
          isOpen={showNoteModal}
          onClose={closeNoteModal}
          gameId={game.id}
          initialContent={userNoteDisplay}
          onSaved={handleNoteSaved}
        />
      )}
      {weatherSummary ? (
        <GameWeatherDialog
          game={game}
          open={showWeatherModal}
          onClose={handleCloseWeatherModal}
          locale={displaySettings.locale}
          hour12={displaySettings.hour12}
        />
      ) : null}
    </SportLevelProvider>
  );
}, gameCardPropsEqual);
