/**
 * LLM-generated texts (game results summaries) come back as regular Markdown
 * (`**bold**`, `- ` bullets, `## headings`, `[label](url)`), which Telegram does
 * not understand in any of its own parse modes. Convert to Telegram HTML — the
 * only mode where the surrounding text does not need character escaping.
 *
 * Telegram HTML: https://core.telegram.org/bots/api#html-style
 */

const PLACEHOLDER_MARKER = '\u0000';
const PLACEHOLDER_PATTERN = /\u0000(\d+)\u0000/g;

// Tag | HTML entity | single UTF-16 code unit. Telegram counts message length in
// code units too, so `[\s\S]` per token matches `String.length` semantics.
const TOKEN_PATTERN = /<[^>]*>|&(?:[a-zA-Z][a-zA-Z0-9]*|#\d+|#x[0-9a-fA-F]+);|[\s\S]/g;

const LINK_PATTERN = /\[([^\][\n]*)\]\(\s*((?:https?|tg):\/\/[^\s)]+)\s*\)/g;
const FENCED_CODE_PATTERN = /```[ \t]*([\w+#.-]*)[ \t]*\n?([\s\S]*?)```/g;
const INLINE_CODE_PATTERN = /`([^`\n]+)`/g;
const HORIZONTAL_RULE_PATTERN = /^\s{0,3}(?:\*\s*\*\s*\*|-\s*-\s*-|_\s*_\s*_)[\s*\-_]*$/;
const HEADING_PATTERN = /^\s{0,3}#{1,6}\s+(.*?)\s*#*\s*$/;
const QUOTE_MARKER_PATTERN = /^(\s*)(?:&gt;\s?)+/;
const BULLET_PATTERN = /^(\s*)[-*+]\s+/;

// Kept local (instead of reusing `../utils`) so this module stays free of prisma/env imports.
function escapeHTML(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function applyInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(?=\S)(.*?\S)\*\*/g, '<b>$1</b>')
    .replace(/__(?=\S)(.*?\S)__/g, '<b>$1</b>')
    .replace(/~~(?=\S)(.*?\S)~~/g, '<s>$1</s>')
    .replace(/\|\|(?=\S)(.*?\S)\|\|/g, '<tg-spoiler>$1</tg-spoiler>')
    .replace(/(^|[^\w*])\*(?=\S)([^*]*\S)\*(?!\w)/g, '$1<i>$2</i>')
    .replace(/(^|[^\w_])_(?=\S)([^_]*\S)_(?!\w)/g, '$1<i>$2</i>');
}

function convertLine(line: string): string {
  if (HORIZONTAL_RULE_PATTERN.test(line)) {
    return '—';
  }

  const heading = line.match(HEADING_PATTERN);
  if (heading) {
    const content = applyInlineMarkdown(heading[1]);
    return content ? `<b>${content}</b>` : '';
  }

  const withoutQuote = line.replace(QUOTE_MARKER_PATTERN, '$1');
  const withBullet = withoutQuote.replace(BULLET_PATTERN, '$1• ');
  return applyInlineMarkdown(withBullet);
}

export function markdownToTelegramHtml(markdown: string): string {
  const stashed: string[] = [];
  const stash = (html: string): string => {
    stashed.push(html);
    return `${PLACEHOLDER_MARKER}${stashed.length - 1}${PLACEHOLDER_MARKER}`;
  };

  let text = (markdown ?? '').replace(/\u0000/g, '').replace(/\r\n?/g, '\n');

  // Code first: its contents must survive untouched by any other rule.
  text = text.replace(FENCED_CODE_PATTERN, (_match, language: string, code: string) => {
    const body = escapeHTML(code.replace(/\n+$/, ''));
    return stash(
      language
        ? `<pre><code class="language-${escapeHTML(language)}">${body}</code></pre>`
        : `<pre>${body}</pre>`
    );
  });
  text = text.replace(INLINE_CODE_PATTERN, (_match, code: string) => stash(`<code>${escapeHTML(code)}</code>`));

  text = escapeHTML(text);

  // Links next, so `*`/`_` inside URLs are never read as emphasis.
  text = text.replace(LINK_PATTERN, (_match, label: string, url: string) => {
    const linkText = applyInlineMarkdown(label) || url;
    return stash(`<a href="${url}">${linkText}</a>`);
  });

  text = text.split('\n').map(convertLine).join('\n');

  while (text.includes(PLACEHOLDER_MARKER)) {
    const restored = text.replace(PLACEHOLDER_PATTERN, (match, index: string) => stashed[Number(index)] ?? match);
    if (restored === text) break;
    text = restored;
  }

  return text;
}

/** Visible length of Telegram HTML — tags cost nothing, entities cost one character. */
export function telegramHtmlTextLength(html: string): number {
  let length = 0;
  for (const token of html.match(TOKEN_PATTERN) ?? []) {
    if (!token.startsWith('<')) length += 1;
  }
  return length;
}

/** Truncate by visible length, never inside a tag or an entity, closing whatever is still open. */
export function trimTelegramHtml(html: string, maxLength: number): string {
  if (telegramHtmlTextLength(html) <= maxLength) return html;

  const ellipsis = '...';
  const budget = Math.max(0, maxLength - ellipsis.length);
  const openTags: string[] = [];
  let result = '';
  let visible = 0;

  for (const token of html.match(TOKEN_PATTERN) ?? []) {
    if (token.startsWith('<')) {
      const name = token.match(/^<\/?\s*([a-zA-Z][\w-]*)/)?.[1]?.toLowerCase();
      if (name) {
        if (token.startsWith('</')) {
          if (openTags[openTags.length - 1] === name) openTags.pop();
        } else if (!token.endsWith('/>')) {
          openTags.push(name);
        }
      }
      result += token;
      continue;
    }

    if (visible >= budget) break;
    result += token;
    visible += 1;
  }

  result = result.trimEnd() + ellipsis;
  while (openTags.length > 0) {
    result += `</${openTags.pop()}>`;
  }

  return result;
}
