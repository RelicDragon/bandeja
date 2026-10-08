import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Game, ParticipantStatus } from '@/types';
import { invitesApi } from '@/api/invites';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { recoverGenderUnsetJoin, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { useChatListFeedStore } from './chatListFeedStore';

export type ChatListInviteActions = {
  accept: (game: Game) => void;
  decline: (game: Game) => void;
  busyGameIds: ReadonlySet<string>;
};

const ChatListInviteActionsContext = createContext<ChatListInviteActions | null>(null);

export const ChatListInviteActionsProvider = ChatListInviteActionsContext.Provider;

export function useChatListInviteActionsContext(): ChatListInviteActions | null {
  return useContext(ChatListInviteActionsContext);
}

function myInviteId(game: Game): string | null {
  const userId = useAuthStore.getState().user?.id;
  const row = game.participants?.find((p) => p.userId === userId && p.status === 'INVITED');
  return row?.id ?? null;
}

function patchMyStatus(gameId: string, status: ParticipantStatus) {
  const userId = useAuthStore.getState().user?.id;
  useChatListFeedStore.getState().patchRowsForFilter('users', (rows) =>
    rows.map((r) =>
      r.type === 'game' && r.data.id === gameId
        ? {
            ...r,
            data: {
              ...r.data,
              participants: r.data.participants.map((p) => (p.userId === userId ? { ...p, status } : p)),
            },
          }
        : r
    )
  );
}

function removeGameRow(gameId: string) {
  useChatListFeedStore
    .getState()
    .patchRowsForFilter('users', (rows) => rows.filter((r) => !(r.type === 'game' && r.data.id === gameId)));
}

/**
 * Join / Decline straight from an invitation row. Accept runs the same name,
 * gender and overlap gates as the My tab invites; decline opens the same sheet.
 */
export function useChatListInviteActions(): { actions: ChatListInviteActions; declineInviteModal: React.ReactNode } {
  const { t } = useTranslation();
  const [busyGameIds, setBusyGameIds] = useState<ReadonlySet<string>>(new Set());
  const inFlightRef = useRef(new Set<string>());
  const gameByInviteRef = useRef(new Map<string, string>());

  const markBusy = useCallback((gameId: string, busy: boolean) => {
    setBusyGameIds((prev) => {
      const next = new Set(prev);
      if (busy) next.add(gameId);
      else next.delete(gameId);
      return next;
    });
  }, []);

  const accept = useCallback(
    async function acceptWithGates(game: Game) {
      const authUser = useAuthStore.getState().user;
      if (authUser && authUser.nameIsSet !== true) {
        runWithProfileName(() => void acceptWithGates(game));
        return;
      }
      if (!runWithGenderForEvent(game, () => void acceptWithGates(game))) return;
      const inviteId = myInviteId(game);
      if (!inviteId || inFlightRef.current.has(inviteId)) return;
      inFlightRef.current.add(inviteId);
      markBusy(game.id, true);
      try {
        const response = await runWithOverlapConfirm((confirmOverlap) => invitesApi.accept(inviteId, confirmOverlap));
        if (!response) return;
        const message = (response as { message?: string }).message || 'Invite accepted successfully';
        const queued = message === 'games.addedToJoinQueue';
        toast.success(
          queued ? t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }) : t(message, { defaultValue: message })
        );
        useHeaderStore.getState().decrementPendingInvite(inviteId);
        patchMyStatus(game.id, queued ? 'IN_QUEUE' : 'PLAYING');
      } catch (error: unknown) {
        if (recoverGenderUnsetJoin(error, () => void acceptWithGates(game))) return;
        const errorMessage =
          (error as { response?: { data?: { message?: string } } })?.response?.data?.message || 'errors.generic';
        toast.error(t(errorMessage, { defaultValue: errorMessage }));
      } finally {
        inFlightRef.current.delete(inviteId);
        markBusy(game.id, false);
      }
    },
    [markBusy, t]
  );

  const { handleDeclineInvite, declineInviteModal } = useDeclineInvite({
    onDeclineStart: (inviteId) => {
      const gameId = gameByInviteRef.current.get(inviteId);
      if (gameId) markBusy(gameId, true);
    },
    onDeclined: (inviteId) => {
      useHeaderStore.getState().decrementPendingInvite(inviteId);
      const gameId = gameByInviteRef.current.get(inviteId);
      if (gameId) removeGameRow(gameId);
    },
    onDeclineEnd: (inviteId) => {
      const gameId = gameByInviteRef.current.get(inviteId);
      if (gameId) markBusy(gameId, false);
      gameByInviteRef.current.delete(inviteId);
    },
  });

  const decline = useCallback(
    (game: Game) => {
      const inviteId = myInviteId(game);
      if (!inviteId) return;
      gameByInviteRef.current.set(inviteId, game.id);
      handleDeclineInvite(inviteId);
    },
    [handleDeclineInvite]
  );

  const actions = useMemo(
    () => ({ accept: (game: Game) => void accept(game), decline, busyGameIds }),
    [accept, decline, busyGameIds]
  );

  return { actions, declineInviteModal };
}
