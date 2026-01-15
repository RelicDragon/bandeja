import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { X, Crown, Shield, User, UserX, ArrowRightLeft, Search, UserPlus, XCircle } from 'lucide-react';
import { Button, Card, PlayerAvatar } from '@/components';
import { GroupChannel, GroupChannelParticipant, GroupChannelInvite } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { useAuthStore } from '@/store/authStore';
import { GroupChannelInviteModal } from './GroupChannelInviteModal';
import { matchesSearch } from '@/utils/transliteration';
import { formatRelativeTime } from '@/utils/dateFormat';

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
  const [showInviteModal, setShowInviteModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);

  const currentUserParticipant = participants.find(p => p.userId === user?.id);
  const isOwner = currentUserParticipant?.role === 'OWNER';
  const isAdmin = currentUserParticipant?.role === 'ADMIN';

  useEffect(() => {
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

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
    try {
      await chatApi.cancelInvite(inviteId);
      toast.success(t('chat.inviteCancelled', { defaultValue: 'Invite cancelled' }));
      await loadData();
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
    return participants.filter((p) =>
      matchesSearch(
        `${p.user.firstName} ${p.user.lastName}`,
        searchQuery
      )
    );
  }, [participants, searchQuery]);

  const filteredInvites = useMemo(() => {
    if (!searchQuery.trim()) {
      return invites;
    }
    return invites.filter((invite) =>
      matchesSearch(
        `${invite.receiver.firstName} ${invite.receiver.lastName}`,
        searchQuery
      ) ||
      matchesSearch(
        `${invite.sender.firstName} ${invite.sender.lastName}`,
        searchQuery
      )
    );
  }, [invites, searchQuery]);

  const existingParticipantIds = participants.map(p => p.userId);

  return (
    <>
      {createPortal(
        <div
          className="fixed inset-0 z-[9999] bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4"
          onClick={onClose}
          style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
          }}
        >
          <Card
            className="w-full max-w-md max-h-[80vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
                {groupChannel.isChannel 
                  ? t('chat.channelMembers', { defaultValue: 'Channel Members' })
                  : t('chat.groupMembers', { defaultValue: 'Group Members' })}
              </h2>
              <button
                onClick={onClose}
                className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
              >
                <X size={20} className="text-gray-500 dark:text-gray-400" />
              </button>
            </div>

            <div className="flex border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <button
                onClick={() => {
                  setActiveTab('participants');
                  setSearchQuery('');
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'participants'
                    ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('chat.participants', { defaultValue: 'Participants' })}
                {participants.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full">
                    {participants.length}
                  </span>
                )}
              </button>
              <button
                onClick={() => {
                  setActiveTab('invites');
                  setSearchQuery('');
                }}
                className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
                  activeTab === 'invites'
                    ? 'text-primary-600 dark:text-primary-400 border-b-2 border-primary-600 dark:border-primary-400'
                    : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                }`}
              >
                {t('chat.invites', { defaultValue: 'Invites' })}
                {invites.length > 0 && (
                  <span className="ml-2 px-2 py-0.5 text-xs bg-gray-100 dark:bg-gray-800 rounded-full">
                    {invites.length}
                  </span>
                )}
              </button>
            </div>

            <div className="p-4 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={
                    activeTab === 'participants'
                      ? t('chat.searchParticipants', { defaultValue: 'Search participants...' })
                      : t('chat.searchInvites', { defaultValue: 'Search invites...' })
                  }
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {activeTab === 'invites' && isAdmin && (
              <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700 flex-shrink-0">
                <button
                  onClick={() => setShowInviteModal(true)}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors text-sm font-medium"
                >
                  <UserPlus size={16} />
                  {t('chat.inviteUser', { defaultValue: 'Invite User' })}
                </button>
              </div>
            )}

            {loading ? (
              <div className="flex items-center justify-center py-12 flex-1">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div ref={scrollContainerRef} className="flex-1 overflow-y-auto p-4 space-y-3">
                {activeTab === 'participants' ? (
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
                                  Level {participant.user.level.toFixed(1)}
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
                ) : (
                  <>
                    {filteredInvites.length === 0 ? (
                      <div className="text-center py-8 text-gray-500 dark:text-gray-400">
                        <UserPlus size={48} className="mx-auto mb-4 opacity-50" />
                        <p>{t('chat.noInvites', { defaultValue: 'No pending invites' })}</p>
                      </div>
                    ) : (
                      filteredInvites.map((invite) => {
                        const isSender = invite.senderId === user?.id;
                        const canCancel = (isOwner || isAdmin) || isSender;

                        return (
                          <div
                            key={invite.id}
                            className="flex items-center gap-3 p-3 rounded-lg bg-gray-50 dark:bg-gray-800/50"
                          >
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <PlayerAvatar
                                player={invite.receiver}
                                showName={false}
                                smallLayout={true}
                                fullHideName={true}
                              />
                              <div className="flex-1 min-w-0">
                                <p className="font-medium text-gray-900 dark:text-white truncate">
                                  {invite.receiver.firstName} {invite.receiver.lastName}
                                </p>
                                <p className="text-xs text-gray-500 dark:text-gray-400">
                                  {t('chat.invitedBy', { defaultValue: 'Invited by' })} {invite.sender.firstName} {invite.sender.lastName}
                                </p>
                                <p className="text-xs text-gray-400 dark:text-gray-500">
                                  {formatRelativeTime(invite.createdAt)}
                                </p>
                              </div>
                            </div>
                            {canCancel && (
                              <button
                                onClick={() => handleCancelInvite(invite.id)}
                                className="p-2 text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
                                title={t('chat.cancelInvite', { defaultValue: 'Cancel invite' })}
                              >
                                <XCircle size={18} />
                              </button>
                            )}
                          </div>
                        );
                      })
                    )}
                  </>
                )}
              </div>
            )}
          </Card>
        </div>,
        document.body
      )}

      {showInviteModal && (
        <GroupChannelInviteModal
          groupChannelId={groupChannel.id}
          onClose={() => setShowInviteModal(false)}
          onInviteSent={() => {
            loadData();
            setShowInviteModal(false);
            onUpdate?.();
          }}
          existingParticipantIds={existingParticipantIds}
        />
      )}
    </>
  );
};
