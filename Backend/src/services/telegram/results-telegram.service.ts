import { Api } from 'grammy';
import { InputFile } from 'grammy';
import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { config } from '../../config/env';
import { LLM_REASON } from '../ai/llmReasons';
import { escapeHTML, trimTextForTelegram } from './utils';
import { generateResultsSummary } from '../gameResultsArtifact/resultsSummary.service';

export class ResultsTelegramService {
  static checkResultsEntered(game: any): boolean {
    if (!game.rounds || game.rounds.length === 0) {
      return false;
    }

    return game.rounds.some((round: any) =>
      round.matches && round.matches.some((match: any) =>
        match.sets && match.sets.some((set: any) =>
          set.teamAScore > 0 || set.teamBScore > 0
        )
      )
    );
  }

  static async generateResultsSummary(
    game: any,
    language: string,
    initiatedByUserId?: string
  ): Promise<string> {
    return generateResultsSummary(game, language, {
      reason: LLM_REASON.TELEGRAM_RESULTS,
      initiatedByUserId,
    });
  }

  static async getMainPhotoUrl(game: { mainPhotoId?: string | null }): Promise<string | null> {
    const { GamePhotoReadService } = await import('../gamePhoto/gamePhoto.read.service');
    return GamePhotoReadService.getMainPhotoUrl(game);
  }

  static async downloadImageAsBuffer(imageUrl: string): Promise<Buffer> {
    try {
      let fullUrl = imageUrl;
      if (imageUrl.startsWith('/')) {
        const cloudFrontDomain = config.aws.cloudFrontDomain;
        if (cloudFrontDomain) {
          fullUrl = `https://${cloudFrontDomain}${imageUrl}`;
        } else {
          fullUrl = `${config.frontendUrl}${imageUrl}`;
        }
      }

      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 30000);

      try {
        const response = await fetch(fullUrl, {
          signal: controller.signal,
        });

        clearTimeout(timeoutId);

        if (!response.ok) {
          throw new Error(`Failed to download image: ${response.statusText}`);
        }

        const arrayBuffer = await response.arrayBuffer();
        return Buffer.from(arrayBuffer);
      } catch (error: any) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
          throw new Error('Request timeout');
        }
        throw error;
      }
    } catch (error: any) {
      console.error('Failed to download image:', error);
      throw new ApiError(500, 'Failed to download image');
    }
  }

  static async sendResultsToTelegram(
    api: Api,
    gameId: string,
    resultsImageBuffer: Buffer,
    mainPhotoUrl: string | null,
    summaryText: string
  ): Promise<void> {
    const game = await prisma.game.findUnique({
      where: { id: gameId },
      include: {
        city: {
          select: {
            telegramGroupId: true,
          },
        },
      },
    });

    if (!game) {
      throw new ApiError(404, 'Game not found');
    }

    if (!game.city.telegramGroupId) {
      throw new ApiError(400, 'City does not have a Telegram group configured');
    }

    const chatId = game.city.telegramGroupId;

    try {
      const resultsImageFile = new InputFile(resultsImageBuffer, 'results.jpg');

      const escapedSummary = escapeHTML(summaryText);

      if (escapedSummary.length > 1024) {
        if (mainPhotoUrl) {
          try {
            const mainPhotoBuffer = await this.downloadImageAsBuffer(mainPhotoUrl);
            const mainPhotoFile = new InputFile(mainPhotoBuffer, 'main-photo.jpg');

            await api.sendMediaGroup(chatId, [
              {
                type: 'photo',
                media: resultsImageFile,
              },
              {
                type: 'photo',
                media: mainPhotoFile,
              },
            ]);
          } catch (photoError: any) {
            console.warn('Failed to download main photo, sending results only:', photoError);
            await api.sendPhoto(chatId, resultsImageFile);
          }
        } else {
          await api.sendPhoto(chatId, resultsImageFile);
        }

        const trimmedText = trimTextForTelegram(escapedSummary, false);
        await api.sendMessage(chatId, trimmedText, {
          parse_mode: 'HTML',
        });
      } else {
        const finalCaption = escapedSummary;

        if (mainPhotoUrl) {
          try {
            const mainPhotoBuffer = await this.downloadImageAsBuffer(mainPhotoUrl);
            const mainPhotoFile = new InputFile(mainPhotoBuffer, 'main-photo.jpg');

            await api.sendMediaGroup(chatId, [
              {
                type: 'photo',
                media: resultsImageFile,
                caption: finalCaption,
                parse_mode: 'HTML',
              },
              {
                type: 'photo',
                media: mainPhotoFile,
              },
            ]);
          } catch (photoError: any) {
            console.warn('Failed to download main photo, sending results only:', photoError);
            await api.sendPhoto(chatId, resultsImageFile, {
              caption: finalCaption,
              parse_mode: 'HTML',
            });
          }
        } else {
          await api.sendPhoto(chatId, resultsImageFile, {
            caption: finalCaption,
            parse_mode: 'HTML',
          });
        }
      }

      await prisma.game.update({
        where: { id: gameId },
        data: {
          resultsSentToTelegram: true,
          telegramResultsSummary: summaryText,
        },
      });
    } catch (error: any) {
      console.error('Failed to send results to Telegram:', error);
      throw new ApiError(500, `Failed to send results to Telegram: ${error.message}`);
    }
  }
}
