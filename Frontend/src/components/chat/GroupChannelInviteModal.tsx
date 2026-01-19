import { useState, useEffect, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search } from 'lucide-react';
import { BasicUser } from '@/types';
import { chatApi } from '@/api/chat';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import { usePlayersStore } from '@/store/playersStore';
import { matchesSearch } from '@/utils/transliteration';
import { BaseModal } from '@/components/BaseModal';

interface GroupChannelInviteModalProps {
  groupChannelId: string;
  onClose: () => void;
  onInviteSent?: () => void;
  existingParticipantIds?: string[];
}

export const GroupChannelInviteModal = ({
  groupChannelId,
  onClose,
  onInviteSent,
  existingParticipantIds = []
}: GroupChannelInviteModalProps) => {
  const { t } = useTranslation();
  const { users, fetchPlayers } = usePlayersStore();
  const [players, setPlayers] = useState<BasicUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [inviting, setInviting] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
  };

  useEffect(() => {
    const loadPlayers = async () => {
      try {
        await fetchPlayers();
        
        const filtered = Object.values(users)
          .filter((player) => !existingParticipantIds.includes(player.id));
        setPlayers(filtered);
      } catch (error) {
        console.error('Failed to fetch players:', error);
        toast.error(t('chat.failedToLoadUsers', { defaultValue: 'Failed to load users' }));
      } finally {
        setLoading(false);
      }
    };

    loadPlayers();
  }, [fetchPlayers, users, existingParticipantIds, t]);

  const filteredPlayers = useMemo(() => {
    if (!searchQuery.trim()) {
      return players;
    }

    return players.filter((player) =>
      matchesSearch(
        `${player.firstName || ''} ${player.lastName || ''}`.trim(),
        searchQuery
      )
    );
  }, [players, searchQuery]);

  const handleInvite = async (playerId: string) => {
    setInviting(playerId);
    try {
      await chatApi.inviteUser(groupChannelId, { receiverId: playerId });
      toast.success(t('chat.inviteSent', { defaultValue: 'Invite sent successfully' }));
      setPlayers(players.filter(p => p.id !== playerId));
      onInviteSent?.();
    } catch (error: any) {
      console.error('Failed to send invite:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.inviteError', { defaultValue: 'Failed to send invite' })
      );
    } finally {
      setInviting(null);
    }
  };

  return (
    <BaseModal
      isOpen={isOpen}
      onClose={handleClose}
      isBasic
      modalId="group-channel-invite-modal"
      showCloseButton={true}
      closeOnBackdropClick={true}
    >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {t('chat.inviteUser', { defaultValue: 'Invite User' })}
          </h2>
        </div>

        <div className="p-4 border-b border-gray-200 dark:border-gray-800 flex-shrink-0">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
            <input
              type="text"
              placeholder={t('chat.searchUsers', { defaultValue: 'Search users...' })}
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
            />
          </div>
        </div>

        {loading ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-2">
            {filteredPlayers.length === 0 ? (
              <div className="text-center py-12 text-gray-500 dark:text-gray-400">
                <p>{t('chat.noUsersFound', { defaultValue: 'No users found' })}</p>
              </div>
            ) : (
              filteredPlayers.map((player) => (
                <div
                  key={player.id}
                  className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
                >
                  <PlayerAvatar
                    player={player}
                    showName={false}
                    smallLayout={true}
                    fullHideName={true}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-gray-900 dark:text-white truncate">
                      {player.firstName} {player.lastName}
                    </p>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Level {player.level.toFixed(1)}
                    </p>
                  </div>
                  <button
                    onClick={() => handleInvite(player.id)}
                    disabled={inviting === player.id}
                    className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                  >
                    {inviting === player.id ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                    ) : (
                      t('chat.invite', { defaultValue: 'Invite' })
                    )}
                  </button>
                </div>
              ))
            )}
          </div>
        )}
    </BaseModal>
  );
};
