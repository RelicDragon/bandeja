import { showsPremiumStatus } from '@/utils/premiumIdentity';
import { useState, useRef, useEffect, useCallback, useMemo, memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AnnouncedFireIcon } from '@/components/AnnouncedFireIcon';
import { PlayersCarousel } from '@/components/GameDetails/PlayersCarousel';
import { GameCardReactions } from '@/components/GameCardReactions';
import { UnreadBadge } from '@/components';
import { SportPublicIcon } from '@/components/sport/SportPublicIcon';
import { GameCardTrainerBadge } from '@/components/gameCard/GameCardTrainerBadge';
import { GameCardHeaderTags } from '@/components/gameCard/GameCardHeaderTags';
import { GameCardTitle } from '@/components/gameCard/GameCardTitle';
import { GameCardStub } from '@/components/gameCard/GameCardStub';
import { GameCardTagRow } from '@/components/gameCard/GameCardTagRow';
import { GameCardSeatStack } from '@/components/gameCard/GameCardSeatStack';
import { GameCardAvatar } from '@/components/gameCard/GameCardAvatar';
import { gameCardAvatarUrl } from '@/utils/gameCardAvatarUrl';
import { GameCardPerHeadPrice } from '@/components/gameCard/GameCardPerHeadPrice';
import { gameCardHasVisibleTitle } from '@/utils/gameCardVisibleTitle';
import { hasOpenSpotHighlight } from '@/features/spot-opened/spotOpenedWindow';
import {
  buildAttendanceRailData,
  type AttendanceRailData,
} from '@/features/attendance/attendanceRailData';
import { formatFraction } from '@/features/attendance/attendanceVisuals';
import { GameCardPlayersPhoto } from '@/components/gameCard/GameCardPlayersPhoto';
import { gameIsNonRating, gameShowsLevelBand } from '@/utils/gameRatingSemantics';
import { GameCardUserNote } from '@/components/gameCard/GameCardUserNote';
import { GameCardJoinButton } from '@/components/gameCard/GameCardJoinButton';
import { computeSeatInfo } from '@/components/gameCard/gameCardSeatInfo';
import { SEATS_LEFT_THRESHOLD } from '@/components/gameCard/gameCardJoinLabel';
import { EventPosterCard } from '@/components/home/EventPosterCard';
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
import { getGameCardTicketTheme } from '@/utils/gameCardEntityTheme';
import { useTranslatedGeo } from '@/hooks/useTranslatedGeo';
import { playersPerMatchOf } from '@/utils/matchFormat';
import { matchFormatSummaryPart } from '@/utils/gameFormat';
import { shouldShowGameCardSportGlyph, getViewerPrimarySport } from '@/utils/findSportFilter';
import { parseGameSport } from '@/utils/gameSport';
import { getSportConfig } from '@/sport/sportRegistry';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import type { FindSportFilterValue } from '@/utils/gameFiltersStorage';
import {
  gameShowsCourtReservation,
  reservationTimeFormatter,
  selectCourtReservationView,
} from '@/utils/courtReservationView';
import { ReservationSummaryPill } from '@/components/GameDetails/ReservationSummaryPill';
import { eventVenueLabel } from '@/utils/eventListingDisplay';
import { getGameMainPhotoId } from '@/utils/gameMainPhoto';
import { canViewGamePhotos } from '@shared/gamePhotos/permissions';
import { canMutateGameRoster } from '@shared/gameMutationLock';
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
import { Bookmark, CheckCircle2, ChevronDown, MapPin, MessageCircle, Plane, Users } from 'lucide-react';
import { AnimatePresence, motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { isGameSeriesEnabled } from '@/config/featureFlags';
import { shouldShowWeatherPill } from '@/features/weather-alerts/weatherRiskDisplay';
import '@/components/gameCard/GameCardTicket.css';
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

const stopPress = (e: React.SyntheticEvent) => e.stopPropagation();

/**
 * "Match ticket" card. The tinted stub answers *when*, the body *what & where*,
 * the footer *who & can I get in*. Entity colour lives in the stub only.
 */
const GameCardMatch = memo(function GameCardMatch({
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
  const { t, i18n } = useTranslation();
  const { translateCity } = useTranslatedGeo();
  const navigate = useNavigate();
  const authUser = useAuthStore((state) => state.user);
  const effectiveUser = user || authUser;
  const [showNoteModal, setShowNoteModal] = useState(false);
  const [showWeatherModal, setShowWeatherModal] = useState(false);
  const [reactions, setReactions] = useState(() => game.reactions ?? []);
  /** AUTO roster mode: this card's own compact ↔ full toggle. */
  const [rosterExpanded, setRosterExpanded] = useState(false);
  const reducedMotion = usePrefersReducedMotion();
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

  /**
   * PRD 346 — the attendance glance. `game.attendanceSummary` is enriched only
   * for the viewer's own games, so a `null` here means "show nothing", never an
   * error state. Purely informative: it cannot change the card's appearance
   * beyond the dots and the fraction.
   */
  const attendanceRail = useMemo<AttendanceRailData | null>(
    () => buildAttendanceRailData(game.attendanceSummary, playingParticipants),
    [game.attendanceSummary, playingParticipants],
  );

  const participation = getGameParticipationState(participants, effectiveUser?.id, game);
  const isParticipant = participation.isPlaying;
  const myParticipationBadge = getGameCardMyParticipationBadge(participants, effectiveUser?.id);
  const isLeagueSeasonGame = game.entityType === 'LEAGUE_SEASON';
  const isBar = game.entityType === 'BAR';
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
  const ownerShowsPremiumStatus = showsPremiumStatus(owner?.user);
  const showFireIcon =
    ownerShowsPremiumStatus &&
    game.status === 'ANNOUNCED' &&
    ((['GAME', 'TOURNAMENT', 'TRAINING', 'LEAGUE_SEASON'].includes(game.entityType) && hasUnoccupiedSlots) ||
      game.entityType === 'BAR' ||
      game.entityType === 'EVENT');
  const hasMyInvites = participation.hasPendingInvite;
  const isInJoinQueue = participation.isInJoinQueue;

  /**
   * PRD 359 — seats left and the viewer's queue place, both read off the
   * roster the card already has. `null` values render nothing, so an entity
   * without seats (EVENT, BAR) and a payload that cannot be ordered both fall
   * back to today's labels.
   */
  const viewerId = effectiveUser?.id as string | undefined;
  const viewerGender = effectiveUser?.gender as string | null | undefined;
  const seatInfo = useMemo(
    () =>
      computeSeatInfo(
        game,
        game.participants,
        viewerId ? { id: viewerId, gender: viewerGender ?? null } : null,
      ),
    [game, viewerId, viewerGender],
  );

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

  const timeDisplayFor = (startTime: string, kind: 'time' | 'timeRange') =>
    getGameTimeDisplay({
      game,
      displaySettings,
      startTime,
      endTime: game.entityType !== 'BAR' && game.entityType !== 'EVENT' ? game.endTime : undefined,
      kind,
      t,
    });
  const timeNotSet = game.timeIsSet === false;
  const startDisplay = timeDisplayFor(game.startTime, 'time');
  const rangeDisplay = timeDisplayFor(game.startTime, 'timeRange');
  const showEndTime = !isBar && game.entityType !== 'EVENT' && Boolean(game.endTime);
  const endText = showEndTime && game.endTime ? timeDisplayFor(game.endTime, 'time').primaryText : null;
  const timeHintText = startDisplay.hintText || rangeDisplay.hintText;
  const dayLabel = !timeNotSet
    ? getRelativeDayLabel(game.startTime, clubTz ?? getUserTimezone(), t)
    : null;

  // Card shows reservation only when something is reserved; "Planned" is the
  // default state of every game and would be noise on a list of cards.
  const courtReservation = gameShowsCourtReservation(game) ? selectCourtReservationView(game) : null;
  const showCourtReservation = courtReservation != null && courtReservation.summary.kind !== 'planned';

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
  const stubWeatherSummary = !isLeagueSeasonGame && !timeNotSet ? weatherSummary : null;

  const handleCardClick = useCallback(() => {
    if (onClick) {
      onClick();
    } else {
      navigate(`/games/${gameId}`);
    }
  }, [gameId, navigate, onClick]);

  const openNoteModal = useCallback(() => setShowNoteModal(true), []);
  const closeNoteModal = useCallback(() => setShowNoteModal(false), []);
  const handleRosterToggle = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setRosterExpanded((open) => !open);
  }, []);

  const handleNoteButtonClick = useCallback((e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    e.preventDefault();
    setShowNoteModal(true);
  }, []);

  const viewerPrimarySport = getViewerPrimarySport(effectiveUser);
  const showSportTag = shouldShowGameCardSportGlyph(game.sport, viewerPrimarySport, findFilterSport);
  const gameSport = parseGameSport(game.sport);
  const playersPerMatch = playersPerMatchOf(game);
  const matchFormatLabel =
    game.entityType !== 'TRAINING' && game.entityType !== 'EVENT'
      ? matchFormatSummaryPart(t, playersPerMatch, game.sport)
      : null;

  const isJoinButtonVisible =
    showJoinButton &&
    onJoin &&
    canMutateGameRoster(game) &&
    game.entityType !== 'LEAGUE' &&
    game.entityType !== 'EVENT' &&
    !isParticipant &&
    !hasMyInvites &&
    !isInJoinQueue;

  const hasVisibleTitle = gameCardHasVisibleTitle(game, i18n.language);
  // PRD 347 — drives both the tag row and the join button's one-shot shimmer.
  const spotJustOpened = hasOpenSpotHighlight(game);
  const showNoteBookmark = !userNoteDisplay && Boolean(effectiveUser);
  const showReactions = Boolean(effectiveUser?.id) || reactions.length > 0;
  const rosterMode = effectiveUser?.gameCardRosterMode ?? 'AUTO';
  const showFullRoster = rosterMode === 'FULL';
  // AUTO starts compact; a toggle after the seats expands this card's roster in place.
  const canExpandRoster = rosterMode === 'AUTO' && playingParticipants.length > 0;
  const rosterOpen = canExpandRoster && rosterExpanded;
  const carouselAutoHideNames = effectiveUser?.alwaysShowUserNames === false;

  const theme = getGameCardTicketTheme(game.entityType);
  const venueLabel = eventVenueLabel(game);
  const avatarUrl = gameCardAvatarUrl(game);
  // An unnamed classic game has no title of its own; the venue reads as one.
  const titleIsVenue = !hasVisibleTitle && Boolean(venueLabel);
  const venueLine = titleIsVenue ? game.court?.name ?? null : venueLabel;
  const showLevel = !isBar && gameShowsLevelBand(game);
  const hasMetaLine = showLevel || Boolean(game.perHeadPrice) || showCourtReservation;

  const hasTagRow =
    // PRD 345 — the `↻ Weekly` pill is on its own enough to need the row.
    (Boolean(game.seriesLabel) && isGameSeriesEnabled()) ||
    myParticipationBadge != null ||
    // PRD 347 — the "Spot opened" pill can be the only tag on the card.
    spotJustOpened ||
    !game.isPublic ||
    (game.genderTeams != null && game.genderTeams !== 'ANY') ||
    game.suitableForNovices ||
    gameIsNonRating(game) ||
    game.hasFixedTeams ||
    // PRD 357 — the rain / wind pill is on its own enough to need the row.
    shouldShowWeatherPill(game.weatherRisk) ||
    ((game.status === 'STARTED' || game.status === 'FINISHED' || game.status === 'ARCHIVED') &&
      game.resultsStatus === 'FINAL');

  /* ---- footer caption: "3/4 · 1 left", "4/4 · Full · 2 waiting", "✓ 3/4" */
  const playingCount = playingParticipants.length;
  const maxParticipants = game.maxParticipants ?? null;
  const seatsLeft = maxParticipants ? Math.max(0, maxParticipants - playingCount) : null;
  const seatCaption = isBar ? (
    <span className="inline-flex items-center gap-1">
      <Users size={13} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
      <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">{playingCount}</span>
    </span>
  ) : (
    <>
      <span className="font-semibold tabular-nums text-gray-800 dark:text-gray-200">
        {playingCount}
        {maxParticipants ? `/${maxParticipants}` : ''}
      </span>
      {/* PRD 359 — the count only when it changes a decision (scarce seats). */}
      {seatsLeft != null && seatsLeft > 0 && seatsLeft <= SEATS_LEFT_THRESHOLD ? (
        <>
          <span className="text-gray-300 dark:text-gray-600"> · </span>
          <span className={seatsLeft === 1 ? 'font-medium text-orange-600 dark:text-orange-400' : ''}>
            {t('games.joinSeatsLeftShort', { count: seatsLeft })}
          </span>
        </>
      ) : null}
      {seatsLeft === 0 ? (
        <>
          <span className="text-gray-300 dark:text-gray-600"> · </span>
          {/* "4/4" already says full; a queue is the more useful fact. */}
          {seatInfo.queueLength > 0
            ? t('games.joinQueueWaiting', { count: seatInfo.queueLength })
            : t('games.card.full')}
        </>
      ) : null}
    </>
  );
  const attendanceCaption =
    attendanceRail && attendanceRail.playingCount > 0 ? (
      <span
        className="inline-flex items-center gap-0.5"
        role="img"
        aria-label={t('attendance.card.ariaSummary', {
          confirmed: attendanceRail.confirmedCount,
          total: attendanceRail.playingCount,
        })}
      >
        <CheckCircle2 size={12} className="shrink-0 text-emerald-500" aria-hidden />
        <span className="font-medium tabular-nums text-gray-700 dark:text-gray-300" aria-hidden>
          {formatFraction(attendanceRail.confirmedCount, attendanceRail.playingCount, displaySettings.locale)}
        </span>
      </span>
    ) : null;
  const caption = (
    <span className="flex min-w-0 flex-1 items-center gap-2 text-[12px] text-gray-500 dark:text-gray-400">
      <span className="truncate">{seatCaption}</span>
      {attendanceCaption}
    </span>
  );

  const showNoteChat = showNoteBookmark || showChatIndicator;
  const toolbarButton =
    'relative flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-white hover:text-gray-800 dark:text-gray-400 dark:hover:bg-white/10 dark:hover:text-gray-100';
  /** Note + chat, drawn inside the one quiet toolbar pill in the top corner. */
  const noteChatButtons = showNoteChat ? (
    <>
      {showNoteBookmark ? (
        <button
          type="button"
          onClick={handleNoteButtonClick}
          onPointerDown={stopPress}
          onMouseDown={stopPress}
          className={toolbarButton}
          title={t('userGameNotes.placeholder')}
          aria-label={t('userGameNotes.placeholder')}
        >
          <Bookmark size={14} />
        </button>
      ) : null}
      {showChatIndicator ? (
        <button
          type="button"
          onClick={handleChatClick}
          onPointerDown={stopPress}
          onMouseDown={stopPress}
          className={toolbarButton}
          aria-label={t('games.card.openChat')}
        >
          <MessageCircle size={15} />
          <UnreadBadge count={displayUnread} className="absolute -right-1 -top-1" />
        </button>
      ) : null}
    </>
  ) : null;
  const toolbar = showReactions ? (
    <GameCardReactions
      entityType={game.entityType}
      gameId={gameId}
      reactions={reactions}
      currentUserId={effectiveUser?.id}
      onReactionsChange={setReactions}
      pickerOpens="below"
      bare
      trailing={noteChatButtons}
      className="-me-1"
    />
  ) : noteChatButtons ? (
    <div className="-me-1 flex h-8 shrink-0 items-center rounded-full bg-gray-900/[0.04] p-0.5 dark:bg-white/[0.06]">
      {noteChatButtons}
    </div>
  ) : null;
  /** The footer's end belongs to the one call to action, when there is one. */
  const footerActions = isJoinButtonVisible ? (
    <GameCardJoinButton
      gameId={game.id}
      hasFreeSlots={hasUnoccupiedSlots}
      onJoin={onJoin}
      spotJustOpened={spotJustOpened}
      openSeats={seatInfo.openSeats}
      queueLength={seatInfo.queueLength}
      variant="pill"
    />
  ) : null;

  let footer: React.ReactNode = null;
  if (isLeagueSeasonGame) {
    footer = mainPhotoUrl ? (
      <div className="flex items-center gap-2.5 border-t border-gray-900/[0.06] px-3.5 py-2.5 dark:border-white/[0.06]">
        <GameCardPlayersPhoto url={mainPhotoUrl} />
        <span className="flex-1" />
        {footerActions}
      </div>
    ) : null;
  } else if (showFullRoster) {
    footer = (
      <div className="border-t border-gray-900/[0.06] dark:border-white/[0.06]">
        <div className="-mb-2 flex items-start gap-2 px-2.5 pt-1.5">
          {mainPhotoUrl ? <GameCardPlayersPhoto url={mainPhotoUrl} className="mt-2.5 size-12" /> : null}
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
        </div>
        <div className="flex items-center gap-2.5 px-3.5 pb-2.5">
          {caption}
          {footerActions}
        </div>
      </div>
    );
  } else {
    const rosterTransition = reducedMotion
      ? { duration: 0 }
      : { type: 'spring' as const, stiffness: 420, damping: 38, mass: 0.8 };
    footer = (
      <div className="border-t border-gray-900/[0.06] dark:border-white/[0.06]">
        <AnimatePresence initial={false}>
          {rosterOpen ? (
            <motion.div
              key="full-roster"
              initial={{ height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={{ height: 0, opacity: 0 }}
              transition={rosterTransition}
              className="overflow-hidden"
            >
              <div className="-mb-2 px-2.5 pt-1.5">
                <PlayersCarousel
                  participants={playingParticipants}
                  userId={effectiveUser?.id}
                  shouldShowCrowns={true}
                  autoHideNames={carouselAutoHideNames}
                  placeByUserId={standingPlaceByUserId}
                  standingMedalMode={standingMedalMode}
                />
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
        <div className="flex items-center gap-2.5 px-3.5 py-2.5">
          {mainPhotoUrl ? <GameCardPlayersPhoto url={mainPhotoUrl} /> : null}
          <AnimatePresence initial={false}>
            {rosterOpen ? null : (
              <motion.div
                key="seat-stack"
                initial={{ opacity: 0, scale: 0.9 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.9, transition: { duration: reducedMotion ? 0 : 0.12 } }}
                transition={rosterTransition}
                className="flex shrink-0 origin-left rtl:origin-right"
              >
                <GameCardSeatStack
                  participants={playingParticipants}
                  maxParticipants={isBar ? null : maxParticipants}
                  viewerId={viewerId}
                  placeByUserId={standingPlaceByUserId}
                  standingMedalMode={standingMedalMode}
                  attendanceRail={attendanceRail}
                />
              </motion.div>
            )}
          </AnimatePresence>
          {canExpandRoster ? (
            <button
              type="button"
              onClick={handleRosterToggle}
              onPointerDown={stopPress}
              onMouseDown={stopPress}
              aria-expanded={rosterOpen}
              aria-label={t(rosterOpen ? 'games.card.showCompactRoster' : 'games.card.showFullRoster')}
              title={t(rosterOpen ? 'games.card.showCompactRoster' : 'games.card.showFullRoster')}
              className="-ms-1 flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gray-900/[0.04] text-gray-500 transition-colors hover:bg-gray-900/[0.08] hover:text-gray-800 dark:bg-white/[0.06] dark:text-gray-400 dark:hover:bg-white/[0.1] dark:hover:text-gray-100"
            >
              <ChevronDown
                size={15}
                strokeWidth={2.25}
                className={`transition-transform duration-300 ease-out motion-reduce:transition-none ${rosterOpen ? 'rotate-180' : ''}`}
                aria-hidden
              />
            </button>
          ) : null}
          {caption}
          {footerActions}
        </div>
      </div>
    );
  }

  return (
    <SportLevelProvider sport={gameSport}>
      <div className="gc-ticket-wrap group relative cursor-pointer" onClick={handleCardClick}>
        <div className="gc-ticket overflow-hidden rounded-[20px] bg-white dark:bg-gray-900">
          <div className="flex items-stretch">
            <GameCardStub
              theme={theme}
              status={game.status}
              startTime={game.startTime}
              startText={isLeagueSeasonGame ? null : startDisplay.primaryText}
              endText={endText}
              dayLabel={dayLabel}
              timeNotSet={timeNotSet}
              isLeagueSeason={isLeagueSeasonGame}
              timezone={clubTz}
              locale={displaySettings.locale}
              weatherSummary={stubWeatherSummary}
              onWeatherClick={handleWeatherClick}
            />
            <div className={`gc-perf my-2 shrink-0 ${theme.perf}`} aria-hidden />

            <div className="@container/gcbody min-w-0 flex-1 pb-3 pe-3 ps-3.5 pt-2.5">
              {/* Eyebrow: fire / entity · sport · format, reactions at the end */}
              <div className="flex min-h-[28px] items-center gap-1.5">
                <div className="flex min-w-0 flex-1 items-center gap-1.5 text-[10.5px] font-semibold uppercase leading-none tracking-[0.08em] text-gray-500 dark:text-gray-400">
                  {showFireIcon ? (
                    <AnnouncedFireIcon className="!-mt-0.5 !h-4 !w-4 shrink-0 [&>canvas]:!max-h-4 [&>canvas]:!max-w-4" />
                  ) : (
                    <span
                      className={`h-1.5 w-1.5 shrink-0 rounded-full ${theme.dot} ${
                        avatarUrl ? 'hidden @min-[11rem]/gcbody:block' : ''
                      }`}
                      aria-hidden
                    />
                  )}
                  {/* Below an 11rem body (320 pt phones) the title cannot spare the tile's width: the avatar shrinks into the eyebrow. */}
                  {avatarUrl ? (
                    <GameCardAvatar url={avatarUrl} variant="chip" className="@min-[11rem]/gcbody:hidden" />
                  ) : null}
                  <span className={`shrink-0 ${theme.ink}`}>{t(`games.entityTypes.${game.entityType}`)}</span>
                  {showSportTag ? (
                    <>
                      <span className="text-gray-300 dark:text-gray-600" aria-hidden>/</span>
                      <span className="flex min-w-0 items-center gap-1">
                        <SportPublicIcon sport={gameSport} className="h-3 w-3 shrink-0 object-contain" />
                        <span className="truncate">{t(getSportConfig(gameSport).labelKey)}</span>
                      </span>
                    </>
                  ) : null}
                  {matchFormatLabel ? (
                    <>
                      <span className="text-gray-300 dark:text-gray-600" aria-hidden>/</span>
                      <span className="truncate">{matchFormatLabel}</span>
                    </>
                  ) : null}
                </div>
                {toolbar}
              </div>

              <div className="mt-1 flex min-w-0 items-start gap-2.5">
                {avatarUrl ? <GameCardAvatar url={avatarUrl} className="hidden @min-[11rem]/gcbody:block" /> : null}
                <div className="min-w-0 flex-1">
                  <h3 className="line-clamp-2 text-[15.5px] font-semibold leading-[1.3] tracking-[-0.01em] text-gray-900 dark:text-white">
                    {hasVisibleTitle ? (
                      <GameCardTitle game={game} />
                    ) : (
                      venueLabel ?? t(`games.entityTypes.${game.entityType}`)
                    )}
                  </h3>

                  {(venueLine || (isDifferentCity && game.city?.name)) && (
                    <p className="mt-1 flex min-w-0 items-center gap-1 text-[12.5px] text-gray-500 dark:text-gray-400">
                      {isDifferentCity && game.city?.name ? (
                        <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-amber-400/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-amber-700 dark:text-amber-300">
                          <Plane size={10} className="shrink-0" aria-hidden />
                          {translateCity(game.city.id, game.city.name, game.city.country)}
                        </span>
                      ) : null}
                      {venueLine ? (
                        <>
                          <MapPin size={12} className="shrink-0 text-gray-400 dark:text-gray-500" aria-hidden />
                          <span className="truncate">
                            {venueLine}
                            {!titleIsVenue && game.court?.name ? (
                              <>
                                <span className="text-gray-300 dark:text-gray-600"> · </span>
                                {game.court.name}
                              </>
                            ) : null}
                          </span>
                        </>
                      ) : null}
                    </p>
                  )}
                </div>
              </div>

              {timeHintText ? (
                <p className="mt-0.5 flex items-center gap-1 text-[11.5px] text-gray-500 dark:text-gray-400">
                  <Plane size={11} className="shrink-0" aria-hidden />
                  <span className="truncate">{timeHintText}</span>
                </p>
              ) : null}

              {hasMetaLine ? (
                <div className="mt-0.5 flex flex-wrap items-center gap-x-2.5 text-[12px] text-gray-500 dark:text-gray-400">
                  {showLevel ? (
                    <span className="inline-flex min-h-[1.75rem] items-center gap-1">
                      <span>{t('games.level')}</span>
                      <span className="font-semibold tabular-nums text-gray-700 dark:text-gray-300">
                        {(game.minLevel as number).toFixed(1)}–{(game.maxLevel as number).toFixed(1)}
                      </span>
                    </span>
                  ) : null}
                  {/* PRD 348 — per-head share; hidden when the price is unknown or zero. */}
                  {game.perHeadPrice ? <GameCardPerHeadPrice perHeadPrice={game.perHeadPrice} /> : null}
                  {showCourtReservation && courtReservation ? (
                    <ReservationSummaryPill
                      view={courtReservation}
                      variant="inline"
                      formatTime={reservationTimeFormatter(clubTz, displaySettings)}
                    />
                  ) : null}
                </div>
              ) : null}

              {trainerParticipant ? <GameCardTrainerBadge trainer={trainerParticipant} className="mt-1.5" /> : null}

              <GameCardUserNote
                note={userNoteDisplay && effectiveUser ? userNoteDisplay : null}
                showQueueHint={showJoinQueueHint}
                onOpenNote={openNoteModal}
              />

              {hasTagRow ? (
                <GameCardTagRow className="mt-2">
                  <GameCardHeaderTags
                    game={game}
                    sportTags={null}
                    myParticipationBadge={myParticipationBadge}
                    hour12={displaySettings.hour12}
                    queuePosition={seatInfo.viewerQueuePosition}
                  />
                </GameCardTagRow>
              ) : null}
            </div>
          </div>

          {footer}
        </div>
      </div>
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

export const GameCard = memo(function GameCard(props: GameCardProps) {
  if (props.game.entityType === 'EVENT') {
    return <EventPosterCard game={props.game} variant="list" onClick={props.onClick} />;
  }
  return <GameCardMatch {...props} />;
}, gameCardPropsEqual);
