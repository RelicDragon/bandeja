import { useId, type ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { AnimatePresence, motion } from 'framer-motion';
import { ArrowLeft, ArrowRight } from 'lucide-react';
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion';
import { pressScaleGuard } from '@/components/motion/pressScale';
import { OnboardingProgressBar } from './OnboardingProgressBar';
import type { OnboardingStep } from './onboardingSteps';

/** PRD 350: "Steps slide horizontally (260 ms, 24 px offset + fade)". */
const SLIDE_DURATION_S = 0.26;
const SLIDE_OFFSET_PX = 24;

/**
 * Everything a step needs from the flow around it. Each step renders its own
 * {@link OnboardingFrame} so it owns its primary label and enablement rule.
 */
export interface OnboardingStepChrome {
  /** 1-based position among the steps this account sees. */
  position: number;
  total: number;
  direction: 1 | -1;
  /** Absent on the first step. */
  onBack?: () => void;
  /** Absent where the PRD forbids skipping (Welcome, Sport). */
  onSkip?: () => void;
  /** Move on. The flow persists the step and picks the next visible one. */
  onAdvance: () => void;
}

export interface OnboardingFrameProps {
  step: OnboardingStep;
  /** 1-based position of `step` among the steps this account sees. */
  position: number;
  total: number;
  /** +1 = forward, -1 = back. Flipped for RTL inside the frame. */
  direction: 1 | -1;
  /** One accent per step: the sport's colour on step 2, sky elsewhere. */
  accentColor?: string;
  title: string;
  subtitle?: string;
  /** Omit to hide the Skip action — Welcome and Sport are not skippable. */
  onSkip?: () => void;
  onBack?: () => void;
  /**
   * Omit both `primaryLabel` and `onPrimary` when the step body supplies its
   * own controls (the level questionnaire does), so the footer never shows two
   * competing primaries.
   */
  primaryLabel?: string;
  primaryDisabled?: boolean;
  primaryBusy?: boolean;
  onPrimary?: () => void;
  /** Rendered under the primary button (secondary text actions). */
  footerExtra?: ReactNode;
  children: ReactNode;
}

/**
 * PRD 350 — the single frame every onboarding step lives in.
 *
 * Thin progress bar on top, Skip top-right where allowed, one `h1`, one
 * interaction, and a single primary button pinned above the keyboard inset
 * (`var(--overlay-bottom-inset)`, CONTRACT §7.3). Each step is its own landmark
 * labelled by the `h1`.
 *
 * Motion: 260 ms / 24 px horizontal slide + fade, direction-aware and mirrored
 * in RTL. Every path is gated on `usePrefersReducedMotion()`.
 */
export function OnboardingFrame({
  step,
  position,
  total,
  direction,
  accentColor,
  title,
  subtitle,
  onSkip,
  onBack,
  primaryLabel,
  primaryDisabled = false,
  primaryBusy = false,
  onPrimary,
  footerExtra,
  children,
}: OnboardingFrameProps) {
  const { t, i18n } = useTranslation();
  const reducedMotion = usePrefersReducedMotion();
  const headingId = useId();

  const hasPrimary = Boolean(onPrimary && primaryLabel);
  const hasFooter = hasPrimary || Boolean(footerExtra);
  const isRtl = i18n.dir() === 'rtl';
  // The slide must follow reading order: forward moves content in from the
  // trailing edge, which is the left in RTL.
  const axis = isRtl ? -1 : 1;
  const offset = reducedMotion ? 0 : SLIDE_OFFSET_PX * direction * axis;
  const BackIcon = isRtl ? ArrowRight : ArrowLeft;

  return (
    <div className="flex min-h-[100dvh] flex-col bg-gray-50 dark:bg-gray-900">
      <div
        data-overlay-chrome=""
        className="sticky top-0 z-10 shrink-0 bg-gray-50/95 pt-[env(safe-area-inset-top)] backdrop-blur dark:bg-gray-900/95"
      >
        <OnboardingProgressBar position={position} total={total} accentColor={accentColor} />
        <div className="flex min-h-[44px] items-center justify-between px-2">
          {onBack ? (
            <button
              type="button"
              onClick={onBack}
              aria-label={t('onboarding.frame.back')}
              className="inline-flex h-11 w-11 items-center justify-center rounded-full text-gray-500 transition-colors hover:bg-gray-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              <BackIcon className="h-5 w-5" aria-hidden />
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
          {onSkip ? (
            <button
              type="button"
              onClick={onSkip}
              data-testid="onboarding-skip"
              className="inline-flex h-11 min-w-11 items-center justify-center rounded-full px-3 text-sm font-semibold text-gray-500 transition-colors hover:bg-gray-200/70 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 dark:text-gray-400 dark:hover:bg-gray-800"
            >
              {t('onboarding.frame.skip')}
            </button>
          ) : (
            <span className="h-11 w-11" aria-hidden />
          )}
        </div>
      </div>

      {/* `initial` is left on: each step mounts its own frame, so the slide the
          user sees is the *enter* animation of the incoming step. */}
      <AnimatePresence mode="wait">
        <motion.section
          key={step}
          aria-labelledby={headingId}
          data-testid={`onboarding-step-${step}`}
          initial={{ opacity: 0, x: offset }}
          animate={{ opacity: 1, x: 0 }}
          exit={{ opacity: 0, x: -offset }}
          transition={{ duration: reducedMotion ? 0 : SLIDE_DURATION_S, ease: [0.32, 0.72, 0, 1] }}
          className="overlay-keyboard-body flex min-h-0 flex-1 flex-col overflow-y-auto px-5 pb-6 pt-2"
        >
          <header className="mb-5 shrink-0">
            <h1
              id={headingId}
              className="text-balance text-2xl font-bold leading-tight tracking-tight text-gray-900 dark:text-white sm:text-3xl"
            >
              {title}
            </h1>
            {subtitle ? (
              <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-gray-400">
                {subtitle}
              </p>
            ) : null}
          </header>
          <div className="min-h-0 flex-1">{children}</div>
        </motion.section>
      </AnimatePresence>

      <div
        data-overlay-chrome=""
        hidden={!hasFooter}
        className="sticky bottom-0 shrink-0 border-t border-gray-200/70 bg-gray-50/95 px-5 pt-3 backdrop-blur dark:border-gray-700/70 dark:bg-gray-900/95"
        style={{
          paddingBottom:
            'calc(0.75rem + max(env(safe-area-inset-bottom, 0px), var(--overlay-bottom-inset, 0px)))',
        }}
      >
        {onPrimary && primaryLabel ? (
          <button
            type="button"
            onClick={onPrimary}
            disabled={primaryDisabled || primaryBusy}
            data-testid="onboarding-primary"
            className={`inline-flex min-h-[3rem] w-full items-center justify-center rounded-2xl bg-primary-600 px-5 text-base font-semibold text-white shadow-sm transition-all duration-150 hover:bg-primary-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2 enabled:active:scale-[0.98] disabled:cursor-not-allowed disabled:opacity-50 dark:focus-visible:ring-offset-gray-900 ${pressScaleGuard}`}
            style={accentColor ? { backgroundColor: accentColor } : undefined}
          >
            {primaryBusy ? t('onboarding.frame.working') : primaryLabel}
          </button>
        ) : null}
        {footerExtra ? (
          <div className={`flex justify-center ${onPrimary && primaryLabel ? 'mt-2' : ''}`}>
            {footerExtra}
          </div>
        ) : null}
      </div>
    </div>
  );
}
