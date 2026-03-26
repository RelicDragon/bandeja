import prisma from '../../config/database';
import { ApiError } from '../../utils/ApiError';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON } from '../ai/llmReasons';
import { translationMatchesTargetFranc } from './translationFrancCheck';
import { MESSAGE_TRANSLATION_PENDING } from './translationPending';
import { normalizeTranslationOutput } from './translationOutputNormalize';

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

const TRANSLATION_POLL_MS = 125;
const TRANSLATION_FOLLOWER_MAX_WAIT_MS = 15_000;
const TRANSLATION_CLAIM_MAX_PASSES = 16;

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

    const buildSystemPrompt = (llmAttemptIndex: number) => {
      const lines = [
        `You are a professional translator.`,
        `Translate into ${targetLanguageName} only.`,
        `No preambles (e.g. "Here is the translation"), no quotes around the result, no notes in English or any other language.`,
        `Keep proper names, @handles, URLs, numbers, and emojis unchanged unless they must be localized.`,
        `Output only the translated text, with no extra labels or formatting.`,
        `The entire reply must be in ${targetLanguageName}; no other natural language.`,
      ];
      if (llmAttemptIndex > 0) {
        lines.push(
          `Your previous answer failed an automatic ${targetLanguageName} check. Respond again with the complete text only in ${targetLanguageName}: no other language, preamble, markdown fences, or surrounding quotes.`
        );
      }
      return lines.join(' ');
    };

    try {
      for (let attempt = 0; attempt < 2; attempt++) {
        console.info('[translation] llm_request', {
          attempt,
          targetLanguage,
          sourceChars: text.length,
          userId: userId ?? null,
        });
        const raw = await ai.createCompletion({
          messages: [
            {
              role: 'system',
              content: buildSystemPrompt(attempt),
            },
            { role: 'user', content: text },
          ],
          temperature: 0.1,
          max_tokens: 1500,
          reason: LLM_REASON.MESSAGE_TRANSLATION,
          userId,
        });
        console.info('[translation] llm_response', {
          attempt,
          targetLanguage,
          rawChars: typeof raw === 'string' ? raw.length : 0,
        });
        const normalized = normalizeTranslationOutput(raw);
        if (!normalized) {
          console.info('[translation] normalize_empty', { attempt, targetLanguage });
          if (attempt === 0) {
            console.info('[translation] retry', { reason: 'empty_after_normalize', nextAttempt: 1 });
            continue;
          }
          throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
        }
        console.info('[translation] normalized', {
          attempt,
          targetLanguage,
          outChars: normalized.length,
        });
        const checkOk = await translationMatchesTargetFranc(normalized, targetLanguage, {
          llmAttempt: attempt,
        });
        if (checkOk) {
          console.info('[translation] done', { attempt, targetLanguage, outChars: normalized.length });
          return normalized;
        }
        if (attempt === 0) {
          console.info('[translation] retry', { reason: 'lang_check_failed', nextAttempt: 1, targetLanguage });
        }
      }
      console.info('[translation] exhausted_retries', { targetLanguage });
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    } catch (error: unknown) {
      if (error instanceof ApiError) {
        throw error;
      }
      console.error('Translation error:', error);
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    }
  }

  private static async waitForPendingTranslationRow(
    messageId: string,
    languageCode: string
  ): Promise<
    | { status: 'ready'; translation: string; languageCode: string }
    | { status: 'gone' }
    | { status: 'timeout' }
  > {
    const deadline = Date.now() + TRANSLATION_FOLLOWER_MAX_WAIT_MS;
    while (Date.now() < deadline) {
      const row = await prisma.messageTranslation.findUnique({
        where: {
          messageId_languageCode: {
            messageId,
            languageCode,
          },
        },
      });
      if (!row) {
        return { status: 'gone' };
      }
      if (row.translation !== MESSAGE_TRANSLATION_PENDING) {
        return {
          status: 'ready',
          translation: row.translation,
          languageCode: row.languageCode,
        };
      }
      await new Promise((r) => setTimeout(r, TRANSLATION_POLL_MS));
    }
    return { status: 'timeout' };
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

    for (let pass = 0; pass < TRANSLATION_CLAIM_MAX_PASSES; pass++) {
      const existingTranslation = await prisma.messageTranslation.findUnique({
        where: {
          messageId_languageCode: {
            messageId,
            languageCode: normalizedLanguageCode,
          },
        },
      });

      if (existingTranslation && existingTranslation.translation !== MESSAGE_TRANSLATION_PENDING) {
        return {
          translation: existingTranslation.translation,
          languageCode: existingTranslation.languageCode,
        };
      }

      const claim = await prisma.messageTranslation.createMany({
        data: [
          {
            messageId,
            languageCode: normalizedLanguageCode,
            translation: MESSAGE_TRANSLATION_PENDING,
            createdBy: userId,
          },
        ],
        skipDuplicates: true,
      });

      if (claim.count === 1) {
        try {
          const translation = await this.getTranslationFromChatGPT(
            messageContent,
            normalizedLanguageCode,
            userId
          );
          await prisma.messageTranslation.update({
            where: {
              messageId_languageCode: {
                messageId,
                languageCode: normalizedLanguageCode,
              },
            },
            data: { translation },
          });
          return {
            translation,
            languageCode: normalizedLanguageCode,
          };
        } catch (error) {
          await prisma.messageTranslation.deleteMany({
            where: {
              messageId,
              languageCode: normalizedLanguageCode,
              translation: MESSAGE_TRANSLATION_PENDING,
            },
          });
          throw error;
        }
      }

      const waited = await this.waitForPendingTranslationRow(messageId, normalizedLanguageCode);
      if (waited.status === 'ready') {
        return {
          translation: waited.translation,
          languageCode: waited.languageCode,
        };
      }
      if (waited.status === 'gone') {
        continue;
      }

      const afterWait = await prisma.messageTranslation.findUnique({
        where: {
          messageId_languageCode: {
            messageId,
            languageCode: normalizedLanguageCode,
          },
        },
      });
      if (afterWait && afterWait.translation !== MESSAGE_TRANSLATION_PENDING) {
        return {
          translation: afterWait.translation,
          languageCode: afterWait.languageCode,
        };
      }

      await prisma.messageTranslation.deleteMany({
        where: {
          messageId,
          languageCode: normalizedLanguageCode,
          translation: MESSAGE_TRANSLATION_PENDING,
          createdAt: { lt: new Date(Date.now() - 120_000) },
        },
      });

      const afterStale = await prisma.messageTranslation.findUnique({
        where: {
          messageId_languageCode: {
            messageId,
            languageCode: normalizedLanguageCode,
          },
        },
      });
      if (afterStale && afterStale.translation !== MESSAGE_TRANSLATION_PENDING) {
        return {
          translation: afterStale.translation,
          languageCode: afterStale.languageCode,
        };
      }
    }

    throw new ApiError(503, 'Translation timed out. Please try again in a moment.');
  }
}
