import { useState, useMemo, useEffect } from 'react';
import { Card, Button, PlayerAvatar, InvitesList } from '@/components';
import { Game, Invite, InviteStatus, JoinQueue } from '@/types';
import { UserPlus, CheckCircle, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { PlayersCarousel } from './PlayersCarousel';
import { getParticipantsViewMode, setParticipantsViewMode } from '@/utils/participantsViewStorage';
import { SportQuestionnaireInviteNudge } from '@/components/sportQuestionnaire';
import { parseGameSport } from '@/utils/gameSport';
import { ParticipantsSectionHeader } from './ParticipantsSectionHeader';
import { ParticipantsActionBar } from './ParticipantsActionBar';

interface GameParticipantsProps {
  game: Game;
  myInvites: Invite[];
  gameInvites: Invite[];
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
  const canEditParticipantsSetup =
    canViewSettings && game.entityType !== 'BAR' && !!onEditMaxParticipants;
  const playingCount = game.participants.filter((p) => p.status === 'PLAYING').length;

  return (
    <Card className="overflow-hidden p-3 sm:p-4">
      <ParticipantsSectionHeader
        game={game}
        playingCount={playingCount}
        maxCount={game.maxParticipants}
        viewMode={viewMode}
        canEditParticipantsSetup={canEditParticipantsSetup}
        onToggleViewMode={toggleViewMode}
        onEditMaxParticipants={onEditMaxParticipants}
      />
      <div className="space-y-2">
        {!isUnauthorized && myInvites.length > 0 && (
          <div className="p-4 bg-gradient-to-br from-blue-50 to-indigo-50/70 dark:from-blue-900/25 dark:to-indigo-900/20 border border-blue-200 dark:border-blue-800 rounded-xl shadow-sm shadow-blue-500/5">
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
                {game.sport && <SportQuestionnaireInviteNudge gameSport={parseGameSport(game.sport)} />}
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
        {!isUnauthorized && isGuest && game.status !== 'FINISHED' && game.status !== 'ARCHIVED' && (
          <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50/70 dark:from-yellow-900/25 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl shadow-sm shadow-yellow-500/5">
            <p className="text-sm text-gray-700 dark:text-gray-300">
              {game.allowDirectJoin && (hasUnoccupiedSlots || game.entityType === 'BAR')
                ? t('games.chatParticipantHintJoinGame', { defaultValue: 'You are a chat participant. Join the game below.' })
                : t('games.chatParticipantHintJoinQueue', { defaultValue: 'You are a chat participant. Join the queue below.' })}
            </p>
          </div>
        )}
        {!isUnauthorized &&
          !isUserPlaying &&
          myInvites.length === 0 &&
          game.status !== 'FINISHED' &&
          game.status !== 'ARCHIVED' &&
          game.sport && (
            <SportQuestionnaireInviteNudge gameSport={parseGameSport(game.sport)} />
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
          <div className="p-4 bg-gradient-to-br from-yellow-50 to-amber-50/70 dark:from-yellow-900/25 dark:to-amber-900/20 border border-yellow-200 dark:border-yellow-800 rounded-xl shadow-sm shadow-yellow-500/5">
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
          <Button onClick={onAddToGame} size="lg" className="w-full flex items-center justify-center">
            <UserPlus size={20} className="mr-2" />
            {hasUnoccupiedSlots
              ? t('games.playInGame', { defaultValue: 'Play in a game' })
              : t('games.joinQueue', { defaultValue: 'Join queue' })}
          </Button>
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

          return (
            <AnimatePresence mode="wait">
              {viewMode === 'list' ? (
              <motion.div
                key="participants-list"
                initial={{ opacity: 0, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -6 }}
                transition={{ duration: 0.2 }}
                className="space-y-3"
              >
                {isMix && (
                  <>
                    <div>
                      <h3 className="text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                        {t('games.male', { defaultValue: 'Men' })} ({carousel1Participants.length} / {maxPerGender})
                      </h3>
                      <div className="space-y-1">
                        {carousel1Participants.map((participant) => (
                          <motion.div
                            key={participant.userId}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 rounded-xl border border-transparent bg-gray-50/90 p-2.5 transition-colors hover:border-gray-200 hover:bg-gray-100 dark:bg-gray-800/70 dark:hover:border-gray-700 dark:hover:bg-gray-800"
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
                              {participant.user.verbalStatus && (
                                <p className="verbal-status">
                                  {participant.user.verbalStatus}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        ))}
                        {carousel1EmptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                          <button
                            onClick={() => onShowPlayerList('MALE')}
                            className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-800/30 hover:border-primary-500 dark:hover:border-primary-500 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
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
                        {t('games.female', { defaultValue: 'Women' })} ({carousel2Participants.length} / {maxPerGender})
                      </h3>
                      <div className="space-y-1">
                        {carousel2Participants.map((participant) => (
                          <motion.div
                            key={participant.userId}
                            layout
                            initial={{ opacity: 0, x: -8 }}
                            animate={{ opacity: 1, x: 0 }}
                            className="flex items-center gap-3 rounded-xl border border-transparent bg-gray-50/90 p-2.5 transition-colors hover:border-gray-200 hover:bg-gray-100 dark:bg-gray-800/70 dark:hover:border-gray-700 dark:hover:bg-gray-800"
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
                              {participant.user.verbalStatus && (
                                <p className="verbal-status">
                                  {participant.user.verbalStatus}
                                </p>
                              )}
                            </div>
                          </motion.div>
                        ))}
                        {carousel2EmptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                          <button
                            onClick={() => onShowPlayerList('FEMALE')}
                            className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-800/30 hover:border-primary-500 dark:hover:border-primary-500 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
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
                      <motion.div
                        key={participant.userId}
                        layout
                        initial={{ opacity: 0, x: -8 }}
                        animate={{ opacity: 1, x: 0 }}
                        className="flex items-center gap-3 rounded-xl border border-transparent bg-gray-50/90 p-2.5 transition-colors hover:border-gray-200 hover:bg-gray-100 dark:bg-gray-800/70 dark:hover:border-gray-700 dark:hover:bg-gray-800"
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
                          {participant.user.verbalStatus && (
                            <p className="verbal-status">
                              {participant.user.verbalStatus}
                            </p>
                          )}
                        </div>
                      </motion.div>
                    ))}
                    {emptySlots > 0 && !isUnauthorized && canInvitePlayers && (
                      <button
                        onClick={() => onShowPlayerList()}
                        className="w-full p-2 border-2 border-dashed border-primary-400 dark:border-primary-600 bg-primary-50 dark:bg-primary-900/20 rounded-xl hover:bg-primary-100 dark:hover:bg-primary-800/30 hover:border-primary-500 dark:hover:border-primary-500 transition-all duration-200 active:scale-[0.98] flex items-center justify-center gap-2"
                      >
                        <UserPlus size={18} className="text-primary-600 dark:text-primary-400" />
                        <span className="text-sm text-primary-600 dark:text-primary-400">
                          {t('games.invitePlayer', { defaultValue: 'Invite player' })}
                        </span>
                      </button>
                    )}
                  </div>
                )}
              </motion.div>
              ) : (
            <motion.div
              key="participants-carousel"
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ duration: 0.2 }}
              className={isMix ? 'space-y-3' : ''}
            >
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
            </motion.div>
              )}
            </AnimatePresence>
          );
        })()}
        <ParticipantsActionBar
          showInviteButton={!isUnauthorized && canInvitePlayers}
          showManageButton={!isUnauthorized && isOwner && canViewSettings}
          onInvite={() => onShowPlayerList()}
          onManage={onShowManageUsers}
        />
        {!isUnauthorized && gameInvites.length > 0 && (
          <div className="mt-4">
            <InvitesList
              invites={gameInvites}
              onCancelInvite={onCancelInvite}
              canCancel={isOwner}
              userId={userId}
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
                  className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-800 rounded-xl transition-colors duration-200 hover:bg-gray-100 dark:hover:bg-gray-700/70"
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
                        className="p-1.5 rounded-lg hover:bg-green-100 dark:hover:bg-green-900/30 transition-all duration-200 hover:scale-110 active:scale-90"
                        title={t('invites.accept', { defaultValue: 'Accept' })}
                      >
                        <CheckCircle size={18} className="text-green-600 dark:text-green-400" />
                      </button>
                      <button
                        onClick={() => onDeclineJoinQueue(queue.userId)}
                        className="p-1.5 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-all duration-200 hover:scale-110 active:scale-90"
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
