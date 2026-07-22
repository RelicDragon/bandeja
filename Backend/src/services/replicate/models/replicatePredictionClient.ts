import Replicate from 'replicate';
import { config } from '../../../config/env';
import type {
  ReplicatePredictionRecord,
  ReplicatePredictionStatus,
} from '../replicateImage.service';

function normalizePredictionError(error: unknown): string | null {
  if (typeof error === 'string') return error;
  if (error != null) return String(error);
  return null;
}

export function getReplicateClientOrNull(): Replicate | null {
  const token = config.resultsArtifacts.replicateApiToken.trim();
  if (!token) return null;
  return new Replicate({ auth: token });
}

export function getReplicateClient(): Replicate {
  const client = getReplicateClientOrNull();
  if (!client) {
    throw new Error('Replicate is not configured');
  }
  return client;
}

export function toPredictionRecord(
  prediction: Awaited<ReturnType<Replicate['predictions']['create']>>
): ReplicatePredictionRecord {
  return {
    id: prediction.id,
    status: prediction.status as ReplicatePredictionStatus,
    output: prediction.output,
    error: normalizePredictionError(prediction.error),
  };
}

export async function createReplicatePrediction(
  model: string,
  input: Record<string, unknown>
): Promise<ReplicatePredictionRecord> {
  const client = getReplicateClient();
  const webhookUrl = config.resultsArtifacts.replicateWebhookUrl;
  const webhookSecret = config.resultsArtifacts.replicateWebhookSecret;
  // Never register an unsigned webhook endpoint — secret is required for fail-closed verify.
  const webhook = webhookUrl && webhookSecret ? webhookUrl : '';
  if (webhookUrl && !webhookSecret) {
    console.warn(
      '[replicate] REPLICATE_WEBHOOK_URL set without REPLICATE_WEBHOOK_SECRET; omitting webhook (poll-only)'
    );
  }
  const prediction = await client.predictions.create({
    model,
    input,
    ...(webhook
      ? {
          webhook,
          webhook_events_filter: ['completed'] as const,
        }
      : {}),
  });
  return toPredictionRecord(prediction);
}
