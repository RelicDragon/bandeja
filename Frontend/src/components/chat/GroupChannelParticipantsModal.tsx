import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Crown, Shield, User, UserX, ArrowRightLeft, Search, XCircle, Check, X } from 'lucide-react';
import { Button, PlayerAvatar } from '@/components';
import { GroupChannel, GroupChannelParticipant, GroupChannelInvite } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { usersApi } from '@/api/users';
import { useAuthStore } from '@/store/authStore';
import { matchesSearch } from '@/utils/transliteration';
import { formatRelativeTime } from '@/utils/dateFormat';
import { BaseModal } from '@/components/BaseModal';
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

interface GroupChannelParticipantsModalProps {
  groupChannel: GroupChannel;
  onClose: () => void;
  onUpdate?: () => void;
}

export const GroupChannelParticipantsModal = ({
  groupChannel,
  onClose,
  onUpdate
}: GroupChannelParticipantsModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [activeTab, setActiveTab] = useState<'participants' | 'invites'>('participants');
  const [participants, setParticipants] = useState<GroupChannelParticipant[]>([]);
  const [invites, setInvites] = useState<GroupChannelInvite[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [allUsers, setAllUsers] = useState<BasicUser[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const originalOrderRef = useRef<Map<string, number>>(new Map());
  const [confirmingPlayerId, setConfirmingPlayerId] = useState<string | null>(null);
  const [invitingPlayerId, setInvitingPlayerId] = useState<string | null>(null);
  const [exitingPlayerId, setExitingPlayerId] = useState<string | null>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  const currentUserParticipant = useMemo(
    () => participants.find(p => p.userId === user?.id),
    [participants, user?.id]
  );
  const isOwner = useMemo(() => currentUserParticipant?.role === 'OWNER', [currentUserParticipant]);
  const isAdmin = useMemo(() => currentUserParticipant?.role === 'ADMIN', [currentUserParticipant]);

  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [participantsData, invitesData] = await Promise.all([
        chatApi.getGroupChannelParticipants(groupChannel.id),
        chatApi.getGroupChannelInvites(groupChannel.id)
      ]);
      setParticipants(participantsData.data || []);
      setInvites(invitesData.data || []);
    } catch (error: any) {
      console.error('Failed to load data:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.failedToLoadData', { defaultValue: 'Failed to load data' })
      );
    } finally {
      setLoading(false);
    }
  }, [groupChannel.id, t]);

  const loadAllUsers = useCallback(async () => {
    if (activeTab !== 'invites') return;
    
    setLoadingUsers(true);
    try {
      const response = await usersApi.getInvitablePlayers();
      const allPlayers = response.data || [];
      const participantIds = new Set(participants.map(p => p.userId));
      const filtered = allPlayers.filter((player) => !participantIds.has(player.id));
      setAllUsers(filtered);
      originalOrderRef.current = new Map(filtered.map((user, index) => [user.id, index]));
    } catch (error) {
      console.error('Failed to load users:', error);
      toast.error(t('chat.failedToLoadUsers', { defaultValue: 'Failed to load users' }));
    } finally {
      setLoadingUsers(false);
    }
  }, [activeTab, participants, t]);

  useEffect(() => {
    if (activeTab === 'invites') {
      loadAllUsers();
    }
  }, [activeTab, loadAllUsers]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (selectedUserId && selectedItemRef.current && scrollContainerRef.current) {
      setTimeout(() => {
        selectedItemRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'nearest',
          inline: 'nearest',
        });
      }, 100);
    }
  }, [selectedUserId]);

  const getRoleTag = (role: string) => {
    switch (role) {
      case 'OWNER':
        return { text: t('games.owner'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
      case 'ADMIN':
        return { text: t('games.admin'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'PARTICIPANT':
        return { text: t('games.participant'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
      default:
        return { text: t('games.participant'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    }
  };

  const getAvailableActions = (participant: GroupChannelParticipant) => {
    const actions = [];
    
    if (isOwner) {
      if (participant.role === 'ADMIN') {
        actions.push({ id: 'revoke-admin', label: t('games.revokeAdmin'), icon: Shield });
        actions.push({ id: 'kick-admin', label: t('games.kickUser'), icon: UserX });
      } else if (participant.role === 'PARTICIPANT') {
        actions.push({ id: 'promote-admin', label: t('games.promoteToAdmin'), icon: Crown });
        actions.push({ id: 'kick-user', label: t('games.kickUser'), icon: UserX });
      }
      if (participant.role !== 'OWNER') {
        actions.push({ id: 'transfer-ownership', label: t('games.transferOwnership'), icon: ArrowRightLeft });
      }
    } else if (isAdmin) {
      if (participant.role === 'PARTICIPANT') {
        actions.push({ id: 'kick-user', label: t('games.kickUser'), icon: UserX });
      }
    }
    
    return actions;
  };

  const handleAction = async (action: string, userId: string) => {
    setActionLoading(action);
    try {
      switch (action) {
        case 'promote-admin':
          await chatApi.promoteToAdmin(groupChannel.id, userId);
          toast.success(t('chat.promotedToAdmin', { defaultValue: 'User promoted to admin' }));
          break;
        case 'revoke-admin':
          await chatApi.removeAdmin(groupChannel.id, userId);
          toast.success(t('chat.adminRemoved', { defaultValue: 'Admin status removed' }));
          break;
        case 'kick-user':
        case 'kick-admin':
          await chatApi.removeParticipant(groupChannel.id, userId);
          toast.success(t('chat.participantRemoved', { defaultValue: 'Participant removed' }));
          break;
        case 'transfer-ownership':
          await chatApi.transferOwnership(groupChannel.id, userId);
          toast.success(t('chat.ownershipTransferred', { defaultValue: 'Ownership transferred' }));
          break;
      }
      await loadData();
      setSelectedUserId(null);
      onUpdate?.();
    } catch (error: any) {
      console.error('Action failed:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.actionFailed', { defaultValue: 'Action failed' })
      );
    } finally {
      setActionLoading(null);
    }
  };

  const handleCancelInvite = async (inviteId: string) => {
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
  };

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) {
      return participants;
    }
    const query = searchQuery.trim();
    return participants.filter((p) =>
      matchesSearch(query, `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim())
    );
  }, [participants, searchQuery]);

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

  const handlePlayerClick = (playerId: string) => {
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
  };

  const handleConfirmInvite = async (playerId: string) => {
    setConfirmingPlayerId(null);
    setInvitingPlayerId(playerId);
    
    try {
      const response = await chatApi.inviteUser(groupChannel.id, { receiverId: playerId });
      
      setInvites(prev => [...prev, response.data]);
      
      setAllUsers(prev => prev.filter(u => u.id !== playerId));
      
      onUpdate?.();
      toast.success(t('chat.inviteSent', { defaultValue: 'Invite sent successfully' }));
    } catch (error: any) {
      console.error('Failed to send invite:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.inviteError', { defaultValue: 'Failed to send invite' })
      );
    } finally {
      setInvitingPlayerId(null);
    }
  };

  const handleCancelInviteConfirm = () => {
    if (confirmingPlayerId) {
      setExitingPlayerId(confirmingPlayerId);
      setTimeout(() => {
        setConfirmingPlayerId(null);
        setExitingPlayerId(null);
      }, 300);
    }
  };

  return (
    <>
      <style>{buttonTransitionStyle}</style>
      <BaseModal
        isOpen={true}
        onClose={onClose}
        isBasic
        modalId="group-channel-participants-modal"
        showCloseButton={true}
        closeOnBackdropClick={true}
      >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {groupChannel.isChannel 
                  ? t('chat.channelMembers', { defaultValue: 'Channel Members' })
                  : t('chat.groupMembers', { defaultValue: 'Group Members' })}
              </h2>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              {(['participants', 'invites'] as const).map((tab) => {
                const isActive = activeTab === tab;
                const count = tab === 'participants' ? participants.length : invites.length;
                const label = tab === 'participants' 
                  ? t('chat.participants', { defaultValue: 'Participants' })
                  : t('chat.invites', { defaultValue: 'Invites' });
                
                return (
                  <button
                    key={tab}
                    onClick={() => {
                      setActiveTab(tab);
                      setSearchQuery('');
                    }}
                    className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                      isActive
                        ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                        : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                    }`}
                  >
                    {label}
                    {count > 0 && (
                      <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full">
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>

            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'participants'
                      ? t('chat.searchParticipants', { defaultValue: 'Search participants...' })
                      : t('chat.searchUsers', { defaultValue: 'Search users...' })
                  }
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
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab === 'participants' && (
                  <>
                    {filteredParticipants.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <User size={48} className="mx-auto mb-4 opacity-50" />
                        <p>{t('chat.noParticipants', { defaultValue: 'No participants found' })}</p>
                      </div>
                    ) : (
                      filteredParticipants.map((participant) => {
                        const roleTag = getRoleTag(participant.role);
                        const isSelected = selectedUserId === participant.userId;
                        const actions = getAvailableActions(participant);
                        const isCurrentUser = participant.userId === user?.id;

                        return (
                          <div
                            key={participant.id}
                            ref={isSelected ? (el) => { selectedItemRef.current = el; } : null}
                            className={`transition-all duration-300 ${
                              selectedUserId && !isSelected ? 'blur-sm opacity-50' : ''
                            }`}
                          >
                            <div
                              onClick={() => !isCurrentUser && actions.length > 0 && setSelectedUserId(isSelected ? null : participant.userId)}
                              className={`flex items-center gap-3 p-3 rounded-lg transition-all duration-300 ${
                                isCurrentUser || actions.length === 0
                                  ? ''
                                  : 'cursor-pointer'
                              } ${
                                isSelected
                                  ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 shadow-lg scale-105 z-10 relative'
                                  : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                              }`}
                            >
                              <PlayerAvatar
                                player={participant.user}
                                showName={false}
                                smallLayout={true}
                                fullHideName={true}
                                role={participant.role as 'OWNER' | 'ADMIN' | 'PLAYER'}
                              />
                              <div className="flex-1 min-w-0">
                                <div className="flex items-center gap-2">
                                  <p className="font-medium text-gray-900 dark:text-white truncate">
                                    {participant.user.firstName} {participant.user.lastName}
                                    {isCurrentUser && (
                                      <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                                        ({t('chat.you', { defaultValue: 'You' })})
                                      </span>
                                    )}
                                  </p>
                                  <span className={`px-2 py-1 text-xs font-medium rounded ${roleTag.color}`}>
                                    {roleTag.text}
                                  </span>
                                </div>
                                <p className="text-sm text-gray-500 dark:text-gray-400">
                                  {t('games.level', { defaultValue: 'Level' })} {participant.user.level.toFixed(1)}
                                </p>
                              </div>
                            </div>

                            {!isCurrentUser && (
                              <div className={`overflow-hidden transition-all duration-300 ease-in-out ${
                                isSelected && actions.length > 0
                                  ? 'max-h-96 opacity-100 mt-2'
                                  : 'max-h-0 opacity-0 mt-0'
                              }`}>
                                <div className="space-y-2">
                                  {actions.map((action) => (
                                    <Button
                                      key={action.id}
                                      variant="outline"
                                      size="sm"
                                      onClick={() => handleAction(action.id, participant.userId)}
                                      disabled={actionLoading === action.id}
                                      className="w-full flex items-center justify-start gap-2 pb-3 pt-3"
                                    >
                                      <action.icon size={16} className="mr-2 flex-shrink-0" />
                                      <span className="flex-1">{action.label}</span>
                                      {actionLoading === action.id && (
                                        <div className="ml-auto w-4 h-4 border-2 border-gray-300 border-t-transparent rounded-full animate-spin flex-shrink-0" />
                                      )}
                                    </Button>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                )}
                {activeTab === 'invites' && (
                  <>
                    {loadingUsers ? (
                      <div className="flex items-center justify-center py-12">
                        <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
                      </div>
                    ) : filteredAllUsers.length === 0 ? (
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
                  </>
                )}
              </div>
            )}
        </BaseModal>
    </>
  );
};
