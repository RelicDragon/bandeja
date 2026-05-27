import {
  GameResultsArtifactJobStatus,
  GameResultsArtifactStepStatus,
} from '@prisma/client';
import {
  MAX_ARTIFACT_PHOTO_GENERATIONS,
  photoGenerationsRemaining,
} from './gameResultsArtifact.photoLimit';

export type ResultsArtifactsStatus =
  | 'none'
  | 'pending'
  | 'running'
  | 'done'
  | 'failed';

export type ResultsArtifactsDto = {
  status: ResultsArtifactsStatus;
  version: number;
  summaryReady: boolean;
  photoReady: boolean;
  photoInFlight: boolean;
  photoGenerationsUsed: number;
  photoGenerationsRemaining: number;
  photoGenerationsMax: number;
  readyAt: string | null;
};

function stepReady(status: GameResultsArtifactStepStatus): boolean {
  return status === 'done' || status === 'skipped';
}

function stepInFlight(status: GameResultsArtifactStepStatus): boolean {
  return status === 'pending' || status === 'running';
}

function resolveArtifactsStatus(input: {
  resultsArtifactsReadyAt: Date | null;
  jobStatus?: GameResultsArtifactJobStatus | null;
}): ResultsArtifactsStatus {
  if (input.resultsArtifactsReadyAt) return 'done';
  if (!input.jobStatus) return 'none';
  if (input.jobStatus === 'failed') return 'failed';
  if (input.jobStatus === 'done') return 'done';
  if (input.jobStatus === 'running') return 'running';
  return 'pending';
}

export function buildResultsArtifactsDto(game: {
  resultsArtifactsVersion: number;
  resultsArtifactsReadyAt: Date | null;
  resultsArtifactJob?: {
    status: GameResultsArtifactJobStatus;
    summaryStatus: GameResultsArtifactStepStatus;
    photoStatus: GameResultsArtifactStepStatus;
    photoGenerationsUsed?: number;
  } | null;
}): ResultsArtifactsDto {
  const job = game.resultsArtifactJob ?? null;
  const used = job?.photoGenerationsUsed ?? 0;
  return {
    status: resolveArtifactsStatus({
      resultsArtifactsReadyAt: game.resultsArtifactsReadyAt,
      jobStatus: job?.status ?? null,
    }),
    version: game.resultsArtifactsVersion,
    summaryReady: job ? stepReady(job.summaryStatus) : false,
    photoReady: job ? stepReady(job.photoStatus) : false,
    photoInFlight: job ? stepInFlight(job.photoStatus) : false,
    photoGenerationsUsed: used,
    photoGenerationsRemaining: photoGenerationsRemaining(used),
    photoGenerationsMax: MAX_ARTIFACT_PHOTO_GENERATIONS,
    readyAt: game.resultsArtifactsReadyAt?.toISOString() ?? null,
  };
}
