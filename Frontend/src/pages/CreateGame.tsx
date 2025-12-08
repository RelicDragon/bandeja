import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Button, PlayerListModal, PlayerCardBottomSheet, CreateGameHeader, LocationSection, PlayerLevelSection, ParticipantsSection, GameSettingsSection, GameNameSection, CommentsSection, GameStartSection, GameSetupSection, GameSetupModal, MultipleCourtsSelector, AvatarUpload, PriceSection } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { clubsApi, courtsApi, gamesApi, invitesApi } from '@/api';
import { usersApi } from '@/api/users';
import { gameCourtsApi } from '@/api/gameCourts';
import { mediaApi } from '@/api/media';
import { Club, Court, EntityType, GameType, PriceType, PriceCurrency } from '@/types';
import { InvitablePlayer } from '@/api/users';
import { addHours } from 'date-fns';
import { applyGameTypeTemplate } from '@/utils/gameTypeTemplates';
import { useGameTimeDuration } from '@/hooks/useGameTimeDuration';

interface CreateGameProps {
  entityType: EntityType;
  initialDate?: Date | null;
}

export const CreateGame = ({ entityType, initialDate }: CreateGameProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  console.log('CreateGame - initialDate received:', initialDate, typeof initialDate);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>('');
  const [selectedCourt, setSelectedCourt] = useState<string>('notBooked');
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>([1.0, 7.0]);
  const [maxParticipants, setMaxParticipants] = useState<number>(() => {
    return entityType === 'TOURNAMENT' ? 8 : 4;
  });
  const [participants, setParticipants] = useState<Array<string | null>>([user?.id || null]);
  const [anyoneCanInvite, setAnyoneCanInvite] = useState<boolean>(false);
  const [hasBookedCourt, setHasBookedCourt] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [isRatingGame, setIsRatingGame] = useState<boolean>(true);
  const [resultsByAnyone, setResultsByAnyone] = useState<boolean>(false);
  const [allowDirectJoin, setAllowDirectJoin] = useState<boolean>(false);
  const [afterGameGoToBar, setAfterGameGoToBar] = useState<boolean>(false);
  const [hasFixedTeams, setHasFixedTeams] = useState<boolean>(false);
  const [genderTeams, setGenderTeams] = useState<'ANY' | 'MEN' | 'WOMEN' | 'MIX_PAIRS'>('ANY');
  const [gameType, setGameType] = useState<GameType>('CLASSIC');
  const [gameName, setGameName] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [priceTotal, setPriceTotal] = useState<number | undefined>(undefined);
  const [priceType, setPriceType] = useState<PriceType>('NOT_KNOWN');
  const [priceCurrency, setPriceCurrency] = useState<PriceCurrency | undefined>(undefined);
  const [storedInitialDate] = useState<Date>(() => {
    if (initialDate) {
      const date = initialDate instanceof Date ? initialDate : new Date(initialDate);
      console.log('CreateGame - storedInitialDate set to:', date);
      return date;
    }
    console.log('CreateGame - no initialDate, using current date');
    return new Date();
  });
  const [loading, setLoading] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isInvitePlayersModalOpen, setIsInvitePlayersModalOpen] = useState(false);
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<string[]>([]);
  const [invitedPlayers, setInvitedPlayers] = useState<InvitablePlayer[]>([]);
  
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
  const [isGameSetupModalOpen, setIsGameSetupModalOpen] = useState(false);
  const [gameSetup, setGameSetup] = useState<{
    fixedNumberOfSets?: number;
    maxTotalPointsPerSet?: number;
    maxPointsPerTeam?: number;
    winnerOfGame?: any;
    winnerOfMatch?: any;
    matchGenerationType?: any;
    prohibitMatchesEditing?: boolean;
    pointsPerWin?: number;
    pointsPerLoose?: number;
    pointsPerTie?: number;
  }>({});
  const [selectedCourtIds, setSelectedCourtIds] = useState<string[]>([]);
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
        setSelectedCourt('notBooked');
        setHasBookedCourt(false);
        return;
      }
      try {
        const response = await courtsApi.getByClubId(selectedClub);
        setCourts(response.data);
        
        // Auto-select court if there's only one court in the club
        if (response.data.length === 1) {
          setSelectedCourt(response.data[0].id);
          setHasBookedCourt(false); // Default to false as specified
        } else {
          setSelectedCourt('notBooked');
        }
        
        // Reset to stored initial date or auto-select based on time slots
        console.log('CreateGame - club changed, resetting to storedInitialDate:', storedInitialDate);
        const initialDateTimeSlots = generateTimeOptionsForDate(storedInitialDate);
        console.log('CreateGame - time slots for stored date:', initialDateTimeSlots.length);
        if (initialDateTimeSlots.length > 0) {
          setSelectedDate(storedInitialDate);
          console.log('CreateGame - date set to storedInitialDate');
        } else {
          // If initial date has no time slots, check tomorrow
          const tomorrow = new Date(storedInitialDate);
          tomorrow.setDate(tomorrow.getDate() + 1);
          const tomorrowTimeSlots = generateTimeOptionsForDate(tomorrow);
          console.log('CreateGame - time slots for tomorrow:', tomorrowTimeSlots.length);
          if (tomorrowTimeSlots.length > 0) {
            setSelectedDate(tomorrow);
            console.log('CreateGame - date set to tomorrow');
          } else {
            setSelectedDate(storedInitialDate);
            console.log('CreateGame - date set to storedInitialDate (fallback)');
          }
        }
      } catch (error) {
        console.error('Failed to fetch courts:', error);
      }
    };
    fetchCourts();
  }, [selectedClub, generateTimeOptionsForDate, storedInitialDate, setSelectedDate]);

  useEffect(() => {
    if (selectedCourt === 'notBooked') {
      setHasBookedCourt(false);
    }
  }, [selectedCourt]);

  useEffect(() => {
    // Clear selected time when club changes to force manual selection
    if (selectedClub) {
      setSelectedTime('');
    }
  }, [selectedClub, setSelectedTime]);

  useEffect(() => {
    if (entityType === 'TOURNAMENT') {
      setMaxParticipants(prev => {
        if (prev < 8) {
          setParticipants(p => p.length > 8 ? p.slice(0, 8) : p);
          return 8;
        }
        if (prev > 32) {
          setParticipants(p => p.length > 32 ? p.slice(0, 32) : p);
          return 32;
        }
        if (prev % 2 !== 0) {
          const evenValue = Math.ceil(prev / 2) * 2;
          setParticipants(p => p.length > evenValue ? p.slice(0, evenValue) : p);
          return evenValue;
        }
        return prev;
      });
    }
  }, [entityType]);

  useEffect(() => {
    const template = applyGameTypeTemplate(gameType);
    setGameSetup(prevSetup => ({
      ...prevSetup,
      winnerOfMatch: template.winnerOfMatch,
      winnerOfGame: template.winnerOfGame,
      matchGenerationType: template.matchGenerationType,
      prohibitMatchesEditing: template.prohibitMatchesEditing ?? false,
      pointsPerWin: template.pointsPerWin ?? 0,
      pointsPerLoose: template.pointsPerLoose ?? 0,
      pointsPerTie: template.pointsPerTie ?? 0,
      ballsInGames: template.ballsInGames ?? false,
      fixedNumberOfSets: template.fixedNumberOfSets ?? 0,
    }));
  }, [gameType]);

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

  const scrollToAndHighlightError = (ref: React.RefObject<HTMLDivElement>) => {
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

      const gameResponse = await gamesApi.create({
        entityType: entityType,
        gameType: gameType,
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
        affectsRating: isRatingGame,
        anyoneCanInvite,
        resultsByAnyone: entityType === 'TOURNAMENT' ? false : resultsByAnyone,
        allowDirectJoin,
        hasBookedCourt: hasBookedCourt,
        afterGameGoToBar: afterGameGoToBar,
        hasFixedTeams: hasFixedTeams,
        genderTeams: genderTeams,
        name: gameName || undefined,
        description: comments,
        participants: participants.filter((id): id is string => id !== null) as any,
        priceTotal: priceType !== 'NOT_KNOWN' && priceType !== 'FREE' ? priceTotal : undefined,
        priceType: priceType,
        priceCurrency: priceType !== 'NOT_KNOWN' && priceType !== 'FREE' ? priceCurrency : undefined,
        ...gameSetup,
      });

      if (pendingAvatarFiles && gameResponse.data.id) {
        try {
          await mediaApi.uploadGameAvatar(gameResponse.data.id, pendingAvatarFiles.avatar, pendingAvatarFiles.original);
        } catch (avatarError) {
          console.error('Failed to upload game avatar:', avatarError);
        }
      }

      if (invitedPlayerIds.length > 0 && gameResponse.data.id) {
        try {
          await invitesApi.sendMultiple({
            receiverIds: invitedPlayerIds,
            gameId: gameResponse.data.id,
          });
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

      navigate('/');
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
    setInvitedPlayers(invitedPlayers.filter(p => p.id !== playerId));
  };

  const handleGameSetupConfirm = (params: {
    fixedNumberOfSets: number;
    maxTotalPointsPerSet: number;
    maxPointsPerTeam: number;
    winnerOfGame: any;
    winnerOfMatch: any;
    matchGenerationType: any;
    prohibitMatchesEditing?: boolean;
    pointsPerWin: number;
    pointsPerLoose: number;
    pointsPerTie: number;
    ballsInGames: boolean;
  }) => {
    setGameSetup(params);
  };

  const hasGameSetup = Object.keys(gameSetup).length > 0;

  const handleAvatarUpload = async (avatarFile: File, originalFile: File) => {
    setPendingAvatarFiles({ avatar: avatarFile, original: originalFile });
  };

  const handleAvatarRemove = async () => {
    setPendingAvatarFiles(null);
  };

  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-900 flex flex-col" style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}>
      <CreateGameHeader onBack={() => navigate('/')} entityType={entityType} />

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
          onMaxParticipantsChange={handleMaxParticipantsChange}
          onAddUserToGame={handleAddMeToGame}
          onRemoveParticipant={handleRemoveParticipant}
          onRemoveInvitedPlayer={handleRemoveInvitedPlayer}
          onOpenInviteModal={() => setIsInvitePlayersModalOpen(true)}
        />

        <GameSettingsSection
          isPublic={isPublic}
          isRatingGame={isRatingGame}
          anyoneCanInvite={anyoneCanInvite}
          resultsByAnyone={resultsByAnyone}
          allowDirectJoin={allowDirectJoin}
          afterGameGoToBar={afterGameGoToBar}
          hasFixedTeams={hasFixedTeams}
          genderTeams={genderTeams}
          gameType={gameType}
          maxParticipants={maxParticipants}
          entityType={entityType}
          onPublicChange={setIsPublic}
          onRatingGameChange={setIsRatingGame}
          onAnyoneCanInviteChange={setAnyoneCanInvite}
          onResultsByAnyoneChange={setResultsByAnyone}
          onAllowDirectJoinChange={setAllowDirectJoin}
          onAfterGameGoToBarChange={setAfterGameGoToBar}
          onHasFixedTeamsChange={setHasFixedTeams}
          onGenderTeamsChange={setGenderTeams}
          onGameTypeChange={setGameType}
        />

        <GameSetupSection
          onOpenSetup={() => setIsGameSetupModalOpen(true)}
          hasSetup={hasGameSetup}
        />

        {maxParticipants > 4 && (
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
          onPriceTotalChange={setPriceTotal}
          onPriceTypeChange={setPriceType}
          onPriceCurrencyChange={setPriceCurrency}
        />

        <div ref={timeSectionRef}>
          <div ref={durationSectionRef}>
            <GameStartSection
              selectedDate={selectedDate}
              selectedTime={selectedTime}
              duration={duration}
              showPastTimes={showPastTimes}
              showDatePicker={showDatePicker}
              selectedClub={selectedClub}
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

      {isInvitePlayersModalOpen && (
        <PlayerListModal
          onClose={() => setIsInvitePlayersModalOpen(false)}
          multiSelect={true}
          onConfirm={async (playerIds: string[]) => {
            setInvitedPlayerIds(playerIds);
            try {
              const allPlayersResponse = await usersApi.getInvitablePlayers();
              const selectedPlayers = allPlayersResponse.data.filter(p => playerIds.includes(p.id));
              setInvitedPlayers(selectedPlayers);
            } catch (error) {
              console.error('Failed to fetch invited players data:', error);
            }
          }}
          preSelectedIds={invitedPlayerIds}
        />
      )}

      {isGameSetupModalOpen && (
        <GameSetupModal
          isOpen={isGameSetupModalOpen}
          entityType={entityType}
          isEditing={true}
          confirmButtonText={t('common.save')}
          initialValues={gameSetup}
          onClose={() => setIsGameSetupModalOpen(false)}
          onConfirm={handleGameSetupConfirm}
        />
      )}
    </div>
  );
};



