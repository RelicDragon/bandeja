import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { CheckCircle, XCircle } from 'lucide-react';
import { InvitesList } from '@/components/InvitesList';
import { PlayerAvatar } from '@/components/PlayerAvatar';
import type { Game, Invite } from '@/types';
import { ROW_SURFACE } from './rosterTones';

/**
 * Pending invites and the join queue — people around the roster, not in it.
 * `#game-join-queue` is the anchor "Next steps" scrolls to.
 */
export function RosterWaitingList({
  game,
  gameInvites,
  userId,
  isOwner,
  canManageJoinQueue,
  onCancelInvite,
  onAcceptJoinQueue,
  onDeclineJoinQueue,
}: {
  game: Game;
  gameInvites: Invite[];
  userId: string | undefined;
  isOwner: boolean;
  canManageJoinQueue: boolean;
  onCancelInvite: (inviteId: string) => void;
  onAcceptJoinQueue: (userId: string) => void;
  onDeclineJoinQueue: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const queue = useMemo(
    () =>
      game.participants
        .filter((p) => p.status === 'IN_QUEUE')
        .sort((a, b) => new Date(a.joinedAt).getTime() - new Date(b.joinedAt).getTime()),
    [game.participants],
  );
  if (!userId) return null;

  return (
    <>
      {gameInvites.length > 0 ? (
        <div className="mt-4">
          <InvitesList invites={gameInvites} onCancelInvite={onCancelInvite} canCancel={isOwner} userId={userId} />
        </div>
      ) : null}
      {queue.length > 0 ? (
        <div className="mt-4" id="game-join-queue">
          <h3 className="mb-2 text-sm font-medium text-gray-700 dark:text-gray-300">
            {t('games.joinQueue', { defaultValue: 'Join Queue' })}
          </h3>
          <ul className="space-y-1.5">
            {queue.map((participant) => (
              <li key={participant.userId} className={ROW_SURFACE}>
                <PlayerAvatar player={participant.user} showName={false} extrasmall fullHideName />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-gray-900 dark:text-white">
                    {participant.user.firstName} {participant.user.lastName}
                  </p>
                  <p className="text-xs text-gray-600 dark:text-gray-400">
                    {t('games.wantsToJoin', { defaultValue: 'Wants to join' })}
                  </p>
                </div>
                {canManageJoinQueue ? (
                  <>
                    <button
                      type="button"
                      onClick={() => onAcceptJoinQueue(participant.userId)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-green-100 active:scale-90 dark:hover:bg-green-900/30"
                      aria-label={t('invites.accept', { defaultValue: 'Accept' })}
                    >
                      <CheckCircle size={20} className="text-green-600 dark:text-green-400" />
                    </button>
                    <button
                      type="button"
                      onClick={() => onDeclineJoinQueue(participant.userId)}
                      className="flex h-11 w-11 items-center justify-center rounded-xl transition-colors hover:bg-red-100 active:scale-90 dark:hover:bg-red-900/30"
                      aria-label={t('invites.decline', { defaultValue: 'Decline' })}
                    >
                      <XCircle size={20} className="text-red-600 dark:text-red-400" />
                    </button>
                  </>
                ) : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </>
  );
}
