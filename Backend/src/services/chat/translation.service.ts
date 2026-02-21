import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON } from '../ai/llmReasons';

export const TRANSLATION_LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian',
  es: 'Spanish',
  fr: 'French',
  de: 'German',
  it: 'Italian',
  pt: 'Portuguese',
  nl: 'Dutch',
  pl: 'Polish',
  cs: 'Czech',
  sk: 'Slovak',
  hr: 'Croatian',
  bg: 'Bulgarian',
  ro: 'Romanian',
  hu: 'Hungarian',
  el: 'Greek',
  tr: 'Turkish',
  ar: 'Arabic',
  zh: 'Chinese',
  ja: 'Japanese',
  ko: 'Korean',
};

export const TRANSLATE_TO_LANGUAGE_CODES = Object.keys(TRANSLATION_LANGUAGE_NAMES);

export class TranslationService {
  static extractLanguageCode(locale: string | null | undefined): string {
    if (!locale || locale === 'auto') {
      return 'en';
    }
    const parts = locale.split('-');
    return parts[0]?.toLowerCase() || 'en';
  }

  static async getTranslationFromChatGPT(
    text: string,
    targetLanguage: string,
    userId?: string
  ): Promise<string> {
    const ai = getAiService();
    if (!ai.isConfigured()) {
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    }

    if (!text || !text.trim()) {
      throw new ApiError(400, 'Text to translate is required');
    }

    const targetLanguageName = TRANSLATION_LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    try {
      const translation = await ai.createCompletion({
        messages: [
          {
            role: 'system',
            content: `You are a professional translator. Translate the following text to ${targetLanguageName}. Provide only the translation without any additional text, explanations, or formatting.`,
          },
          { role: 'user', content: text },
        ],
        temperature: 0.3,
        max_tokens: 1500,
        reason: LLM_REASON.MESSAGE_TRANSLATION,
        userId,
      });
      return translation;
    } catch (error: any) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('Translation error:', error);
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

    const translation = await this.getTranslationFromChatGPT(
      messageContent,
      normalizedLanguageCode,
      userId
    );

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
