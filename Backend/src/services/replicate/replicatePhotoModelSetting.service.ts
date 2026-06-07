import prisma from '../../config/database';
import { config } from '../../config/env';
import {
  REPLICATE_PHOTO_MODEL_IDS,
  type ReplicatePhotoModelId,
  isReplicatePhotoModelId,
  resolveReplicatePhotoModelId,
} from './models/replicateImageModel.selector';

const SETTING_ID = 'default';

export class ReplicatePhotoModelSettingService {
  static listModels(): readonly ReplicatePhotoModelId[] {
    return REPLICATE_PHOTO_MODEL_IDS;
  }

  static envFallbackModelId(): string {
    return config.resultsArtifacts.replicateModel.trim() || 'black-forest-labs/flux-2-max';
  }

  static async getActiveModelId(): Promise<ReplicatePhotoModelId> {
    const row = await prisma.resultsArtifactSetting.findUnique({
      where: { id: SETTING_ID },
      select: { replicatePhotoModel: true },
    });
    return resolveReplicatePhotoModelId(
      row?.replicatePhotoModel,
      this.envFallbackModelId()
    );
  }

  static async setActiveModelId(modelId: string): Promise<ReplicatePhotoModelId> {
    if (!isReplicatePhotoModelId(modelId)) {
      throw new Error(`Unsupported Replicate photo model: ${modelId}`);
    }
    await prisma.resultsArtifactSetting.upsert({
      where: { id: SETTING_ID },
      create: { id: SETTING_ID, replicatePhotoModel: modelId },
      update: { replicatePhotoModel: modelId },
    });
    return modelId;
  }
}
