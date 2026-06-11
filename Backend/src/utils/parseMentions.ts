const MENTION_MARKUP_REGEX = /@\[([^\]]+)\]\([^)]+\)/g;

export function convertMentionsToPlaintext(text: string): string {
  return text.replace(MENTION_MARKUP_REGEX, '@$1');
}
