import { describe, expect, it } from 'vitest';
import { parseSseChunk, type SseFrame } from './sseParser';

function feed(chunks: string[]): { frames: SseFrame[]; rest: string } {
  let rest = '';
  const frames: SseFrame[] = [];
  for (const chunk of chunks) {
    const r = parseSseChunk(rest, chunk);
    frames.push(...r.frames);
    rest = r.rest;
  }
  return { frames, rest };
}

describe('parseSseChunk', () => {
  it('parses a complete frame with id, event and data', () => {
    const r = parseSseChunk('', 'id: 5\nevent: text.delta\ndata: {"type":"text.delta","text":"hi"}\n\n');
    expect(r.frames).toEqual([{ id: '5', event: 'text.delta', data: '{"type":"text.delta","text":"hi"}' }]);
    expect(r.rest).toBe('');
  });

  it('keeps an unterminated frame as rest until the blank line arrives', () => {
    const first = parseSseChunk('', 'id: 1\ndata: {"a"');
    expect(first.frames).toEqual([]);
    const second = parseSseChunk(first.rest, ':1}\n\n');
    expect(second.frames).toEqual([{ id: '1', event: null, data: '{"a":1}' }]);
  });

  it('splits frames at arbitrary byte boundaries', () => {
    const stream = 'id: 1\ndata: one\n\nid: 2\ndata: two\n\nid: 3\ndata: three\n\n';
    for (let size = 1; size <= 7; size++) {
      const chunks: string[] = [];
      for (let i = 0; i < stream.length; i += size) chunks.push(stream.slice(i, i + size));
      const { frames, rest } = feed(chunks);
      expect(frames.map((f) => [f.id, f.data])).toEqual([
        ['1', 'one'],
        ['2', 'two'],
        ['3', 'three'],
      ]);
      expect(rest).toBe('');
    }
  });

  it('joins multi-line data with newlines', () => {
    const r = parseSseChunk('', 'data: line one\ndata: line two\ndata:\n\n');
    expect(r.frames[0].data).toBe('line one\nline two\n');
  });

  it('ignores comment-only frames (keep-alive)', () => {
    const r = parseSseChunk('', ': keepalive\n\n: another\n\nid: 9\ndata: x\n\n');
    expect(r.frames).toEqual([{ id: '9', event: null, data: 'x' }]);
  });

  it('ignores comment lines inside a frame and unknown fields', () => {
    const r = parseSseChunk('', 'id: 2\n: note\nretry: 3000\nfoo: bar\ndata: y\n\n');
    expect(r.frames).toEqual([{ id: '2', event: null, data: 'y' }]);
  });

  it('strips exactly one leading space after the colon', () => {
    const r = parseSseChunk('', 'data:no-space\n\ndata:  two-spaces\n\n');
    expect(r.frames.map((f) => f.data)).toEqual(['no-space', ' two-spaces']);
  });

  it('handles CRLF and a CRLF split across chunks', () => {
    const { frames } = feed(['id: 1\r\ndata: a\r', '\n\r\nid: 2\r\ndata: b\r\n\r\n']);
    expect(frames.map((f) => [f.id, f.data])).toEqual([
      ['1', 'a'],
      ['2', 'b'],
    ]);
  });

  it('handles bare CR line endings (a trailing CR waits for the next chunk)', () => {
    const r = parseSseChunk('', 'id: 7\rdata: z\r\rid: 8\rdata: w\r');
    expect(r.frames).toEqual([{ id: '7', event: null, data: 'z' }]);
    const next = parseSseChunk(r.rest, '\rid: 9');
    expect(next.frames).toEqual([{ id: '8', event: null, data: 'w' }]);
  });

  it('keeps data with colons intact', () => {
    const r = parseSseChunk('', 'data: {"time":"19:00"}\n\n');
    expect(r.frames[0].data).toBe('{"time":"19:00"}');
  });
});
