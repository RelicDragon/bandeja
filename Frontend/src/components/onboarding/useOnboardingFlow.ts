import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { onboardingApi } from '@/api/onboarding';
import { useAuthStore } from '@/store/authStore';
import { useDeepLinkStore } from '@/store/deepLinkStore';
import { useOnboardingStatus, useSetOnboardingStatusCache } from '@/hooks/useOnboardingStatus';
import { emitOnboardingEvent } from './onboardingAnalytics';
import { resolvePostOnboardingPath } from './onboardingGate';
import { consumePostOnboardingPath } from './postOnboardingPath';
import {
  isSkippableStep,
  nextStep,
  previousStep,
  resolveResumeStep,
  stepPosition,
  visibleOnboardingSteps,
  type OnboardingStep,
} from './onboardingSteps';

export interface OnboardingFlow {
  step: OnboardingStep;
  visibleSteps: readonly OnboardingStep[];
  position: number;
  total: number;
  direction: 1 | -1;
  /** Sport step only — the "completed onboarding but no enabled sport" gate. */
  sportOnly: boolean;
  /** `true` while the "You're set" screen is on and the route has not changed. */
  finishing: boolean;
  advance: () => void;
  skip: (() => void) | undefined;
  back: (() => void) | undefined;
  finish: (destination: string) => void;
  onFinishAnimationDone: () => void;
}

/**
 * PRD 350 — the flow state machine behind `/welcome`.
 *
 * Owns: which steps this account sees, where a resumed session lands, the slide
 * direction, the per-step `PATCH`, the three analytics events, and the exit —
 * including handing back a deep link the gate intercepted instead of swallowing
 * it.
 *
 * Every server write is best-effort: losing a `PATCH` costs the user a resume
 * position, never the step they are standing on, so offline never blocks.
 */
export function useOnboardingFlow(): OnboardingFlow {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const user = useAuthStore((state) => state.user);
  const { status } = useOnboardingStatus();
  const setStatusCache = useSetOnboardingStatusCache();
  const pendingAuthPath = useDeepLinkStore((state) => state.pendingAuthPath);
  const setPendingAuthPath = useDeepLinkStore((state) => state.setPendingAuthPath);

  const requestedStep = searchParams.get('step');
  // `?step=sport` is the only sport-only entry point, and only for an account
  // that has already finished the flow. A brand-new user always gets all steps.
  const sportOnly = requestedStep === 'sport' && status?.needsOnboarding === false;

  const visibleSteps = useMemo(
    () => (sportOnly ? (['sport'] as OnboardingStep[]) : visibleOnboardingSteps(user)),
    [sportOnly, user],
  );

  const [step, setStep] = useState<OnboardingStep>(() =>
    sportOnly ? 'sport' : resolveResumeStep(status?.resumeStep, visibleSteps),
  );
  const [direction, setDirection] = useState<1 | -1>(1);
  const [finishing, setFinishing] = useState(false);
  const finishDestination = useRef<string>('/');
  const hydratedRef = useRef(false);

  // The status arrives after the first render, so land on the resume step once.
  useEffect(() => {
    if (hydratedRef.current || !status) return;
    hydratedRef.current = true;
    setStep(sportOnly ? 'sport' : resolveResumeStep(status.resumeStep, visibleSteps));
  }, [sportOnly, status, visibleSteps]);

  const { current: position, total } = stepPosition(step, visibleSteps);

  // Announce the step and persist the resume position.
  const lastViewedRef = useRef<OnboardingStep | null>(null);
  useEffect(() => {
    if (lastViewedRef.current === step) return;
    lastViewedRef.current = step;
    emitOnboardingEvent({ name: 'onboarding_step_viewed', step, position, total, persist: !sportOnly });
    if (sportOnly) return;
    void onboardingApi.setStep(step).then(setStatusCache).catch(() => {
      // Offline or a flaky link only costs the resume position.
    });
  }, [position, setStatusCache, sportOnly, step, total]);

  const goTo = useCallback((target: OnboardingStep, nextDirection: 1 | -1) => {
    setDirection(nextDirection);
    setStep(target);
  }, []);

  const finish = useCallback(
    (destination: string) => {
      finishDestination.current = destination;
      setFinishing(true);
      // Settle the gate *before* the request resolves. The closing screen lasts
      // 600 ms; without this a slow `POST` would let `ProtectedRoute` bounce the
      // user straight back into `/welcome`.
      setStatusCache({
        completedAt: status?.completedAt ?? new Date().toISOString(),
        step: null,
        resumeStep: 'welcome',
        needsOnboarding: false,
        needsSportStep: false,
      });
      if (!sportOnly) {
        void onboardingApi.complete().then(setStatusCache).catch(() => {
          // The gate re-asks on the next launch; better than trapping the user.
        });
      }
    },
    [setStatusCache, sportOnly, status?.completedAt],
  );

  const onFinishAnimationDone = useCallback(() => {
    // A deep link the gate intercepted wins over the closing choice: the user
    // asked for that screen first, and PRD 350 requires it to survive the flow.
    const intercepted = consumePostOnboardingPath();
    const pending = intercepted ?? pendingAuthPath;
    if (pendingAuthPath) setPendingAuthPath(null);
    navigate(resolvePostOnboardingPath(pending, finishDestination.current), { replace: true });
  }, [navigate, pendingAuthPath, setPendingAuthPath]);

  const advance = useCallback(() => {
    emitOnboardingEvent({ name: 'onboarding_step_completed', step, position, total, persist: !sportOnly });
    const target = nextStep(step, visibleSteps);
    if (target) {
      goTo(target, 1);
      return;
    }
    finish('/');
  }, [finish, goTo, position, sportOnly, step, total, visibleSteps]);

  const skip = useMemo(() => {
    if (!isSkippableStep(step) || sportOnly) return undefined;
    return () => {
      emitOnboardingEvent({ name: 'onboarding_step_skipped', step, position, total, persist: !sportOnly });
      const target = nextStep(step, visibleSteps);
      if (target) {
        goTo(target, 1);
        return;
      }
      finish('/');
    };
  }, [finish, goTo, position, sportOnly, step, total, visibleSteps]);

  const back = useMemo(() => {
    const target = previousStep(step, visibleSteps);
    if (!target) return undefined;
    return () => goTo(target, -1);
  }, [goTo, step, visibleSteps]);

  // Once a sport-only visit has served its purpose, drop the query param so a
  // refresh does not re-enter the narrowed flow.
  useEffect(() => {
    if (!finishing || !sportOnly) return;
    const next = new URLSearchParams(searchParams);
    next.delete('step');
    setSearchParams(next, { replace: true });
  }, [finishing, searchParams, setSearchParams, sportOnly]);

  return {
    step,
    visibleSteps,
    position,
    total,
    direction,
    sportOnly,
    finishing,
    advance,
    skip,
    back,
    finish,
    onFinishAnimationDone,
  };
}
