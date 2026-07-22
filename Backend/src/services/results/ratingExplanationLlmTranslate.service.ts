import prisma from '../../config/database';
import { getAiService } from '../ai/ai.service';
import { TranslationService } from '../chat/translation.service';
import type {
  RatingExplanationLlmResponse,
  StoredLlmRatingTranslation,
} from './ratingExplanationLlm.types';
import {
  normalizeTranslationLanguage,
  readExplanationBlob,
  toStoredEntry,
  updateExplanationBlob,
} from './ratingExplanationLlmStorage';

const PENDING_STALE_MS = 90_000;
const translateInFlight = new Set<string>();

function translateFlightKey(gameId: string, userId: string, language: string): string {
  return `tr:${gameId}:${userId}:${language}`;
}

function isPendingFresh(stored: { status: string; startedAt: string }): boolean {
  if (stored.status !== 'pending') return false;
  const started = Date.parse(stored.startedAt);
  if (Number.isNaN(started)) return false;
  return Date.now() - started < PENDING_STALE_MS;
}

async function loadOutcome(gameId: string, userId: string) {
  return prisma.gameOutcome.findUnique({
    where: { gameId_userId: { gameId, userId } },
    select: { id: true, metadata: true },
  });
}

async function mutateBlob(
  gameId: string,
  userId: string,
  updater: Parameters<typeof updateExplanationBlob>[2],
) {
  return updateExplanationBlob(
    () => loadOutcome(gameId, userId),
    async (id, metadata) => {
      await prisma.gameOutcome.update({ where: { id }, data: { metadata } });
    },
    updater,
  );
}

async function writeTranslation(
  gameId: string,
  userId: string,
  language: string,
  entry: StoredLlmRatingTranslation,
  options?: { onlyIfStartedAt?: string },
): Promise<boolean> {
  const saved = await mutateBlob(gameId, userId, (current) => {
    if (!current || current.source.status !== 'ready' || !current.source.text) {
      return null;
    }
    if (options?.onlyIfStartedAt) {
      const existing = current.translations[language];
      if (!existing || existing.startedAt !== options.onlyIfStartedAt) {
        return null;
      }
    }
    return {
      version: 2,
      source: current.source,
      translations: {
        ...current.translations,
        [language]: { ...toStoredEntry(entry), language },
      },
    };
  });
  return saved != null;
}

async function runTranslation(
  gameId: string,
  userId: string,
  language: string,
  sourceText: string,
  startedAt: string,
  initiatedByUserId?: string,
): Promise<void> {
  const key = translateFlightKey(gameId, userId, language);
  if (translateInFlight.has(key)) return;
  translateInFlight.add(key);

  const fail = async (error: string) => {
    await writeTranslation(
      gameId,
      userId,
      language,
      {
        status: 'failed',
        language,
        error,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { onlyIfStartedAt: startedAt },
    );
  };

  try {
    if (!getAiService().isConfigured()) {
      await fail('AI not configured');
      return;
    }

    const text = (
      await TranslationService.getTranslationFromChatGPT(
        sourceText,
        language,
        initiatedByUserId,
      )
    ).trim();

    if (!text) {
      await fail('Empty translation');
      return;
    }

    await writeTranslation(
      gameId,
      userId,
      language,
      {
        status: 'ready',
        language,
        text,
        startedAt,
        completedAt: new Date().toISOString(),
      },
      { onlyIfStartedAt: startedAt },
    );
  } catch (error: unknown) {
    console.error('[ratingExplanationLlm] translation failed', gameId, userId, language, error);
    await fail(error instanceof Error ? error.message : 'Translation failed');
  } finally {
    translateInFlight.delete(key);
  }
}

/**
 * Returns original or a stored translation of the original insight.
 * Never regenerates the rating explanation — only translates source text.
 */
export async function getOrStartRatingExplanationTranslation(
  gameId: string,
  userId: string,
  languageInput: string | undefined,
  initiatedByUserId?: string,
  options?: { retry?: boolean },
): Promise<RatingExplanationLlmResponse> {
  const language = normalizeTranslationLanguage(languageInput);
  const retry = Boolean(options?.retry);

  const outcome = await loadOutcome(gameId, userId);
  if (!outcome) return { status: 'skipped' };

  const blob = readExplanationBlob(outcome.metadata);
  if (!blob || blob.source.status !== 'ready' || !blob.source.text) {
    return { status: 'skipped' };
  }

  const sourceLanguage = blob.source.language;
  const sourceText = blob.source.text;

  if (language === sourceLanguage) {
    return {
      status: 'ready',
      text: sourceText,
      language: sourceLanguage,
      sourceLanguage,
      kind: 'original',
    };
  }

  const stored = blob.translations[language];

  if (!retry && stored?.status === 'ready' && stored.text) {
    return {
      status: 'ready',
      text: stored.text,
      language,
      sourceLanguage,
      kind: 'translation',
    };
  }

  if (!retry && stored?.status === 'failed') {
    return { status: 'failed', language, sourceLanguage, kind: 'translation' };
  }

  if (!retry && stored && isPendingFresh(stored)) {
    if (!translateInFlight.has(translateFlightKey(gameId, userId, language))) {
      void runTranslation(gameId, userId, language, sourceText, stored.startedAt, initiatedByUserId);
    }
    return { status: 'pending', language, sourceLanguage, kind: 'translation' };
  }

  if (!getAiService().isConfigured()) {
    return { status: 'unavailable', language, sourceLanguage, kind: 'translation' };
  }

  const startedAt = new Date().toISOString();
  const pending: StoredLlmRatingTranslation = {
    status: 'pending',
    language,
    startedAt,
  };

  const saved = await writeTranslation(gameId, userId, language, pending);
  if (!saved) return { status: 'skipped', language, sourceLanguage, kind: 'translation' };

  void runTranslation(gameId, userId, language, sourceText, startedAt, initiatedByUserId);
  return { status: 'pending', language, sourceLanguage, kind: 'translation' };
}

export function _resetRatingExplanationTranslateInFlightForTests(): void {
  translateInFlight.clear();
}
