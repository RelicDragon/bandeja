/**
 * Agent answers (model-written markdown) → Telegram HTML, safely.
 *
 * Builds on `shared/telegramMarkdown.ts` (escape everything, then bold / italic / strike /
 * code / fenced code / headings / bullets / http(s) links) and adds what untrusted model
 * text needs on top:
 *   - only `http(s)` links survive as anchors (`tg://` and friends become their label);
 *   - the result is checked to be well-formed Telegram HTML (allowed tags only, properly
 *     nested); anything else — e.g. overlapping `**a _b** c_` — falls back to escaped
 *     plain text, so a send never fails with "can't parse entities";
 *   - long answers are split into ≤ 4096-character messages at paragraph / line / word
 *     boundaries, each converted on its own.
 * Pure (no prisma / env imports): unit-tested in `__tests__/agentTelegramHtml.test.ts`.
 */
import { markdownToTelegramHtml, telegramHtmlTextLength } from '../shared/telegramMarkdown';

export const TELEGRAM_MESSAGE_MAX = 4096;
/** Source chunk size: leaves room for the few characters conversion can add. */
export const AGENT_ANSWER_CHUNK_SOURCE_MAX = 3800;

const ALLOWED_TAGS = new Set(['b', 'i', 's', 'u', 'code', 'pre', 'a', 'tg-spoiler', 'blockquote']);
const TAG_PATTERN = /<(\/?)([a-zA-Z][\w-]*)((?:\s[^<>]*)?)>/g;
const ANCHOR_PATTERN = /<a href="([^"]*)">([\s\S]*?)<\/a>/g;

export function escapeTelegramHtml(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/** Allowed tags only, every close matches the innermost open, nothing left open. */
export function isWellFormedTelegramHtml(html: string): boolean {
  const stack: string[] = [];
  // Any `<` must start a tag we recognise; stray `<` means the converter let raw input through.
  const stripped = html.replace(TAG_PATTERN, '');
  if (stripped.includes('<') || stripped.includes('>')) return false;
  for (const match of html.matchAll(TAG_PATTERN)) {
    const [, closing, rawName, attrs] = match;
    const name = rawName.toLowerCase();
    if (!ALLOWED_TAGS.has(name)) return false;
    if (closing) {
      if (attrs.trim() || stack.pop() !== name) return false;
      continue;
    }
    if (name === 'a' && !/^ href="https?:\/\/[^"\s]+"$/.test(attrs)) return false;
    if (name === 'code' && attrs && !/^ class="language-[\w+#.-]+"$/.test(attrs)) return false;
    if (name !== 'a' && name !== 'code' && attrs.trim()) return false;
    stack.push(name);
  }
  return stack.length === 0;
}

/**
 * One chunk of model markdown → Telegram HTML. Never returns malformed HTML: on any doubt
 * the whole chunk is sent as escaped plain text.
 */
export function agentMarkdownToTelegramHtml(markdown: string): string {
  // Inline pictures (`![caption](img:<id>)`) are app-only: Telegram keeps the caption.
  const source = (markdown ?? '').replace(/\u0000/g, '').replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1');
  const html = markdownToTelegramHtml(source).replace(ANCHOR_PATTERN, (whole, href: string, label: string) =>
    /^https?:\/\//i.test(href) ? whole : label,
  );
  if (isWellFormedTelegramHtml(html) && telegramHtmlTextLength(html) <= TELEGRAM_MESSAGE_MAX) return html;
  return escapeTelegramHtml(source);
}

/**
 * Splits markdown into pieces of at most `max` characters, preferring a blank line, then a
 * line break, then a space; hard-cuts only a single overlong word. Fenced code blocks are
 * not re-balanced across pieces — a piece with an odd fence just renders its backticks.
 */
export function splitAgentMarkdown(markdown: string, max = AGENT_ANSWER_CHUNK_SOURCE_MAX): string[] {
  const text = markdown.trim();
  if (!text) return [];
  const pieces: string[] = [];
  let rest = text;
  while (rest.length > max) {
    const window = rest.slice(0, max + 1);
    let cut = window.lastIndexOf('\n\n');
    if (cut < max / 3) cut = window.lastIndexOf('\n');
    if (cut < max / 3) cut = window.lastIndexOf(' ');
    if (cut <= 0) cut = max;
    pieces.push(rest.slice(0, cut).trimEnd());
    rest = rest.slice(cut).trimStart();
  }
  if (rest) pieces.push(rest);
  return pieces;
}

/** Full answer → ready-to-send HTML messages (each ≤ 4096 visible characters). */
export function agentAnswerToTelegramMessages(markdown: string): string[] {
  return splitAgentMarkdown(markdown).map(agentMarkdownToTelegramHtml);
}

/** Visible-length-safe tail for a live (streaming) preview: keeps the newest text. */
export function tailForPreview(markdown: string, max: number): string {
  if (markdown.length <= max) return markdown;
  const slice = markdown.slice(markdown.length - max);
  const newline = slice.indexOf('\n');
  return `…${newline >= 0 && newline < 200 ? slice.slice(newline) : slice}`;
}
