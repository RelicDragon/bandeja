import { Prisma } from '@prisma/client';
import type {
  LlmRatingExplanationBlob,
  StoredLlmRatingExplanation,
  StoredLlmRatingTranslation,
} from './ratingExplanationLlm.types';

export const LLM_RATING_EXPLANATION_KEY = 'llmRatingExplanation';

/** Languages used when generating the original insight (app locales). */
export const SOURCE_LLM_RATING_LANGS = ['en', 'ru', 'sr', 'es', 'cs'] as const;

/** Mirrors TranslationService.TRANSLATE_TO_LANGUAGE_CODES (keep in sync). */
export const TRANSLATION_TARGET_LANGS = [
  'en',
  'ru',
  'sr',
  'es',
  'fr',
  'de',
  'it',
  'pt',
  'nl',
  'pl',
  'cs',
  'sk',
  'hr',
  'bg',
  'ro',
  'hu',
  'el',
  'tr',
  'ar',
  'zh',
  'ja',
  'ko',
] as const;

const BLOB_UPDATE_ATTEMPTS = 5;

export function normalizeSourceLanguage(language: string | undefined): string {
  const base = (language || 'en').split('-')[0].toLowerCase();
  if ((SOURCE_LLM_RATING_LANGS as readonly string[]).includes(base)) {
    return base;
  }
  return 'en';
}

export function normalizeTranslationLanguage(language: string | undefined): string {
  const base = (language || 'en').split('-')[0].toLowerCase();
  if ((TRANSLATION_TARGET_LANGS as readonly string[]).includes(base)) {
    return base;
  }
  return 'en';
}

export function readMetadataRecord(
  metadata: Prisma.JsonValue | null | undefined,
): Record<string, unknown> {
  if (metadata != null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    return { ...(metadata as Record<string, unknown>) };
  }
  return {};
}

function isStoredEntry(value: unknown): value is StoredLlmRatingExplanation {
  if (value == null || typeof value !== 'object' || Array.isArray(value)) return false;
  const obj = value as Record<string, unknown>;
  return (
    (obj.status === 'pending' || obj.status === 'ready' || obj.status === 'failed') &&
    typeof obj.language === 'string' &&
    typeof obj.startedAt === 'string'
  );
}

export function toStoredEntry(obj: StoredLlmRatingExplanation): StoredLlmRatingExplanation {
  return {
    status: obj.status,
    language: obj.language,
    text: typeof obj.text === 'string' ? obj.text : undefined,
    error: typeof obj.error === 'string' ? obj.error : undefined,
    startedAt: obj.startedAt,
    completedAt: typeof obj.completedAt === 'string' ? obj.completedAt : undefined,
  };
}

function toTranslationEntry(obj: StoredLlmRatingTranslation): StoredLlmRatingTranslation {
  return toStoredEntry(obj);
}

export function emptyExplanationBlob(source: StoredLlmRatingExplanation): LlmRatingExplanationBlob {
  return { version: 2, source: toStoredEntry(source), translations: {} };
}

function blobsEqual(a: LlmRatingExplanationBlob | null, b: LlmRatingExplanationBlob | null): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Reads v2 blob, or migrates legacy shapes:
 * - single Stored entry at key root
 * - per-language map of Stored entries (v1)
 */
export function readExplanationBlob(
  metadata: Prisma.JsonValue | null | undefined,
): LlmRatingExplanationBlob | null {
  const raw = readMetadataRecord(metadata)[LLM_RATING_EXPLANATION_KEY];
  if (raw == null || typeof raw !== 'object' || Array.isArray(raw)) {
    return null;
  }

  const obj = raw as Record<string, unknown>;

  if (obj.version === 2 && isStoredEntry(obj.source)) {
    const translations: Record<string, StoredLlmRatingTranslation> = {};
    const rawTr =
      obj.translations != null && typeof obj.translations === 'object' && !Array.isArray(obj.translations)
        ? (obj.translations as Record<string, unknown>)
        : {};
    for (const [lang, value] of Object.entries(rawTr)) {
      if (!isStoredEntry(value)) continue;
      translations[lang] = { ...toTranslationEntry(value), language: lang };
    }
    return {
      version: 2,
      source: toStoredEntry(obj.source),
      translations,
    };
  }

  if (isStoredEntry(obj)) {
    return emptyExplanationBlob(toStoredEntry(obj));
  }

  const entries: StoredLlmRatingExplanation[] = [];
  for (const [lang, value] of Object.entries(obj)) {
    if (lang === 'version' || lang === 'source' || lang === 'translations') continue;
    if (!isStoredEntry(value)) continue;
    entries.push({ ...toStoredEntry(value), language: lang });
  }
  if (entries.length === 0) return null;

  const ready = entries.find((e) => e.status === 'ready' && e.text);
  return emptyExplanationBlob(ready ?? entries[0]);
}

export function writeExplanationBlob(
  metadata: Prisma.JsonValue | null | undefined,
  blob: LlmRatingExplanationBlob,
): Prisma.InputJsonValue {
  const base = readMetadataRecord(metadata);
  base[LLM_RATING_EXPLANATION_KEY] = {
    version: 2,
    source: toStoredEntry(blob.source),
    translations: Object.fromEntries(
      Object.entries(blob.translations).map(([lang, entry]) => [
        lang,
        { ...toTranslationEntry(entry), language: lang },
      ]),
    ),
  };
  return base as Prisma.InputJsonValue;
}

export type ExplanationBlobUpdater = (
  current: LlmRatingExplanationBlob | null,
) => LlmRatingExplanationBlob | null;

/**
 * Optimistic merge with retry so concurrent source/translation writes do not clobber each other.
 */
export async function updateExplanationBlob(
  load: () => Promise<{ id: string; metadata: Prisma.JsonValue | null } | null>,
  persist: (id: string, metadata: Prisma.InputJsonValue) => Promise<void>,
  updater: ExplanationBlobUpdater,
): Promise<LlmRatingExplanationBlob | null> {
  for (let attempt = 0; attempt < BLOB_UPDATE_ATTEMPTS; attempt++) {
    const outcome = await load();
    if (!outcome) return null;

    const current = readExplanationBlob(outcome.metadata);
    const next = updater(current);
    if (next == null) return null;
    if (blobsEqual(current, next)) return next;

    await persist(outcome.id, writeExplanationBlob(outcome.metadata, next));

    const reloaded = await load();
    if (!reloaded) return null;
    const saved = readExplanationBlob(reloaded.metadata);
    if (blobsEqual(saved, next)) return saved;
  }
  return null;
}
