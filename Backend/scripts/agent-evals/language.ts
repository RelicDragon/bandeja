/**
 * Cheap reply-language heuristic for the 11 app locales (en ru sr es cs ar zh id hi th ja):
 * script detection first, then stopword / diacritic scores for Latin and Cyrillic.
 * Serbian is accepted in Latin or Cyrillic (and Croatian/Bosnian wording counts as sr).
 * Names, ids, URLs, code and markdown are stripped before scoring.
 */

export const EVAL_LOCALES = ['en', 'ru', 'sr', 'es', 'cs', 'ar', 'zh', 'id', 'hi', 'th', 'ja'] as const;
export type EvalLocale = (typeof EVAL_LOCALES)[number];

const STOPWORDS: Record<'en' | 'sr' | 'es' | 'cs' | 'id' | 'ru' | 'srCyr', string[]> = {
  en: ['the', 'and', 'you', 'your', 'is', 'are', 'to', 'of', 'in', 'for', 'with', 'game', 'games', 'have', 'it', 'on', 'at', 'this', 'that', 'will', 'can', 'not', 'no', 'there', 'what', 'would', 'here', 'want', 'like', 'please'],
  sr: ['je', 'i', 'u', 'na', 'za', 'da', 'se', 'su', 'od', 'sa', 'ti', 'tvoj', 'tvoja', 'tvoje', 'imaš', 'imas', 'nema', 'koji', 'koja', 'kod', 'igra', 'igre', 'igru', 'sutra', 'želiš', 'zelis', 'možeš', 'mozes', 'ili', 'ali', 'kao', 'ovo', 'to', 'li', 'sam', 'si', 'smo', 'već', 'vec', 'termin', 'teren', 'potvrdi', 'potvrditi', 'evo', 'nisam', 'jer', 'samo'],
  es: ['el', 'la', 'los', 'las', 'de', 'que', 'y', 'en', 'un', 'una', 'tu', 'tus', 'para', 'con', 'por', 'es', 'partido', 'partidos', 'tienes', 'mañana', 'hay', 'del', 'al', 'lo', 'se', 'puedes', 'quieres', 'pista', 'aquí', 'confirmar', 'voy', 'mis', 'sobre', 'te', 'muy', 'pero', 'como', 'más', 'este', 'esta', 'tengo', 'ya', 'nivel'],
  cs: ['je', 'a', 'v', 'na', 'se', 'že', 'to', 'pro', 's', 'máš', 'tvůj', 'tvoje', 'hra', 'hru', 'zápas', 'zítra', 'není', 'jsou', 'jak', 'můžeš', 'chceš', 'nebo', 'ale', 'jsem', 'jako', 'k', 'z', 'o', 'tě', 'potvrdit', 'kurt'],
  id: ['yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'dengan', 'ini', 'itu', 'kamu', 'anda', 'tidak', 'ada', 'besok', 'permainan', 'main', 'bisa', 'akan', 'sudah', 'saya', 'apakah', 'atau', 'juga', 'pada', 'jadwal', 'lapangan', 'ingin', 'mau'],
  ru: ['и', 'в', 'не', 'на', 'что', 'ты', 'у', 'тебя', 'твой', 'твоя', 'с', 'по', 'это', 'игра', 'игры', 'игру', 'завтра', 'для', 'как', 'есть', 'нет', 'или', 'но', 'я', 'вы', 'вас', 'можно', 'хочешь', 'корт', 'подтвердить', 'уже', 'так', 'же', 'только', 'чтобы'],
  srCyr: ['је', 'и', 'у', 'на', 'за', 'да', 'се', 'су', 'од', 'са', 'ти', 'твој', 'имаш', 'нема', 'који', 'која', 'код', 'игра', 'сутра', 'желиш', 'можеш', 'или', 'али', 'ово', 'то', 'ли', 'сам'],
};

const SR_LATIN_CHARS = /[čćžšđ]/i;
const CS_CHARS = /[řěůťď]/i;
const ES_CHARS = /[ñ¿¡]/i;
const SR_CYR_CHARS = /[ђјљњћџ]/i;
const RU_CYR_CHARS = /[ыэъщёй]/i;

export function stripForLanguage(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`[^`]*`/g, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\b[a-z0-9]{20,}\b/gi, ' ')
    .replace(/[*_#>|~\-]+/g, ' ')
    .replace(/\d+([:.,/-]\d+)*/g, ' ');
}

type ScriptCounts = { latin: number; cyrillic: number; arabic: number; han: number; kana: number; devanagari: number; thai: number; hangul: number };

function countScripts(text: string): ScriptCounts {
  const counts: ScriptCounts = { latin: 0, cyrillic: 0, arabic: 0, han: 0, kana: 0, devanagari: 0, thai: 0, hangul: 0 };
  for (const ch of text) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) counts.latin += 1;
    else if (cp >= 0x400 && cp <= 0x4ff) counts.cyrillic += 1;
    else if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f) || (cp >= 0xfb50 && cp <= 0xfeff)) counts.arabic += 1;
    else if (cp >= 0x3040 && cp <= 0x30ff) counts.kana += 1;
    else if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) counts.han += 1;
    else if (cp >= 0x900 && cp <= 0x97f) counts.devanagari += 1;
    else if (cp >= 0xe00 && cp <= 0xe7f) counts.thai += 1;
    else if (cp >= 0xac00 && cp <= 0xd7af) counts.hangul += 1;
  }
  return counts;
}

function stopwordScore(words: string[], list: string[]): number {
  const set = new Set(list);
  return words.filter((w) => set.has(w)).length;
}

export type LanguageGuess = { lang: EvalLocale | 'unknown'; confidence: number; detail: string };

/**
 * Best guess for `text`. `confidence` ∈ [0, 1]: share of the winning signal.
 * Short or name-only texts come back `unknown` (callers treat that as not checkable).
 */
export function detectLanguage(text: string): LanguageGuess {
  let clean = stripForLanguage(text);
  let counts = countScripts(clean);
  // Mixed script: capitalised Latin words are names (clubs, players, streets), not the language.
  if (counts.latin > 0 && counts.cyrillic + counts.arabic + counts.han + counts.kana + counts.devanagari + counts.thai + counts.hangul >= 5) {
    clean = clean.replace(/\b[A-Z][\p{L}'’]*/gu, ' ');
    counts = countScripts(clean);
  }
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  if (total < 12) return { lang: 'unknown', confidence: 0, detail: `too short (${total} letters)` };
  const share = (n: number) => n / total;

  if (share(counts.kana) > 0.05) return { lang: 'ja', confidence: share(counts.kana + counts.han), detail: 'kana' };
  if (share(counts.han) > 0.25) return { lang: 'zh', confidence: share(counts.han), detail: 'han, no kana' };
  if (share(counts.arabic) > 0.25) return { lang: 'ar', confidence: share(counts.arabic), detail: 'arabic script' };
  if (share(counts.devanagari) > 0.25) return { lang: 'hi', confidence: share(counts.devanagari), detail: 'devanagari' };
  if (share(counts.thai) > 0.25) return { lang: 'th', confidence: share(counts.thai), detail: 'thai script' };

  const words = clean.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
  // Replies in Cyrillic often carry Latin names (tables of players): Cyrillic wins from 25%.
  if (counts.cyrillic >= 8 && share(counts.cyrillic) >= 0.25) {
    const ru = stopwordScore(words, STOPWORDS.ru) + (RU_CYR_CHARS.test(clean) ? 3 : 0);
    const sr = stopwordScore(words, STOPWORDS.srCyr) + (SR_CYR_CHARS.test(clean) ? 4 : 0);
    const lang = sr > ru ? 'sr' : 'ru';
    return { lang, confidence: share(counts.cyrillic), detail: `cyrillic ru=${ru} sr=${sr}` };
  }

  const scores = {
    en: stopwordScore(words, STOPWORDS.en),
    // Serbian Latin has no acute vowels: "zítra", "nivel más" are Czech / Spanish.
    sr: /[áéíóúý]/i.test(clean) ? 0 : stopwordScore(words, STOPWORDS.sr) + (SR_LATIN_CHARS.test(clean) ? 3 : 0),
    es: stopwordScore(words, STOPWORDS.es) + (ES_CHARS.test(clean) ? 3 : 0),
    cs: stopwordScore(words, STOPWORDS.cs) + (CS_CHARS.test(clean) ? 4 : 0),
    id: stopwordScore(words, STOPWORDS.id),
  };
  const ranked = (Object.entries(scores) as [EvalLocale, number][]).sort((a, b) => b[1] - a[1]);
  const [best, second] = ranked;
  if (best[1] === 0) return { lang: 'unknown', confidence: 0, detail: 'latin, no stopwords' };
  const confidence = best[1] / (best[1] + (second?.[1] ?? 0));
  return { lang: best[0], confidence, detail: ranked.map(([l, s]) => `${l}=${s}`).join(' ') };
}

/** Pass when the guess matches, or the text is too short/ambiguous to judge (reported as n/a). */
export function languageMatches(text: string, expected: EvalLocale): { ok: boolean | null; guess: LanguageGuess } {
  const guess = detectLanguage(text);
  if (guess.lang === 'unknown') return { ok: null, guess };
  // sr / cs share many short words: only a confident wrong guess fails.
  if (guess.lang !== expected && guess.confidence < 0.6 && ['sr', 'cs'].includes(guess.lang) && ['sr', 'cs'].includes(expected)) {
    return { ok: null, guess };
  }
  return { ok: guess.lang === expected, guess };
}
