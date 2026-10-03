import { toSpeakableText } from './speakableText';

export interface SpeechChunkerOptions {
  /** The first chunk may be short: it decides how soon the reply starts playing. */
  firstMinChars: number;
  /** Later chunks are merged up to this size (fewer, more natural TTS calls). */
  minChars: number;
  /** A run without a sentence end is cut at a comma / space before this. */
  maxChars: number;
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
  private emitted = 0;
  private readonly opts: SpeechChunkerOptions;

  constructor(options: Partial<SpeechChunkerOptions> = {}) {
    this.opts = { ...DEFAULTS, ...options };
  }

  push(delta: string): string[] {
    this.buffer += delta;
    const out: string[] = [];
    for (;;) {
      const cut = this.nextCut();
      if (cut == null) break;
      const piece = this.buffer.slice(0, cut);
      this.buffer = this.buffer.slice(cut);
      this.emit(piece, out);
    }
    return out;
  }

  flush(): string[] {
    const out: string[] = [];
    const rest = this.buffer;
    this.buffer = '';
    this.emit(rest, out);
    return out;
  }

  reset(): void {
    this.buffer = '';
    this.emitted = 0;
  }

  private emit(piece: string, out: string[]): void {
    const text = toSpeakableText(piece);
    if (!text) return;
    out.push(text);
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
