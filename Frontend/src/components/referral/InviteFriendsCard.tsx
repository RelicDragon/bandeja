import { useCallback, useState } from 'react';
import { useTranslation } from 'react-i18next';
import toast from 'react-hot-toast';
import { Check, Share2, UserPlus } from 'lucide-react';
import { Card } from '@/components/Card';
import { Button } from '@/components/Button';
import { shimmerBlock } from '@/components/motion/shimmerBlock';
import { ReferrerAvatar } from '@/components/referral/ReferrerAvatar';
import { ReferralInvitesList } from '@/components/referral/ReferralInvitesList';
import { useReferralSummary, useShareReferral } from '@/features/referral/useReferral';
import { copyTextToClipboard } from '@/features/referral/shareReferral';
import { spellReferralCode } from '@/features/referral/referralCode';
import { useAuthStore } from '@/store/authStore';

export interface InviteFriendsCardProps {
  className?: string;
}

/**
 * PRD 351 — the "Invite friends" card on Profile → General.
 *
 * Share is the primary action and uses the native sheet on mobile; the code
 * pill is the secondary path for reading a code out loud or pasting it
 * somewhere the sheet cannot reach. At the cap the card says so but **keeps the
 * share button**: an invite is still worth something socially even when it no
 * longer pays.
 */
export const InviteFriendsCard = ({ className = '' }: InviteFriendsCardProps) => {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const { data, isLoading, isError } = useReferralSummary();
  const { share, busy } = useShareReferral();
  const [copied, setCopied] = useState(false);

  const handleShare = useCallback(async () => {
    if (!data) return;
    await share(data.link, t('referral.shareMessage', { url: data.link }));
  }, [data, share, t]);

  const handleCopyCode = useCallback(async () => {
    if (!data) return;
    const ok = await copyTextToClipboard(data.displayCode);
    if (!ok) {
      toast.error(t('referral.copyFailed'));
      return;
    }
    setCopied(true);
    toast.success(t('referral.copied'));
    window.setTimeout(() => setCopied(false), 1500);
  }, [data, t]);

  if (isLoading) {
    return (
      <Card className={`p-4 ${className}`}>
        <div className={`${shimmerBlock} h-5 w-2/3`} />
        <div className={`${shimmerBlock} mt-2 h-4 w-1/2`} />
        <div className={`${shimmerBlock} mt-4 h-11 w-full`} />
      </Card>
    );
  }

  // A referral failure must never take the Profile tab down with it.
  if (isError || !data) return null;

  return (
    <div className={className}>
      <Card className="p-4">
        <div className="flex items-start gap-3">
          <span className="relative flex shrink-0 items-center" aria-hidden style={{ width: 62, height: 44 }}>
            <ReferrerAvatar
              firstName={user?.firstName ?? null}
              avatar={user?.avatar ?? null}
              size={44}
              className="absolute top-0 shadow-sm"
            />
            <span
              className="absolute top-0 flex h-11 w-11 items-center justify-center rounded-full border-2 border-dashed border-primary-300 bg-white/70 text-primary-500 dark:border-primary-700 dark:bg-gray-900/70 dark:text-primary-400"
              style={{ insetInlineStart: 18 }}
            >
              <UserPlus size={18} strokeWidth={2.25} />
            </span>
          </span>

          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {t('referral.cardHeadline', { count: data.referrerReward })}
            </h3>
            <p className="mt-0.5 text-sm text-gray-600 dark:text-gray-300">
              {t('referral.cardSubline', { count: data.referredReward })}
            </p>
          </div>
        </div>

        {data.capReached && (
          <p
            className="mt-3 rounded-lg bg-amber-50 p-2.5 text-xs text-amber-800 dark:bg-amber-950/40 dark:text-amber-200"
            role="status"
          >
            {t('referral.capReached', { count: data.cap })}
          </p>
        )}

        <div className="mt-4 flex flex-col gap-2 sm:flex-row sm:items-center">
          <Button
            type="button"
            onClick={handleShare}
            disabled={busy}
            className="min-h-[44px] w-full sm:w-auto sm:flex-1"
          >
            <Share2 size={18} aria-hidden />
            {t('referral.shareInvite')}
          </Button>

          <button
            type="button"
            onClick={handleCopyCode}
            aria-label={t('referral.copyCodeAria', { code: spellReferralCode(data.code) })}
            className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-lg border border-gray-200 bg-gray-50 px-4 font-mono text-sm font-semibold tracking-[0.18em] text-gray-800 transition-colors hover:bg-gray-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:border-gray-700 dark:bg-gray-800/60 dark:text-gray-100 dark:hover:bg-gray-800"
          >
            <span aria-hidden>{data.displayCode}</span>
            {copied ? (
              <Check size={16} className="text-green-600 dark:text-green-400" aria-hidden />
            ) : null}
          </button>
        </div>
      </Card>

      <ReferralInvitesList invites={data.invites} className="mt-3" />
    </div>
  );
};
