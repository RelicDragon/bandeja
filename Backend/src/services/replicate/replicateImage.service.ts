import Replicate from 'replicate';
import { config } from '../../config/env';

export type ReplicatePredictionStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'aborted';

export type Flux2MaxInput = {
  prompt: string;
  /** HTTPS URLs or `data:image/...;base64,...` data URIs (Replicate file inputs). */
  input_images?: string[];
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;
  output_quality?: number;
};

export type ReplicatePredictionRecord = {
  id: string;
  status: ReplicatePredictionStatus;
  output: unknown;
  error: string | null;
};

function getClient(): Replicate | null {
  const token = config.resultsArtifacts.replicateApiToken.trim();
  if (!token) return null;
  return new Replicate({ auth: token });
}

export class ReplicateImageService {
  static isConfigured(): boolean {
    return Boolean(config.resultsArtifacts.replicateApiToken.trim());
  }

  static async createFlux2MaxPrediction(input: Flux2MaxInput): Promise<ReplicatePredictionRecord> {
    const client = getClient();
    if (!client) {
      throw new Error('Replicate is not configured');
    }

    const webhook = config.resultsArtifacts.replicateWebhookUrl;
    const prediction = await client.predictions.create({
      model: config.resultsArtifacts.replicateModel,
      input: {
        prompt: input.prompt,
        input_images: input.input_images ?? [],
        aspect_ratio: input.aspect_ratio ?? '4:5',
        resolution: input.resolution ?? '1 MP',
        output_format: input.output_format ?? 'webp',
        output_quality: input.output_quality ?? 80,
      },
      ...(webhook
        ? {
            webhook,
            webhook_events_filter: ['completed'] as const,
          }
        : {}),
    });

    return {
      id: prediction.id,
      status: prediction.status as ReplicatePredictionStatus,
      output: prediction.output,
      error:
        typeof prediction.error === 'string'
          ? prediction.error
          : prediction.error != null
            ? String(prediction.error)
            : null,
    };
  }

  static async getPrediction(predictionId: string): Promise<ReplicatePredictionRecord> {
    const client = getClient();
    if (!client) {
      throw new Error('Replicate is not configured');
    }
    const prediction = await client.predictions.get(predictionId);
    return {
      id: prediction.id,
      status: prediction.status as ReplicatePredictionStatus,
      output: prediction.output,
      error:
        typeof prediction.error === 'string'
          ? prediction.error
          : prediction.error != null
            ? String(prediction.error)
            : null,
    };
  }

  static extractOutputImageUrl(output: unknown): string | null {
    if (!output) return null;
    if (typeof output === 'string') return output;
    if (Array.isArray(output)) {
      const first = output[0];
      if (typeof first === 'string') return first;
      if (first && typeof first === 'object' && 'url' in first) {
        const u = (first as { url?: () => string }).url;
        if (typeof u === 'function') return u();
      }
    }
    return null;
  }

  static isTerminalStatus(status: ReplicatePredictionStatus): boolean {
    return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'aborted';
  }

  static isRunningStatus(status: ReplicatePredictionStatus): boolean {
    return status === 'starting' || status === 'processing';
  }
}
