/**
 * Reply-language hint for the latest user message (`withAgentSnapshot` → the reminder right
 * after it). Names a language only when the text is unambiguous: a script that belongs to one
 * app language (kana, Han, Arabic, Devanagari, Thai), Cyrillic with letters only Russian or only
 * Serbian has, or plain English (English function words, none of another Latin app language,
 * no diacritics). Anything else → null and the generic rule decides. A wrong guess would be
 * worse than none, so every branch is conservative.
 */

const LANGUAGE_NAMES: Record<string, string> = {
  en: 'English',
  ru: 'Russian',
  sr: 'Serbian',
  zh: 'Chinese',
  ja: 'Japanese',
  ar: 'Arabic',
  hi: 'Hindi',
  th: 'Thai',
};

const EN_WORDS = new Set([
  'the', 'and', 'what', 'what\'s', 'is', 'are', 'was', 'my', 'me', 'you', 'your', 'for', 'that', 'this', 'with', 'will',
  'would', 'can', 'could', 'please', 'thanks', 'thank', 'when', 'where', 'who', 'how', 'do', 'does', 'did', 'have', 'has',
  'i', 'i\'m', 'it', 'it\'s', 'of', 'to', 'in', 'on', 'at', 'be', 'going', 'any', 'there', 'game', 'games', 'tomorrow',
  'today', 'show', 'find', 'book', 'cancel', 'join', 'next', 'remember', 'who\'s', 'where\'s', 'when\'s', 'how\'s',
  'don\'t', 'can\'t', 'won\'t', 'isn\'t', 'i\'ll', 'i\'ve', 'still', 'missing', 'move', 'play', 'playing', 'league', 'leading',
]);

/** Function words of the other Latin-script app languages (es, sr, cs, id): any hit = not plain English. */
const OTHER_LATIN_WORDS = new Set([
  // es
  'el', 'la', 'los', 'las', 'que', 'y', 'de', 'del', 'en', 'un', 'una', 'mi', 'mis', 'tu', 'por', 'para', 'con', 'es', 'qué', 'cuánto', 'cuántas', 'hay',
  // sr / hr / bs
  'je', 'da', 'li', 'su', 'sam', 'si', 'na', 'za', 'od', 'sa', 'ti', 'mi', 'ko', 'šta', 'sta', 'koji', 'koja', 'ima', 'mogu', 'igru', 'igra', 'sutra',
  // cs
  'se', 'že', 'jsem', 'mám', 'bude', 'zítra', 'hru', 'jak', 'kde', 'proč',
  // id
  'yang', 'dan', 'di', 'ke', 'dari', 'untuk', 'saya', 'aku', 'ini', 'itu', 'besok', 'apa', 'ada', 'tolong', 'gabung', 'permainan',
]);

/** Letters only one of the two Cyrillic app languages has (Serbian has no я ю ё й ы э ъ щ ь). */
const RU_ONLY = /[яюёйыэъщьЯЮЁЙЫЭЪЩЬ]/;
const SR_ONLY = /[ђјљњћџЂЈЉЊЋЏ]/;
/** Frequent words of one language that the other doesn't use (for short texts without such letters). */
const RU_WORDS = new Set(['в', 'отмени', 'перенеси', 'запиши', 'мне', 'меня', 'мой', 'мою', 'мои', 'моё', 'что', 'это', 'как', 'где', 'когда', 'есть', 'нет', 'завтра', 'сегодня', 'послезавтра', 'сколько', 'кто', 'спасибо', 'пожалуйста']);
const SR_WORDS = new Set(['сутра', 'данас', 'шта', 'хвала', 'откажи', 'молим', 'прекосутра', 'колико', 'ко', 'где', 'када']);

export function agentMessageLanguage(text: string): string | null {
  let clean = text
    .replace(/\[(slot|booking):[^\]]*\]/gi, ' ')
    .replace(/https?:\/\/\S+/g, ' ')
    .replace(/\b[a-z0-9]{20,}\b/gi, ' ');
  // Quoted Latin names in a non-Latin message ("Отмени игру Morning americano") are not its language.
  if (/[^\x00-\u024f\s\d\p{P}\p{S}]/u.test(clean)) clean = clean.replace(/["«„“][^"»“”]*["»“”]|\b[A-Z][\p{L}'’]*/gu, ' ');
  let latin = 0;
  let cyrillic = 0;
  let kana = 0;
  let han = 0;
  let arabic = 0;
  let devanagari = 0;
  let thai = 0;
  let other = 0;
  for (const ch of clean) {
    const cp = ch.codePointAt(0) ?? 0;
    if ((cp >= 0x41 && cp <= 0x5a) || (cp >= 0x61 && cp <= 0x7a) || (cp >= 0xc0 && cp <= 0x24f)) latin += 1;
    else if (cp >= 0x400 && cp <= 0x4ff) cyrillic += 1;
    else if (cp >= 0x3040 && cp <= 0x30ff) kana += 1;
    else if ((cp >= 0x4e00 && cp <= 0x9fff) || (cp >= 0x3400 && cp <= 0x4dbf)) han += 1;
    else if ((cp >= 0x600 && cp <= 0x6ff) || (cp >= 0x750 && cp <= 0x77f)) arabic += 1;
    else if (cp >= 0x900 && cp <= 0x97f) devanagari += 1;
    else if (cp >= 0xe00 && cp <= 0xe7f) thai += 1;
    else if (/\p{L}/u.test(ch)) other += 1;
  }
  const total = latin + cyrillic + kana + han + arabic + devanagari + thai + other;
  if (total < 4) return null;
  const share = (n: number) => n / total;
  if (kana > 0 && share(kana + han) >= 0.3) return 'ja';
  if (han > 0 && kana === 0 && share(han) >= 0.3) return 'zh';
  if (share(arabic) >= 0.3) return 'ar';
  if (share(devanagari) >= 0.3) return 'hi';
  if (share(thai) >= 0.3) return 'th';
  if (share(cyrillic) >= 0.5) {
    const words = clean.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
    const ru = RU_ONLY.test(clean) || words.some((w) => RU_WORDS.has(w) && !SR_WORDS.has(w));
    const sr = SR_ONLY.test(clean) || words.some((w) => SR_WORDS.has(w) && !RU_WORDS.has(w));
    if (ru !== sr) return ru ? 'ru' : 'sr';
    return null;
  }
  if (share(latin) >= 0.9 && !/[^\x00-\x7f’]/.test(clean.replace(/[^\p{L}’']/gu, ''))) {
    const words = clean.toLowerCase().replace(/’/g, "'").split(/[^a-z']+/).filter(Boolean);
    if (words.length < 3) return null;
    const en = words.filter((w) => EN_WORDS.has(w)).length;
    const otherHits = words.filter((w) => OTHER_LATIN_WORDS.has(w)).length;
    if (en >= 2 && otherHits === 0) return 'en';
  }
  return null;
}

export function agentMessageLanguageName(text: string): string | null {
  const code = agentMessageLanguage(text);
  return code ? LANGUAGE_NAMES[code] ?? null : null;
}
