import { ScoringPreset } from '@prisma/client';
import { ApiError } from '../ApiError';

const MAX_SETS = 99;
const MAX_POINTS_PER_SET = 999;

export function isCustomScoringPreset(preset: ScoringPreset | string | null | undefined): boolean {
  return preset === ScoringPreset.CUSTOM_SCORING;
}

export function assertValidCustomScoringNumbers(fixedNumberOfSets: number, maxTotalPointsPerSet: number): void {
  if (!Number.isFinite(fixedNumberOfSets) || fixedNumberOfSets < 1 || fixedNumberOfSets > MAX_SETS) {
    throw new ApiError(400, `Custom scoring requires sets between 1 and ${MAX_SETS}.`);
  }
  if (!Number.isFinite(maxTotalPointsPerSet) || maxTotalPointsPerSet < 1 || maxTotalPointsPerSet > MAX_POINTS_PER_SET) {
    throw new ApiError(400, `Custom scoring requires ball cap per set between 1 and ${MAX_POINTS_PER_SET}.`);
  }
}
