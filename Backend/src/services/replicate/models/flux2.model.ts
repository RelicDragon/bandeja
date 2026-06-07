import type { InternalPhotoInput, ReplicateImageModelAdapter } from './replicateImageModel.types';
import { createReplicatePrediction } from './replicatePredictionClient';
import { extractReplicateImageUrl } from './extractReplicateImageOutput';

export const FLUX_2_MAX_MODEL_ID = 'black-forest-labs/flux-2-max';
export const FLUX_2_PRO_MODEL_ID = 'black-forest-labs/flux-2-pro';

export type Flux2Input = {
  prompt: string;
  input_images?: string[];
  aspect_ratio?: string;
  resolution?: string;
  output_format?: string;
  output_quality?: number;
};

function buildFlux2Input(internal: InternalPhotoInput): Flux2Input {
  return {
    prompt: internal.prompt,
    input_images: internal.input_images ?? [],
    aspect_ratio: internal.aspect_ratio ?? '4:5',
    resolution: internal.resolution ?? '1 MP',
    output_format: internal.output_format ?? 'webp',
    output_quality: internal.output_quality ?? 80,
  };
}

function createFlux2ModelAdapter(modelId: string): ReplicateImageModelAdapter<Flux2Input> {
  return {
    modelId,
    buildInput: buildFlux2Input,
    createPrediction: (input) => createReplicatePrediction(modelId, input),
    extractOutputImageUrl: extractReplicateImageUrl,
  };
}

export const flux2MaxModel = createFlux2ModelAdapter(FLUX_2_MAX_MODEL_ID);
export const flux2ProModel = createFlux2ModelAdapter(FLUX_2_PRO_MODEL_ID);

export const buildFlux2MaxInput = buildFlux2Input;
export const buildFlux2ProInput = buildFlux2Input;
