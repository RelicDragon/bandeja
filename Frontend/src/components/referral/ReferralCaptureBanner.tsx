import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { useTranslation } from 'react-i18next';
import { Gift } from 'lucide-react';
import { referralApi } from '@/api/referral';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { useReferralStatus } from '@/features/referral/useReferral';
import { getCapturedReferralCode } from '@/utils/appAttribution';
import { AnimatedPresencePanel } from '@/components/motion/AnimatedPresencePanel';
import { ReferralCodeField } from '@/components/referral/ReferralCodeField';
import { ReferrerAvatar } from '@/components/referral/ReferrerAvatar';

export interface ReferralCaptureBannerProps {
  className?: string;
}

/**
 * PRD 351 — the quiet referral banner on the Register screen and on the
 * onboarding Welcome step.
 *
 * One component covers both because the four states are the same in each
 * place; only where the referrer comes from differs:
 *
 * - **signed out** (Register): the code was captured into the attribution
 *   snapshot by the landing page or the deep link, and is resolved through the
 *   unauthenticated `/public/referral/:code`.
 * - **signed in** (Welcome step): `/referrals/me/status` already knows.
 *
 * Renders `null` when there is nothing to say — no referrer, no window — so it
 * is safe to mount unconditionally.
 */
export const ReferralCaptureBanner = ({ className = '' }: ReferralCaptureBannerProps) => {
  const { t } = useTranslation();
  const isAuthenticated = useAuthStore((state) => Boolean(state.token));
  const [expanded, setExpanded] = useState(false);
  const [signupReferrer, setSignupReferrer] = useState<{
    firstName: string | null;
    avatar: string | null;
  } | null>(null);

  const status = useReferralStatus(isAuthenticated);

  const capturedCode = isAuthenticated ? null : getCapturedReferralCode();
  const capturedReferrer = useQuery({
    queryKey: queryKeys.referral.publicReferrer(capturedCode ?? ''),
    queryFn: () => referralApi.resolvePublic(capturedCode as string),
    enabled: Boolean(capturedCode),
    staleTime: 5 * 60_000,
  });

  const referrer = isAuthenticated
    ? status.data?.referrer ?? null
    : signupReferrer ??
      (capturedReferrer.data?.found
        ? { firstName: capturedReferrer.data.firstName, avatar: capturedReferrer.data.avatar }
        : null);

  const reward = status.data?.referredReward ?? null;
  const windowClosed = isAuthenticated ? Boolean(status.data?.windowClosed) : false;
  const canEnterCode = isAuthenticated ? Boolean(status.data?.canEnterCode) : true;

  if (referrer) {
    const name = referrer.firstName?.trim() || t('referral.aFriend');
    return (
      <AnimatedPresencePanel panelKey="referral-banner-known" className={className}>
        <div className="flex items-center gap-3 rounded-xl border border-primary-200/70 bg-primary-50/70 p-3 dark:border-primary-900/50 dark:bg-primary-950/30">
          <ReferrerAvatar firstName={referrer.firstName} avatar={referrer.avatar} size={36} />
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              {t('referral.invitedBy', { name })}
            </p>
            <p className="text-xs text-gray-600 dark:text-gray-300">
              {reward === null
                ? t('referral.bannerRewardGeneric')
                : t('referral.bannerReward', { count: reward })}
            </p>
          </div>
        </div>
      </AnimatedPresencePanel>
    );
  }

  if (windowClosed) {
    return (
      <p className={`text-xs text-gray-500 dark:text-gray-400 ${className}`}>
        {t('referral.windowClosedCaption')}
      </p>
    );
  }

  if (!canEnterCode) return null;

  return (
    <div className={className}>
      {expanded ? (
        <AnimatedPresencePanel panelKey="referral-banner-field">
          <ReferralCodeField
            mode={isAuthenticated ? 'account' : 'signup'}
            onAccepted={(next) => {
              if (!isAuthenticated) setSignupReferrer(next);
            }}
          />
        </AnimatedPresencePanel>
      ) : (
        <button
          type="button"
          onClick={() => setExpanded(true)}
          className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-primary-600 underline-offset-4 hover:underline dark:text-primary-400"
        >
          <Gift size={16} aria-hidden />
          {t('referral.haveACode')}
        </button>
      )}
    </div>
  );
};
