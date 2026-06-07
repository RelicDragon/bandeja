import type { ReplicateImageModelAdapter } from './replicateImageModel.types';
import { flux2MaxModel, flux2ProModel } from './flux2.model';
import { gptImage2Model } from './gptImage2.model';
import { nanoBanana2Model } from './nanoBanana2.model';

export const REPLICATE_PHOTO_MODEL_IDS = [
  flux2MaxModel.modelId,
  flux2ProModel.modelId,
  nanoBanana2Model.modelId,
  gptImage2Model.modelId,
] as const;

export type ReplicatePhotoModelId = (typeof REPLICATE_PHOTO_MODEL_IDS)[number];

const modelById: Record<ReplicatePhotoModelId, ReplicateImageModelAdapter<Record<string, unknown>>> = {
  [flux2MaxModel.modelId]: flux2MaxModel,
  [flux2ProModel.modelId]: flux2ProModel,
  [nanoBanana2Model.modelId]: nanoBanana2Model,
  [gptImage2Model.modelId]: gptImage2Model,
};

export function isReplicatePhotoModelId(value: string): value is ReplicatePhotoModelId {
  return (REPLICATE_PHOTO_MODEL_IDS as readonly string[]).includes(value);
}

export function getReplicateImageModel(
  modelId: string
): ReplicateImageModelAdapter<Record<string, unknown>> {
  if (!isReplicatePhotoModelId(modelId)) {
    throw new Error(`Unsupported Replicate photo model: ${modelId}`);
  }
  return modelById[modelId];
}

export function resolveReplicatePhotoModelId(
  modelId: string | null | undefined,
  fallback: string
): ReplicatePhotoModelId {
  if (modelId && isReplicatePhotoModelId(modelId)) return modelId;
  if (isReplicatePhotoModelId(fallback)) return fallback;
  return flux2MaxModel.modelId;
}
