import { useState, useEffect, useCallback, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Card } from '@/components';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { TeamPlayerSelector } from './TeamPlayerSelector';
import { gamesApi } from '@/api/games';
import { Game, GameTeam, type BasicUser } from '@/types';
import { Plus, Trash2, Users } from 'lucide-react';
import toast from 'react-hot-toast';
import { useAuthStore } from '@/store/authStore';
import { canUserEditGameFormat } from '@/utils/gameResults';
import { fixedTeamSlotLimit, hasOpenEndedFixedTeams, maxFixedTeamSlots, playersPerTeamOf } from '@/utils/matchFormat';
import { resolveFixedTeamPlayerUser } from '@/utils/resolveFixedTeamPlayerUser';
import { parseGameSport } from '@/utils/gameSport';
import { fixedTeamUserTeamTint } from '@/utils/fixedTeamUserTeam';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { AnimatePresence, motion } from 'framer-motion';
import { FixedTeamUserTeamLabel } from './FixedTeamUserTeamLabel';
function playerDisplayName(user: BasicUser): string {
  return [user.firstName, user.lastName].filter(Boolean).join(' ').trim();
}

function emptyTeam(gameId: string, teamNumber: number, id = `temp-${teamNumber}`): GameTeam {
  return { id, gameId, teamNumber, name: undefined, players: [] };
}

/** Teams the UI renders: open-ended lists show every team, fixed lists the first N slots. */
function visibleTeamsOf(teams: GameTeam[], g: Game): GameTeam[] {
  return hasOpenEndedFixedTeams(g) ? teams : teams.slice(0, maxFixedTeamSlots(g));
}

function areTeamsReadyFor(teams: GameTeam[], g: Game): boolean {
  const visible = visibleTeamsOf(teams, g);
  if (visible.length === 0) return false;
  const perTeam = playersPerTeamOf(g);
  return visible.every((team) => team.players.length === perTeam);
}

/** Server teams → local list. Open-ended keeps exactly what is stored; fixed pads every slot. */
function toLocalTeams(serverTeams: GameTeam[], g: Game): GameTeam[] {
  const sorted = [...serverTeams].sort((a, b) => a.teamNumber - b.teamNumber);
  if (hasOpenEndedFixedTeams(g)) return sorted;
  const slotCount = maxFixedTeamSlots(g);
  const local: GameTeam[] = [];
  for (let i = 1; i <= slotCount; i++) {
    local.push(sorted.find((team) => team.teamNumber === i) ?? emptyTeam(g.id, i));
  }
  return local;
}

function rosterKey(userIds: string[]): string {
  return [...userIds].sort().join(':');
}

interface FixedTeamPlayerSlotProps {
  player: GameTeam['players'][number] | undefined;
  game: Game;
  canEdit: boolean;
  onRemove: () => void;
  onAdd: () => void;
}

function FixedTeamPlayerSlot({ player, game, canEdit, onRemove, onAdd }: FixedTeamPlayerSlotProps) {
  const { t } = useTranslation();

  if (player) {
    const displayUser = resolveFixedTeamPlayerUser(game, player.userId, player.user);
    return (
      <div className="flex min-w-0 flex-1 items-center gap-2.5">
        <PlayerAvatar
          player={displayUser}
          levelSport={game.sport ? parseGameSport(game.sport) : undefined}
          showName={false}
          fullHideName
          extrasmall
          removable={canEdit}
          onRemoveClick={onRemove}
        />
        <div className="min-w-0 flex-1">
          <p className="text-xs font-medium leading-snug text-gray-900 dark:text-white line-clamp-2">
            {playerDisplayName(displayUser)}
          </p>
          {displayUser.verbalStatus ? (
            <p className="verbal-status mt-0.5 line-clamp-1 text-[10px]">{displayUser.verbalStatus}</p>
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
  const reduceMotion = usePrefersReducedMotion();
  const user = useAuthStore((state) => state.user);
  const canEdit = game && user ? canUserEditGameFormat(game, user) : false;
  const [teams, setTeams] = useState<GameTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedTeamIndex, setSelectedTeamIndex] = useState<number | null>(null);
  const [showPlayerSelector, setShowPlayerSelector] = useState(false);

  const gameRef = useRef(game);
  const onGameUpdateRef = useRef(onGameUpdate);
  gameRef.current = game;
  onGameUpdateRef.current = onGameUpdate;

  const areTeamsReady = useCallback(
    (teamsToCheck = teams, g = gameRef.current) => (g ? areTeamsReadyFor(teamsToCheck, g) : false),
    [teams],
  );

  const fetchTeams = useCallback(async () => {
    const g = gameRef.current;
    if (!g?.id) {
      setLoading(false);
      return;
    }

    try {
      setLoading(true);
      // Default slots; open-ended lists with nothing saved yet use them as a starting suggestion.
      const localTeams = Array.from({ length: maxFixedTeamSlots(g) }, (_, i) => emptyTeam(g.id, i + 1));

      try {
        const response = await gamesApi.getFixedTeams(g.id);
        if (gameRef.current?.id !== g.id) return;

        const existingTeams = response.data;
        const mergedTeams =
          hasOpenEndedFixedTeams(g) && existingTeams.length === 0
            ? localTeams
            : toLocalTeams(existingTeams, g);

        setTeams(mergedTeams);

        const ready = areTeamsReadyFor(mergedTeams, g);
        if (g.teamsReady !== ready) {
          onGameUpdateRef.current({
            ...g,
            teamsReady: ready
          });
        }
      } catch {
        if (gameRef.current?.id !== g.id) return;

        setTeams(localTeams);
        const ready = areTeamsReadyFor(localTeams, g);
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
  }, []);

  useEffect(() => {
    if (game?.id) {
      fetchTeams();
    }
  }, [game?.id, game?.maxParticipants, game?.entityType, game?.leagueRoundId, game?.allowUserInMultipleTeams, fetchTeams]);

  const handlePlayerSelect = async (playerId: string) => {
    if (selectedTeamIndex === null || !game?.id) return;

    const currentTeam = teams[selectedTeamIndex];
    const perTeam = playersPerTeamOf(game);
    if (currentTeam && currentTeam.players.length >= perTeam) {
      toast.error(t('games.teamFull'));
      return;
    }
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

    if (game.allowUserInMultipleTeams && currentTeam.players.length + 1 === perTeam) {
      const key = rosterKey([...currentTeam.players.map((p) => p.userId), playerId]);
      const duplicate = teams.some(
        (team, index) => index !== selectedTeamIndex && rosterKey(team.players.map((p) => p.userId)) === key,
      );
      if (duplicate) {
        toast.error(t('games.fixedTeamRosterDuplicate'));
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
        userTeam: undefined,
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
        players: updatedTeams[teamIndex].players.filter(p => p.userId !== playerId),
        userTeam: undefined,
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

    const teamsData = [];
    if (hasOpenEndedFixedTeams(game)) {
      updatedTeams.forEach((team, index) => {
        teamsData.push({
          teamNumber: index + 1,
          name: team.name,
          playerIds: team.players.map((p) => p.userId),
        });
      });
    } else {
      const slotCount = maxFixedTeamSlots(game);
      for (let i = 1; i <= slotCount; i++) {
        const team = updatedTeams.find((t) => t.teamNumber === i);
        teamsData.push({
          teamNumber: i,
          name: team?.name,
          playerIds: team?.players.map((p) => p.userId) ?? [],
        });
      }
    }

    try {
      const response = await gamesApi.setFixedTeams(game.id, teamsData, {
        openEndedList: hasOpenEndedFixedTeams(game),
      });
      const updatedLocalTeams = toLocalTeams(response.data.fixedTeams ?? [], game);

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

  const handleAddTeam = () => {
    if (!game?.id || teams.length >= fixedTeamSlotLimit(game)) return;
    setTeams([...teams, emptyTeam(game.id, teams.length + 1, `temp-new-${Date.now()}`)]);
  };

  const handleRemoveTeam = async (teamIndex: number) => {
    if (!game?.id) return;
    const removed = teams[teamIndex];
    const updatedTeams = teams
      .filter((_, index) => index !== teamIndex)
      .map((team, index) => ({ ...team, teamNumber: index + 1 }));
    setTeams(updatedTeams);
    onGameUpdate({ ...game, teamsReady: areTeamsReady(updatedTeams) });
    // A never-saved empty team only lived locally — nothing to persist.
    if (removed && removed.players.length === 0 && removed.id.startsWith('temp-')) return;
    await saveTeams(updatedTeams);
  };

  const hasEmptySlots = () => {
    if (!teams || teams.length === 0 || !game) return false;
    const perTeam = playersPerTeamOf(game);
    const visible = visibleTeamsOf(teams, game);
    const totalSlots = visible.length * perTeam;
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

  // Check if max participants is odd - fixed teams require even number (overlapping rosters do not)
  if (game.maxParticipants % 2 !== 0 && !hasOpenEndedFixedTeams(game)) {
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
          <h2 className="section-title">{t('games.fixedTeams')}</h2>
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
          <h2 className="section-title">{t('games.fixedTeams')}</h2>
        </div>
        {body}
      </Card>
    );
  }

  const openEnded = hasOpenEndedFixedTeams(game);
  const teamLabelOf = (team: GameTeam) => team.userTeam?.name ?? `${t('games.teamNumber')} ${team.teamNumber}`;
  const visibleTeams = visibleTeamsOf(teams, game);
  const playersPerTeam = playersPerTeamOf(game);
  const main = (
    <>
      {visibleTeams.map((team, index) => {
        const openSelector = () => {
          if (!canEdit) return;
          setSelectedTeamIndex(index);
          setShowPlayerSelector(true);
        };

        // A full roster that is a user team: its name, face and colour (otherwise unchanged look).
        const userTeam =
          team.userTeam && team.players.length === playersPerTeam ? team.userTeam : null;
        const tint = userTeam ? fixedTeamUserTeamTint(userTeam.color) : null;

        return (
          <div
            key={team.id}
            style={tint ? { ...tint.vars, ...tint.wash, borderColor: 'color-mix(in srgb, var(--ut-tone) 32%, transparent)' } : undefined}
            className="flex items-stretch overflow-hidden rounded-xl border border-gray-200/90 bg-gray-50/90 dark:border-gray-700/70 dark:bg-gray-800/45"
          >
            <div
              className={`flex w-9 shrink-0 items-center justify-center border-e border-gray-200/90 dark:border-gray-700/70 ${
                tint ? 'bg-[color:color-mix(in_srgb,var(--ut-tone)_16%,transparent)]' : 'bg-emerald-500/10 dark:bg-emerald-500/15'
              }`}
              aria-hidden
            >
              <span
                className={`text-xs font-bold tabular-nums ${
                  tint
                    ? 'text-[color:var(--ut-accent)] dark:text-[color:var(--ut-accent-dark)]'
                    : 'text-emerald-700 dark:text-emerald-400'
                }`}
              >
                {team.teamNumber}
              </span>
            </div>
            <div className="flex min-w-0 flex-1 flex-col">
            <AnimatePresence initial={false}>
              {userTeam ? (
                <motion.div
                  key={userTeam.id}
                  initial={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  animate={reduceMotion ? { opacity: 1 } : { opacity: 1, height: 'auto' }}
                  exit={reduceMotion ? { opacity: 0 } : { opacity: 0, height: 0 }}
                  transition={{ duration: reduceMotion ? 0.12 : 0.22, ease: [0.32, 0.72, 0, 1] }}
                  className="overflow-hidden"
                >
                  <div className="px-2.5 pt-2">
                    <FixedTeamUserTeamLabel
                      userTeam={userTeam}
                      players={team.players.map((p) => resolveFixedTeamPlayerUser(game, p.userId, p.user))}
                      className="max-w-full"
                    />
                  </div>
                </motion.div>
              ) : null}
            </AnimatePresence>
            <div className="flex min-w-0 flex-1 divide-x divide-gray-200/90 dark:divide-gray-700/70">
              {Array.from({ length: playersPerTeam }, (_, slotIndex) => {
                const player = team.players[slotIndex];
                return (
                  <div key={slotIndex} className="min-w-0 flex-1 p-2.5">
                    <FixedTeamPlayerSlot
                      player={player}
                      game={game}
                      canEdit={canEdit}
                      onRemove={() => player && handleRemovePlayer(index, player.userId)}
                      onAdd={openSelector}
                    />
                  </div>
                );
              })}
            </div>
            </div>
            {openEnded && canEdit ? (
              <button
                type="button"
                onClick={() => handleRemoveTeam(index)}
                aria-label={t('games.removeFixedTeam')}
                className="flex w-9 shrink-0 items-center justify-center border-s border-gray-200/90 text-gray-400 hover:bg-red-50 hover:text-red-600 dark:border-gray-700/70 dark:text-gray-500 dark:hover:bg-red-900/20 dark:hover:text-red-400"
              >
                <Trash2 size={14} />
              </button>
            ) : null}
          </div>
        );
      })}

      {openEnded && canEdit && teams.length < fixedTeamSlotLimit(game) ? (
        <button
          type="button"
          onClick={handleAddTeam}
          className="flex w-full items-center justify-center gap-1.5 rounded-xl border-2 border-dashed border-gray-300 py-2.5 text-xs font-medium text-gray-500 hover:border-primary-400 hover:bg-primary-50/60 hover:text-primary-600 dark:border-gray-600 dark:text-gray-400 dark:hover:border-primary-500 dark:hover:bg-primary-900/20 dark:hover:text-primary-400"
        >
          <Plus size={14} />
          {t('games.addFixedTeam')}
        </button>
      ) : null}


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
          unavailableLabelById={Object.fromEntries(
            visibleTeams
              .flatMap((team) =>
                team.players.map((p) => [p.userId, teamLabelOf(team)] as const),
              ),
          )}
          contextLabel={
            teams[selectedTeamIndex]
              ? teamLabelOf(teams[selectedTeamIndex])
              : `${t('games.teamNumber')} ${selectedTeamIndex + 1}`
          }
          teammates={(teams[selectedTeamIndex]?.players ?? []).map((p) =>
            resolveFixedTeamPlayerUser(game, p.userId, p.user),
          )}
          sport={game.sport ? parseGameSport(game.sport) : undefined}
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
        <h2 className="section-title">{t('games.fixedTeams')}</h2>
      </div>
      {main}
    </Card>
  );
};
