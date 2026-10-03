import { describe, expect, it } from 'vitest';
import { hidePartialAgentImage, splitAgentMarkdownBlocks } from './agentMarkdownBlocks';

describe('splitAgentMarkdownBlocks', () => {
  it('splits paragraphs on blank lines and drops extra blank lines', () => {
    expect(splitAgentMarkdownBlocks('First line\nsame para\n\n\nSecond\n\nThird\n\n')).toEqual([
      'First line\nsame para',
      'Second',
      'Third',
    ]);
  });

  it('returns nothing for empty or blank text', () => {
    expect(splitAgentMarkdownBlocks('')).toEqual([]);
    expect(splitAgentMarkdownBlocks('\n\n  \n')).toEqual([]);
  });

  it('never splits inside a fenced code block (backticks and tildes)', () => {
    const code = '```js\nconst a = 1;\n\n\nconst b = 2;\n```';
    expect(splitAgentMarkdownBlocks(`Intro\n\n${code}\n\nAfter`)).toEqual(['Intro', code, 'After']);
    const tilde = '~~~\na\n\nb\n~~~';
    expect(splitAgentMarkdownBlocks(`${tilde}\n\nNext`)).toEqual([tilde, 'Next']);
  });

  it('keeps an unclosed fence (still streaming) as one growing block', () => {
    expect(splitAgentMarkdownBlocks('Intro\n\n```\nline 1\n\nline 2')).toEqual(['Intro', '```\nline 1\n\nline 2']);
  });

  it('a shorter or different fence does not close the block', () => {
    const code = '````\n```\n\ninner\n````';
    expect(splitAgentMarkdownBlocks(`${code}\n\nx`)).toEqual([code, 'x']);
  });

  it('keeps loose lists together, ordered and unordered', () => {
    expect(splitAgentMarkdownBlocks('1. one\n\n2. two\n\n3. three\n\nDone')).toEqual([
      '1. one\n\n2. two\n\n3. three',
      'Done',
    ]);
    expect(splitAgentMarkdownBlocks('Games:\n- a\n\n- b\n\nBye')).toEqual(['Games:\n- a\n\n- b', 'Bye']);
  });

  it('keeps indented continuations with their list item', () => {
    expect(splitAgentMarkdownBlocks('- item\n\n  more about it\n\nNext')).toEqual(['- item\n\n  more about it', 'Next']);
  });

  it('a list after a paragraph block starts a new block', () => {
    expect(splitAgentMarkdownBlocks('Hello\n\n- a\n- b')).toEqual(['Hello', '- a\n- b']);
  });

  it('keeps tables whole', () => {
    const table = '| a | b |\n|---|---|\n| 1 | 2 |';
    expect(splitAgentMarkdownBlocks(`Top\n\n${table}\n\nEnd`)).toEqual(['Top', table, 'End']);
  });

  it('earlier blocks stay identical as the text grows (only the last one changes)', () => {
    const full = 'Para one.\n\nPara two is longer.\n\n- a\n- b';
    let previous: string[] = [];
    for (let n = 1; n <= full.length; n++) {
      const blocks = splitAgentMarkdownBlocks(full.slice(0, n));
      for (let i = 0; i < previous.length - 1; i++) expect(blocks[i]).toBe(previous[i]);
      previous = blocks;
    }
    expect(previous).toEqual(['Para one.', 'Para two is longer.', '- a\n- b']);
  });
});

describe('hidePartialAgentImage', () => {
  it('hides a half-written picture at the end only', () => {
    expect(hidePartialAgentImage('Look ![cap](img:ab')).toBe('Look ');
    expect(hidePartialAgentImage('Look ![ca')).toBe('Look ');
    expect(hidePartialAgentImage('![a](img:1) done')).toBe('![a](img:1) done');
  });
});
