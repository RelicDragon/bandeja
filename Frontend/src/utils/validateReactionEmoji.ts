const REACTION_EMOJI_MAX_UTF8_BYTES = 64;

function utf8ByteLength(s: string): number {
  return new TextEncoder().encode(s).length;
}

function countGraphemes(nfc: string): number {
  const I = Intl as unknown as {
    Segmenter?: new (loc?: string, opts?: { granularity?: string }) => { segment: (s: string) => Iterable<{ segment: string }> };
  };
  if (typeof I.Segmenter !== 'function') return [...nfc].length;
  const seg = new I.Segmenter('en', { granularity: 'grapheme' });
  let n = 0;
  for (const _ of seg.segment(nfc)) n += 1;
  return n;
}

export function normalizeReactionEmoji(raw: string): string {
  return raw.normalize('NFC').trim();
}

export function isValidReactionEmoji(raw: unknown): raw is string {
  if (typeof raw !== 'string') return false;
  const nfc = raw.trim().normalize('NFC');
  if (!nfc) return false;
  if (countGraphemes(nfc) !== 1) return false;
  if (utf8ByteLength(nfc) > REACTION_EMOJI_MAX_UTF8_BYTES) return false;
  return true;
}
