import { useTranslation } from 'react-i18next';
import { motion } from 'framer-motion';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';

export interface OnboardingProgressBarProps {
  /** 1-based position. */
  position: number;
  total: number;
  /** Defaults to the sky primary; step 2 passes the sport's colour. */
  accentColor?: string;
}

/**
 * PRD 350 — the thin progress bar that springs between steps.
 *
 * Announced as "Step 3 of 6": the bar is the only place the flow exposes its
 * length, so it carries `role="progressbar"` with a text value rather than a
 * bare percentage.
 */
export function OnboardingProgressBar({
  position,
  total,
  accentColor,
}: OnboardingProgressBarProps) {
  const { t } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const safeTotal = Math.max(1, total);
  const safePosition = Math.min(Math.max(1, position), safeTotal);
  const fill = safePosition / safeTotal;
  const label = t('onboarding.frame.progress', { current: safePosition, total: safeTotal });

  return (
    <div
      role="progressbar"
      aria-valuemin={1}
      aria-valuemax={safeTotal}
      aria-valuenow={safePosition}
      aria-valuetext={label}
      aria-label={label}
      className="h-1 w-full overflow-hidden bg-gray-200 dark:bg-gray-700"
    >
      <motion.div
        className="h-full w-full origin-[left_center] rounded-e-full bg-primary-500 rtl:origin-[right_center]"
        style={accentColor ? { backgroundColor: accentColor } : undefined}
        initial={false}
        animate={{ scaleX: fill }}
        transition={
          reducedMotion
            ? { duration: 0 }
            : { type: 'spring', stiffness: 260, damping: 24 }
        }
      />
    </div>
  );
}
