import type { InternalPhotoInput, ReplicateImageModelAdapter } from './replicateImageModel.types';
import { mapAspectRatioToGptImage2 } from './aspectRatioMapping';
import { createReplicatePrediction } from './replicatePredictionClient';
import { extractReplicateImageUrl } from './extractReplicateImageOutput';

export const GPT_IMAGE_2_MODEL_ID = 'openai/gpt-image-2';

export type GptImage2Quality = 'low' | 'medium' | 'high' | 'auto';
export type GptImage2OutputFormat = 'webp' | 'png' | 'jpeg';
export type GptImage2Background = 'auto' | 'opaque';
export type GptImage2Moderation = 'auto' | 'low';

export type GptImage2Input = {
  prompt: string;
  input_images?: string[];
  aspect_ratio?: ReturnType<typeof mapAspectRatioToGptImage2>;
  quality?: GptImage2Quality;
  number_of_images?: number;
  output_format?: GptImage2OutputFormat;
  background?: GptImage2Background;
  moderation?: GptImage2Moderation;
};

const DEFAULT_QUALITY: GptImage2Quality = 'high';
const DEFAULT_OUTPUT_FORMAT: GptImage2OutputFormat = 'webp';

function normalizeOutputFormat(format: string | undefined): GptImage2OutputFormat {
  if (format === 'png' || format === 'jpeg' || format === 'webp') return format;
  return DEFAULT_OUTPUT_FORMAT;
}

export function buildGptImage2Input(internal: InternalPhotoInput): GptImage2Input {
  return {
    prompt: internal.prompt,
    input_images: internal.input_images ?? [],
    aspect_ratio: mapAspectRatioToGptImage2(internal.aspect_ratio),
    quality: DEFAULT_QUALITY,
    number_of_images: 1,
    output_format: normalizeOutputFormat(internal.output_format),
    background: 'auto',
    moderation: 'auto',
  };
}

export async function createGptImage2Prediction(
  input: GptImage2Input
): Promise<Awaited<ReturnType<typeof createReplicatePrediction>>> {
  return createReplicatePrediction(GPT_IMAGE_2_MODEL_ID, input);
}

export const gptImage2Model: ReplicateImageModelAdapter<GptImage2Input> = {
  modelId: GPT_IMAGE_2_MODEL_ID,
  buildInput: buildGptImage2Input,
  createPrediction: createGptImage2Prediction,
  extractOutputImageUrl: extractReplicateImageUrl,
};
