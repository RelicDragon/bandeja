export interface ParsedMention {
  type: 'mention' | 'text';
  content: string;
  userId?: string;
  display?: string;
}

export function parseMentions(text: string): ParsedMention[] {
  const mentionRegex = /@\[([^\]]+)\]\(([^)]+)\)/g;
  const parts: ParsedMention[] = [];
  let lastIndex = 0;
  let match;

  while ((match = mentionRegex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      parts.push({
        type: 'text',
        content: text.substring(lastIndex, match.index),
      });
    }

    parts.push({
      type: 'mention',
      content: match[0],
      display: match[1],
      userId: match[2],
    });

    lastIndex = mentionRegex.lastIndex;
  }

  if (lastIndex < text.length) {
    parts.push({
      type: 'text',
      content: text.substring(lastIndex),
    });
  }

  return parts.length > 0 ? parts : [{ type: 'text', content: text }];
}

export function convertMentionsToPlaintext(text: string): string {
  return text.replace(/@\[([^\]]+)\]\([^)]+\)/g, '@$1');
}
