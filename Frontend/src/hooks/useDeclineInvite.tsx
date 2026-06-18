import { useState, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { invitesApi } from '@/api/invites';
import { DeclineInviteModal } from '@/components/DeclineInviteModal';
import { runWithProfileName } from '@/utils/runWithProfileName';
import { useAuthStore } from '@/store/authStore';

export type UseDeclineInviteOptions = {
  onDeclined?: (inviteId: string) => void | Promise<void>;
  onDeclineStart?: (inviteId: string) => void;
  onDeclineEnd?: (inviteId: string) => void;
  onDeclineError?: (inviteId: string) => void;
};

export function useDeclineInvite(options: UseDeclineInviteOptions = {}) {
  const { t } = useTranslation();
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const [declineInviteId, setDeclineInviteId] = useState<string | null>(null);
  const [isDecliningInvite, setIsDecliningInvite] = useState(false);
  const declineInviteIdRef = useRef<string | null>(null);
  declineInviteIdRef.current = declineInviteId;

  const openDeclineInviteRef = useRef<(inviteId: string) => void>(() => {});
  const closeDeclineInvite = useCallback(() => setDeclineInviteId(null), []);

  const handleDeclineInvite = useCallback((inviteId: string) => {
    const authUser = useAuthStore.getState().user;
    if (authUser && authUser.nameIsSet !== true) {
      runWithProfileName(() => openDeclineInviteRef.current(inviteId));
      return;
    }
    setDeclineInviteId(inviteId);
  }, []);

  openDeclineInviteRef.current = (inviteId: string) => {
    setDeclineInviteId(inviteId);
  };

  const confirmDeclineInvite = useCallback(async (message?: string) => {
    const inviteId = declineInviteIdRef.current;
    if (!inviteId) return;
    optionsRef.current.onDeclineStart?.(inviteId);
    setDeclineInviteId(null);
    setIsDecliningInvite(true);
    try {
      await invitesApi.decline(
        inviteId,
        message !== undefined ? { message } : undefined,
      );
      await optionsRef.current.onDeclined?.(inviteId);
    } catch (error: unknown) {
      optionsRef.current.onDeclineError?.(inviteId);
      const errorMessage =
        (error as { response?: { data?: { message?: string } } })?.response?.data?.message ||
        'errors.generic';
      toast.error(t(errorMessage, { defaultValue: errorMessage }));
    } finally {
      setIsDecliningInvite(false);
      optionsRef.current.onDeclineEnd?.(inviteId);
    }
  }, [t]);

  const declineInviteModal =
    typeof document === 'undefined'
      ? null
      : createPortal(
          <DeclineInviteModal
            isOpen={declineInviteId !== null}
            onClose={closeDeclineInvite}
            onDecline={confirmDeclineInvite}
            isLoading={isDecliningInvite}
          />,
          document.body,
        );

  return { handleDeclineInvite, declineInviteModal, isDecliningInvite };
}
