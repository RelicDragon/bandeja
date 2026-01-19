import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Search } from 'lucide-react';
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
  const { users, getUserMetadata, fetchPlayers } = usePlayersStore();
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
        
        const [gameResponse, invitesResponse] = await Promise.allSettled([
          gameId ? gamesApi.getById(gameId) : Promise.resolve(null),
          gameId ? invitesApi.getGameInvites(gameId).catch(() => ({ data: [] })) : Promise.resolve({ data: [] })
        ]);

        const participantIds = new Set<string>();
        const invitedUserIds = new Set<string>();

        if (gameResponse.status === 'fulfilled' && gameResponse.value?.data) {
          gameResponse.value.data.participants.forEach((p: any) => {
            participantIds.add(p.userId);
          });
        }

        if (invitesResponse.status === 'fulfilled' && invitesResponse.value?.data) {
          invitesResponse.value.data.forEach((invite: any) => {
            if (invite.status === 'PENDING') {
              invitedUserIds.add(invite.receiverId);
            }
          });
        }

        const filtered = Object.values(users)
          .filter((player) => {
            return !participantIds.has(player.id) && !invitedUserIds.has(player.id);
          });
        setPlayers(filtered);
      } catch (error) {
        console.error('Failed to fetch players:', error);
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [gameId, fetchPlayers, users]);

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

    // Sort: favorites first, then by interaction count
    filtered.sort((a, b) => {
      const aIsFavorite = isFavorite(a.id);
      const bIsFavorite = isFavorite(b.id);
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      
      const aInteractionCount = getUserMetadata(a.id)?.interactionCount || 0;
      const bInteractionCount = getUserMetadata(b.id)?.interactionCount || 0;
      return bInteractionCount - aInteractionCount;
    });

    return filtered.slice(0, 50);
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

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="player-list-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
      <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {title || (multiSelect ? t('games.invitePlayers') : t('games.invitePlayer'))}
        </h2>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12 flex-shrink-0">
          <div className="inline-block animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      ) : (
        <>
          <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
            <div className="relative">
              <Search 
                size={20} 
                className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500"
              />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder={t('common.search') || 'Search...'}
                className="w-full pl-10 pr-4 py-2 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-primary-500 focus:border-transparent"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto min-h-0">
            {players.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-gray-600 dark:text-gray-400">{t('invites.noPlayersAvailable')}</p>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <p className="text-gray-600 dark:text-gray-400">{t('common.noResults') || 'No results found'}</p>
              </div>
            ) : (
              filteredPlayers.map((player) => {
                const isSelected = selectedIds.includes(player.id);
                
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                      isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                    onClick={() => handlePlayerClick(player.id)}
                    style={{ transition: 'background-color 0.15s ease-out' }}
                  >
                    <div className="flex-shrink-0">
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
                        <p className="text-base font-medium text-gray-900 dark:text-white truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        {player.gender && player.gender !== 'PREFER_NOT_TO_SAY' && (
                          <div className={`w-4 h-4 rounded-full flex items-center justify-center flex-shrink-0 ${
                            player.gender === 'MALE' 
                              ? 'bg-blue-500 dark:bg-blue-600' 
                              : 'bg-pink-500 dark:bg-pink-600'
                          }`}>
                            <i className={`bi ${player.gender === 'MALE' ? 'bi-gender-male' : 'bi-gender-female'} text-white text-[8px]`}></i>
                          </div>
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center ${
                          isSelected
                            ? 'bg-primary-600 border-primary-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                        style={{ transition: 'background-color 0.15s ease-out, border-color 0.15s ease-out' }}
                      >
                        {isSelected && <Check size={16} className="text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>

          {filteredPlayers.length > 0 && (
            <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
              <div className="flex gap-2">
                <Button
                  onClick={handleClose}
                  variant="outline"
                  className="flex-1"
                  disabled={inviting === 'confirming'}
                >
                  {t('common.cancel')}
                </Button>
                <Button
                  onClick={handleConfirm}
                  className="flex-1"
                  disabled={selectedIds.length === 0 || inviting === 'confirming'}
                >
                  {inviting === 'confirming' ? (
                    <div className="flex items-center justify-center gap-2">
                      <div className="inline-block animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                      {t('common.sending') || 'Sending...'}
                    </div>
                  ) : (
                    <>
                      {t('common.confirm')} {multiSelect && selectedIds.length > 0 && `(${selectedIds.length})`}
                    </>
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
