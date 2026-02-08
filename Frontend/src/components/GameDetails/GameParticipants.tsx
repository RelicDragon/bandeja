import { useState, useMemo, useEffect } from 'react';
import { Card, Button, PlayerAvatar, InvitesList } from '@/components';
import { Game, Invite, InviteStatus, JoinQueue } from '@/types';
import { Users, UserPlus, Sliders, CheckCircle, XCircle, Edit3, LayoutGrid, List } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { PlayersCarousel } from './PlayersCarousel';
import { getParticipantsViewMode, setParticipantsViewMode } from '@/utils/participantsViewStorage';

interface GameParticipantsProps {
  game: Game;
  myInvites: Invite[];
  gameInvites: Invite[];
  isParticipant: boolean;
  isGuest: boolean;
  isFull: boolean;
  isOwner: boolean;
  userId?: string;
  isInJoinQueue?: boolean;
  isUserPlaying?: boolean;
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
  onCancelJoinQueue?: () => void;
  onShowPlayerList: (gender?: 'MALE' | 'FEMALE') => void;
  onShowManageUsers: () => void;
  onEditMaxParticipants?: () => void;
}

export const GameParticipants = ({
  game,
  myInvites,
  gameInvites,
  isParticipant,
  isGuest,
  isFull,
  isOwner,
  userId,
  isInJoinQueue = false,
  isUserPlaying = false,
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
  onCancelJoinQueue,
  onShowPlayerList,
  onShowManageUsers,
  onEditMaxParticipants,
}: GameParticipantsProps) => {
  const { t } = useTranslation();
  const [viewMode, setViewMode] = useState<'carousel' | 'list'>('carousel');
  const isUnauthorized = !userId;
  const isNonPlaying = !isUnauthorized && game.participants.find(p => p.userId === userId)?.status === 'NON_PLAYING';

  useEffect(() => {
    getParticipantsViewMode().then(setViewMode);
  }, []);

  const toggleViewMode = () => {
    const next = viewMode === 'carousel' ? 'list' : 'carousel';
    setViewMode(next);
    setParticipantsViewMode(next);
  };

  const computedJoinQueues = useMemo((): JoinQueue[] => {
    return (
      game?.participants
        ?.filter(p => p.status === 'IN_QUEUE')
        .map(p => ({
          id: (p as any).id || `${game.id}-${p.userId}`,
          userId: p.userId,
          gameId: game.id,
          status: 'PENDING' as InviteStatus,
          createdAt: p.joinedAt,
          user: p.user,
        })) || []
    ).sort((a, b) =>
      new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime()
    );
  }, [game?.participants, game?.id]);

  const playingOwnersAndAdmins = game.participants.filter(
    p => p.status === 'PLAYING' && (p.role === 'OWNER' || p.role === 'ADMIN')
  );
  const shouldShowCrowns = playingOwnersAndAdmins.length > 1;
  
  const hasUnoccupiedSlots = game.entityType === 'BAR' || !isFull;

  return (
    <Card>
      <div className="flex items-center gap-2 mb-4">
        <Users size={18} className="text-gray-500 dark:text-gray-400" />
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
          {game.minLevel !== undefined && game.maxLevel !== undefined && game.entityType !== 'BAR' ? `${t('games.level')} ${game.minLevel.toFixed(1)}-${game.maxLevel.toFixed(1)}` : t('games.participants')}
        </h2>
        <div className="ml-auto flex items-center gap-2">
          <button
            onClick={toggleViewMode}
            className="p-1.5 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
            title={viewMode === 'carousel' ? t('games.listView', { defaultValue: 'List view' }) : t('games.carouselView', { defaultValue: 'Carousel view' })}
          >
            {viewMode === 'carousel' ? (
              <List size={18} className="text-gray-600 dark:text-gray-400" />
            ) : (
              <LayoutGrid size={18} className="text-gray-600 dark:text-gray-400" />
            )}
          </button>
          {canViewSettings && game.entityType !== 'BAR' && onEditMaxParticipants ? (
            <Button
              onClick={onEditMaxParticipants}
              variant="primary"
              size="sm"
              className="flex items-center gap-2"
            >
              <Edit3 size={16} />
              {`${game.participants.filter(p => p.status === 'PLAYING').length} / ${game.maxParticipants}`}
            </Button>
          ) : (
            <span className="text-gray-600 dark:text-gray-400">
              {game.entityType === 'BAR' 
                ? game.participants.filter(p => p.status === 'PLAYING').length
                : `${game.participants.filter(p => p.status === 'PLAYING').length} / ${game.maxParticipants}`
              }
            </span>
          )}
        </div>
      </div>
      <div className="space-y-4">
        {!isUnauthorized && myInvites.length > 0 && (
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
                  {!isOwner && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => onDeclineInvite(invite.id)}
                      className="flex-1 flex items-center justify-center gap-1.5"
                    >
                      <XCircle size={16} />
                      {t('invites.decline')}
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
        {!isUnauthorized && isGuest && game.status !== 'FINISHED' && game.status !== 'ARCHIVED' && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {game.allowDirectJoin && (hasUnoccupiedSlots || game.entityType === 'BAR')
                ? t('games.chatParticipantHintJoinGame', { defaultValue: 'You are a chat participant. Join the game below.' })
                : t('games.chatParticipantHintJoinQueue', { defaultValue: 'You are a chat participant. Join the queue below.' })}
            </p>
          </div>
        )}
        {!isUnauthorized && !isNonPlaying && !isUserPlaying && !isInJoinQueue && myInvites.length === 0 && game.status !== 'FINISHED' && game.status !== 'ARCHIVED' && game.allowDirectJoin && (hasUnoccupiedSlots || game.entityType === 'BAR') && (
          <Button
            onClick={onJoin}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        {!isUnauthorized && !isNonPlaying && !isUserPlaying && !isInJoinQueue && myInvites.length === 0 && game.status !== 'FINISHED' && game.status !== 'ARCHIVED' && (!game.allowDirectJoin || (!hasUnoccupiedSlots && game.entityType !== 'BAR')) && (
          <Button
            onClick={onJoin}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('games.joinTheQueue')}
          </Button>
        )}
        {!isUnauthorized && isInJoinQueue && (
          <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
            <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
              {isOwner
                ? t('games.inQueueOwnerHint', { defaultValue: 'You are the owner. To play in your game, accept yourself from the join queue list below.' })
                : t('games.inQueue', { defaultValue: 'You are in the waiting list. Waiting for approval...' })}
            </p>
            {onCancelJoinQueue && (
              <Button
                variant="danger"
                size="sm"
                onClick={onCancelJoinQueue}
                className="w-full flex items-center justify-center gap-1.5"
              >
                <XCircle size={16} />
                {t('games.cancelJoinRequest', { defaultValue: 'Cancel request' })}
              </Button>
            )}
          </div>
        )}
        {!isUnauthorized && isInJoinQueue && game.allowDirectJoin && hasUnoccupiedSlots && (
          <Button
            onClick={onAddToGame}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        {!isUnauthorized && !isNonPlaying && isOwner && !isUserPlaying && hasUnoccupiedSlots && !isInJoinQueue && (
          <Button
            onClick={onAddToGame}
            size="lg"
            className="w-full flex items-center justify-center"
          >
            <UserPlus size={20} className="mr-2" />
            {t('createGame.addMeToGame')}
          </Button>
        )}
        {isNonPlaying && game.status !== 'FINISHED' && game.status !== 'ARCHIVED' && (
          hasUnoccupiedSlots
            ? <Button onClick={onAddToGame} size="lg" className="w-full flex items-center justify-center">
                <UserPlus size={20} className="mr-2" />
                {t('games.playInGame', { defaultValue: 'Play in a game' })}
              </Button>
            : <p className="text-sm text-center text-gray-500 dark:text-gray-400">{t('games.noSlotsAvailable', { defaultValue: 'No slots available' })}</p>
        )}
        {(() => {
          const playingParticipants = game.participants.filter(p => p.status === 'PLAYING');
          const emptySlots = game.entityType !== 'BAR'
            ? game.maxParticipants - playingParticipants.length 
            : 0;

          const isMix = game.genderTeams === 'MIX_PAIRS';
          const isMen = game.genderTeams === 'MEN';
          const isWomen = game.genderTeams === 'WOMEN';
          const showGenderIndicator = isMix || isMen || isWomen;

          const carousel1Participants = isMix 
            ? playingParticipants.filter(p => p.user.gender === 'MALE')
            : isMen 
              ? playingParticipants.filter(p => p.user.gender === 'MALE')
              : isWomen
                ? playingParticipants.filter(p => p.user.gender === 'FEMALE')
                : playingParticipants;

          const carousel2Participants = isMix 
            ? playingParticipants.filter(p => p.user.gender === 'FEMALE')
            : [];

          const maxPerGender = isMix ? Math.floor(game.maxParticipants / 2) : 0;
          const carousel1EmptySlots = isMix
            ? Math.max(0, maxPerGender - carousel1Participants.length)
            : emptySlots;
          const carousel2EmptySlots = isMix
            ? Math.max(0, maxPerGender - carousel2Participants.length)
            : 0;

          const carousel1Gender = isMix ? 'MALE' : isMen ? 'MALE' : isWomen ? 'FEMALE' : undefined;

          if (viewMode === 'list') {
            return (
              <div className="space-y-2">
                {isMix && (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('games.male', { defaultValue: 'Male' })} ({carousel1Participants.length} / {maxPerGender})
                      </h3>
                      <div className="space-y-1">
                        {carousel1Participants.map((participant) => (
                          <div
                            key={participant.userId}
                            className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                          >
                            <PlayerAvatar
                              player={participant.user}
                              isCurrentUser={participant.user.id === userId}
                              removable={!isUnauthorized && participant.user.id === userId}
                              onRemoveClick={!isUnauthorized && participant.user.id === userId ? onLeave : undefined}
                              role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
                              extrasmall={true}
                              showName={false}
                              fullHideName={true}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {participant.user.firstName} {participant.user.lastName}
                              </p>
                            </div>
                          </div>
                        ))}
                        {carousel1EmptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                          <button
                            onClick={() => onShowPlayerList('MALE')}
                            className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors flex items-center justify-center gap-2"
                          >
                            <UserPlus size={18} className="text-primary-600 dark:text-primary-400" />
                            <span className="text-sm text-primary-600 dark:text-primary-400">
                              {t('games.invitePlayer', { defaultValue: 'Invite player' })}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('games.female', { defaultValue: 'Female' })} ({carousel2Participants.length} / {maxPerGender})
                      </h3>
                      <div className="space-y-1">
                        {carousel2Participants.map((participant) => (
                          <div
                            key={participant.userId}
                            className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                          >
                            <PlayerAvatar
                              player={participant.user}
                              isCurrentUser={participant.user.id === userId}
                              removable={!isUnauthorized && participant.user.id === userId}
                              onRemoveClick={!isUnauthorized && participant.user.id === userId ? onLeave : undefined}
                              role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
                              extrasmall={true}
                              showName={false}
                              fullHideName={true}
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                                {participant.user.firstName} {participant.user.lastName}
                              </p>
                            </div>
                          </div>
                        ))}
                        {carousel2EmptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                          <button
                            onClick={() => onShowPlayerList('FEMALE')}
                            className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors flex items-center justify-center gap-2"
                          >
                            <UserPlus size={18} className="text-primary-600 dark:text-primary-400" />
                            <span className="text-sm text-primary-600 dark:text-primary-400">
                              {t('games.invitePlayer', { defaultValue: 'Invite player' })}
                            </span>
                          </button>
                        )}
                      </div>
                    </div>
                  </>
                )}
                {!isMix && (
                  <div className="space-y-1">
                    {playingParticipants.map((participant) => (
                      <div
                        key={participant.userId}
                        className="flex items-center gap-3 p-2 bg-gray-50 dark:bg-gray-800 rounded-lg"
                      >
                        <PlayerAvatar
                          player={participant.user}
                          isCurrentUser={participant.user.id === userId}
                          removable={participant.user.id === userId}
                          onRemoveClick={participant.user.id === userId ? onLeave : undefined}
                          role={shouldShowCrowns ? (participant.role as 'OWNER' | 'ADMIN' | 'PLAYER') : undefined}
                          extrasmall={true}
                          showName={false}
                          fullHideName={true}
                        />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                            {participant.user.firstName} {participant.user.lastName}
                          </p>
                        </div>
                      </div>
                    ))}
                    {emptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                      <button
                        onClick={() => onShowPlayerList()}
                        className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-lg hover:bg-primary-100 dark:hover:bg-primary-800/30 transition-colors flex items-center justify-center gap-2"
                      >
                        <UserPlus size={18} className="text-primary-600 dark:text-primary-400" />
                        <span className="text-sm text-primary-600 dark:text-primary-400">
                          {t('games.invitePlayer', { defaultValue: 'Invite player' })}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          }

          return (
            <div className={isMix ? 'space-y-4' : ''}>
              <PlayersCarousel
                participants={carousel1Participants}
                emptySlots={carousel1EmptySlots}
                showGenderIndicator={showGenderIndicator}
                gender={carousel1Gender}
                genderCount={carousel1Participants.length}
                userId={userId}
                shouldShowCrowns={shouldShowCrowns}
                canInvitePlayers={!isUnauthorized && canInvitePlayers}
                onLeave={!isUnauthorized ? onLeave : undefined}
                onShowPlayerList={!isUnauthorized ? onShowPlayerList : undefined}
              />
              {isMix && (
                <PlayersCarousel
                  participants={carousel2Participants}
                  emptySlots={carousel2EmptySlots}
                  showGenderIndicator={true}
                  gender="FEMALE"
                  genderCount={carousel2Participants.length}
                  userId={userId}
                  shouldShowCrowns={shouldShowCrowns}
                  canInvitePlayers={!isUnauthorized && canInvitePlayers}
                  onLeave={!isUnauthorized ? onLeave : undefined}
                  onShowPlayerList={!isUnauthorized ? onShowPlayerList : undefined}
                />
              )}
            </div>
          );
        })()}
        {(() => {
          const showInviteButton = !isUnauthorized && (isOwner || (game.anyoneCanInvite && isParticipant)) && !isFull;
          const showManageButton = !isUnauthorized && isOwner && canViewSettings;
          const buttonCount = (showInviteButton ? 1 : 0) + (showManageButton ? 1 : 0);
          
          if (buttonCount === 0) return null;
          
          return (
            <div className="mt-4 flex gap-3">
              {showInviteButton && (
                <Button
                  onClick={() => onShowPlayerList()}
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
        {!isUnauthorized && gameInvites.length > 0 && (
          <div className="mt-4">
            <InvitesList
              invites={gameInvites}
              onCancelInvite={isOwner ? onCancelInvite : undefined}
              canCancel={isOwner}
            />
          </div>
        )}
        {!isUnauthorized && computedJoinQueues.length > 0 && (
          <div className="mt-4">
            <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              {t('games.joinQueue', { defaultValue: 'Join Queue' })}
            </h3>
            <div className="space-y-2">
              {computedJoinQueues.map((queue) => (
                <div
                  key={queue.id}
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                >
                  <div className="flex-shrink-0">
                    <PlayerAvatar 
                      player={queue.user || null}
                      showName={false}
                      extrasmall={true}
                      fullHideName={true}
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
