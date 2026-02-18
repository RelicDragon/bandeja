import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search, XCircle, Check, User, X } from 'lucide-react';
import { PlayerAvatar } from '@/components';
import { GroupChannelInvite } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { matchesSearch } from '@/utils/transliteration';
import { formatRelativeTime } from '@/utils/dateFormat';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/Dialog';
import { BasicUser } from '@/types';

const buttonTransitionStyle = `
  @keyframes fadeInSlide {
    from {
      opacity: 0;
      transform: translateX(10px) scale(0.9);
    }
    to {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
  }
  @keyframes fadeOutSlide {
    from {
      opacity: 1;
      transform: translateX(0) scale(1);
    }
    to {
      opacity: 0;
      transform: translateX(-10px) scale(0.9);
    }
  }
  .button-container-enter {
    animation: fadeInSlide 0.3s ease-in-out forwards;
  }
  .button-container-exit {
    animation: fadeOutSlide 0.3s ease-in-out forwards;
  }
`;

interface GroupChannelInvitesModalProps {
  groupChannelId: string;
  participants: { userId: string }[];
  isOwner: boolean;
  isAdmin: boolean;
  onClose: () => void;
  onUpdate?: () => void;
}

export const GroupChannelInvitesModal = ({
  groupChannelId,
  participants,
  isOwner,
  isAdmin,
  onClose,
  onUpdate
}: GroupChannelInvitesModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [invites, setInvites] = useState<GroupChannelInvite[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<BasicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const originalOrderRef = useRef<Map<string, number>>(new Map());
  const [confirmingPlayerId, setConfirmingPlayerId] = useState<string | null>(null);
  const [invitingPlayerId, setInvitingPlayerId] = useState<string | null>(null);
  const [exitingPlayerId, setExitingPlayerId] = useState<string | null>(null);

  const participantsIdsRef = useRef<string[]>([]);
  
  useEffect(() => {
    participantsIdsRef.current = participants.map(p => p.userId);
  }, [participants]);

  const loadData = useCallback(async () => {
    setLoadingUsers(true);
    try {
      const [invitesData, usersData] = await Promise.all([
        chatApi.getGroupChannelInvites(groupChannelId),
        usersApi.getInvitablePlayers()
      ]);
      
      setInvites(invitesData.data || []);
      
      const allPlayers = usersData.data || [];
      const participantIds = new Set(participantsIdsRef.current);
      const filtered = allPlayers.filter((player) => !participantIds.has(player.id));
      setAllUsers(filtered);
      originalOrderRef.current = new Map(filtered.map((user, index) => [user.id, index]));
    } catch (error: any) {
      console.error('Failed to load data:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.failedToLoadData', { defaultValue: 'Failed to load data' })
      );
    } finally {
      setLoadingUsers(false);
    }
  }, [groupChannelId, t]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const handleCancelInvite = useCallback(async (inviteId: string) => {
    const invite = invites.find(inv => inv.id === inviteId);
    if (!invite) return;
    
    try {
      await chatApi.cancelInvite(inviteId);
      
      setInvites(prev => prev.filter(inv => inv.id !== inviteId));
      
      if (!allUsers.find(u => u.id === invite.receiverId)) {
        const originalIndex = originalOrderRef.current.get(invite.receiverId) ?? allUsers.length;
        setAllUsers(prev => {
          const newUsers = [...prev, invite.receiver];
          return newUsers.sort((a, b) => {
            const indexA = originalOrderRef.current.get(a.id) ?? Infinity;
            const indexB = originalOrderRef.current.get(b.id) ?? Infinity;
            return indexA - indexB;
          });
        });
        if (!originalOrderRef.current.has(invite.receiverId)) {
          originalOrderRef.current.set(invite.receiverId, originalIndex);
        }
      }
      
      toast.success(t('chat.inviteCancelled', { defaultValue: 'Invite cancelled' }));
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to cancel invite:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.cancelInviteError', { defaultValue: 'Failed to cancel invite' })
      );
    }
  }, [invites, allUsers, t, onUpdate]);

  const inviteMap = useMemo(() => 
    new Map(invites.map(inv => [inv.receiverId, inv])),
    [invites]
  );

  const getInviteForUser = useCallback((userId: string): GroupChannelInvite | undefined => {
    return inviteMap.get(userId);
  }, [inviteMap]);

  const allUsersWithInvites = useMemo(() => {
    const allUsersMap = new Map(allUsers.map(user => [user.id, user]));
    const allUserIds = new Set([...allUsers.map(u => u.id), ...invites.map(inv => inv.receiverId)]);
    
    return Array.from(allUserIds)
      .map(id => ({
        user: inviteMap.get(id)?.receiver || allUsersMap.get(id)!,
        originalIndex: originalOrderRef.current.get(id) ?? Infinity
      }))
      .sort((a, b) => a.originalIndex - b.originalIndex)
      .map(item => item.user);
  }, [allUsers, invites, inviteMap]);

  const filteredAllUsers = useMemo(() => {
    if (!searchQuery.trim()) {
      return allUsersWithInvites;
    }
    const query = searchQuery.trim();
    return allUsersWithInvites.filter((user) =>
      matchesSearch(query, `${user.firstName || ''} ${user.lastName || ''}`.trim())
    );
  }, [allUsersWithInvites, searchQuery]);

  const handlePlayerClick = useCallback((playerId: string) => {
    const invite = getInviteForUser(playerId);
    if (invite) {
      return;
    }
    if (confirmingPlayerId === playerId) {
      setExitingPlayerId(playerId);
      setTimeout(() => {
        setConfirmingPlayerId(null);
        setExitingPlayerId(null);
      }, 300);
      return;
    }
    setConfirmingPlayerId(playerId);
  }, [getInviteForUser, confirmingPlayerId]);

  const handleConfirmInvite = useCallback(async (playerId: string) => {
    setConfirmingPlayerId(null);
    setInvitingPlayerId(playerId);
    
    try {
      const response = await chatApi.inviteUser(groupChannelId, { receiverId: playerId });
      
      setInvites(prev => [...prev, response.data]);
      
      setAllUsers(prev => prev.filter(u => u.id !== playerId));
      
      toast.success(t('chat.inviteSent', { defaultValue: 'Invite sent successfully' }));
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to send invite:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.inviteError', { defaultValue: 'Failed to send invite' })
      );
    } finally {
      setInvitingPlayerId(null);
    }
  }, [groupChannelId, t, onUpdate]);

  const handleCancelInviteConfirm = useCallback(() => {
    if (confirmingPlayerId) {
      setExitingPlayerId(confirmingPlayerId);
      setTimeout(() => {
        setConfirmingPlayerId(null);
        setExitingPlayerId(null);
      }, 300);
    }
  }, [confirmingPlayerId]);

  return (
    <>
      <style>{buttonTransitionStyle}</style>
      <Dialog open={true} onClose={onClose} modalId="group-channel-invites-modal">
        <DialogContent>
        <DialogHeader>
          <DialogTitle>{t('chat.inviteParticipant', { defaultValue: 'Invite participant' })}</DialogTitle>
        </DialogHeader>

        <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
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

        {loadingUsers ? (
          <div className="flex items-center justify-center py-12 flex-1">
            <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
          </div>
        ) : (
          <div className="flex-1 overflow-y-auto p-4 space-y-3">
            {filteredAllUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <User size={48} className="mx-auto mb-4 opacity-50" />
                <p>{t('chat.noUsersFound', { defaultValue: 'No users found' })}</p>
              </div>
            ) : (
              filteredAllUsers.map((player) => {
                const invite = getInviteForUser(player.id);
                const isConfirming = confirmingPlayerId === player.id;
                const isInviting = invitingPlayerId === player.id;
                const isSender = invite?.senderId === user?.id;
                const canCancel = invite && ((isOwner || isAdmin) || isSender);

                return (
                  <div
                    key={player.id}
                    className={`flex items-center gap-3 p-3 rounded-lg transition-all ${
                      isConfirming
                        ? 'bg-primary-50 dark:bg-primary-900/20'
                        : invite
                        ? 'bg-gray-50 dark:bg-gray-800/50'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                    }`}
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
                      {player.verbalStatus && (
                        <p className="text-[10px] text-gray-500 dark:text-gray-400 truncate">
                          {player.verbalStatus}
                        </p>
                      )}
                      {!invite && (
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {t('games.level', { defaultValue: 'Level' })} {player.level.toFixed(1)}
                        </p>
                      )}
                      {invite && (
                        <>
                          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                            {t('chat.invitedBy', { defaultValue: 'Invited by' })} {invite.sender.firstName} {invite.sender.lastName}
                          </p>
                          <p className="text-xs text-primary-600 dark:text-primary-400">
                            {formatRelativeTime(invite.createdAt)}
                          </p>
                        </>
                      )}
                    </div>
                    <div className="flex items-center min-w-[120px] justify-end">
                      {invite ? (
                        canCancel && (
                          <button
                            onClick={() => handleCancelInvite(invite.id)}
                            className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-all duration-300 ease-in-out"
                            title={t('chat.cancelInvite', { defaultValue: 'Cancel invite' })}
                          >
                            <XCircle size={18} />
                          </button>
                        )
                      ) : isConfirming ? (
                        <div 
                          className={`flex items-center gap-2 ${
                            exitingPlayerId === player.id ? 'button-container-exit' : 'button-container-enter'
                          }`}
                        >
                          <button
                            onClick={() => handleConfirmInvite(player.id)}
                            disabled={isInviting}
                            className="p-2 bg-green-500 text-white rounded-lg hover:bg-green-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-110 active:scale-95"
                            aria-label="Confirm"
                          >
                            {isInviting ? (
                              <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                            ) : (
                              <Check size={18} />
                            )}
                          </button>
                          <button
                            onClick={handleCancelInviteConfirm}
                            disabled={isInviting}
                            className="p-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-in-out transform hover:scale-110 active:scale-95"
                            aria-label="Cancel"
                          >
                            <X size={18} />
                          </button>
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePlayerClick(player.id)}
                          disabled={isInviting}
                          className={`px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-all duration-300 ease-in-out text-sm font-medium transform hover:scale-105 active:scale-95 ${
                            exitingPlayerId === player.id ? 'button-container-enter' : ''
                          }`}
                        >
                          {t('chat.invite', { defaultValue: 'Invite' })}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })
            )}
          </div>
        )}
        </DialogContent>
      </Dialog>
    </>
  );
};
