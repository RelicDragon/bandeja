/**
 * PRD 350 — first-run onboarding.
 *
 * Routes: `Backend/src/routes/onboarding.routes.ts` (mounted at `/api/users`)
 * plus `GET /api/cities/:id/stats`, which is declared in `city.routes.ts` but
 * handled here so the onboarding surface stays in one file.
 */
import { Request, Response } from 'express';
import { isSport } from '../shared/sport';
import { AuthRequest } from '../middleware/auth';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { parseOnboardingStep } from '../services/onboarding/onboardingSteps';
import {
  completeOnboarding,
  getOnboardingState,
  setOnboardingStep,
} from '../services/onboarding/onboarding.service';
import {
  clampSuggestedLimit,
  getSuggestedUsers,
} from '../services/onboarding/suggestedUsers.service';
import { getCityStats } from '../services/onboarding/cityStats.service';

function requireUserId(req: AuthRequest): string {
  const userId = req.userId;
  if (!userId) throw new ApiError(401, 'errors.unauthorized');
  return userId;
}

export const getOnboarding = asyncHandler(async (req: AuthRequest, res: Response) => {
  const state = await getOnboardingState(requireUserId(req));
  res.json({ success: true, data: state });
});

export const patchOnboardingStep = asyncHandler(async (req: AuthRequest, res: Response) => {
  const step = parseOnboardingStep((req.body as { step?: unknown } | undefined)?.step);
  if (!step) {
    throw new ApiError(400, 'errors.onboarding.invalidStep');
  }
  const state = await setOnboardingStep(requireUserId(req), step);
  res.json({ success: true, data: state });
});

export const postOnboardingComplete = asyncHandler(async (req: AuthRequest, res: Response) => {
  const state = await completeOnboarding(requireUserId(req));
  res.json({ success: true, data: state });
});

/**
 * `GET /users/suggested?cityId&sport&limit`.
 *
 * `cityId` falls back to the viewer's current city so the onboarding client
 * does not have to wait for the city step before it can prefetch.
 */
export const getSuggestedPlayers = asyncHandler(async (req: AuthRequest, res: Response) => {
  const userId = requireUserId(req);
  const query = req.query as { cityId?: string; sport?: string; limit?: string };

  const cityId = query.cityId?.trim() || (req.user?.currentCityId as string | undefined);
  if (!cityId) {
    throw new ApiError(400, 'errors.onboarding.cityRequired');
  }

  const rawSport = query.sport?.trim() || (req.user?.primarySport as string | undefined);
  if (!rawSport || !isSport(rawSport)) {
    throw new ApiError(400, 'errors.onboarding.sportRequired');
  }

  const suggestions = await getSuggestedUsers({
    viewerId: userId,
    cityId,
    sport: rawSport,
    limit: clampSuggestedLimit(query.limit),
  });

  res.json({ success: true, data: suggestions });
});

/** `GET /cities/:id/stats` — player count for the Welcome step's social proof. */
export const getCityStatsPublic = asyncHandler(
  async (req: Request<{ id: string }>, res: Response) => {
    const cityId = req.params.id;
    if (!cityId) {
      throw new ApiError(400, 'errors.onboarding.cityRequired');
    }
    const stats = await getCityStats(cityId);
    res.json({ success: true, data: stats });
  },
);
