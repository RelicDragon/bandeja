import type { InternalPhotoInput, ReplicateImageModelAdapter } from './replicateImageModel.types';
import { createReplicatePrediction } from './replicatePredictionClient';
import { extractReplicateImageUrl } from './extractReplicateImageOutput';

export const NANO_BANANA_2_MODEL_ID = 'google/nano-banana-2';
export const NANO_BANANA_2_MAX_IMAGE_INPUT = 14;

export type NanoBanana2AspectRatio =
  | 'match_input_image'
  | '1:1'
  | '1:4'
  | '1:8'
  | '2:3'
  | '3:2'
  | '3:4'
  | '4:1'
  | '4:3'
  | '4:5'
  | '5:4'
  | '8:1'
  | '9:16'
  | '16:9'
  | '21:9';

export type NanoBanana2Resolution = '1K' | '2K' | '4K';
export type NanoBanana2OutputFormat = 'jpg' | 'png';

export type NanoBanana2Input = {
  prompt: string;
  image_input?: string[];
  aspect_ratio?: NanoBanana2AspectRatio;
  resolution?: NanoBanana2Resolution;
  output_format?: NanoBanana2OutputFormat;
  google_search?: boolean;
  image_search?: boolean;
};

const SUPPORTED_ASPECT_RATIOS = new Set<string>([
  'match_input_image',
  '1:1',
  '1:4',
  '1:8',
  '2:3',
  '3:2',
  '3:4',
  '4:1',
  '4:3',
  '4:5',
  '5:4',
  '8:1',
  '9:16',
  '16:9',
  '21:9',
]);

const FLUX_TO_NANO_RESOLUTION: Record<string, NanoBanana2Resolution> = {
  '0.5 MP': '1K',
  '1 MP': '1K',
  '2 MP': '2K',
  '4 MP': '4K',
};

function normalizeAspectRatio(ratio: string | undefined): NanoBanana2AspectRatio {
  if (ratio && SUPPORTED_ASPECT_RATIOS.has(ratio)) {
    return ratio as NanoBanana2AspectRatio;
  }
  return '4:5';
}

function normalizeResolution(resolution: string | undefined): NanoBanana2Resolution {
  if (resolution === '1K' || resolution === '2K' || resolution === '4K') {
    return resolution;
  }
  return FLUX_TO_NANO_RESOLUTION[resolution ?? ''] ?? '1K';
}

function normalizeOutputFormat(format: string | undefined): NanoBanana2OutputFormat {
  if (format === 'png') return 'png';
  return 'jpg';
}

export function buildNanoBanana2Input(internal: InternalPhotoInput): NanoBanana2Input {
  return {
    prompt: internal.prompt,
    image_input: (internal.input_images ?? []).slice(0, NANO_BANANA_2_MAX_IMAGE_INPUT),
    aspect_ratio: normalizeAspectRatio(internal.aspect_ratio),
    resolution: normalizeResolution(internal.resolution),
    output_format: normalizeOutputFormat(internal.output_format),
    google_search: false,
    image_search: false,
  };
}

export async function createNanoBanana2Prediction(
  input: NanoBanana2Input
): Promise<Awaited<ReturnType<typeof createReplicatePrediction>>> {
  return createReplicatePrediction(NANO_BANANA_2_MODEL_ID, input);
}

export const nanoBanana2Model: ReplicateImageModelAdapter<NanoBanana2Input> = {
  modelId: NANO_BANANA_2_MODEL_ID,
  buildInput: buildNanoBanana2Input,
  createPrediction: createNanoBanana2Prediction,
  extractOutputImageUrl: extractReplicateImageUrl,
};
