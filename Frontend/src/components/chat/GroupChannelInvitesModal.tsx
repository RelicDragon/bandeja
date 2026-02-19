import { useState, useEffect, useLayoutEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Search, User } from 'lucide-react';
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
  const [activePlayerId, setActivePlayerId] = useState<string | null>(null);
  const [invitingPlayerId, setInvitingPlayerId] = useState<string | null>(null);

  const participantsIdsRef = useRef<string[]>([]);
  const activeCardRef = useRef<HTMLDivElement>(null);

  useLayoutEffect(() => {
    activeCardRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }, [activePlayerId]);
  
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

  const handleCardClick = useCallback((playerId: string) => {
    if (invitingPlayerId) return;
    const invite = getInviteForUser(playerId);
    if (invite && !(isOwner || isAdmin || invite.senderId === user?.id)) return;
    setActivePlayerId((prev) => (prev === playerId ? null : playerId));
  }, [getInviteForUser, invitingPlayerId, isOwner, isAdmin, user?.id]);

  const handleConfirmInvite = useCallback(async (playerId: string) => {
    setActivePlayerId(null);
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

  const handleCancelInviteClick = useCallback(async (inviteId: string) => {
    setActivePlayerId(null);
    await handleCancelInvite(inviteId);
  }, [handleCancelInvite]);

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
          <div className="flex-1 overflow-y-auto p-3 space-y-1">
            {filteredAllUsers.length === 0 ? (
              <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                <User size={48} className="mx-auto mb-4 opacity-50" />
                <p>{t('chat.noUsersFound', { defaultValue: 'No users found' })}</p>
              </div>
            ) : (
              filteredAllUsers.map((player, index) => {
                const invite = getInviteForUser(player.id);
                const isActive = activePlayerId === player.id;
                const isInviting = invitingPlayerId === player.id;
                const canCancel = invite && ((isOwner || isAdmin) || invite.senderId === user?.id);
                const isClickable = !invite || canCancel;
                const isLast = index === filteredAllUsers.length - 1;
                const floatingAbove = isLast;

                return (
                  <div
                    key={player.id}
                    ref={activePlayerId === player.id ? activeCardRef : undefined}
                    role={isClickable ? 'button' : undefined}
                    tabIndex={isClickable ? 0 : undefined}
                    onClick={isClickable ? () => handleCardClick(player.id) : undefined}
                    onKeyDown={isClickable ? (e) => e.key === 'Enter' && handleCardClick(player.id) : undefined}
                    className={`relative flex items-center gap-2 py-1.5 px-2 rounded-lg transition-all border-2 ${
                      isActive
                        ? invite && canCancel
                          ? 'bg-primary-50 dark:bg-primary-900/20 border-red-500 dark:border-red-400'
                          : 'bg-primary-50 dark:bg-primary-900/20 border-primary-500 dark:border-primary-400'
                        : 'border-transparent ' + (invite
                        ? 'bg-gray-50 dark:bg-gray-800/50'
                        : 'hover:bg-gray-50 dark:hover:bg-gray-800/50')
                    } ${isClickable ? 'cursor-pointer' : ''}`}
                  >
                    <PlayerAvatar
                      player={player}
                      showName={false}
                      fullHideName={true}
                      extrasmall={true}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {player.firstName} {player.lastName}
                      </p>
                      {player.verbalStatus && (
                        <p className="verbal-status text-xs">
                          {player.verbalStatus}
                        </p>
                      )}
                      {invite && (
                        <>
                          <p className="text-xs text-gray-500 dark:text-gray-400">
                            {t('chat.invitedBy', { defaultValue: 'Invited by' })} {invite.sender.firstName} {invite.sender.lastName}
                          </p>
                          <p className="text-xs text-primary-600 dark:text-primary-400">
                            {formatRelativeTime(invite.createdAt)}
                          </p>
                        </>
                      )}
                    </div>
                    {isActive && (
                      <div
                        className={`absolute right-0 z-10 button-container-enter ${
                          floatingAbove ? 'bottom-full -mb-3' : 'top-full -mt-3'
                        }`}
                        style={{ transformOrigin: floatingAbove ? 'bottom right' : 'top right' }}
                        onClick={(e) => e.stopPropagation()}
                      >
                        {invite ? (
                          canCancel && (
                            <button
                              onClick={() => handleCancelInviteClick(invite.id)}
                              className="px-3 py-1.5 text-xs font-medium text-red-600 dark:text-red-400 bg-white dark:bg-gray-800 border border-red-200 dark:border-red-800 rounded-lg shadow-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                            >
                              {t('chat.cancelInvite', { defaultValue: 'Cancel invite' })}
                            </button>
                          )
                        ) : (
                          <button
                            onClick={() => handleConfirmInvite(player.id)}
                            disabled={isInviting}
                            className="px-3 py-1.5 text-xs font-medium bg-primary-600 text-white rounded-lg shadow-lg hover:bg-primary-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                          >
                            {isInviting ? (
                              <span className="inline-flex items-center gap-1">
                                <span className="w-3 h-3 border-2 border-white border-t-transparent rounded-full animate-spin" />
                                {t('chat.invite', { defaultValue: 'Invite' })}
                              </span>
                            ) : (
                              t('chat.invite', { defaultValue: 'Invite' })
                            )}
                          </button>
                        )}
                      </div>
                    )}
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
