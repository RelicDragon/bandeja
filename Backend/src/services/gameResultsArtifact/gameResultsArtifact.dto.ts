import {
  GameResultsArtifactJobStatus,
  GameResultsArtifactStepStatus,
} from '@prisma/client';

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
  readyAt: string | null;
};

function stepReady(status: GameResultsArtifactStepStatus): boolean {
  return status === 'done' || status === 'skipped';
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
  } | null;
}): ResultsArtifactsDto {
  const job = game.resultsArtifactJob ?? null;
  return {
    status: resolveArtifactsStatus({
      resultsArtifactsReadyAt: game.resultsArtifactsReadyAt,
      jobStatus: job?.status ?? null,
    }),
    version: game.resultsArtifactsVersion,
    summaryReady: job ? stepReady(job.summaryStatus) : false,
    photoReady: job ? stepReady(job.photoStatus) : false,
    readyAt: game.resultsArtifactsReadyAt?.toISOString() ?? null,
  };
}
