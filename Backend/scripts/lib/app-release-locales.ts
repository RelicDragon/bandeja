import { getAiService } from '../../src/services/ai/ai.service';
import { LLM_REASON } from '../../src/services/ai/llmReasons';
import type { ChatMessage } from '../../src/services/ai/types';
import { derivePlayShortDescription } from './app-release-notes';
import type {
  IosStoreListing,
  LocalizedReleaseNotes,
  PlayStoreListing,
  ReleaseNotes,
  ReleaseNoteTranslations,
} from './app-release-session';

/** Every store release ships What's New in these languages. `en` is the source the others are translated from. */
export const RELEASE_LANGUAGES = ['en', 'ru', 'sr', 'es'] as const;
export type ReleaseLanguage = (typeof RELEASE_LANGUAGES)[number];
export const TRANSLATED_RELEASE_LANGUAGES = ['ru', 'sr', 'es'] as const satisfies readonly ReleaseLanguage[];
export type TranslatedReleaseLanguage = (typeof TRANSLATED_RELEASE_LANGUAGES)[number];

const LANGUAGE_PROMPT_NAMES: Record<TranslatedReleaseLanguage, string> = {
  ru: 'Russian',
  sr: 'Serbian in LATIN script (latinica, ekavian, as used in Serbia) — never Cyrillic',
  es: 'Spanish (Spain)',
};

export const RELEASE_LANGUAGE_LABELS: Record<ReleaseLanguage, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian (Latin)',
  es: 'Spanish',
};

/** Google Play listing language codes. */
export const PLAY_LOCALES: Record<ReleaseLanguage, string> = {
  en: 'en-US',
  ru: 'ru-RU',
  sr: 'sr',
  es: 'es-ES',
};

/**
 * App Store Connect locales. Apple has no Serbian storefront language, so the Serbian (Latin)
 * copy is published under Croatian (`hr`), the closest Latin-script locale.
 */
export const IOS_LOCALES: Record<ReleaseLanguage, string> = {
  en: 'en-US',
  ru: 'ru',
  sr: 'hr',
  es: 'es-ES',
};

const IOS_WHATS_NEW_MAX = 4000;

export const PLAY_LISTING_LIMITS: Record<keyof PlayStoreListing, number> = {
  title: 30,
  shortDescription: 80,
  fullDescription: 4000,
};

export const IOS_LISTING_LIMITS: Partial<Record<keyof IosStoreListing, number>> = {
  name: 30,
  subtitle: 30,
  description: 4000,
  keywords: 100,
  promotionalText: 170,
};

/** Fields copied verbatim to new App Store locales (URLs are not translated). */
const IOS_LISTING_COPIED_FIELDS = ['privacyUrl', 'supportUrl', 'marketingUrl'] as const;

export function releaseNotesForLanguage(
  notes: ReleaseNotes,
  language: ReleaseLanguage,
): LocalizedReleaseNotes {
  if (language === 'en') {
    return { main: notes.main, short: notes.short };
  }
  const translated = notes.translations?.[language];
  if (!translated) {
    throw new Error(`Release notes are missing the ${RELEASE_LANGUAGE_LABELS[language]} translation`);
  }
  return translated;
}

export function hasAllReleaseNoteTranslations(notes: ReleaseNotes | null): boolean {
  return Boolean(notes && TRANSLATED_RELEASE_LANGUAGES.every((language) => notes.translations?.[language]));
}

export function parseJsonObject(text: string): Record<string, unknown> {
  const unfenced = text.replace(/```(?:json)?/gi, '');
  const start = unfenced.indexOf('{');
  const end = unfenced.lastIndexOf('}');
  if (start < 0 || end <= start) {
    throw new Error('LLM did not return a JSON object');
  }
  const parsed: unknown = JSON.parse(unfenced.slice(start, end + 1));
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('LLM did not return a JSON object');
  }
  return parsed as Record<string, unknown>;
}

function requireString(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    throw new Error(`Translation is missing ${label}`);
  }
  return value.trim();
}

function requireAi() {
  const ai = getAiService();
  if (!ai.isConfigured()) {
    throw new Error(
      'AI is not configured. Set AI_PROVIDER and OPENAI_API_KEY or DEEPSEEK_API_KEY in Backend/.env',
    );
  }
  return ai;
}

/** Calls the LLM for a JSON object; on a parse/validation error retries once with the error fed back. */
async function completeJson<T>(
  system: string,
  user: string,
  validate: (parsed: Record<string, unknown>) => T,
): Promise<T> {
  const ai = requireAi();
  const messages: ChatMessage[] = [
    { role: 'system', content: system },
    { role: 'user', content: user },
  ];
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const raw = await ai.createCompletion({
      messages,
      temperature: 0.2,
      max_tokens: 12000,
      reason: LLM_REASON.APP_RELEASE_NOTES,
    });
    try {
      return validate(parseJsonObject(raw));
    } catch (error) {
      lastError = error;
      messages.push(
        { role: 'assistant', content: raw },
        {
          role: 'user',
          content: `That output was rejected: ${error instanceof Error ? error.message : String(error)}. Return the corrected full JSON object only.`,
        },
      );
    }
  }
  throw lastError instanceof Error ? lastError : new Error(String(lastError));
}

function languageList(languages: readonly TranslatedReleaseLanguage[]): string {
  return languages.map((language) => `- "${language}": ${LANGUAGE_PROMPT_NAMES[language]}`).join('\n');
}

const RELEASE_NOTES_TRANSLATION_PROMPT = `You translate App Store / Google Play "What's New" notes for Bandeja — a multisport game scheduling and social app (padel, tennis, table tennis, badminton, pickleball, squash).

Rules:
- Natural, friendly store copy a native speaker would write; not word-for-word
- Keep the same bullets, order, and line breaks; keep the "• " bullet characters
- Keep the brand "Bandeja" and sport names as players in that language say them
- "short" stays one paragraph under 500 characters
- Return ONLY a JSON object: {"<lang>": {"main": "...", "short": "..."}, ...} with exactly the requested language keys`;

export async function translateReleaseNotes(notes: ReleaseNotes): Promise<ReleaseNoteTranslations> {
  const user = `Translate into:
${languageList(TRANSLATED_RELEASE_LANGUAGES)}

Source (English):
${JSON.stringify({ main: notes.main, short: notes.short ?? null }, null, 2)}`;

  return completeJson(RELEASE_NOTES_TRANSLATION_PROMPT, user, (parsed) => {
    const result = {} as ReleaseNoteTranslations;
    for (const language of TRANSLATED_RELEASE_LANGUAGES) {
      const entry = parsed[language] as Record<string, unknown> | undefined;
      const main = requireString(entry?.main, `${language}.main`);
      if (main.length > IOS_WHATS_NEW_MAX) {
        throw new Error(`${language}.main is ${main.length} characters; the App Store limit is ${IOS_WHATS_NEW_MAX}`);
      }
      const short = typeof entry?.short === 'string' ? entry.short : undefined;
      result[language] = { main, short: derivePlayShortDescription(main, short) };
    }
    return result;
  });
}

export async function withReleaseNoteTranslations(notes: ReleaseNotes): Promise<ReleaseNotes> {
  if (hasAllReleaseNoteTranslations(notes)) {
    return notes;
  }
  return { ...notes, translations: await translateReleaseNotes(notes) };
}

const STORE_LISTING_TRANSLATION_PROMPT = `You localize the app store listing of Bandeja — a multisport game scheduling and social app (padel, tennis, table tennis, badminton, pickleball, squash).

Rules:
- Natural marketing copy a native speaker would write; keep meaning, structure, and line breaks
- Keep the brand "Bandeja" untranslated
- Respect every character limit given — count characters, shorten wording rather than truncating
- "keywords" (if present) is a comma-separated list of search terms native speakers would type, no spaces after commas
- Return ONLY a JSON object: {"<lang>": {<same field names as the source>}, ...} with exactly the requested language keys`;

async function translateListing<T extends Record<string, string | undefined>>(
  source: T,
  translatedFields: readonly (keyof T & string)[],
  limits: Partial<Record<keyof T, number>>,
  languages: readonly TranslatedReleaseLanguage[],
): Promise<Record<TranslatedReleaseLanguage, Partial<T>>> {
  const fields = translatedFields.filter((field) => source[field]?.trim());
  const sourceFields = Object.fromEntries(fields.map((field) => [field, source[field]]));
  const limitLines = fields
    .filter((field) => limits[field])
    .map((field) => `- ${field}: max ${limits[field]} characters`)
    .join('\n');
  const user = `Translate into:
${languageList(languages)}

Character limits:
${limitLines}

Source (English):
${JSON.stringify(sourceFields, null, 2)}`;

  return completeJson(STORE_LISTING_TRANSLATION_PROMPT, user, (parsed) => {
    const result = {} as Record<TranslatedReleaseLanguage, Partial<T>>;
    for (const language of languages) {
      const entry = parsed[language] as Record<string, unknown> | undefined;
      const translated: Partial<T> = {};
      for (const field of fields) {
        const value = requireString(entry?.[field], `${language}.${field}`);
        const limit = limits[field];
        if (limit && value.length > limit) {
          throw new Error(`${language}.${field} is ${value.length} characters; the limit is ${limit}`);
        }
        translated[field] = value as T[typeof field];
      }
      result[language] = translated;
    }
    return result;
  });
}

export async function translatePlayListing(
  source: PlayStoreListing,
  languages: readonly TranslatedReleaseLanguage[],
): Promise<Record<string, PlayStoreListing>> {
  const translated = await translateListing(
    source,
    ['title', 'shortDescription', 'fullDescription'],
    PLAY_LISTING_LIMITS,
    languages,
  );
  return Object.fromEntries(
    languages.map((language) => [PLAY_LOCALES[language], { ...source, ...translated[language] }]),
  );
}

export async function translateIosListing(
  source: IosStoreListing,
  languages: readonly TranslatedReleaseLanguage[],
): Promise<Record<string, IosStoreListing>> {
  const translated = await translateListing(
    source,
    ['name', 'subtitle', 'description', 'keywords', 'promotionalText'],
    IOS_LISTING_LIMITS,
    languages,
  );
  const copied = Object.fromEntries(
    IOS_LISTING_COPIED_FIELDS.filter((field) => source[field]).map((field) => [field, source[field]]),
  );
  return Object.fromEntries(
    languages.map((language) => [
      IOS_LOCALES[language],
      { ...copied, ...translated[language] } as IosStoreListing,
    ]),
  );
}
