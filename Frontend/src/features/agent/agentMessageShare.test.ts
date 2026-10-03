import { describe, expect, it } from 'vitest';
import { agentMarkdownToPlainText } from './agentMessageShare';

describe('agentMarkdownToPlainText', () => {
  it('drops markdown syntax but keeps the words', () => {
    const md = '## Your games\n\n* **Friday** at *Club One*\n* `19:00` ~~maybe~~\n\n> note';
    expect(agentMarkdownToPlainText(md)).toBe('Your games\n\n- Friday at Club One\n- 19:00 maybe\n\nnote');
  });

  it('keeps link labels; external URLs follow, in-app paths are dropped', () => {
    expect(agentMarkdownToPlainText('See [the game](/games/abc) or [site](https://x.io/a).')).toBe(
      'See the game or site (https://x.io/a).',
    );
  });

  it('flattens tables and code fences', () => {
    expect(agentMarkdownToPlainText('| a | b |\n|---|---|\n| 1 | 2 |\n\n```\ncode\n```')).toBe(
      '| a | b |\n| 1 | 2 |\n\ncode',
    );
  });
});
