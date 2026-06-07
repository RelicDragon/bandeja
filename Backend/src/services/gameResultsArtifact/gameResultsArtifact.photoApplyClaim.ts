import prisma from '../../config/database';
import { GameResultsArtifactStepStatus } from '@prisma/client';
import { resolvePhotoGenerationsMaxForGame } from './gameResultsArtifact.ownerPremium';

function photoApplyClaimable(status: GameResultsArtifactStepStatus): boolean {
  return status === 'pending' || status === 'running';
}

/** Atomically claim a single photo apply for this job. Returns false if another path already claimed. */
export async function tryClaimArtifactPhotoApply(jobId: string): Promise<boolean> {
  const job = await prisma.gameResultsArtifactJob.findUnique({
    where: { id: jobId },
    select: { gameId: true },
  });
  if (!job) return false;

  const max = await resolvePhotoGenerationsMaxForGame(job.gameId);
  const updated = await prisma.gameResultsArtifactJob.updateMany({
    where: {
      id: jobId,
      photoStatus: { in: ['pending', 'running'] },
      photoGenerationsUsed: { lt: max },
    },
    data: {
      photoStatus: 'done',
      photoError: null,
      photoGenerationsUsed: { increment: 1 },
    },
  });
  return updated.count === 1;
}

export async function failArtifactPhotoApplyClaim(
  jobId: string,
  errorMsg: string
): Promise<void> {
  await prisma.gameResultsArtifactJob.update({
    where: { id: jobId },
    data: {
      photoStatus: 'failed',
      photoError: errorMsg,
      photoGenerationsUsed: { decrement: 1 },
    },
  });
}

/** Release a successful claim after a transient save failure so webhook/poll can retry. */
export async function revertArtifactPhotoApplyClaim(jobId: string): Promise<void> {
  await prisma.gameResultsArtifactJob.update({
    where: { id: jobId },
    data: {
      photoStatus: 'running',
      photoError: null,
      photoGenerationsUsed: { decrement: 1 },
    },
  });
}

export async function isArtifactPhotoApplyClaimable(jobId: string): Promise<boolean> {
  const job = await prisma.gameResultsArtifactJob.findUnique({
    where: { id: jobId },
    select: { gameId: true, photoStatus: true, photoGenerationsUsed: true },
  });
  if (!job) return false;
  if (!photoApplyClaimable(job.photoStatus)) return false;
  const max = await resolvePhotoGenerationsMaxForGame(job.gameId);
  return job.photoGenerationsUsed < max;
}
