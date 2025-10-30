import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { X, Crown, Shield, User, UserX, ArrowRightLeft } from 'lucide-react';
import { Button, Card, PlayerAvatar } from '@/components';
import { Game, GameParticipant } from '@/types';
import { useAuthStore } from '@/store/authStore';

interface ManageUsersModalProps {
  game: Game;
  onClose: () => void;
  onUserAction: (action: string, userId: string) => Promise<void>;
}

export const ManageUsersModal = ({ game, onClose, onUserAction }: ManageUsersModalProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const [selectedUserId, setSelectedUserId] = useState<string | null>(null);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const currentUserParticipant = game.participants.find(p => p.userId === user?.id);
  const isOwner = currentUserParticipant?.role === 'OWNER';
  const isAdmin = currentUserParticipant?.role === 'ADMIN';

  const participants = game.participants.filter(p => p.userId !== user?.id);

  const getRoleTag = (role: string) => {
    switch (role) {
      case 'OWNER':
        return { text: t('games.owner'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
      case 'ADMIN':
        return { text: t('games.admin'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'PARTICIPANT':
        return { text: t('games.participant'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
      case 'GUEST':
        return { text: t('chat.guest'), color: 'bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300' };
      default:
        return { text: t('games.participant'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    }
  };

  const getAvailableActions = (participant: GameParticipant) => {
    const actions = [];
    
    if (isOwner) {
      if (participant.role === 'ADMIN') {
        actions.push({ id: 'revoke-admin', label: t('games.revokeAdmin'), icon: Shield });
        actions.push({ id: 'kick-admin', label: t('games.kickUser'), icon: UserX });
      } else if (participant.role === 'PARTICIPANT' || participant.role === 'GUEST') {
        actions.push({ id: 'promote-admin', label: t('games.promoteToAdmin'), icon: Crown });
        actions.push({ id: 'kick-user', label: t('games.kickUser'), icon: UserX });
      }
      if (participant.role !== 'OWNER') {
        actions.push({ id: 'transfer-ownership', label: t('games.transferOwnership'), icon: ArrowRightLeft });
      }
    } else if (isAdmin) {
      if (participant.role === 'PARTICIPANT' || participant.role === 'GUEST') {
        actions.push({ id: 'kick-user', label: t('games.kickUser'), icon: UserX });
      }
    }
    
    return actions;
  };

  const handleAction = async (action: string, userId: string) => {
    setActionLoading(action);
    try {
      await onUserAction(action, userId);
      setSelectedUserId(null);
    } catch (error) {
      console.error('Action failed:', error);
    } finally {
      setActionLoading(null);
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-50 bg-black bg-opacity-60 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
    >
      <Card
        className="w-full max-w-md max-h-[80vh] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {t('games.managePlayers')}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
          >
            <X size={20} className="text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        <div className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {participants.map((participant) => {
            const roleTag = getRoleTag(participant.role);
            const isSelected = selectedUserId === participant.userId;
            const actions = getAvailableActions(participant);

            return (
              <div key={participant.userId} className={`transition-all duration-300 ${
                selectedUserId && !isSelected ? 'blur-sm opacity-50' : ''
              }`}>
                <div
                  onClick={() => setSelectedUserId(isSelected ? null : participant.userId)}
                  className={`flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all duration-300 ${
                    isSelected
                      ? 'bg-primary-50 dark:bg-primary-900/20 border border-primary-200 dark:border-primary-800 shadow-lg scale-105 z-10 relative'
                      : 'hover:bg-gray-50 dark:hover:bg-gray-800/50'
                  }`}
                >
                  <PlayerAvatar
                    player={{
                      id: participant.userId,
                      firstName: participant.user.firstName,
                      lastName: participant.user.lastName,
                      avatar: participant.user.avatar,
                      level: participant.user.level,
                      gender: participant.user.gender,
                    }}
                    showName={false}
                    smallLayout={true}
                    role={participant.role as 'OWNER' | 'ADMIN' | 'PLAYER'}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {participant.user.firstName} {participant.user.lastName}
                      </p>
                      <span className={`px-2 py-1 text-xs font-medium rounded ${roleTag.color}`}>
                        {roleTag.text}
                      </span>
                    </div>
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      Level {participant.user.level?.toFixed(1) || '0.0'}
                    </p>
                  </div>
                </div>

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
              </div>
            );
          })}

          {participants.length === 0 && (
            <div className="text-center py-8 text-gray-500 dark:text-gray-400">
              <User size={48} className="mx-auto mb-4 opacity-50" />
              <p>{t('games.noOtherParticipants')}</p>
            </div>
          )}
        </div>
      </Card>
    </div>,
    document.body
  );
};
