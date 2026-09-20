import { useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { UserPlus } from 'lucide-react';
import { useGameInviteLink, useShareReferral } from '@/features/referral/useReferral';
import { useAuthStore } from '@/store/authStore';

export interface InviteFriendToGameButtonProps {
  /** The game's normal share URL. `?ref=` is appended to it. */
  gameUrl: string;
  onShared?: () => void;
  className?: string;
}

/**
 * PRD 351 — "Invite a friend to this game" inside the game share sheet.
 *
 * Shares the same game link the sheet already shows, plus `?ref=CODE`, so a new
 * user lands on the game after registering and the referral is attributed to
 * whoever sent it. Renders nothing for a signed-out viewer: there is no code to
 * attach and the plain share link is already on screen.
 */
export const InviteFriendToGameButton = ({
  gameUrl,
  onShared,
  className = '',
}: InviteFriendToGameButtonProps) => {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));
  const inviteUrl = useGameInviteLink(isAuthenticated ? gameUrl : null);
  const { share, busy } = useShareReferral();

  const handleClick = useCallback(async () => {
    if (!inviteUrl) return;
    const result = await share(inviteUrl, t('referral.shareGameMessage', { url: inviteUrl }));
    if (result === 'shared' || result === 'copied') onShared?.();
  }, [inviteUrl, onShared, share, t]);

  if (!isAuthenticated || !inviteUrl) return null;

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={busy}
      className={`inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-lg border border-primary-200 bg-primary-50 px-4 text-sm font-semibold text-primary-700 transition-colors hover:bg-primary-100 disabled:opacity-60 dark:border-primary-900/60 dark:bg-primary-950/40 dark:text-primary-300 dark:hover:bg-primary-950/70 ${className}`}
    >
      <UserPlus size={18} aria-hidden />
      {t('referral.inviteFriendToGame')}
    </button>
  );
};
