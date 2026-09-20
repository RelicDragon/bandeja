/**
 * PRD 350 — first-run onboarding step vocabulary.
 *
 * The same seven ids are mirrored in
 * `Frontend/src/components/onboarding/onboardingSteps.ts`. They are persisted
 * verbatim in `User.onboardingStep`, so **never rename one** — an old value has
 * to keep resolving, which is what {@link parseOnboardingStep} is for.
 *
 * `profile` (name + photo) is conditional: it is only shown when the account has
 * no display name or avatar, so the visible step count is 6 or 7.
 */
export const ONBOARDING_STEPS = [
  'welcome',
  'sport',
  'profile',
  'level',
  'city',
  'follow',
  'notifications',
] as const;

export type OnboardingStep = (typeof ONBOARDING_STEPS)[number];

export const ONBOARDING_FIRST_STEP: OnboardingStep = 'welcome';

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** `null` for anything that is not a known step id (including `undefined`/empty). */
export function parseOnboardingStep(value: unknown): OnboardingStep | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isOnboardingStep(trimmed) ? trimmed : null;
}

export function onboardingStepIndex(step: OnboardingStep): number {
  return ONBOARDING_STEPS.indexOf(step);
}

/**
 * Where `/welcome` resumes. An unknown or missing stored step restarts the flow
 * rather than dropping the user into a half-configured screen.
 */
export function resolveResumeStep(stored: string | null | undefined): OnboardingStep {
  return parseOnboardingStep(stored) ?? ONBOARDING_FIRST_STEP;
}
