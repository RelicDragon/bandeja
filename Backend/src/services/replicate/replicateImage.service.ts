import Replicate from 'replicate';
import { config } from '../../config/env';
import type { InternalPhotoInput } from './models/replicateImageModel.types';
import { getReplicateImageModel } from './models/replicateImageModel.selector';
import { getReplicateClientOrNull } from './models/replicatePredictionClient';
import { extractReplicateImageUrl } from './models/extractReplicateImageOutput';

export type ReplicatePredictionStatus =
  | 'starting'
  | 'processing'
  | 'succeeded'
  | 'failed'
  | 'canceled'
  | 'aborted';

/** @deprecated Use InternalPhotoInput from models/replicateImageModel.types */
export type Flux2MaxInput = InternalPhotoInput;

export type ReplicatePredictionRecord = {
  id: string;
  status: ReplicatePredictionStatus;
  output: unknown;
  error: string | null;
};

function getClient(): Replicate | null {
  return getReplicateClientOrNull();
}

export class ReplicateImageService {
  static isConfigured(): boolean {
    return Boolean(config.resultsArtifacts.replicateApiToken.trim());
  }

  static async createPhotoPrediction(
    modelId: string,
    internal: InternalPhotoInput
  ): Promise<ReplicatePredictionRecord> {
    const adapter = getReplicateImageModel(modelId);
    const input = adapter.buildInput(internal);
    return adapter.createPrediction(input);
  }

  /** @deprecated Use createPhotoPrediction with explicit model id */
  static async createFlux2MaxPrediction(input: Flux2MaxInput): Promise<ReplicatePredictionRecord> {
    const modelId = config.resultsArtifacts.replicateModel.trim() || 'black-forest-labs/flux-2-max';
    return this.createPhotoPrediction(modelId, input);
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
    return extractReplicateImageUrl(output);
  }

  static isTerminalStatus(status: ReplicatePredictionStatus): boolean {
    return status === 'succeeded' || status === 'failed' || status === 'canceled' || status === 'aborted';
  }

  static isRunningStatus(status: ReplicatePredictionStatus): boolean {
    return status === 'starting' || status === 'processing';
  }
}
