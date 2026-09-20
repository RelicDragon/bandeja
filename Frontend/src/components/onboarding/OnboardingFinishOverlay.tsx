import { useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { useAuthStore } from '@/store/authStore';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { getSportMascotPreviewUrl } from '@/config/appIcons';
import { resolveActivePrimarySport } from '@/utils/profileSports';
import { usesPremiumTheme } from '@/utils/mainTheme';

/** PRD 350: "a brief full-screen 'You're set' with the mascot doing a 600 ms bounce". */
export const FINISH_BOUNCE_MS = 600;

export interface OnboardingFinishOverlayProps {
  /** Fires once the bounce is done (immediately under reduced motion). */
  onDone: () => void;
}

/**
 * The closing screen. Premium members see the gold tiger variant — and only
 * here, which is the one place the PRD allows it.
 */
export function OnboardingFinishOverlay({ onDone }: OnboardingFinishOverlayProps) {
  const { t } = useTranslation();
  const user = useAuthStore((state) => state.user);
  const reducedMotion = usePrefersReducedMotion();

  const mascot = usesPremiumTheme(user)
    ? '/premium/bandeja-gold-crest.webp'
    : getSportMascotPreviewUrl(resolveActivePrimarySport(user));

  useEffect(() => {
    const delay = reducedMotion ? 0 : FINISH_BOUNCE_MS;
    const timer = window.setTimeout(onDone, delay);
    return () => window.clearTimeout(timer);
  }, [onDone, reducedMotion]);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="onboarding-finish"
      className="flex min-h-[100dvh] flex-col items-center justify-center gap-6 bg-gray-50 px-6 dark:bg-gray-900"
    >
      <div className="relative flex h-40 w-40 items-center justify-center">
        <div
          aria-hidden
          className="absolute inset-0 rounded-full bg-[radial-gradient(circle_at_50%_45%,rgb(56_189_248/0.35),rgb(56_189_248/0)_70%)] dark:bg-[radial-gradient(circle_at_50%_45%,rgb(56_189_248/0.18),rgb(56_189_248/0)_70%)]"
        />
        <motion.img
          src={mascot}
          alt=""
          aria-hidden
          className="relative h-28 w-28 object-contain"
          initial={false}
          animate={reducedMotion ? { y: 0 } : { y: [0, -18, 0, -7, 0] }}
          transition={
            reducedMotion
              ? { duration: 0 }
              : { duration: FINISH_BOUNCE_MS / 1000, ease: [0.32, 0.72, 0, 1] }
          }
        />
      </div>
      <p className="text-center text-2xl font-bold tracking-tight text-gray-900 dark:text-white">
        {t('onboarding.finish.doneTitle')}
      </p>
    </div>
  );
}
