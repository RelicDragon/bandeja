import { useCallback } from 'react';
import { useBackButtonHandler } from '@/hooks/useBackButtonHandler';
import { OnboardingFinishOverlay } from '@/components/onboarding/OnboardingFinishOverlay';
import { CityStep } from '@/components/onboarding/CityStep';
import { FollowStep } from '@/components/onboarding/FollowStep';
import { LevelStep } from '@/components/onboarding/LevelStep';
import { NotificationsStep } from '@/components/onboarding/NotificationsStep';
import { ProfileStep } from '@/components/onboarding/ProfileStep';
import { SportStep } from '@/components/onboarding/SportStep';
import { WelcomeStep } from '@/components/onboarding/WelcomeStep';
import { useOnboardingFlow } from '@/components/onboarding/useOnboardingFlow';
import type { OnboardingStepChrome } from '@/components/onboarding/OnboardingFrame';

/**
 * PRD 350 — guided first-run onboarding (`/welcome`, place `welcome`).
 *
 * A standalone full-screen route, deliberately **not** hosted by `MainPage` so
 * the tab shell never frames the flow. `ProtectedRoute` sends new users here
 * (`onboardingCompletedAt === null`) and sends "completed but no enabled sport"
 * users to `/welcome?step=sport`.
 *
 * The app-level `OfflineBanner` renders above this route, and `/welcome` is
 * exempt from the offline gate in `App.tsx`, so a dropped connection shows the
 * banner instead of the no-internet screen — steps that need the server fail
 * soft and let the user continue.
 */
export const OnboardingPage = () => {
  const flow = useOnboardingFlow();

  // The hardware/gesture back goes back one step. On the first step it is a
  // no-op rather than an exit: leaving would only be re-gated straight back
  // here, which reads as a flicker.
  useBackButtonHandler(
    useCallback(() => {
      flow.back?.();
      return true;
    }, [flow]),
  );

  if (flow.finishing) {
    return <OnboardingFinishOverlay onDone={flow.onFinishAnimationDone} />;
  }

  const chrome: OnboardingStepChrome = {
    position: flow.position,
    total: flow.total,
    direction: flow.direction,
    onBack: flow.back,
    onSkip: flow.skip,
    onAdvance: flow.advance,
  };

  switch (flow.step) {
    case 'welcome':
      return <WelcomeStep {...chrome} onSkip={undefined} />;
    case 'sport':
      return <SportStep {...chrome} onSkip={undefined} sportOnly={flow.sportOnly} />;
    case 'profile':
      // Photo is skippable inside the step; the name is not, so the frame-level
      // Skip is withheld here.
      return <ProfileStep {...chrome} onSkip={undefined} />;
    case 'level':
      return <LevelStep {...chrome} />;
    case 'city':
      return <CityStep {...chrome} />;
    case 'follow':
      return <FollowStep {...chrome} />;
    case 'notifications':
    default:
      return <NotificationsStep {...chrome} onFinish={flow.finish} />;
  }
};
