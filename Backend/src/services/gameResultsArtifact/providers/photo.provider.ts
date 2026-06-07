import {
  ReplicateImageService,
  type ReplicatePredictionRecord,
} from '../../replicate/replicateImage.service';
import type { InternalPhotoInput } from '../../replicate/models/replicateImageModel.types';
import {
  getReplicateImageModel,
  isReplicatePhotoModelId,
  type ReplicatePhotoModelId,
} from '../../replicate/models/replicateImageModel.selector';
import { ReplicatePhotoModelSettingService } from '../../replicate/replicatePhotoModelSetting.service';
import { ResultsTelegramService } from '../../telegram/results-telegram.service';
import { downloadAvatarAsDataUri } from '../gameResultsArtifact.avatarInput';
import {
  buildResultsPhotoPrompt,
  getRankedPhotoParticipants,
  loadGameForResultsPhoto,
  type PhotoParticipantSlot,
} from '../gameResultsArtifact.photoContext';
import { pickResultsPhotoStyle } from '../gameResultsArtifact.photoStyles';
import { logResultsArtifact } from '../gameResultsArtifact.log';

export type PhotoBuildResult = {
  input: InternalPhotoInput;
  modelId: string;
  styleId: string;
  family: string;
};

export class PhotoProvider {
  static isConfigured(): boolean {
    return ReplicateImageService.isConfigured();
  }

  private static async avatarSlotsToDataUris(
    slots: PhotoParticipantSlot[]
  ): Promise<{ uris: string[]; loadedBySlotIndex: boolean[] }> {
    const uris: string[] = [];
    const loadedBySlotIndex: boolean[] = [];
    let requestedWithAvatar = 0;

    for (const slot of slots) {
      if (!slot.avatarSources) {
        loadedBySlotIndex.push(false);
        continue;
      }
      requestedWithAvatar += 1;
      const uri = await downloadAvatarAsDataUri(slot.avatarSources, (url) =>
        ResultsTelegramService.downloadImageAsBuffer(url)
      );
      if (uri) {
        uris.push(uri);
        loadedBySlotIndex.push(true);
      } else {
        loadedBySlotIndex.push(false);
      }
    }

    if (requestedWithAvatar > 0 && uris.length < requestedWithAvatar) {
      console.warn(
        JSON.stringify({
          scope: 'results-artifacts',
          at: new Date().toISOString(),
          step: 'photo-avatars',
          status: 'partial',
          requested: requestedWithAvatar,
          loaded: uris.length,
        })
      );
    }

    return { uris, loadedBySlotIndex };
  }

  static async resolveModelId(jobModelId?: string | null): Promise<ReplicatePhotoModelId> {
    const trimmed = jobModelId?.trim();
    if (trimmed && isReplicatePhotoModelId(trimmed)) return trimmed;
    return ReplicatePhotoModelSettingService.getActiveModelId();
  }

  static async buildPhotoInput(
    gameId: string,
    generationVersion: number,
    modelId?: string | null
  ): Promise<PhotoBuildResult | null> {
    const game = await loadGameForResultsPhoto(gameId);
    if (!game) return null;
    const resolvedModelId = await this.resolveModelId(modelId);
    const style = pickResultsPhotoStyle(`${gameId}:${generationVersion}`);
    const slots = getRankedPhotoParticipants(game);
    const { uris: input_images, loadedBySlotIndex } =
      await this.avatarSlotsToDataUris(slots);
    logResultsArtifact({
      gameId,
      generationVersion,
      step: 'photo-style',
      provider: 'replicate',
      status: 'picked',
      styleId: style.id,
      family: style.family,
      replicateModel: resolvedModelId,
    });
    return {
      input: {
        prompt: buildResultsPhotoPrompt(game, style, slots, loadedBySlotIndex),
        input_images,
        aspect_ratio: '4:5',
        resolution: '1 MP',
        output_format: 'webp',
      },
      modelId: resolvedModelId,
      styleId: style.id,
      family: style.family,
    };
  }

  /** @deprecated Use buildPhotoInput */
  static async buildFluxInput(
    gameId: string,
    generationVersion: number
  ): Promise<{ input: InternalPhotoInput; styleId: string; family: string } | null> {
    const built = await this.buildPhotoInput(gameId, generationVersion);
    if (!built) return null;
    return {
      input: built.input,
      styleId: built.styleId,
      family: built.family,
    };
  }

  static async startPrediction(
    gameId: string,
    generationVersion: number,
    modelId?: string | null
  ): Promise<ReplicatePredictionRecord & { modelId: string }> {
    const built = await this.buildPhotoInput(gameId, generationVersion, modelId);
    if (!built) {
      throw new Error('Game not found');
    }
    const prediction = await ReplicateImageService.createPhotoPrediction(
      built.modelId,
      built.input
    );
    return { ...prediction, modelId: built.modelId };
  }

  static async getPrediction(predictionId: string): Promise<ReplicatePredictionRecord> {
    return ReplicateImageService.getPrediction(predictionId);
  }

  static async downloadOutputBuffer(
    prediction: ReplicatePredictionRecord,
    modelId?: string | null
  ): Promise<Buffer> {
    const adapter = modelId ? getReplicateImageModel(modelId) : null;
    const url =
      adapter?.extractOutputImageUrl(prediction.output) ??
      ReplicateImageService.extractOutputImageUrl(prediction.output);
    if (!url) {
      throw new Error('Replicate prediction has no image output');
    }
    return ResultsTelegramService.downloadImageAsBuffer(url);
  }
}
