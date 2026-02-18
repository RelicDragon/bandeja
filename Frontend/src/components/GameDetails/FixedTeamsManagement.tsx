import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TeamPlayerSelector } from './TeamPlayerSelector';
import { gamesApi } from '@/api/games';
import { Game, GameTeam } from '@/types';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';

interface FixedTeamsManagementProps {
  game: Game;
  onGameUpdate: (game: Game) => void;
}

export const FixedTeamsManagement = ({ game, onGameUpdate }: FixedTeamsManagementProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const isOwner = game?.participants.some(
    (p) => p.userId === user?.id && ['OWNER', 'ADMIN'].includes(p.role)
  ) || false;
  const canEdit = isOwner || user?.isAdmin || false;
  const [teams, setTeams] = useState<GameTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamIndex, setSelectedTeamIndex] = useState<number | null>(null);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);

  const areTeamsReady = useCallback((teamsToCheck = teams) => {
    if (!teamsToCheck || teamsToCheck.length === 0) return false;
    // For fixed teams to be ready, all teams must have exactly 2 players each
    return teamsToCheck.every(team => team.players.length === 2);
  }, [teams]);

  const fetchTeams = useCallback(async () => {
    if (!game?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Always create all teams locally first
      const maxTeams = Math.floor(game.maxParticipants / 2);
      const localTeams: GameTeam[] = [];

      for (let i = 1; i <= maxTeams; i++) {
        localTeams.push({
          id: `temp-${i}`,
          gameId: game.id,
          teamNumber: i,
          name: undefined,
          players: []
        });
      }

      // Try to fetch existing teams from backend and merge
      try {
        const response = await gamesApi.getFixedTeams(game.id);
        const existingTeams = response.data;

        // Merge backend teams with local placeholders
        const mergedTeams = localTeams.map(localTeam => {
          const existingTeam = existingTeams.find(team => team.teamNumber === localTeam.teamNumber);
          return existingTeam || localTeam;
        });

        setTeams(mergedTeams);
        
        // Update the parent component with the initial teamsReady state only if changed
        const ready = areTeamsReady(mergedTeams);
        if (game.teamsReady !== ready) {
          onGameUpdate({
            ...game,
            teamsReady: ready
          });
        }
      } catch (backendError) {
        // If backend fails, just use local teams
        setTeams(localTeams);
        const ready = areTeamsReady(localTeams);
        if (game.teamsReady !== ready) {
          onGameUpdate({
            ...game,
            teamsReady: ready
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize teams:', error);
    } finally {
      setLoading(false);
    }
  }, [game, onGameUpdate, areTeamsReady]);

  useEffect(() => {
    if (game?.id) {
      fetchTeams();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [game?.id]);

  const handlePlayerSelect = async (playerId: string) => {
    if (selectedTeamIndex === null || !game?.id) return;

    const currentTeam = teams[selectedTeamIndex];
    if (currentTeam && currentTeam.players.some(p => p.userId === playerId)) {
      toast.error(t('games.playerAlreadyInTeam'));
      return;
    }

    // Check if player is already in another team
    const playerInAnotherTeam = teams.some(team =>
      team.teamNumber !== currentTeam.teamNumber &&
      team.players.some(p => p.userId === playerId)
    );

    if (playerInAnotherTeam) {
      toast.error(t('games.playerAlreadyInAnotherTeam'));
      return;
    }

    // Check if player is a participant in the game
    const isParticipant = game.participants.some(p => p.userId === playerId && p.status === 'PLAYING');
    if (!isParticipant) {
      toast.error(t('games.playerNotParticipant'));
      return;
    }

    try {
      const participant = game.participants.find(p => p.userId === playerId);
      if (!participant?.user) {
        throw new Error('User not found');
      }
      
      const updatedTeams = [...teams];
      updatedTeams[selectedTeamIndex] = {
        ...currentTeam,
        players: [...currentTeam.players, {
          id: `temp-${Date.now()}`,
          gameTeamId: currentTeam.id,
          userId: playerId,
          user: participant.user
        }]
      };

      // Update local state immediately for better UX
      setTeams(updatedTeams);
      setSelectedTeamIndex(null);
      setShowPlayerSelector(false);

      // Update parent component with teamsReady state
      onGameUpdate({
        ...game,
        teamsReady: areTeamsReady(updatedTeams)
      });

      await saveTeams(updatedTeams);
    } catch (error) {
      console.error('Failed to add player to team:', error);
      // Revert local state on error
      fetchTeams();
    }
  };

  const handleRemovePlayer = async (teamIndex: number, playerId: string) => {
    if (!game?.id) return;

    try {
      const updatedTeams = [...teams];
      updatedTeams[teamIndex] = {
        ...updatedTeams[teamIndex],
        players: updatedTeams[teamIndex].players.filter(p => p.userId !== playerId)
      };

      // Update local state immediately for better UX
      setTeams(updatedTeams);

      // Update parent component with teamsReady state
      onGameUpdate({
        ...game,
        teamsReady: areTeamsReady(updatedTeams)
      });

      await saveTeams(updatedTeams);
    } catch (error) {
      console.error('Failed to remove player from team:', error);
      // Revert local state on error
      fetchTeams();
    }
  };

  const saveTeams = async (updatedTeams: GameTeam[]) => {
    if (!game?.id) {
      console.error('Cannot save teams: game ID is missing');
      return;
    }

    // Only save teams that have players
    const teamsWithPlayers = updatedTeams.filter(team => team.players.length > 0);

    if (teamsWithPlayers.length === 0) {
      // If no teams have players, just update local state
      setTeams(updatedTeams);
      return;
    }

    const teamsData = teamsWithPlayers.map(team => ({
      teamNumber: team.teamNumber,
      name: team.name,
      playerIds: team.players.map(p => p.userId)
    }));

    try {
      const response = await gamesApi.setFixedTeams(game.id, teamsData);

      // Update local state with the response, keeping empty teams as placeholders
      const maxTeams = Math.floor(game.maxParticipants / 2);
      const updatedLocalTeams: GameTeam[] = [];

      for (let i = 1; i <= maxTeams; i++) {
        const savedTeam = response.data.fixedTeams?.find((team: GameTeam) => team.teamNumber === i);
        if (savedTeam) {
          updatedLocalTeams.push(savedTeam);
        } else {
          updatedLocalTeams.push({
            id: `temp-${i}`,
            gameId: game.id,
            teamNumber: i,
            name: undefined,
            players: []
          });
        }
      }

      setTeams(updatedLocalTeams);
      // Update game state in parent component, preserving current status and adding teamsReady
      onGameUpdate({
        ...response.data,
        status: game.status, // Preserve the current status since backend might not calculate it correctly
        teamsReady: areTeamsReady(updatedLocalTeams)
      });
      toast.success(t('games.teamsUpdatedSuccessfully'));
    } catch (error) {
      console.error('Failed to save teams:', error);
      toast.error(t('games.failedToSaveTeams'));
    }
  };

  const hasEmptySlots = () => {
    if (!teams || teams.length === 0) return false;
    const totalSlots = teams.length * 2;
    const filledSlots = teams.reduce((total, team) => total + team.players.length, 0);
    return filledSlots < totalSlots;
  };

  if (loading || !game) {
    return (
      <Card>
        <div className="flex items-center justify-center py-8">
          <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600"></div>
        </div>
      </Card>
    );
  }

  // Check if max participants is odd - fixed teams require even number
  if (game.maxParticipants % 2 !== 0) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('games.fixedTeams')}
          </h2>
        </div>
        <div className="text-center py-8">
          <div className="text-yellow-600 dark:text-yellow-400 mb-2">
            <Users size={48} className="mx-auto mb-4" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {t('games.evenPlayersRequired')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {t('games.fixedTeamsNeedEvenPlayers')}
          </p>
        </div>
      </Card>
    );
  }

  // Check if not all participants are ready
  if (!game.participantsReady) {
    return (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('games.fixedTeams')}
          </h2>
        </div>
        <div className="text-center py-8">
          <div className="text-blue-600 dark:text-blue-400 mb-2">
            <Users size={48} className="mx-auto mb-4" />
          </div>
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {t('games.waitingForPlayers')}
          </h3>
          <p className="text-gray-600 dark:text-gray-400">
            {t('games.allPlayersMustJoin')}
          </p>
        </div>
      </Card>
    );
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
          {t('games.fixedTeams')}
        </h2>
      </div>


      {teams?.map((team, index) => {
        // Create exactly 2 player slots for each team
        const playerSlots = [];
        for (let i = 0; i < 2; i++) {
          const player = team.players[i];
          if (player) {
            playerSlots.push(
              <div key={player.userId} className="flex items-center gap-2 min-w-0">
                <PlayerAvatar
                  player={player.user}
                  showName={false}
                  extrasmall={true}
                  removable={canEdit}
                  onRemoveClick={() => handleRemovePlayer(index, player.userId)}
                />
                <div className="min-w-0 flex-1">
                  <span className="text-[10px] font-medium text-gray-900 dark:text-white block truncate">
                    {player.user.firstName} {player.user.lastName}
                  </span>
                  {player.user.verbalStatus && (
                    <span className="verbal-status block">
                      {player.user.verbalStatus}
                    </span>
                  )}
                </div>
              </div>
            );
          } else {
            playerSlots.push(
              <div key={`placeholder-${i}`} className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600 flex items-center justify-center">
                  {canEdit && <span className="text-xs text-gray-400 dark:text-gray-500">+</span>}
                </div>
                <span className="text-[10px] font-medium text-gray-500 dark:text-gray-500">
                  {canEdit ? t('games.addPlayer') : t('games.emptySlot')}
                </span>
              </div>
            );
          }
        }

        return (
          <div key={team.id} className="relative grid grid-cols-2 gap-6 items-center py-2 px-3 bg-gray-50 dark:bg-gray-800/50 rounded-lg mb-2">
            {/* Team Counter - Small Green Circle in Top Left */}
            <div className="absolute -top-1 -left-1">
              <div className="w-5 h-5 bg-green-500 text-white text-xs font-bold rounded-full flex items-center justify-center">
                {team.teamNumber}
              </div>
            </div>

            <div
              className={`flex justify-start rounded-lg p-2 transition-all ${
                !team.players[0] && canEdit
                  ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20'
                  : 'cursor-default'
              }`}
              onClick={() => {
                if (!team.players[0] && canEdit) {
                  // Add player to slot 0
                  setSelectedTeamIndex(index);
                  setShowPlayerSelector(true);
                }
              }}
            >
              {playerSlots[0]}
            </div>

            <div
              className={`flex justify-start rounded-lg p-2 transition-all ${
                !team.players[1] && canEdit
                  ? 'cursor-pointer hover:bg-primary-50 dark:hover:bg-primary-900/20'
                  : 'cursor-default'
              }`}
              onClick={() => {
                if (!team.players[1] && canEdit) {
                  // Add player to slot 1
                  setSelectedTeamIndex(index);
                  setShowPlayerSelector(true);
                }
              }}
            >
              {playerSlots[1]}
            </div>
          </div>
        );
      })}


      {showPlayerSelector && selectedTeamIndex !== null && hasEmptySlots() && canEdit && (
        <TeamPlayerSelector
          gameParticipants={game.participants}
          onClose={() => {
            setShowPlayerSelector(false);
            setSelectedTeamIndex(null);
          }}
          onConfirm={handlePlayerSelect}
          selectedPlayerIds={teams.flatMap(team => team.players.map(p => p.userId))}
          title={t('games.addPlayer')}
        />
      )}
    </Card>
  );
};
