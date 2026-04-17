export const REACTION_EMOJI_MAX_UTF8_BYTES = 64;

export type InvalidReactionEmojiReason = 'NOT_STRING' | 'EMPTY' | 'NOT_SINGLE_GRAPHEME' | 'TOO_LONG';
