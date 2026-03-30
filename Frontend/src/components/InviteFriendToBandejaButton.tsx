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
      className={`group relative inline-flex w-fit max-w-full shrink-0 items-center justify-center gap-3 overflow-hidden rounded-2xl px-5 py-3.5 text-sm font-semibold tracking-tight text-white shadow-[0_8px_30px_-4px_rgba(59,130,246,0.45)] transition duration-200 ease-out hover:shadow-[0_12px_40px_-4px_rgba(59,130,246,0.55)] hover:-translate-y-0.5 active:translate-y-0 active:scale-[0.99] disabled:pointer-events-none disabled:opacity-55 disabled:shadow-none focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-400 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-gray-950 ${className}`}
    >
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-br from-primary-500 via-primary-600 to-emerald-600 opacity-100 transition duration-200 group-hover:opacity-95"
      />
      <span
        aria-hidden
        className="absolute inset-0 bg-gradient-to-t from-black/[0.12] to-transparent dark:from-black/25"
      />
      <span
        aria-hidden
        className="absolute -left-1/4 top-0 h-full w-1/2 skew-x-12 bg-white/15 opacity-0 blur-sm transition duration-500 group-hover:opacity-100 group-hover:translate-x-[180%]"
      />
      {busy ? (
        <span className="relative h-[18px] w-[18px] shrink-0 animate-spin rounded-full border-2 border-white/35 border-t-white" />
      ) : (
        <span className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white/15 ring-1 ring-white/25 backdrop-blur-[2px] transition group-hover:bg-white/20">
          <UserPlus className="h-[18px] w-[18px] text-white drop-shadow-sm" strokeWidth={2.25} />
        </span>
      )}
      <span className="relative text-left drop-shadow-sm">{t('invites.inviteFriendToBandeja')}</span>
    </button>
  );
}
