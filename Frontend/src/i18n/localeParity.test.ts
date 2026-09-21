import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

/**
 * Keys whose non-`en` value is legitimately byte-identical to English:
 * proper nouns, brand names, score formats, unit symbols. Full dotted paths,
 * e.g. `series.brandName`. Add an entry only with a one-line reason above it.
 *
 */
export const PARITY_IDENTICAL_ALLOWLIST: string[] = [
  // Two counted nouns cannot share one i18next plural family, so the outro
  // caption is a pure joiner: both halves are separately counted keys
  // (`outro.gamesPart`, `outro.winsPart`) and this value holds no words at all.
  'recap.slides.outro.caption',
  // PRD 348 — banking acronyms, not words. "IBAN" is IBAN in every one of the
  // eleven locales, and "CLABE" is a Mexican term Spanish itself does not
  // expand. Everything else in `cost.payment.*` is prose and is translated;
  // the sample handles ("ES91 2100 …", "@yourname") are not here because they
  // are not i18n strings at all — see `PAYMENT_HANDLE_RULES.example`.
  'cost.payment.method.iban',
  'cost.payment.method.clabe',
  'cost.payment.handle.IBAN.label',
];

/** `Frontend/src/i18n/config.ts` builds exactly these 11 bundles. */
const LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;

type Locale = (typeof LOCALES)[number];

const SOURCE_LOCALE: Locale = 'en';

/** Namespaces owned by the PRD 345–357 program (CONTRACT §8.2). */
const PROGRAM_NAMESPACES = [
  'attendance',
  'clubPage',
  'cost',
  'live',
  'onboarding',
  'pairs',
  'recap',
  'referral',
  'series',
  'shop',
  'spots',
  'weatherAlerts',
] as const;

/**
 * Pre-existing namespaces that already satisfy every rule below. They are
 * included so a regression is caught, not to force a backfill of the rest —
 * the remaining namespaces still carry historical drift and are out of scope
 * here. Move a namespace up into this list once it is cleaned.
 */
const LEGACY_CLEAN_NAMESPACES = [
  'ads',
  'calendar',
  'conflicts',
  'contacts',
  'createEvent',
  'createLeague',
  'eventDetails',
  'faq',
  'favorites',
  'media',
  'offline',
  'permissions',
  'playerProfile',
  'push',
  'telegram',
  'trainers',
  'userGameNotes',
  'welcome',
] as const;

const NAMESPACES = [...PROGRAM_NAMESPACES, ...LEGACY_CLEAN_NAMESPACES];

/** Values longer than this must differ from English in every other locale. */
const MIN_TRANSLATED_LENGTH = 3;

const LOCALES_DIR = join(process.cwd(), 'src/i18n/locales');

const PLACEHOLDER_RE = /\{\{(.*?)\}\}/g;

type JsonNode = string | { [key: string]: JsonNode };

function flatten(node: JsonNode, prefix: string, out: Map<string, string>): void {
  if (typeof node === 'string') {
    out.set(prefix, node);
    return;
  }
  for (const [key, child] of Object.entries(node)) {
    flatten(child, prefix ? `${prefix}.${key}` : key, out);
  }
}

function readNamespace(locale: Locale, namespace: string): Map<string, string> {
  const raw = readFileSync(join(LOCALES_DIR, locale, `${namespace}.json`), 'utf8');
  const out = new Map<string, string>();
  flatten(JSON.parse(raw) as JsonNode, '', out);
  return out;
}

function readLocale(locale: Locale): Map<string, string> {
  const out = new Map<string, string>();
  for (const namespace of NAMESPACES) {
    for (const [key, value] of readNamespace(locale, namespace)) {
      out.set(key, value);
    }
  }
  return out;
}

function placeholders(value: string): string[] {
  return [...value.matchAll(PLACEHOLDER_RE)].map((match) => match[1].trim()).sort();
}

/**
 * i18next plural handling (`pluralSeparator: '_'`).
 *
 * A counted string is not one key but a *family*: `games_one`, `games_other`,
 * and — in Russian, Czech, Serbian and Arabic — `games_few` / `games_many` /
 * `games_zero` too. Those extra categories exist only in the locales that need
 * them, so comparing raw key sets against English would permanently fail any
 * correctly-pluralised string. Parity is therefore checked per family: English
 * declares the family, every locale must resolve it, and each locale may carry
 * exactly the CLDR categories its grammar requires.
 */
const CLDR_PLURAL_CATEGORIES = ['zero', 'one', 'two', 'few', 'many', 'other'] as const;

const PLURAL_SUFFIX_RE = new RegExp(`_(${CLDR_PLURAL_CATEGORIES.join('|')})$`);

/** `games_few` → `games`; a non-plural key is returned unchanged. */
function pluralFamily(key: string): string {
  return key.replace(PLURAL_SUFFIX_RE, '');
}

function isPluralForm(key: string): boolean {
  return PLURAL_SUFFIX_RE.test(key);
}

/**
 * Collapses a flat bundle to one entry per family. The representative value is
 * the `_other` form when the key is plural (it is the only category every
 * locale must define), which is what the placeholder and translated-ness checks
 * compare.
 */
function familyView(bundle: Map<string, string>): Map<string, string> {
  const out = new Map<string, string>();
  for (const [key, value] of bundle) {
    if (!isPluralForm(key)) {
      out.set(key, value);
      continue;
    }
    const family = pluralFamily(key);
    if (key.endsWith('_other') || !out.has(family)) out.set(family, value);
  }
  return out;
}

/** Every plural family must define `_other`, the universal CLDR category. */
function pluralFamiliesMissingOther(bundle: Map<string, string>): string[] {
  const families = new Set<string>();
  for (const key of bundle.keys()) if (isPluralForm(key)) families.add(pluralFamily(key));
  return [...families].filter((family) => !bundle.has(`${family}_other`)).sort();
}

/**
 * `_other` on its own is **not** enough.
 *
 * i18next asks `Intl.PluralRules` for the category of the actual count and
 * appends it verbatim. A missing category is not a graceful degradation: the
 * key simply does not resolve, i18next walks on to the next language in the
 * fallback chain — English — and recomputes the suffix *for English*, so an
 * Arabic user with 7 games got the English `_other` string. That is how a fully
 * translated `ar/recap.json` rendered in English for every count from 2 to 99.
 *
 * `sr` is resolved as `sr-Latn` because that is what the app means by `sr`
 * (CONTRACT §8.1); the two share plural rules, but keeping the mapping explicit
 * documents the intent.
 */
function requiredPluralCategories(locale: Locale): readonly string[] {
  const tag = locale === 'sr' ? 'sr-Latn' : locale;
  return new Intl.PluralRules(tag).resolvedOptions().pluralCategories;
}

/** `family` → the CLDR categories the bundle actually declares for it. */
function pluralCategoriesByFamily(bundle: Map<string, string>): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  for (const key of bundle.keys()) {
    const match = PLURAL_SUFFIX_RE.exec(key);
    if (!match) continue;
    const family = pluralFamily(key);
    const categories = out.get(family) ?? new Set<string>();
    categories.add(match[1]);
    out.set(family, categories);
  }
  return out;
}

const source = readLocale(SOURCE_LOCALE);
const sourceFamilies = familyView(source);
const translated = LOCALES.filter((locale) => locale !== SOURCE_LOCALE);
const allowlist = new Set(PARITY_IDENTICAL_ALLOWLIST);

describe('i18n locale parity', () => {
  it('reads a non-empty English source bundle for every namespace', () => {
    expect(NAMESPACES.length).toBeGreaterThan(0);
    for (const namespace of NAMESPACES) {
      // An empty namespace (`{ "<ns>": {} }`) is legal — it just contributes no keys.
      expect(() => readNamespace(SOURCE_LOCALE, namespace)).not.toThrow();
    }
  });

  it('allowlists only keys that exist in English', () => {
    expect([...allowlist].filter((key) => !sourceFamilies.has(key))).toEqual([]);
  });

  it('declares an _other form for every English plural family', () => {
    expect(pluralFamiliesMissingOther(source)).toEqual([]);
  });

  it('declares _one and _other for every English plural family', () => {
    const required = requiredPluralCategories(SOURCE_LOCALE);
    const gaps: string[] = [];
    for (const [family, categories] of pluralCategoriesByFamily(source)) {
      const missing = required.filter((category) => !categories.has(category));
      if (missing.length > 0) gaps.push(`${family}: missing _${missing.join(', _')}`);
    }
    expect(gaps.sort()).toEqual([]);
  });

  for (const locale of translated) {
    describe(locale, () => {
      it('has exactly the English key set', () => {
        const target = familyView(readLocale(locale));
        const missing = [...sourceFamilies.keys()].filter((key) => !target.has(key)).sort();
        const extra = [...target.keys()].filter((key) => !sourceFamilies.has(key)).sort();
        expect({ missing, extra }).toEqual({ missing: [], extra: [] });
      });

      it('declares an _other form for every plural family it uses', () => {
        expect(pluralFamiliesMissingOther(readLocale(locale))).toEqual([]);
      });

      it('declares every CLDR plural category its grammar requires', () => {
        const required = requiredPluralCategories(locale);
        const gaps: string[] = [];
        for (const [family, categories] of pluralCategoriesByFamily(readLocale(locale))) {
          const missing = required.filter((category) => !categories.has(category));
          if (missing.length > 0) gaps.push(`${family}: missing _${missing.join(', _')}`);
        }
        expect(gaps.sort()).toEqual([]);
      });

      it('declares no plural category its grammar never selects', () => {
        const required = new Set(requiredPluralCategories(locale));
        const dead: string[] = [];
        for (const [family, categories] of pluralCategoriesByFamily(readLocale(locale))) {
          const extra = [...categories].filter((category) => !required.has(category));
          if (extra.length > 0) dead.push(`${family}: unreachable _${extra.sort().join(', _')}`);
        }
        expect(dead.sort()).toEqual([]);
      });

      it('keeps the English interpolation placeholders', () => {
        const raw = readLocale(locale);
        const mismatched: string[] = [];
        // Checked per *form*, not per family: every plural category of a counted
        // string has to keep the same {{count}} the English source declares.
        for (const [key, value] of raw) {
          const expectedValue = sourceFamilies.get(pluralFamily(key));
          if (expectedValue === undefined) continue;
          const expected = placeholders(expectedValue);
          const actual = placeholders(value);
          if (expected.join('|') !== actual.join('|')) {
            mismatched.push(`${key}: expected {{${expected.join('}}, {{')}}} — got {{${actual.join('}}, {{')}}}`);
          }
        }
        expect(mismatched).toEqual([]);
      });

      it('is actually translated, not an English copy', () => {
        const target = familyView(readLocale(locale));
        const untranslated: string[] = [];
        for (const [key, value] of sourceFamilies) {
          if (value.length <= MIN_TRANSLATED_LENGTH) continue;
          if (allowlist.has(key)) continue;
          if (target.get(key) === value) untranslated.push(key);
        }
        expect(untranslated).toEqual([]);
      });
    });
  }
});
