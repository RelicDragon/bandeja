const cyrillicToLatin: Record<string, string> = {
  'а': 'a', 'б': 'b', 'в': 'v', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'yo',
  'ж': 'zh', 'з': 'z', 'и': 'i', 'й': 'y', 'к': 'k', 'л': 'l', 'м': 'm',
  'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u',
  'ф': 'f', 'х': 'h', 'ц': 'ts', 'ч': 'ch', 'ш': 'sh', 'щ': 'sch',
  'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'yu', 'я': 'ya',
  'А': 'A', 'Б': 'B', 'В': 'V', 'Г': 'G', 'Д': 'D', 'Е': 'E', 'Ё': 'Yo',
  'Ж': 'Zh', 'З': 'Z', 'И': 'I', 'Й': 'Y', 'К': 'K', 'Л': 'L', 'М': 'M',
  'Н': 'N', 'О': 'O', 'П': 'P', 'Р': 'R', 'С': 'S', 'Т': 'T', 'У': 'U',
  'Ф': 'F', 'Х': 'H', 'Ц': 'Ts', 'Ч': 'Ch', 'Ш': 'Sh', 'Щ': 'Sch',
  'Ъ': '', 'Ы': 'Y', 'Ь': '', 'Э': 'E', 'Ю': 'Yu', 'Я': 'Ya'
};

const latinToCyrillic: Record<string, string> = {
  'a': 'а', 'b': 'б', 'v': 'в', 'g': 'г', 'd': 'д', 'e': 'е', 'yo': 'ё',
  'zh': 'ж', 'z': 'з', 'i': 'и', 'y': 'й', 'k': 'к', 'l': 'л', 'm': 'м',
  'n': 'н', 'o': 'о', 'p': 'п', 'r': 'р', 's': 'с', 't': 'т', 'u': 'у',
  'f': 'ф', 'h': 'х', 'ts': 'ц', 'ch': 'ч', 'sh': 'ш', 'sch': 'щ',
  'yu': 'ю', 'ya': 'я'
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
        const cyrillic = latinToCyrillic[latin];
        result += cyrillic;
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

function normalizeToLatin(text: string): string {
  if (!text) return '';
  const normalized = text.toLowerCase().trim();
  const withoutAccents = removeAccents(normalized);
  return transliterateCyrillicToLatin(withoutAccents);
}

export function matchesSearch(query: string, text: string): boolean {
  if (!query || !text) return false;
  
  const queryLatin = normalizeToLatin(query);
  const textLatin = normalizeToLatin(text);
  
  if (textLatin.includes(queryLatin)) {
    return true;
  }
  
  const queryCyrillic = transliterateLatinToCyrillic(queryLatin);
  const textCyrillic = transliterateLatinToCyrillic(textLatin);
  
  return (
    textLatin.includes(queryCyrillic) ||
    textCyrillic.includes(queryLatin) ||
    textCyrillic.includes(queryCyrillic)
  );
}

