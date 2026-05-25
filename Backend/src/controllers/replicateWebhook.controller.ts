import { Request, Response } from 'express';
import { GameResultsArtifactService } from '../services/gameResultsArtifact/gameResultsArtifact.service';
import type { ReplicatePredictionStatus } from '../services/replicate/replicateImage.service';

export async function handleReplicateWebhook(req: Request, res: Response): Promise<void> {
  const body = req.body as {
    id?: string;
    status?: ReplicatePredictionStatus;
    output?: unknown;
    error?: string | null;
  };

  if (!body?.id || !body.status) {
    res.status(400).json({ error: 'Invalid webhook payload' });
    return;
  }

  try {
    await GameResultsArtifactService.handleReplicateWebhook({
      id: body.id,
      status: body.status,
      output: body.output,
      error: body.error ?? null,
    });
    res.status(200).json({ ok: true });
  } catch (err) {
    console.error('[replicate-webhook] handler failed', err);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
