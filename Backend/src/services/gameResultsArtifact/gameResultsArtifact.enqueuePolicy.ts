import { GameResultsArtifactStepStatus } from '@prisma/client';

export function shouldSkipArtifactReenqueue(opts: {
  resultsSentToTelegram: boolean;
  forceRegenerate?: boolean;
}): boolean {
  if (opts.forceRegenerate) return false;
  return opts.resultsSentToTelegram;
}

export function buildArtifactJobResetSteps(): {
  summaryStatus: GameResultsArtifactStepStatus;
  photoStatus: GameResultsArtifactStepStatus;
  summaryError: null;
  photoError: null;
  replicatePredictionId: null;
} {
  return {
    summaryStatus: 'pending',
    photoStatus: 'pending',
    summaryError: null,
    photoError: null,
    replicatePredictionId: null,
  };
}

export function nextArtifactGenerationVersion(current: number): number {
  return current + 1;
}

export function shouldEnqueueArtifactsOnRecalculate(opts: {
  resultsStatus: string;
  wasEdited: boolean;
  isFirstFinalize: boolean;
}): boolean {
  if (opts.resultsStatus !== 'FINAL') return false;
  return opts.isFirstFinalize || opts.wasEdited;
}
