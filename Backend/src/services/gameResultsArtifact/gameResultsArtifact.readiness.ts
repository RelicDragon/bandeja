import { GameResultsArtifactStepStatus } from '@prisma/client';

export type ResultsArtifactStepSnapshot = {
  summaryStatus: GameResultsArtifactStepStatus;
  photoStatus: GameResultsArtifactStepStatus;
};

export function isResultsArtifactsReady(job: ResultsArtifactStepSnapshot): boolean {
  const summaryOk =
    job.summaryStatus === 'done' || job.summaryStatus === 'skipped';
  const photoOk =
    job.photoStatus === 'done' || job.photoStatus === 'skipped';
  return summaryOk && photoOk;
}
