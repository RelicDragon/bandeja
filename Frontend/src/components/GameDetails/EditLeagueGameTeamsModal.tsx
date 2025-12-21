import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import { X, Trash2, RefreshCw, UserPlus, Check } from 'lucide-react';
import { PlayerAvatar, ClubModal, CourtModal, ToggleSwitch, GameStartSection } from '@/components';
import { useGameTimeDuration } from '@/hooks/useGameTimeDuration';
import { Game, Club, Court, EntityType } from '@/types';
import { gamesApi, leaguesApi, invitesApi, LeagueStanding, clubsApi, courtsApi } from '@/api';
import { useAuthStore } from '@/store/authStore';
import toast from 'react-hot-toast';
import { addHours, differenceInHours } from 'date-fns';
import { createDateFromClubTime, formatTimeInClubTimezone } from '@/hooks/useGameTimeDuration';

interface EditLeagueGameTeamsModalProps {
  isOpen: boolean;
  game: Game;
  leagueSeasonId: string;
  hasFixedTeams: boolean;
  onClose: () => void;
  onUpdate: (game: Game) => void;
}

interface TeamPlayer {
  id: string;
  firstName?: string;
  lastName?: string;
  avatar?: string;
  level?: number;
  gender?: 'MALE' | 'FEMALE' | 'PREFER_NOT_TO_SAY';
}

export const EditLeagueGameTeamsModal = ({
  isOpen,
  game,
  leagueSeasonId,
  hasFixedTeams,
  onClose,
  onUpdate,
}: EditLeagueGameTeamsModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [isClosing, setIsClosing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [standings, setStandings] = useState<LeagueStanding[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [team1Players, setTeam1Players] = useState<(TeamPlayer | null)[]>([null, null]);
  const [team2Players, setTeam2Players] = useState<(TeamPlayer | null)[]>([null, null]);
  
  const [selectingPlayerFor, setSelectingPlayerFor] = useState<{
    team: 1 | 2;
    slot: 0 | 1;
  } | null>(null);

  const [clubs, setClubs] = useState<Club[]>([]);
  const [courts, setCourts] = useState<Court[]>([]);
  const [selectedClubId, setSelectedClubId] = useState<string>('');
  const [selectedCourtId, setSelectedCourtId] = useState<string>('');
  const [hasBookedCourt, setHasBookedCourt] = useState(false);
  const [isClubModalOpen, setIsClubModalOpen] = useState(false);
  const [isCourtModalOpen, setIsCourtModalOpen] = useState(false);
  const [showDatePicker, setShowDatePicker] = useState(false);
  const [activeTab, setActiveTab] = useState<'teams' | 'place' | 'time'>('teams');
  const dateInputRef = useRef<HTMLInputElement>(null);

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
    selectedClub: selectedClubId,
    initialDate: game.startTime ? new Date(game.startTime) : undefined,
    showPastTimes: false,
    disableAutoAdjust: true,
  });

  const fetchStandings = useCallback(async () => {
    try {
      setLoading(true);
      const response = await leaguesApi.getStandings(leagueSeasonId);
      setStandings(response.data);
    } catch (error) {
      console.error('Failed to fetch standings:', error);
      toast.error(t('errors.generic'));
    } finally {
      setLoading(false);
    }
  }, [leagueSeasonId, t]);

  const initializeTeams = useCallback(() => {
    const getTeamParticipants = (teamIndex: number) => {
      if (hasFixedTeams && game.fixedTeams && game.fixedTeams.length > teamIndex) {
        const team = game.fixedTeams[teamIndex];
        const teamPlayerIds = team.players.map(tp => tp.userId);
        return game.participants.filter(p => p.isPlaying && teamPlayerIds.includes(p.userId));
      }
      const playingParticipants = game.participants.filter(p => p.isPlaying);
      const midPoint = Math.floor(playingParticipants.length / 2);
      if (teamIndex === 0) {
        return playingParticipants.slice(0, midPoint);
      } else {
        return playingParticipants.slice(midPoint);
      }
    };

    const team1Participants = getTeamParticipants(0);
    const team2Participants = getTeamParticipants(1);

    const mapToTeamPlayer = (participant: typeof team1Participants[0]): TeamPlayer | null => {
      if (!participant.user) return null;
      return {
        id: participant.userId,
        firstName: participant.user.firstName,
        lastName: participant.user.lastName,
        avatar: participant.user.avatar,
        level: participant.user.level,
        gender: participant.user.gender,
      };
    };

    const t1 = [
      team1Participants[0] ? mapToTeamPlayer(team1Participants[0]) : null,
      team1Participants[1] ? mapToTeamPlayer(team1Participants[1]) : null,
    ];
    const t2 = [
      team2Participants[0] ? mapToTeamPlayer(team2Participants[0]) : null,
      team2Participants[1] ? mapToTeamPlayer(team2Participants[1]) : null,
    ];

    setTeam1Players(t1);
    setTeam2Players(t2);
  }, [game.id, game.fixedTeams, game.participants, hasFixedTeams]);

  const fetchClubs = useCallback(async () => {
    try {
      const cityId = game.club?.cityId || game.court?.club?.city?.id || user?.currentCity?.id;
      if (!cityId) return;
      const response = await clubsApi.getByCityId(cityId, game.entityType);
      setClubs(response.data);
    } catch (error) {
      console.error('Failed to fetch clubs:', error);
    }
  }, [game.club?.cityId, game.court?.club?.city?.id, game.entityType, user?.currentCity?.id]);

  const fetchCourts = useCallback(async () => {
    if (!selectedClubId) return;
    try {
      const response = await courtsApi.getByClubId(selectedClubId);
      setCourts(response.data);
    } catch (error) {
      console.error('Failed to fetch courts:', error);
    }
  }, [selectedClubId]);

  const initializeGameData = useCallback(() => {
    setSelectedClubId(game.clubId || '');
    setSelectedCourtId(game.courtId || '');
    setHasBookedCourt(game.hasBookedCourt || false);
    
    if (game.startTime) {
      const startDateTime = new Date(game.startTime);
      const endDateTime = new Date(game.endTime);
      
      setSelectedDate(startDateTime);
      const selectedClubData = clubs.find(c => c.id === game.clubId);
      setSelectedTime(formatTimeInClubTimezone(startDateTime, selectedClubData));
      const hoursDiff = differenceInHours(endDateTime, startDateTime);
      setDuration(hoursDiff || 2);
    }
  }, [game.id, game.clubId, game.courtId, game.hasBookedCourt, game.startTime, game.endTime, clubs, setSelectedDate, setSelectedTime, setDuration]);

  const gameIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      const shouldInitialize = gameIdRef.current !== game.id;
      if (shouldInitialize) {
        gameIdRef.current = game.id;
        setIsClosing(false);
        setActiveTab('teams');
        fetchStandings();
        initializeTeams();
        fetchClubs();
        initializeGameData();
      }
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
      if (!isOpen && gameIdRef.current === game.id) {
        gameIdRef.current = null;
      }
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen, game.id, fetchStandings, initializeTeams, fetchClubs, initializeGameData]);

  useEffect(() => {
    if (selectedClubId) {
      fetchCourts();
    } else {
      setCourts([]);
      setSelectedCourtId('');
    }
  }, [selectedClubId, fetchCourts]);

  const areTeamsFull = useMemo(() => {
    const team1Valid = team1Players.filter(p => p !== null);
    const team2Valid = team2Players.filter(p => p !== null);
    return team1Valid.length === 2 && team2Valid.length === 2;
  }, [team1Players, team2Players]);

  useEffect(() => {
    if (!selectedClubId && activeTab === 'time') {
      setActiveTab('place');
    }
    if (!areTeamsFull && (activeTab === 'place' || activeTab === 'time')) {
      setActiveTab('teams');
    }
  }, [selectedClubId, activeTab, areTeamsFull]);

  const getDurationLabel = useCallback((dur: number) => {
    if (dur === Math.floor(dur)) {
      return t('createGame.hours', { count: dur });
    } else {
      const hours = Math.floor(dur);
      const minutes = (dur % 1) * 60;
      return t('createGame.hoursMinutes', { hours, minutes });
    }
  }, [t]);


  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
      setSelectingPlayerFor(null);
    }, 200);
  };

  const getAllAvailablePlayers = (): Array<TeamPlayer & { points: number; gamesPlayed: number }> => {
    const players: Array<TeamPlayer & { points: number; gamesPlayed: number }> = [];
    
    standings.forEach(standing => {
      // Filter by group - only show players from the same group as this game
      if (game.leagueGroupId && standing.currentGroupId !== game.leagueGroupId) {
        return;
      }
      
      const gamesPlayed = standing.wins + standing.ties + standing.losses;
      
      if (hasFixedTeams && standing.leagueTeam) {
        standing.leagueTeam.players.forEach((player: any) => {
          if (player.user) {
            players.push({
              id: player.userId,
              firstName: player.user.firstName,
              lastName: player.user.lastName,
              avatar: player.user.avatar,
              level: player.user.level,
              gender: player.user.gender,
              points: standing.points,
              gamesPlayed,
            });
          }
        });
      } else if (standing.user) {
        players.push({
          id: standing.user.id,
          firstName: standing.user.firstName,
          lastName: standing.user.lastName,
          avatar: standing.user.avatar,
          level: standing.user.level,
          gender: standing.user.gender,
          points: standing.points,
          gamesPlayed,
        });
      }
    });
    
    return players;
  };

  const handlePlayerSelect = (player: TeamPlayer) => {
    if (!selectingPlayerFor) return;

    const { team, slot } = selectingPlayerFor;
    
    if (team === 1) {
      const newTeam = [...team1Players];
      newTeam[slot] = player;
      setTeam1Players(newTeam);
    } else {
      const newTeam = [...team2Players];
      newTeam[slot] = player;
      setTeam2Players(newTeam);
    }
    
    setSelectingPlayerFor(null);
  };

  const handleRemovePlayer = (team: 1 | 2, slot: 0 | 1) => {
    if (team === 1) {
      const newTeam = [...team1Players];
      newTeam[slot] = null;
      setTeam1Players(newTeam);
    } else {
      const newTeam = [...team2Players];
      newTeam[slot] = null;
      setTeam2Players(newTeam);
    }
  };

  const handleSave = async () => {
    const team1Valid = team1Players.filter(p => p !== null);
    const team2Valid = team2Players.filter(p => p !== null);

    if (team1Valid.length !== 2 || team2Valid.length !== 2) {
      toast.error(t('gameDetails.bothTeamsNeedTwoPlayers'));
      return;
    }

    const allPlayerIds = [...team1Valid, ...team2Valid].map(p => p!.id);
    const uniqueIds = new Set(allPlayerIds);
    
    if (uniqueIds.size !== allPlayerIds.length) {
      toast.error(t('gameDetails.playerCannotBeInBothTeams'));
      return;
    }

    if (selectedCourtId && (!selectedDate || !selectedTime)) {
      toast.error(t('gameDetails.pleaseSelectDateTime'));
      return;
    }

    setIsSaving(true);
    try {
      const currentParticipantIds = game.participants
        .filter(p => p.isPlaying)
        .map(p => p.userId);

      const toAdd = allPlayerIds.filter(id => !currentParticipantIds.includes(id));
      const toRemove = currentParticipantIds.filter(id => !allPlayerIds.includes(id));

      for (const userId of toRemove) {
        await gamesApi.kickUser(game.id, userId);
      }

      if (toAdd.length > 0) {
        await invitesApi.sendMultiple({
          receiverIds: toAdd,
          gameId: game.id,
        });
        
        for (const userId of toAdd) {
          try {
            const invites = await invitesApi.getGameInvites(game.id);
            const invite = invites.data.find(inv => inv.receiverId === userId && inv.status === 'PENDING');
            if (invite) {
              await invitesApi.accept(invite.id);
            }
          } catch (error) {
            console.error(`Failed to auto-accept invite for user ${userId}:`, error);
          }
        }
      }

      const teamsData = [
        {
          teamNumber: 1,
          playerIds: team1Valid.map(p => p!.id),
        },
        {
          teamNumber: 2,
          playerIds: team2Valid.map(p => p!.id),
        },
      ];
      await gamesApi.setFixedTeams(game.id, teamsData);

      const updateData: Partial<Game> = {};
      let hasChanges = false;

      if (selectedClubId !== game.clubId) {
        updateData.clubId = selectedClubId || undefined;
        hasChanges = true;
        
        if (!selectedClubId && game.timeIsSet) {
          updateData.timeIsSet = false;
        }
      }
      if (selectedCourtId !== game.courtId) {
        updateData.courtId = selectedCourtId || undefined;
        hasChanges = true;
      }
      if (hasBookedCourt !== game.hasBookedCourt) {
        updateData.hasBookedCourt = hasBookedCourt;
        hasChanges = true;
      }

      if (selectedDate && selectedTime) {
        const selectedClubData = clubs.find(c => c.id === selectedClubId);
        const newStartTime = createDateFromClubTime(selectedDate, selectedTime, selectedClubData);
        const newEndTime = addHours(newStartTime, duration);
        
        if (newStartTime.toISOString() !== game.startTime || newEndTime.toISOString() !== game.endTime) {
          updateData.startTime = newStartTime.toISOString();
          updateData.endTime = newEndTime.toISOString();
          updateData.timeIsSet = true;
          hasChanges = true;
        }
      } else if (game.timeIsSet && (!selectedDate || !selectedTime)) {
        updateData.timeIsSet = false;
        hasChanges = true;
      }

      if (hasChanges) {
        await gamesApi.update(game.id, updateData);
      }

      const response = await gamesApi.getById(game.id);
      const updatedGame = response.data;
      
      const currentParticipantIdsSet = new Set(
        updatedGame.participants.filter(p => p.isPlaying).map(p => p.userId)
      );
      
      const stillNeedToAdd = allPlayerIds.filter(id => !currentParticipantIdsSet.has(id));
      
      if (stillNeedToAdd.length > 0) {
        try {
          await invitesApi.sendMultiple({
            receiverIds: stillNeedToAdd,
            gameId: game.id,
          });
          toast.success(t('gameDetails.teamsUpdatedInvitesSent'));
        } catch (error) {
          console.error('Failed to send invites:', error);
          toast.success(t('gameDetails.teamsUpdated'));
        }
      } else {
        toast.success(t('gameDetails.teamsUpdated'));
      }
      
      const finalResponse = await gamesApi.getById(game.id);
      onUpdate(finalResponse.data);
      handleClose();
    } catch (error: any) {
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsSaving(false);
    }
  };

  const isPlayerAlreadySelected = (playerId: string): boolean => {
    return [...team1Players, ...team2Players].some(p => p?.id === playerId);
  };

  if (!isOpen && !isClosing) return null;

  const renderPlayerSlot = (player: TeamPlayer | null, team: 1 | 2, slot: 0 | 1) => {
    return (
      <div className="flex flex-col items-center">
        <div className="h-[72px] flex items-center justify-center">
          {player ? (
            <PlayerAvatar
              player={player}
              draggable={false}
              showName={true}
              extrasmall={true}
              removable={false}
            />
          ) : (
            <button
              onClick={() => setSelectingPlayerFor({ team, slot })}
              className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 flex items-center justify-center transition-colors"
            >
              <UserPlus size={16} className="text-gray-500 dark:text-gray-400" />
            </button>
          )}
        </div>
        
        <div className="flex flex-col gap-1 mt-2">
          <button
            onClick={() => setSelectingPlayerFor({ team, slot })}
            className="w-8 h-8 rounded bg-blue-100 dark:bg-blue-900/30 hover:bg-blue-200 dark:hover:bg-blue-900/50 transition-colors flex items-center justify-center"
            title={t('gameDetails.switchPlayer')}
          >
            <RefreshCw size={14} className="text-blue-600 dark:text-blue-400" />
          </button>
          
          <button
            onClick={() => player && handleRemovePlayer(team, slot)}
            disabled={!player}
            className="w-8 h-8 rounded bg-red-100 dark:bg-red-900/30 hover:bg-red-200 dark:hover:bg-red-900/50 transition-colors disabled:opacity-30 disabled:cursor-not-allowed flex items-center justify-center"
            title={t('common.remove')}
          >
            <Trash2 size={14} className="text-red-600 dark:text-red-400" />
          </button>
        </div>
      </div>
    );
  };

  const isModalOverlayLocked = isClubModalOpen || isCourtModalOpen;

  const handleBackdropClick = () => {
    if (isModalOverlayLocked) return;
    if (selectingPlayerFor) {
      setSelectingPlayerFor(null);
      return;
    }
    handleClose();
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      style={{
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
      }}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-3xl flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ maxHeight: '90vh' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('gameDetails.editTeams')}
          </h2>
          <button
            onClick={handleClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto flex-1">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
            </div>
          ) : selectingPlayerFor ? (
            <div
              className="transform transition-all duration-300 ease-in-out"
              style={{ animation: 'slideIn 0.3s ease-out' }}
            >
              <div className="mb-4 flex items-center justify-between">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">
                  {t('gameDetails.selectPlayer')}
                </h3>
                <button
                  onClick={() => setSelectingPlayerFor(null)}
                  className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
                >
                  {t('common.back')}
                </button>
              </div>
              <div className="space-y-1 max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-1">
                {getAllAvailablePlayers().map((player) => {
                  const isSelected = isPlayerAlreadySelected(player.id);
                  return (
                    <div
                      key={player.id}
                      onClick={() => !isSelected && handlePlayerSelect(player)}
                      className={`px-2 py-1.5 rounded-lg transition-colors ${
                        isSelected
                          ? 'bg-gray-100 dark:bg-gray-800 opacity-50 cursor-not-allowed'
                          : 'hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-2 border-transparent hover:border-primary-500'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-2">
                          <PlayerAvatar
                            player={player}
                            showName={false}
                            extrasmall={true}
                          />
                          <span className="font-medium text-gray-900 dark:text-white">
                            {player.firstName} {player.lastName}
                          </span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-gray-600 dark:text-gray-400">
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-gray-900 dark:text-white">{player.points}</span>
                            <span>{t('gameResults.points')}</span>
                          </div>
                          <div className="flex flex-col items-end">
                            <span className="font-semibold text-gray-900 dark:text-white">{player.gamesPlayed}</span>
                            <span>{t('gameResults.games')}</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            <div
              className="transform transition-all duration-300 ease-in-out"
              style={{ animation: 'slideIn 0.3s ease-out' }}
            >
              {/* Tab Navigation */}
              <div className="flex border-b border-gray-200 dark:border-gray-700">
                <button
                  onClick={() => setActiveTab('teams')}
                  className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                    activeTab === 'teams'
                      ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                      : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                  }`}
                >
                  {t('gameDetails.teams')}
                  {areTeamsFull && (
                    <Check size={16} className="text-green-600 dark:text-green-400" />
                  )}
                </button>
                {areTeamsFull && (
                  <>
                    <button
                      onClick={() => setActiveTab('place')}
                      className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                        activeTab === 'place'
                          ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                          : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                      }`}
                    >
                      {t('gameDetails.place')}
                      {selectedClubId && (
                        <Check size={16} className="text-green-600 dark:text-green-400" />
                      )}
                    </button>
                    {selectedClubId && (
                      <button
                        onClick={() => setActiveTab('time')}
                        className={`px-4 py-2 text-sm font-medium transition-colors flex items-center gap-2 ${
                          activeTab === 'time'
                            ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                            : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
                        }`}
                      >
                        {t('gameDetails.time')}
                        {game.timeIsSet && (
                          <Check size={16} className="text-green-600 dark:text-green-400" />
                        )}
                      </button>
                    )}
                  </>
                )}
              </div>

              {/* Tab Content */}
              <div className="pt-4">
                {activeTab === 'teams' ? (
                  <div className="flex items-center justify-center gap-8">
                    <div className="flex flex-col items-center">
                      <div className="text-center mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('gameDetails.team1')}
                      </div>
                      <div className="flex gap-4">
                        {renderPlayerSlot(team1Players[0], 1, 0)}
                        {renderPlayerSlot(team1Players[1], 1, 1)}
                      </div>
                    </div>

                    <div className="text-2xl font-bold text-gray-500 dark:text-gray-400 mt-8">
                      VS
                    </div>

                    <div className="flex flex-col items-center">
                      <div className="text-center mb-3 text-sm font-medium text-gray-700 dark:text-gray-300">
                        {t('gameDetails.team2')}
                      </div>
                      <div className="flex gap-4">
                        {renderPlayerSlot(team2Players[0], 2, 0)}
                        {renderPlayerSlot(team2Players[1], 2, 1)}
                      </div>
                    </div>
                  </div>
                ) : activeTab === 'place' ? (
                  <div className="space-y-4">
                    {/* Club Selector */}
                    <div>
                      <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                        {t('createGame.club')}
                      </label>
                      <button
                        onClick={() => setIsClubModalOpen(true)}
                        className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
                      >
                        {selectedClubId
                          ? clubs.find(c => c.id === selectedClubId)?.name || t('createGame.selectClub')
                          : t('createGame.selectClub')
                        }
                      </button>
                    </div>

                    {/* Court Selector */}
                    {selectedClubId && (
                      <div>
                        <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-1.5">
                          {t('createGame.court')}
                        </label>
                        <button
                          onClick={() => setIsCourtModalOpen(true)}
                          className="w-full px-4 py-2.5 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm text-left hover:border-primary-500 transition-colors"
                        >
                          {selectedCourtId && selectedCourtId !== 'notBooked'
                            ? courts.find(c => c.id === selectedCourtId)?.name || t('createGame.notBookedYet')
                            : t('createGame.notBookedYet')
                          }
                        </button>
                      </div>
                    )}

                    {/* Booked Court Switch */}
                    {selectedCourtId && selectedCourtId !== 'notBooked' && (
                      <div className="flex items-center justify-between py-2">
                        <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
                          {t('createGame.hasBookedCourt')}
                        </label>
                        <ToggleSwitch
                          checked={hasBookedCourt}
                          onChange={setHasBookedCourt}
                        />
                      </div>
                    )}
                  </div>
                ) : (
                  <GameStartSection
                    selectedDate={selectedDate}
                    selectedTime={selectedTime}
                    duration={duration}
                    showPastTimes={showPastTimes}
                    showDatePicker={showDatePicker}
                    selectedClub={selectedClubId}
                    club={clubs.find(c => c.id === selectedClubId)}
                    generateTimeOptions={generateTimeOptions}
                    generateTimeOptionsForDate={generateTimeOptionsForDate}
                    canAccommodateDuration={canAccommodateDuration}
                    getAdjustedStartTime={getAdjustedStartTime}
                    getTimeSlotsForDuration={getTimeSlotsForDuration}
                    isSlotHighlighted={isSlotHighlighted}
                    getDurationLabel={getDurationLabel}
                    onDateSelect={setSelectedDate}
                    onCalendarClick={() => setShowDatePicker(true)}
                    onToggleShowPastTimes={setShowPastTimes}
                    onCloseDatePicker={() => setShowDatePicker(false)}
                    onTimeSelect={setSelectedTime}
                    onDurationChange={setDuration}
                    entityType={game.entityType as EntityType}
                    dateInputRef={dateInputRef}
                    compact={true}
                  />
                )}
              </div>
            </div>
          )}
        </div>

        {!selectingPlayerFor && (
          <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
            <button
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors disabled:opacity-50"
            >
              {t('common.cancel')}
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2 bg-primary-600 hover:bg-primary-700 text-white rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? t('common.saving') : t('common.save')}
            </button>
          </div>
        )}
      </div>

      <style>{`
        @keyframes slideIn {
          from {
            opacity: 0;
            transform: translateX(-10px);
          }
          to {
            opacity: 1;
            transform: translateX(0);
          }
        }
      `}</style>

      {isClubModalOpen && (
        <ClubModal
          isOpen={isClubModalOpen}
          onClose={() => setIsClubModalOpen(false)}
          clubs={clubs}
          selectedId={selectedClubId}
          onSelect={(clubId) => {
            setSelectedClubId(clubId);
            setSelectedCourtId('');
            setIsClubModalOpen(false);
          }}
        />
      )}

      {isCourtModalOpen && (
        <CourtModal
          isOpen={isCourtModalOpen}
          onClose={() => setIsCourtModalOpen(false)}
          courts={courts}
          selectedId={selectedCourtId || 'notBooked'}
          onSelect={(courtId) => {
            setSelectedCourtId(courtId === 'notBooked' ? '' : courtId);
            setIsCourtModalOpen(false);
          }}
          entityType={game.entityType}
        />
      )}
    </div>,
    document.body
  );
};
