import { Users as UsersIcon, UserPlus, Users2 } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Button, PlayerAvatar } from '@/components';
import { User } from '@/types';
import { EntityType } from '@/types';
import { InvitablePlayer } from '@/api/users';

interface ParticipantsSectionProps {
  participants: Array<string | null>;
  maxParticipants: number;
  invitedPlayerIds: string[];
  invitedPlayers?: InvitablePlayer[];
  user: User | null;
  entityType: EntityType;
  onMaxParticipantsChange: (num: number) => void;
  onAddUserToGame: () => void;
  onRemoveParticipant: (index: number) => void;
  onRemoveInvitedPlayer?: (playerId: string) => void;
  onOpenInviteModal: () => void;
}

export const ParticipantsSection = ({
  participants,
  maxParticipants,
  invitedPlayerIds,
  invitedPlayers = [],
  user,
  entityType,
  onMaxParticipantsChange,
  onAddUserToGame,
  onRemoveParticipant,
  onRemoveInvitedPlayer,
  onOpenInviteModal,
}: ParticipantsSectionProps) => {
  const { t } = useTranslation();

  const renderParticipants = () => {
    const result = [];
    for (let i = 0; i < participants.length; i++) {
      const participantId = participants[i];
      if (participantId && participantId === user?.id && user) {
        result.push(
          <PlayerAvatar
            key={i}
            player={{
              id: user.id,
              firstName: user.firstName,
              lastName: user.lastName,
              avatar: user.avatar || undefined,
              level: user.level,
              gender: user.gender,
            }}
            isCurrentUser={true}
            removable={true}
            onRemoveClick={() => onRemoveParticipant(i)}
            smallLayout={true}
          />
        );
      } else {
        result.push(
          <PlayerAvatar
            key={i}
            player={null}
            smallLayout={true}
          />
        );
      }
    }
    if (entityType !== 'BAR') {
      for (let i = participants.length; i < maxParticipants; i++) {
        result.push(
          <PlayerAvatar
            key={i}
            player={null}
            smallLayout={true}
          />
        );
      }
    }
    return result;
  };

  const isUserInGame = user && participants.includes(user.id);
  const canAddUser = entityType === 'BAR' || participants.length < maxParticipants;

  return (
    <div className="bg-white dark:bg-gray-900 rounded-xl border border-gray-200 dark:border-gray-800 p-4">
      <div className="flex items-center gap-2 mb-3">
        <UsersIcon size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-base font-semibold text-gray-900 dark:text-white">
          {t('createGame.participants')}
        </h2>
      </div>
      <div className="space-y-4">
        {entityType !== 'BAR' && (
          <div>
            <label className="block text-xs font-medium text-gray-600 dark:text-gray-400 mb-2">
              {t('createGame.numberOfParticipants')}
            </label>
            <div className="grid grid-cols-7 gap-2">
              {[2, 3, 4, 5, 6, 7, 8].map((num) => (
                <button
                  key={num}
                  onClick={() => onMaxParticipantsChange(num)}
                  className={`h-10 rounded-lg font-semibold text-sm transition-all ${
                    maxParticipants === num
                      ? 'bg-primary-500 text-white'
                      : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
                  }`}
                >
                  {num}
                </button>
              ))}
            </div>
          </div>
        )}
        {!isUserInGame && (
          <Button
            onClick={onAddUserToGame}
            disabled={!canAddUser}
            variant="outline"
            size="sm"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={16} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        <div className="flex flex-wrap gap-3">
          {renderParticipants()}
        </div>
        {invitedPlayers.length > 0 && (
          <div className="mt-3 p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800">
            <div className="flex items-center gap-2 text-sm font-medium text-blue-900 dark:text-blue-100 mb-2">
              <Users2 size={16} />
              <span>{t('createGame.invitesWillBeSent', { count: invitedPlayers.length })}</span>
            </div>
            <div className="flex flex-wrap gap-2">
              {invitedPlayers.map((player) => (
                <PlayerAvatar
                  key={player.id}
                  player={{
                    id: player.id,
                    firstName: player.firstName,
                    lastName: player.lastName,
                    avatar: player.avatar,
                    level: player.level,
                    gender: player.gender,
                  }}
                  showName={false}
                  smallLayout={true}
                  removable={true}
                  onRemoveClick={onRemoveInvitedPlayer ? () => onRemoveInvitedPlayer(player.id) : undefined}
                />
              ))}
            </div>
          </div>
        )}
        <Button
          onClick={onOpenInviteModal}
          variant="outline"
          size="sm"
          className="w-full flex items-center justify-center"
        >
          <Users2 size={16} className="mr-2" />
          {invitedPlayerIds.length > 0 
            ? t('createGame.manageInvites', { count: invitedPlayerIds.length })
            : t('games.invitePlayers')
          }
        </Button>
      </div>
    </div>
  );
};

