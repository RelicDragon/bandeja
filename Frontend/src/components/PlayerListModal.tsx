import { useState, useEffect, useMemo, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { ChevronDown, ChevronUp, RotateCcw, Search, UserPlus } from 'lucide-react';
import { BasicUser } from '@/types';
import { invitesApi } from '@/api';
import { gamesApi } from '@/api/games';
import { usersApi } from '@/api/users';
import { Button } from './Button';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { matchesSearch } from '@/utils/transliteration';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { PlayerListFilterBar } from '@/components/PlayerListFilterBar';
import {
  defaultPlayerInviteFilters,
  PLAYER_INVITE_LIST_PAGE_SIZE,
  PLAYER_INVITE_RATING_MAX,
  PLAYER_INVITE_RATING_MIN,
  type PlayerInviteFilters,
} from '@/components/playerInvite/playerInviteFilters';
import { PlayerListItem } from '@/components/PlayerListItem';
import {
  InviteFriendToBandejaButton,
  INVITE_FRIEND_CTA_MAX_RESULTS,
} from '@/components/InviteFriendToBandejaButton';

interface PlayerListModalProps {
  gameId?: string;
  onClose: () => void;
  onInviteSent?: () => void;
  multiSelect?: boolean;
  onConfirm?: (playerIds: string[]) => void | Promise<void>;
  preSelectedIds?: string[];
  filterPlayerIds?: string[];
  filterGender?: 'MALE' | 'FEMALE';
  title?: string;
  inviteAsTrainerOnly?: boolean;
}

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
}: PlayerListModalProps) => {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((state) => state.isFavorite);
  const invitableMaxSocial = usePlayersStore((s) => s.invitableMaxSocialLevel);
  const { getUserMetadata, fetchPlayers } = usePlayersStore();
  const [players, setPlayers] = useState<BasicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(preSelectedIds);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);
  const [canInviteAsTrainer, setCanInviteAsTrainer] = useState(inviteAsTrainerOnly);
  const [inviteAsTrainer, setInviteAsTrainer] = useState(inviteAsTrainerOnly);
  const [filters, setFilters] = useState<PlayerInviteFilters>(() => defaultPlayerInviteFilters(1));
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [visibleListCount, setVisibleListCount] = useState(PLAYER_INVITE_LIST_PAGE_SIZE);

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

  useEffect(() => {
    const loadPlayers = async () => {
      setLoading(true);
      if (!inviteAsTrainerOnly) setCanInviteAsTrainer(false);
      try {
        await fetchPlayers();
        const currentUsers = usePlayersStore.getState().users;

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
          (player) => !participantIds.has(player.id) && !invitedUserIds.has(player.id)
        );
        setPlayers(filtered);
      } catch {
        setPlayers([]);
        toast.error(t('errors.generic'));
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [gameId, fetchPlayers, t, inviteAsTrainerOnly]);

  const baseFilteredPlayers = useMemo(() => {
    let filtered = players;

    if (inviteAsTrainerOnly) {
      filtered = filtered.filter((p) => p.isTrainer === true);
    }

    const genderApply = filterGender ?? filters.gender;
    filtered = filtered.filter((player) => {
      if (genderApply === 'ALL') {
        return player.gender === 'MALE' || player.gender === 'FEMALE' || player.gender === 'PREFER_NOT_TO_SAY';
      }
      return player.gender === genderApply;
    });

    if (filterPlayerIds.length > 0) {
      filtered = filtered.filter((player) => !filterPlayerIds.includes(player.id));
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((player) => {
        const fullName = `${player.firstName || ''} ${player.lastName || ''}`;
        return matchesSearch(searchQuery, fullName);
      });
    }

    const [lMin, lMax] = filters.levelRange;
    const [sMin, sMax] = filters.socialRange;
    filtered = filtered.filter((p) => {
      const lv = typeof p.level === 'number' ? p.level : 0;
      const sv = typeof p.socialLevel === 'number' ? p.socialLevel : 0;
      return lv >= lMin && lv <= lMax && sv >= sMin && sv <= sMax;
    });

    if (filters.minGamesTogether > 0) {
      filtered = filtered.filter((p) => {
        const c = getUserMetadata(p.id)?.gamesTogetherCount ?? 0;
        return c >= filters.minGamesTogether;
      });
    }

    return [...filtered].sort((a, b) => {
      const aIsFavorite = isFavorite(a.id);
      const bIsFavorite = isFavorite(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      const aInteractionCount = getUserMetadata(a.id)?.interactionCount || 0;
      const bInteractionCount = getUserMetadata(b.id)?.interactionCount || 0;
      if (bInteractionCount !== aInteractionCount) return bInteractionCount - aInteractionCount;
      const aG = getUserMetadata(a.id)?.gamesTogetherCount ?? 0;
      const bG = getUserMetadata(b.id)?.gamesTogetherCount ?? 0;
      return bG - aG;
    });
  }, [
    players,
    searchQuery,
    filterPlayerIds,
    filters,
    filterGender,
    inviteAsTrainerOnly,
    isFavorite,
    getUserMetadata,
  ]);

  const filterPlayerIdsKey = useMemo(() => filterPlayerIds.join(','), [filterPlayerIds]);

  useEffect(() => {
    setVisibleListCount(PLAYER_INVITE_LIST_PAGE_SIZE);
  }, [players, searchQuery, filterPlayerIdsKey, filterGender, inviteAsTrainerOnly, filters]);

  const hasMoreFilteredPlayers = visibleListCount < baseFilteredPlayers.length;

  const displayFilteredPlayers = useMemo(() => {
    const slice = baseFilteredPlayers.slice(0, visibleListCount);
    if (!hasMoreFilteredPlayers && slice.length > 0) {
      return [...slice].sort((a, b) => {
        const aI = getUserMetadata(a.id)?.interactionCount || 0;
        const bI = getUserMetadata(b.id)?.interactionCount || 0;
        if (bI !== aI) return bI - aI;
        const aF = isFavorite(a.id);
        const bF = isFavorite(b.id);
        if (aF && !bF) return -1;
        if (!aF && bF) return 1;
        const aG = getUserMetadata(a.id)?.gamesTogetherCount ?? 0;
        const bG = getUserMetadata(b.id)?.gamesTogetherCount ?? 0;
        return bG - aG;
      });
    }
    return slice;
  }, [baseFilteredPlayers, visibleListCount, hasMoreFilteredPlayers, getUserMetadata, isFavorite]);

  const handlePlayerClick = (playerId: string) => {
    if (multiSelect && !inviteAsTrainerOnly) {
      togglePlayer(playerId);
    } else {
      setSelectedIds([playerId]);
    }
  };

  const togglePlayer = (playerId: string) => {
    setSelectedIds((prev) => (prev.includes(playerId) ? prev.filter((id) => id !== playerId) : [...prev, playerId]));
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;

    if (!gameId) {
      setInviting('confirming');
      try {
        await Promise.resolve(onConfirm?.(selectedIds));
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
      const asTrainer = (canInviteAsTrainer && inviteAsTrainer && selectedIds.length === 1) || inviteAsTrainerOnly;
      for (const playerId of selectedIds) {
        await invitesApi.send({
          receiverId: playerId,
          gameId,
          asTrainer: asTrainer && selectedIds[0] === playerId,
        });
        await usersApi.trackInteraction(playerId);
      }

      onInviteSent?.();
      onConfirm?.(selectedIds);
      handleClose();
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      toast.error(err.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(null);
    }
  };

  const selectedCount = selectedIds.length;
  const showCountHint = multiSelect && selectedCount > 0;

  const preFilterCount = useMemo(() => {
    let list = players;
    if (inviteAsTrainerOnly) list = list.filter((p) => p.isTrainer === true);
    if (filterPlayerIds.length > 0) list = list.filter((p) => !filterPlayerIds.includes(p.id));
    return list.length;
  }, [players, inviteAsTrainerOnly, filterPlayerIds]);

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

  const showInviteFriendCta =
    searchQuery.trim().length > 0 &&
    players.length > 0 &&
    baseFilteredPlayers.length < INVITE_FRIEND_CTA_MAX_RESULTS;

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="player-list-modal">
      <DialogContent className="max-h-[min(92vh,720px)] flex flex-col overflow-hidden p-0 gap-0">
        <DialogHeader className="flex-shrink-0 border-b border-gray-100/80 px-4 py-3 dark:border-gray-800/80">
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
            <div className="flex-shrink-0 px-4 pt-3">
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

            {players.length > 0 && (
              <div className="flex-shrink-0 px-4 pt-2">
                <button
                  type="button"
                  onClick={() => setFiltersOpen((v) => !v)}
                  className="w-full flex items-center justify-between rounded-xl border border-gray-200/90 bg-white/90 px-3 py-2 text-sm font-semibold text-gray-700 shadow-sm transition hover:border-primary-300 hover:text-primary-700 dark:border-gray-700 dark:bg-gray-900/80 dark:text-gray-200 dark:hover:border-primary-600 dark:hover:text-primary-300"
                >
                  <span className="flex items-center gap-2">
                    <span>{t('playerInvite.filtersTitle')}</span>
                    <span className="rounded-full bg-primary-100 px-2 py-0.5 text-xs font-bold text-primary-700 dark:bg-primary-900/60 dark:text-primary-300">
                      {baseFilteredPlayers.length} / {preFilterCount}
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
                <div
                  className={`min-h-0 flex-1 overflow-y-auto px-4 pt-1 ${
                    baseFilteredPlayers.length > 0
                      ? showCountHint
                        ? 'pb-28'
                        : 'pb-20'
                      : 'pb-4'
                  }`}
                >
                  {players.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center">
                      <div className="mb-3 flex h-16 w-16 items-center justify-center rounded-2xl bg-gradient-to-br from-gray-100 to-gray-50 shadow-inner dark:from-gray-800 dark:to-gray-900">
                        <UserPlus className="h-8 w-8 text-gray-400 dark:text-gray-500" />
                      </div>
                      <p className="text-gray-600 dark:text-gray-400">{t('invites.noPlayersAvailable')}</p>
                    </div>
                  ) : baseFilteredPlayers.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-center px-1">
                      <p className="text-gray-600 dark:text-gray-400">{t('common.noResults') || 'No results found'}</p>
                      {showInviteFriendCta && (
                        <div className="mt-5 flex w-full max-w-sm justify-center">
                          <InviteFriendToBandejaButton />
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="space-y-1.5 pb-2">
                      {displayFilteredPlayers.map((player) => (
                        <PlayerListItem
                          key={player.id}
                          player={player}
                          isSelected={selectedIds.includes(player.id)}
                          gamesTogetherCount={getUserMetadata(player.id)?.gamesTogetherCount ?? 0}
                          onSelect={() => handlePlayerClick(player.id)}
                        />
                      ))}
                      {showInviteFriendCta && (
                        <div className="flex justify-center pt-2">
                          <InviteFriendToBandejaButton />
                        </div>
                      )}
                      {hasMoreFilteredPlayers && (
                        <div className="flex flex-col items-center gap-1 pb-1 pt-2">
                          <button
                            type="button"
                            onClick={() =>
                              setVisibleListCount((c) => c + PLAYER_INVITE_LIST_PAGE_SIZE)
                            }
                            className="rounded-xl border border-primary-300 bg-white px-4 py-2.5 text-sm font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50 active:scale-[0.98] dark:border-primary-600 dark:bg-gray-900 dark:text-primary-300 dark:hover:bg-primary-950/40"
                          >
                            {t('playerInvite.showMore')}
                          </button>
                          <p className="text-center text-[11px] text-gray-500 dark:text-gray-400">
                            {t('playerInvite.listShowing', {
                              visible: displayFilteredPlayers.length,
                              total: baseFilteredPlayers.length,
                            })}
                          </p>
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {showCountHint && (
                  <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex justify-center">
                    <div className="rounded-full bg-primary-100/95 px-4 py-2 text-center text-sm font-medium text-primary-700 shadow-lg shadow-primary-500/30 backdrop-blur-sm dark:bg-primary-900/70 dark:text-primary-300 dark:shadow-primary-900/50">
                      {t('games.playersSelected', { count: selectedCount })}
                    </div>
                  </div>
                )}
              </div>
            )}

            {canInviteAsTrainer && gameId && !multiSelect && !inviteAsTrainerOnly && baseFilteredPlayers.length > 0 && (
              <label className="flex-shrink-0 mx-4 mb-2 flex items-center gap-2 cursor-pointer">
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

            {players.length > 0 && (
              <div className="relative z-30 flex-shrink-0 border-t border-gray-100 bg-gray-50/95 p-4 pt-2 backdrop-blur-sm dark:border-gray-800 dark:bg-gray-950/95">
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
                      baseFilteredPlayers.length === 0 || selectedIds.length === 0 || inviting === 'confirming'
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
