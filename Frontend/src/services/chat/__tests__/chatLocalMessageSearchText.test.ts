import { describe, expect, it } from 'vitest';
import { splitTextForThreadSearchHighlight } from '../chatLocalMessageSearchText';

describe('splitTextForThreadSearchHighlight', () => {
  it('returns plain text when query is too short', () => {
    expect(splitTextForThreadSearchHighlight('hello', 'a')).toEqual([{ text: 'hello', highlight: false }]);
  });

  it('highlights exact case-insensitive matches', () => {
    expect(splitTextForThreadSearchHighlight('Hello world', 'world')).toEqual([
      { text: 'Hello ', highlight: false },
      { text: 'world', highlight: true },
    ]);
  });

  it('highlights transliterated matches', () => {
    expect(splitTextForThreadSearchHighlight('Привет всем', 'privet')).toEqual([
      { text: 'Привет', highlight: true },
      { text: ' всем', highlight: false },
    ]);
  });

  it('highlights only the first matching occurrence per pass', () => {
    expect(splitTextForThreadSearchHighlight('test test', 'test')).toEqual([
      { text: 'test', highlight: true },
      { text: ' ', highlight: false },
      { text: 'test', highlight: true },
    ]);
  });
});
