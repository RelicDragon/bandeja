import { detectAll } from 'tinyld';
import { normalizeTranslationOutput } from './translationOutputNormalize';
import {
  shouldSkipObviousShortNoTargetScript,
  useLowFrancMinLength,
  scriptFallbackPasses,
} from './translationScriptHeuristics';

const FRANC_EXPECTED_BY_TARGET: Record<string, readonly string[]> = {
  en: ['eng', 'sco'],
  ru: ['rus', 'ukr', 'bel'],
  sr: ['srp', 'hrv', 'bos'],
  hr: ['hrv', 'srp', 'bos'],
  es: ['spa', 'cat', 'glg', 'por'],
  fr: ['fra', 'oci', 'cat'],
  de: ['deu', 'bar', 'nds'],
  it: ['ita', 'scn', 'lij'],
  pt: ['por', 'glg', 'spa'],
  nl: ['nld', 'afr', 'lim'],
  pl: ['pol', 'szl', 'csb', 'slk', 'ces'],
  cs: ['ces', 'slk', 'pol'],
  sk: ['slk', 'ces', 'pol'],
  bg: ['bul', 'mkd'],
  ro: ['ron'],
  hu: ['hun'],
  el: ['ell'],
  tr: ['tur'],
  ar: ['arb'],
  zh: ['cmn'],
  ja: ['jpn'],
  ko: ['kor'],
};

const TINYLD_ACCEPT: Record<string, readonly string[]> = {
  en: ['en'],
  ru: ['ru', 'uk', 'be'],
  sr: ['sr', 'hr', 'bs'],
  hr: ['hr', 'sr', 'bs'],
  es: ['es', 'ca', 'gl', 'pt'],
  fr: ['fr'],
  de: ['de'],
  it: ['it'],
  pt: ['pt', 'gl', 'es'],
  nl: ['nl'],
  pl: ['pl', 'cs', 'sk'],
  cs: ['cs', 'sk', 'pl'],
  sk: ['sk', 'cs', 'pl'],
  bg: ['bg', 'mk'],
  ro: ['ro'],
  hu: ['hu'],
  el: ['el'],
  tr: ['tr'],
  ar: ['ar'],
  zh: ['zh'],
  ja: ['ja'],
  ko: ['ko'],
};

const FRANC_MIN_DEFAULT = 8;
const FRANC_MIN_AGGRESSIVE = 3;
const FRANC_TOP_K = 3;
const TINYLD_TOP_K = 3;
const TINYLD_MIN_SAMPLE = 4;

const ALL_FRANC_ONLY_CODES: readonly string[] = Array.from(
  new Set(Object.values(FRANC_EXPECTED_BY_TARGET).flat())
);

let francAllCached: typeof import('franc').francAll | null = null;

async function getFrancAll(): Promise<typeof import('franc').francAll> {
  if (!francAllCached) {
    const m = await import('franc');
    francAllCached = m.francAll;
  }
  return francAllCached;
}

function sampleForFrancDetection(text: string): string {
  return text
    .replace(/https?:\/\/\S+/gi, ' ')
    .replace(/@\w+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function tinyldTopKPasses(sample: string, targetLanguage: string): boolean {
  const code = targetLanguage.toLowerCase();
  const allowed = TINYLD_ACCEPT[code];
  if (!allowed?.length || sample.length < TINYLD_MIN_SAMPLE) {
    return false;
  }
  const hits = detectAll(sample).slice(0, TINYLD_TOP_K);
  for (const { lang } of hits) {
    const l = lang.toLowerCase();
    if (allowed.includes(l)) {
      return true;
    }
  }
  return false;
}

function evalFrancTop(
  ranked: Array<[string, number]>,
  expected: readonly string[]
): boolean {
  const topLangs = ranked.slice(0, FRANC_TOP_K).map(([c]) => c);
  if (topLangs.length === 0) {
    return true;
  }
  if (topLangs.every((c) => c === 'und')) {
    return true;
  }
  return topLangs.some((c) => expected.includes(c));
}

export async function translationMatchesTargetFranc(
  translation: string,
  targetLanguage: string
): Promise<boolean> {
  const cleaned = normalizeTranslationOutput(translation);
  const code = targetLanguage.toLowerCase();
  const expected = FRANC_EXPECTED_BY_TARGET[code];
  if (!expected?.length) {
    return true;
  }

  if (!cleaned) {
    return true;
  }

  const sample = sampleForFrancDetection(cleaned);

  if (shouldSkipObviousShortNoTargetScript(sample, code)) {
    return true;
  }

  const minLen = useLowFrancMinLength(sample, code) ? FRANC_MIN_AGGRESSIVE : FRANC_MIN_DEFAULT;
  const francAll = await getFrancAll();

  const ranked = francAll(sample, {
    minLength: minLen,
    only: [...ALL_FRANC_ONLY_CODES],
  });
  let francOk = evalFrancTop(ranked, expected);

  if (!francOk && minLen > FRANC_MIN_AGGRESSIVE && sample.length >= FRANC_MIN_AGGRESSIVE) {
    const rankedLoose = francAll(sample, {
      minLength: FRANC_MIN_AGGRESSIVE,
      only: [...ALL_FRANC_ONLY_CODES],
    });
    francOk = evalFrancTop(rankedLoose, expected);
  }

  const tinyldOk = tinyldTopKPasses(sample, code);
  const scriptOk = scriptFallbackPasses(sample, code);

  if (francOk || tinyldOk || scriptOk) {
    return true;
  }

  const topLangs = ranked.slice(0, FRANC_TOP_K).map(([c]) => c);
  console.warn('Translation language check mismatch', {
    targetLanguage: code,
    francTop: topLangs,
    tinyldTop: detectAll(sample)
      .slice(0, TINYLD_TOP_K)
      .map((h) => h.lang),
    sampleLen: sample.length,
  });
  return false;
}
