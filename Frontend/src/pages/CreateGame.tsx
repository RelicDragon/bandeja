import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, PlayerListModal, PlayerCardBottomSheet, CreateGameHeader, LocationSection, PlayerLevelSection, ParticipantsSection, GameSettingsSection, GameNameSection, CommentsSection, GameStartSection, GameFormatCard, GameFormatWizard, MultipleCourtsSelector, AvatarUpload, PriceSection } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { usePlayersStore } from '@/store/playersStore';
import { useNavigationStore } from '@/store/navigationStore';
import { clubsApi, courtsApi, gamesApi, invitesApi } from '@/api';
import { gameCourtsApi } from '@/api/gameCourts';
import { mediaApi } from '@/api/media';
import { Club, Court, EntityType, GenderTeam, PriceType, PriceCurrency, Game, BasicUser } from '@/types';
import { addHours, format, startOfDay } from 'date-fns';
import { useGameFormat } from '@/hooks/useGameFormat';
import { resolveUserCurrency } from '@/utils/currency';
import { useGameTimeDuration, formatTimeInClubTimezone, createDateFromClubTime, getClubTimezone } from '@/hooks/useGameTimeDuration';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { handleBack } from '@/utils/backNavigation';
import { resultsRoundGenV2Payload } from '@/utils/resultsRoundGenV2';
import { maxSlotsForUserGameOrLeague, maxSlotsForUserTournament } from '@/utils/userMaxParticipantsInGame';

interface CreateGameProps {
  entityType: EntityType;
  initialGameData?: Partial<Game>;
}

const getDefaultLevelRange = (level?: number): [number, number] => {
  if (typeof level !== 'number' || Number.isNaN(level)) {
    return [1.0, 7.0];
  }

  const minLevel = Math.max(1.0, Math.min(7.0, level - 0.7));
  const maxLevel = Math.max(1.0, Math.min(7.0, level + 0.7));
  return [minLevel, maxLevel];
};

export const CreateGame = ({ entityType, initialGameData }: CreateGameProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);
  const { setCurrentPage, setIsAnimating, setActiveTab, setMyGamesSubtabBeforeCreate, setMyGamesCalendarDateAfterCreate } = useNavigationStore();

  useBackButtonHandler(() => {
    handleBack(navigate);
    return true;
  });

  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>(() => initialGameData?.clubId || '');
  const [selectedCourt, setSelectedCourt] = useState<string>(() => initialGameData?.courtId || 'notBooked');
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>(() => [
    initialGameData?.minLevel ?? getDefaultLevelRange(user?.level)[0],
    initialGameData?.maxLevel ?? getDefaultLevelRange(user?.level)[1]
  ]);
  const [maxParticipants, setMaxParticipants] = useState<number>(() => {
    return initialGameData?.maxParticipants ?? (entityType === 'TOURNAMENT' ? 8 : 4);
  });
  const [participants, setParticipants] = useState<Array<string | null>>([user?.id || null]);
  const [anyoneCanInvite, setAnyoneCanInvite] = useState<boolean>(initialGameData?.anyoneCanInvite ?? false);
  const [hasBookedCourt, setHasBookedCourt] = useState<boolean>(initialGameData?.hasBookedCourt ?? false);
  const [isPublic, setIsPublic] = useState<boolean>(initialGameData?.isPublic ?? true);
  const [isRatingGame, setIsRatingGame] = useState<boolean>(initialGameData?.affectsRating ?? true);
  const [resultsByAnyone, setResultsByAnyone] = useState<boolean>(initialGameData?.resultsByAnyone ?? false);
  const [allowDirectJoin, setAllowDirectJoin] = useState<boolean>(initialGameData?.allowDirectJoin ?? false);
  const [afterGameGoToBar, setAfterGameGoToBar] = useState<boolean>(initialGameData?.afterGameGoToBar ?? false);
  const gameFormat = useGameFormat({ ...initialGameData, maxParticipants });
  const [genderTeams, setGenderTeams] = useState<GenderTeam>(
    (initialGameData?.genderTeams as GenderTeam) ?? 'ANY',
  );
  const [hasFixedTeams, setHasFixedTeams] = useState<boolean>(initialGameData?.hasFixedTeams ?? false);
  const [gameName, setGameName] = useState<string>(initialGameData?.name || '');
  const [comments, setComments] = useState<string>(initialGameData?.description || '');
  const [priceTotal, setPriceTotal] = useState<number | undefined>(initialGameData?.priceTotal ?? undefined);
  const [priceType, setPriceType] = useState<PriceType>(initialGameData?.priceType || 'NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(initialGameData?.priceCurrency ?? undefined);
  const [storedInitialDate] = useState<Date>(() => {
    if (initialGameData?.startTime) {
      return new Date(initialGameData.startTime);
    }
    return new Date();
  });
  const [loading, setLoading] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
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
    showPastTimes,
    setShowPastTimes,
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
    showPastTimes: false,
  });
  const [isFormatWizardOpen, setIsFormatWizardOpen] = useState(false);
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>(() => {
    return initialGameData?.gameCourts?.map(gc => gc.courtId) || [];
  });
  const [pendingAvatarFiles, setPendingAvatarFiles] = useState<{ avatar: File; original: File } | null>(null);
  const [avatarPreviewUrl, setAvatarPreviewUrl] = useState<string | undefined>(undefined);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const clubSectionRef = useRef<HTMLDivElement>(null);
  const timeSectionRef = useRef<HTMLDivElement>(null);
  const durationSectionRef = useRef<HTMLDivElement>(null);


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

  useEffect(() => {
    const fetchCourts = async () => {
      if (!selectedClub) {
        setCourts([]);
        if (!initialGameData?.courtId) {
          setSelectedCourt('notBooked');
          setHasBookedCourt(false);
        } else {
          setHasBookedCourt(initialGameData?.hasBookedCourt ?? false);
        }
        return;
      }
      try {
        const response = await courtsApi.getByClubId(selectedClub);
        setCourts(response.data);
        
        // Set court from initialGameData if available
        if (initialGameData?.courtId && response.data.some(c => c.id === initialGameData.courtId)) {
          setSelectedCourt(initialGameData.courtId);
          setHasBookedCourt(initialGameData.hasBookedCourt ?? false);
        } else if (response.data.length === 1) {
          setSelectedCourt(response.data[0].id);
          setHasBookedCourt(false);
        } else {
          setSelectedCourt('notBooked');
          setHasBookedCourt(false);
        }
        
        const initialDateTimeSlots = generateTimeOptionsForDate(storedInitialDate);
        if (initialDateTimeSlots.length > 0) {
          setSelectedDate(storedInitialDate);
        } else {
          const tomorrow = new Date(storedInitialDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowTimeSlots = generateTimeOptionsForDate(tomorrow);
          setSelectedDate(tomorrowTimeSlots.length > 0 ? tomorrow : storedInitialDate);
        }
      } catch (error) {
        console.error('Failed to fetch courts:', error);
      }
    };
    fetchCourts();
  }, [selectedClub, generateTimeOptionsForDate, storedInitialDate, setSelectedDate, initialGameData]);

  useEffect(() => {
    if (selectedCourt === 'notBooked') {
      setHasBookedCourt(false);
    }
  }, [selectedCourt]);

  useEffect(() => {
    if (initialGameData?.minLevel !== undefined || initialGameData?.maxLevel !== undefined) {
      return;
    }

    if (playerLevelRange[0] === 1.0 && playerLevelRange[1] === 7.0) {
      setPlayerLevelRange(getDefaultLevelRange(user?.level));
    }
  }, [initialGameData?.maxLevel, initialGameData?.minLevel, playerLevelRange, user?.level]);

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

  const getDurationLabel = (dur: number) => {
    if (dur === Math.floor(dur)) {
      return t('createGame.hours', { count: dur });
    } else {
      const hours = Math.floor(dur);
      const minutes = (dur % 1) * 60;
      return t('createGame.hoursMinutes', { hours, minutes });
    }
  };

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
      scrollToAndHighlightError(clubSectionRef);
      return;
    }

    if (!selectedTime || selectedTime === '') {
      scrollToAndHighlightError(timeSectionRef);
      return;
    }

    if (!duration) {
      scrollToAndHighlightError(durationSectionRef);
      return;
    }

    setLoading(true);
    try {
      const selectedClubData = clubs.find(c => c.id === selectedClub);
      const { createDateFromClubTime } = await import('@/hooks/useGameTimeDuration');
      const startTime = createDateFromClubTime(selectedDate, selectedTime, selectedClubData);
      const endTime = addHours(startTime, duration);

      const gameData: any = {
        entityType: entityType,
        clubId: selectedClub || undefined,
        courtId: selectedCourt !== 'notBooked' ? selectedCourt : undefined,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        timeIsSet: true,
        maxParticipants,
        minParticipants: 2,
        minLevel: playerLevelRange[0],
        maxLevel: playerLevelRange[1],
        isPublic,
        anyoneCanInvite,
        allowDirectJoin,
        hasBookedCourt: hasBookedCourt,
        afterGameGoToBar: afterGameGoToBar,
        name: gameName || undefined,
        description: comments,
        participants: participants.filter((id): id is string => id !== null) as any,
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
        gameData.pointsPerWin = setup.pointsPerWin;
        gameData.pointsPerLoose = setup.pointsPerLoose;
        gameData.pointsPerTie = setup.pointsPerTie;
        gameData.fixedNumberOfSets = setup.fixedNumberOfSets;
        gameData.maxTotalPointsPerSet = setup.maxTotalPointsPerSet;
        gameData.matchTimedCapMinutes = setup.matchTimedCapMinutes;
        gameData.maxPointsPerTeam = setup.maxPointsPerTeam;
        gameData.winnerOfGame = setup.winnerOfGame;
        gameData.winnerOfMatch = setup.winnerOfMatch;
        gameData.matchGenerationType = setup.matchGenerationType;
        Object.assign(gameData, resultsRoundGenV2Payload);
        gameData.prohibitMatchesEditing = setup.prohibitMatchesEditing;
        gameData.ballsInGames = setup.ballsInGames;
        gameData.scoringPreset = setup.scoringPreset;
        gameData.scoringMode = gameFormat.scoringMode;
        gameData.hasGoldenPoint = setup.hasGoldenPoint;
      }

      if (entityType === 'GAME' || entityType === 'TOURNAMENT' || entityType === 'LEAGUE') {
        gameData.genderTeams = genderTeams;
      }

      const gameResponse = await gamesApi.create(gameData);

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

      if (selectedCourtIds.length > 0 && gameResponse.data.id) {
        try {
          await gameCourtsApi.setGameCourts(gameResponse.data.id, selectedCourtIds);
        } catch (courtError) {
          console.error('Failed to set game courts:', courtError);
        }
      }

      setIsAnimating(true);
      setCurrentPage('my');
      const fromList = useNavigationStore.getState().myGamesSubtabBeforeCreate;
      setMyGamesSubtabBeforeCreate(null);
      if (fromList === 'list') {
        navigate('/?tab=list', { replace: true });
      } else {
        const startDate = format(startOfDay(new Date(gameResponse.data.startTime)), 'yyyy-MM-dd');
        setMyGamesCalendarDateAfterCreate(startDate);
        setActiveTab('calendar');
        navigate('/', { replace: true });
      }
      setTimeout(() => setIsAnimating(false), 300);
    } catch (error) {
      console.error('Failed to create game:', error);
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
    if (num === 2) {
      setHasFixedTeams(false);
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

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <CreateGameHeader onBack={() => handleBack(navigate)} entityType={entityType} />

      <div className="flex-1 overflow-y-auto">
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

        {entityType !== 'BAR' && entityType !== 'TRAINING' && (
          <GameFormatCard
            entityType={entityType}
            format={gameFormat}
            generationSlotCount={maxParticipants > 0 ? maxParticipants : undefined}
            onOpenWizard={() => setIsFormatWizardOpen(true)}
            teams={{
              participantCount: maxParticipants,
              genderTeams,
              hasFixedTeams,
              onGenderTeamsChange: setGenderTeams,
              onHasFixedTeamsChange: setHasFixedTeams,
              genderSwitchLayoutId: 'createGameFormatCardTeams',
            }}
          />
        )}

        <div ref={clubSectionRef}>
          <LocationSection
            clubs={clubs}
            courts={courts}
            selectedClub={selectedClub}
            selectedCourt={selectedCourt}
            hasBookedCourt={hasBookedCourt}
            isClubModalOpen={isClubModalOpen}
            isCourtModalOpen={isCourtModalOpen}
            entityType={entityType}
            onSelectClub={(id: string) => {
              setSelectedClub(id);
              setSelectedCourt('notBooked');
            }}
            onSelectCourt={setSelectedCourt}
            onToggleHasBookedCourt={setHasBookedCourt}
            onOpenClubModal={() => setIsClubModalOpen(true)}
            onCloseClubModal={() => setIsClubModalOpen(false)}
            onOpenCourtModal={() => setIsCourtModalOpen(true)}
            onCloseCourtModal={() => setIsCourtModalOpen(false)}
          />
        </div>

        <div ref={timeSectionRef}>
          <div ref={durationSectionRef}>
            <GameStartSection
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              duration={duration}
              showPastTimes={showPastTimes}
              showDatePicker={showDatePicker}
              selectedClub={selectedClub}
              selectedCourt={selectedCourt}
              club={clubs.find(c => c.id === selectedClub)}
              generateTimeOptions={generateTimeOptions}
              generateTimeOptionsForDate={generateTimeOptionsForDate}
              canAccommodateDuration={canAccommodateDuration}
              getAdjustedStartTime={getAdjustedStartTime}
              getTimeSlotsForDuration={getTimeSlotsForDuration}
              isSlotHighlighted={isSlotHighlighted}
              getDurationLabel={getDurationLabel}
              onDateSelect={(date) => {
                setSelectedDate(date);
              }}
              onCalendarClick={() => setShowDatePicker(true)}
              onToggleShowPastTimes={setShowPastTimes}
              onCloseDatePicker={() => setShowDatePicker(false)}
              onTimeSelect={setSelectedTime}
              onDurationChange={setDuration}
              entityType={entityType}
              dateInputRef={dateInputRef}
            />
          </div>
        </div>

        {entityType !== 'BAR' && entityType !== 'TRAINING' && (
          <PlayerLevelSection
            playerLevelRange={playerLevelRange}
            onPlayerLevelRangeChange={setPlayerLevelRange}
            entityType={entityType}
          />
        )}

        <ParticipantsSection
          participants={participants}
          maxParticipants={maxParticipants}
          invitedPlayerIds={invitedPlayerIds}
          invitedPlayers={invitedPlayers}
          user={user}
          entityType={entityType}
          canInvitePlayers={true}
          creatorNonPlaying={creatorNonPlaying}
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
        />

        <GameSettingsSection
          isPublic={isPublic}
          isRatingGame={isRatingGame}
          anyoneCanInvite={anyoneCanInvite}
          resultsByAnyone={resultsByAnyone}
          allowDirectJoin={allowDirectJoin}
          afterGameGoToBar={afterGameGoToBar}
          entityType={entityType}
          onPublicChange={setIsPublic}
          onRatingGameChange={setIsRatingGame}
          onAnyoneCanInviteChange={setAnyoneCanInvite}
          onResultsByAnyoneChange={setResultsByAnyone}
          onAllowDirectJoinChange={setAllowDirectJoin}
          onAfterGameGoToBarChange={setAfterGameGoToBar}
        />

        {maxParticipants > 4 && entityType !== 'BAR' && (
          <MultipleCourtsSelector
            courts={courts}
            selectedClub={selectedClub}
            entityType={entityType}
            isEditing={true}
            onCourtsChange={setSelectedCourtIds}
          />
        )}

        <GameNameSection
          name={gameName}
          onNameChange={setGameName}
          entityType={entityType}
        />

        <CommentsSection
          comments={comments}
          onCommentsChange={setComments}
          entityType={entityType}
        />

        <PriceSection
          priceTotal={priceTotal}
          priceType={priceType}
          priceCurrency={priceCurrency}
          defaultCurrency={user?.defaultCurrency as PriceCurrency | undefined}
          onPriceTotalChange={setPriceTotal}
          onPriceTypeChange={setPriceType}
          onPriceCurrencyChange={setPriceCurrency}
        />

        <Button
          onClick={handleCreateGame}
          disabled={loading}
          className="w-full py-3 text-base font-semibold mt-4 flex items-center justify-center gap-2"
          size="lg"
        >
          {loading ? (
            t('common.loading')
          ) : (
            <>
              <Plus size={20} />
              {entityType === 'TOURNAMENT' ? t('createGame.createButtonTournament') :
               entityType === 'LEAGUE' ? t('createGame.createButtonLeague') :
               entityType === 'BAR' ? t('createGame.createButtonBar') :
               entityType === 'TRAINING' ? t('createGame.createButtonTraining') :
               t('createGame.createButton')}
            </>
          )}
        </Button>
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
            gameTiming={inviteGameTiming}
            onConfirm={async (playerIds, meta) => {
              setInvitedPlayerIds(playerIds);
              setInviteUserTeamByReceiverId(meta?.userTeamIdByReceiverId ?? {});
              try {
                const { fetchPlayers, users } = usePlayersStore.getState();
                await fetchPlayers();
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
          onClose={() => setIsFormatWizardOpen(false)}
        />
      )}
    </div>
  );
};



