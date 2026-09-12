const cyrillicToLatin: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo',
  ж: 'zh', з: 'z', и: 'i', й: 'y', к: 'k', л: 'l', м: 'm',
  н: 'n', о: 'o', п: 'p', р: 'r', с: 's', т: 't', у: 'u',
  ф: 'f', х: 'h', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'sch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
  А: 'A', Б: 'B', В: 'V', Г: 'G', Д: 'D', Е: 'E', Ё: 'Yo',
  Ж: 'Zh', З: 'Z', И: 'I', Й: 'Y', К: 'K', Л: 'L', М: 'M',
  Н: 'N', О: 'O', П: 'P', Р: 'R', С: 'S', Т: 'T', У: 'U',
  Ф: 'F', Х: 'H', Ц: 'Ts', Ч: 'Ch', Ш: 'Sh', Щ: 'Sch',
  Ъ: '', Ы: 'Y', Ь: '', Э: 'E', Ю: 'Yu', Я: 'Ya',
};

const latinToCyrillic: Record<string, string> = {
  a: 'а', b: 'б', v: 'в', g: 'г', d: 'д', e: 'е', yo: 'ё',
  zh: 'ж', z: 'з', i: 'и', y: 'й', k: 'к', l: 'л', m: 'м',
  n: 'н', o: 'о', p: 'п', r: 'р', s: 'с', t: 'т', u: 'у',
  f: 'ф', h: 'х', ts: 'ц', ch: 'ч', sh: 'ш', sch: 'щ',
  yu: 'ю', ya: 'я',
};

function removeAccents(text: string): string {
  return text.normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function transliterateCyrillicToLatin(text: string): string {
  let result = '';
  let i = 0;
  while (i < text.length) {
    let matched = false;
    for (const [cyrillic, latin] of Object.entries(cyrillicToLatin)) {
      if (text.substring(i, i + cyrillic.length) === cyrillic) {
        result += latin;
        i += cyrillic.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += text[i];
      i++;
    }
  }
  return result;
}

function transliterateLatinToCyrillic(text: string): string {
  let result = '';
  let i = 0;
  const lowerText = text.toLowerCase();
  const sortedKeys = Object.keys(latinToCyrillic).sort((a, b) => b.length - a.length);
  while (i < lowerText.length) {
    let matched = false;
    for (const latin of sortedKeys) {
      if (lowerText.substring(i, i + latin.length) === latin) {
        result += latinToCyrillic[latin];
        i += latin.length;
        matched = true;
        break;
      }
    }
    if (!matched) {
      result += text[i];
      i++;
    }
  }
  return result;
}

export function normalizeToLatin(text: string): string {
  if (!text) return '';
  return transliterateCyrillicToLatin(removeAccents(text.toLowerCase().trim())).replace(/đ/g, 'dj');
}

export function phoneticFold(latin: string): string {
  return latin
    .toLowerCase()
    .replace(/tsh/g, 'zh')
    .replace(/zh/g, 'j')
    .replace(/kh/g, 'h')
    .replace(/ch/g, 'c')
    .replace(/sh/g, 's')
    .replace(/ts/g, 'c')
    .replace(/dj/g, 'd')
    .replace(/y/g, 'i')
    .replace(/[^a-z0-9]/g, '');
}

export function expandNameSearchTerms(term: string): string[] {
  const trimmed = term.trim();
  if (!trimmed) return [];

  const latin = normalizeToLatin(trimmed);
  const seen = new Set<string>();
  const out: string[] = [];
  const add = (variant: string) => {
    const v = variant.trim();
    if (!v) return;
    const key = v.toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    out.push(v);
  };

  add(trimmed);
  add(latin);
  if (latin) add(transliterateLatinToCyrillic(latin));
  add(latin.replace(/tsh/g, 'zh'));
  add(latin.replace(/zh/g, 'j'));
  add(latin.replace(/tsh/g, 'zh').replace(/zh/g, 'j'));
  add(latin.replace(/dj/g, 'd'));
  if (/^d[eiaouy]/.test(latin)) add(`dj${latin.slice(1)}`);
  add(latin.replace(/ch/g, 'c'));
  add(latin.replace(/ts/g, 'c'));
  add(latin.replace(/vich$/g, 'vic'));
  add(latin.replace(/kh/g, 'h'));
  if (latin.endsWith('ts')) {
    const stem = latin.slice(0, -2);
    add(`${stem}z`);
    add(`${stem}zh`);
    add(`${stem}c`);
  }
  let combo = latin
    .replace(/tsh/g, 'zh')
    .replace(/zh/g, 'j')
    .replace(/ch/g, 'c')
    .replace(/vich$/g, 'vic');
  if (/^d[eiaouy]/.test(combo)) combo = `dj${combo.slice(1)}`;
  add(combo);

  return out;
}

export function matchesSearch(query: string, text: string): boolean {
  if (!query || !text) return false;

  const queryLatin = normalizeToLatin(query);
  const textLatin = normalizeToLatin(text);

  if (textLatin.includes(queryLatin)) return true;

  const queryCyrillic = transliterateLatinToCyrillic(queryLatin);
  const textCyrillic = transliterateLatinToCyrillic(textLatin);
  if (
    textLatin.includes(queryCyrillic) ||
    textCyrillic.includes(queryLatin) ||
    textCyrillic.includes(queryCyrillic)
  ) {
    return true;
  }

  const textLower = text.toLowerCase();
  const haystacks = [textLower, textLatin, textCyrillic];
  for (const variant of expandNameSearchTerms(query)) {
    const v = variant.toLowerCase();
    if (v && haystacks.some((h) => h.includes(v))) return true;
  }

  const queryFold = phoneticFold(queryLatin);
  const textFold = phoneticFold(textLatin);
  return queryFold.length > 0 && textFold.includes(queryFold);
}

export function matchesPersonSearch(
  query: string,
  person: { firstName?: string | null; lastName?: string | null; telegramUsername?: string | null },
): boolean {
  const terms = query.trim().split(/\s+/).filter(Boolean).slice(0, 5);
  if (terms.length === 0) return false;
  const name = `${person.firstName || ''} ${person.lastName || ''}`.trim();
  const telegram = person.telegramUsername || '';
  return terms.every(
    (term) => matchesSearch(term, name) || (telegram !== '' && matchesSearch(term, telegram)),
  );
}
