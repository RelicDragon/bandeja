import type { ReplicatePredictionRecord } from '../replicateImage.service';

/** Shared photo payload built from game context (model-agnostic). */
export type InternalPhotoInput = {
  prompt: string;
  /** HTTPS URLs or `data:image/...;base64,...` data URIs. */
  input_images?: string[];
  aspect_ratio?: string;
  output_format?: string;
  /** FLUX-only; ignored by models that do not support it. */
  resolution?: string;
  /** FLUX-only; ignored by models that do not support it. */
  output_quality?: number;
};

export interface ReplicateImageModelAdapter<TModelInput extends Record<string, unknown>> {
  readonly modelId: string;
  buildInput(internal: InternalPhotoInput): TModelInput;
  createPrediction(input: TModelInput): Promise<ReplicatePredictionRecord>;
  extractOutputImageUrl(output: unknown): string | null;
}
