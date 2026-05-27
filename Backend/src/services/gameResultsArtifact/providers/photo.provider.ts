import {
  ReplicateImageService,
  type Flux2MaxInput,
  type ReplicatePredictionRecord,
} from '../../replicate/replicateImage.service';
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

export type PhotoFluxBuildResult = {
  input: Flux2MaxInput;
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

  static async buildFluxInput(
    gameId: string,
    generationVersion: number
  ): Promise<PhotoFluxBuildResult | null> {
    const game = await loadGameForResultsPhoto(gameId);
    if (!game) return null;
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
    });
    return {
      input: {
        prompt: buildResultsPhotoPrompt(game, style, slots, loadedBySlotIndex),
        input_images,
        aspect_ratio: '4:5',
        resolution: '1 MP',
        output_format: 'webp',
      },
      styleId: style.id,
      family: style.family,
    };
  }

  static async startPrediction(
    gameId: string,
    generationVersion: number
  ): Promise<ReplicatePredictionRecord> {
    const built = await this.buildFluxInput(gameId, generationVersion);
    if (!built) {
      throw new Error('Game not found');
    }
    return ReplicateImageService.createFlux2MaxPrediction(built.input);
  }

  static async getPrediction(predictionId: string): Promise<ReplicatePredictionRecord> {
    return ReplicateImageService.getPrediction(predictionId);
  }

  static async downloadOutputBuffer(
    prediction: ReplicatePredictionRecord
  ): Promise<Buffer> {
    const url = ReplicateImageService.extractOutputImageUrl(prediction.output);
    if (!url) {
      throw new Error('Replicate prediction has no image output');
    }
    return ResultsTelegramService.downloadImageAsBuffer(url);
  }
}
