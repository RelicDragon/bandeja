import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { X, MessageCircle, Check, Search } from 'lucide-react';
import { usersApi, InvitablePlayer } from '@/api/users';
import { invitesApi } from '@/api';
import { Button } from './Button';
import { PlayerAvatar } from './PlayerAvatar';
import { useFavoritesStore } from '@/store/favoritesStore';

interface PlayerListModalProps {
  gameId?: string;
  onClose: () => void;
  onInviteSent?: () => void;
  multiSelect?: boolean;
  onConfirm?: (playerIds: string[]) => void;
  preSelectedIds?: string[];
  filterPlayerIds?: string[];
}

export const PlayerListModal = ({
  gameId,
  onClose,
  onInviteSent,
  multiSelect = false,
  onConfirm,
  preSelectedIds = [],
  filterPlayerIds = []
}: PlayerListModalProps) => {
  const { t } = useTranslation();
  const isFavorite = useFavoritesStore((state) => state.isFavorite);
  const [players, setPlayers] = useState<InvitablePlayer[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>(preSelectedIds);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const fetchPlayers = async () => {
      try {
        const response = await usersApi.getInvitablePlayers(gameId);
        setPlayers(response.data);
      } catch (error) {
        console.error('Failed to fetch players:', error);
      } finally {
        setLoading(false);
      }
    };

    fetchPlayers();
  }, [gameId]);

  const filteredPlayers = useMemo(() => {
    let filtered = players;

    // Filter out players that are in the filterPlayerIds array
    if (filterPlayerIds.length > 0) {
      filtered = filtered.filter((player) => !filterPlayerIds.includes(player.id));
    }

    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter((player) => {
        const fullName = `${player.firstName || ''} ${player.lastName || ''}`.toLowerCase();
        const telegram = player.telegramUsername?.toLowerCase() || '';
        return fullName.includes(query) || telegram.includes(query);
      });
    }

    // Sort: favorites first, then by interaction count
    filtered.sort((a, b) => {
      const aIsFavorite = isFavorite(a.id);
      const bIsFavorite = isFavorite(b.id);
      
      if (aIsFavorite && !bIsFavorite) return -1;
      if (!aIsFavorite && bIsFavorite) return 1;
      
      return b.interactionCount - a.interactionCount;
    });

    return filtered.slice(0, 50);
  }, [players, searchQuery, filterPlayerIds, isFavorite]);

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
      onClose();
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
      onClose();
    } catch (error: any) {
      toast.error(error.response?.data?.message || t('errors.generic'));
    } finally {
      setInviting(null);
    }
  };

  return createPortal(
    <div 
      className="fixed inset-0 z-[9999] flex items-center justify-center p-4" 
      onClick={onClose}
      style={{ 
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        backdropFilter: 'blur(4px)',
        WebkitBackdropFilter: 'blur(4px)',
        position: 'fixed',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
      }}
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-lg shadow-2xl w-full max-w-md flex flex-col"
        onClick={(e) => e.stopPropagation()}
        style={{ height: '80vh', maxHeight: '600px' }}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {multiSelect ? t('games.invitePlayers') : t('games.invitePlayer')}
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
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

            {players.length === 0 ? (
              <div className="flex items-center justify-center py-12 flex-1">
                <p className="text-gray-600 dark:text-gray-400">{t('invites.noPlayersAvailable')}</p>
              </div>
            ) : filteredPlayers.length === 0 ? (
              <div className="flex items-center justify-center py-12 flex-1">
                <p className="text-gray-600 dark:text-gray-400">{t('common.noResults') || 'No results found'}</p>
              </div>
            ) : (
              <div className="overflow-y-auto flex-1 min-h-0">
                {filteredPlayers.map((player) => {
                const isSelected = selectedIds.includes(player.id);
                
                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-4 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors cursor-pointer border-b border-gray-100 dark:border-gray-800 last:border-b-0 ${
                      isSelected ? 'bg-primary-50 dark:bg-primary-900/20' : ''
                    }`}
                    onClick={() => handlePlayerClick(player.id)}
                  >
                    <div className="flex-shrink-0">
                      <PlayerAvatar 
                        player={{
                          id: player.id,
                          firstName: player.firstName,
                          lastName: player.lastName,
                          avatar: player.avatar,
                          level: player.level,
                          gender: player.gender,
                        }}
                        showName={false}
                        smallLayout={true}
                      />
                    </div>

                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="text-base font-medium text-gray-900 dark:text-white truncate">
                          {player.firstName} {player.lastName}
                        </p>
                        {player.telegramUsername && (
                          <MessageCircle size={16} className="text-blue-500 dark:text-blue-400 flex-shrink-0" />
                        )}
                      </div>
                    </div>

                    <div className="flex-shrink-0">
                      <div
                        className={`w-6 h-6 rounded-full border-2 flex items-center justify-center transition-colors ${
                          isSelected
                            ? 'bg-primary-600 border-primary-600'
                            : 'border-gray-300 dark:border-gray-600'
                        }`}
                      >
                        {isSelected && <Check size={16} className="text-white" />}
                      </div>
                    </div>
                  </div>
                );
              })}
              </div>
            )}

            {filteredPlayers.length > 0 && (
              <div className="p-4 border-t border-gray-200 dark:border-gray-800 flex-shrink-0">
                <div className="flex gap-2">
                  <Button
                    onClick={onClose}
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
                        {t('common.confirm')} {selectedIds.length > 0 && `(${selectedIds.length})`}
                      </>
                    )}
                  </Button>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>,
    document.body
  );
};

