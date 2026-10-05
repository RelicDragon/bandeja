import { useCallback, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import type { Invite } from '@/types';
import { useAuthStore } from '@/store/authStore';
import { useHeaderStore } from '@/store/headerStore';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { recoverGenderUnsetJoin, runWithGenderForEvent } from '@/utils/genderJoinGate';
import { runWithOverlapConfirm } from '@/utils/gameSlotOverlapConfirm';
import { useDeclineInvite } from '@/hooks/useDeclineInvite';

/**
 * Accept / decline handlers for {@link InvitesSection} on a home surface (My
 * tab, novice Welcome page). Accept runs the name / gender / overlap gates.
 */
export function useHomeInviteActions(
  invites: Invite[],
  refetchMyGames: (showLoader?: boolean, force?: boolean) => unknown,
) {
  const { t } = useTranslation();
  const [decliningInviteIds, setDecliningInviteIds] = useState<Set<string>>(new Set());
  const acceptingInviteIdsRef = useRef<Set<string>>(new Set());
  // Read through a ref so the handler identity does not change with the invite
  // list — it is passed down to every invite row.
  const invitesRef = useRef(invites);
  invitesRef.current = invites;

  const handleAcceptInvite = useCallback(async function acceptWithGates(inviteId: string) {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => void acceptWithGates(inviteId));
      return;
    }
    const inviteGame = invitesRef.current.find((inv) => inv.id === inviteId)?.game;
    if (!runWithGenderForEvent(inviteGame, () => void acceptWithGates(inviteId))) return;
    // Guard against a rapid double-tap firing two POSTs (the second would 404
    // because the invite is no longer in the INVITED state, surfacing a spurious error toast).
    if (acceptingInviteIdsRef.current.has(inviteId)) return;
    acceptingInviteIdsRef.current.add(inviteId);
    try {
      const { invitesApi } = await import('@/api');
      const response = await runWithOverlapConfirm((confirmOverlap) =>
        invitesApi.accept(inviteId, confirmOverlap),
      );
      if (!response) return;
      const message = (response as { message?: string }).message || 'Invite accepted successfully';

      if (message === 'games.addedToJoinQueue') {
        toast.success(t('games.addedToJoinQueue', { defaultValue: 'Added to join queue' }));
      } else {
        toast.success(t(message, { defaultValue: message }));
      }

      const { decrementPendingInvite } = useHeaderStore.getState();
      decrementPendingInvite(inviteId);
      void refetchMyGames(false, true);
    } catch (error: any) {
      if (recoverGenderUnsetJoin(error, () => void acceptWithGates(inviteId))) return;
      const errorMessage = error.response?.data?.message || 'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      acceptingInviteIdsRef.current.delete(inviteId);
    }
  }, [refetchMyGames, t]);

  const { handleDeclineInvite, declineInviteModal } = useDeclineInvite({
    onDeclineStart: (inviteId) => {
      setDecliningInviteIds((prev) => new Set(prev).add(inviteId));
    },
    onDeclined: async (inviteId) => {
      await new Promise((resolve) => setTimeout(resolve, 50));
      useHeaderStore.getState().decrementPendingInvite(inviteId);
    },
    onDeclineEnd: (inviteId) => {
      setDecliningInviteIds((prev) => {
        const next = new Set(prev);
        next.delete(inviteId);
        return next;
      });
    },
  });

  return { handleAcceptInvite, handleDeclineInvite, declineInviteModal, decliningInviteIds };
}
