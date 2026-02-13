import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { Crown, Shield, User, UserX, ArrowRightLeft, Dumbbell, ChevronDown, ChevronUp } from 'lucide-react';
import { Button, PlayerAvatar } from '@/components';
import { Game, GameParticipant } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/Dialog';

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
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const selectedItemRef = useRef<HTMLDivElement | null>(null);
  const [isOpen, setIsOpen] = useState(true);

  const handleClose = () => {
    setIsOpen(false);
    setTimeout(() => {
      onClose();
    }, 300);
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

  const currentUserParticipant = game.participants.find(p => p.userId === user?.id);
  const isOwner = currentUserParticipant?.role === 'OWNER';
  const isAdmin = currentUserParticipant?.role === 'ADMIN';

  const participants = game.participants
    .filter((p) => p.userId !== user?.id)
    .slice()
    .sort((a, b) => {
      const nameA = `${a.user?.firstName ?? ''} ${a.user?.lastName ?? ''}`.trim().toLowerCase();
      const nameB = `${b.user?.firstName ?? ''} ${b.user?.lastName ?? ''}`.trim().toLowerCase();
      return nameA.localeCompare(nameB);
    });

  const getRoleTag = (participant: GameParticipant) => {
    if (game.entityType === 'TRAINING' && game.trainerId === participant.userId) {
      return { text: t('playerCard.isTrainer'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    }
    switch (participant.role) {
      case 'OWNER':
        return { text: t('games.owner'), color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' };
      case 'ADMIN':
        return { text: t('games.admin'), color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' };
      case 'PARTICIPANT':
      case 'GUEST':
      default:
        return { text: t('games.participant'), color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' };
    }
  };

  const getStatusTag = (participant: GameParticipant) => {
    switch (participant.status) {
      case 'INVITED':
        return { text: t('games.statusInvited'), color: 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-400' };
      case 'IN_QUEUE':
        return { text: t('games.statusInQueue'), color: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400' };
      case 'PLAYING':
        return { text: t('games.statusPlaying'), color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' };
      case 'NON_PLAYING':
        return { text: t('games.statusNonPlaying'), color: 'bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400' };
      case 'GUEST':
        return { text: t('games.statusGuest'), color: 'bg-slate-100 text-slate-700 dark:bg-slate-600/30 dark:text-slate-300' };
      default:
        return { text: t('games.statusPlaying'), color: 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-400' };
    }
  };

  const hasTrainer = game.entityType === 'TRAINING' && (!!game.trainerId || game.participants.some((p) => p.role === 'ADMIN' && p.status === 'INVITED'));

  const getAvailableActions = (participant: GameParticipant) => {
    const actions = [];
    const isParticipantRole = participant.role === 'PARTICIPANT' || participant.role === 'GUEST';

    if (isOwner) {
      if (game.entityType === 'TRAINING' && game.trainerId === participant.userId) {
        actions.push({ id: 'remove-trainer', label: t('games.removeTrainer', { defaultValue: 'Remove as trainer' }), icon: Dumbbell });
        actions.push({ id: 'kick-admin', label: t('games.kickUser'), icon: UserX });
      } else if (participant.role === 'ADMIN') {
        actions.push({ id: 'revoke-admin', label: t('games.revokeAdmin'), icon: Shield });
        actions.push({ id: 'kick-admin', label: t('games.kickUser'), icon: UserX });
      } else if (isParticipantRole) {
        if (game.entityType === 'TRAINING' && !hasTrainer) {
          actions.push({ id: 'set-trainer', label: t('games.setAsTrainer', { defaultValue: 'Set as trainer' }), icon: Dumbbell });
        } else {
          actions.push({ id: 'promote-admin', label: t('games.promoteToAdmin'), icon: Crown });
        }
        actions.push({ id: 'kick-user', label: t('games.kickUser'), icon: UserX });
      }
      if (participant.role !== 'OWNER') {
        actions.push({ id: 'transfer-ownership', label: t('games.transferOwnership'), icon: ArrowRightLeft });
      }
    } else if (isAdmin) {
      if (isParticipantRole) {
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

  return (
    <Dialog open={isOpen} onClose={handleClose} modalId="manage-users-modal">
      <DialogContent>
        <DialogHeader className="flex-col items-stretch">
          <DialogTitle>{t('games.managePlayers')}</DialogTitle>
          <DialogDescription className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            {t('games.managePlayersHint')}
          </DialogDescription>
        </DialogHeader>

        <div ref={scrollContainerRef} className="p-4 space-y-3 max-h-[60vh] overflow-y-auto">
          {participants.map((participant) => {
            const roleTag = getRoleTag(participant);
            const statusTag = getStatusTag(participant);
            const isSelected = selectedUserId === participant.userId;
            const actions = getAvailableActions(participant);

            return (
              <div 
                key={participant.userId} 
                ref={isSelected ? (el) => { selectedItemRef.current = el; } : null}
                className={`transition-all duration-300 ${
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
                    player={participant.user}
                    showName={false}
                    extrasmall
                    fullHideName
                    role={participant.role as 'OWNER' | 'ADMIN' | 'PLAYER'}
                  />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {participant.user.firstName} {participant.user.lastName}
                    </p>
                    <div className="flex flex-wrap gap-1 mt-1">
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${roleTag.color}`}>
                        {roleTag.text}
                      </span>
                      <span className={`inline-block px-1.5 py-0.5 text-[10px] font-medium rounded ${statusTag.color}`}>
                        {statusTag.text}
                      </span>
                    </div>
                  </div>
                  <div className="flex-shrink-0 text-gray-400 dark:text-gray-500">
                    {isSelected && actions.length > 0 ? (
                      <ChevronUp size={20} aria-hidden />
                    ) : (
                      <ChevronDown size={20} aria-hidden />
                    )}
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
      </DialogContent>
    </Dialog>
  );
};
