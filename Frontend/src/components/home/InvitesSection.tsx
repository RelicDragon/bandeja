import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { Button, Card, PlayerAvatar } from '@/components';
import { Invite } from '@/types';
import { formatDate } from '@/utils/dateFormat';
import { Calendar, MapPin, Check, X } from 'lucide-react';
import { useNavigationStore } from '@/store/navigationStore';

interface InvitesSectionProps {
  invites: Invite[];
  onAccept: (inviteId: string) => void;
  onDecline: (inviteId: string) => void;
}

export const InvitesSection = ({ invites, onAccept, onDecline }: InvitesSectionProps) => {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { bounceNotifications, setBounceNotifications } = useNavigationStore();

  if (invites.length === 0) return null;

  const handleAnimationEnd = () => {
    if (bounceNotifications) {
      setBounceNotifications(false);
    }
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
          const entityName = invite.game?.name ||
            (invite.game ? t(`games.gameTypes.${invite.game.gameType}`) : '');

          const gameId = invite.gameId;

          return (
            <Card
              key={invite.id}
              className={`p-4 cursor-pointer hover:shadow-lg transition-shadow ${bounceNotifications ? 'animate-[pulse_0.4s_ease-in-out_3] bg-primary-50 dark:bg-primary-900/20 border-primary-200 dark:border-primary-700' : ''}`}
              onClick={() => gameId && navigate(`/games/${gameId}`)}
            >
              <div className="flex items-start gap-3">
                <div className="flex-shrink-0">
                  <PlayerAvatar 
                    player={invite.sender}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                    <span className="font-medium text-gray-900 dark:text-white">
                      {invite.sender?.firstName} {invite.sender?.lastName}
                    </span>{' '}
                    {t('invites.invitedYou')}
                  </p>
                  
                  <h3 className="text-base font-semibold text-gray-900 dark:text-white mb-2">
                    {entityName}
                  </h3>

                  {invite.game && (
                    <div className="space-y-1 text-sm text-gray-600 dark:text-gray-400 mb-3">
                      <div className="flex items-center gap-2">
                        <Calendar size={14} />
                        <span>{formatDate(invite.game.startTime, 'PPp')}</span>
                      </div>
                      {(invite.game.court?.club || invite.game.club) && (
                        <div className="flex items-center gap-2">
                          <MapPin size={14} />
                          <span>{invite.game.court?.club?.name || invite.game.club?.name}</span>
                        </div>
                      )}
                    </div>
                  )}

                  {invite.message && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 italic mb-3">
                      "{invite.message}"
                    </p>
                  )}

                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      onClick={() => onAccept(invite.id)}
                      variant="primary"
                      size="sm"
                      className="flex-1 flex items-center justify-center gap-1.5"
                    >
                      <Check size={16} />
                      {t('invites.accept')}
                    </Button>
                    <Button
                      onClick={() => onDecline(invite.id)}
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

