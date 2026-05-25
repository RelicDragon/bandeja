import { GameResultsArtifactJob } from '@prisma/client';

export function isArtifactSummaryGenerating(
  job: Pick<
    GameResultsArtifactJob,
    'status' | 'summaryStatus'
  > | null
): boolean {
  if (!job) return false;
  if (job.status === 'pending' || job.status === 'running') return true;
  return job.summaryStatus === 'pending' || job.summaryStatus === 'running';
}
