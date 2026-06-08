import { Request, Response } from 'express';
import { GameResultsArtifactService } from '../services/gameResultsArtifact/gameResultsArtifact.service';
import type { ReplicatePredictionStatus } from '../services/replicate/replicateImage.service';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';

export const handleReplicateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const body = req.body as {
    id?: string;
    status?: ReplicatePredictionStatus;
    output?: unknown;
    error?: string | null;
  };

  if (!body?.id || !body.status) {
    throw new ApiError(400, 'Invalid webhook payload');
  }

  await GameResultsArtifactService.handleReplicateWebhook({
    id: body.id,
    status: body.status,
    output: body.output,
    error: body.error ?? null,
  });
  res.status(200).json({ ok: true });
});
