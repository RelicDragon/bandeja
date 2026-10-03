const FENCE_OPEN = /^ {0,3}(`{3,}|~{3,})/;
const LIST_ITEM = /^ {0,3}(?:[-*+]|\d{1,9}[.)])(?:\s|$)/;
const INDENTED = /^(?: {2,}|\t)/;

function closesFence(line: string, fence: string): boolean {
  const m = /^ {0,3}(`{3,}|~{3,})\s*$/.exec(line);
  return m != null && m[1][0] === fence[0] && m[1].length >= fence.length;
}

/**
 * Splits markdown into top-level blocks on blank lines, so a streamed reply re-parses only its
 * last (growing) block. Never splits inside a fenced code block, and keeps a list together when
 * a blank line separates its items or an indented continuation follows. Tables and quotes have
 * no blank lines inside, so they stay whole too. Joining the blocks with a blank line renders
 * the same as the original text.
 */
export function splitAgentMarkdownBlocks(text: string): string[] {
  const blocks: string[] = [];
  let current: string[] = [];
  let blockHasList = false;
  let blanks = 0;
  let fence: string | null = null;

  const flush = () => {
    if (current.length > 0) blocks.push(current.join('\n'));
    current = [];
    blockHasList = false;
  };

  for (const line of text.split('\n')) {
    if (fence) {
      current.push(line);
      if (closesFence(line, fence)) fence = null;
      continue;
    }
    if (line.trim() === '') {
      if (current.length > 0) blanks++;
      continue;
    }
    if (blanks > 0) {
      const continues = INDENTED.test(line) || (blockHasList && LIST_ITEM.test(line));
      if (continues) {
        for (let i = 0; i < blanks; i++) current.push('');
      } else {
        flush();
      }
      blanks = 0;
    }
    current.push(line);
    if (LIST_ITEM.test(line)) blockHasList = true;
    const open = FENCE_OPEN.exec(line);
    if (open) fence = open[1];
  }
  flush();
  return blocks;
}

/** While typing, hide a half-written picture (`![cap](img:ab`) instead of flashing its syntax. */
export function hidePartialAgentImage(text: string): string {
  return text.replace(/!\[[^\]\n]*(?:\]\([^)\n]*)?$/, '');
}
