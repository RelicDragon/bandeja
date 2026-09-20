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

function tinyldTopKPasses(
  sample: string,
  targetLanguage: string,
  precomputed?: ReturnType<typeof detectAll>
): boolean {
  const code = targetLanguage.toLowerCase();
  const allowed = TINYLD_ACCEPT[code];
  if (!allowed?.length || sample.length < TINYLD_MIN_SAMPLE) {
    return false;
  }
  const hits = (precomputed ?? detectAll(sample)).slice(0, TINYLD_TOP_K);
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

function evalFrancSourceMatchesTarget(
  ranked: Array<[string, number]>,
  expected: readonly string[]
): boolean {
  const topLangs = ranked.slice(0, FRANC_TOP_K).map(([c]) => c);
  if (topLangs.length === 0) {
    return false;
  }
  if (topLangs.every((c) => c === 'und')) {
    return false;
  }
  return topLangs.some((c) => expected.includes(c));
}

export async function translationMatchesTargetFranc(
  translation: string,
  targetLanguage: string,
  meta?: { llmAttempt?: number }
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

  const tinyldHits = detectAll(sample);
  const tinyldOk = tinyldTopKPasses(sample, code, tinyldHits);
  const scriptOk = scriptFallbackPasses(sample, code);

  const pass = francOk || tinyldOk || scriptOk;
  const francTop = ranked.slice(0, FRANC_TOP_K).map(([c]) => c);
  const tinyldTop = tinyldHits.slice(0, TINYLD_TOP_K).map((h) => h.lang);

  console.info('[translation] lang_check', {
    llmAttempt: meta?.llmAttempt,
    target: code,
    pass,
    francOk,
    tinyldOk,
    scriptOk,
    francTop,
    tinyldTop,
    sampleLen: sample.length,
  });

  return pass;
}

/**
 * Shortest sample at which detector disagreement is trustworthy enough to
 * overrule the model. Below it we stay permissive: short chat messages are
 * exactly where detection is unreliable and the model's judgement is worth more.
 */
const PASSTHROUGH_GUARD_MIN_SAMPLE = 120;

/**
 * True when returning the source untranslated is a plausible answer for this
 * target — i.e. the source may already be in the target language.
 *
 * Used to sanity-check a [[NO_TRANSLATION_NEEDED]] reply or a near-duplicate
 * rewrite before it is handed back as a finished translation. Deliberately
 * biased towards `true`: it only returns false when the sample is long enough
 * to judge AND the detectors positively disagree with the model.
 *
 * tinyld is the authority here rather than franc, which mislabels Latin-script
 * European languages (it reads a long English text as French).
 */
export async function sourcePassthroughIsPlausible(
  text: string,
  targetLanguage: string
): Promise<boolean> {
  const code = targetLanguage.toLowerCase();
  const expected = FRANC_EXPECTED_BY_TARGET[code];
  if (!expected?.length) {
    return true;
  }

  const cleaned = normalizeTranslationOutput(text);
  if (!cleaned) {
    return true;
  }

  const sample = sampleForFrancDetection(cleaned);
  if (sample.length < PASSTHROUGH_GUARD_MIN_SAMPLE) {
    return true;
  }

  // Right script for a non-Latin target is decisive on its own.
  if (scriptFallbackPasses(sample, code)) {
    return true;
  }

  const hits = detectAll(sample);
  if (hits.length === 0) {
    // No opinion from the detector — do not overrule the model on a guess.
    return true;
  }

  const plausible = tinyldTopKPasses(sample, code, hits);
  console.info('[translation] passthrough_plausible', {
    target: code,
    plausible,
    tinyldTop: hits.slice(0, TINYLD_TOP_K).map((h) => h.lang),
    sampleLen: sample.length,
  });
  return plausible;
}

export async function sourceAppearsToBeTargetLanguage(
  text: string,
  targetLanguage: string
): Promise<boolean> {
  const code = targetLanguage.toLowerCase();
  const expected = FRANC_EXPECTED_BY_TARGET[code];
  if (!expected?.length) {
    return false;
  }

  const cleaned = normalizeTranslationOutput(text);
  if (!cleaned) {
    return false;
  }

  const sample = sampleForFrancDetection(cleaned);
  if (!sample) {
    return false;
  }

  if (shouldSkipObviousShortNoTargetScript(sample, code)) {
    return false;
  }

  const minLen = useLowFrancMinLength(sample, code) ? FRANC_MIN_AGGRESSIVE : FRANC_MIN_DEFAULT;
  const francAll = await getFrancAll();

  const ranked = francAll(sample, {
    minLength: minLen,
    only: [...ALL_FRANC_ONLY_CODES],
  });
  let francOk = evalFrancSourceMatchesTarget(ranked, expected);

  if (!francOk && minLen > FRANC_MIN_AGGRESSIVE && sample.length >= FRANC_MIN_AGGRESSIVE) {
    const rankedLoose = francAll(sample, {
      minLength: FRANC_MIN_AGGRESSIVE,
      only: [...ALL_FRANC_ONLY_CODES],
    });
    francOk = evalFrancSourceMatchesTarget(rankedLoose, expected);
  }

  const tinyldHits = detectAll(sample);
  const tinyldOk = tinyldTopKPasses(sample, code, tinyldHits);
  const scriptOk = scriptFallbackPasses(sample, code);

  // When tinyld can run, require agreement: franc alone mislabels FR/DE as por/spa for es targets.
  const same =
    scriptOk ||
    (sample.length >= TINYLD_MIN_SAMPLE ? francOk && tinyldOk : francOk);

  console.info('[translation] source_same_lang', {
    target: code,
    same,
    francOk,
    tinyldOk,
    scriptOk,
    sampleLen: sample.length,
  });

  return same;
}
