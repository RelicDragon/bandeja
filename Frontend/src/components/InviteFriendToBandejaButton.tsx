import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { shareAppInviteLink } from '@/utils/shareAppInvite';

export const INVITE_FRIEND_CTA_MAX_RESULTS = 5;

interface InviteFriendToBandejaButtonProps {
  className?: string;
}

export function InviteFriendToBandejaButton({ className = '' }: InviteFriendToBandejaButtonProps) {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  const onClick = useCallback(async () => {
    if (busy) return;
    setBusy(true);
    try {
      await shareAppInviteLink(t);
    } finally {
      setBusy(false);
    }
  }, [busy, t]);

  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      className={`inline-flex w-full items-center justify-center gap-2 rounded-xl border border-primary-300 bg-white px-4 py-3 text-sm font-semibold text-primary-700 shadow-sm transition hover:bg-primary-50 active:scale-[0.98] disabled:opacity-60 dark:border-primary-600 dark:bg-gray-900 dark:text-primary-300 dark:hover:bg-primary-950/40 ${className}`}
    >
      {busy ? (
        <span className="h-4 w-4 animate-spin rounded-full border-2 border-primary-300 border-t-primary-600 dark:border-primary-700 dark:border-t-primary-400" />
      ) : (
        <UserPlus className="h-4 w-4 shrink-0" />
      )}
      {t('invites.inviteFriendToBandeja')}
    </button>
  );
}
