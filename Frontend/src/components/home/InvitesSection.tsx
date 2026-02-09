import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, PlayerAvatar, GameCard } from '@/components';
import { Invite } from '@/types';
import { Check, X } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';
import { useAuthStore } from '@/store/authStore';

interface InvitesSectionProps {
  invites: Invite[];
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
  onNoteSaved?: (gameId: string) => void;
}

export const InvitesSection = ({ invites, onAccept, onDecline, onNoteSaved }: InvitesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { bounceNotifications, setBounceNotifications, currentPage } = useNavigationStore();
  const user = useAuthStore((state) => state.user);
  const [hidingInvites, setHidingInvites] = useState<Set<string>>(new Set());

  if (invites.length === 0) return null;

  const handleAnimationEnd = () => {
    if (bounceNotifications) {
      setBounceNotifications(false);
    }
  };

  const handleHideAnimationEnd = (inviteId: string) => {
    setHidingInvites(prev => {
      const newSet = new Set(prev);
      newSet.delete(inviteId);
      return newSet;
    });
  };

  const handleAccept = (inviteId: string) => {
    setHidingInvites(prev => new Set(prev).add(inviteId));
    // Delay the actual accept call to allow animation to start
    setTimeout(() => onAccept(inviteId), 50);
  };

  const handleDecline = (inviteId: string) => {
    setHidingInvites(prev => new Set(prev).add(inviteId));
    // Delay the actual decline call to allow animation to start
    setTimeout(() => onDecline(inviteId), 50);
  };

  return (
    <div className="mb-6">
      <h2 
        className={`text-xl font-semibold text-gray-900 dark:text-white mb-4 ${bounceNotifications ? 'animate-[pulse_0.4s_ease-in-out_3] text-primary-600 dark:text-primary-400' : ''}`}
        onAnimationEnd={handleAnimationEnd}
      >
        {t('invites.title')} ({invites.length})
      </h2>
      <div className="space-y-3">
        {invites.map((invite) => {
          const gameId = invite.gameId;

          return (
            <Card
              key={invite.id}
              className={`p-4 cursor-pointer hover:shadow-lg transition-all duration-300 ${bounceNotifications ? 'animate-[pulse_0.4s_ease-in-out_3] bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700' : ''} ${hidingInvites.has(invite.id) ? 'animate-[fadeOutUp_0.3s_ease-out_forwards] opacity-0 transform -translate-y-4' : 'opacity-100'}`}
              onClick={() => gameId && navigate(`/games/${gameId}`, { state: { fromPage: currentPage } })}
              onAnimationEnd={() => hidingInvites.has(invite.id) && handleHideAnimationEnd(invite.id)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <PlayerAvatar 
                    player={invite.sender}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    {t('invites.invitedYou')}
                  </p>                  

                  {invite.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-3">
                      "{invite.message}"
                    </p>
                  )}

                  {invite.game && (
                    <div className="mb-3">
                      <GameCard
                        game={invite.game}
                        user={user}
                        showChatIndicator={false}
                        onNoteSaved={onNoteSaved}
                      />
                    </div>
                  )}

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      onClick={() => handleAccept(invite.id)}
                      variant="primary"
                      size="sm"
                      className="flex-1 flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} />
                      {t('invites.accept')}
                    </Button>
                    <Button
                      onClick={() => handleDecline(invite.id)}
                      variant="secondary"
                      size="sm"
                      className="flex-1 flex items-center justify-center gap-1.5"
                    >
                      <X size={16} />
                      {t('invites.decline')}
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
};

