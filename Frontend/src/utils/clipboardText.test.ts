import { describe, expect, it } from 'vitest';
import { getClipboardTextForPaste } from './clipboardText';

function mockDataTransfer(entries: Record<string, string>): DataTransfer {
  return {
    getData(type: string) {
      return entries[type] ?? '';
    },
  } as DataTransfer;
}

describe('getClipboardTextForPaste', () => {
  it('returns plain text when available', () => {
    const data = mockDataTransfer({ 'text/plain': 'https://bandeja.me/games/1' });
    expect(getClipboardTextForPaste(data)).toBe('https://bandeja.me/games/1');
  });

  it('falls back to text/uri-list when plain text is missing', () => {
    const data = mockDataTransfer({
      'text/uri-list': '# Title\nhttps://bandeja.me/games/1\n',
    });
    expect(getClipboardTextForPaste(data)).toBe('https://bandeja.me/games/1');
  });

  it('falls back to anchor href in html', () => {
    const data = mockDataTransfer({
      'text/html': '<a href="https://bandeja.me/games/1">Game</a>',
    });
    expect(getClipboardTextForPaste(data)).toBe('https://bandeja.me/games/1');
  });

  it('deduplicates repeated urls in plain text', () => {
    const data = mockDataTransfer({
      'text/plain': 'https://bandeja.me/games/1\nhttps://bandeja.me/games/1',
    });
    expect(getClipboardTextForPaste(data)).toBe('https://bandeja.me/games/1');
  });
});
