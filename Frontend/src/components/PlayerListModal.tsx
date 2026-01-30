import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Search, UserPlus } from 'lucide-react';
import { BasicUser } from '@/types';
import { invitesApi } from '@/api';
import { gamesApi } from '@/api/games';
import { usersApi } from '@/api/users';
import { Button } from './Button';
import { PlayerAvatar } from './PlayerAvatar';
import { useFavoritesStore } from '@/store/favoritesStore';
import { usePlayersStore } from '@/store/playersStore';
import { matchesSearch } from '@/utils/transliteration';
import { BaseModal } from '@/components';

interface PlayerListModalProps {
  gameId?: string;
  onClose: () => void;
  onInviteSent?: () => void;
  multiSelect?: boolean;
  onConfirm?: (playerIds: string[]) => void;
  preSelectedIds?: string[];
  filterPlayerIds?: string[];
  filterGender?: 'MALE' | 'FEMALE';
  title?: string;
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
  title
}: PlayerListModalProps) => {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((state) => state.isFavorite);
  const { getUserMetadata, fetchPlayers } = usePlayersStore();
  const [players, setPlayers] = useState<BasicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(preSelectedIds);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    // Wait for animation to complete before calling onClose
    setTimeout(() => {
      onClose();
    }, 300);
  };

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        await fetchPlayers();
        const currentUsers = usePlayersStore.getState().users;

        const [gameResponse, invitesResponse] = await Promise.allSettled([
          gameId ? gamesApi.getById(gameId) : Promise.resolve(null),
          gameId ? invitesApi.getGameInvites(gameId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        const participantIds = new Set<string>();
        const invitedUserIds = new Set<string>();

        if (gameId && gameResponse.status === 'fulfilled' && gameResponse.value?.data) {
          const participants = gameResponse.value.data.participants;
          if (Array.isArray(participants)) {
            participants.forEach((p: { userId: string }) => participantIds.add(p.userId));
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
  }, [gameId, fetchPlayers]);

  const filteredPlayers = useMemo(() => {
    let filtered = players;

    // Filter by gender if specified
    if (filterGender) {
      filtered = filtered.filter((player) => player.gender === filterGender);
    }

    // Filter out players that are in the filterPlayerIds array
    if (filterPlayerIds.length > 0) {
      filtered = filtered.filter((player) => !filterPlayerIds.includes(player.id));
    }

    if (searchQuery.trim()) {
      filtered = filtered.filter((player) => {
        const fullName = `${player.firstName || ''} ${player.lastName || ''}`;
        return matchesSearch(searchQuery, fullName);
      });
    }

    // Sort: favorites first, then by interaction count (immutable)
    return [...filtered].sort((a, b) => {
      const aIsFavorite = isFavorite(a.id);
      const bIsFavorite = isFavorite(b.id);
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      const aInteractionCount = getUserMetadata(a.id)?.interactionCount || 0;
      const bInteractionCount = getUserMetadata(b.id)?.interactionCount || 0;
      return bInteractionCount - aInteractionCount;
    });
  }, [players, searchQuery, filterPlayerIds, filterGender, isFavorite, getUserMetadata]);

  const handlePlayerClick = (playerId: string) => {
    if (multiSelect) {
      togglePlayer(playerId);
    } else {
      // Single select mode - replace current selection
      setSelectedIds([playerId]);
    }
  };

  const togglePlayer = (playerId: string) => {
    setSelectedIds(prev =>
      prev.includes(playerId)
        ? prev.filter(id => id !== playerId)
        : [...prev, playerId]
    );
  };

  const handleConfirm = async () => {
    if (selectedIds.length === 0) return;

    // If no gameId, just return selected IDs without sending
    if (!gameId) {
      onConfirm?.(selectedIds);
      handleClose();
      return;
    }

    // Otherwise, send invites
    setInviting('confirming');
    try {
      for (const playerId of selectedIds) {
        await invitesApi.send({
          receiverId: playerId,
          gameId,
        });
        await usersApi.trackInteraction(playerId);
      }
      
      onInviteSent?.();
      onConfirm?.(selectedIds);
      handleClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(null);
    }
  };

  const selectedCount = selectedIds.length;
  const showCountHint = multiSelect && selectedCount > 0;

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="player-list-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
      contentClassName="h-[80vh] max-w-[80vw] overflow-hidden flex flex-col p-0 bg-gradient-to-b from-white to-gray-50/80 dark:from-gray-900 dark:to-gray-900/95"
    >
      <div className="flex items-center gap-3 px-5 py-4 flex-shrink-0 bg-white/80 dark:bg-gray-900/80 border-b border-gray-100 dark:border-gray-800">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-100 dark:bg-primary-900/40">
          <UserPlus className="h-5 w-5 text-primary-600 dark:text-primary-400" />
        </div>
        <h2 className="text-lg font-semibold text-gray-900 dark:text-white tracking-tight">
          {title || (multiSelect ? t('games.invitePlayers') : t('games.invitePlayer'))}
        </h2>
      </div>

      {loading ? (
        <div className="flex flex-1 items-center justify-center py-16 flex-shrink-0">
          <div className="h-10 w-10 animate-spin rounded-full border-2 border-primary-200 border-t-primary-600 dark:border-primary-800 dark:border-t-primary-400" />
        </div>
      ) : (
        <>
          <div className="px-4 py-3 flex-shrink-0">
            <div className="relative">
              <Search className="absolute left-3.5 top-1/2 h-5 w-5 -translate-y-1/2 text-gray-400 dark:text-gray-500" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search') || 'Search...'}
                className="w-full rounded-xl border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800/80 py-2.5 pl-10 pr-4 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 shadow-sm transition focus:border-primary-500 focus:outline-none focus:ring-2 focus:ring-primary-500/20 dark:focus:border-primary-400 dark:focus:ring-primary-400/20"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0 px-3 pb-2">
            {players.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <div className="mb-3 h-14 w-14 rounded-2xl bg-gray-100 dark:bg-gray-800 flex items-center justify-center">
                  <UserPlus className="h-7 w-7 text-gray-400 dark:text-gray-500" />
                </div>
                <p className="text-gray-600 dark:text-gray-400">{t('invites.noPlayersAvailable')}</p>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-16 text-center">
                <p className="text-gray-600 dark:text-gray-400">{t('common.noResults') || 'No results found'}</p>
              </div>
            ) : (
              <div className="space-y-1">
                {filteredPlayers.map((player) => {
                  const isSelected = selectedIds.includes(player.id);
                  return (
                    <div
                      key={player.id}
                      role="button"
                      tabIndex={0}
                      className={`flex items-center gap-3 rounded-xl px-3 py-2.5 cursor-pointer transition-colors ${
                        isSelected
                          ? 'bg-primary-50 dark:bg-primary-900/30 ring-1 ring-primary-200/50 dark:ring-primary-700/50'
                          : 'hover:bg-gray-100 dark:hover:bg-gray-800/80 active:bg-gray-200 dark:active:bg-gray-700/80'
                      }`}
                      onClick={() => handlePlayerClick(player.id)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault();
                          handlePlayerClick(player.id);
                        }
                      }}
                    >
                      <div className="flex-shrink-0 ring-2 ring-white dark:ring-gray-900 rounded-full">
                        <PlayerAvatar
                          player={player}
                          showName={false}
                          fullHideName={true}
                          smallLayout={false}
                          extrasmall={true}
                        />
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {player.firstName} {player.lastName}
                          </p>
                          {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
                            <span className={`inline-flex h-4 w-4 flex-shrink-0 items-center justify-center rounded-full text-[10px] ${
                              player.gender === 'MALE' ? 'bg-blue-500 text-white' : 'bg-pink-500 text-white'
                            }`}>
                              <i className={`bi ${player.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'}`} />
                            </span>
                          )}
                        </div>
                      </div>
                      <div className={`flex h-6 w-6 flex-shrink-0 items-center justify-center rounded-full border-2 transition-colors ${
                        isSelected ? 'border-primary-600 bg-primary-600 dark:border-primary-500 dark:bg-primary-500' : 'border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800'
                      }`}>
                        {isSelected && <Check size={14} className="text-white" strokeWidth={2.5} />}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {showCountHint && (
            <div className="flex-shrink-0 mx-4 mb-2 rounded-xl bg-primary-100 dark:bg-primary-900/40 px-4 py-2.5 text-center text-sm font-medium text-primary-700 dark:text-primary-300 transition-opacity duration-200">
              {t('games.playersSelected', { count: selectedCount })}
            </div>
          )}

          {filteredPlayers.length > 0 && (
            <div className="flex-shrink-0 p-4 pt-2 border-t border-gray-100 dark:border-gray-800 bg-white/60 dark:bg-gray-900/60">
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
                  disabled={selectedIds.length === 0 || inviting === 'confirming'}
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
    </BaseModal>
  );
};
