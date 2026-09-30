/**
 * Incremental `text/event-stream` parser (WHATWG "server-sent events" framing).
 *
 * Feed it the carry-over `rest` from the previous call plus the newly decoded chunk.
 * It returns every complete frame and the unterminated tail to carry into the next call.
 * Handles CRLF / CR / LF line endings (including a CRLF split across chunks), comment
 * lines (`: keepalive`), multi-line `data:` fields, and the optional single space after `:`.
 */

export interface SseFrame {
  /** `id:` field of this frame, or `null` when the frame carried none. */
  id: string | null;
  /** `event:` field, or `null` (the spec default is `message`). */
  event: string | null;
  /** All `data:` lines joined with `\n`. */
  data: string;
}

export interface SseParseResult {
  frames: SseFrame[];
  rest: string;
}

function parseFrame(block: string): SseFrame | null {
  let id: string | null = null;
  let event: string | null = null;
  const dataLines: string[] = [];
  let hasField = false;

  for (const line of block.split('\n')) {
    if (line === '' || line.startsWith(':')) continue;
    const colon = line.indexOf(':');
    const field = colon === -1 ? line : line.slice(0, colon);
    let value = colon === -1 ? '' : line.slice(colon + 1);
    if (value.startsWith(' ')) value = value.slice(1);

    switch (field) {
      case 'data':
        dataLines.push(value);
        hasField = true;
        break;
      case 'event':
        event = value;
        hasField = true;
        break;
      case 'id':
        // Spec: an id containing NUL is ignored.
        if (!value.includes('\u0000')) {
          id = value;
          hasField = true;
        }
        break;
      default:
        // `retry:` and unknown fields are ignored.
        break;
    }
  }

  if (!hasField) return null;
  return { id, event, data: dataLines.join('\n') };
}

export function parseSseChunk(rest: string, chunk: string): SseParseResult {
  let combined = rest + chunk;
  // A lone trailing CR may be the first half of a CRLF that arrives in the next chunk.
  let heldCr = '';
  if (combined.endsWith('\r')) {
    heldCr = '\r';
    combined = combined.slice(0, -1);
  }
  const normalized = combined.replace(/\r\n?/g, '\n');
  const blocks = normalized.split('\n\n');
  const tail = blocks.pop() ?? '';
  const frames: SseFrame[] = [];
  for (const block of blocks) {
    const frame = parseFrame(block);
    if (frame) frames.push(frame);
  }
  return { frames, rest: tail + heldCr };
}
