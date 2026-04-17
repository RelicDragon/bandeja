import { ApiError } from './ApiError';
import { REACTION_EMOJI_MAX_UTF8_BYTES, type InvalidReactionEmojiReason } from './reactionEmojiConstants';

function countGraphemes(nfc: string): number {
  const Seg = Intl.Segmenter;
  if (typeof Seg !== 'function') {
    return [...nfc].length;
  }
  const seg = new Seg('en', { granularity: 'grapheme' });
  return [...seg.segment(nfc)].length;
}

export function normalizeReactionEmoji(raw: string): string {
  return raw.normalize('NFC').trim();
}

function logInvalid(reason: InvalidReactionEmojiReason): void {
  try {
    console.warn(JSON.stringify({ evt: 'reaction_emoji_invalid', reason }));
  } catch {
    /* ignore */
  }
}

export function assertValidReactionEmoji(raw: unknown): string {
  if (typeof raw !== 'string') {
    logInvalid('NOT_STRING');
    throw new ApiError(400, 'Invalid reaction emoji', true, { code: 'INVALID_REACTION_EMOJI', reason: 'NOT_STRING' });
  }
  const trimmed = raw.trim();
  if (!trimmed) {
    logInvalid('EMPTY');
    throw new ApiError(400, 'Invalid reaction emoji', true, { code: 'INVALID_REACTION_EMOJI', reason: 'EMPTY' });
  }
  const nfc = trimmed.normalize('NFC');
  const clusters = countGraphemes(nfc);
  if (clusters !== 1) {
    logInvalid('NOT_SINGLE_GRAPHEME');
    throw new ApiError(400, 'Invalid reaction emoji', true, {
      code: 'INVALID_REACTION_EMOJI',
      reason: 'NOT_SINGLE_GRAPHEME',
    });
  }
  const bytes = Buffer.byteLength(nfc, 'utf8');
  if (bytes > REACTION_EMOJI_MAX_UTF8_BYTES) {
    logInvalid('TOO_LONG');
    throw new ApiError(400, 'Invalid reaction emoji', true, { code: 'INVALID_REACTION_EMOJI', reason: 'TOO_LONG' });
  }
  return nfc;
}
