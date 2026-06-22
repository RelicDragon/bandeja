import { useState, useEffect, useMemo, useRef, useCallback, createRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, PlayerListModal, PlayerCardBottomSheet, CreateGameHeader, ParticipantsSection, ParticipantsSetupSection, GameSettingsSection, GameNameCommentsSection, GameStartSection, GameFormatCard, GameFormatWizard, AvatarUpload, PriceSection, CreateGameIntentPicker } from '@/components';
import { CreateGameCourtSection } from '@/components/createGame/CreateGameCourtSection';
import { CreateGameDateSection } from '@/components/createGame/CreateGameDateSection';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { usePlayersStore } from '@/store/playersStore';
import { useShellNavStore } from '@/store/shellNavStore';
import { clubsApi, courtsApi, gamesApi, invitesApi } from '@/api';
import { mediaApi } from '@/api/media';
import { Club, Court, EntityType, GenderTeam, PriceType, PriceCurrency, Game, BasicUser } from '@/types';
import { addHours, format, startOfDay } from 'date-fns';
import { useGameFormat } from '@/hooks/useGameFormat';
import { useClampGameFormatToSport } from '@/hooks/useSportGameFormatLimits';
import { resolveUserCurrency } from '@/utils/currency';
import { useGameTimeDuration, formatTimeInClubTimezone, createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';
import { GameLocationTimePanel } from '@/components/gameLocationTime/GameLocationTimePanel';
import type { LocationTimeMode } from '@/components/gameLocationTime/LocationTimeMode';
import type { CreateGameBookingOverrides } from '@/hooks/createGameBookingFlow';
import { useCreateGameBookingFlow } from '@/hooks/createGameBookingFlow';
import { BooktimeConnectInline } from '@/components/booktime/BooktimeConnectInline';
import { BooktimeCreateGameConfirmModal } from '@/components/createGame/BooktimeCreateGameConfirmModal';
import {
  CreateGameProgressOverlay,
  type CreateGameProgressPhase,
} from '@/components/createGame/CreateGameProgressOverlay';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { syncRosterOnSportChange, syncPlayersPerMatchOnRosterChange } from '@/utils/matchFormat';
import { gameLeagueRosterOptions, maxSlotsForUserGameOrLeague, maxSlotsForUserTournament } from '@/utils/userMaxParticipantsInGame';
import { ConfirmationModal } from '@/components/ConfirmationModal';
import { MarkCourtBookedModal } from '@/components/createGame/MarkCourtBookedModal';
import { CreateFlowSportSelector } from '@/components/createGame/CreateFlowSportSelector';
import toast from 'react-hot-toast';
import { getSportConfig } from '@/sport/sportRegistry';
import {
  getDisplayLevelForSport,
  hasMultipleSportsEnabled,
  listCreateFlowSports,
  resolveCreateGameDefaultSport,
} from '@/utils/profileSports';
import { useQuestionnaireStatus } from '@/hooks/useQuestionnaireStatus';
import { shouldWarnCreateGameLevelBand } from '@/utils/sportQuestionnaire';
import { computeMaxSelectableCourts } from '@/utils/requiredCourtCount';
import { clubSupportsSport, filterClubsBySport } from '@/utils/courtSport';
import { invalidateBooktimeAllUpcomingCache } from '@/integrations/booktime/booktimeAllUpcomingLoader';
import { CreateGameQuestionnaireBanner } from '@/components/sportQuestionnaire';
import { GameFormatGenderFields } from '@/components/gameFormat/GameFormatTeamsFields';
import { gameFormatGenderVisible } from '@/components/gameFormat/gameFormatTeamsVisibility';
import type { CreateTemplateDurationContext } from '@/components/createGame/createTemplateDurationLabels';
import { Sports, type Sport } from '@shared/sport';
import { SportLevelProvider } from '@/contexts/SportLevelContext';
import { SOCIAL_LEVEL_BAND, type CreateFlowIntent, type CreateTemplateId } from '@/sport/createFlow';
import type { CreateTemplateParticipantContext } from '@/sport/createTemplateParticipantFit';
import { useGameFormatTemplateFlow } from '@/hooks/useGameFormatTemplateFlow';
import { showGameFormatTemplatePicker } from '@/utils/gameFormat/showGameFormatTemplatePicker';
import { CreateGameClubSection } from '@/components/createGame/CreateGameClubSection';
import { CreateGameSummaryBar } from '@/components/createGame/summaryHeader/CreateGameSummaryBar';
import { useScrolledPastSections } from '@/components/createGame/summaryHeader/useScrolledPastSections';
import { useCreateGameSummaryChips } from '@/components/createGame/summaryHeader/useCreateGameSummaryChips';

interface CreateGameProps {
  entityType: EntityType;
  initialGameData?: Partial<Game>;
  initialCreateIntent?: CreateFlowIntent;
  initialTemplateId?: CreateTemplateId;
  initialLocationTimeMode?: LocationTimeMode;
  initialBookingIds?: string[];
}

const getDefaultLevelRange = (level?: number): [number, number] => {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return [1.0, 7.0];
  }

  const minLevel = Math.max(1.0, Math.min(7.0, level - 0.7));
  const maxLevel = Math.max(1.0, Math.min(7.0, level + 0.7));
  return [minLevel, maxLevel];
};

export const CreateGame = ({
  entityType,
  initialGameData,
  initialCreateIntent,
  initialTemplateId,
  initialLocationTimeMode,
  initialBookingIds = [],
}: CreateGameProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { setIsAnimating, setActiveTab, setMyGamesCalendarDateAfterCreate } = useShellNavStore();

  useBackButtonHandler(() => {
    handleBack(navigate);
    return true;
  });

  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [allClubCourts, setAllClubCourts] = useState<Court[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>(() => initialGameData?.clubId || '');
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(() => {
    const fromGameCourts = initialGameData?.gameCourts?.map((gc) => gc.courtId) || [];
    if (fromGameCourts.length > 0) return fromGameCourts;
    if (initialGameData?.courtId) return [initialGameData.courtId];
    return [];
  });
  const selectedCourt = selectedCourtIds[0] ?? 'notBooked';
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>(() => {
    const sport: Sport =
      initialGameData?.sport ?? (resolveCreateGameDefaultSport(user));
    const level = user ? getDisplayLevelForSport(user, sport) : undefined;
    return [
      initialGameData?.minLevel ?? getDefaultLevelRange(level)[0],
      initialGameData?.maxLevel ?? getDefaultLevelRange(level)[1],
    ];
  });
  const [selectedSport, setSelectedSport] = useState<Sport>(() => {
    if (initialGameData?.sport) return initialGameData.sport;
    return resolveCreateGameDefaultSport(user);
  });
  const [maxParticipants, setMaxParticipants] = useState<number>(() => {
    if (initialGameData?.maxParticipants) return initialGameData.maxParticipants;
    if (entityType === 'TOURNAMENT') return 8;
    const initialSport = getSportConfig(
      initialGameData?.sport ?? (resolveCreateGameDefaultSport(user)),
    );
    if (entityType === 'GAME' || entityType === 'LEAGUE') {
      if (initialSport.defaultPlayersPerMatch === 2) return 2;
      if (initialSport.defaultPlayersPerMatch === 4) return 4;
    }
    return initialSport.defaultEventRoster;
  });
  const [playersPerMatch, setPlayersPerMatch] = useState<number>(() => {
    const initialMax =
      initialGameData?.maxParticipants ??
      (entityType === 'TOURNAMENT'
        ? 8
        : getSportConfig(
            initialGameData?.sport ??
              (resolveCreateGameDefaultSport(user)),
          )
            .defaultEventRoster);
    if (initialMax === 2) return 2;
    if (initialGameData?.playersPerMatch != null) return initialGameData.playersPerMatch;
    const initialSport = getSportConfig(
      initialGameData?.sport ?? (resolveCreateGameDefaultSport(user)),
    );
    return initialSport.defaultPlayersPerMatch;
  });
  const userDefaultSportAppliedRef = useRef(false);
  const initialRosterByDefaultSportAppliedRef = useRef(false);
  const [participants, setParticipants] = useState<Array<string | null>>([user?.id || null]);
  const [anyoneCanInvite, setAnyoneCanInvite] = useState<boolean>(initialGameData?.anyoneCanInvite ?? false);
  const [isPublic, setIsPublic] = useState<boolean>(initialGameData?.isPublic ?? true);
  const [isRatingGame, setIsRatingGame] = useState<boolean>(initialGameData?.affectsRating ?? true);
  const [resultsByAnyone, setResultsByAnyone] = useState<boolean>(initialGameData?.resultsByAnyone ?? false);
  const [allowDirectJoin, setAllowDirectJoin] = useState<boolean>(initialGameData?.allowDirectJoin ?? false);
  const [afterGameGoToBar, setAfterGameGoToBar] = useState<boolean>(initialGameData?.afterGameGoToBar ?? false);
  const [participantsOnlyChat, setParticipantsOnlyChat] = useState(false);
  const enabledSports = useMemo(() => listCreateFlowSports(user), [user]);
  const showTemplatePicker = showGameFormatTemplatePicker(entityType, selectedSport);
  const gameFormat = useGameFormat(
    { ...initialGameData, maxParticipants },
    { skipGenerationParticipantDefaults: showTemplatePicker },
  );
  const sportFormatLimits = useClampGameFormatToSport(
    selectedSport,
    gameFormat,
    entityType !== 'BAR' && entityType !== 'TRAINING',
  );
  const { sportConfig, allowedScoringModes, allowedScoringPresets } = sportFormatLimits;
  const userDefaultSport = useMemo(
    () => resolveCreateGameDefaultSport(user),
    [user],
  );
  const { status: questionnaireStatus } = useQuestionnaireStatus(selectedSport);
  const showSportSelector = enabledSports.length > 1;

  const [genderTeams, setGenderTeams] = useState<GenderTeam>(
    (initialGameData?.genderTeams as GenderTeam) ?? 'ANY',
  );
  const [hasFixedTeams, setHasFixedTeams] = useState<boolean>(initialGameData?.hasFixedTeams ?? false);
  const [allowUserInMultipleTeams, setAllowUserInMultipleTeams] = useState<boolean>(
    initialGameData?.allowUserInMultipleTeams ?? false,
  );

  const templateParticipantContext = useMemo(
    (): CreateTemplateParticipantContext => ({
      maxParticipants,
      playersPerMatch: playersPerMatch === 4 ? 4 : 2,
      hasFixedTeams,
      genderTeams,
    }),
    [maxParticipants, playersPerMatch, hasFixedTeams, genderTeams],
  );

  const applyIntentDefaults = useCallback(
    (intent: CreateFlowIntent) => {
      if (intent === 'social') {
        setIsRatingGame(false);
        setPlayerLevelRange(SOCIAL_LEVEL_BAND);
        return;
      }
      if (intent === 'match') {
        setIsRatingGame(true);
        if (user) {
          setPlayerLevelRange(getDefaultLevelRange(getDisplayLevelForSport(user, selectedSport)));
        }
        return;
      }
      setIsRatingGame(true);
    },
    [user, selectedSport],
  );

  const [isFormatWizardOpen, setIsFormatWizardOpen] = useState(false);

  const templateFlow = useGameFormatTemplateFlow({
    enabled: showTemplatePicker,
    sport: selectedSport,
    maxParticipants,
    gameFormat,
    allowedScoringPresets,
    presetMeta: sportConfig.presetMeta,
    participantContext: templateParticipantContext,
    initial: {
      intent: initialCreateIntent ?? null,
      templateId: initialTemplateId ?? null,
    },
    skipInitialAutoSelect: !!initialCreateIntent || !!initialTemplateId,
    formatWizardOpen: isFormatWizardOpen,
    onIntentSideEffects: (intent, template) => {
      applyIntentDefaults(intent);
      if (template) setIsRatingGame(template.affectsRating);
    },
    onAfterTemplateApply: (template) => {
      if (template.playersPerMatch !== playersPerMatch) {
        setPlayersPerMatch(template.playersPerMatch);
        if (template.playersPerMatch === 2) {
          setHasFixedTeams(false);
          setAllowUserInMultipleTeams(false);
        }
      }
    },
  });
  const { notifyFormatWizardOpen, handleWizardClose } = templateFlow;
  const allowedParticipantOptions = useMemo(() => {
    if (entityType === 'TRAINING') return undefined;
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return undefined;
    return gameLeagueRosterOptions(user);
  }, [entityType, user]);

  const [gameName, setGameName] = useState<string>(initialGameData?.name || '');
  const [comments, setComments] = useState<string>(initialGameData?.description || '');
  const [priceTotal, setPriceTotal] = useState<number | undefined>(initialGameData?.priceTotal ?? undefined);
  const [priceType, setPriceType] = useState<PriceType>(initialGameData?.priceType || 'NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(initialGameData?.priceCurrency ?? undefined);
  const [storedInitialDate] = useState<Date>(() => {
    const today = startOfDay(new Date());
    if (initialGameData?.startTime) {
      const date = startOfDay(new Date(initialGameData.startTime));
      return date < today ? today : date;
    }
    return new Date();
  });
  const [loading, setLoading] = useState(false);
  const [createOverlayPhase, setCreateOverlayPhase] = useState<CreateGameProgressPhase | null>(null);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isInvitePlayersModalOpen, setIsInvitePlayersModalOpen] = useState(false);
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<string[]>([]);
  const [inviteUserTeamByReceiverId, setInviteUserTeamByReceiverId] = useState<Record<string, string>>({});
  const [invitedPlayers, setInvitedPlayers] = useState<BasicUser[]>([]);
  const [creatorNonPlaying, setCreatorNonPlaying] = useState<boolean>(false);
  
  const {
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    duration,
    setDuration,
    generateTimeOptions,
    generateTimeOptionsForDate,
    canAccommodateDuration,
    getAdjustedStartTime,
    getTimeSlotsForDuration,
    isSlotHighlighted,
  } = useGameTimeDuration({
    clubs,
    selectedClub,
    initialDate: storedInitialDate,
  });

  const selectedClubData = useMemo(
    () => clubs.find((c) => c.id === selectedClub),
    [clubs, selectedClub]
  );

  const navigateAfterCreate = useCallback((gameStartTime: string) => {
    setIsAnimating(true);
    const startDate = format(startOfDay(new Date(gameStartTime)), 'yyyy-MM-dd');
    setMyGamesCalendarDateAfterCreate(startDate);
    setActiveTab('calendar');
    navigate('/', { replace: true });
    setTimeout(() => setIsAnimating(false), 300);
  }, [navigate, setActiveTab, setIsAnimating, setMyGamesCalendarDateAfterCreate]);

  const createDateFromSelection = useCallback(() => {
    const club = clubs.find((c) => c.id === selectedClub);
    const start = createDateFromClubTime(selectedDate, selectedTime, club);
    const end = addHours(start, duration);
    return { startTime: start.toISOString(), endTime: end.toISOString() };
  }, [clubs, selectedClub, selectedDate, selectedTime, duration]);

  const multiCourtMode = entityType !== 'BAR' && maxParticipants > 4;

  const handleCourtSelect = useCallback(
    (id: string) => {
      if (id === 'notBooked') {
        setSelectedCourtIds([]);
        return;
      }

      if (!multiCourtMode) {
        setSelectedCourtIds([id]);
        return;
      }

      setSelectedCourtIds((prev) => {
        const existing = prev.indexOf(id);
        if (existing >= 0) return prev.filter((courtId) => courtId !== id);
        const max = computeMaxSelectableCourts(maxParticipants, courts.length);
        if (prev.length >= max) return prev;
        return [...prev, id];
      });
    },
    [multiCourtMode, maxParticipants, courts.length],
  );

  const bookingFlow = useCreateGameBookingFlow({
    entityType,
    sport: selectedSport,
    selectedClub,
    selectedClubData,
    selectedCourt,
    selectedCourtIds,
    selectedDate,
    setSelectedDate,
    selectedTime,
    setSelectedTime,
    duration,
    courts,
    bookingMatchCourts: allClubCourts.length > 0 ? allClubCourts : courts,
    clubs,
    multiCourtMode,
    maxParticipants,
    playersPerMatch,
    initialHasBookedCourt: initialGameData?.hasBookedCourt ?? false,
    initialLocationTimeMode,
    initialBookingIds,
    storedInitialDate,
    hasInitialStartTime: Boolean(initialGameData?.startTime),
    createDateFromSelection,
    baseTimeOptions: {
      generateTimeOptions,
      generateTimeOptionsForDate,
      canAccommodateDuration,
      getAdjustedStartTime,
      getTimeSlotsForDuration,
      isSlotHighlighted,
    },
    handleCourtSelect,
    onNavigateAfterCreate: navigateAfterCreate,
    t,
  });

  const {
    clubBookingFlowActive,
    hasBookedCourt,
    setHasBookedCourt,
    locationTimeMode,
    setLocationTimeMode,
    showSegmentedSwitch,
    willBookOnCreate,
    skipRealCourtBooking,
    setSkipRealCourtBooking,
    selectedBookingIds,
    bookingSelectionLimits,
    timeOverride,
    setTimeOverride,
    overrideStartTime,
    overrideEndTime,
    setOverrideTimes,
    dirtyFlags,
    derivedBookingWindowLabel,
    derivedBookingSummary,
    needsBooktimeAuth,
    booktimeAuth,
    booktimeIntegrationConfig,
    booktimeCompanyMeta,
    booktimeFixedDates,
    createGameSnapshotBanner,
    isRefreshingSnapshot,
    booktimeTimeOptions,
    resolvedGenerateTimeOptions,
    resolvedGenerateTimeOptionsForDate,
    resolvedCanAccommodateDuration,
    resolvedGetAdjustedStartTime,
    resolvedGetTimeSlotsForDuration,
    resolvedIsSlotHighlighted,
    createButtonLabel,
    createDisabledByAuth,
    preselectedBookings,
    resetOnClubChange,
    handleCreateAttempt,
    prepareBookingFields,
    evaluatePostCreate,
    softOverlapOpen,
    setSoftOverlapOpen,
    markCourtOpen,
    handleMarkCourtBooked,
    handleSkipMarkCourt,
    getConfirmModalProps,
    handleCourtSelectForAuthSkip,
    handleAuthConnected,
    onSelectedBookingIdsChange,
    onDerivedTimeChange,
  } = bookingFlow;

  const clubsForSport = useMemo(
    () => filterClubsBySport(clubs, selectedSport),
    [clubs, selectedSport],
  );

  const prevSelectedSportRef = useRef(selectedSport);
  useEffect(() => {
    if (prevSelectedSportRef.current === selectedSport) return;
    prevSelectedSportRef.current = selectedSport;

    if (!selectedClub) return;
    const club = clubs.find((c) => c.id === selectedClub);
    if (club && !clubSupportsSport(club, selectedSport)) {
      setSelectedClub('');
      setSelectedCourtIds([]);
      resetOnClubChange();
      setHasBookedCourt(false);
    }
  }, [selectedSport, selectedClub, clubs, resetOnClubChange, setHasBookedCourt]);

  const openFormatWizard = useCallback(() => {
    notifyFormatWizardOpen();
    setIsFormatWizardOpen(true);
  }, [notifyFormatWizardOpen]);
  const closeFormatWizard = useCallback(() => {
    handleWizardClose();
    setIsFormatWizardOpen(false);
  }, [handleWizardClose]);

  const templateDurationContext = useMemo((): CreateTemplateDurationContext => {
    const sport = selectedSport;
    const invitedLevels = invitedPlayers
      .map((p) => getDisplayLevelForSport(p, sport))
      .filter((l) => typeof l === 'number' && !Number.isNaN(l));
    return {
      sport,
      maxParticipants,
      playersPerMatch: playersPerMatch === 4 ? 4 : 2,
      selectedCourtCount: selectedCourtIds.length,
      creatorLevel: user ? getDisplayLevelForSport(user, sport) : 2,
      playerLevelRange,
      invitedLevels,
      selectedTemplateId: templateFlow.selectedTemplateId,
      liveScoringPreset: gameFormat.scoringPreset,
      liveMatchTimedCapMinutes: gameFormat.matchTimedCapMinutes,
      liveMatchTimerEnabled: gameFormat.matchTimerEnabled,
      liveCustomPointsTotal: gameFormat.customPointsTotal,
    };
  }, [
    selectedSport,
    maxParticipants,
    playersPerMatch,
    selectedCourtIds,
    user,
    playerLevelRange,
    invitedPlayers,
    templateFlow.selectedTemplateId,
    gameFormat.scoringPreset,
    gameFormat.matchTimedCapMinutes,
    gameFormat.matchTimerEnabled,
    gameFormat.customPointsTotal,
  ]);

  const [pendingAvatarFiles, setPendingAvatarFiles] = useState<{ avatar: File; original: File } | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | undefined>(undefined);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const levelBandWarnedRef = useRef<string | null>(null);
  const prevCreateSportRef = useRef<Sport | null>(null);
  const prevSportForRosterRef = useRef(selectedSport);
  const prevMaxParticipantsRef = useRef(maxParticipants);

  const applyRosterSyncForSport = useCallback(
    (sport: Sport) => {
      const config = getSportConfig(sport);
      const sync = syncRosterOnSportChange(
        maxParticipants,
        playersPerMatch,
        config.defaultPlayersPerMatch,
        config.defaultEventRoster,
      );
      if (!sync) return;
      prevMaxParticipantsRef.current = sync.maxParticipants;
      setMaxParticipants(sync.maxParticipants);
      setPlayersPerMatch(sync.playersPerMatch);
      if (sync.resetFixedTeams) {
        setHasFixedTeams(false);
        setAllowUserInMultipleTeams(false);
      }
    },
    [maxParticipants, playersPerMatch],
  );

  const handleSportChange = useCallback(
    (sport: Sport) => {
      applyRosterSyncForSport(sport);
      prevSportForRosterRef.current = sport;
      setSelectedSport(sport);
    },
    [applyRosterSyncForSport],
  );

  const locationTimeSectionRef = useRef<HTMLDivElement>(null);
  const durationSectionRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const summarySectionRefs = useMemo(
    () => ({
      sport: createRef<HTMLDivElement>(),
      setup: createRef<HTMLDivElement>(),
      format: createRef<HTMLDivElement>(),
      location: locationTimeSectionRef,
      time: locationTimeSectionRef,
      participants: createRef<HTMLDivElement>(),
      settings: createRef<HTMLDivElement>(),
      name: createRef<HTMLDivElement>(),
      price: createRef<HTMLDivElement>(),
    }),
    [],
  );
  useEffect(() => {
    const fetchClubs = async () => {
      if (!user?.currentCity) return;
      try {
        const response = await clubsApi.getByCityId(user.currentCity.id, entityType);
        setClubs(response.data);
      } catch (error) {
        console.error('Failed to fetch clubs:', error);
      }
    };
    fetchClubs();
  }, [user?.currentCity, entityType]);

  const initialCourtId = initialGameData?.courtId;
  const initialHasBookedCourt = initialGameData?.hasBookedCourt ?? false;
  const courtsClubRef = useRef<string | null>(null);

  useEffect(() => {
    const fetchCourts = async () => {
      if (!selectedClub) {
        setCourts([]);
        setAllClubCourts([]);
        courtsClubRef.current = null;
        if (!initialCourtId) {
          setSelectedCourtIds([]);
          setHasBookedCourt(false);
        } else {
          setHasBookedCourt(initialHasBookedCourt);
        }
        return;
      }
      try {
        const [sportFilteredRes, allCourtsRes] = await Promise.all([
          courtsApi.getByClubId(selectedClub, { sport: selectedSport }),
          courtsApi.getByClubId(selectedClub),
        ]);
        const sportCourts = sportFilteredRes.data;
        const clubCourts = allCourtsRes.data;
        setCourts(sportCourts);
        setAllClubCourts(clubCourts);

        const clubChanged = courtsClubRef.current !== selectedClub;
        courtsClubRef.current = selectedClub;
        if (!clubChanged) return;

        if (initialCourtId && clubCourts.some((c) => c.id === initialCourtId)) {
          setSelectedCourtIds([initialCourtId]);
          setHasBookedCourt(initialHasBookedCourt);
        } else if (sportCourts.length === 1) {
          setSelectedCourtIds([sportCourts[0].id]);
          setHasBookedCourt(false);
        } else {
          setSelectedCourtIds([]);
          setHasBookedCourt(false);
        }
      } catch (error) {
        console.error('Failed to fetch courts:', error);
      }
    };
    void fetchCourts();
  }, [selectedClub, selectedSport, initialCourtId, initialHasBookedCourt, setHasBookedCourt]);

  useEffect(() => {
    if (selectedCourt === 'notBooked') return;
    const court = courts.find((c) => c.id === selectedCourt);
    if (!court?.sport) return;
    const config = getSportConfig(court.sport);
    if (!config.implemented) return;
    if (selectedSport !== court.sport) {
      handleSportChange(court.sport);
    }
  }, [selectedCourt, courts, selectedSport, handleSportChange]);

  useEffect(() => {
    setSelectedCourtIds((prev) => {
      if (prev.length === 0) return prev;
      const filtered = prev.filter((id) => {
        const court = courts.find((c) => c.id === id);
        return !court?.sport || court.sport === selectedSport;
      });
      return filtered.length === prev.length ? prev : filtered;
    });
  }, [selectedSport, courts]);

  const handleCourtSportTab = useCallback(
    (sport: typeof selectedSport) => {
      const config = getSportConfig(sport);
      if (config.implemented) {
        handleSportChange(sport);
      }
    },
    [handleSportChange],
  );

  useEffect(() => {
    if (multiCourtMode) return;
    setSelectedCourtIds((prev) => (prev.length <= 1 ? prev : [prev[0]]));
  }, [multiCourtMode]);


  useEffect(() => {
    if (initialGameData?.minLevel !== undefined || initialGameData?.maxLevel !== undefined) {
      prevCreateSportRef.current = selectedSport;
      return;
    }
    if (!user) return;
    const sport = selectedSport;
    if (prevCreateSportRef.current === sport) return;
    prevCreateSportRef.current = sport;
    levelBandWarnedRef.current = null;
    setPlayerLevelRange(getDefaultLevelRange(getDisplayLevelForSport(user, sport)));
  }, [initialGameData?.maxLevel, initialGameData?.minLevel, selectedSport, user]);

  useEffect(() => {
    if (!user || entityType === 'BAR' || entityType === 'TRAINING') return;
    const sport = selectedSport;
    const [minLevel, maxLevel] = playerLevelRange;
    if (!shouldWarnCreateGameLevelBand(user, sport, minLevel, maxLevel, questionnaireStatus)) return;
    const warnKey = `${sport}-${minLevel}-${maxLevel}`;
    if (levelBandWarnedRef.current === warnKey) return;
    levelBandWarnedRef.current = warnKey;
    const sportLabel = t(getSportConfig(sport).labelKey);
    toast(t('sportQuestionnaire.common.createGameLevelBandWarning', { sport: sportLabel }), {
      duration: 5000,
    });
  }, [entityType, playerLevelRange, questionnaireStatus, selectedSport, t, user]);

  useEffect(() => {
    if (!user?.id) return;
    void usePlayersStore.getState().fetchPlayers(undefined, selectedSport);
  }, [user?.id, selectedSport]);

  useEffect(() => {
    // Initialize time and duration from initialGameData
    if (initialGameData?.startTime && initialGameData?.endTime && selectedClub && clubs.length > 0) {
      const club = clubs.find(c => c.id === selectedClub);
      if (club) {
        const startDate = new Date(initialGameData.startTime);
        const endDate = new Date(initialGameData.endTime);
        const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
        const timeString = formatTimeInClubTimezone(startDate, club);
        
        setSelectedDate(startDate);
        setSelectedTime(timeString);
        setDuration(durationHours);
      }
    } else if (selectedClub && !initialGameData) {
      // Clear selected time when club changes to force manual selection (only if not duplicating)
      setSelectedTime('');
    }
  }, [selectedClub, setSelectedTime, setSelectedDate, setDuration, initialGameData, clubs]);

  useEffect(() => {
    if (entityType === 'TOURNAMENT') {
      const tourMax = maxSlotsForUserTournament(user);
      setMaxParticipants(prev => {
        if (prev < 8) {
          setParticipants(p => p.length > 8 ? p.slice(0, 8) : p);
          return 8;
        }
        if (prev > tourMax) {
          setParticipants(p => p.length > tourMax ? p.slice(0, tourMax) : p);
          return tourMax;
        }
        if (prev % 2 !== 0) {
          const evenValue = Math.ceil(prev / 2) * 2;
          setParticipants(p => p.length > evenValue ? p.slice(0, evenValue) : p);
          return evenValue;
        }
        return prev;
      });
    }
  }, [entityType, user]);

  useEffect(() => {
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return;
    const cap = maxSlotsForUserGameOrLeague(user);
    setMaxParticipants((prev) => {
      if (prev <= cap) return prev;
      setParticipants((p) => (p.length > cap ? p.slice(0, cap) : p));
      return cap;
    });
  }, [entityType, user]);

  useEffect(() => {
    if (!enabledSports.includes(selectedSport)) {
      handleSportChange(enabledSports[0] ?? Sports.PADEL);
    }
  }, [enabledSports, selectedSport, handleSportChange]);

  useEffect(() => {
    if (initialGameData?.sport) return;
    if (userDefaultSportAppliedRef.current) return;
    if (!user) return;
    const preferredSport = resolveCreateGameDefaultSport(user);
    if (enabledSports.includes(preferredSport)) {
      setSelectedSport(preferredSport);
    }
    userDefaultSportAppliedRef.current = true;
  }, [enabledSports, initialGameData?.sport, user]);

  useEffect(() => {
    if (initialRosterByDefaultSportAppliedRef.current) return;
    if (initialGameData?.maxParticipants != null) return;
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return;
    const config = getSportConfig(selectedSport);
    if (config.defaultPlayersPerMatch === 2) {
      setMaxParticipants(2);
      initialRosterByDefaultSportAppliedRef.current = true;
      return;
    }
    if (config.defaultPlayersPerMatch === 4) {
      setMaxParticipants(4);
      initialRosterByDefaultSportAppliedRef.current = true;
      return;
    }
  }, [entityType, initialGameData?.maxParticipants, selectedSport]);

  useEffect(() => {
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return;
    const prevSport = prevSportForRosterRef.current;
    if (prevSport === selectedSport) return;
    prevSportForRosterRef.current = selectedSport;

    const sync = syncRosterOnSportChange(
      maxParticipants,
      playersPerMatch,
      sportConfig.defaultPlayersPerMatch,
      sportConfig.defaultEventRoster,
    );
    if (!sync) return;
    prevMaxParticipantsRef.current = sync.maxParticipants;
    setMaxParticipants(sync.maxParticipants);
    setPlayersPerMatch(sync.playersPerMatch);
    if (sync.resetFixedTeams) {
      setHasFixedTeams(false);
      setAllowUserInMultipleTeams(false);
    }
  }, [
    entityType,
    selectedSport,
    maxParticipants,
    playersPerMatch,
    sportConfig.defaultEventRoster,
    sportConfig.defaultPlayersPerMatch,
  ]);

  useEffect(() => {
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return;
    const prev = prevMaxParticipantsRef.current;
    if (prev !== maxParticipants) {
      const sync = syncPlayersPerMatchOnRosterChange(
        prev,
        maxParticipants,
        sportConfig.defaultPlayersPerMatch,
        sportConfig.allowedPlayerCountsPerMatch,
      );
      prevMaxParticipantsRef.current = maxParticipants;
      if (sync) {
        setPlayersPerMatch(sync.playersPerMatch);
        if (sync.resetFixedTeams) {
          setHasFixedTeams(false);
          setAllowUserInMultipleTeams(false);
        }
      }
    }
  }, [
    entityType,
    maxParticipants,
    sportConfig.defaultPlayersPerMatch,
    sportConfig.allowedPlayerCountsPerMatch,
  ]);

  useEffect(() => {
    if (entityType !== 'GAME' && entityType !== 'LEAGUE') return;
    const allowed = sportConfig.allowedPlayerCountsPerMatch;
    if (allowed.includes(playersPerMatch)) return;
    const fallback = allowed.includes(sportConfig.defaultPlayersPerMatch)
      ? sportConfig.defaultPlayersPerMatch
      : allowed[0] ?? sportConfig.defaultPlayersPerMatch;
    setPlayersPerMatch(fallback);
    if (fallback === 2) {
      setHasFixedTeams(false);
      setAllowUserInMultipleTeams(false);
    }
  }, [entityType, playersPerMatch, sportConfig.allowedPlayerCountsPerMatch, sportConfig.defaultPlayersPerMatch]);

  useEffect(() => {
    if (pendingAvatarFiles) {
      const url = URL.createObjectURL(pendingAvatarFiles.avatar);
      setAvatarPreviewUrl(url);
      
      return () => {
        URL.revokeObjectURL(url);
      };
    } else {
      setAvatarPreviewUrl(undefined);
    }
  }, [pendingAvatarFiles]);

  const getDurationLabel = useCallback(
    (dur: number) => {
      if (dur === Math.floor(dur)) {
        return t('createGame.hours', { count: dur });
      } else {
        const hours = Math.floor(dur);
        const minutes = (dur % 1) * 60;
        return t('createGame.hoursMinutes', { hours, minutes });
      }
    },
    [t],
  );

  const scrolledPastSections = useScrolledPastSections(scrollContainerRef, summarySectionRefs);
  const summaryChips = useCreateGameSummaryChips({
    past: scrolledPastSections,
    entityType,
    showSportChip: showSportSelector && hasMultipleSportsEnabled(user),
    selectedSport,
    maxParticipants,
    playersPerMatch,
    hasFixedTeams,
    genderTeams,
    showTemplatePicker,
    activeTemplateId: templateFlow.activeTemplateId,
    isCustomFormat: templateFlow.isCustom,
    clubs,
    selectedClub,
    courts,
    selectedCourt,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    getDurationLabel,
    playerLevelRange,
    isPublic,
    isRatingGame,
    gameName,
    priceType,
    priceTotal,
    priceCurrency,
    defaultCurrency: user?.defaultCurrency as PriceCurrency | undefined,
    locationTimeMode,
    willBookOnCreate,
    selectedBookingCount: selectedBookingIds.length,
    derivedBookingWindow: derivedBookingWindowLabel,
  });
  const confirmSummaryChips = useCreateGameSummaryChips({
    past: scrolledPastSections,
    entityType,
    showSportChip: showSportSelector && hasMultipleSportsEnabled(user),
    selectedSport,
    maxParticipants,
    playersPerMatch,
    hasFixedTeams,
    genderTeams,
    showTemplatePicker,
    activeTemplateId: templateFlow.activeTemplateId,
    isCustomFormat: templateFlow.isCustom,
    clubs,
    selectedClub,
    courts,
    selectedCourt,
    selectedCourtIds,
    selectedDate,
    selectedTime,
    duration,
    getDurationLabel,
    playerLevelRange,
    isPublic,
    isRatingGame,
    gameName,
    priceType,
    priceTotal,
    priceCurrency,
    defaultCurrency: user?.defaultCurrency as PriceCurrency | undefined,
    excludeKeys: ['location', 'time'],
    locationTimeMode,
    willBookOnCreate,
    selectedBookingCount: selectedBookingIds.length,
    derivedBookingWindow: derivedBookingWindowLabel,
  });
  const handleSummaryChipClick = useCallback(
    (key: string) => {
      summarySectionRefs[key as keyof typeof summarySectionRefs]?.current?.scrollIntoView({
        behavior: 'smooth',
        block: 'center',
      });
    },
    [summarySectionRefs],
  );

  const courtSection = useMemo(
    () => (
      <CreateGameCourtSection
        clubs={clubs}
        courts={courts}
        selectedClub={selectedClub}
        selectedCourt={selectedCourt}
        selectedCourtIds={selectedCourtIds}
        maxParticipants={maxParticipants}
        multiSelectCourts={multiCourtMode}
        selectedDate={selectedDate}
        hasBookedCourt={hasBookedCourt}
        entityType={entityType}
        onSelectCourt={handleCourtSelect}
        onToggleHasBookedCourt={setHasBookedCourt}
        preferredSport={selectedSport}
        onSportTabChange={handleCourtSportTab}
      />
    ),
    [
      clubs,
      courts,
      selectedClub,
      selectedCourt,
      selectedCourtIds,
      maxParticipants,
      multiCourtMode,
      selectedDate,
      hasBookedCourt,
      entityType,
      handleCourtSelect,
      selectedSport,
      handleCourtSportTab,
      setHasBookedCourt,
    ],
  );

  const dateSection = useMemo(
    () => (
      <CreateGameDateSection
        selectedDate={selectedDate}
        showDatePicker={showDatePicker}
        onDateSelect={setSelectedDate}
        onCalendarClick={() => setShowDatePicker(true)}
        onCloseDatePicker={() => setShowDatePicker(false)}
        generateTimeOptionsForDate={resolvedGenerateTimeOptionsForDate}
        dateFixedDates={willBookOnCreate ? booktimeFixedDates : undefined}
        hideCalendar={willBookOnCreate}
        bookableDaysHint={willBookOnCreate ? booktimeCompanyMeta.bookableDays : null}
      />
    ),
    [
      selectedDate,
      showDatePicker,
      setSelectedDate,
      resolvedGenerateTimeOptionsForDate,
      willBookOnCreate,
      booktimeFixedDates,
      booktimeCompanyMeta.bookableDays,
    ],
  );

  const scrollToAndHighlightError = (ref: React.RefObject<HTMLDivElement | null>) => {
    if (ref.current) {
      ref.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
      ref.current.classList.add('error-bounce');
      setTimeout(() => {
        ref.current?.classList.remove('error-bounce');
      }, 2000);
    }
  };

  const handleCreateGame = async () => {
    if (!user) return;

    if (user.nameIsSet !== true) {
      runWithProfileName(() => void handleCreateGame());
      return;
    }

    if (!selectedClub) {
      scrollToAndHighlightError(locationTimeSectionRef);
      return;
    }

    if (!selectedTime || selectedTime === '') {
      scrollToAndHighlightError(locationTimeSectionRef);
      return;
    }

    if (!duration) {
      scrollToAndHighlightError(durationSectionRef);
      return;
    }

    if (needsBooktimeAuth) {
      scrollToAndHighlightError(locationTimeSectionRef);
      return;
    }

    await handleCreateAttempt(
      async (overrides) => {
        await executeCreateGame(overrides);
      },
      () => scrollToAndHighlightError(locationTimeSectionRef),
    );
  };

  const executeCreateGame = async (
    overrides?: CreateGameBookingOverrides,
    options?: { skipNavigate?: boolean },
  ) => {
    if (!user) return;

    const showCreateOverlay = !options?.skipNavigate;
    if (showCreateOverlay) setCreateOverlayPhase('creating');

    setLoading(true);
    try {
      const bookingFields = await prepareBookingFields(overrides);

      const gameData: Record<string, unknown> = {
        sport: selectedSport,
        entityType: entityType,
        clubId: selectedClub || undefined,
        courtId: bookingFields.courtId,
        courtIds: bookingFields.courtIds,
        startTime: bookingFields.startTime,
        endTime: bookingFields.endTime,
        timeOverride: bookingFields.timeOverride,
        timeIsSet: true,
        maxParticipants,
        playersPerMatch:
          entityType === 'GAME' || entityType === 'LEAGUE' ? playersPerMatch : undefined,
        minParticipants: 2,
        minLevel: playerLevelRange[0],
        maxLevel: playerLevelRange[1],
        isPublic,
        anyoneCanInvite,
        allowDirectJoin,
        hasBookedCourt: bookingFields.hasBookedCourt,
        externalBookingIds: bookingFields.externalBookingIds,
        externalBookingProvider: bookingFields.externalBookingProvider,
        bookingSnapshots: bookingFields.bookingSnapshots,
        afterGameGoToBar: afterGameGoToBar,
        name: gameName || undefined,
        description: comments,
        participants: participants.filter((id): id is string => id !== null),
        priceTotal: priceType !== 'NOT_KNOWN' && priceType !== 'FREE' ? priceTotal : undefined,
        priceType: priceType,
        priceCurrency: priceType !== 'NOT_KNOWN' && priceType !== 'FREE' ? (priceCurrency ?? resolveUserCurrency(user?.defaultCurrency)) : undefined,
        parentId: initialGameData?.parentId,
      };

      if (entityType === 'TRAINING' && creatorNonPlaying) {
        gameData.creatorNonPlaying = true;
        gameData.participants = [];
      }

      if (entityType !== 'TRAINING') {
        const setup = gameFormat.setupPayload;
        gameData.gameType = gameFormat.gameType;
        gameData.affectsRating = isRatingGame;
        gameData.resultsByAnyone = entityType === 'TOURNAMENT' ? false : resultsByAnyone;
        gameData.hasFixedTeams = hasFixedTeams;
        gameData.allowUserInMultipleTeams =
          playersPerMatch === 2 || !hasFixedTeams ? false : allowUserInMultipleTeams;
        gameData.pointsPerWin = setup.pointsPerWin;
        gameData.pointsPerLoose = setup.pointsPerLoose;
        gameData.pointsPerTie = setup.pointsPerTie;
        gameData.fixedNumberOfSets = setup.fixedNumberOfSets;
        gameData.maxTotalPointsPerSet = setup.maxTotalPointsPerSet;
        gameData.matchTimedCapMinutes = setup.matchTimedCapMinutes;
        gameData.matchTimerEnabled = setup.matchTimerEnabled ?? false;
        gameData.maxPointsPerTeam = setup.maxPointsPerTeam;
        gameData.winnerOfGame = setup.winnerOfGame;
        gameData.winnerOfMatch = setup.winnerOfMatch;
        gameData.matchGenerationType = setup.matchGenerationType;
        Object.assign(gameData, resultsRoundGenV2Payload);
        gameData.ballsInGames = setup.ballsInGames;
        gameData.scoringPreset = setup.scoringPreset;
        gameData.scoringMode = gameFormat.scoringMode;
        gameData.deucesBeforeGoldenPoint = setup.deucesBeforeGoldenPoint;
      }

      if (entityType === 'GAME' || entityType === 'TOURNAMENT' || entityType === 'LEAGUE') {
        gameData.genderTeams = genderTeams;
      }

      const gameResponse = await gamesApi.create(gameData);

      if ((bookingFields.externalBookingIds?.length ?? 0) > 0) {
        invalidateBooktimeAllUpcomingCache();
      }

      if (pendingAvatarFiles && gameResponse.data.id) {
        try {
          await mediaApi.uploadGameAvatar(gameResponse.data.id, pendingAvatarFiles.avatar, pendingAvatarFiles.original);
        } catch (avatarError) {
          console.error('Failed to upload game avatar:', avatarError);
        }
      }

      if (invitedPlayerIds.length > 0 && gameResponse.data.id) {
        try {
          const gid = gameResponse.data.id;
          for (const receiverId of invitedPlayerIds) {
            await invitesApi.send({
              receiverId,
              gameId: gid,
              userTeamId: inviteUserTeamByReceiverId[receiverId],
            });
          }
        } catch (inviteError) {
          console.error('Failed to send invites:', inviteError);
        }
      }

      if (participantsOnlyChat && gameResponse.data.id) {
        try {
          await gamesApi.enableParticipantChats(gameResponse.data.id);
        } catch (chatError) {
          console.error('Failed to enable participant chats:', chatError);
        }
      }

      const created = gameResponse.data;
      if (evaluatePostCreate(created, overrides) === 'markCourtPrompt') {
        if (showCreateOverlay) setCreateOverlayPhase(null);
        return;
      }

      if (showCreateOverlay) {
        setCreateOverlayPhase('success');
        await new Promise<void>((resolve) => {
          window.setTimeout(resolve, 800);
        });
        setCreateOverlayPhase(null);
      }

      if (!options?.skipNavigate) {
        navigateAfterCreate(created.startTime);
      }
      return created;
    } catch (error) {
      console.error('Failed to create game:', error);
      if (showCreateOverlay) setCreateOverlayPhase(null);
      if (options?.skipNavigate) throw error;
    } finally {
      setLoading(false);
    }
  };

  const handleRemoveParticipant = (index: number) => {
    const newParticipants = [...participants];
    newParticipants.splice(index, 1);
    setParticipants(newParticipants);
  };

  const handleAddMeToGame = () => {
    if (user && !participants.includes(user.id)) {
      setParticipants([...participants, user.id]);
    }
  };

  const handleMaxParticipantsChange = (num: number) => {
    setMaxParticipants(num);
    if (participants.length > num) {
      setParticipants(participants.slice(0, num));
    }
  };

  const createFlowBootstrapRef = useRef(false);
  useEffect(() => {
    if (createFlowBootstrapRef.current) return;
    if (!showTemplatePicker || !initialCreateIntent) return;
    createFlowBootstrapRef.current = true;
    templateFlow.runInitialBootstrap(initialCreateIntent, initialTemplateId ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- bootstrap once from deep link
  }, [showTemplatePicker, initialCreateIntent, initialTemplateId]);

  const handlePlayersPerMatchChange = (count: number) => {
    setPlayersPerMatch(count);
    if (count === 2) {
      setHasFixedTeams(false);
      setAllowUserInMultipleTeams(false);
    }
  };

  const handleRemoveInvitedPlayer = (playerId: string) => {
    setInvitedPlayerIds(invitedPlayerIds.filter(id => id !== playerId));
    setInviteUserTeamByReceiverId((prev) => {
      const next = { ...prev };
      delete next[playerId];
      return next;
    });
    setInvitedPlayers(invitedPlayers.filter(p => p.id !== playerId));
  };

  const handleAvatarUpload = async (avatarFile: File, originalFile: File) => {
    setPendingAvatarFiles({ avatar: avatarFile, original: originalFile });
  };

  const handleAvatarRemove = async () => {
    setPendingAvatarFiles(null);
  };

  const confirmModalProps = getConfirmModalProps({
    summaryChips: confirmSummaryChips,
    onExecuteCreateGame: async (overrides) => {
      await executeCreateGame(
        {
          externalBookingIds: overrides.externalBookingIds,
          bookingSnapshots: overrides.bookingSnapshots,
          hasBookedCourt: overrides.hasBookedCourt,
          courtIds: overrides.bookingSnapshots
            .map((s) => s.courtId)
            .filter((id): id is string => Boolean(id)),
        },
        { skipNavigate: true },
      );
    },
    onSuccess: () => {
      if (!selectedClubData) return;
      const start = createDateFromClubTime(selectedDate, selectedTime, selectedClubData);
      navigateAfterCreate(start.toISOString());
    },
  });

  return (
    <SportLevelProvider sport={selectedSport}>
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <CreateGameHeader onBack={() => handleBack(navigate)} entityType={entityType} />

      <CreateGameProgressOverlay phase={createOverlayPhase} />

      <div
        className={`flex-1 relative overflow-hidden transition-opacity duration-300 ${
          createOverlayPhase ? 'opacity-35 pointer-events-none' : ''
        }`}
      >
        <CreateGameSummaryBar chips={summaryChips} onChipClick={handleSummaryChipClick} />
        <div ref={scrollContainerRef} className="h-full overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-6">
        <div className="flex justify-center">
          <AvatarUpload
            currentAvatar={avatarPreviewUrl}
            onUpload={handleAvatarUpload}
            onRemove={handleAvatarRemove}
            disabled={loading}
            isGameAvatar={true}
          />
        </div>

        {showSportSelector && (
          <div ref={summarySectionRefs.sport}>
            <CreateFlowSportSelector
              sports={enabledSports}
              value={selectedSport}
              onChange={handleSportChange}
              showLabel={false}
              defaultSport={userDefaultSport}
            />
          </div>
        )}

        <div ref={summarySectionRefs.setup}>
        <ParticipantsSetupSection
          entityType={entityType}
          user={user}
          maxParticipants={maxParticipants}
          allowedParticipantOptions={allowedParticipantOptions}
          playersPerMatch={entityType === 'GAME' || entityType === 'LEAGUE' ? playersPerMatch : undefined}
          allowedPlayerCountsPerMatch={
            entityType === 'GAME' || entityType === 'LEAGUE'
              ? sportConfig.allowedPlayerCountsPerMatch
              : undefined
          }
          onPlayersPerMatchChange={
            entityType === 'GAME' || entityType === 'LEAGUE' ? handlePlayersPerMatchChange : undefined
          }
          hasFixedTeams={hasFixedTeams}
          onHasFixedTeamsChange={(v) => {
            setHasFixedTeams(v);
            if (!v) setAllowUserInMultipleTeams(false);
          }}
          onMaxParticipantsChange={handleMaxParticipantsChange}
        />
        </div>

        {entityType !== 'BAR' && entityType !== 'TRAINING' && showTemplatePicker ? (
          <div ref={summarySectionRefs.format}>
          <CreateGameIntentPicker
            collapsible
            sport={selectedSport}
            allowedScoringPresets={allowedScoringPresets}
            participantContext={templateParticipantContext}
            selectedTemplateId={templateFlow.activeTemplateId}
            isCustom={templateFlow.isCustom}
            showManualCard={templateFlow.showManualCard}
            onSelectTemplate={templateFlow.handleTemplateSelect}
            onSelectCustom={templateFlow.handleCustomSelect}
            isRatingGame={isRatingGame}
            onRatingGameChange={setIsRatingGame}
            scoringPreset={gameFormat.scoringPreset}
            matchTimedCapMinutes={gameFormat.matchTimedCapMinutes}
            onAmericanoPointsChange={templateFlow.handleAmericanoPointsChange}
            onTimedMinutesChange={templateFlow.handleTimedMinutesChange}
            durationContext={templateDurationContext}
            customMatchGenerationType={gameFormat.generationType}
            customGameType={gameFormat.gameType}
            customMatchTimerEnabled={gameFormat.matchTimerEnabled}
            customCustomPointsTotal={gameFormat.customPointsTotal}
            formatSection={
              templateFlow.isCustom ? (
                <GameFormatCard
                  embedded
                  omitGender
                  entityType={entityType}
                  format={gameFormat}
                  sport={selectedSport}
                  playersPerMatch={playersPerMatch}
                  generationSlotCount={maxParticipants > 0 ? maxParticipants : undefined}
                  onOpenWizard={openFormatWizard}
                  showFixedTeamsToggle={false}
                  teams={{
                    participantCount: maxParticipants,
                    genderTeams,
                    hasFixedTeams,
                    onGenderTeamsChange: setGenderTeams,
                    onHasFixedTeamsChange: setHasFixedTeams,
                    allowUserInMultipleTeams:
                      playersPerMatch === 2 ? false : allowUserInMultipleTeams,
                    onAllowUserInMultipleTeamsChange: setAllowUserInMultipleTeams,
                    genderSwitchLayoutId: 'createGameFormatCardTeams',
                  }}
                  questionnaireBanner={
                    <CreateGameQuestionnaireBanner sport={selectedSport} />
                  }
                />
              ) : undefined
            }
            genderSection={
              gameFormatGenderVisible(entityType) ? (
                <GameFormatGenderFields
                  entityType={entityType}
                  genderTeams={genderTeams}
                  onGenderTeamsChange={setGenderTeams}
                  genderSwitchLayoutId="createGameFormatCardTeams"
                />
              ) : undefined
            }
            genderTeams={genderTeams}
            onOpenFormatWizard={openFormatWizard}
            formatWizardCustomizeLabel={templateFlow.formatWizardCustomizeLabel}
          />
          </div>
        ) : null}

        {entityType !== 'BAR' &&
        entityType !== 'TRAINING' &&
        !showTemplatePicker &&
        templateFlow.showFormatSection ? (
          <div ref={summarySectionRefs.format}>
          <GameFormatCard
            entityType={entityType}
            format={gameFormat}
            sport={selectedSport}
            playersPerMatch={playersPerMatch}
            generationSlotCount={maxParticipants > 0 ? maxParticipants : undefined}
            onOpenWizard={openFormatWizard}
            wizardButtonLabel={templateFlow.formatWizardCustomizeLabel}
            showFixedTeamsToggle={false}
            teams={{
              participantCount: maxParticipants,
              genderTeams,
              hasFixedTeams,
              onGenderTeamsChange: setGenderTeams,
              onHasFixedTeamsChange: setHasFixedTeams,
              allowUserInMultipleTeams:
                playersPerMatch === 2 ? false : allowUserInMultipleTeams,
              onAllowUserInMultipleTeamsChange: setAllowUserInMultipleTeams,
              genderSwitchLayoutId: 'createGameFormatCardTeams',
            }}
            questionnaireBanner={<CreateGameQuestionnaireBanner sport={selectedSport} />}
          />
          </div>
        ) : null}

        <div ref={locationTimeSectionRef}>
          <div ref={durationSectionRef}>
            {entityType !== 'BAR' && selectedClub && clubBookingFlowActive && selectedClubData ? (
              <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4 space-y-4">
                <CreateGameClubSection
                  clubs={clubsForSport}
                  courts={courts}
                  selectedClub={selectedClub}
                  selectedCourt={selectedCourt}
                  isClubModalOpen={isClubModalOpen}
                  onSelectClub={(id: string) => {
                    setSelectedClub(id);
                    setSelectedCourtIds([]);
                    resetOnClubChange();
                  }}
                  onOpenClubModal={() => setIsClubModalOpen(true)}
                  onCloseClubModal={() => setIsClubModalOpen(false)}
                />
                <GameLocationTimePanel
                  mode="create"
                  entityType={entityType}
                  club={selectedClubData}
                  locationTimeMode={locationTimeMode}
                  onLocationTimeModeChange={setLocationTimeMode}
                  showSegmentedSwitch={showSegmentedSwitch}
                  showBookingsOnly={false}
                  skipRealCourtBooking={skipRealCourtBooking}
                  onSkipRealCourtBookingChange={setSkipRealCourtBooking}
                  selectedCourtIds={selectedCourtIds}
                  courts={courts}
                  bookingMatchCourts={allClubCourts.length > 0 ? allClubCourts : courts}
                  selectedBookingIds={selectedBookingIds}
                  onSelectedBookingIdsChange={onSelectedBookingIdsChange}
                  bookingSelectionLimits={bookingSelectionLimits}
                  timeOverride={timeOverride}
                  onTimeOverrideChange={setTimeOverride}
                  overrideStartTime={overrideStartTime}
                  overrideEndTime={overrideEndTime}
                  onOverrideTimesChange={setOverrideTimes}
                  dirtyFlags={dirtyFlags}
                  companyId={booktimeIntegrationConfig?.companyId}
                  bookingsPanelEnabled
                  preselectedBanner={preselectedBookings}
                  derivedSummary={{
                    startTime: derivedBookingSummary.startTime,
                    endTime: derivedBookingSummary.endTime,
                    count: derivedBookingSummary.count,
                  }}
                  onDerivedTimeChange={onDerivedTimeChange}
                  needsBooktimeAuth={needsBooktimeAuth}
                  dateSection={dateSection}
                  courtSection={courtSection}
                  authGateSection={
                    needsBooktimeAuth && booktimeIntegrationConfig ? (
                      <BooktimeConnectInline
                        club={selectedClubData}
                        integrationConfig={booktimeIntegrationConfig}
                        onConnected={handleAuthConnected}
                        onSkip={handleCourtSelectForAuthSkip}
                      />
                    ) : null
                  }
                  timeSlotsChildren={
                    <GameStartSection
                      selectedDate={selectedDate}
                      selectedTime={selectedTime}
                      duration={duration}
                      showDatePicker={showDatePicker}
                      selectedClub={selectedClub}
                      selectedCourt={selectedCourt}
                      club={selectedClubData}
                      generateTimeOptions={resolvedGenerateTimeOptions}
                      generateTimeOptionsForDate={resolvedGenerateTimeOptionsForDate}
                      canAccommodateDuration={resolvedCanAccommodateDuration}
                      getAdjustedStartTime={resolvedGetAdjustedStartTime}
                      getTimeSlotsForDuration={resolvedGetTimeSlotsForDuration}
                      isSlotHighlighted={resolvedIsSlotHighlighted}
                      getDurationLabel={getDurationLabel}
                      onDateSelect={setSelectedDate}
                      onCalendarClick={() => setShowDatePicker(true)}
                      onCloseDatePicker={() => setShowDatePicker(false)}
                      onTimeSelect={setSelectedTime}
                      onDurationChange={setDuration}
                      entityType={entityType}
                      dateInputRef={dateInputRef}
                      needsBooktimeAuth={needsBooktimeAuth}
                      bookCourtEnabled={willBookOnCreate}
                      hideOccupancyOverlay={willBookOnCreate}
                      dateFixedDates={willBookOnCreate ? booktimeFixedDates : undefined}
                      hideCalendar={willBookOnCreate}
                      bookableDaysHint={willBookOnCreate ? booktimeCompanyMeta.bookableDays : null}
                      connectedPhone={booktimeAuth?.phoneNumber ?? null}
                      slotsLoading={booktimeTimeOptions.active && booktimeTimeOptions.loading}
                      snapshotOverlayEnabled={willBookOnCreate && !needsBooktimeAuth}
                      snapshotLoading={isRefreshingSnapshot}
                      snapshotBannerState={createGameSnapshotBanner}
                      compact
                      hideDateSection
                    />
                  }
                />
              </div>
            ) : (
              <GameStartSection
                clubs={clubsForSport}
                courts={courts}
                isClubModalOpen={isClubModalOpen}
                onSelectClub={(id: string) => {
                  setSelectedClub(id);
                  setSelectedCourtIds([]);
                }}
                onOpenClubModal={() => setIsClubModalOpen(true)}
                onCloseClubModal={() => setIsClubModalOpen(false)}
                selectedDate={selectedDate}
                selectedTime={selectedTime}
                duration={duration}
                showDatePicker={showDatePicker}
                selectedClub={selectedClub}
                selectedCourt={selectedCourt}
                club={selectedClubData}
                generateTimeOptions={resolvedGenerateTimeOptions}
                generateTimeOptionsForDate={resolvedGenerateTimeOptionsForDate}
                canAccommodateDuration={resolvedCanAccommodateDuration}
                getAdjustedStartTime={resolvedGetAdjustedStartTime}
                getTimeSlotsForDuration={resolvedGetTimeSlotsForDuration}
                isSlotHighlighted={resolvedIsSlotHighlighted}
                getDurationLabel={getDurationLabel}
                onDateSelect={setSelectedDate}
                onCalendarClick={() => setShowDatePicker(true)}
                onCloseDatePicker={() => setShowDatePicker(false)}
                onTimeSelect={setSelectedTime}
                onDurationChange={setDuration}
                entityType={entityType}
                dateInputRef={dateInputRef}
                courtSection={courtSection}
              />
            )}
          </div>
        </div>

        <div ref={summarySectionRefs.participants}>
        <ParticipantsSection
          participants={participants}
          maxParticipants={maxParticipants}
          invitedPlayerIds={invitedPlayerIds}
          invitedPlayers={invitedPlayers}
          user={user}
          entityType={entityType}
          canInvitePlayers={true}
          creatorNonPlaying={creatorNonPlaying}
          allowedParticipantOptions={allowedParticipantOptions}
          playersPerMatch={entityType === 'GAME' || entityType === 'LEAGUE' ? playersPerMatch : undefined}
          allowedPlayerCountsPerMatch={
            entityType === 'GAME' || entityType === 'LEAGUE'
              ? sportConfig.allowedPlayerCountsPerMatch
              : undefined
          }
          onPlayersPerMatchChange={
            entityType === 'GAME' || entityType === 'LEAGUE' ? handlePlayersPerMatchChange : undefined
          }
          onMaxParticipantsChange={handleMaxParticipantsChange}
          onAddUserToGame={handleAddMeToGame}
          onRemoveParticipant={handleRemoveParticipant}
          onRemoveInvitedPlayer={handleRemoveInvitedPlayer}
          onOpenInviteModal={() => setIsInvitePlayersModalOpen(true)}
          onToggleCreatorNonPlaying={(nonPlaying) => {
            setCreatorNonPlaying(nonPlaying);
            if (nonPlaying && user?.id) {
              setParticipants(prev => prev.filter(id => id !== user.id));
            } else if (!nonPlaying && user?.id && !participants.includes(user.id)) {
              setParticipants(prev => [...prev, user.id]);
            }
          }}
          showSetupControls={false}
          playerLevelRange={playerLevelRange}
          onPlayerLevelRangeChange={setPlayerLevelRange}
        />
        </div>

        <div ref={summarySectionRefs.settings}>
        <GameSettingsSection
          isPublic={isPublic}
          isRatingGame={isRatingGame}
          anyoneCanInvite={anyoneCanInvite}
          resultsByAnyone={resultsByAnyone}
          allowDirectJoin={allowDirectJoin}
          afterGameGoToBar={afterGameGoToBar}
          participantsOnlyChat={participantsOnlyChat}
          entityType={entityType}
          onPublicChange={setIsPublic}
          onRatingGameChange={setIsRatingGame}
          onAnyoneCanInviteChange={setAnyoneCanInvite}
          onResultsByAnyoneChange={setResultsByAnyone}
          onAllowDirectJoinChange={setAllowDirectJoin}
          onAfterGameGoToBarChange={setAfterGameGoToBar}
          onParticipantsOnlyChatChange={setParticipantsOnlyChat}
          hideRatingGame={showTemplatePicker}
        />
        </div>

        <div ref={summarySectionRefs.name}>
        <GameNameCommentsSection
          name={gameName}
          comments={comments}
          onNameChange={setGameName}
          onCommentsChange={setComments}
          entityType={entityType}
        />
        </div>

        <div ref={summarySectionRefs.price}>
        <PriceSection
          priceTotal={priceTotal}
          priceType={priceType}
          priceCurrency={priceCurrency}
          defaultCurrency={user?.defaultCurrency as PriceCurrency | undefined}
          onPriceTotalChange={setPriceTotal}
          onPriceTypeChange={setPriceType}
          onPriceCurrencyChange={setPriceCurrency}
        />
        </div>

        <Button
          onClick={handleCreateGame}
          disabled={loading || createDisabledByAuth}
          className="w-full py-3 text-base font-semibold mt-4 flex items-center justify-center gap-2"
          size="lg"
        >
          {loading ? (
            t('common.loading')
          ) : (
            <>
              <Plus size={20} />
              {createButtonLabel}
            </>
          )}
        </Button>
        </div>
        </div>
      </div>

      {selectedPlayerId && (
        <PlayerCardBottomSheet
          playerId={selectedPlayerId}
          onClose={() => setSelectedPlayerId(null)}
        />
      )}

      {isInvitePlayersModalOpen && (() => {
        const selectedClubData = clubs.find((c) => c.id === selectedClub);
        let inviteGameTiming: { timeIsSet: boolean; startTime: string; endTime: string; timeZone: string | null } | null = null;
        if (selectedTime && selectedDate && duration && selectedClubData) {
          try {
            const start = createDateFromClubTime(selectedDate, selectedTime, selectedClubData);
            const end = addHours(start, duration);
            inviteGameTiming = {
              timeIsSet: true,
              startTime: start.toISOString(),
              endTime: end.toISOString(),
              timeZone: getClubTimezone(selectedClubData),
            };
          } catch {
            inviteGameTiming = null;
          }
        }
        return (
          <PlayerListModal
            onClose={() => setIsInvitePlayersModalOpen(false)}
            multiSelect={true}
            gameSport={selectedSport}
            gameTiming={inviteGameTiming}
            onConfirm={async (playerIds, meta) => {
              setInvitedPlayerIds(playerIds);
              setInviteUserTeamByReceiverId(meta?.userTeamIdByReceiverId ?? {});
              try {
                const { fetchPlayers, users } = usePlayersStore.getState();
                await fetchPlayers(undefined, selectedSport);
                const selectedPlayers = playerIds
                  .map(id => users[id])
                  .filter((p): p is BasicUser => p !== undefined);
                setInvitedPlayers(selectedPlayers);
              } catch (error) {
                console.error('Failed to fetch invited players data:', error);
              }
            }}
            preSelectedIds={invitedPlayerIds}
          />
        );
      })()}

      {isFormatWizardOpen && entityType !== 'BAR' && entityType !== 'TRAINING' && (
        <GameFormatWizard
          isOpen={isFormatWizardOpen}
          format={gameFormat}
          wizardEntityType={entityType}
          generationSlotCount={maxParticipants > 0 ? maxParticipants : undefined}
          hasFixedTeams={hasFixedTeams}
          allowedScoringModes={allowedScoringModes}
          allowedScoringPresets={templateFlow.wizardAllowedPresets}
          playersPerMatch={playersPerMatch}
          sport={selectedSport}
          onDone={closeFormatWizard}
          onClose={closeFormatWizard}
        />
      )}

      <ConfirmationModal
        isOpen={softOverlapOpen}
        tone="warning"
        title={t('createGame.overlapSoftTitle')}
        message={t('createGame.overlapSoftMessage')}
        confirmText={t('createGame.overlapSoftProceed')}
        cancelText={t('common.cancel')}
        onConfirm={() => {
          setSoftOverlapOpen(false);
          void executeCreateGame();
        }}
        onClose={() => setSoftOverlapOpen(false)}
      />

      <MarkCourtBookedModal
        isOpen={markCourtOpen}
        onMarkBooked={() =>
          void handleMarkCourtBooked(async (gameId) => {
            await gamesApi.update(gameId, { hasBookedCourt: true });
          })
        }
        onSkip={handleSkipMarkCourt}
      />

      {confirmModalProps ? <BooktimeCreateGameConfirmModal {...confirmModalProps} /> : null}
    </div>
    </SportLevelProvider>
  );
};



