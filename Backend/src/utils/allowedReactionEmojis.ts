export const ALLOWED_REACTION_EMOJIS = ['❤️', '👍', '😂', '😮', '😢', '😡', '🎉', '🔥'] as const;

export function isAllowedReactionEmoji(emoji: string): boolean {
  return (ALLOWED_REACTION_EMOJIS as readonly string[]).includes(emoji);
}
