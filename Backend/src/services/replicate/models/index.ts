export type {
  InternalPhotoInput,
  ReplicateImageModelAdapter,
} from './replicateImageModel.types';
export { mapAspectRatioToGptImage2, type GptImage2AspectRatio } from './aspectRatioMapping';
export {
  FLUX_2_MAX_MODEL_ID,
  FLUX_2_PRO_MODEL_ID,
  buildFlux2MaxInput,
  buildFlux2ProInput,
  flux2MaxModel,
  flux2ProModel,
  type Flux2Input,
} from './flux2.model';
export {
  NANO_BANANA_2_MODEL_ID,
  buildNanoBanana2Input,
  createNanoBanana2Prediction,
  nanoBanana2Model,
  type NanoBanana2Input,
} from './nanoBanana2.model';
export {
  GPT_IMAGE_2_MODEL_ID,
  buildGptImage2Input,
  createGptImage2Prediction,
  gptImage2Model,
  type GptImage2Input,
} from './gptImage2.model';
export { extractReplicateImageUrl } from './extractReplicateImageOutput';
export {
  REPLICATE_PHOTO_MODEL_IDS,
  getReplicateImageModel,
  isReplicatePhotoModelId,
  resolveReplicatePhotoModelId,
  type ReplicatePhotoModelId,
} from './replicateImageModel.selector';

import { flux2MaxModel } from './flux2.model';
import { flux2ProModel } from './flux2.model';
import { nanoBanana2Model } from './nanoBanana2.model';
import { gptImage2Model } from './gptImage2.model';

export const replicateImageModels = {
  [flux2MaxModel.modelId]: flux2MaxModel,
  [flux2ProModel.modelId]: flux2ProModel,
  [nanoBanana2Model.modelId]: nanoBanana2Model,
  [gptImage2Model.modelId]: gptImage2Model,
} as const;
