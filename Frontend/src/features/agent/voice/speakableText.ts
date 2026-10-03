import { stripAgentRefTokens } from '../agentBookingCards';
import { agentMarkdownToPlainText } from '../agentMessageShare';

/**
 * Reply markdown → what the speech model should say. Cards, pictures and links are on the
 * screen, so they are not read out: image markdown and bare URLs are dropped, a link keeps
 * only its label, list markers and table pipes go, emoji go (TTS reads their names).
 */
export function toSpeakableText(markdown: string): string {
  const withoutRefs = stripAgentRefTokens(markdown)
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  return agentMarkdownToPlainText(withoutRefs)
    .replace(/https?:\/\/\S+/gi, ' ')
    .split('\n')
    .map(speakableLine)
    .filter(Boolean)
    .join(' ')
    .replace(/[\p{Extended_Pictographic}\u{FE0F}\u{200D}]/gu, '')
    .replace(/[*_#>`~]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** One plain-text line: list markers go, a table row becomes "cell, cell". */
function speakableLine(line: string): string {
  const text = line.replace(/^\s*-\s+/, '').replace(/^\s*\d+[.)]\s+/, '').trim();
  if (!text.includes('|')) return text;
  return text
    .split('|')
    .map((cell) => cell.trim())
    .filter(Boolean)
    .join(', ');
}
