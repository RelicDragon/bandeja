import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { config } from '../../config/env';
import OpenAI from 'openai';

const openai = config.openai.apiKey ? new OpenAI({
  apiKey: config.openai.apiKey,
}) : null;

export class TranslationService {
  static extractLanguageCode(locale: string | null | undefined): string {
    if (!locale || locale === 'auto') {
      return 'en';
    }
    const parts = locale.split('-');
    return parts[0]?.toLowerCase() || 'en';
  }

  static async getTranslationFromChatGPT(text: string, targetLanguage: string): Promise<string> {
    if (!openai) {
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    }

    if (!text || !text.trim()) {
      throw new ApiError(400, 'Text to translate is required');
    }

    const languageNames: Record<string, string> = {
      'en': 'English',
      'ru': 'Russian',
      'sr': 'Serbian',
      'es': 'Spanish',
      'fr': 'French',
      'de': 'German',
      'it': 'Italian',
      'pt': 'Portuguese',
      'nl': 'Dutch',
      'pl': 'Polish',
      'cs': 'Czech',
      'sk': 'Slovak',
      'hr': 'Croatian',
      'bg': 'Bulgarian',
      'ro': 'Romanian',
      'hu': 'Hungarian',
      'el': 'Greek',
      'tr': 'Turkish',
      'ar': 'Arabic',
      'zh': 'Chinese',
      'ja': 'Japanese',
      'ko': 'Korean',
    };

    const targetLanguageName = languageNames[targetLanguage] || targetLanguage;

    try {
      const response = await openai.chat.completions.create({
        model: 'gpt-5-mini',
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text to ${targetLanguageName}. Provide only the translation without any additional text, explanations, or formatting.`,
          },
          {
            role: 'user',
            content: text,
          },
        ],
        temperature: 0.3,
        max_tokens: 500,
      });

      const translation = response.choices[0]?.message?.content?.trim();
      if (!translation) {
        throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
      }

      return translation;
    } catch (error: any) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('ChatGPT translation error:', error);
      // Return 503 Service Unavailable for translation service errors
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    }
  }

  static async getOrCreateTranslation(
    messageId: string,
    languageCode: string,
    userId: string,
    messageContent: string
  ): Promise<{ translation: string; languageCode: string }> {
    if (!messageContent || !messageContent.trim()) {
      throw new ApiError(400, 'Message content is required for translation');
    }

    const normalizedLanguageCode = languageCode.toLowerCase();

    const existingTranslation = await prisma.messageTranslation.findUnique({
      where: {
        messageId_languageCode: {
          messageId,
          languageCode: normalizedLanguageCode,
        },
      },
    });

    if (existingTranslation) {
      return {
        translation: existingTranslation.translation,
        languageCode: existingTranslation.languageCode,
      };
    }

    const translation = await this.getTranslationFromChatGPT(messageContent, normalizedLanguageCode);

    const savedTranslation = await prisma.messageTranslation.create({
      data: {
        messageId,
        languageCode: normalizedLanguageCode,
        translation,
        createdBy: userId,
      },
    });

    return {
      translation: savedTranslation.translation,
      languageCode: savedTranslation.languageCode,
    };
  }
}
