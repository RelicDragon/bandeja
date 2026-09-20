import type { User } from '@/types';

/**
 * PRD 350 — first-run onboarding step vocabulary.
 *
 * Mirror of `Backend/src/services/onboarding/onboardingSteps.ts`. The ids are
 * persisted verbatim in `User.onboardingStep`, so **never rename one** — an old
 * value has to keep resolving, which is what {@link parseOnboardingStep} is for.
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

/** Steps the user may leave without acting. Welcome and Sport are not skippable. */
export const SKIPPABLE_STEPS: readonly OnboardingStep[] = [
  'profile',
  'level',
  'city',
  'follow',
  'notifications',
];

export function isOnboardingStep(value: unknown): value is OnboardingStep {
  return typeof value === 'string' && (ONBOARDING_STEPS as readonly string[]).includes(value);
}

/** `null` for anything that is not a known step id (including `undefined`/empty). */
export function parseOnboardingStep(value: unknown): OnboardingStep | null {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return isOnboardingStep(trimmed) ? trimmed : null;
}

export function isSkippableStep(step: OnboardingStep): boolean {
  return SKIPPABLE_STEPS.includes(step);
}

/**
 * The account already has a usable identity, so the conditional name/photo step
 * is not shown. A photo alone is not enough — a game roster needs a name.
 */
export function hasDisplayName(user: Pick<User, 'firstName' | 'nameIsSet'> | null | undefined): boolean {
  if (!user) return false;
  if (user.nameIsSet === false) return false;
  return typeof user.firstName === 'string' && user.firstName.trim().length > 0;
}

/**
 * Ordered list of steps this particular account will see. `profile` is inserted
 * right after `sport` only when the account has no display name **or** no
 * avatar (PRD: "Inserted after Sport when the account has no display name or
 * avatar"), so SSO/Telegram users who arrive complete never see it.
 */
export function visibleOnboardingSteps(
  user: Pick<User, 'firstName' | 'nameIsSet' | 'avatar'> | null | undefined,
): OnboardingStep[] {
  const needsProfile = !hasDisplayName(user) || !user?.avatar;
  return ONBOARDING_STEPS.filter((step) => step !== 'profile' || needsProfile);
}

/**
 * Where the flow resumes. An unknown or missing stored step restarts rather
 * than dropping the user into a half-configured screen; a stored step the
 * account no longer sees (e.g. `profile` after the name was set elsewhere)
 * moves forward to the next visible one.
 */
export function resolveResumeStep(
  stored: string | null | undefined,
  visible: readonly OnboardingStep[],
): OnboardingStep {
  const fallback = visible[0] ?? ONBOARDING_FIRST_STEP;
  const parsed = parseOnboardingStep(stored);
  if (!parsed) return fallback;
  if (visible.includes(parsed)) return parsed;
  const absoluteIndex = ONBOARDING_STEPS.indexOf(parsed);
  return (
    visible.find((step) => ONBOARDING_STEPS.indexOf(step) > absoluteIndex) ??
    visible[visible.length - 1] ??
    fallback
  );
}

/** 1-based position for the "Step 3 of 6" label. */
export function stepPosition(
  step: OnboardingStep,
  visible: readonly OnboardingStep[],
): { current: number; total: number } {
  const index = visible.indexOf(step);
  return { current: index < 0 ? 1 : index + 1, total: visible.length };
}

/** 0–1 fill of the progress bar. The first step is already a sliver, not empty. */
export function stepProgress(step: OnboardingStep, visible: readonly OnboardingStep[]): number {
  const { current, total } = stepPosition(step, visible);
  if (total <= 0) return 0;
  return Math.min(1, current / total);
}

export function nextStep(
  step: OnboardingStep,
  visible: readonly OnboardingStep[],
): OnboardingStep | null {
  const index = visible.indexOf(step);
  if (index < 0 || index >= visible.length - 1) return null;
  return visible[index + 1];
}

export function previousStep(
  step: OnboardingStep,
  visible: readonly OnboardingStep[],
): OnboardingStep | null {
  const index = visible.indexOf(step);
  if (index <= 0) return null;
  return visible[index - 1];
}
