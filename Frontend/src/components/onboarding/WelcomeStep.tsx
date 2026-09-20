import { useTranslation } from 'react-i18next';
import { useQuery } from '@tanstack/react-query';
import { motion } from 'framer-motion';
import { onboardingApi } from '@/api/onboarding';
import { queryKeys } from '@/queries/queryKeys';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getSportMascotPreviewUrl } from '@/config/appIcons';
import { resolveActivePrimarySport } from '@/utils/profileSports';
import { ReferralWelcomeBanner } from '@/components/referral/ReferralWelcomeBanner';
import { OnboardingFrame, type OnboardingStepChrome } from './OnboardingFrame';

/**
 * PRD 350 step 1 — Welcome.
 *
 * Mascot on a soft radial gradient, the promise, and the city's player count as
 * early social proof. The count is best-effort: no city, no stats, or a failed
 * request simply drops the line rather than blocking the step.
 */
export function WelcomeStep(chrome: OnboardingStepChrome) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const reducedMotion = usePrefersReducedMotion();

  const cityId = user?.currentCity?.id;
  const cityName = user?.currentCity?.name;

  const statsQuery = useQuery({
    queryKey: queryKeys.onboarding.cityStats(cityId ?? 'none'),
    queryFn: () => onboardingApi.getCityStats(cityId as string),
    enabled: Boolean(cityId),
    staleTime: 60 * 60 * 1000,
    retry: false,
  });

  const playerCount = statsQuery.data?.playerCount ?? 0;
  const showSocialProof = Boolean(cityName) && playerCount > 0;
  const mascot = getSportMascotPreviewUrl(resolveActivePrimarySport(user));

  return (
    <OnboardingFrame
      {...chrome}
      step="welcome"
      title={t('onboarding.welcome.title')}
      subtitle={t('onboarding.welcome.subtitle')}
      primaryLabel={t('onboarding.welcome.start')}
      onPrimary={chrome.onAdvance}
    >
      <div className="flex flex-col items-center gap-6 py-2">
        <div className="relative flex h-44 w-44 items-center justify-center">
          <div
            aria-hidden
            className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_40%,rgb(56_189_248/0.35),rgb(56_189_248/0)_70%)] dark:bg-[radial-gradient(circle_at_50%_40%,rgb(56_189_248/0.18),rgb(56_189_248/0)_70%)]"
          />
          <motion.img
            src={mascot}
            alt=""
            aria-hidden
            className="relative h-28 w-28 object-contain"
            initial={reducedMotion ? false : { scale: 0.9, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            transition={
              reducedMotion ? { duration: 0 } : { type: 'spring', stiffness: 260, damping: 24 }
            }
          />
        </div>

        {showSocialProof ? (
          <p
            data-testid="onboarding-social-proof"
            className="text-center text-sm font-medium text-gray-600 dark:text-gray-400"
          >
            {t('onboarding.welcome.socialProof', { count: playerCount, city: cityName })}
          </p>
        ) : null}

        <ReferralWelcomeBanner />
      </div>
    </OnboardingFrame>
  );
}
