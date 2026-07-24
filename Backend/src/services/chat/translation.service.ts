import prisma from '../../config/database';
import { ChatSyncEventType, MESSAGE_TRANSLATION_PENDING } from '@bandeja/chat-contract';
import { ApiError } from '../../utils/ApiError';
import { ChatSyncEventService } from './chatSyncEvent.service';
import { getChatNotifier } from './chatNotifier';
import { getAiService } from '../ai/ai.service';
import { LLM_REASON, type LlmReason } from '../ai/llmReasons';
import { sourceAppearsToBeTargetLanguage, translationMatchesTargetFranc } from './translationFrancCheck';
import {
  isNoTranslationNeededMarker,
  NO_TRANSLATION_NEEDED_MARKER,
  normalizeTranslationOutput,
} from './translationOutputNormalize';
import { translationIsRedundantOfSource } from './translationRedundant';

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
    userId?: string,
    reason: LlmReason = LLM_REASON.MESSAGE_TRANSLATION,
  ): Promise<string> {
    if (!text || !text.trim()) {
      throw new ApiError(400, 'Text to translate is required');
    }

    if (await sourceAppearsToBeTargetLanguage(text, targetLanguage)) {
      const out = normalizeTranslationOutput(text);
      if (out) {
        console.info('[translation] skip_same_language', { targetLanguage, userId: userId ?? null });
        return out;
      }
    }

    const ai = getAiService();
    if (!ai.isConfigured()) {
      throw new ApiError(503, 'Translation service is temporarily unavailable. Please try again later.');
    }

    const targetLanguageName = TRANSLATION_LANGUAGE_NAMES[targetLanguage] || targetLanguage;

    const buildSystemPrompt = (llmAttemptIndex: number) => {
      const lines = [
        `You are a professional translator.`,
        `CRITICAL: If the source is already written in ${targetLanguageName}, or translating would only paraphrase/polish it, reply with exactly this token and nothing else: ${NO_TRANSLATION_NEEDED_MARKER}`,
        `Never rewrite, rephrase, correct, or "improve" text that is already ${targetLanguageName}.`,
        `Otherwise translate into ${targetLanguageName} only.`,
        `No preambles (e.g. "Here is the translation"), no quotes around the result, no notes in English or any other language.`,
        `Keep proper names, @handles, URLs, numbers, and emojis unchanged unless they must be localized.`,
        `Unless you reply with ${NO_TRANSLATION_NEEDED_MARKER}, output only the translated text in ${targetLanguageName}; no other natural language, labels, or formatting.`,
      ];
      if (llmAttemptIndex > 0) {
        lines.push(
          `Your previous answer failed an automatic ${targetLanguageName} check. Respond again with either exactly ${NO_TRANSLATION_NEEDED_MARKER} (source already ${targetLanguageName} — do not paraphrase) or the complete translation only in ${targetLanguageName}: no other language, preamble, markdown fences, or surrounding quotes.`
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
          temperature: 0,
          max_tokens: 4500,
          reason,
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
        if (isNoTranslationNeededMarker(normalized)) {
          const original = normalizeTranslationOutput(text);
          console.info('[translation] llm_no_translation_needed', {
            attempt,
            targetLanguage,
            sourceChars: original.length,
          });
          return original;
        }
        if (translationIsRedundantOfSource(text, normalized, targetLanguage)) {
          const original = normalizeTranslationOutput(text);
          console.info('[translation] llm_redundant_rewrite', {
            attempt,
            targetLanguage,
            sourceChars: original.length,
            outChars: normalized.length,
          });
          return original;
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

  static async removeTranslationRecord(
    messageId: string,
    languageCode: string
  ): Promise<void> {
    await prisma.messageTranslation.deleteMany({
      where: { messageId, languageCode: languageCode.toLowerCase() },
    });
  }

  static async discardRedundantTranslation(
    messageId: string,
    languageCode: string
  ): Promise<void> {
    const normalizedLanguageCode = languageCode.toLowerCase();
    await this.removeTranslationRecord(messageId, normalizedLanguageCode);

    const msgCtx = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true },
    });
    if (!msgCtx) {
      return;
    }

    let syncSeq: number | undefined;
    await prisma.$transaction(async (tx) => {
      syncSeq = await ChatSyncEventService.appendEventInTransaction(
        tx,
        msgCtx.chatContextType,
        msgCtx.contextId,
        ChatSyncEventType.MESSAGE_TRANSLATION_UPDATED,
        { messageId, languageCode: normalizedLanguageCode, removed: true }
      );
    });

    getChatNotifier().emitMessageTranslation(
      msgCtx.chatContextType,
      msgCtx.contextId,
      messageId,
      { languageCode: normalizedLanguageCode, translation: '', removed: true },
      syncSeq
    );
  }

  static async persistTranslation(
    messageId: string,
    normalizedLanguageCode: string,
    translation: string
  ): Promise<number | undefined> {
    let syncSeq: number | undefined;
    await prisma.$transaction(async (tx) => {
      await tx.messageTranslation.update({
        where: {
          messageId_languageCode: {
            messageId,
            languageCode: normalizedLanguageCode,
          },
        },
        data: { translation },
      });
      const msgCtx = await tx.chatMessage.findUnique({
        where: { id: messageId },
        select: { chatContextType: true, contextId: true },
      });
      if (msgCtx) {
        syncSeq = await ChatSyncEventService.appendEventInTransaction(
          tx,
          msgCtx.chatContextType,
          msgCtx.contextId,
          ChatSyncEventType.MESSAGE_TRANSLATION_UPDATED,
          { messageId, languageCode: normalizedLanguageCode, translation }
        );
      }
    });

    const msgCtx = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { chatContextType: true, contextId: true },
    });
    if (msgCtx) {
      getChatNotifier().emitMessageTranslation(
        msgCtx.chatContextType,
        msgCtx.contextId,
        messageId,
        { languageCode: normalizedLanguageCode, translation },
        syncSeq
      );
    }
    return syncSeq;
  }

  static async executeQueuedTranslation(
    messageId: string,
    languageCode: string,
    _source: string
  ): Promise<{ translation: string; languageCode: string }> {
    const normalizedLanguageCode = languageCode.toLowerCase();
    const existing = await prisma.messageTranslation.findUnique({
      where: {
        messageId_languageCode: { messageId, languageCode: normalizedLanguageCode },
      },
    });
    const message = await prisma.chatMessage.findUnique({
      where: { id: messageId },
      select: { content: true, senderId: true, messageType: true },
    });
    if (!message) {
      throw new ApiError(404, 'Message not found');
    }

    const { ChatAutoTranslateEnqueueService } = await import('./chatAutoTranslateEnqueue.service');
    let sourceText = message.content?.trim() ?? '';
    if (!sourceText) {
      sourceText = (await ChatAutoTranslateEnqueueService.resolveTranslatableText(messageId)) ?? '';
    }
    if (!sourceText) {
      throw new ApiError(400, 'Message has no text content to translate');
    }

    if (existing && existing.translation !== MESSAGE_TRANSLATION_PENDING) {
      if (translationIsRedundantOfSource(sourceText, existing.translation, normalizedLanguageCode)) {
        await this.discardRedundantTranslation(messageId, normalizedLanguageCode);
        return { translation: sourceText, languageCode: normalizedLanguageCode };
      }
      return {
        translation: existing.translation,
        languageCode: existing.languageCode,
      };
    }

    const userId = existing?.createdBy ?? message.senderId ?? '';
    const translation = await this.getTranslationFromChatGPT(
      sourceText,
      normalizedLanguageCode,
      userId || undefined
    );
    if (translationIsRedundantOfSource(sourceText, translation, normalizedLanguageCode)) {
      console.info('[translation] skip_redundant', {
        messageId,
        languageCode: normalizedLanguageCode,
      });
      await this.discardRedundantTranslation(messageId, normalizedLanguageCode);
      return { translation: sourceText, languageCode: normalizedLanguageCode };
    }
    await this.persistTranslation(messageId, normalizedLanguageCode, translation);
    return { translation, languageCode: normalizedLanguageCode };
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

    if (existingTranslation && existingTranslation.translation !== MESSAGE_TRANSLATION_PENDING) {
      if (
        translationIsRedundantOfSource(
          messageContent,
          existingTranslation.translation,
          normalizedLanguageCode
        )
      ) {
        await this.discardRedundantTranslation(messageId, normalizedLanguageCode);
        return {
          translation: messageContent,
          languageCode: normalizedLanguageCode,
        };
      }
      return {
        translation: existingTranslation.translation,
        languageCode: existingTranslation.languageCode,
      };
    }

    const { TranslationQueueService } = await import('./translationQueue.service');
    await TranslationQueueService.enqueue({
      messageId,
      languageCode: normalizedLanguageCode,
      userId,
      priority: 'high',
      source: 'manual',
    });
    void TranslationQueueService.drain();

    const waited = await this.waitForPendingTranslationRow(messageId, normalizedLanguageCode);
    if (waited.status === 'ready') {
      if (
        translationIsRedundantOfSource(messageContent, waited.translation, normalizedLanguageCode)
      ) {
        await this.discardRedundantTranslation(messageId, normalizedLanguageCode);
        return {
          translation: messageContent,
          languageCode: normalizedLanguageCode,
        };
      }
      return {
        translation: waited.translation,
        languageCode: waited.languageCode,
      };
    }

    if (waited.status === 'gone') {
      const job = await prisma.translationJob.findUnique({
        where: {
          messageId_languageCode: { messageId, languageCode: normalizedLanguageCode },
        },
        select: { status: true },
      });
      if (job?.status === 'done') {
        return {
          translation: messageContent,
          languageCode: normalizedLanguageCode,
        };
      }
    }

    throw new ApiError(503, 'Translation timed out. Please try again in a moment.');
  }
}
