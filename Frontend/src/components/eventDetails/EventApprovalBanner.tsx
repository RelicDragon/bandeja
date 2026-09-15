import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Button, ConfirmationModal } from '@/components';
import { gamesApi } from '@/api';
import {
  EVENT_APPROVAL_STATUS,
  isEventAwaitingApproval,
} from '@shared/eventApproval';
import type { Game } from '@/types';

type EventApprovalBannerProps = {
  game: Game;
  isAdmin: boolean;
  onUpdated: (game: Game) => void;
};

export function EventApprovalBanner({ game, isAdmin, onUpdated }: EventApprovalBannerProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState<'APPROVE' | 'DECLINE' | null>(null);
  const awaiting = isEventAwaitingApproval(game);
  const declined = game.eventApprovalStatus === EVENT_APPROVAL_STATUS.DECLINED;

  if (!awaiting && !declined) return null;

  const decide = async (decision: 'APPROVE' | 'DECLINE') => {
    if (busy) return;
    setBusy(true);
    try {
      const res = await gamesApi.eventApproval(game.id, decision);
      onUpdated(res.data);
      toast.success(
        decision === 'APPROVE' ? t('eventDetails.approved') : t('eventDetails.declined'),
      );
      setConfirm(null);
    } catch (error: unknown) {
      const err = error as { response?: { data?: { message?: string } } };
      const message = err.response?.data?.message || 'errors.generic';
      toast.error(t(message, { defaultValue: message }));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      data-testid="event-approval-banner"
      className="mx-4 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 dark:border-amber-900/60 dark:bg-amber-950/40"
    >
      <p className="text-sm font-medium text-amber-950 dark:text-amber-100">
        {declined ? t('eventDetails.declinedBanner') : t('eventDetails.pendingBanner')}
      </p>
      {isAdmin && awaiting ? (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <Button
            type="button"
            size="sm"
            variant="primary"
            data-testid="event-approve"
            disabled={busy}
            onClick={() => setConfirm('APPROVE')}
          >
            {t('eventDetails.approve')}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="danger"
            data-testid="event-decline"
            disabled={busy}
            onClick={() => setConfirm('DECLINE')}
          >
            {t('eventDetails.decline')}
          </Button>
        </div>
      ) : null}
      <ConfirmationModal
        isOpen={confirm === 'APPROVE'}
        onClose={() => setConfirm(null)}
        title={t('eventDetails.approve')}
        message={t('eventDetails.approveConfirm')}
        confirmText={t('eventDetails.approve')}
        confirmVariant="primary"
        tone="info"
        isLoading={busy}
        closeOnConfirm={false}
        onConfirm={() => void decide('APPROVE')}
      />
      <ConfirmationModal
        isOpen={confirm === 'DECLINE'}
        onClose={() => setConfirm(null)}
        title={t('eventDetails.decline')}
        message={t('eventDetails.declineConfirm')}
        confirmText={t('eventDetails.decline')}
        confirmVariant="danger"
        isLoading={busy}
        closeOnConfirm={false}
        onConfirm={() => void decide('DECLINE')}
      />
    </div>
  );
}
