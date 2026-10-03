import { describe, expect, it } from 'vitest';
import { appendDictation } from './appendDictation';
import { SpeechChunker } from './speechChunker';
import { toSpeakableText } from './speakableText';

describe('toSpeakableText', () => {
  it('drops markdown, pictures, links targets, URLs, ref tokens and emoji', () => {
    expect(toSpeakableText('**Saturday** at _18:00_ 🎾')).toBe('Saturday at 18:00');
    expect(toSpeakableText('See [Club X](/clubs/1) or https://example.com/page')).toBe('See Club X or');
    expect(toSpeakableText('![racket](img:abc123)\nNice grip.')).toBe('Nice grip.');
    expect(toSpeakableText('Book this one [slot:abc.def]')).toBe('Book this one');
    expect(toSpeakableText('- first\n- second')).toBe('first second');
    expect(toSpeakableText('| Day | Time |\n|---|---|\n| Sat | 18:00 |')).toBe('Day, Time Sat, 18:00');
    expect(toSpeakableText('```json\n{"a":1}\n```')).toBe('');
    expect(toSpeakableText('# Games')).toBe('Games');
  });
});

describe('SpeechChunker', () => {
  const feed = (chunker: SpeechChunker, text: string, step = 3) => {
    const out: string[] = [];
    for (let i = 0; i < text.length; i += step) out.push(...chunker.push(text.slice(i, i + step)));
    return out;
  };

  it('emits the first sentence as soon as it ends, then merges short ones', () => {
    const chunker = new SpeechChunker();
    const out = feed(chunker, 'Two games tomorrow. One at seven. One at nine. Both are at Club X, near you. ');
    expect(out[0]).toBe('Two games tomorrow.');
    expect([...out, ...chunker.flush()].join(' ')).toBe('Two games tomorrow. One at seven. One at nine. Both are at Club X, near you.');
  });

  it('waits for whitespace after the mark: decimals and times are not sentence ends', () => {
    const chunker = new SpeechChunker({ firstMinChars: 1 });
    expect(chunker.push('Level 3.5 at 19.30')).toEqual([]);
    expect(chunker.flush()).toEqual(['Level 3.5 at 19.30']);
  });

  it('cuts at line breaks and on CJK marks without spaces', () => {
    const chunker = new SpeechChunker({ firstMinChars: 1, minChars: 1 });
    expect(chunker.push('明日は二試合です。七時と九時')).toEqual(['明日は二試合です。']);
    expect(chunker.push('です\nNext')).toEqual(['七時と九時です']);
    expect(chunker.flush()).toEqual(['Next']);
  });

  it('cuts an endless sentence at a comma before the cap', () => {
    const chunker = new SpeechChunker({ firstMinChars: 5, maxChars: 40 });
    const out = chunker.push('one two three four five, six seven eight nine ten eleven twelve');
    expect(out).toEqual(['one two three four five,']);
  });

  it('skips chunks with nothing to say', () => {
    const chunker = new SpeechChunker({ firstMinChars: 1 });
    expect(chunker.push('![pic](img:1)\n')).toEqual([]);
    expect(chunker.push('Here it is. ')).toEqual(['Here it is.']);
  });
});

describe('appendDictation', () => {
  it('joins with one space and respects the cap', () => {
    expect(appendDictation('', 'hello')).toBe('hello');
    expect(appendDictation('Find a game ', 'tomorrow')).toBe('Find a game tomorrow');
    expect(appendDictation('x'.repeat(3999), 'abc')).toHaveLength(4000);
  });
});
