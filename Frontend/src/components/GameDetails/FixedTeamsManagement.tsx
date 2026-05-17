import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TeamPlayerSelector } from './TeamPlayerSelector';
import { gamesApi } from '@/api/games';
import { Game, GameTeam, type BasicUser } from '@/types';
import { Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { getFixedTeamSlotCount } from '@/utils/fixedTeamSlotCount';
function playerDisplayName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

interface FixedTeamPlayerSlotProps {
  player: GameTeam['players'][number] | undefined;
  canEdit: boolean;
  onRemove: () => void;
  onAdd: () => void;
}

function FixedTeamPlayerSlot({ player, canEdit, onRemove, onAdd }: FixedTeamPlayerSlotProps) {
  const { t } = useTranslation();

  if (player) {
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <PlayerAvatar
          player={player.user}
          showName={false}
          fullHideName
          extrasmall
          removable={canEdit}
          onRemoveClick={onRemove}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-gray-900 dark:text-white line-clamp-2">
            {playerDisplayName(player.user)}
          </p>
          {player.user.verbalStatus ? (
            <p className="verbal-status mt-0.5 line-clamp-1 text-[10px]">{player.user.verbalStatus}</p>
          ) : null}
        </div>
      </div>
    );
  }

  return (
    <div
      role={canEdit ? 'button' : undefined}
      tabIndex={canEdit ? 0 : undefined}
      onClick={canEdit ? onAdd : undefined}
      onKeyDown={
        canEdit
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onAdd();
              }
            }
          : undefined
      }
      className={`flex min-w-0 flex-1 items-center gap-2 rounded-lg outline-none ${
        canEdit
          ? 'cursor-pointer hover:bg-primary-50/80 dark:hover:bg-primary-900/25 focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-1 dark:focus-visible:ring-offset-gray-900'
          : ''
      }`}
    >
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-gray-300 dark:border-gray-600">
        {canEdit ? <span className="text-sm font-medium text-gray-400 dark:text-gray-500">+</span> : null}
      </div>
      <span className="min-w-0 flex-1 text-xs font-medium leading-snug text-gray-500 dark:text-gray-400">
        {canEdit ? t('games.addPlayer') : t('games.emptySlot')}
      </span>
    </div>
  );
}

interface FixedTeamsManagementProps {
  game: Game;
  onGameUpdate: (game: Game) => void;
  /** Omit outer Card and section title — for use inside GameFormatCard */
  embedded?: boolean;
}

export const FixedTeamsManagement = ({ game, onGameUpdate, embedded = false }: FixedTeamsManagementProps) => {
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

  const gameRef = useRef(game);
  const onGameUpdateRef = useRef(onGameUpdate);
  gameRef.current = game;
  onGameUpdateRef.current = onGameUpdate;

  const areTeamsReady = useCallback(
    (teamsToCheck = teams, g = gameRef.current) => {
      if (!g || !teamsToCheck || teamsToCheck.length === 0) return false;
      const n = getFixedTeamSlotCount(g);
      return teamsToCheck.slice(0, n).every((team) => team.players.length === 2);
    },
    [teams],
  );

  const isTeamsReady = useCallback((teamsToCheck: GameTeam[], g: Game) => {
    if (!teamsToCheck || teamsToCheck.length === 0) return false;
    const n = getFixedTeamSlotCount(g);
    return teamsToCheck.slice(0, n).every((team) => team.players.length === 2);
  }, []);

  const fetchTeams = useCallback(async () => {
    const g = gameRef.current;
    if (!g?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      const slotCount = getFixedTeamSlotCount(g);
      const localTeams: GameTeam[] = [];

      for (let i = 1; i <= slotCount; i++) {
        localTeams.push({
          id: `temp-${i}`,
          gameId: g.id,
          teamNumber: i,
          name: undefined,
          players: []
        });
      }

      try {
        const response = await gamesApi.getFixedTeams(g.id);
        if (gameRef.current?.id !== g.id) return;

        const existingTeams = response.data;

        const mergedTeams = localTeams.map((localTeam) => {
          const existingTeam = existingTeams.find((team) => team.teamNumber === localTeam.teamNumber);
          return existingTeam || localTeam;
        });

        setTeams(mergedTeams);

        const ready = isTeamsReady(mergedTeams, g);
        if (g.teamsReady !== ready) {
          onGameUpdateRef.current({
            ...g,
            teamsReady: ready
          });
        }
      } catch {
        if (gameRef.current?.id !== g.id) return;

        setTeams(localTeams);
        const ready = isTeamsReady(localTeams, g);
        if (g.teamsReady !== ready) {
          onGameUpdateRef.current({
            ...g,
            teamsReady: ready
          });
        }
      }
    } catch (error) {
      console.error('Failed to initialize teams:', error);
    } finally {
      if (gameRef.current?.id === g.id) setLoading(false);
    }
  }, [isTeamsReady]);

  useEffect(() => {
    if (game?.id) {
      fetchTeams();
    }
  }, [game?.id, game?.maxParticipants, game?.entityType, game?.leagueRoundId, fetchTeams]);

  const handlePlayerSelect = async (playerId: string) => {
    if (selectedTeamIndex === null || !game?.id) return;

    const currentTeam = teams[selectedTeamIndex];
    if (currentTeam && currentTeam.players.some(p => p.userId === playerId)) {
      toast.error(t('games.playerAlreadyInTeam'));
      return;
    }

    if (!game.allowUserInMultipleTeams) {
      const playerInAnotherTeam = teams.some(
        (team) =>
          team.teamNumber !== currentTeam.teamNumber && team.players.some((p) => p.userId === playerId),
      );

      if (playerInAnotherTeam) {
        toast.error(t('games.playerAlreadyInAnotherTeam'));
        return;
      }
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

      const newEntry = {
        id: `temp-${Date.now()}`,
        gameTeamId: currentTeam.id,
        userId: playerId,
        user: participant.user,
      };

      const updatedTeams = [...teams];
      updatedTeams[selectedTeamIndex] = {
        ...currentTeam,
        players: [...currentTeam.players, newEntry],
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

    const slotCount = getFixedTeamSlotCount(game);
    const teamsData = [];
    for (let i = 1; i <= slotCount; i++) {
      const team = updatedTeams.find((t) => t.teamNumber === i);
      teamsData.push({
        teamNumber: i,
        name: team?.name,
        playerIds: team?.players.map((p) => p.userId) ?? [],
      });
    }

    try {
      const response = await gamesApi.setFixedTeams(game.id, teamsData);

      const slotCount = getFixedTeamSlotCount(game);
      const updatedLocalTeams: GameTeam[] = [];

      for (let i = 1; i <= slotCount; i++) {
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
    if (!teams || teams.length === 0 || !game) return false;
    const n = getFixedTeamSlotCount(game);
    const visible = teams.slice(0, n);
    const totalSlots = visible.length * 2;
    const filledSlots = visible.reduce((total, team) => total + team.players.length, 0);
    return filledSlots < totalSlots;
  };

  if (loading || !game) {
    const spinner = (
      <div className="flex items-center justify-center py-8">
        <div className="inline-block animate-spin rounded-full h-6 w-6 border-b-2 border-primary-600" />
      </div>
    );
    return embedded ? spinner : <Card>{spinner}</Card>;
  }

  // Check if max participants is odd - fixed teams require even number
  if (game.maxParticipants % 2 !== 0) {
    const body = (
      <div className="text-center py-6">
        <div className="text-yellow-600 dark:text-yellow-400 mb-2">
          <Users size={embedded ? 36 : 48} className={`mx-auto ${embedded ? 'mb-2' : 'mb-4'}`} />
        </div>
        <h3 className={`font-medium text-gray-900 dark:text-white mb-2 ${embedded ? 'text-sm' : 'text-lg'}`}>
          {t('games.evenPlayersRequired')}
        </h3>
        <p className={`text-gray-600 dark:text-gray-400 ${embedded ? 'text-xs' : ''}`}>
          {t('games.fixedTeamsNeedEvenPlayers')}
        </p>
      </div>
    );
    return embedded ? (
      body
    ) : (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('games.fixedTeams')}</h2>
        </div>
        {body}
      </Card>
    );
  }

  // Check if not all participants are ready
  const activeParticipantsCount = game.participants.filter((p) => p.status === 'PLAYING').length;
  if (!game.participantsReady && activeParticipantsCount < 2) {
    const body = (
      <div className="text-center py-6">
        <div className="text-blue-600 dark:text-blue-400 mb-2">
          <Users size={embedded ? 36 : 48} className={`mx-auto ${embedded ? 'mb-2' : 'mb-4'}`} />
        </div>
        <h3 className={`font-medium text-gray-900 dark:text-white mb-2 ${embedded ? 'text-sm' : 'text-lg'}`}>
          {t('games.waitingForPlayers')}
        </h3>
        <p className={`text-gray-600 dark:text-gray-400 ${embedded ? 'text-xs' : ''}`}>
          {t('games.allPlayersMustJoin')}
        </p>
      </div>
    );
    return embedded ? (
      body
    ) : (
      <Card>
        <div className="flex items-center gap-2 mb-3">
          <Users size={18} className="text-gray-500 dark:text-gray-400" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('games.fixedTeams')}</h2>
        </div>
        {body}
      </Card>
    );
  }

  const slotCount = getFixedTeamSlotCount(game);
  const main = (
    <>
      {teams?.slice(0, slotCount).map((team, index) => {
        const openSelector = () => {
          if (!canEdit) return;
          setSelectedTeamIndex(index);
          setShowPlayerSelector(true);
        };

        return (
          <div key={team.id} className="flex items-stretch overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/90 dark:border-gray-700/70 dark:bg-gray-800/45">
            <div
              className="flex w-9 shrink-0 items-center justify-center border-r border-gray-200/90 bg-emerald-500/10 dark:border-gray-700/70 dark:bg-emerald-500/15"
              aria-hidden
            >
              <span className="text-xs font-bold tabular-nums text-emerald-700 dark:text-emerald-400">
                {team.teamNumber}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 divide-x divide-gray-200/90 dark:divide-gray-700/70">
              <div className="min-w-0 flex-1 p-2.5">
                <FixedTeamPlayerSlot
                  player={team.players[0]}
                  canEdit={canEdit}
                  onRemove={() => handleRemovePlayer(index, team.players[0]!.userId)}
                  onAdd={openSelector}
                />
              </div>
              <div className="min-w-0 flex-1 p-2.5">
                <FixedTeamPlayerSlot
                  player={team.players[1]}
                  canEdit={canEdit}
                  onRemove={() => handleRemovePlayer(index, team.players[1]!.userId)}
                  onAdd={openSelector}
                />
              </div>
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
          selectedPlayerIds={
            game.allowUserInMultipleTeams && selectedTeamIndex !== null
              ? (teams[selectedTeamIndex]?.players.map((p) => p.userId) ?? [])
              : teams.flatMap((team) => team.players.map((p) => p.userId))
          }
          title={t('games.addPlayer')}
        />
      )}
    </>
  );

  if (embedded) {
    return <div className="space-y-2">{main}</div>;
  }

  return (
    <Card>
      <div className="flex items-center gap-2 mb-3">
        <Users size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white">{t('games.fixedTeams')}</h2>
      </div>
      {main}
    </Card>
  );
};
