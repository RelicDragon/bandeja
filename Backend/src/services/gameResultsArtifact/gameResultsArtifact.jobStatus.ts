import {
  GameResultsArtifactJob,
  GameResultsArtifactStepStatus,
} from '@prisma/client';

function stepInFlight(status: GameResultsArtifactStepStatus): boolean {
  return status === 'pending' || status === 'running';
}

export function isArtifactSummaryGenerating(
  job: Pick<GameResultsArtifactJob, 'summaryStatus'> | null
): boolean {
  if (!job) return false;
  return stepInFlight(job.summaryStatus);
}

export function isArtifactPhotoGenerating(
  job: Pick<GameResultsArtifactJob, 'photoStatus'> | null
): boolean {
  if (!job) return false;
  return stepInFlight(job.photoStatus);
}

export function isArtifactJobQueuedOrRunning(
  job: Pick<GameResultsArtifactJob, 'status'> | null
): boolean {
  if (!job) return false;
  return job.status === 'pending' || job.status === 'running';
}
