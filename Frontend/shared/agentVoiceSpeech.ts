/**
 * AI agent voice: reply markdown → speakable sentence chunks (docs/domains/agent.md § Voice).
 * Pure (no DOM). Shared by the app's v1 voice session (`@shared/agentVoiceSpeech`, re-exported
 * from `src/features/agent/voice/speechChunker.ts` / `speakableText.ts`) and the v2 server-side
 * speech pipeline (`@bandeja/shared/agentVoiceSpeech`).
 */

/** `[slot:<slotRef>]` / `[booking:<bookingRef>]` hidden ref tokens (same as `agentBookingCards.ts`). */
const REF_TOKEN_RE = /\[(slot|booking):([^\]\s]{1,512})\]/g;

function stripRefTokens(text: string): string {
  if (!text.includes('[')) return text;
  return text
    .replace(REF_TOKEN_RE, '')
    // A server-truncated preview can cut a token in half.
    .replace(/\[(?:slot|booking):[^\]\s]*$/, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '')
    .trim();
}

/** Markdown → plain text (same rules as the app's `agentMarkdownToPlainText`). */
function markdownToPlainText(markdown: string): string {
  return markdown
    .replace(/```[^\n]*\n([\s\S]*?)```/g, '$1')
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/\[([^\]]+)\]\(([^)\s]+)[^)]*\)/g, (_m, label: string, url: string) =>
      /^https?:\/\//i.test(url) && url !== label ? `${label} (${url})` : label,
    )
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/^>\s?/gm, '')
    .replace(/^(\s*)[*+]\s+/gm, '$1- ')
    .replace(/(\*\*|__)(.+?)\1/g, '$2')
    .replace(/(^|[^*\w])\*(?!\s)([^*\n]+?)\*(?!\w)/g, '$1$2')
    .replace(/~~(.+?)~~/g, '$1')
    .replace(/`([^`\n]+)`/g, '$1')
    .replace(/^[ \t]*\|?[ \t]*:?-{3,}:?[ \t]*(\|[ \t]*:?-{3,}:?[ \t]*)*\|?[ \t]*(\n|$)/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Reply markdown → what the speech model should say. Cards, pictures and links are on the
 * screen, so they are not read out: image markdown and bare URLs are dropped, a link keeps
 * only its label, list markers and table pipes go, emoji go (TTS reads their names).
 */
export function toSpeakableText(markdown: string): string {
  const withoutRefs = stripRefTokens(markdown)
    .replace(/```[\s\S]*?(```|$)/g, ' ')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1');
  return markdownToPlainText(withoutRefs)
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

export interface SpeechChunkerOptions {
  /** The first chunk may be short: it decides how soon the reply starts playing. */
  firstMinChars: number;
  /** Later chunks are merged up to this size (fewer, more natural TTS calls). */
  minChars: number;
  /** A run without a sentence end is cut at a comma / space before this. */
  maxChars: number;
}

/**
 * One spoken chunk and the slice of the pushed markdown it came from: `raw` is
 * `pushed.slice(rawStart, rawEnd)` (the server maps what was heard back onto the stored reply).
 */
export interface SpeechPiece {
  text: string;
  raw: string;
  rawStart: number;
  rawEnd: number;
}

const DEFAULTS: SpeechChunkerOptions = { firstMinChars: 12, minChars: 60, maxChars: 280 };

/** End of a sentence in Latin / Cyrillic / … text: the mark plus following whitespace. */
const SPACED_END = /[.!?…;:]["'»”)\]]*\s/g;
/** CJK full-width marks end a sentence without a following space. */
const CJK_END = /[。！？]/g;

/**
 * Cuts streamed reply markdown into speakable chunks as soon as a sentence is complete, so the
 * first sentence is spoken while the model still writes the rest. Chunks are already converted
 * by `toSpeakableText`; empty ones (a picture, a link-only line) are skipped.
 */
export class SpeechChunker {
  private buffer = '';
  /** Characters of pushed text already cut off the buffer. */
  private consumed = 0;
  private emitted = 0;
  private readonly opts: SpeechChunkerOptions;

  constructor(options: Partial<SpeechChunkerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  push(delta: string): string[] {
    return this.pushPieces(delta).map((piece) => piece.text);
  }

  flush(): string[] {
    return this.flushPieces().map((piece) => piece.text);
  }

  pushPieces(delta: string): SpeechPiece[] {
    this.buffer += delta;
    const out: SpeechPiece[] = [];
    for (;;) {
      const cut = this.nextCut();
      if (cut == null) break;
      const piece = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      this.emit(piece, out);
    }
    return out;
  }

  flushPieces(): SpeechPiece[] {
    const out: SpeechPiece[] = [];
    const rest = this.buffer;
    this.buffer = '';
    this.emit(rest, out);
    return out;
  }

  reset(): void {
    this.buffer = '';
    this.consumed = 0;
    this.emitted = 0;
  }

  private emit(piece: string, out: SpeechPiece[]): void {
    const rawStart = this.consumed;
    this.consumed += piece.length;
    const text = toSpeakableText(piece);
    if (!text) return;
    out.push({ text, raw: piece, rawStart, rawEnd: this.consumed });
    this.emitted += 1;
  }

  /** Index to cut the buffer at, or null to wait for more text. */
  private nextCut(): number | null {
    const min = this.emitted === 0 ? this.opts.firstMinChars : this.opts.minChars;
    const boundaries = this.boundaries();
    for (const end of boundaries) {
      if (this.buffer.slice(0, end).trim().length >= min) return end;
    }
    if (this.buffer.length > this.opts.maxChars) {
      const window = this.buffer.slice(0, this.opts.maxChars);
      const comma = window.lastIndexOf(', ');
      if (comma >= min) return comma + 2;
      const space = window.lastIndexOf(' ');
      return space >= min ? space + 1 : this.opts.maxChars;
    }
    return null;
  }

  private boundaries(): number[] {
    const ends: number[] = [];
    for (const re of [SPACED_END, CJK_END]) {
      re.lastIndex = 0;
      for (let m = re.exec(this.buffer); m; m = re.exec(this.buffer)) ends.push(m.index + m[0].length);
    }
    for (let i = this.buffer.indexOf('\n'); i !== -1; i = this.buffer.indexOf('\n', i + 1)) ends.push(i + 1);
    return ends.sort((a, b) => a - b);
  }
}
