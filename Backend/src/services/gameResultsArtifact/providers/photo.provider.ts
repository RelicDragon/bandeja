import {
  ReplicateImageService,
  type Flux2MaxInput,
  type ReplicatePredictionRecord,
} from '../../replicate/replicateImage.service';
import { ResultsTelegramService } from '../../telegram/results-telegram.service';
import {
  downloadAvatarAsDataUri,
  type ParticipantAvatarSources,
} from '../gameResultsArtifact.avatarInput';
import {
  buildResultsPhotoPrompt,
  collectParticipantAvatarSources,
  loadGameForResultsPhoto,
} from '../gameResultsArtifact.photoContext';

export class PhotoProvider {
  static isConfigured(): boolean {
    return ReplicateImageService.isConfigured();
  }

  private static async avatarSourcesToDataUris(
    sources: ParticipantAvatarSources[]
  ): Promise<string[]> {
    const results = await Promise.all(
      sources.map((entry) =>
        downloadAvatarAsDataUri(entry, (url) =>
          ResultsTelegramService.downloadImageAsBuffer(url)
        )
      )
    );
    const uris = results.filter((uri): uri is string => uri !== null);
    if (sources.length > 0 && uris.length < sources.length) {
      console.warn(
        JSON.stringify({
          scope: 'results-artifacts',
          at: new Date().toISOString(),
          step: 'photo-avatars',
          status: 'partial',
          requested: sources.length,
          loaded: uris.length,
        })
      );
    }
    return uris;
  }

  static async buildFluxInput(gameId: string): Promise<Flux2MaxInput | null> {
    const game = await loadGameForResultsPhoto(gameId);
    if (!game) return null;
    const sources = collectParticipantAvatarSources(game);
    const input_images = await this.avatarSourcesToDataUris(sources);
    return {
      prompt: buildResultsPhotoPrompt(game),
      input_images,
      aspect_ratio: '4:5',
      resolution: '1 MP',
      output_format: 'webp',
    };
  }

  static async startPrediction(gameId: string): Promise<ReplicatePredictionRecord> {
    const input = await this.buildFluxInput(gameId);
    if (!input) {
      throw new Error('Game not found');
    }
    return ReplicateImageService.createFlux2MaxPrediction(input);
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
