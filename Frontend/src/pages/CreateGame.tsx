import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, PlayerListModal, PlayerCardBottomSheet, CreateGameHeader, LocationSection, PlayerLevelSection, ParticipantsSection, GameSettingsSection, GameNameSection, CommentsSection, GameStartSection } from '@/components';
import { useAuthStore } from '@/store/authStore';
import { clubsApi, courtsApi, gamesApi, invitesApi } from '@/api';
import { usersApi } from '@/api/users';
import { Club, Court, EntityType } from '@/types';
import { InvitablePlayer } from '@/api/users';
import { addHours } from 'date-fns';

interface CreateGameProps {
  entityType: EntityType;
}

export const CreateGame = ({ entityType }: CreateGameProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = useAuthStore((state) => state.user);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedClub, setSelectedClub] = useState<string>('');
  const [selectedCourt, setSelectedCourt] = useState<string>('notBooked');
  const [playerLevelRange, setPlayerLevelRange] = useState<[number, number]>([1.0, 7.0]);
  const [maxParticipants, setMaxParticipants] = useState<number>(4);
  const [participants, setParticipants] = useState<Array<string | null>>([user?.id || null]);
  const [anyoneCanInvite, setAnyoneCanInvite] = useState<boolean>(false);
  const [hasBookedCourt, setHasBookedCourt] = useState<boolean>(false);
  const [isPublic, setIsPublic] = useState<boolean>(true);
  const [isRatingGame, setIsRatingGame] = useState<boolean>(true);
  const [resultsByAnyone, setResultsByAnyone] = useState<boolean>(false);
  const [afterGameGoToBar, setAfterGameGoToBar] = useState<boolean>(false);
  const [hasFixedTeams, setHasFixedTeams] = useState<boolean>(false);
  const [gameName, setGameName] = useState<string>('');
  const [comments, setComments] = useState<string>('');
  const [selectedDate, setSelectedDate] = useState<Date>(new Date());
  const [selectedTime, setSelectedTime] = useState<string>('18:00');
  const [duration, setDuration] = useState<number>(2);
  const [loading, setLoading] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [selectedPlayerId, setSelectedPlayerId] = useState<string | null>(null);
  const [isInvitePlayersModalOpen, setIsInvitePlayersModalOpen] = useState(false);
  const [invitedPlayerIds, setInvitedPlayerIds] = useState<string[]>([]);
  const [invitedPlayers, setInvitedPlayers] = useState<InvitablePlayer[]>([]);
  const [showPastTimes, setShowPastTimes] = useState<boolean>(false);
  const dateInputRef = useRef<HTMLInputElement>(null);
  const clubSectionRef = useRef<HTMLDivElement>(null);
  const timeSectionRef = useRef<HTMLDivElement>(null);
  const durationSectionRef = useRef<HTMLDivElement>(null);

  const generateTimeOptionsForDate = useCallback((date: Date) => {
    const times = [];
    const selectedCenter = clubs.find(pc => pc.id === selectedClub);
    
    let startHour = 0;
    let endHour = 24;
    
    if (selectedCenter?.openingTime && selectedCenter?.closingTime) {
      const openingParts = selectedCenter.openingTime.split(':');
      const closingParts = selectedCenter.closingTime.split(':');
      startHour = parseInt(openingParts[0]);
      endHour = parseInt(closingParts[0]);
      if (parseInt(closingParts[1]) > 0) {
        endHour += 1;
      }
    }
    
    const now = new Date();
    const isToday = date.toDateString() === now.toDateString();
    
    for (let hour = startHour; hour < endHour; hour++) {
      for (let minute = 0; minute < 60; minute += 30) {
        const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
        
        // Filter out past times for today (unless showPastTimes is enabled)
        if (isToday && !showPastTimes) {
          const timeDate = new Date(date);
          timeDate.setHours(hour, minute, 0, 0);
          if (timeDate <= now) {
            continue;
          }
        }
        
        times.push(timeStr);
      }
    }
    return times;
  }, [clubs, selectedClub, showPastTimes]);

  const generateTimeOptions = useCallback(() => {
    return generateTimeOptionsForDate(selectedDate);
  }, [generateTimeOptionsForDate, selectedDate]);

  const getTimeSlotsForDuration = useCallback((startTime: string, duration: number) => {
    const slots = [];
    const [startHour, startMinute] = startTime.split(':').map(Number);
    const totalMinutes = duration * 60;
    
    for (let i = 0; i < totalMinutes; i += 30) {
      const currentMinutes = startMinute + i;
      const hour = startHour + Math.floor(currentMinutes / 60);
      const minute = currentMinutes % 60;
      const timeStr = `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}`;
      slots.push(timeStr);
    }
    
    return slots;
  }, []);

  const canAccommodateDuration = useCallback((startTime: string, duration: number) => {
    const allTimeSlots = generateTimeOptions();
    const requiredSlots = getTimeSlotsForDuration(startTime, duration);
    
    return requiredSlots.every(slot => allTimeSlots.includes(slot));
  }, [generateTimeOptions, getTimeSlotsForDuration]);

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
        
        // Auto-select today's date if time slots are available, otherwise select tomorrow
        const today = new Date();
        const tomorrow = new Date(today);
        tomorrow.setDate(tomorrow.getDate() + 1);
        
        const todayTimeSlots = generateTimeOptionsForDate(today);
        if (todayTimeSlots.length > 0) {
          setSelectedDate(today);
        } else {
          setSelectedDate(tomorrow);
        }
      } catch (error) {
        console.error('Failed to fetch courts:', error);
      }
    };
    fetchCourts();
  }, [selectedClub, generateTimeOptionsForDate]);

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
  }, [selectedClub]);

  useEffect(() => {
    // Auto-adjust selected time when duration changes and current selection becomes invalid
    if (selectedTime && !canAccommodateDuration(selectedTime, duration)) {
      const availableTimes = generateTimeOptions();
      
      // Find the latest valid start time that ends at or before the center's closing time
      for (let i = availableTimes.length - 1; i >= 0; i--) {
        const potentialStartTime = availableTimes[i];
        const requiredSlots = getTimeSlotsForDuration(potentialStartTime, duration);
        const lastRequiredSlot = requiredSlots[requiredSlots.length - 1];
        
        if (lastRequiredSlot && availableTimes.includes(lastRequiredSlot)) {
          setSelectedTime(potentialStartTime);
          break;
        }
      }
    }
  }, [duration, selectedTime, canAccommodateDuration, generateTimeOptions, getTimeSlotsForDuration]);

  const isSlotHighlighted = (time: string) => {
    if (!selectedTime) return false;
    const requiredSlots = getTimeSlotsForDuration(selectedTime, duration);
    return requiredSlots.includes(time);
  };

  const getAdjustedStartTime = (clickedTime: string, duration: number) => {
    const allTimeSlots = generateTimeOptions();
    
    // Find the latest valid start time that can accommodate the duration
    // and includes the clicked time in its range
    for (let i = allTimeSlots.length - 1; i >= 0; i--) {
      const potentialStartTime = allTimeSlots[i];
      const requiredSlots = getTimeSlotsForDuration(potentialStartTime, duration);
      
      // Check if all required slots are available and the range includes clicked time
      const lastRequiredSlot = requiredSlots[requiredSlots.length - 1];
      if (lastRequiredSlot && allTimeSlots.includes(lastRequiredSlot)) {
        // Check if this duration range includes the clicked time
        if (requiredSlots.includes(clickedTime)) {
          return potentialStartTime;
        }
      }
    }
    
    return null;
  };

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
      const [hours, minutes] = selectedTime.split(':');
      const startTime = new Date(selectedDate);
      startTime.setHours(parseInt(hours), parseInt(minutes), 0, 0);
      const endTime = addHours(startTime, duration);

      const gameResponse = await gamesApi.create({
        entityType: entityType,
        gameType: 'CLASSIC',
        clubId: selectedClub || undefined,
        courtId: selectedCourt !== 'notBooked' ? selectedCourt : undefined,
        startTime: startTime.toISOString(),
        endTime: endTime.toISOString(),
        maxParticipants,
        minParticipants: 2,
        minLevel: playerLevelRange[0],
        maxLevel: playerLevelRange[1],
        isPublic,
        affectsRating: isRatingGame,
        anyoneCanInvite,
        resultsByAnyone,
        hasBookedCourt: hasBookedCourt,
        afterGameGoToBar: afterGameGoToBar,
        hasFixedTeams: hasFixedTeams,
        name: gameName || undefined,
        description: comments,
      });

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
  };

  const handleRemoveInvitedPlayer = (playerId: string) => {
    setInvitedPlayerIds(invitedPlayerIds.filter(id => id !== playerId));
    setInvitedPlayers(invitedPlayers.filter(p => p.id !== playerId));
  };


  return (
    <div className="h-screen bg-gray-50 dark:bg-gray-950 flex flex-col">
      <CreateGameHeader onBack={() => navigate('/')} entityType={entityType} />

      <div className="flex-1 overflow-y-auto">
        <div className="max-w-2xl mx-auto px-4 py-6 space-y-4 pb-6">

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
          />
        )}

        <ParticipantsSection
          participants={participants}
          maxParticipants={maxParticipants}
          invitedPlayerIds={invitedPlayerIds}
          invitedPlayers={invitedPlayers}
          user={user}
          entityType={entityType}
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
          afterGameGoToBar={afterGameGoToBar}
          hasFixedTeams={hasFixedTeams}
          entityType={entityType}
          onPublicChange={setIsPublic}
          onRatingGameChange={setIsRatingGame}
          onAnyoneCanInviteChange={setAnyoneCanInvite}
          onResultsByAnyoneChange={setResultsByAnyone}
          onAfterGameGoToBarChange={setAfterGameGoToBar}
          onHasFixedTeamsChange={setHasFixedTeams}
        />

        <GameNameSection
          name={gameName}
          onNameChange={setGameName}
        />

        <CommentsSection
          comments={comments}
          onCommentsChange={setComments}
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
          className="w-full py-3 text-base font-semibold mt-4"
          size="lg"
        >
          {loading ? t('common.loading') : t('createGame.createButton')}
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
    </div>
  );
};



