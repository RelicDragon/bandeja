import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Crown, Shield, User, UserX, ArrowRightLeft, Search, UserPlus } from 'lucide-react';
import { Button, PlayerAvatar } from '@/components';
import { JoinGroupChannelButton } from '@/components/JoinGroupChannelButton';
import { GroupChannel, GroupChannelParticipant } from '@/api/chat';
import { chatApi } from '@/api/chat';
import { mediaApi } from '@/api/media';
import { useAuthStore } from '@/store/authStore';
import { matchesSearch } from '@/utils/transliteration';
import { GroupChannelInvitesModal } from '@/components/chat/GroupChannelInvitesModal';
import { ChannelContextPanel } from '@/components/chat/panels';

interface GroupChannelSettingsProps {
  groupChannel: GroupChannel;
  onUpdate?: () => void;
  onParticipantsCountChange?: (count: number) => void;
}

export const GroupChannelSettings = ({
  groupChannel,
  onUpdate,
  onParticipantsCountChange
}: GroupChannelSettingsProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [participants, setParticipants] = useState<GroupChannelParticipant[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const [groupChannelData, setGroupChannelData] = useState<GroupChannel>(groupChannel);
  const [name, setName] = useState(groupChannel.name);
  const [isSavingName, setIsSavingName] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [showInvitesModal, setShowInvitesModal] = useState(false);
  const [isJoining, setIsJoining] = useState(false);

  const canEditBug = user?.isAdmin || false;
  const onParticipantsCountChangeRef = useRef(onParticipantsCountChange);
  onParticipantsCountChangeRef.current = onParticipantsCountChange;

  const currentUserParticipant = useMemo(
    () => participants.find(p => p.userId === user?.id),
    [participants, user?.id]
  );
  const isOwner = useMemo(() => currentUserParticipant?.role === 'OWNER', [currentUserParticipant]);
  const isAdmin = useMemo(() => currentUserParticipant?.role === 'ADMIN', [currentUserParticipant]);
  const canEdit = isOwner || isAdmin;
  const isParticipant = useMemo(() => !!currentUserParticipant || groupChannelData.isParticipant, [currentUserParticipant, groupChannelData.isParticipant]);


  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const [participantsData, groupChannelData] = await Promise.all([
        chatApi.getGroupChannelParticipants(groupChannel.id),
        chatApi.getGroupChannelById(groupChannel.id)
      ]);
      const participantsList = participantsData.data || [];
      setParticipants(participantsList);
      setGroupChannelData(groupChannelData.data);
      onParticipantsCountChangeRef.current?.(groupChannelData.data.participantsCount || 0);
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
    setGroupChannelData(groupChannel);
    setName(groupChannel.name);
  }, [groupChannel]);

  const handleSaveName = async () => {
    const trimmedName = name.trim();
    
    if (!trimmedName) {
      setNameError(t('chat.nameRequired', { defaultValue: 'Name is required' }));
      return;
    }

    if (trimmedName.length > 100) {
      setNameError(t('chat.nameTooLong', { defaultValue: 'Name must be 100 characters or less' }));
      return;
    }

    if (trimmedName === groupChannelData.name) {
      return;
    }

    setIsSavingName(true);
    setNameError(null);
    try {
      const response = await chatApi.updateGroupChannel(groupChannel.id, { name: trimmedName });
      setGroupChannelData(response.data);
      toast.success(t('chat.nameUpdated', { defaultValue: 'Name updated successfully' }));
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to update name:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.updateNameError', { defaultValue: 'Failed to update name' })
      );
    } finally {
      setIsSavingName(false);
    }
  };

  const handleAvatarUpload = async (avatarFile: File, originalFile: File) => {
    try {
      await mediaApi.uploadGroupChannelAvatar(groupChannel.id, avatarFile, originalFile);
      const response = await chatApi.getGroupChannelById(groupChannel.id);
      setGroupChannelData(response.data);
      toast.success(t('chat.avatarUpdated', { defaultValue: 'Avatar updated successfully' }));
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to upload avatar:', error);
      const errorMessage = error.response?.data?.message || t('chat.uploadAvatarError', { defaultValue: 'Failed to upload avatar' });
      toast.error(errorMessage);
      throw error;
    }
  };

  const handleAvatarRemove = async () => {
    try {
      await chatApi.updateGroupChannel(groupChannel.id, { avatar: undefined, originalAvatar: undefined });
      const response = await chatApi.getGroupChannelById(groupChannel.id);
      setGroupChannelData(response.data);
      toast.success(t('chat.avatarRemoved', { defaultValue: 'Avatar removed successfully' }));
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to remove avatar:', error);
      const errorMessage = error.response?.data?.message || t('chat.removeAvatarError', { defaultValue: 'Failed to remove avatar' });
      toast.error(errorMessage);
      throw error;
    }
  };

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

  const handleInvitesModalUpdate = useCallback(async () => {
    await loadData();
    onUpdate?.();
  }, [loadData, onUpdate]);

  const handleJoin = useCallback(async () => {
    setIsJoining(true);
    try {
      await chatApi.joinGroupChannel(groupChannel.id);
      toast.success(t('chat.joinedSuccessfully', { defaultValue: 'Successfully joined the group/channel' }));
      await loadData();
      onUpdate?.();
    } catch (error: any) {
      console.error('Failed to join group/channel:', error);
      toast.error(
        error?.response?.data?.message || 
        t('chat.joinFailed', { defaultValue: 'Failed to join group/channel' })
      );
    } finally {
      setIsJoining(false);
    }
  }, [groupChannel.id, t, loadData, onUpdate]);

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) {
      return participants;
    }
    const query = searchQuery.trim();
    return participants.filter((p) =>
      matchesSearch(query, `${p.user.firstName || ''} ${p.user.lastName || ''}`.trim())
    );
  }, [participants, searchQuery]);

  return (
    <div className="h-full overflow-y-auto bg-[#eefbfc] dark:bg-gray-900" ref={scrollContainerRef}>
      <div className="max-w-2xl mx-auto px-4 py-6 space-y-6">
          <ChannelContextPanel
            groupChannel={groupChannelData}
            name={name}
            setName={setName}
            canEdit={canEdit}
            isSavingName={isSavingName}
            nameError={nameError}
            setNameError={setNameError}
            onSaveName={handleSaveName}
            onAvatarUpload={(file: File) => handleAvatarUpload(file, file)}
            onAvatarRemove={handleAvatarRemove}
            canEditBug={canEditBug}
            onUpdate={onUpdate}
          />

          {canEdit && (
            <Button
              onClick={() => setShowInvitesModal(true)}
              variant="primary"
              size="lg"
              className="w-full flex items-center justify-center gap-2"
            >
              <UserPlus size={20} />
              {t('chat.inviteParticipant', { defaultValue: 'Invite participant' })}
            </Button>
          )}

          {!isParticipant && (
            <JoinGroupChannelButton
              groupChannel={groupChannelData}
              onJoin={handleJoin}
              isLoading={isJoining}
            />
          )}

          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-sm">
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" size={18} />
                <input
                  type="text"
                  placeholder={t('chat.searchParticipants', { defaultValue: 'Search participants...' })}
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-primary-500"
                />
              </div>
            </div>

            {loading ? (
              <div className="flex items-center justify-center py-12">
                <div className="w-8 h-8 border-4 border-primary-500 border-t-transparent rounded-full animate-spin" />
              </div>
            ) : (
              <div className="px-4 py-2">
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
                            extrasmall={true}
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
                            {participant.user.verbalStatus && (
                              <p className="verbal-status">
                                {participant.user.verbalStatus}
                              </p>
                            )}
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
              </div>
            )}
          </div>
        </div>

      {showInvitesModal && (
        <GroupChannelInvitesModal
          groupChannelId={groupChannel.id}
          participants={participants}
          isOwner={isOwner}
          isAdmin={isAdmin}
          onClose={() => setShowInvitesModal(false)}
          onUpdate={handleInvitesModalUpdate}
        />
      )}
    </div>
  );
};
