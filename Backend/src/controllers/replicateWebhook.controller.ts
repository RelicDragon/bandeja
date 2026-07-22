import { Request, Response } from 'express';
import { GameResultsArtifactService } from '../services/gameResultsArtifact/gameResultsArtifact.service';
import type { ReplicatePredictionStatus } from '../services/replicate/replicateImage.service';
import {
  consumeWebhookIdOnce,
  releaseWebhookIdOnce,
  verifyReplicateWebhookRequest,
} from '../services/replicate/verifyReplicateWebhook';
import { asyncHandler } from '../utils/asyncHandler';
import { ApiError } from '../utils/ApiError';
import { config } from '../config/env';

type RequestWithRawBody = Request & { rawBody?: string };

function headerValue(req: Request, name: string): string | undefined {
  const v = req.headers[name];
  if (typeof v === 'string') return v;
  if (Array.isArray(v) && typeof v[0] === 'string') return v[0];
  return undefined;
}

export const handleReplicateWebhook = asyncHandler(async (req: Request, res: Response) => {
  const rawBody = (req as RequestWithRawBody).rawBody;
  const secret = config.resultsArtifacts.replicateWebhookSecret;

  const verified = await verifyReplicateWebhookRequest({
    secret,
    rawBody: rawBody ?? '',
    headers: {
      id: headerValue(req, 'webhook-id'),
      timestamp: headerValue(req, 'webhook-timestamp'),
      signature: headerValue(req, 'webhook-signature'),
    },
  });

  if (!verified.ok) {
    console.warn('[replicate-webhook] rejected', { reason: verified.reason });
    throw new ApiError(401, 'Invalid webhook signature', true, {
      code: 'webhook.replicate.unauthorized',
    });
  }

  if (!(await consumeWebhookIdOnce(verified.webhookId))) {
    // Idempotent success for legitimate Replicate retries after we already applied.
    res.status(200).json({ ok: true, duplicate: true });
    return;
  }

  const body = req.body as {
    id?: string;
    status?: ReplicatePredictionStatus;
    output?: unknown;
    error?: string | null;
  };

  if (!body?.id || !body.status) {
    await releaseWebhookIdOnce(verified.webhookId);
    throw new ApiError(400, 'Invalid webhook payload');
  }

  try {
    await GameResultsArtifactService.handleReplicateWebhook({
      id: body.id,
      status: body.status,
      output: body.output,
      error: body.error ?? null,
    });
  } catch (err) {
    await releaseWebhookIdOnce(verified.webhookId);
    throw err;
  }

  res.status(200).json({ ok: true });
});
