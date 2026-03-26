const RE_LETTER = /\p{L}/gu;

const RE_LATIN = /[A-Za-z\u00C0-\u024F\u1E00-\u1EFF]/gu;
const RE_CYRILLIC = /[\u0400-\u04FF]/gu;
const RE_ARABIC =
  /[\u0600-\u06FF\u0750-\u077F\u08A0-\u08FF\uFB50-\uFDFF\uFE70-\uFEFF]/gu;
const RE_GREEK = /[\u0370-\u03FF\u1F00-\u1FFF]/gu;
const RE_CJK =
  /[\u3040-\u30FF\u31F0-\u31FF\u3400-\u4DBF\u4E00-\u9FFF\uAC00-\uD7AF]/gu;

export const OBVIOUS_SHORT_MAX_LEN = 8;
const OBVIOUS_SHORT_MAX_TARGET_SCRIPT = 0.12;
const SCRIPT_FRANC_MIN_RATIO = 0.28;
const SCRIPT_FALLBACK_MIN_RATIO = 0.42;
const SCRIPT_FALLBACK_TARGETS = new Set([
  'ru',
  'bg',
  'sr',
  'el',
  'ar',
  'zh',
  'ja',
  'ko',
]);

function countMatches(re: RegExp, text: string): number {
  const m = text.match(re);
  return m ? m.length : 0;
}

function letterCount(text: string): number {
  const m = text.match(RE_LETTER);
  return m ? m.length : 0;
}

export function targetScriptRatios(sample: string): {
  latin: number;
  cyrillic: number;
  arabic: number;
  greek: number;
  cjk: number;
  letters: number;
} {
  const letters = letterCount(sample);
  if (letters === 0) {
    return { latin: 0, cyrillic: 0, arabic: 0, greek: 0, cjk: 0, letters: 0 };
  }
  return {
    latin: countMatches(RE_LATIN, sample) / letters,
    cyrillic: countMatches(RE_CYRILLIC, sample) / letters,
    arabic: countMatches(RE_ARABIC, sample) / letters,
    greek: countMatches(RE_GREEK, sample) / letters,
    cjk: countMatches(RE_CJK, sample) / letters,
    letters,
  };
}

export function targetScriptRatioForLocale(sample: string, targetLanguage: string): number {
  const t = targetLanguage.toLowerCase();
  const r = targetScriptRatios(sample);
  if (r.letters === 0) return 0;
  switch (t) {
    case 'ru':
    case 'bg':
      return r.cyrillic;
    case 'sr':
      return Math.max(r.cyrillic, r.latin);
    case 'hr':
    case 'en':
    case 'es':
    case 'fr':
    case 'de':
    case 'it':
    case 'pt':
    case 'nl':
    case 'pl':
    case 'cs':
    case 'sk':
    case 'ro':
    case 'hu':
    case 'tr':
      return r.latin;
    case 'el':
      return r.greek;
    case 'ar':
      return r.arabic;
    case 'zh':
    case 'ja':
    case 'ko':
      return r.cjk;
    default:
      return r.latin;
  }
}

export function shouldSkipObviousShortNoTargetScript(
  sample: string,
  targetLanguage: string
): boolean {
  if (sample.length >= OBVIOUS_SHORT_MAX_LEN) {
    return false;
  }
  const r = targetScriptRatios(sample);
  if (r.letters === 0) {
    return true;
  }
  const targetRatio = targetScriptRatioForLocale(sample, targetLanguage);
  if (targetRatio >= OBVIOUS_SHORT_MAX_TARGET_SCRIPT) {
    return false;
  }
  const maxScript = Math.max(r.latin, r.cyrillic, r.arabic, r.greek, r.cjk);
  return maxScript < 0.15;
}

export function useLowFrancMinLength(sample: string, targetLanguage: string): boolean {
  const r = targetScriptRatios(sample);
  if (r.cjk >= SCRIPT_FRANC_MIN_RATIO) return true;
  if (r.arabic >= SCRIPT_FRANC_MIN_RATIO) return true;
  if (r.cyrillic >= SCRIPT_FRANC_MIN_RATIO) return true;
  if (r.greek >= SCRIPT_FRANC_MIN_RATIO) return true;
  if (targetScriptRatioForLocale(sample, targetLanguage) >= 0.22) {
    return true;
  }
  return false;
}

export function scriptFallbackPasses(sample: string, targetLanguage: string): boolean {
  const code = targetLanguage.toLowerCase();
  if (!SCRIPT_FALLBACK_TARGETS.has(code)) {
    return false;
  }
  return targetScriptRatioForLocale(sample, targetLanguage) >= SCRIPT_FALLBACK_MIN_RATIO;
}
