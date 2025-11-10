import { Card, Button, PlayerAvatar, InvitesList } from '@/components';
import { Game, Invite, JoinQueue } from '@/types';
import { Users, UserPlus, Sliders, CheckCircle, XCircle, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';

interface GameParticipantsProps {
  game: Game;
  myInvites: Invite[];
  gameInvites: Invite[];
  joinQueues?: JoinQueue[];
  isParticipant: boolean;
  isGuest: boolean;
  isFull: boolean;
  isOwner: boolean;
  userId?: string;
  isInJoinQueue?: boolean;
  canInvitePlayers: boolean;
  canManageJoinQueue: boolean;
  canViewSettings: boolean;
  onJoin: () => void;
  onAddToGame: () => void;
  onLeave: () => void;
  onAcceptInvite: (inviteId: string) => void;
  onDeclineInvite: (inviteId: string) => void;
  onCancelInvite: (inviteId: string) => void;
  onAcceptJoinQueue: (userId: string) => void;
  onDeclineJoinQueue: (userId: string) => void;
  onShowPlayerList: () => void;
  onShowManageUsers: () => void;
}

export const GameParticipants = ({
  game,
  myInvites,
  gameInvites,
  joinQueues = [],
  isParticipant,
  isGuest,
  isFull,
  isOwner,
  userId,
  isInJoinQueue = false,
  canInvitePlayers,
  canManageJoinQueue,
  canViewSettings,
  onJoin,
  onAddToGame,
  onLeave,
  onAcceptInvite,
  onDeclineInvite,
  onCancelInvite,
  onAcceptJoinQueue,
  onDeclineJoinQueue,
  onShowPlayerList,
  onShowManageUsers,
}: GameParticipantsProps) => {
  const { t } = useTranslation();

  const playingOwnersAndAdmins = game.participants.filter(
    p => p.isPlaying && (p.role === 'OWNER' || p.role === 'ADMIN')
  );
  const shouldShowCrowns = playingOwnersAndAdmins.length > 1;
  
  const playingCount = game.participants.filter(p => p.isPlaying).length;
  const hasUnoccupiedSlots = game.entityType === 'BAR' || playingCount < game.maxParticipants;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {game.minLevel !== undefined && game.maxLevel !== undefined && game.entityType !== 'BAR' ? `${t('games.level')} ${game.minLevel.toFixed(1)}-${game.maxLevel.toFixed(1)}` : t('games.participants')}
        </h2>
        <span className="ml-auto text-gray-600 dark:text-gray-400">
          {game.entityType === 'BAR' 
            ? game.participants.filter(p => p.isPlaying).length
            : `${game.participants.filter(p => p.isPlaying).length} / ${game.maxParticipants}`
          }
        </span>
      </div>
      <div className="space-y-4">
        {myInvites.length > 0 && (
          <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
            {myInvites.map((invite) => (
              <div key={invite.id} className="space-y-3">
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {t('invites.from')}:{' '}
                  <span className="font-medium text-gray-900 dark:text-white">
                    {invite.sender.firstName} {invite.sender.lastName}
                  </span>
                </p>
                {invite.message && (
                  <p className="text-sm text-gray-600 dark:text-gray-400 italic">
                    "{invite.message}"
                  </p>
                )}
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    onClick={() => onAcceptInvite(invite.id)}
                    className="flex-1 flex items-center justify-center gap-1.5"
                  >
                    <CheckCircle size={16} />
                    {t('invites.accept')}
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => onDeclineInvite(invite.id)}
                    className="flex-1 flex items-center justify-center gap-1.5"
                  >
                    <XCircle size={16} />
                    {t('invites.decline')}
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
        {!isParticipant && hasUnoccupiedSlots && game.isPublic && myInvites.length === 0 && !isInJoinQueue && (
          <Button
            onClick={onJoin}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        {isInJoinQueue && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {t('games.inQueue', { defaultValue: 'You are in the waiting list. Waiting for approval...' })}
            </p>
          </div>
        )}
        {isGuest && hasUnoccupiedSlots && (
          <Button
            onClick={onAddToGame}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        <div className="overflow-x-auto overflow-y-hidden -mx-4 px-4">
          <div className="flex gap-3 min-w-max pt-1 pb-1">
            {game.participants.filter(p => p.isPlaying).map((participant) => (
              <PlayerAvatar
                key={participant.userId}
                player={{
                  id: participant.userId,
                  firstName: participant.user.firstName,
                  lastName: participant.user.lastName,
                  avatar: participant.user.avatar,
                  level: participant.user.level,
                  gender: participant.user.gender,
                }}
                isCurrentUser={participant.userId === userId}
                removable={participant.userId === userId && !isOwner}
                onRemoveClick={participant.userId === userId ? onLeave : undefined}
                role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
                smallLayout={true}
              />
            ))}
            {game.entityType !== 'BAR' && Array.from({ length: game.maxParticipants - game.participants.filter(p => p.isPlaying).length }).map((_, i) => (
              canInvitePlayers ? (
                <button
                  key={`empty-${i}`}
                  onClick={onShowPlayerList}
                  className="flex flex-col items-center flex-shrink-0"
                >
                  <div className="w-12 h-12 rounded-full border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 flex items-center justify-center hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors">
                    <Plus className="w-6 h-6 text-primary-600 dark:text-primary-400" />
                  </div>
                </button>
              ) : (
                <PlayerAvatar
                  key={`empty-${i}`}
                  player={null}
                  smallLayout={true}
                />
              )
            ))}
          </div>
        </div>
        {(() => {
          const showInviteButton = (isOwner || (game.anyoneCanInvite && isParticipant)) && !isFull;
          const showManageButton = isOwner && canViewSettings;
          const buttonCount = (showInviteButton ? 1 : 0) + (showManageButton ? 1 : 0);
          
          if (buttonCount === 0) return null;
          
          return (
            <div className="mt-4 flex gap-3">
              {showInviteButton && (
                <Button
                  onClick={onShowPlayerList}
                  variant="outline"
                  size="md"
                  className="flex-1 h-10 rounded-xl flex items-center justify-center"
                >
                  <UserPlus size={18} />
                  <span className={`ml-2 ${buttonCount === 2 ? 'hidden sm:inline' : 'inline'}`}>
                    {t('games.invite')}
                  </span>
                </Button>
              )}
              
              {showManageButton && (
                <Button
                  onClick={onShowManageUsers}
                  variant="outline"
                  size="md"
                  className="flex-1 h-10 rounded-xl flex items-center justify-center"
                >
                  <Sliders size={18} />
                  <span className={`ml-2 ${buttonCount === 2 ? 'hidden sm:inline' : 'inline'}`}>
                    {t('games.players')}
                  </span>
                </Button>
              )}
            </div>
          );
        })()}
        {isParticipant && gameInvites.length > 0 && (
          <div className="mt-4">
            <InvitesList
              invites={gameInvites}
              onCancelInvite={isOwner ? onCancelInvite : undefined}
              canCancel={isOwner}
            />
          </div>
        )}
        {isParticipant && joinQueues.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('games.joinQueue', { defaultValue: 'Join Queue' })}
            </h3>
            <div className="space-y-2">
              {joinQueues.map((queue) => (
                <div
                  key={queue.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-shrink-0">
                    <PlayerAvatar 
                      player={queue.user || null}
                      showName={false}
                      extrasmall={true}
                    />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                      {queue.user?.firstName} {queue.user?.lastName}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400">
                      {t('games.wantsToJoin', { defaultValue: 'Wants to join' })}
                    </p>
                  </div>
                  {canManageJoinQueue && (
                    <div className="flex gap-2">
                      <button
                        onClick={() => onAcceptJoinQueue(queue.userId)}
                        className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-colors"
                        title={t('invites.accept', { defaultValue: 'Accept' })}
                      >
                        <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
                      </button>
                      <button
                        onClick={() => onDeclineJoinQueue(queue.userId)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
                        title={t('invites.decline', { defaultValue: 'Decline' })}
                      >
                        <XCircle size={18} className="text-red-600 dark:text-red-400" />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};
