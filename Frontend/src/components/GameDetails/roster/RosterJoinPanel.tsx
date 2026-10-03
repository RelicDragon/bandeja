import { useTranslation } from 'react-i18next';
import { CheckCircle, UserPlus, XCircle } from 'lucide-react';
import { Button } from '@/components/Button';
import { SportQuestionnaireInviteNudge } from '@/components/sportQuestionnaire';
import { canMutateGameRoster } from '@shared/gameMutationLock';
import { parseGameSport } from '@/utils/gameSport';
import { genderI18nContext } from '@/utils/i18nGender';
import { useAuthStore } from '@/store/authStore';
import type { Game, Invite } from '@/types';

/**
 * Everything that gets the viewer *into* the roster: a pending invite, the
 * chat-participant hint, Join / Join the queue, the in-queue box, Add me.
 * Same rules as before the roster merge — only the container changed.
 */
export function RosterJoinPanel({
  game,
  myInvites,
  userId,
  isGuest,
  isFull,
  isOwner,
  isInJoinQueue,
  isUserPlaying,
  onJoin,
  onAddToGame,
  onAcceptInvite,
  onDeclineInvite,
  onCancelJoinQueue,
}: {
  game: Game;
  myInvites: Invite[];
  userId: string | undefined;
  isGuest: boolean;
  isFull: boolean;
  isOwner: boolean;
  isInJoinQueue: boolean;
  isUserPlaying: boolean;
  onJoin: () => void;
  onAddToGame: () => void;
  onAcceptInvite: (inviteId: string) => void;
  onDeclineInvite: (inviteId: string) => void;
  onCancelJoinQueue?: () => void;
}) {
  const { t } = useTranslation();
  const currentUser = useAuthStore((state) => state.user);
  const genderCtx = genderI18nContext(currentUser?.gender);
  if (!userId) return null;

  const isNonPlaying = game.participants.find((p) => p.userId === userId)?.status === 'NON_PLAYING';
  const hasUnoccupiedSlots = game.entityType === 'BAR' || !isFull;
  const canJoinOrInvite = canMutateGameRoster(game);
  const canDirectJoin = game.allowDirectJoin && hasUnoccupiedSlots;
  const mayJoin =
    !isNonPlaying && !isUserPlaying && !isInJoinQueue && myInvites.length === 0 && canJoinOrInvite;

  const nodes = [
    myInvites.length > 0 ? (
      <div
        key="invites"
        className="rounded-xl border border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50/70 p-4 shadow-sm shadow-blue-500/5 dark:border-blue-800 dark:from-blue-900/25 dark:to-indigo-900/20"
      >
        {myInvites.map((invite) => (
          <div key={invite.id} className="space-y-3">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {t('invites.from')}:{' '}
              <span className="font-medium text-gray-900 dark:text-white">
                {invite.sender.firstName} {invite.sender.lastName}
              </span>
            </p>
            {invite.message ? (
              <p className="text-sm italic text-gray-600 dark:text-gray-400">"{invite.message}"</p>
            ) : null}
            {game.sport ? <SportQuestionnaireInviteNudge gameSport={parseGameSport(game.sport)} /> : null}
            <div className="flex gap-2">
              <Button
                size="sm"
                onClick={() => onAcceptInvite(invite.id)}
                className="flex flex-1 items-center justify-center gap-1.5"
              >
                <CheckCircle size={16} />
                {t('invites.accept')}
              </Button>
              <Button
                size="sm"
                variant="secondary"
                onClick={() => onDeclineInvite(invite.id)}
                className="flex flex-1 items-center justify-center gap-1.5"
              >
                <XCircle size={16} />
                {t('invites.decline')}
              </Button>
            </div>
          </div>
        ))}
      </div>
    ) : null,
    isGuest && canJoinOrInvite ? (
      <div
        key="guest"
        className="rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50/70 p-4 shadow-sm shadow-yellow-500/5 dark:border-yellow-800 dark:from-yellow-900/25 dark:to-amber-900/20"
      >
        <p className="text-sm text-gray-700 dark:text-gray-300">
          {canDirectJoin
            ? t('games.chatParticipantHintJoinGame', {
                context: genderCtx,
                defaultValue: 'You are a chat participant. Join the game below.',
              })
            : t('games.chatParticipantHintJoinQueue', {
                context: genderCtx,
                defaultValue: 'You are a chat participant. Join the queue below.',
              })}
        </p>
      </div>
    ) : null,
    !isUserPlaying && myInvites.length === 0 && canJoinOrInvite && game.sport ? (
      <SportQuestionnaireInviteNudge key="questionnaire" gameSport={parseGameSport(game.sport)} />
    ) : null,
    mayJoin ? (
      <Button key="join" onClick={onJoin} size="lg" className="flex w-full items-center justify-center">
        <UserPlus size={20} className="me-2" />
        {canDirectJoin ? t('createGame.addMeToGame') : t('games.joinTheQueue')}
      </Button>
    ) : null,
    isInJoinQueue ? (
      <div
        key="in-queue"
        className="rounded-xl border border-yellow-200 bg-gradient-to-br from-yellow-50 to-amber-50/70 p-4 shadow-sm shadow-yellow-500/5 dark:border-yellow-800 dark:from-yellow-900/25 dark:to-amber-900/20"
      >
        <p className="mb-3 text-sm text-gray-700 dark:text-gray-300">
          {isOwner
            ? t('games.inQueueOwnerHint', {
                context: genderCtx,
                defaultValue: 'You are the owner. To play in your game, accept yourself from the join queue list below.',
              })
            : t('games.inQueue', {
                context: genderCtx,
                defaultValue: 'You are in the waiting list. Waiting for approval...',
              })}
        </p>
        {onCancelJoinQueue ? (
          <Button
            variant="danger"
            size="sm"
            onClick={onCancelJoinQueue}
            className="flex w-full items-center justify-center gap-1.5"
          >
            <XCircle size={16} />
            {t('games.cancelJoinRequest', { defaultValue: 'Cancel request' })}
          </Button>
        ) : null}
      </div>
    ) : null,
    (isInJoinQueue && canDirectJoin) ||
    (!isNonPlaying && isOwner && !isUserPlaying && hasUnoccupiedSlots && !isInJoinQueue) ? (
      <Button key="add-me" onClick={onAddToGame} size="lg" className="flex w-full items-center justify-center">
        <UserPlus size={20} className="me-2" />
        {t('createGame.addMeToGame')}
      </Button>
    ) : null,
    isNonPlaying && canJoinOrInvite ? (
      <Button key="play" onClick={onAddToGame} size="lg" className="flex w-full items-center justify-center">
        <UserPlus size={20} className="me-2" />
        {hasUnoccupiedSlots
          ? t('games.playInGame', { defaultValue: 'Play in a game' })
          : t('games.joinQueue', { defaultValue: 'Join queue' })}
      </Button>
    ) : null,
  ].filter(Boolean);

  if (nodes.length === 0) return null;
  return <div className="mt-3 space-y-2">{nodes}</div>;
}
