import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { X, ChevronDown, ChevronRight } from 'lucide-react';
import { Invite } from '@/types';
import { PlayerAvatar } from './PlayerAvatar';

interface InvitesListProps {
  invites: Invite[];
  onCancelInvite?: (inviteId: string) => void;
  canCancel?: boolean;
}

export const InvitesList = ({ invites, onCancelInvite, canCancel }: InvitesListProps) => {
  const { t } = useTranslation();
  const [isExpanded, setIsExpanded] = useState(false);

  if (invites.length === 0) {
    return null;
  }

  return (
    <div className="space-y-2">
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="flex items-center gap-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:text-gray-900 dark:hover:text-white transition-colors"
      >
        {isExpanded ? (
          <ChevronDown size={16} />
        ) : (
          <ChevronRight size={16} />
        )}
        {t('invites.pendingInvites')} ({invites.length})
      </button>
      
      {isExpanded && (
        <div className="space-y-2">
          {invites.map((invite) => {
            return (
              <div
                key={invite.id}
                className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
              >
                <div className="flex-shrink-0">
                  <PlayerAvatar 
                    player={invite.receiver || null}
                    showName={false}
                    smallLayout={true}
                  />
                </div>

                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {invite.receiver?.firstName} {invite.receiver?.lastName}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('invites.inviteSent')}
                  </p>
                </div>

                {canCancel && onCancelInvite && (
                  <button
                    onClick={() => onCancelInvite(invite.id)}
                    className="p-1.5 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-700 transition-colors"
                  >
                    <X size={16} className="text-gray-500 dark:text-gray-400" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

