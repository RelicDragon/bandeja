/**
 * PRD 350 — first-run onboarding state.
 *
 * Two columns carry the whole flow: `User.onboardingCompletedAt` (null => the
 * user has never finished `/welcome`) and `User.onboardingStep` (where to
 * resume). Accounts that existed before PRD 350 were backfilled to their
 * `createdAt`, so the flow only ever appears for genuinely new users.
 */
import prisma from '../../config/database';
import {
  ONBOARDING_FIRST_STEP,
  parseOnboardingStep,
  resolveResumeStep,
  type OnboardingStep,
} from './onboardingSteps';

/** Wire shape of `GET /users/me/onboarding`. Mirrored by the frontend `OnboardingStatus`. */
export type OnboardingState = {
  /** ISO timestamp, or `null` while the flow has never been finished. */
  completedAt: string | null;
  /** Last persisted step id, `null` when the user has not started. */
  step: OnboardingStep | null;
  /** Where `/welcome` should land — never `null`, falls back to the first step. */
  resumeStep: OnboardingStep;
  /** `true` => the router must send this user to `/welcome`. */
  needsOnboarding: boolean;
  /**
   * `true` => onboarding is finished but the account still has no enabled
   * sport, so the router sends the user to `/welcome?step=sport` only.
   */
  needsSportStep: boolean;
};

type OnboardingRow = {
  onboardingCompletedAt: Date | null;
  onboardingStep: string | null;
  sportsEnabled: unknown;
};

/**
 * Pure projection of the two columns + the sport list onto the routing
 * decision. Kept separate from Prisma so it can be unit-tested.
 */
export function projectOnboardingState(row: OnboardingRow): OnboardingState {
  const completedAt = row.onboardingCompletedAt ? row.onboardingCompletedAt.toISOString() : null;
  const hasSport = Array.isArray(row.sportsEnabled) && row.sportsEnabled.length > 0;
  return {
    completedAt,
    step: parseOnboardingStep(row.onboardingStep),
    resumeStep: resolveResumeStep(row.onboardingStep),
    needsOnboarding: completedAt === null,
    needsSportStep: completedAt !== null && !hasSport,
  };
}

const ONBOARDING_SELECT = {
  onboardingCompletedAt: true,
  onboardingStep: true,
  sportsEnabled: true,
} as const;

export async function getOnboardingState(userId: string): Promise<OnboardingState> {
  const row = await prisma.user.findUnique({
    where: { id: userId },
    select: ONBOARDING_SELECT,
  });
  if (!row) {
    // A deleted user cannot be mid-flow; treat it as "nothing to resume".
    return projectOnboardingState({
      onboardingCompletedAt: null,
      onboardingStep: ONBOARDING_FIRST_STEP,
      sportsEnabled: [],
    });
  }
  return projectOnboardingState(row);
}

/**
 * Persist progress. Never clears `onboardingCompletedAt` — a user who re-enters
 * the flow for the sport step stays "onboarded".
 */
export async function setOnboardingStep(
  userId: string,
  step: OnboardingStep,
): Promise<OnboardingState> {
  const row = await prisma.user.update({
    where: { id: userId },
    data: { onboardingStep: step },
    select: ONBOARDING_SELECT,
  });
  return projectOnboardingState(row);
}

/**
 * Finish the flow. Idempotent: a second call keeps the original timestamp, so a
 * double-tap or a retried offline mutation cannot move the completion date.
 */
export async function completeOnboarding(userId: string): Promise<OnboardingState> {
  const existing = await prisma.user.findUnique({
    where: { id: userId },
    select: { onboardingCompletedAt: true },
  });

  const row = await prisma.user.update({
    where: { id: userId },
    data: {
      onboardingStep: null,
      ...(existing?.onboardingCompletedAt ? {} : { onboardingCompletedAt: new Date() }),
    },
    select: ONBOARDING_SELECT,
  });
  return projectOnboardingState(row);
}
