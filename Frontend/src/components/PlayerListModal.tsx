import { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, RotateCcw, Search, UserPlus } from 'lucide-react';
import { BasicUser, UserTeam } from '@/types';
import { invitesApi } from '@/api';
import { userTeamsApi } from '@/api/userTeams';
import { gamesApi } from '@/api/games';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { Button } from './Button';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { useUserTeamsStore } from '@/store/userTeamsStore';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { PlayerListFilterBar } from '@/components/PlayerListFilterBar';
import {
  defaultPlayerInviteFilters,
  PLAYER_INVITE_RATING_MAX,
  PLAYER_INVITE_RATING_MIN,
  type PlayerInviteFilters,
} from '@/components/playerInvite/playerInviteFilters';
import {
  expandSelectionToPlayerIds,
  filterAndSortInviteEntries,
  invitePreFilterCount,
  mergeUserTeamsForInviteList,
  teamGamesTogetherScore,
  teamIsFullyInvitable,
  isUserTeamReady,
  type InviteListEntry,
} from '@/components/playerInvite/inviteEntries';
import { PlayerListItem } from '@/components/PlayerListItem';
import { TeamListItem } from '@/components/playerInvite/TeamListItem';
import { PlayerInviteVirtualList } from '@/components/playerInvite/PlayerInviteVirtualList';
import { SegmentedSwitch, type SegmentedSwitchTab } from '@/components/SegmentedSwitch';
import {
  InviteFriendToBandejaButton,
  INVITE_FRIEND_CTA_MAX_RESULTS,
} from '@/components/InviteFriendToBandejaButton';
import {
  buildGameSlots,
  matchUserToSlots,
  matchTeamToSlots,
  type GameAvailabilityMatch,
} from '@/utils/availability/gameMatch';

export interface PlayerListModalConfirmMeta {
  userTeamIdByReceiverId?: Record<string, string>;
}

export interface PlayerListModalGameTiming {
  timeIsSet: boolean;
  startTime?: string | null;
  endTime?: string | null;
  timeZone?: string | null;
}

interface PlayerListModalProps {
  gameId?: string;
  onClose: () => void;
  onInviteSent?: () => void;
  multiSelect?: boolean;
  onConfirm?: (playerIds: string[], meta?: PlayerListModalConfirmMeta) => void | Promise<void>;
  preSelectedIds?: string[];
  filterPlayerIds?: string[];
  filterGender?: 'MALE' | 'FEMALE';
  title?: string;
  inviteAsTrainerOnly?: boolean;
  gameTiming?: PlayerListModalGameTiming | null;
}

type GameAvailabilityContext = PlayerListModalGameTiming;

export const PlayerListModal = ({
  gameId,
  onClose,
  onInviteSent,
  multiSelect = false,
  onConfirm,
  preSelectedIds = [],
  filterPlayerIds = [],
  filterGender,
  title,
  inviteAsTrainerOnly = false,
  gameTiming,
}: PlayerListModalProps) => {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((state) => state.isFavorite);
  const invitableMaxSocial = usePlayersStore((s) => s.invitableMaxSocialLevel);
  const { getUserMetadata } = usePlayersStore();

  const [players, setPlayers] = useState<BasicUser[]>([]);
  const [readyTeams, setReadyTeams] = useState<UserTeam[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>(preSelectedIds);
  const [selectedTeamIds, setSelectedTeamIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [canInviteAsTrainer, setCanInviteAsTrainer] = useState(inviteAsTrainerOnly);
  const [inviteAsTrainer, setInviteAsTrainer] = useState(inviteAsTrainerOnly);
  const [filters, setFilters] = useState<PlayerInviteFilters>(() => defaultPlayerInviteFilters(1));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [inviteListKind, setInviteListKind] = useState<'all' | 'users' | 'teams'>('all');
  const [fetchedGameContext, setFetchedGameContext] = useState<GameAvailabilityContext | null>(null);
  const listSegmentUsers = inviteListKind === 'all' || inviteListKind === 'users';
  const listSegmentTeams = inviteListKind === 'all' || inviteListKind === 'teams';

  const showTeams = multiSelect && !inviteAsTrainerOnly;

  const inviteListKindTabs = useMemo<SegmentedSwitchTab[]>(
    () => [
      { id: 'all', label: t('playerInvite.segmentAll') },
      { id: 'users', label: t('playerInvite.segmentUsers') },
      { id: 'teams', label: t('playerInvite.segmentTeams') },
    ],
    [t],
  );

  const teamById = useMemo(() => {
    const m = new Map<string, UserTeam>();
    for (const t of readyTeams) m.set(t.id, t);
    return m;
  }, [readyTeams]);

  const inviteSessionKey = useMemo(
    () => `${gameId ?? ''}:${inviteAsTrainerOnly}`,
    [gameId, inviteAsTrainerOnly],
  );
  const inviteFiltersBootstrappedForKeyRef = useRef<string | null>(null);

  const socialLevelSliderMax = useMemo(() => {
    return invitableMaxSocial ?? Math.max(1, ...players.map((p) => Number(p.socialLevel) || 0));
  }, [invitableMaxSocial, players]);

  useEffect(() => {
    if (loading) return;
    if (inviteFiltersBootstrappedForKeyRef.current === inviteSessionKey) return;

    const cap =
      invitableMaxSocial ?? Math.max(1, ...players.map((p) => Number(p.socialLevel) || 0));
    setFilters({
      ...defaultPlayerInviteFilters(cap),
      gender: filterGender ?? 'ALL',
    });
    inviteFiltersBootstrappedForKeyRef.current = inviteSessionKey;
  }, [loading, inviteSessionKey, invitableMaxSocial, players, filterGender]);

  useEffect(() => {
    setFilters((f) => ({ ...f, gender: filterGender ?? 'ALL' }));
  }, [filterGender]);

  const preSelectedIdsKey = useMemo(() => [...preSelectedIds].sort().join(','), [preSelectedIds]);
  const preSelectedIdsRef = useRef(preSelectedIds);
  preSelectedIdsRef.current = preSelectedIds;
  const lastSyncedPreSelectedKey = useRef<string | null>(null);
  useEffect(() => {
    if (lastSyncedPreSelectedKey.current === preSelectedIdsKey) return;
    lastSyncedPreSelectedKey.current = preSelectedIdsKey;
    setSelectedUserIds([...preSelectedIdsRef.current]);
  }, [preSelectedIdsKey]);

  const handleClose = () => {
    setIsOpen(false);
    setInviteAsTrainer(false);
    setCanInviteAsTrainer(false);
    setTimeout(() => onClose(), 300);
  };

  useEffect(() => {
    if (inviteAsTrainerOnly) {
      setCanInviteAsTrainer(true);
      setInviteAsTrainer(true);
    }
  }, [inviteAsTrainerOnly]);

  const filterPlayerIdsKey = useMemo(() => [...filterPlayerIds].sort().join(','), [filterPlayerIds]);
  const filterPlayerIdsRef = useRef(filterPlayerIds);
  filterPlayerIdsRef.current = filterPlayerIds;

  useEffect(() => {
    const loadPlayers = async () => {
      setLoading(true);
      if (!inviteAsTrainerOnly) setCanInviteAsTrainer(false);
      const filterIds = filterPlayerIdsRef.current;
      try {
        await usePlayersStore.getState().fetchPlayers();
        const [inviteTeams] = await Promise.all([
          userTeamsApi.getForPlayerInvite().catch(() => [] as UserTeam[]),
          useUserTeamsStore.getState().refreshAll(),
        ]);
        const currentUsers = usePlayersStore.getState().users;
        const { teams, memberships } = useUserTeamsStore.getState();
        const storeTeams = mergeUserTeamsForInviteList(teams, memberships);
        const mergedTeamMap = new Map<string, UserTeam>();
        for (const t of inviteTeams) mergedTeamMap.set(t.id, t);
        for (const t of storeTeams) if (!mergedTeamMap.has(t.id)) mergedTeamMap.set(t.id, t);
        const merged = [...mergedTeamMap.values()];

        const [gameResponse, invitesResponse] = await Promise.allSettled([
          gameId ? gamesApi.getById(gameId) : Promise.resolve(null),
          gameId ? invitesApi.getGameInvites(gameId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
        ]);

        const participantIds = new Set<string>();
        const invitedUserIds = new Set<string>();

        if (gameId && gameResponse.status === 'fulfilled' && gameResponse.value?.data) {
          const gameData = gameResponse.value.data;
          const participants = gameData.participants;
          if (Array.isArray(participants)) {
            participants.forEach((p: { userId: string }) => participantIds.add(p.userId));
          }
          if (!inviteAsTrainerOnly && gameData.entityType === 'TRAINING' && !gameData.trainerId) {
            setCanInviteAsTrainer(true);
          }
          setFetchedGameContext({
            timeIsSet: gameData.timeIsSet === true,
            startTime: gameData.startTime,
            endTime: gameData.endTime,
            timeZone: gameData.club?.city?.timezone ?? gameData.city?.timezone ?? null,
          });
        } else {
          setFetchedGameContext(null);
        }

        if (gameId && invitesResponse.status === 'fulfilled' && invitesResponse.value?.data) {
          const invites = invitesResponse.value.data;
          if (Array.isArray(invites)) {
            invites.forEach((invite: { status?: string; receiverId?: string }) => {
              if (invite.status === 'PENDING' && invite.receiverId) {
                invitedUserIds.add(invite.receiverId);
              }
            });
          }
        }

        const filtered = Object.values(currentUsers).filter(
          (player) => !participantIds.has(player.id) && !invitedUserIds.has(player.id),
        );
        setPlayers(filtered);

        const invitableTeams = merged.filter(
          (team) =>
            isUserTeamReady(team) &&
            teamIsFullyInvitable(team, participantIds, invitedUserIds, filterIds),
        );
        setReadyTeams(invitableTeams);
      } catch {
        setPlayers([]);
        setReadyTeams([]);
        setFetchedGameContext(null);
        toast.error(t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [gameId, t, inviteAsTrainerOnly, filterPlayerIdsKey]);

  const effectiveGameContext: GameAvailabilityContext | null = gameTiming ?? fetchedGameContext;
  const ctxTimeIsSet = effectiveGameContext?.timeIsSet ?? false;
  const ctxStartTime = effectiveGameContext?.startTime ?? null;
  const ctxEndTime = effectiveGameContext?.endTime ?? null;
  const ctxTimeZone = effectiveGameContext?.timeZone ?? null;

  const gameSlots = useMemo(() => {
    if (!ctxTimeIsSet) return null;
    return buildGameSlots(ctxStartTime, ctxEndTime, ctxTimeZone);
  }, [ctxTimeIsSet, ctxStartTime, ctxEndTime, ctxTimeZone]);

  const userAvailabilityById = useMemo(() => {
    const m = new Map<string, GameAvailabilityMatch>();
    if (!gameSlots) return m;
    for (const p of players) m.set(p.id, matchUserToSlots(p.weeklyAvailability, gameSlots));
    return m;
  }, [players, gameSlots]);

  const teamAvailabilityById = useMemo(() => {
    const m = new Map<string, GameAvailabilityMatch>();
    if (!gameSlots) return m;
    for (const team of readyTeams) {
      const acceptedMembers = (team.members ?? [])
        .filter((mem) => mem.status === 'ACCEPTED')
        .map((mem) => mem.user)
        .filter(Boolean) as BasicUser[];
      m.set(team.id, matchTeamToSlots(acceptedMembers, gameSlots));
    }
    return m;
  }, [readyTeams, gameSlots]);

  const getAvailabilityMatch = useCallback(
    (entry: InviteListEntry): GameAvailabilityMatch => {
      if (!gameSlots) return 'full';
      if (entry.kind === 'user') return userAvailabilityById.get(entry.user.id) ?? 'full';
      return teamAvailabilityById.get(entry.team.id) ?? 'full';
    },
    [gameSlots, userAvailabilityById, teamAvailabilityById],
  );

  const baseFilteredEntries = useMemo(() => {
    return filterAndSortInviteEntries(players, readyTeams, {
      searchQuery,
      filterPlayerIds: filterPlayerIdsRef.current,
      filters,
      filterGender,
      inviteAsTrainerOnly,
      isFavorite,
      getUserMetadata,
      showTeams,
      getAvailabilityMatch: gameSlots ? getAvailabilityMatch : undefined,
    });
  }, [
    players,
    readyTeams,
    searchQuery,
    filterPlayerIdsKey,
    filters,
    filterGender,
    inviteAsTrainerOnly,
    isFavorite,
    getUserMetadata,
    showTeams,
    gameSlots,
    getAvailabilityMatch,
  ]);

  useEffect(() => {
    if (!showTeams) setInviteListKind('all');
  }, [showTeams]);

  const segmentFilteredEntries = useMemo(() => {
    let e = baseFilteredEntries;
    if (!showTeams) return e;
    if (!listSegmentUsers) e = e.filter((x) => x.kind !== 'user');
    if (!listSegmentTeams) e = e.filter((x) => x.kind !== 'team');
    return e;
  }, [baseFilteredEntries, showTeams, inviteListKind]);

  const memberOfSelectedTeam = useCallback(
    (userId: string) =>
      selectedTeamIds.some((tid) => {
        const t = teamById.get(tid);
        return (t?.members ?? []).some((m) => m.status === 'ACCEPTED' && m.userId === userId);
      }),
    [selectedTeamIds, teamById],
  );

  const handleUserClick = (playerId: string) => {
    if (multiSelect && !inviteAsTrainerOnly) {
      setSelectedTeamIds((prev) =>
        prev.filter((tid) => {
          const t = teamById.get(tid);
          return !(t?.members ?? []).some((m) => m.status === 'ACCEPTED' && m.userId === playerId);
        }),
      );
      setSelectedUserIds((prev) =>
        prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId],
      );
    } else {
      setSelectedUserIds([playerId]);
      setSelectedTeamIds([]);
    }
  };

  const handleTeamClick = (teamId: string) => {
    if (!multiSelect) return;
    const team = teamById.get(teamId);
    const memberIds = (team?.members ?? [])
      .filter((m) => m.status === 'ACCEPTED')
      .map((m) => m.userId);
    setSelectedUserIds((prev) => prev.filter((id) => !memberIds.includes(id)));
    setSelectedTeamIds((prev) => (prev.includes(teamId) ? prev.filter((id) => id !== teamId) : [...prev, teamId]));
  };

  const { playerIds: expandedPlayerIds, userTeamIdByReceiverId } = useMemo(
    () => expandSelectionToPlayerIds(selectedUserIds, selectedTeamIds, teamById),
    [selectedUserIds, selectedTeamIds, teamById],
  );

  const selectedUniqueCount = expandedPlayerIds.length;

  const handleConfirm = async () => {
    if (expandedPlayerIds.length === 0) return;

    if (!gameId) {
      setInviting('confirming');
      try {
        await Promise.resolve(
          onConfirm?.(expandedPlayerIds, {
            userTeamIdByReceiverId:
              Object.keys(userTeamIdByReceiverId).length > 0 ? userTeamIdByReceiverId : undefined,
          }),
        );
        handleClose();
      } catch {
        // keep modal open
      } finally {
        setInviting(null);
      }
      return;
    }

    setInviting('confirming');
    try {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        setInviting(null);
        runWithProfileName(() => void handleConfirm());
        return;
      }
      const asTrainer =
        (canInviteAsTrainer && inviteAsTrainer && expandedPlayerIds.length === 1) || inviteAsTrainerOnly;
      for (const playerId of expandedPlayerIds) {
        const userTeamId = userTeamIdByReceiverId[playerId];
        await invitesApi.send({
          receiverId: playerId,
          gameId,
          asTrainer: asTrainer && expandedPlayerIds[0] === playerId,
          userTeamId,
        });
        await usersApi.trackInteraction(playerId);
      }

      onInviteSent?.();
      onConfirm?.(expandedPlayerIds, {
        userTeamIdByReceiverId:
          Object.keys(userTeamIdByReceiverId).length > 0 ? userTeamIdByReceiverId : undefined,
      });
      handleClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(null);
    }
  };

  const showCountHint = multiSelect && selectedUniqueCount > 0;

  const preFilterCount = useMemo(
    () =>
      invitePreFilterCount(players, readyTeams, {
        inviteAsTrainerOnly,
        filterPlayerIds: filterPlayerIdsRef.current,
        showTeams,
        filterGender,
        filtersGender: filters.gender,
        segmentUsers: listSegmentUsers,
        segmentTeams: listSegmentTeams,
      }),
    [
      players,
      readyTeams,
      inviteAsTrainerOnly,
      filterPlayerIdsKey,
      showTeams,
      filterGender,
      filters.gender,
      inviteListKind,
    ],
  );

  const hasActiveFilters = useMemo(() => {
    const levelWide =
      filters.levelRange[0] <= PLAYER_INVITE_RATING_MIN && filters.levelRange[1] >= PLAYER_INVITE_RATING_MAX;
    const socialWide = filters.socialRange[0] <= 0 && filters.socialRange[1] >= socialLevelSliderMax;
    const genderActive = !filterGender && filters.gender !== 'ALL';
    return genderActive || !levelWide || !socialWide || filters.minGamesTogether > 0;
  }, [filters, filterGender, socialLevelSliderMax]);

  const resetFilters = () => {
    setFilters({
      ...filters,
      gender: filterGender ?? 'ALL',
      levelRange: [PLAYER_INVITE_RATING_MIN, PLAYER_INVITE_RATING_MAX],
      socialRange: [0, socialLevelSliderMax],
      minGamesTogether: 0,
    });
  };

  const listHasSourceRows = players.length > 0 || (showTeams && readyTeams.length > 0);

  const showInviteFriendCta =
    searchQuery.trim().length > 0 &&
    listHasSourceRows &&
    segmentFilteredEntries.length < INVITE_FRIEND_CTA_MAX_RESULTS;

  const renderEntry = (entry: InviteListEntry) => {
    if (entry.kind === 'user') {
      const rowSelected = selectedUserIds.includes(entry.user.id) && !memberOfSelectedTeam(entry.user.id);
      return (
        <PlayerListItem
          player={entry.user}
          isSelected={rowSelected}
          gamesTogetherCount={getUserMetadata(entry.user.id)?.gamesTogetherCount ?? 0}
          onSelect={() => handleUserClick(entry.user.id)}
          availability={gameSlots ? userAvailabilityById.get(entry.user.id) : undefined}
        />
      );
    }
    return (
      <TeamListItem
        team={entry.team}
        members={entry.members}
        isSelected={selectedTeamIds.includes(entry.team.id)}
        gamesTogetherCount={teamGamesTogetherScore(entry.team, getUserMetadata)}
        onSelect={() => handleTeamClick(entry.team.id)}
        availability={gameSlots ? teamAvailabilityById.get(entry.team.id) : undefined}
      />
    );
  };

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="player-list-modal">
      <DialogContent className="h-[min(92vh,720px)] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="flex-shrink-0 border-b border-gray-100/80 px-2.5 py-3 dark:border-gray-800/80">
          <DialogTitle className="text-lg font-bold tracking-tight text-gray-900 dark:text-white">
            {title ||
              (inviteAsTrainerOnly
                ? t('games.inviteTrainer', { defaultValue: 'Invite trainer' })
                : multiSelect
                  ? t('games.invitePlayers')
                  : t('games.invitePlayer'))}
          </DialogTitle>
        </DialogHeader>

        {loading ? (
          <div className="flex flex-1 items-center justify-center py-20 flex-shrink-0">
            <div className="h-11 w-11 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
          </div>
        ) : (
          <>
            <div className="flex-shrink-0 px-2.5 pt-3">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3.5 top-1/2 h-[18px] w-[18px] -translate-y-1/2 text-gray-400 dark:text-gray-500" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t('common.search') || 'Search...'}
                  className="w-full rounded-2xl border border-gray-200/90 bg-gray-50/80 py-3 pl-11 pr-4 text-sm text-gray-900 shadow-inner shadow-gray-900/[0.03] placeholder:text-gray-400 transition focus:border-primary-400 focus:bg-white focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:border-gray-700 dark:bg-gray-800/60 dark:text-white dark:placeholder-gray-500 dark:focus:border-primary-500 dark:focus:bg-gray-900 dark:focus:ring-primary-400/20"
                />
              </div>
            </div>

            {listHasSourceRows && showTeams && (
              <div className="flex flex-shrink-0 justify-center px-2.5 pt-2">
                <SegmentedSwitch
                  tabs={inviteListKindTabs}
                  activeId={inviteListKind}
                  onChange={(id) => setInviteListKind(id as 'all' | 'users' | 'teams')}
                  titleInActiveOnly={false}
                  layoutId="player-invite-list-kind"
                />
              </div>
            )}

            {listHasSourceRows && (
              <div className="flex-shrink-0 px-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-200/90 bg-white/90 px-2.5 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-primary-600 dark:hover:text-primary-300"
                >
                  <span className="flex items-center gap-2">
                    <span>{t('playerInvite.filtersTitle')}</span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700 dark:bg-primary-900/60 dark:text-primary-300">
                      {segmentFilteredEntries.length} / {preFilterCount}
                    </span>
                  </span>
                  <span className="flex items-center gap-2 text-xs font-medium">
                    {hasActiveFilters && (
                      <span
                        role="button"
                        tabIndex={0}
                        onClick={(e) => {
                          e.stopPropagation();
                          resetFilters();
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            e.stopPropagation();
                            resetFilters();
                          }
                        }}
                        className="inline-flex items-center gap-1 rounded-full border border-gray-200/90 bg-white/80 px-2 py-0.5 text-[11px] font-medium text-gray-600 shadow-sm transition hover:border-primary-300 hover:text-primary-700 active:scale-[0.98] dark:border-gray-600 dark:bg-gray-800/80 dark:text-gray-300 dark:hover:border-primary-600 dark:hover:text-primary-200"
                      >
                        <RotateCcw className="h-3 w-3" />
                        {t('playerInvite.reset')}
                      </span>
                    )}
                    {filtersOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  </span>
                </button>

                {filtersOpen && (
                  <div className="pt-2">
                    <PlayerListFilterBar
                      filters={filters}
                      onChange={setFilters}
                      socialLevelMax={socialLevelSliderMax}
                      genderLocked={filterGender ?? null}
                      onApplyClose={() => setFiltersOpen(false)}
                    />
                  </div>
                )}
              </div>
            )}

            {!filtersOpen && (
              <div className="relative z-10 flex min-h-0 flex-1 flex-col">
                {!listHasSourceRows ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center">
                    <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner dark:from-gray-800 dark:to-gray-900">
                      <UserPlus className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                    </div>
                    <p className="text-gray-600 dark:text-gray-400">{t('invites.noPlayersAvailable')}</p>
                  </div>
                ) : segmentFilteredEntries.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-center px-1">
                    <p className="text-gray-600 dark:text-gray-400">{t('common.noResults') || 'No results found'}</p>
                    {showInviteFriendCta && (
                      <div className="mt-5 flex w-full max-w-sm justify-center">
                        <InviteFriendToBandejaButton />
                      </div>
                    )}
                  </div>
                ) : (
                  <PlayerInviteVirtualList
                    entries={segmentFilteredEntries}
                    renderEntry={renderEntry}
                    className={`min-h-0 flex-1 overflow-y-auto scrollbar-auto px-2.5 pt-1 ${
                      showCountHint ? 'pb-28' : 'pb-20'
                    }`}
                    footer={
                      showInviteFriendCta ? (
                        <div className="flex justify-center pt-2">
                          <InviteFriendToBandejaButton />
                        </div>
                      ) : null
                    }
                  />
                )}

                {showCountHint && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
                    <div className="rounded-full bg-primary-100/95 px-3 py-2 text-center text-sm font-medium text-primary-700 shadow-lg shadow-primary-500/30 backdrop-blur-sm dark:bg-primary-900/70 dark:text-primary-300 dark:shadow-primary-900/50">
                      {t('games.playersSelected', { count: selectedUniqueCount })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {canInviteAsTrainer && gameId && !multiSelect && !inviteAsTrainerOnly && segmentFilteredEntries.length > 0 && (
              <label className="flex-shrink-0 mx-2.5 mb-2 flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={inviteAsTrainer}
                  onChange={(e) => setInviteAsTrainer(e.target.checked)}
                  className="rounded border-gray-300"
                />
                <span className="text-sm text-gray-700 dark:text-gray-300">
                  {t('playerCard.inviteAsTrainer', { defaultValue: 'Invite as trainer' })}
                </span>
              </label>
            )}

            {listHasSourceRows && (
              <div className="relative z-30 flex-shrink-0 border-t border-gray-100 bg-gray-50/95 px-2.5 py-3 pt-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
                <div className="flex gap-3">
                  <Button
                    onClick={handleClose}
                    variant="outline"
                    className="flex-1 rounded-xl font-medium"
                    disabled={inviting === 'confirming'}
                  >
                    {t('common.cancel')}
                  </Button>
                  <Button
                    onClick={handleConfirm}
                    className="flex-1 rounded-xl font-medium shadow-lg shadow-primary-500/25 dark:shadow-primary-900/30"
                    disabled={
                      segmentFilteredEntries.length === 0 ||
                      selectedUniqueCount === 0 ||
                      inviting === 'confirming'
                    }
                  >
                    {inviting === 'confirming' ? (
                      <span className="flex items-center justify-center gap-2">
                        <span className="h-4 w-4 animate-spin rounded-full border-2 border-white/30 border-t-white" />
                        {t('common.sending') || 'Sending...'}
                      </span>
                    ) : (
                      t('common.confirm')
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};
